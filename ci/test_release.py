"""Check canonicalization and the actual release archive's scope."""

import json
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from build_release import ROOT, build, canonical_sbom


class ReleaseChecks(unittest.TestCase):
    def test_npm_random_fields_do_not_change_dependency_evidence(self):
        first = {"bomFormat": "CycloneDX", "components": [{"name": "example", "version": "1.0.0"}],
                 "serialNumber": "urn:uuid:first", "metadata": {"timestamp": "first"}}
        second = json.loads(json.dumps(first))
        second["serialNumber"] = "urn:uuid:second"
        second["metadata"]["timestamp"] = "second"
        self.assertEqual(canonical_sbom(first, "fixed"), canonical_sbom(second, "fixed"))
        second["components"][0]["version"] = "2.0.0"
        self.assertNotEqual(canonical_sbom(first, "fixed"), canonical_sbom(second, "fixed"))

    def test_two_builds_match_and_exclude_runtime_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            a, b = Path(temporary) / "a", Path(temporary) / "b"
            build(a)
            build(b)
            self.assertEqual((a / "SHA256SUMS").read_bytes(), (b / "SHA256SUMS").read_bytes())
            self.assertEqual((a / "proofchain-source.zip").read_bytes(), (b / "proofchain-source.zip").read_bytes())
            with zipfile.ZipFile(a / "proofchain-source.zip") as archive:
                names = archive.namelist()
                self.assertIn("server/server.js", names)
                self.assertIn("server/package-lock.json", names)
                self.assertNotIn("server/registry.json", names)
                self.assertFalse(any("api-keys.json" in name or "node_modules" in name for name in names))
            sbom = json.loads((a / "sbom.cdx.json").read_text(encoding="utf-8"))
            self.assertGreater(len(sbom["components"]), 4)
            provenance = json.loads((a / "provenance.json").read_text(encoding="utf-8"))
            for subject in provenance["subject"]:
                self.assertEqual(subject["digest"]["sha256"],
                                 hashlib.sha256((a / subject["name"]).read_bytes()).hexdigest())
            for line in (a / "SHA256SUMS").read_text().splitlines():
                digest, name = line.split("  ")
                self.assertEqual(digest, hashlib.sha256((a / name).read_bytes()).hexdigest())

    def test_dirty_manifests_are_rejected_without_modifying_checkout(self):
        actual = Path.read_bytes

        def dirty(path):
            data = actual(path)
            return data + b" " if path == ROOT / "server/package.json" else data

        with tempfile.TemporaryDirectory() as temporary, patch.object(Path, "read_bytes", dirty):
            with self.assertRaisesRegex(ValueError, "Uncommitted build input"):
                build(Path(temporary))


if __name__ == "__main__":
    unittest.main()
