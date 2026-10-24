# Wan 2.2 cloud benchmark

This package runs the locked reference and prompt through the official Wan 2.2 TI2V-5B implementation on a CUDA host. It makes no API or paid-service calls. The candidate, log, and provenance record are written under `../candidates/wan-cloud/`.

## Host setup

Use Linux with an NVIDIA GPU containing at least 24 GB VRAM. Follow the official [Wan 2.2 installation instructions](https://github.com/Wan-Video/Wan2.2/blob/main/INSTALL.md), then pin the benchmarked revision and download the public checkpoint:

```bash
git clone https://github.com/Wan-Video/Wan2.2.git
git -C Wan2.2 checkout 1ea34ff
python3 -m pip install -r Wan2.2/requirements.txt
huggingface-cli download Wan-AI/Wan2.2-TI2V-5B --local-dir Wan2.2-TI2V-5B
```

Wan's official 24 GB recipe uses model offload, model dtype conversion, and the T5 encoder on CPU. Allow substantial host RAM and disk space. The checkpoint is public; no token is required.

## Run

From this repository:

```bash
export WAN_REPO=/absolute/path/to/Wan2.2
export WAN_CKPT=/absolute/path/to/Wan2.2-TI2V-5B
bash proofs/cinematic-benchmark/wan-cloud/run.sh --dry-run
bash proofs/cinematic-benchmark/wan-cloud/run.sh
```

The locked run is 1280×704, 121 frames at the model's native 24 fps, UniPC, 50 steps, shift 5.0, guidance 5.0, seed 11. These are the official TI2V-5B defaults made explicit so a future repository change cannot silently alter the comparison. Prompt extension is intentionally disabled to keep the input identical and avoid external services.

The provenance JSON records the Wan commit and dirty state, exact config and prompt, timestamps, hashes of the input and output, and the generation log. Keep all three generated files together when reviewing the candidate.
