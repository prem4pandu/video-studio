"""Pinned OpenMontage tool bridge. No cloud providers or source modifications.

Compatibility: use the installed HyperFrames CLI rather than upstream's unpinned
npx/network lookup, and initialize its editor metadata before the digest guard.
The actual check/render implementation remains OpenMontage's registered tool.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
import types
from dataclasses import asdict
from pathlib import Path


def emit(kind, **data):
    print(json.dumps({"type": kind, **data}, default=str), flush=True)


def parse_json(text):
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("CLI returned no JSON report")
    return json.loads(text[start:end + 1])


def run(command, cwd=None, timeout=30):
    return subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=timeout, check=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["preflight", "render"])
    for arg in ["checkout", "cli", "node", "commit", "hyperframes-version"]:
        parser.add_argument("--" + arg, required=True)
    parser.add_argument("--workspace")
    parser.add_argument("--output")
    args = parser.parse_args()
    checkout, cli = Path(args.checkout).resolve(), Path(args.cli).resolve()
    revision = run(["git", "-C", str(checkout), "rev-parse", "HEAD"])
    if revision.returncode or revision.stdout.strip() != args.commit:
        raise ValueError("OpenMontage checkout is not the pinned commit; run setup:studio-v2")
    dirty = run(["git", "-C", str(checkout), "diff", "--exit-code", "HEAD", "--"])
    if dirty.returncode:
        raise ValueError("OpenMontage tracked source has modifications; use a clean pinned checkout")
    package = json.loads((cli.parent.parent / "package.json").read_text())
    if package["version"] != args.hyperframes_version:
        raise ValueError(f"Expected HyperFrames {args.hyperframes_version}, got {package['version']}")
    provenance = {
        "engine": "openmontage", "commit": args.commit, "license": "AGPL-3.0",
        "hyperframesVersion": package["version"], "pythonVersion": sys.version.split()[0],
        "compatibility": ["installed-pinned-cli-instead-of-npx", "doctor-required-render-checks", "editor-ids-before-source-digest"],
        "toolSourceSha256": hashlib.sha256((checkout / "tools/video/hyperframes_compose.py").read_bytes()).hexdigest(),
    }
    doctor = run([args.node, str(cli), "doctor", "--json"], cwd=str(cli.parent.parent), timeout=35)
    report = parse_json(doctor.stdout)
    required = ["Node.js", "FFmpeg", "FFprobe", "Chrome", "Disk"]
    checks = [item for item in report.get("checks", []) if item.get("name") in required]
    missing = [name for name in required if not any(c.get("name") == name and c.get("ok") for c in checks)]
    if doctor.returncode or missing:
        emit("result", result={"success": False, "error": "Missing renderer requirements: " + ", ".join(missing), "checks": checks, "provenance": provenance})
        return 1
    # Optional voice, cloud, Docker, and latest-version checks are not prerequisites
    # for this local render-only adapter; narration is produced by Video Studio.
    sys.path.insert(0, str(checkout))
    from tools.tool_registry import registry
    registry.discover("tools.video.hyperframes_compose")
    tool = registry.get("hyperframes_compose")
    if tool is None:
        raise RuntimeError("OpenMontage did not register hyperframes_compose")
    if args.operation == "preflight":
        emit("result", result={"success": True, "checks": checks, "provenance": provenance})
        return 0
    workspace = Path(args.workspace or "").resolve()
    if not (workspace / "index.html").is_file() or not args.output:
        raise ValueError("A workspace with index.html and output path are required")

    def local_runtime(self):
        return {"runtime_available": True, "reasons": [], "node_major": int(run([args.node, "--version"]).stdout.strip()[1:].split(".")[0]), "ffmpeg_available": True, "npx_available": False, "npm_package": "hyperframes", "npm_package_version": package["version"], "checks": checks, "compatibility": "local pinned CLI; required doctor checks passed"}

    def local_cli(self, argv, *, cwd, timeout, check):
        operation = argv[0]
        emit("progress", progress=78 if operation == "check" else 86, message="Checking composition layout, assets and contrast." if operation == "check" else "Rendering the animation and narration with OpenMontage.")
        proc = run([args.node, str(cli), *argv], cwd=str(cwd) if cwd else None, timeout=timeout)
        return proc

    tool._runtime_check = types.MethodType(local_runtime, tool)
    tool._run_hf = types.MethodType(local_cli, tool)
    emit("progress", progress=76, message="Initializing editable animation metadata.")
    ids = run([args.node, str(cli), "timeline", "ids", "--dir", str(workspace), "--json"], cwd=str(workspace), timeout=30)
    if ids.returncode:
        emit("result", result={"success": False, "error": "Could not initialize HyperFrames editor IDs: " + (ids.stderr or ids.stdout)[-1500:], "provenance": provenance})
        return 1
    start = time.monotonic()
    result = tool.execute({"operation": "render_existing", "workspace_path": str(workspace), "output_path": str(Path(args.output).resolve()), "fps": 30, "quality": "standard", "snapshots": True})
    data = asdict(result)
    data.update({"provenance": provenance, "elapsedSeconds": round(time.monotonic() - start, 3), "checks": checks})
    emit("result", result=data)
    return 0 if result.success else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        emit("result", result={"success": False, "error": f"{type(error).__name__}: {error}"})
        sys.exit(1)
