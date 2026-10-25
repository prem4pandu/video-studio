"""Independent ASR check. No script text is supplied to Whisper as a prompt."""
import importlib.metadata
import json
import os
import sys
import mlx_whisper

project = os.path.abspath(sys.argv[1])
manifest = json.load(open(os.path.join(project, 'narration-manifest.json')))
results = []
for line in manifest:
    result = mlx_whisper.transcribe(
        os.path.join(project, 'assets', line['file']),
        path_or_hf_repo='mlx-community/whisper-base.en-mlx',
        language='en', temperature=0, condition_on_previous_text=False,
        verbose=False)
    entry = {'id': line['id'], 'script': line['text'], 'transcript': result['text'].strip()}
    results.append(entry)
    print(json.dumps(entry), flush=True)
report = {'model': 'mlx-community/whisper-base.en-mlx', 'scriptPromptProvided': False,
          'versions': {name: importlib.metadata.version(name) for name in ['mlx-whisper', 'mlx', 'torch']},
          'results': results, 'humanListeningReview': False,
          'note': 'ASR is fallible and does not assess naturalness, accent or pedagogical delivery.'}
json.dump(report, open(os.path.join(project, 'independent-transcription.json'), 'w'), indent=2)
