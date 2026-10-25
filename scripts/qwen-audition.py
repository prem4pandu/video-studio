#!/usr/bin/env python3
"""A local voice audition, deliberately separate from the application pipeline.

Run with .fair-neural/qwen-venv/bin/python scripts/qwen-audition.py.
Requires mlx-audio==0.5.9 and soundfile==0.13.1 on Apple Silicon.
Downloads the pinned Apache-2.0 model (~3.08 GB) on its first run.
This creates an original synthetic voice; it does not clone a person.
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
FAIR_NEURAL_HOME = ROOT / '.fair-neural'
MODEL = 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit'
REVISION = 'f90d617701d9f7f4ca499291e0b57f2b3c2fd2ee'
TEXT = ('Look at these two rods. Each rod holds ten cubes. So two tens are worth twenty. '
        'Now add three loose cubes. Twenty and three make twenty three! '
        'The two tells us how many tens we have. It does not mean just two cubes.')
INSTRUCTION = ('A warm adult female Indian English teacher with a natural educated Indian English accent. '
               'Speak conversationally to a curious child, with a friendly smile in the voice, gentle curiosity '
               'and clear, connected phrasing. Use a relaxed medium pace and natural small pauses. '
               'Emphasize two tens and twenty to make their connection clear. '
               'Sound like a caring person explaining an exciting discovery, not an announcer, '
               'not a sing-song chant, and not exaggerated or robotic. Read only the supplied text.')


def fair_sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--output', type=Path, default=FAIR_NEURAL_HOME / 'qwen-audition')
    parser.add_argument('--download-only', action='store_true')
    args = parser.parse_args()
    os.environ['HF_HOME'] = str(FAIR_NEURAL_HOME / 'qwen-hf-cache')
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    os.environ['TOKENIZERS_PARALLELISM'] = 'false'
    args.output.mkdir(parents=True, exist_ok=True)
    model_dir = FAIR_NEURAL_HOME / 'qwen-voice-design-8bit'
    print(f'Downloading/verifying pinned model {MODEL}@{REVISION}', flush=True)
    with urllib.request.urlopen(f'https://huggingface.co/api/models/{MODEL}/tree/{REVISION}?recursive=true', timeout=60) as response:
        remote_files = json.load(response)
    for item in remote_files:
        if item['type'] != 'file':
            continue
        relative = Path(item['path'])
        if relative.is_absolute() or '..' in relative.parts:
            raise RuntimeError('Unsafe model path in manifest.')
        destination = model_dir / relative
        expected_sha = item.get('lfs', {}).get('oid')
        if destination.is_file() and destination.stat().st_size == item['size'] and (not expected_sha or fair_sha256(destination) == expected_sha):
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_name(destination.name + '.download')
        print(f"Downloading {relative}: {item['size']} bytes", flush=True)
        with urllib.request.urlopen(f'https://huggingface.co/{MODEL}/resolve/{REVISION}/{relative}', timeout=600) as response, temporary.open('wb') as output:
            while chunk := response.read(8 * 1024 * 1024):
                output.write(chunk)
        if temporary.stat().st_size != item['size'] or (expected_sha and fair_sha256(temporary) != expected_sha):
            temporary.unlink(missing_ok=True)
            raise RuntimeError(f'Model checksum/size mismatch: {relative}')
        temporary.replace(destination)
    files = [{ 'path': str(p.relative_to(model_dir)), 'bytes': p.stat().st_size,
               'sha256': fair_sha256(p)}
             for p in sorted(model_dir.rglob('*'))
             if p.is_file() and '.cache' not in p.relative_to(model_dir).parts]
    provenance = {'model': MODEL, 'revision': REVISION, 'modelLicense': 'Apache-2.0',
                  'upstream': 'https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign',
                  'conversion': f'https://huggingface.co/{MODEL}/tree/{REVISION}',
                  'runtimeSource': 'https://github.com/Blaizzy/mlx-audio', 'runtimeLicense': 'MIT',
                  'files': files, 'modelBytes': sum(f['bytes'] for f in files)}
    (args.output / 'fair-model-provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print(f"Model files verified: {provenance['modelBytes']} bytes", flush=True)
    if args.download_only:
        return
    provenance['runtime'] = {name: importlib.metadata.version(name)
                             for name in ('mlx-audio', 'mlx', 'mlx-metal', 'soundfile', 'transformers')}
    (args.output / 'fair-model-provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from mlx_audio.tts.utils import load_model
    mx.random.seed(args.seed)
    started = time.monotonic()
    model = load_model(str(model_dir))
    print('Generating one continuous paragraph with VoiceDesign...', flush=True)
    results = list(model.generate_voice_design(text=TEXT, instruct=INSTRUCTION, language='English',
                                              temperature=0.7, max_tokens=1024, verbose=False))
    if not results:
        raise RuntimeError('No speech was generated.')
    sample_rate = results[0].sample_rate
    if any(result.sample_rate != sample_rate for result in results):
        raise RuntimeError('Inconsistent audio sample rates.')
    audio = np.concatenate([np.asarray(result.audio).reshape(-1) for result in results])
    if not np.isfinite(audio).all() or audio.size == 0:
        raise RuntimeError('Invalid generated samples.')
    rms = float(np.sqrt(np.mean(audio.astype(np.float64) ** 2)))
    if rms < 0.001:
        raise RuntimeError('Generated speech is silent or too quiet.')
    output = args.output / 'fair-warm-indian-english-qwen.wav'
    sf.write(output, audio, sample_rate, subtype='PCM_16')
    report = {'file': str(output), 'text': TEXT, 'instructions': INSTRUCTION, 'seed': args.seed,
              'model': MODEL, 'revision': REVISION, 'sampleRate': sample_rate,
              'durationSeconds': len(audio) / sample_rate, 'generationSeconds': time.monotonic() - started,
              'rms': rms, 'peak': float(np.max(np.abs(audio))), 'sha256': fair_sha256(output),
              'modelBytes': provenance['modelBytes'], 'peakMemoryBytes': mx.get_peak_memory(),
              'limitations': ['Accent and naturalness require human listening.',
                              'Transcript has not been independently recognized or verified.',
                              'A fixed seed does not guarantee a stable speaker across different scripts.',
                              'This audition is not integrated into the lesson pipeline.']}
    (args.output / 'fair-audition.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
