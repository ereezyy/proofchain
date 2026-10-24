"""Fail closed on OSV findings or scanner errors; check the gate with a vulnerable fixture."""

import argparse
import json
from pathlib import Path
import subprocess
import tempfile


def scan(scanner, lockfile, report):
    result = subprocess.run([
        str(scanner), "scan", "source", "--lockfile", str(lockfile),
        "--format", "json", "--all-packages", "--output-file", str(report),
    ], check=False).returncode
    if result not in (0, 1):
        raise RuntimeError(f"OSV-Scanner failed (exit {result}); scan is not clean")
    data = json.loads(report.read_text(encoding="utf-8"))
    packages = [package for group in data.get("results", []) for package in group.get("packages", [])]
    if not packages:
        raise RuntimeError("OSV-Scanner returned no dependency inventory")
    findings = [item for package in packages for item in package.get("vulnerabilities", [])]
    if bool(findings) != (result == 1):
        raise RuntimeError("OSV exit status and report disagree")
    return result


def verify_gate(scanner):
    # Never install this fixture. lodash 4.17.20 has known published advisories.
    with tempfile.TemporaryDirectory() as temporary:
        directory = Path(temporary)
        lock = directory / "package-lock.json"
        lock.write_text(json.dumps({
            "name": "vulnerable-gate-fixture", "version": "1.0.0", "lockfileVersion": 3,
            "packages": {"": {"name": "vulnerable-gate-fixture", "version": "1.0.0",
                                  "dependencies": {"lodash": "4.17.20"}},
                         "node_modules/lodash": {"version": "4.17.20",
                           "resolved": "https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz"}},
        }), encoding="utf-8")
        report = directory / "report.json"
        result = scan(scanner, lock, report)
        data = json.loads(report.read_text(encoding="utf-8"))
        findings = [v for group in data.get("results", [])
                    for package in group.get("packages", [])
                    for v in package.get("vulnerabilities", [])]
        if result != 1 or not findings:
            raise RuntimeError("Known-vulnerable dependency was not rejected; gate is unverified")
        print("Known-vulnerable fixture rejected (never installed)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scanner", type=Path, required=True)
    parser.add_argument("--lockfile", type=Path, default=Path("server/package-lock.json"))
    parser.add_argument("--report", type=Path, default=Path("osv-results.json"))
    args = parser.parse_args()
    scanner = args.scanner.resolve()
    verify_gate(scanner)
    raise SystemExit(scan(scanner, args.lockfile.resolve(), args.report.resolve()))
