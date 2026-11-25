#!/usr/bin/env python3
"""Apply the exact v0.10.2 source delta to v0.10.1 + input/deployment fixes."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import tempfile


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path, help="Extracted v0.10.1 UE project directory")
    parser.add_argument("--check", action="store_true", help="Verify only, do not change files")
    args = parser.parse_args()
    root = args.project.resolve()
    if not (root / "SteelFront.uproject").is_file():
        parser.error("Project directory must contain SteelFront.uproject")
    raw = gzip.decompress(Path(__file__).with_name("changes.json.gz").read_bytes())
    if hashlib.sha256(raw).hexdigest() != "99b260cbcaaebcfc4cd99016339a20205a37c380209c55f038a007f3765d1e06":
        raise SystemExit("Patch manifest integrity check failed.")
    manifest = json.loads(raw)
    pending = []
    for name, info in manifest.items():
        path = (root / name).resolve()
        if not path.is_relative_to(root):
            raise SystemExit("Invalid patch path: " + name)
        existing = path.is_file()
        if path.exists() and not existing:
            raise SystemExit("Not a file: " + name)
        old = path.read_text(encoding="utf-8-sig") if existing else ""
        if existing and digest(old) == info["after"]:
            continue
        if (digest(old) if existing else None) != info["before"]:
            raise SystemExit("Incorrect baseline: " + name + ". No files changed. Use v0.10.1 with material-pin and deployment/input fixes, or the complete v0.10.2 archive.")
        new = old
        for offset, count, insert in reversed(info["edits"]):
            new = new[:offset] + insert + new[offset + count:]
        if digest(new) != info["after"]:
            raise SystemExit("Output hash mismatch: " + name)
        pending.append((name, path, existing, new))
    print(f"Verified {len(manifest)} file hashes; {len(pending)} files require updating.")
    if args.check or not pending:
        return
    backup = Path(tempfile.mkdtemp(prefix="SteelFront-v0101-backup-", dir=root))
    for name, path, existing, _ in pending:
        if existing:
            dest = backup / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dest)
    touched = []
    try:
        for name, path, existing, new in pending:
            path.parent.mkdir(parents=True, exist_ok=True)
            touched.append((name, path, existing))
            path.write_bytes(new.encode("utf-8"))
    except Exception:
        for name, path, existing in reversed(touched):
            if existing:
                shutil.copy2(backup / name, path)
            else:
                path.unlink(missing_ok=True)
        raise
    print("Updated to v0.10.2. Original files backed up in", backup)


if __name__ == "__main__":
    main()
