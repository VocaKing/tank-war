"""IS-2 Model 1944: non-overlapping UV atlases and PBR bake/export.

Run after is2_model1944_blockout.py:
  blender --background artifacts/is2-model1944/is2_model1944_first_pass.blend --python tools/blender/is2_pbr_bake_export.py

Each source material receives its own atlas. Every object/material pair gets a
separate tile, so different meshes cannot overwrite one another's UV pixels.
This is still a procedural low-poly material bake, not a high-poly normal bake.
"""
import bpy, os, math
from collections import defaultdict

ROOT = os.path.abspath(".")
ART = os.path.join(ROOT, "artifacts", "is2-model1944")
OUT = os.path.join(ROOT, "public", "models", "is2_model1944_pbr.glb")
os.makedirs(ART, exist_ok=True)
os.makedirs(os.path.join(ART, "PBR_Textures"), exist_ok=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
RES = int(os.environ.get("IS2_BAKE_RES", "2048"))
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.render.bake.margin = 6
scene.render.bake.use_pass_color = True
scene.render.bake.use_pass_direct = False
scene.render.bake.use_pass_indirect = False

asset = [o for o in scene.objects if o.type == "MESH" and o.name != "Preview_only_ground"]
if not asset:
    raise RuntimeError("No vehicle mesh objects found in source blend")

# Ensure every mesh has a UV layer and a smart unwrap.
for obj in asset:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if not obj.data.uv_layers:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(island_margin=0.018)
        bpy.ops.object.mode_set(mode="OBJECT")
    obj["uv_status"] = "Per-material atlas tiles; inspect seams and texel density"

# Build material atlas groups. A tile is reserved for every object/material pair.
pairs = defaultdict(list)
for obj in asset:
    for slot_index, slot in enumerate(obj.material_slots):
        if slot.material:
            pairs[slot.material].append((obj, slot_index))

images = {}
atlas_nodes = {}
for mat, entries in pairs.items():
    count = len(entries)
    grid = int(math.ceil(math.sqrt(count)))
    tile = 1.0 / grid
    gutter = tile * 0.025
    usable = tile - 2.0*gutter
    for pair_index, (obj, slot_index) in enumerate(entries):
        col, row = pair_index % grid, pair_index // grid
        u0, v0 = col*tile + gutter, row*tile + gutter
        uv = obj.data.uv_layers.active.data
        for poly in obj.data.polygons:
            if poly.material_index != slot_index:
                continue
            for li in poly.loop_indices:
                old_uv = uv[li].uv.copy()
                uv[li].uv = (u0 + old_uv.x*usable, v0 + old_uv.y*usable)
    safe = "".join(ch if ch.isalnum() or ch in "_-" else "_" for ch in mat.name)
    img = bpy.data.images.new("IS2_BaseColor_" + safe, width=RES, height=RES, alpha=False)
    img.file_format = "PNG"
    images[mat] = img

    if not mat.use_nodes:
        mat.use_nodes = True
    nodes = mat.node_tree.nodes
    for node in list(nodes):
        if node.type == "TEX_IMAGE" and node.name.startswith("IS2_BAKE_TARGET"):
            nodes.remove(node)
    tex = nodes.new("ShaderNodeTexImage")
    tex.name = "IS2_BAKE_TARGET_" + safe
    tex.image = img
    nodes.active = tex
    tex.select = True
    atlas_nodes[mat] = tex

# Select the complete vehicle and bake diffuse color into per-material atlases.
bpy.ops.object.select_all(action="DESELECT")
for obj in asset:
    obj.select_set(True)
bpy.context.view_layer.objects.active = asset[0]
scene.cycles.bake_type = "DIFFUSE"
scene.render.bake.use_pass_color = True
scene.render.bake.use_pass_direct = False
scene.render.bake.use_pass_indirect = False
bpy.ops.object.bake(type="DIFFUSE")

# Bake AO to per-material maps using the same non-overlapping atlas coordinates.
ao_images = {}
for mat in pairs:
    safe = "".join(ch if ch.isalnum() or ch in "_-" else "_" for ch in mat.name)
    img = bpy.data.images.new("IS2_AO_" + safe, width=RES, height=RES, alpha=False)
    img.file_format = "PNG"
    ao_images[mat] = img
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.name = "IS2_AO_TARGET_" + safe
    tex.image = img
    mat.node_tree.nodes.active = tex
    for n in mat.node_tree.nodes:
        n.select = (n == tex)

scene.cycles.bake_type = "AO"
scene.render.bake.use_pass_color = False
bpy.ops.object.bake(type="AO")

# Multiply AO into Base Color to retain the AO contribution in standard glTF
# viewers. Also preserve a separate AO map for engines that support AO slots.
for mat, base in images.items():
    ao = ao_images[mat]
    base_pixels = list(base.pixels[:])
    ao_pixels = list(ao.pixels[:])
    for i in range(0, len(base_pixels), 4):
        factor = ao_pixels[i] if i < len(ao_pixels) else 1.0
        # Avoid overly darkening the paint; retain a mild baked contact effect.
        factor = 0.55 + 0.45*factor
        base_pixels[i] *= factor
        base_pixels[i+1] *= factor
        base_pixels[i+2] *= factor
    base.pixels[:] = base_pixels
    base.update()
    safe = "".join(ch if ch.isalnum() or ch in "_-" else "_" for ch in mat.name)
    base_path = os.path.join(ART, "PBR_Textures", safe + "_BaseColor.png")
    ao_path = os.path.join(ART, "PBR_Textures", safe + "_AO.png")
    base.filepath_raw = base_path
    base.save()
    ao.filepath_raw = ao_path
    ao.save()
    base.pack()
    ao.pack()

    # Connect the baked color atlas to the Principled Base Color input.
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bs = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bs:
        raise RuntimeError("No Principled BSDF on material " + mat.name)
    baked_node = next((n for n in nodes if n.name == "IS2_BAKE_TARGET_" + safe), None)
    if not baked_node:
        raise RuntimeError("Missing baked image node for " + mat.name)
    # Remove procedural Base Color links, preserving other material properties.
    for link in list(links):
        if link.to_node == bs and link.to_socket == bs.inputs["Base Color"]:
            links.remove(link)
    links.new(baked_node.outputs["Color"], bs.inputs["Base Color"])
    mat["basecolor_texture"] = base.name
    mat["ao_texture"] = ao.name
    mat["texture_atlas_tiles"] = len(pairs[mat])

# Export vehicle meshes and hierarchy. Preview floor/cameras/lights are excluded.
bpy.ops.object.select_all(action="DESELECT")
for obj in asset:
    obj.select_set(True)
for obj in scene.objects:
    if obj.type == "EMPTY" and obj.name in ("IS2_Model1944_Root", "Turret_Root", "Gun_Elevation_Pivot"):
        obj.select_set(True)
root = next((o for o in scene.objects if o.name == "IS2_Model1944_Root"), asset[0])
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True,
    export_apply=True, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_image_format="AUTO")
# Render a PBR preview using the baked materials in the same studio scene.
bpy.ops.object.camera_add(location=(8.5, 9.0, 5.8))
cam = bpy.context.object
cam.name = "PBR_Review_Camera"
cam.data.type = "ORTHO"
cam.data.ortho_scale = 11.0
from mathutils import Vector
cam.rotation_euler = (Vector((0, 0.4, 1.25))-cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam
scene.render.resolution_x = 1200
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = os.path.join(ART, "PBR_front_three_quarter.png")
bpy.ops.render.render(write_still=True)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ART, "is2_model1944_pbr_source.blend"))
print("PBR GLB:", OUT)
print("Material atlas count:", len(images))
print("Object/material atlas tile count:", sum(len(v) for v in pairs.values()))
