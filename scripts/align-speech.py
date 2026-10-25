"""Align measured narration phrases locally with the pinned MLX Qwen aligner."""
import json
import sys
from pathlib import Path

import numpy as np
from mlx_audio.stt import load
from mlx_audio.stt.utils import load_audio

request = json.loads(Path(sys.argv[1]).read_text())
manifest_path = Path(request["modelDir"]) / "fair-model.json"
manifest = json.loads(manifest_path.read_text()) if manifest_path.is_file() else {}
model = load(request["modelDir"], strict=True)
audio = load_audio(request["audioFile"])
phrases = request.get("phrases") or [{"text": request["text"], "startSeconds": 0, "endSeconds": len(audio) / 16000}]
words = []
for phrase in phrases:
    start, end = phrase["startSeconds"], phrase["endSeconds"]
    clip = np.asarray(audio[round(start * 16000):round(end * 16000)])
    if not len(clip):
        raise ValueError("Empty phrase audio for forced alignment")
    result = model.generate(audio=clip, text=phrase["text"].replace("’", "'"), language="English")
    words.extend({"text": item.text, "startSeconds": start + item.start_time,
                  "endSeconds": start + item.end_time} for item in result)

# The aligner can squeeze a fast function word to a zero-length span. Give such
# words a minimal duration by borrowing from a roomy neighbour; if neither
# neighbour has room the word is left degenerate and the validator rejects it.
MIN_WORD = 0.03
clip_end = len(audio) / 16000
for i, word in enumerate(words):
    if word["endSeconds"] - word["startSeconds"] >= MIN_WORD:
        continue
    lo = words[i - 1]["endSeconds"] if i else 0.0
    hi = words[i + 1]["startSeconds"] if i + 1 < len(words) else clip_end
    if hi - lo < MIN_WORD:
        prev_room = words[i - 1]["endSeconds"] - words[i - 1]["startSeconds"] if i else 0.0
        next_room = words[i + 1]["endSeconds"] - words[i + 1]["startSeconds"] if i + 1 < len(words) else 0.0
        if prev_room >= next_room and prev_room > MIN_WORD * 3:
            words[i - 1]["endSeconds"] -= MIN_WORD
        elif next_room > MIN_WORD * 3:
            words[i + 1]["startSeconds"] += MIN_WORD
        else:
            continue
        lo = words[i - 1]["endSeconds"] if i else 0.0
        hi = words[i + 1]["startSeconds"] if i + 1 < len(words) else clip_end
    word["startSeconds"] = min(max(word["startSeconds"], lo), hi - MIN_WORD)
    word["endSeconds"] = min(word["startSeconds"] + MIN_WORD, hi)

Path(request["outputFile"]).write_text(json.dumps({"words": words,
    "model": manifest.get("model", request["modelDir"]),
    "revision": manifest.get("revision")}))
