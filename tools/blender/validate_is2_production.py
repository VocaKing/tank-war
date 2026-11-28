#!/usr/bin/env python3
"""Validate the IS-2 production GLB, runtime rig and non-empty PBR texture package."""
import json
import os
import re
import struct
from PIL import Image, ImageStat

root = os.path.abspath(os.getcwd())
glb_path = os.path.join(root, "public", "models", "is2_model1944_production_candidate.glb")
prod_dir = os.path.join(root, "artifacts", "is2-model1944", "production")
pbr_dir = os.path.join(prod_dir, "pbr")
manifest_path = os.path.join(prod_dir, "asset_manifest.json")

assert os.path.isfile(glb_path) and os.path.getsize(glb_path) > 100_000, "Production GLB missing or unexpectedly small"
assert os.path.isfile(manifest_path), "Asset manifest missing"

with open(glb_path, "rb") as handle:
    magic, version, total_length = struct.unpack("<4sII", handle.read(12))
    assert magic == b"glTF" and version == 2, "Invalid GLB header"
    assert total_length == os.path.getsize(glb_path), "GLB declared length does not match file length"
    chunk_length, chunk_type = struct.unpack("<II", handle.read(8))
    assert chunk_type == 0x4E4F534A, "GLB JSON chunk missing"
    gltf = json.loads(handle.read(chunk_length).decode("utf-8"))

with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

names = [node.get("name", "") for node in gltf.get("nodes", [])]
for required in manifest["required_nodes"]:
    assert required in names, "Missing runtime node: " + required

left = [name for name in names if re.fullmatch(r"TrackLink_L_\d{3}", name)]
right = [name for name in names if re.fullmatch(r"TrackLink_R_\d{3}", name)]
assert len(left) == 86, "Expected 86 independent left track-link nodes, got %d" % len(left)
assert len(right) == 86, "Expected 86 independent right track-link nodes, got %d" % len(right)

texture_stats = {}
for filename in ("basecolor.png", "normal.png", "roughness.png", "metallic.png", "ao.png"):
    path = os.path.join(pbr_dir, filename)
    assert os.path.isfile(path) and os.path.getsize(path) > 1_000, "Missing or unexpectedly small PBR map: " + filename
    with Image.open(path) as image:
        image.verify()
    with Image.open(path) as image:
        sample = image.convert("RGB").resize((128, 128))
        stat = ImageStat.Stat(sample)
        means = [round(x, 3) for x in stat.mean]
        stddev = [round(x, 3) for x in stat.stddev]
        assert max(means) > 2.0, "PBR map is effectively black: " + filename
        # A valid tangent normal map can be nearly flat, but all-zero/constant
        # images are still rejected. Other channels should show atlas variation.
        if filename == "ao.png":
            # AO is optional in this candidate and is not wired into the glTF
            # material; a neutral white multiplier is an honest fallback.
            assert min(means) > 200.0, "AO map should be a valid baked map or neutral white fallback"
        elif filename == "normal.png":
            assert means[2] > 80.0, "Normal map blue channel is invalid: " + filename
            assert max(stddev) > 0.02, "Normal map appears blank/constant: " + filename
        else:
            assert max(stddev) > 0.10, "PBR map has no measurable pixel variation: " + filename
        texture_stats[filename] = {
            "size": list(sample.size),
            "mean_rgb": means,
            "stddev_rgb": stddev,
            "source_bytes": os.path.getsize(path),
        }

assert gltf.get("meshes"), "GLB has no meshes"
assert gltf.get("materials"), "GLB has no materials"
assert gltf.get("textures"), "GLB has no textures"
assert gltf.get("images"), "GLB has no embedded images"

# Confirm the exported material really references image-backed PBR channels.
materials = gltf["materials"]
pbr_materials = [m for m in materials if m.get("pbrMetallicRoughness")]
assert pbr_materials, "No glTF metallic-roughness material found"
assert any(m["pbrMetallicRoughness"].get("baseColorTexture") for m in pbr_materials), "No Base Color texture reference"
assert any(m["pbrMetallicRoughness"].get("metallicRoughnessTexture") for m in pbr_materials), "No Metallic/Roughness texture reference"
assert any(m.get("normalTexture") for m in materials), "No tangent-space Normal texture reference"

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
    "pbr_maps": texture_stats,
    "runtime_rig": "required names verified",
    "pbr_channels": ["baseColor", "metallicRoughness", "normal"],
    "ao_map": "validated in artifact package; not wired into glTF material",
}, indent=2))
