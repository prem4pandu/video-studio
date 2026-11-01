#!/usr/bin/env python3
"""Offline, unprompted ASR evidence for Studio V2 narration; not a listening review."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import unicodedata
from datetime import datetime, timezone


def words(text):
    # Preserve numbers literally: "2" versus "two" remains an ASR disagreement.
    normalized = unicodedata.normalize('NFKC', text).casefold().replace('’', "'")
    return re.findall(r"[^\W_]+(?:'[^\W_]+)*", normalized, flags=re.UNICODE)


def word_error(reference, hypothesis):
    """Levenshtein alignment, with deterministic substitution/deletion/insertion ties."""
    rows = [[0] * (len(hypothesis) + 1) for _ in range(len(reference) + 1)]
    for i in range(len(reference) + 1):
        rows[i][0] = i
    for j in range(len(hypothesis) + 1):
        rows[0][j] = j
    for i, expected in enumerate(reference, 1):
        for j, actual in enumerate(hypothesis, 1):
            rows[i][j] = min(rows[i - 1][j - 1] + (expected != actual), rows[i - 1][j] + 1, rows[i][j - 1] + 1)
    i, j = len(reference), len(hypothesis)
    edits = []
    counts = dict(substitutions=0, deletions=0, insertions=0)
    while i or j:
        if i and j and reference[i - 1] == hypothesis[j - 1] and rows[i][j] == rows[i - 1][j - 1]:
            i -= 1
            j -= 1
        elif i and j and rows[i][j] == rows[i - 1][j - 1] + 1:
            counts['substitutions'] += 1
            edits.append({'type': 'substitution', 'expected': reference[i - 1], 'recognized': hypothesis[j - 1]})
            i -= 1
            j -= 1
        elif i and rows[i][j] == rows[i - 1][j] + 1:
            counts['deletions'] += 1
            edits.append({'type': 'deletion', 'expected': reference[i - 1]})
            i -= 1
        else:
            counts['insertions'] += 1
            edits.append({'type': 'insertion', 'recognized': hypothesis[j - 1]})
            j -= 1
    distance = sum(counts.values())
    return {**counts, 'editDistance': distance, 'referenceWords': len(reference), 'recognizedWords': len(hypothesis),
            'wordErrorRate': distance / len(reference) if reference else None, 'edits': list(reversed(edits))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project', type=Path)
    parser.add_argument('--model', default='mlx-community/whisper-base.en-mlx', help='Cached Hugging Face model ID or local model directory.')
    args = parser.parse_args()
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    from huggingface_hub import snapshot_download
    import mlx_whisper

    model = str(Path(args.model).resolve()) if Path(args.model).is_dir() else snapshot_download(args.model, local_files_only=True)
    project = args.project.resolve(strict=True)
    plan_path, narration_path = project / 'plan.json', project / 'narration.json'
    plan = json.loads(plan_path.read_text())
    narration = json.loads(narration_path.read_text())
    tracks = {track['sceneId']: track for track in narration}
    scene_ids = [scene['id'] for scene in plan['scenes']]
    if len(tracks) != len(narration) or set(tracks) != set(scene_ids) or len(set(scene_ids)) != len(scene_ids):
        raise ValueError('Narration tracks must match the plan scene IDs exactly, without duplicates.')
    report = {
        'model': args.model, 'localModelPath': model, 'offline': True, 'scriptPromptProvided': False,
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'versions': {name: importlib.metadata.version(name) for name in ['mlx-whisper', 'mlx']},
        'planSha256': hashlib.sha256(plan_path.read_bytes()).hexdigest(),
        'narrationManifestSha256': hashlib.sha256(narration_path.read_bytes()).hexdigest(),
        'humanListeningReview': False,
        'normalization': 'Unicode NFKC, casefold, punctuation removed; internal apostrophes retained. Numeric spellings are not equated.',
        'note': 'Independent ASR is fallible. Word errors can be recognizer errors, especially for accents and number spellings. This does not assess naturalness, pronunciation quality, emotional delivery, or the final video mix; human listening is still required.',
        'results': [],
    }
    for scene in plan['scenes']:
        track = tracks[scene['id']]
        path = (project / track['file']).resolve(strict=True)
        if not path.is_relative_to(project) or not path.is_file():
            raise ValueError(f"Invalid narration path for {scene['id']}")
        sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
        if track.get('sha256') and track['sha256'] != sha256:
            raise ValueError(f"Narration hash mismatch for {scene['id']}")
        # Deliberately no initial_prompt, prefix, previous transcript, or reference script.
        output = mlx_whisper.transcribe(str(path), path_or_hf_repo=model, language='en', temperature=0,
                                       condition_on_previous_text=False, verbose=None)
        transcript = output['text'].strip()
        metric = word_error(words(scene['narration']), words(transcript))
        entry = {'sceneId': scene['id'], 'file': track['file'], 'audioSha256': sha256,
                 'script': scene['narration'], 'transcript': transcript, **metric,
                 'suggestListeningReview': metric['wordErrorRate'] is None or metric['wordErrorRate'] > 0.2}
        report['results'].append(entry)
        print(json.dumps(entry), flush=True)
    total_words = sum(entry['referenceWords'] for entry in report['results'])
    total_edits = sum(entry['editDistance'] for entry in report['results'])
    report['summary'] = {'scenes': len(report['results']), 'referenceWords': total_words, 'editDistance': total_edits,
                         'wordErrorRate': total_edits / total_words if total_words else None,
                         'flaggedScenes': [entry['sceneId'] for entry in report['results'] if entry['suggestListeningReview']],
                         'reviewFlagThreshold': 0.2, 'thresholdIsHeuristic': True}
    destination = project / 'independent-speech-review.json'
    destination.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'report': str(destination), **report['summary']}), flush=True)


if __name__ == '__main__':
    main()
