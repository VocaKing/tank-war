"""Structural AND texture-content QA for IS-2 Model 1944 GLB.
This checks that embedded image textures contain valid pixel data, not merely
that image nodes exist. It does not certify historical accuracy or artistic quality.
"""
import bpy, os, sys, json, math
path = sys.argv[-1] if len(sys.argv) > 1 and sys.argv[-1].lower().endswith(".glb") else "public/models/is2_model1944_pbr.glb"
if not os.path.exists(path):
    raise SystemExit("Missing GLB: " + path)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
objs = list(bpy.context.scene.objects)
meshes = [o for o in objs if o.type == "MESH"]
names = {o.name for o in objs}
required = ["Turret_cast_1944_loft", "D25T_barrel_main", "D25T_double_baffle_muzzle_brake",
            "Driver_hatch", "Commander_cupola_base", "Track_run_86_links_L", "Track_run_86_links_R"]
missing = [n for n in required if n not in names]
no_uv = [o.name for o in meshes if not o.data.uv_layers]
materials = [m for m in bpy.data.materials if m]
image_materials = [m.name for m in materials if m.use_nodes and any(n.type == "TEX_IMAGE" and n.image for n in m.node_tree.nodes)]
images = [img for img in bpy.data.images if img.size[0] > 0 and img.size[1] > 0]
image_health = []
bad_images = []
for img in images:
    width, height = img.size[:]
    total = width * height
    stride = max(1, total // 2048)
    px = img.pixels
    rgb = []
    alpha = []
    for p in range(0, total, stride):
        j = p * 4
        rgb.extend((float(px[j]), float(px[j+1]), float(px[j+2])))
        alpha.append(float(px[j+3]))
    lo, hi = min(rgb), max(rgb)
    mean = sum(rgb) / len(rgb)
    variance = sum((v-mean)*(v-mean) for v in rgb) / len(rgb)
    alpha_min = min(alpha)
    ok = hi > 0.05 and alpha_min > 0.95 and (variance > 1e-7 or hi-lo > 0.01)
    image_health.append({"name": img.name, "size": [width, height], "rgb_min": round(lo,4),
                         "rgb_max": round(hi,4), "rgb_variance": round(variance,7),
                         "alpha_min": round(alpha_min,4), "ok": ok})
    if not ok:
        bad_images.append(img.name)

report = {
 "glb": path, "mesh_count": len(meshes), "material_count": len(materials),
 "image_count": len(images), "image_material_count": len(image_materials),
 "missing_required_objects": missing, "meshes_without_uv": no_uv[:50],
 "uv_missing_count": len(no_uv),
 "vertex_count": sum(len(o.data.vertices) for o in meshes),
 "triangle_count": sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),
 "bad_or_empty_images": bad_images, "image_health_sample": image_health[:12]
}
print(json.dumps(report, indent=2))
if missing or no_uv or len(image_materials) < 1 or len(images) < 3 or bad_images:
    raise SystemExit("IS-2 asset structural/texture QA FAILED")
print("IS-2 structural and texture-content QA PASSED (visual/historical QA still requires review)")
