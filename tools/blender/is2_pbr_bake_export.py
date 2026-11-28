"""IS-2 Model 1944: UV + PBR bake/export stage.

Run after is2_model1944_blockout.py:
  blender --background artifacts/is2-model1944/is2_model1944_first_pass.blend --python tools/blender/is2_pbr_bake_export.py

This stage bakes the current source materials and AO into packed image textures.
It does NOT pretend to create sculpted high-poly detail: a true high->low normal
bake remains gated on a separately authored high-poly sculpt.
"""
import bpy, os, math
from mathutils import Vector

ROOT = os.path.abspath(".")
ART = os.path.join(ROOT, "artifacts", "is2-model1944")
OUT = os.path.join(ROOT, "public", "models", "is2_model1944_pbr.glb")
os.makedirs(ART, exist_ok=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
RES = int(os.environ.get("IS2_BAKE_RES", "2048"))
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.render.bake.margin = 8
scene.render.bake.use_pass_color = True
scene.render.bake.use_pass_direct = False
scene.render.bake.use_pass_indirect = False

asset = [o for o in scene.objects if o.type == "MESH" and o.name != "Preview_only_ground"]
if not asset:
    raise RuntimeError("No vehicle mesh objects found in source blend")

# Apply scale and create non-overlapping UVs per mesh. Keep material slots.
for obj in asset:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if not obj.data.uv_layers:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(island_margin=0.012)
        bpy.ops.object.mode_set(mode="OBJECT")
    obj["uv_status"] = "Smart UV unwrap; inspect seams before final production"

def new_image(name):
    img = bpy.data.images.new(name, width=RES, height=RES, alpha=True)
    img.file_format = "PNG"
    return img

def bake_to(image, bake_type, colorspace=None):
    if colorspace:
        image.colorspace_settings.name = colorspace
    for obj in asset:
        if not obj.data.materials:
            continue
        for mat in obj.data.materials:
            if not mat or not mat.use_nodes: continue
            nodes = mat.node_tree.nodes
            for n in list(nodes):
                if n.type == "TEX_IMAGE": nodes.remove(n)
            tex = nodes.new("ShaderNodeTexImage")
            tex.name = "BAKE_TARGET_" + image.name
            tex.image = image
            nodes.active = tex
            tex.select = True
    bpy.context.view_layer.objects.active = asset[0]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in asset: obj.select_set(True)
    scene.cycles.bake_type = bake_type
    bpy.ops.object.bake(type=bake_type)

# Color bake (direct/indirect disabled above): captures source material color.
base = new_image("IS2_BaseColor_2K")
bake_to(base, "DIFFUSE", "sRGB")
base_path = os.path.join(ART, "IS2_BaseColor_2K.png")
base.filepath_raw = base_path; base.save()

# AO bake is independent of lighting.
scene.render.bake.use_pass_color = False
scene.render.bake.use_pass_direct = False
scene.render.bake.use_pass_indirect = False
ao = new_image("IS2_AO_2K")
bake_to(ao, "AO", "Non-Color")
ao_path = os.path.join(ART, "IS2_AO_2K.png")
ao.filepath_raw = ao_path; ao.save()

# Attach packed BaseColor/AO maps to all vehicle materials for glTF.
for obj in asset:
    for mat in obj.data.materials:
        if not mat or not mat.use_nodes: continue
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bs = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bs: continue
        base_node = nodes.new("ShaderNodeTexImage"); base_node.image = base
        base_node.label = "Baked Base Color"; links.new(base_node.outputs["Color"], bs.inputs["Base Color"])
        ao_node = nodes.new("ShaderNodeTexImage"); ao_node.image = ao
        ao_node.label = "Baked Ambient Occlusion"
        # AO is stored and packed; keep it available for engine-side AO multiplication.
        mat["ao_texture"] = ao.name
        mat["basecolor_texture"] = base.name

for img in (base, ao):
    img.pack()

# Export vehicle-only selection; avoid preview cameras/lights/floor.
bpy.ops.object.select_all(action="DESELECT")
for obj in asset:
    obj.select_set(True)
for obj in scene.objects:
    if obj.type == "EMPTY" and (obj.name.startswith(("IS2_Model1944_Root","Turret_Root","Gun_Elevation_Pivot"))):
        obj.select_set(True)
bpy.context.view_layer.objects.active = next((o for o in scene.objects if o.name == "IS2_Model1944_Root"), asset[0])
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True,
    export_apply=True, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_image_format="AUTO")
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ART, "is2_model1944_pbr_source.blend"))
print("PBR GLB:", OUT)
print("BAKED:", base_path, ao_path)
