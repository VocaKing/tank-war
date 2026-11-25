#!/usr/bin/env python3
"""Hash-checked application of the RenderFix02 source delta."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import tempfile

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("project", type=Path)
    p.add_argument("--check",action="store_true")
    args=p.parse_args()
    root=args.project.resolve()
    if not (root/"SteelFront.uproject").is_file():
        p.error("Select the project folder containing SteelFront.uproject")
    data=Path(__file__).with_name("source-delta.json.gz").read_bytes()
    if digest(data)!="969e59977ca11e51fb8d78ee16a2a30f236f865e321f89519b4e8af2df2516e1":
        raise SystemExit("Patch data hash mismatch")
    raw=gzip.decompress(data)
    if digest(raw)!="3b2221d437288fe5f5009f52b15dff80735afb6ee63468e32974a634730c213d":
        raise SystemExit("Manifest hash mismatch")
    manifest=json.loads(raw)
    pending=[]
    for name, item in manifest.items():
        path=(root/name).resolve()
        if not path.is_relative_to(root):
            raise SystemExit("Unsafe path: "+name)
        if path.exists() and not path.is_file():
            raise SystemExit("Not a regular file: "+name)
        old=path.read_bytes() if path.is_file() else None
        if old is not None and digest(old)==item["after"]:
            continue
        if (digest(old) if old is not None else None)!=item["before"]:
            raise SystemExit("Baseline mismatch: "+name+"; no changes applied. Use the CompileFix01 full project.")
        lines=(old or b"").decode("utf-8").splitlines(keepends=True)
        for offset,count,insert in reversed(item["edits"]):
            lines[offset:offset+count]=insert
        new="".join(lines).encode("utf-8")
        if digest(new)!=item["after"]:
            raise SystemExit("Output hash mismatch: "+name)
        pending.append((name,path,old,new))
    print(f"Verified {len(manifest)} files; {len(pending)} pending.")
    if args.check or not pending:
        return
    backup=Path(tempfile.mkdtemp(prefix="SteelFront-RenderFix02-backup-",dir=root))
    for name,path,old,new in pending:
        if old is not None:
            dest=backup/name
            dest.parent.mkdir(parents=True,exist_ok=True)
            dest.write_bytes(old)
    touched=[]
    try:
        for name,path,old,new in pending:
            path.parent.mkdir(parents=True,exist_ok=True)
            touched.append((path,old))
            path.write_bytes(new)
    except Exception:
        for path,old in reversed(touched):
            if old is None: path.unlink(missing_ok=True)
            else: path.write_bytes(old)
        raise
    print("RenderFix02 applied. Backups:",backup)

if __name__=="__main__":
    main()
