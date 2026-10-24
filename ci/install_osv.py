"""Install a checksum-pinned upstream OSV-Scanner binary (no package scripts)."""

import argparse
import hashlib
import os
from pathlib import Path
import platform
import tempfile
from urllib.request import urlopen

VERSION = "2.7.0"
# Digests verified against the official GitHub release asset metadata.
ASSETS = {
    "Linux": ("osv-scanner_linux_amd64", "160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b"),
    "Windows": ("osv-scanner_windows_amd64.exe", "9964ed64ec9a387391eb4cc006ad5c531154821aef29b793e02c448de4686438"),
}


def install(destination):
    if platform.machine().lower() not in {"amd64", "x86_64"}:
        raise ValueError("Only pinned x86-64 assets are supported")
    name, expected = ASSETS[platform.system()]
    destination = Path(destination).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        asset = Path(temporary) / name
        digest = hashlib.sha256()
        with urlopen(f"https://github.com/google/osv-scanner/releases/download/v{VERSION}/{name}", timeout=120) as source:
            with asset.open("wb") as output:
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
                    output.write(chunk)
        if digest.hexdigest() != expected:
            raise ValueError("OSV-Scanner checksum mismatch")
        destination.write_bytes(asset.read_bytes())
    if os.name != "nt":
        destination.chmod(0o755)
    print(f"Installed verified OSV-Scanner {VERSION}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    install(parser.parse_args().destination)
