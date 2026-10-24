#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
starts=(0 4 8 12 17 24 30 37 44 51 58 65 73 80 86 93 100 106 111 117 126 130 138 145 150 155)
lines=(
"This robot moves, flashes and makes sounds."
"Does that mean it is living?"
"Let us investigate with evidence."
"Predict: living, non-living, or do we need more evidence?"
"Think. What evidence would convince you?"
"We need more evidence. Movement is only one clue."
"Living things carry out a pattern of life processes."
"They need resources, such as water and nutrients."
"They grow from within and produce new living things of their kind."
"They also respond to changes around them. One clue alone is not enough."
"Compare a plant with the robot."
"The plant takes in water and nutrients, grows from within, and can produce new plants."
"The robot uses electricity. It does not grow or produce robot offspring."
"Its responses are programmed. The evidence classifies it as non-living."
"Movement alone does not prove that something is living."
"A plant may seem still, yet it slowly responds to light and grows."
"A robot may move quickly, but it follows instructions."
"Try one with me. A dry seed does not move. Is it living?"
"Think about what it can do under the right conditions."
"It is living. With water, warmth and air, the seed can use stored food, grow and become a plant."
"Your turn. A bicycle moves when a rider pedals."
"Living or non-living? Decide from evidence."
"It is non-living. It does not carry out life processes; its motion comes from the rider."
"Remember our science routine: observe, test, and explain."
"Do not classify from one flashy clue."
"Use a pattern of evidence about life processes."
)
inputs=(); filters=(); mixes=()
for i in "${!lines[@]}"; do
  HYPERFRAMES_PYTHON="$PWD/.fair-open/kokoro-venv/bin/python" \
  PHONEMIZER_ESPEAK_LIBRARY="/opt/homebrew/opt/espeak-ng/lib/libespeak-ng.dylib" \
  ESPEAK_DATA_PATH="/opt/homebrew/opt/espeak-ng/share/espeak-ng-data" \
    npx hyperframes tts "${lines[$i]}" --voice af_nova --speed 1.02 --output "$TMP/$i.wav" >/dev/null
  [[ -s "$TMP/$i.wav" ]] || { echo "TTS failed for line $i" >&2; exit 1; }
  inputs+=(-i "$TMP/$i.wav")
  delay=$((starts[$i]*1000))
  filters+=("[$i:a]adelay=${delay}|${delay},volume=1.0[v$i]")
  mixes+=("[v$i]")
done
filter=$(IFS=';'; echo "${filters[*]}")
mix=$(printf '%s' "${mixes[@]}")
ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex "$filter;$mix amix=inputs=${#lines[@]}:duration=longest:normalize=0,apad=whole_dur=160,atrim=0:160,alimiter=limit=0.85[out]" -map '[out]' -ar 48000 -ac 2 -c:a aac -b:a 192k "$ROOT/assets/audio/voice.m4a"
ffmpeg -y -loglevel error -f lavfi -i "sine=frequency=220:sample_rate=48000:duration=160" -f lavfi -i "sine=frequency=330:sample_rate=48000:duration=160" -filter_complex "[0:a]volume=0.025[a0];[1:a]volume=0.012,tremolo=f=1.466:d=0.25[a1];[a0][a1]amix=inputs=2,afade=t=in:st=0:d=2,afade=t=out:st=156:d=4" -ar 48000 -ac 2 -c:a aac -b:a 128k "$ROOT/assets/audio/music.m4a"
ffmpeg -y -loglevel error -f lavfi -i "sine=frequency=740:sample_rate=48000:duration=160" -af "volume='if(between(t,24,24.12)+between(t,81,81.12)+between(t,118,118.12)+between(t,138,138.12),0.10,0)',afade=t=out:st=159:d=1" -ar 48000 -ac 2 -c:a aac -b:a 96k "$ROOT/assets/audio/sfx.m4a"
