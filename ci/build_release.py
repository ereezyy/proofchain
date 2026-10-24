"""Build a deterministic server source ZIP and CycloneDX SBOM from committed inputs."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILES = {"server/server.js", "server/package.json", "server/package-lock.json", "server/ADMIN.md"}
NODE_VERSION = "v24.19.0"
NPM_VERSION = "11.6.2"


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args])


def canonical_sbom(document, timestamp):
    if document.get("bomFormat") != "CycloneDX" or not document.get("components"):
        raise ValueError("Expected a nonempty CycloneDX dependency SBOM")
    # npm inserts a random UUID and wall clock time. Neither describes dependencies.
    document.pop("serialNumber", None)
    document.setdefault("metadata", {})["timestamp"] = timestamp
    return (json.dumps(document, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def package_manager():
    node = shutil.which("node")
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not node or not npm:
        raise RuntimeError("The pinned Node and npm must be on PATH")
    executable = Path(npm).resolve()
    candidates = [executable] if os.name != "nt" else [
        executable.parent / "npm-cli.js",
        executable.parent / "node_modules/npm/bin/npm-cli.js",
    ]
    cli = next((path for path in candidates if path.is_file()), None)
    if cli is None:
        raise RuntimeError("Cannot locate npm's JavaScript entry point")
    command = [node, str(cli)]
    if subprocess.check_output([node, "--version"], text=True).strip() != NODE_VERSION:
        raise ValueError("Build requires Node " + NODE_VERSION)
    if subprocess.check_output(command + ["--version"], text=True).strip() != NPM_VERSION:
        raise ValueError("Build requires npm " + NPM_VERSION)
    return command


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(destination):
    destination = Path(destination).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    commit = git("rev-parse", "HEAD").decode().strip()
    epoch = int(git("show", "-s", "--format=%ct", commit).decode())
    timestamp = datetime.fromtimestamp(epoch, timezone.utc).isoformat().replace("+00:00", "Z")
    # Verify manifests are committed: never combine a HEAD archive with a dirty SBOM.
    for name in ("server/package.json", "server/package-lock.json"):
        if (ROOT / name).read_bytes().replace(b"\r\n", b"\n") != git("show", f"{commit}:{name}").replace(b"\r\n", b"\n"):
            raise ValueError(f"Uncommitted build input: {name}")
    command = package_manager()
    # Use committed manifests in isolation; user npm config and installed modules
    # must not influence dependency evidence or receive any build credentials.
    with tempfile.TemporaryDirectory(prefix="proofchain-sbom-") as temporary:
        # npm uses the manifest directory's basename in root component metadata.
        root = Path(temporary) / "proofchain-api"
        root.mkdir()
        for name in ("package.json", "package-lock.json"):
            (root / name).write_bytes(git("show", f"{commit}:server/{name}"))
        environment = dict(os.environ, NPM_CONFIG_USERCONFIG=os.devnull)
        raw = subprocess.check_output(command + [
            "sbom", "--package-lock-only", "--omit=dev", "--sbom-format=cyclonedx",
        ], cwd=root, env=environment)
    sbom = canonical_sbom(json.loads(raw), timestamp)
    (destination / "sbom.cdx.json").write_bytes(sbom)
    inputs = {}
    for entry in git("ls-tree", "-rz", commit, "server").split(b"\0"):
        if not entry:
            continue
        info, raw_name = entry.split(b"\t", 1)
        name = raw_name.decode("utf-8")
        if name not in SOURCE_FILES and not (name.startswith("server/lib/") and name.endswith(".js")):
            continue
        mode, kind, _ = info.split()
        if mode != b"100644" or kind != b"blob":
            raise ValueError(f"Unsupported source entry: {name}")
        inputs[name] = git("show", f"{commit}:{name}")
    if not SOURCE_FILES <= inputs.keys():
        raise ValueError("Missing required release source")
    inputs["BUILD.json"] = (json.dumps({
        "commit": commit, "artifact": "server-source", "node": NODE_VERSION, "npm": NPM_VERSION,
        "runtime_dependencies_bundled": False,
    }, sort_keys=True, indent=2) + "\n").encode()
    archive = destination / "proofchain-source.zip"
    # Stored ZIP entries avoid compression-library differences; normalize all metadata.
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as output:
        for name, content in sorted(inputs.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            output.writestr(info, content)
    repository = os.environ.get("GITHUB_REPOSITORY", "ereezyy/proofchain")
    provenance = {
        "_type": "https://in-toto.io/Statement/v1",
        "subject": [{"name": name, "digest": {"sha256": sha256(destination / name)}}
                    for name in ["proofchain-source.zip", "sbom.cdx.json"]],
        "predicateType": "https://slsa.dev/provenance/v1",
        "predicate": {
            "buildDefinition": {
                "buildType": "https://github.com/ereezyy/proofchain/build/source-zip/v1",
                "externalParameters": {"source": f"https://github.com/{repository}", "commit": commit},
                "internalParameters": {"node": NODE_VERSION, "npm": NPM_VERSION},
                "resolvedDependencies": [{"uri": f"git+https://github.com/{repository}",
                                          "digest": {"gitCommit": commit}}],
            },
            "runDetails": {
                "builder": {"id": f"https://github.com/{repository}/.github/workflows/ci.yml"},
                "metadata": {"invocationId": os.environ.get("GITHUB_RUN_ID", "local")
                             + "/" + os.environ.get("GITHUB_RUN_ATTEMPT", "1")},
            },
        },
    }
    (destination / "provenance.json").write_bytes(
        (json.dumps(provenance, sort_keys=True, indent=2) + "\n").encode("utf-8"))
    names = ["proofchain-source.zip", "sbom.cdx.json", "provenance.json"]
    checksums = "".join(f"{sha256(destination / name)}  {name}\n" for name in names)
    (destination / "SHA256SUMS").write_text(checksums, encoding="ascii", newline="\n")
    print(checksums, end="")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    build(parser.parse_args().output)
