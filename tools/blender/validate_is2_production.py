#!/usr/bin/env python3
"""Validate the IS-2 production GLB and its baked texture package."""
import json
import os
import re
import struct

root = os.path.abspath(os.getcwd())
glb_path = os.path.join(root, "public", "models", "is2_model1944_production_candidate.glb")
prod_dir = os.path.join(root, "artifacts", "is2-model1944", "production")
manifest_path = os.path.join(prod_dir, "asset_manifest.json")

assert os.path.isfile(glb_path) and os.path.getsize(glb_path) > 100_000, "Production GLB missing or unexpectedly small"
assert os.path.isfile(manifest_path), "Asset manifest missing"

with open(glb_path, "rb") as handle:
    magic, version, total_length = struct.unpack("<4sII", handle.read(12))
    assert magic == b"glTF" and version == 2, "Invalid GLB header"
    chunk_length, chunk_type = struct.unpack("<II", handle.read(8))
    assert chunk_type == 0x4E4F534A, "GLB JSON chunk missing"
    gltf = json.loads(handle.read(chunk_length).decode("utf-8"))

with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

names = [node.get("name", "") for node in gltf.get("nodes", [])]
for required in manifest["required_nodes"]:
    assert required in names, "Missing node: " + required

left = [name for name in names if re.fullmatch(r"TrackLink_L_\d{3}", name)]
right = [name for name in names if re.fullmatch(r"TrackLink_R_\d{3}", name)]
assert len(left) == 86, "Expected 86 independent left track-link nodes, got %d" % len(left)
assert len(right) == 86, "Expected 86 independent right track-link nodes, got %d" % len(right)

for filename in ("basecolor.png", "normal.png", "roughness.png", "metallic.png", "ao.png"):
    path = os.path.join(prod_dir, "pbr", filename)
    assert os.path.isfile(path) and os.path.getsize(path) > 1_000, "Missing baked map: " + filename

assert gltf.get("meshes"), "GLB has no meshes"
assert gltf.get("materials"), "GLB has no materials"
assert gltf.get("textures"), "GLB has no textures"
assert gltf.get("images"), "GLB has no embedded images"

print(json.dumps({
    "status": "PASS",
    "glb_bytes": os.path.getsize(glb_path),
    "nodes": len(names),
    "meshes": len(gltf["meshes"]),
    "materials": len(gltf["materials"]),
    "textures": len(gltf["textures"]),
    "images": len(gltf["images"]),
    "left_track_links": len(left),
    "right_track_links": len(right),
    "baked_maps": ["basecolor", "normal", "roughness", "metallic", "ao"]
}, indent=2))
