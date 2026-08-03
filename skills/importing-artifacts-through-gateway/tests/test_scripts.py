from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ASSEMBLER = ROOT / "scripts" / "assemble_chunks.py"
VERIFIER = ROOT / "scripts" / "verify_artifact.py"


class ScriptTests(unittest.TestCase):
    def make_zip(self, path: Path) -> bytes:
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("README.txt", "Hello gateway skill!\n")
        return path.read_bytes()

    def write_chunk(self, path: Path, data: bytes, offset: int, total: int, full_sha: str) -> None:
        payload = {
            "chunk": {
                "offset": offset,
                "length": len(data),
                "totalSize": total,
                "chunkSha256": hashlib.sha256(data).hexdigest(),
                "fullSha256": full_sha,
                "dataBase64Parts": [base64.b64encode(data).decode("ascii")],
            }
        }
        path.write_text(json.dumps(payload), encoding="utf-8")

    def test_assemble_and_verify_zip(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            source = work / "source.zip"
            data = self.make_zip(source)
            full_sha = hashlib.sha256(data).hexdigest()
            split = max(1, len(data) // 2)
            first, second = data[:split], data[split:]
            chunk1, chunk2 = work / "chunk-1.json", work / "chunk-2.json"
            self.write_chunk(chunk1, first, 0, len(data), full_sha)
            self.write_chunk(chunk2, second, len(first), len(data), full_sha)
            output = work / "assembled.zip"

            subprocess.run(
                [sys.executable, str(ASSEMBLER), str(chunk2), str(chunk1), "-o", str(output)],
                check=True,
                capture_output=True,
                text=True,
            )
            result = subprocess.run(
                [sys.executable, str(VERIFIER), str(output), "--sha256", full_sha, "--size", str(len(data))],
                check=True,
                capture_output=True,
                text=True,
            )
            report = json.loads(result.stdout)
            self.assertEqual(report["status"], "passed")
            self.assertEqual(report["format"], "zip")
            self.assertIn("README.txt", report["entries"])

    def test_rejects_gap(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            data = b"abcdef"
            full_sha = hashlib.sha256(data).hexdigest()
            chunk1, chunk2 = work / "a.json", work / "b.json"
            self.write_chunk(chunk1, b"abc", 0, 6, full_sha)
            self.write_chunk(chunk2, b"def", 4, 6, full_sha)
            output = work / "bad.bin"
            result = subprocess.run(
                [sys.executable, str(ASSEMBLER), str(chunk1), str(chunk2), "-o", str(output)],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())

    def test_rejects_bad_hash(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            payload = {
                "chunk": {
                    "offset": 0,
                    "length": 3,
                    "totalSize": 3,
                    "chunkSha256": "0" * 64,
                    "fullSha256": hashlib.sha256(b"abc").hexdigest(),
                    "dataBase64Parts": [base64.b64encode(b"abc").decode("ascii")],
                }
            }
            chunk = work / "bad.json"
            chunk.write_text(json.dumps(payload), encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(ASSEMBLER), str(chunk), "-o", str(work / "out")],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
