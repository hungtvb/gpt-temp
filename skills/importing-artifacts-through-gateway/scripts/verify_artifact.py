#!/usr/bin/env python3
"""Verify artifact size, SHA-256, and common archive integrity."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import tarfile
import zipfile


def digest(path: Path) -> tuple[int, str]:
    h = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            size += len(block)
            h.update(block)
    return size, h.hexdigest()


def inspect(path: Path) -> dict[str, object]:
    result: dict[str, object] = {"format": "binary", "integrity": "not-applicable"}
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            bad = archive.testzip()
            if bad:
                raise ValueError(f"ZIP CRC failure: {bad}")
            result.update(format="zip", integrity="passed", entries=archive.namelist())
        return result
    if tarfile.is_tarfile(path):
        with tarfile.open(path, "r:*") as archive:
            entries = archive.getnames()
            for member in archive.getmembers():
                if member.isfile():
                    extracted = archive.extractfile(member)
                    if extracted:
                        while extracted.read(1024 * 1024):
                            pass
            result.update(format="tar", integrity="passed", entries=entries)
        return result
    if path.suffix.lower() == ".gz":
        with gzip.open(path, "rb") as stream:
            while stream.read(1024 * 1024):
                pass
        result.update(format="gzip", integrity="passed")
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--size", type=int, required=True)
    args = parser.parse_args()

    if not args.artifact.is_file():
        raise FileNotFoundError(args.artifact)
    actual_size, actual_sha = digest(args.artifact)
    expected_sha = args.sha256.lower()
    if actual_size != args.size:
        raise ValueError(f"size mismatch: expected {args.size}, got {actual_size}")
    if actual_sha != expected_sha:
        raise ValueError(f"SHA-256 mismatch: expected {expected_sha}, got {actual_sha}")

    report = {
        "artifact": str(args.artifact),
        "sizeBytes": actual_size,
        "sha256": actual_sha,
        **inspect(args.artifact),
        "status": "passed",
    }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
