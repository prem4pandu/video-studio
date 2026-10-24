#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/wan-cloud/config.json"
GENERATION="$ROOT/generation.json"
OUT="$ROOT/candidates/wan-cloud"

if [[ ${1:-} == "--dry-run" ]]; then
  DRY_RUN=1
elif [[ $# -ne 0 ]]; then
  echo "usage: $0 [--dry-run]" >&2
  exit 2
else
  DRY_RUN=0
fi

: "${WAN_REPO:?Set WAN_REPO to an official Wan2.2 checkout}"
: "${WAN_CKPT:?Set WAN_CKPT to the Wan2.2-TI2V-5B checkpoint directory}"

python3 - "$CONFIG" "$GENERATION" "$ROOT" "$WAN_REPO" "$WAN_CKPT" <<'PY'
import json, pathlib, subprocess, sys
config = json.load(open(sys.argv[1], encoding="utf-8"))
generation = json.load(open(sys.argv[2], encoding="utf-8"))
root, repo, ckpt = map(pathlib.Path, sys.argv[3:])
assert generation["referenceImage"] == "assets/reference/mira-brass-workshop-v1.png"
assert (root / generation["referenceImage"]).is_file(), "locked reference is missing"
assert (repo / "generate.py").is_file(), "WAN_REPO is not a Wan2.2 checkout"
assert ckpt.is_dir(), "WAN_CKPT is not a directory"
assert config["frames"] % 4 == 1, "Wan frame count must be 4n+1"
commit = subprocess.check_output(["git", "-C", repo, "rev-parse", "HEAD"], text=True).strip()
assert commit.startswith(config["wanRevision"]), f"Wan checkout is {commit}, expected {config['wanRevision']}"
PY

V=()
while IFS= read -r value; do V+=("$value"); done < <(python3 - "$CONFIG" "$GENERATION" <<'PY'
import json, sys
c = json.load(open(sys.argv[1], encoding="utf-8"))
g = json.load(open(sys.argv[2], encoding="utf-8"))
for value in (g["prompt"], c["size"], c["frames"], c["sampleSolver"], c["sampleSteps"], c["sampleShift"], c["guidanceScale"], c["seed"]):
    print(value)
PY
)

REFERENCE="$ROOT/$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["referenceImage"])' "$GENERATION")"
CANDIDATE="$OUT/wan2.2-ti2v-5b-seed-${V[7]}.mp4"
LOG="$OUT/generation.log"
COMMAND=(python3 "$WAN_REPO/generate.py"
  --task ti2v-5B --size "${V[1]}" --frame_num "${V[2]}"
  --ckpt_dir "$WAN_CKPT" --offload_model True --convert_model_dtype --t5_cpu
  --image "$REFERENCE" --prompt "${V[0]}" --base_seed "${V[7]}"
  --sample_solver "${V[3]}" --sample_steps "${V[4]}"
  --sample_shift "${V[5]}" --sample_guide_scale "${V[6]}"
  --save_file "$CANDIDATE")

printf 'Wan revision: %s\n' "$(git -C "$WAN_REPO" rev-parse HEAD)"
printf 'Command:'; printf ' %q' "${COMMAND[@]}"; printf '\n'
if [[ $DRY_RUN == 1 ]]; then exit 0; fi

mkdir -p "$OUT"
STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_SECONDS=$SECONDS
{
  nvidia-smi
  "${COMMAND[@]}"
} 2>&1 | tee "$LOG"
[[ -s "$CANDIDATE" ]] || { echo "Wan completed without a non-empty candidate" >&2; exit 1; }

FINISHED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ELAPSED=$((SECONDS - START_SECONDS))
export ROOT CONFIG GENERATION WAN_REPO WAN_CKPT CANDIDATE LOG STARTED FINISHED ELAPSED
python3 - <<'PY'
import hashlib, json, os, pathlib, platform, subprocess

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

root = pathlib.Path(os.environ["ROOT"])
config = json.load(open(os.environ["CONFIG"], encoding="utf-8"))
generation = json.load(open(os.environ["GENERATION"], encoding="utf-8"))
reference = root / generation["referenceImage"]
candidate = pathlib.Path(os.environ["CANDIDATE"])
repo = os.environ["WAN_REPO"]
record = {
    "startedUtc": os.environ["STARTED"],
    "finishedUtc": os.environ["FINISHED"],
    "elapsedSeconds": int(os.environ["ELAPSED"]),
    "wanCommit": subprocess.check_output(["git", "-C", repo, "rev-parse", "HEAD"], text=True).strip(),
    "wanDirty": bool(subprocess.check_output(["git", "-C", repo, "status", "--porcelain"], text=True).strip()),
    "python": platform.python_version(),
    "config": config,
    "prompt": generation["prompt"],
    "reference": {"path": str(reference), "sha256": sha256(reference)},
    "candidate": {"path": str(candidate), "sha256": sha256(candidate), "bytes": candidate.stat().st_size},
    "log": os.environ["LOG"],
}
with open(candidate.with_suffix(".provenance.json"), "w", encoding="utf-8") as f:
    json.dump(record, f, indent=2)
    f.write("\n")
PY

echo "Candidate: $CANDIDATE"
echo "Provenance: ${CANDIDATE%.mp4}.provenance.json"
