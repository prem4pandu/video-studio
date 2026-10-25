"""Local paragraph-level voice generation; intentionally separate from production defaults."""
import json
import os
import sys
import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model

request = json.load(open(sys.argv[1]))
model = load_model(request['modelDir'])
for line in request['lines']:
    if os.path.isfile(line['output']):
        continue
    mx.random.seed(request['seed'])
    result = list(model.generate_voice_design(
        text=line['text'], instruct=request['instruct'], language='English',
        temperature=.6, max_tokens=2048, verbose=False))
    if not result:
        raise ValueError('Voice generator returned no audio')
    rate = result[0].sample_rate
    if any(part.sample_rate != rate for part in result):
        raise ValueError('Inconsistent sample rate')
    samples = np.concatenate([np.asarray(part.audio).reshape(-1) for part in result])
    if not len(samples) or not np.isfinite(samples).all():
        raise ValueError('Invalid generated audio')
    sf.write(line['output'], samples, rate, subtype='PCM_16')
    print(json.dumps({'id': line['id'], 'seconds': len(samples) / rate}), flush=True)
