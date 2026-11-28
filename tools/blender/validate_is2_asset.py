"""Structural QA for IS-2 Model 1944 Blender/GLB deliverables.
Run with Blender Python after export. Fails on missing UVs, key named parts,
or missing embedded image textures. Does not certify historical accuracy.
"""
import bpy, os, sys, json
path = sys.argv[-1] if len(sys.argv) > 1 and sys.argv[-1].lower().endswith(".glb") else "public/models/is2_model1944_pbr.glb"
if not os.path.exists(path): raise SystemExit("Missing GLB: " + path)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
objs = list(bpy.context.scene.objects)
meshes = [o for o in objs if o.type == "MESH"]
names = {o.name for o in objs}
required = ["Turret_cast_1944_loft", "D25T_barrel_main", "D25T_double_baffle_muzzle_brake",
            "Driver_hatch", "Commander_cupola_base"]
missing = [n for n in required if n not in names]
no_uv = [o.name for o in meshes if not o.data.uv_layers]
materials = [m for m in bpy.data.materials if m]
image_materials = [m.name for m in materials if m.use_nodes and any(n.type == "TEX_IMAGE" and n.image for n in m.node_tree.nodes)]
report = {
 "glb": path, "mesh_count": len(meshes), "material_count": len(materials),
 "image_material_count": len(image_materials), "missing_required_objects": missing,
 "meshes_without_uv": no_uv[:50], "uv_missing_count": len(no_uv),
 "vertex_count": sum(len(o.data.vertices) for o in meshes),
 "triangle_count": sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),
}
print(json.dumps(report, indent=2))
if missing or no_uv or not image_materials:
    raise SystemExit("IS-2 asset structural QA FAILED")
print("IS-2 asset structural QA PASSED (visual/historical QA still requires review)")
