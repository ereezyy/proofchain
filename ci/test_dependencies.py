import hashlib
import io
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

import check_dependencies
import install_osv


class DependencyGateChecks(unittest.TestCase):
    def run_scan(self, code, packages):
        with tempfile.TemporaryDirectory() as temporary:
            report = Path(temporary) / "report.json"
            report.write_text(json.dumps({"results": [{"packages": packages}]}), encoding="utf-8")
            with patch.object(check_dependencies.subprocess, "run", return_value=SimpleNamespace(returncode=code)):
                return check_dependencies.scan(Path("scanner"), Path("package-lock.json"), report)

    def test_clean_inventory_passes_and_findings_fail(self):
        self.assertEqual(self.run_scan(0, [{"package": {"name": "example"}}]), 0)
        self.assertEqual(self.run_scan(1, [{"package": {"name": "example"},
                                           "vulnerabilities": [{"id": "test-advisory"}]}]), 1)

    def test_api_errors_empty_inventory_and_inconsistent_status_fail_closed(self):
        for code in [127, 128, 129, 130]:
            with self.subTest(code=code), self.assertRaises(RuntimeError):
                self.run_scan(code, [{"package": {"name": "example"}}])
        for code, packages in [(0, []), (1, [{"package": {"name": "example"}}]),
                               (0, [{"vulnerabilities": [{"id": "test-advisory"}]}])]:
            with self.subTest(code=code, packages=packages), self.assertRaises(RuntimeError):
                self.run_scan(code, packages)

    def test_malformed_report_cannot_pass(self):
        with tempfile.TemporaryDirectory() as temporary:
            report = Path(temporary) / "report.json"
            report.write_text("invalid json", encoding="utf-8")
            with patch.object(check_dependencies.subprocess, "run", return_value=SimpleNamespace(returncode=0)):
                with self.assertRaises(json.JSONDecodeError):
                    check_dependencies.scan(Path("scanner"), Path("lock"), report)

    def test_corrupted_download_never_replaces_existing_executable(self):
        payload = b"altered upstream download"
        self.assertNotEqual(hashlib.sha256(payload).hexdigest(), install_osv.ASSETS["Windows"][1])
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / "scanner.exe"
            destination.write_bytes(b"previous executable")
            with patch.object(install_osv.platform, "machine", return_value="AMD64"), \
                    patch.object(install_osv.platform, "system", return_value="Windows"), \
                    patch.object(install_osv, "urlopen", return_value=io.BytesIO(payload)):
                with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                    install_osv.install(destination)
            self.assertEqual(destination.read_bytes(), b"previous executable")


if __name__ == "__main__":
    unittest.main()
