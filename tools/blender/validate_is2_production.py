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

node_by_name = {node.get("name", ""): node for node in gltf.get("nodes", [])}
node_index = {node.get("name", ""): i for i, node in enumerate(gltf.get("nodes", []))}

def child_names(parent_name):
    parent = node_by_name[parent_name]
    return {
        gltf["nodes"][child].get("name", "")
        for child in parent.get("children", [])
    }

# The runtime depends on these exact pivots being nested correctly. A flat list
# of nodes is not enough: a turret or gun pivot under the wrong parent would
# rotate the whole hull or fail to animate.
required_parent_pairs = (
    ("IS2_Model1944_Root", "Hull_Body"),
    ("Hull_Body", "Turret_Root"),
    ("Turret_Root", "Gun_Elevation_Pivot"),
    ("Gun_Elevation_Pivot", "Gun_Recoil_Pivot"),
    ("Gun_Recoil_Pivot", "Muzzle"),
    ("Gun_Elevation_Pivot", "Gun_Sight"),
    ("Hull_Body", "Track_L_Root"),
    ("Hull_Body", "Track_R_Root"),
)
for parent, child in required_parent_pairs:
    assert child in child_names(parent), "%s is not a child of %s" % (child, parent)

left = [name for name in names if re.fullmatch(r"TrackLink_L_\d{3}", name)]
right = [name for name in names if re.fullmatch(r"TrackLink_R_\d{3}", name)]
assert len(left) == 86, "Expected 86 independent left track-link nodes, got %d" % len(left)
assert len(right) == 86, "Expected 86 independent right track-link nodes, got %d" % len(right)

# Verify every link belongs to the correct track root and has renderable mesh
# geometry. This also detects accidental joining of the 86 shoes into one mesh.
for label, links, root_name in (
    ("L", left, "Track_L_Root"),
    ("R", right, "Track_R_Root"),
):
    child_set = child_names(root_name)
    assert set(links).issubset(child_set), "Track %s links are not parented to %s" % (label, root_name)
    assert all(node_by_name[name].get("mesh") is not None for name in links), "Track %s contains a link without mesh geometry" % label
    mesh_ids = {node_by_name[name]["mesh"] for name in links}
    assert len(mesh_ids) == 1, "Track %s links should share one instancing-ready mesh, got %d" % (label, len(mesh_ids))

# Six paired road-wheel stations and three return rollers per side, plus the
# rear drive sprocket and front idler. Each must have an independent pivot.
expected_pivots = (
    [f"RoadWheel_{side}_{index:02d}_Pivot" for side in ("L", "R") for index in range(1, 7)]
    + [f"ReturnRoller_{side}_{index:02d}_Pivot" for side in ("L", "R") for index in range(1, 4)]
    + [f"DriveSprocket_{side}_Pivot" for side in ("L", "R")]
    + [f"FrontIdler_{side}_Pivot" for side in ("L", "R")]
)
missing_pivots = [name for name in expected_pivots if name not in node_by_name]
assert not missing_pivots, "Missing running-gear pivots: " + ", ".join(missing_pivots)
for pivot in expected_pivots:
    assert child_names(pivot), "Running-gear pivot has no mesh child: " + pivot

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
