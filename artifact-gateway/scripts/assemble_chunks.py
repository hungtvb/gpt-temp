#!/usr/bin/env python3
"""Assemble artifact-gateway chunk JSON responses into one verified file."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
import sys
from typing import Any


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_chunk(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    chunk = payload.get("chunk", payload)
    required = {
        "offset",
        "length",
        "totalSize",
        "chunkSha256",
        "fullSha256",
        "dataBase64Parts",
    }
    missing = required.difference(chunk)
    if missing:
        raise ValueError(
            f"{path}: missing chunk fields: {sorted(missing)}"
        )

    parts = chunk["dataBase64Parts"]
    if not isinstance(parts, list) or not all(
        isinstance(part, str) for part in parts
    ):
        raise ValueError(f"{path}: dataBase64Parts must be strings")

    try:
        data = base64.b64decode("".join(parts), validate=True)
    except Exception as exc:
        raise ValueError(f"{path}: invalid base64 data") from exc

    length = int(chunk["length"])
    if len(data) != length:
        raise ValueError(
            f"{path}: expected {length} bytes, decoded {len(data)}"
        )

    actual = sha256(data)
    expected = str(chunk["chunkSha256"]).lower()
    if actual != expected:
        raise ValueError(
            f"{path}: chunk SHA-256 mismatch: "
            f"expected {expected}, got {actual}"
        )

    return {
        **chunk,
        "offset": int(chunk["offset"]),
        "length": length,
        "totalSize": int(chunk["totalSize"]),
        "fullSha256": str(chunk["fullSha256"]).lower(),
        "_data": data,
        "_source": str(path),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "chunks",
        nargs="+",
        type=Path,
        help="JSON files returned by the bridge chunk endpoint",
    )
    parser.add_argument("-o", "--output", type=Path, required=True)
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="replace an existing output file",
    )
    args = parser.parse_args()

    if args.output.exists() and not args.overwrite:
        parser.error(
            f"output already exists: {args.output}; use --overwrite"
        )

    chunks = sorted(
        (load_chunk(path) for path in args.chunks),
        key=lambda item: item["offset"],
    )
    if not chunks:
        parser.error("at least one chunk is required")

    total_size = chunks[0]["totalSize"]
    full_sha = chunks[0]["fullSha256"]
    expected_offset = 0
    assembled = bytearray()

    for chunk in chunks:
        if chunk["totalSize"] != total_size:
            raise ValueError(
                f"{chunk['_source']}: inconsistent totalSize"
            )
        if chunk["fullSha256"] != full_sha:
            raise ValueError(
                f"{chunk['_source']}: inconsistent fullSha256"
            )
        if chunk["offset"] != expected_offset:
            raise ValueError(
                f"{chunk['_source']}: expected offset "
                f"{expected_offset}, got {chunk['offset']}"
            )
        assembled.extend(chunk["_data"])
        expected_offset += chunk["length"]

    if len(assembled) != total_size:
        raise ValueError(
            f"incomplete artifact: expected {total_size} bytes, "
            f"assembled {len(assembled)}"
        )

    actual_full_sha = sha256(assembled)
    if actual_full_sha != full_sha:
        raise ValueError(
            f"full SHA-256 mismatch: expected {full_sha}, "
            f"got {actual_full_sha}"
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(assembled)

    print(
        json.dumps(
            {
                "output": str(args.output),
                "sizeBytes": len(assembled),
                "sha256": actual_full_sha,
                "chunks": len(chunks),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
