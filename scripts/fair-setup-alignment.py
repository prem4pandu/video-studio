"""Download and verify the pinned Apache-2.0 MLX word-alignment checkpoint."""
import hashlib
import json
from pathlib import Path

from huggingface_hub import model_info, snapshot_download

repo = "mlx-community/Qwen3-ForcedAligner-0.6B-8bit"
revision = "0e1a68e91d815300c7c9754b2a7639378b23db15"
destination = Path(__file__).resolve().parent.parent / ".fair-neural/qwen-aligner-8bit"
info = model_info(repo, revision=revision, files_metadata=True)
if info.card_data.license != "apache-2.0":
    raise ValueError("Unexpected model license")
snapshot_download(repo, revision=revision, local_dir=destination,
                  allow_patterns=["*.json", "*.safetensors", "*.txt", "README.md"], max_workers=3)
artifacts = []
for remote in info.siblings:
    local = destination / remote.rfilename
    if not local.is_file():
        continue
    with local.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    if remote.size != local.stat().st_size or (remote.lfs and digest != remote.lfs.sha256):
        raise ValueError(f"Downloaded model failed integrity check: {remote.rfilename}")
    artifacts.append({"file": remote.rfilename, "sha256": digest, "bytes": local.stat().st_size})
manifest = {"model": repo, "revision": revision, "license": "Apache-2.0", "artifacts": artifacts}
(destination / "fair-model.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Verified {repo}@{revision}\nFAIR_ALIGNMENT_MODEL_DIR={destination}")
