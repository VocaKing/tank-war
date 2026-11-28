"""IS-2 Model 1944: UV + authored tileable PBR texture/export stage.

The first automated bake attempt produced empty alpha-zero maps. This replacement
intentionally removes that fragile bake path: it creates deterministic, tileable
Base Color, Roughness and tangent Normal maps from each material's authored values.
These are real texture images packed into the GLB, but they are not represented as
high-poly sculpt bakes. A true high->low normal bake remains a later stage.

Run after is2_model1944_blockout.py:
  blender --background artifacts/is2-model1944/is2_model1944_first_pass.blend --python tools/blender/is2_pbr_bake_export.py
"""
import bpy, os, math
import numpy as np

ROOT = os.path.abspath(".")
ART = os.path.join(ROOT, "artifacts", "is2-model1944")
TEX_DIR = os.path.join(ART, "PBR_Textures")
OUT = os.path.join(ROOT, "public", "models", "is2_model1944_pbr.glb")
os.makedirs(TEX_DIR, exist_ok=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)

RES = int(os.environ.get("IS2_TEXTURE_RES", "1024"))
scene = bpy.context.scene
asset = [o for o in scene.objects if o.type == "MESH" and o.name != "Preview_only_ground"]
if not asset:
    raise RuntimeError("No vehicle mesh objects found in source blend")

# Apply object scale and create a UV map for every mesh. The maps are tileable
# material textures, so per-object UV islands may safely reuse the 0..1 domain.
for obj in asset:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if any(abs(v - 1.0) > 1e-5 for v in obj.scale):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if not obj.data.uv_layers:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(island_margin=0.012)
        bpy.ops.object.mode_set(mode="OBJECT")
    obj["uv_status"] = "Smart UV unwrap; seams and texel density still require artist review"

def periodic_noise(res, seed):
    """Smooth periodic multi-frequency field; no visible UV seam at 0/1."""
    rng = np.random.default_rng(seed)
    axis = np.arange(res, dtype=np.float32) / float(res)
    u, v = np.meshgrid(axis, axis, indexing="xy")
    field = np.zeros((res, res), dtype=np.float32)
    bands = [(3, 1.0), (9, 0.55), (27, 0.28), (81, 0.13)]
    for max_freq, amplitude in bands:
        for _ in range(7):
            fx = int(rng.integers(1, max_freq + 1))
            fy = int(rng.integers(1, max_freq + 1))
            phase = float(rng.uniform(0.0, math.tau))
            weight = amplitude / 7.0
            field += weight * np.sin(math.tau * (fx*u + fy*v) + phase)
    field -= float(field.mean())
    field /= float(field.std()) + 1e-6
    return np.clip(field / 2.6, -1.0, 1.0).astype(np.float32)

def create_image(name, pixels, colorspace, filepath):
    h, w = pixels.shape[:2]
    image = bpy.data.images.new(name, width=w, height=h, alpha=False, float_buffer=False)
    image.colorspace_settings.name = colorspace
    image.file_format = "PNG"
    image.pixels.foreach_set(np.asarray(pixels, dtype=np.float32).reshape(-1))
    image.update()
    image.filepath_raw = filepath
    image.save()
    image.pack()
    return image

def material_texture_profile(mat, index):
    name = mat.name.lower()
    base = np.array(mat.diffuse_color[:3], dtype=np.float32)
    bs = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    rough = float(bs.inputs["Roughness"].default_value) if bs else 0.75
    if "cast" in name:
        color_amp, rough_amp, height_amp, normal_strength = 0.075, 0.055, 0.0010, 0.42
    elif "track" in name or "steel" in name:
        color_amp, rough_amp, height_amp, normal_strength = 0.090, 0.065, 0.00075, 0.34
    elif "rubber" in name:
        color_amp, rough_amp, height_amp, normal_strength = 0.035, 0.025, 0.00035, 0.22
    elif "glass" in name or "optics" in name:
        color_amp, rough_amp, height_amp, normal_strength = 0.025, 0.018, 0.00015, 0.10
    else:
        color_amp, rough_amp, height_amp, normal_strength = 0.045, 0.035, 0.00035, 0.20

    noise = periodic_noise(RES, 1944 + index * 37)
    # Low-amplitude variation preserves the material's intended olive/steel hue.
    variation = 1.0 + color_amp * noise[..., None]
    base_rgb = np.clip(base[None, None, :] * variation, 0.0, 1.0)
    base_rgba = np.ones((RES, RES, 4), dtype=np.float32)
    base_rgba[..., :3] = base_rgb

    rough_field = np.clip(rough + rough_amp * noise, 0.04, 1.0)
    rough_rgba = np.ones((RES, RES, 4), dtype=np.float32)
    rough_rgba[..., :3] = rough_field[..., None]

    # A restrained tangent-space micro-normal from the same periodic height field.
    height = noise * height_amp
    dy, dx = np.gradient(height)
    nx = -dx * RES * normal_strength
    ny = -dy * RES * normal_strength
    nz = np.ones_like(nx)
    length = np.sqrt(nx*nx + ny*ny + nz*nz)
    normal_rgba = np.ones((RES, RES, 4), dtype=np.float32)
    normal_rgba[..., 0] = (nx / length + 1.0) * 0.5
    normal_rgba[..., 1] = (ny / length + 1.0) * 0.5
    normal_rgba[..., 2] = (nz / length + 1.0) * 0.5

    stem = "".join(ch if ch.isalnum() else "_" for ch in mat.name)
    base_img = create_image("IS2_" + stem + "_BaseColor", base_rgba, "sRGB",
                            os.path.join(TEX_DIR, stem + "_BaseColor.png"))
    rough_img = create_image("IS2_" + stem + "_Roughness", rough_rgba, "Non-Color",
                             os.path.join(TEX_DIR, stem + "_Roughness.png"))
    normal_img = create_image("IS2_" + stem + "_Normal", normal_rgba, "Non-Color",
                              os.path.join(TEX_DIR, stem + "_Normal.png"))
    return base_img, rough_img, normal_img

# Only process materials actually used by vehicle meshes, not studio preview floor.
used_materials = []
for obj in asset:
    for mat in obj.data.materials:
        if mat and mat not in used_materials:
            used_materials.append(mat)

texture_count = 0
for index, mat in enumerate(used_materials):
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bs = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    out = next((n for n in nodes if n.type == "OUTPUT_MATERIAL"), None)
    if bs is None:
        bs = nodes.new("ShaderNodeBsdfPrincipled")
    if out is None:
        out = nodes.new("ShaderNodeOutputMaterial")
    # Clear unsupported procedural nodes and all old connections. glTF gets
    # explicit image-backed channels instead of Blender-only Noise/Bump nodes.
    for node in list(nodes):
        if node not in (bs, out):
            nodes.remove(node)
    for link in list(links):
        links.remove(link)
    links.new(bs.outputs["BSDF"], out.inputs["Surface"])

    base_img, rough_img, normal_img = material_texture_profile(mat, index)
    texcoord = nodes.new("ShaderNodeTexCoord")
    texcoord.label = "UV coordinates"
    for label, img, color_space in (
        ("BaseColor", base_img, "sRGB"),
        ("Roughness", rough_img, "Non-Color"),
        ("Normal", normal_img, "Non-Color"),
    ):
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.label = label
        tex.interpolation = "Linear"
        tex.extension = "REPEAT"
        tex.image.colorspace_settings.name = color_space
        links.new(texcoord.outputs["UV"], tex.inputs["Vector"])
        if label == "BaseColor":
            links.new(tex.outputs["Color"], bs.inputs["Base Color"])
        elif label == "Roughness":
            links.new(tex.outputs["Color"], bs.inputs["Roughness"])
        else:
            normal = nodes.new("ShaderNodeNormalMap")
            normal.inputs["Strength"].default_value = 0.55
            links.new(tex.outputs["Color"], normal.inputs["Color"])
            links.new(normal.outputs["Normal"], bs.inputs["Normal"])
    nodes.active = next((n for n in nodes if n.type == "TEX_IMAGE" and n.image == base_img), None)
    mat["pbr_texture_source"] = "procedural tileable material maps; not high-poly bake"
    mat["pbr_texture_resolution"] = RES
    texture_count += 3

# Export vehicle-only selection; avoid preview cameras/lights/floor.
bpy.ops.object.select_all(action="DESELECT")
for obj in asset:
    obj.select_set(True)
for obj in scene.objects:
    if obj.type == "EMPTY" and obj.name.startswith(("IS2_Model1944_Root", "Turret_Root", "Gun_Elevation_Pivot")):
        obj.select_set(True)
root = next((o for o in scene.objects if o.name == "IS2_Model1944_Root"), asset[0])
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True,
    export_apply=True, export_texcoords=True, export_normals=True,
    export_materials="EXPORT", export_image_format="AUTO")
print("PBR GLB:", OUT)
print("PBR image textures:", texture_count)

# Re-render the textured source scene so visual QA is based on the new materials.
engines = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scene.render.resolution_x = 1200
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
for view_name in ("front_three_quarter", "left_side", "front", "rear", "top"):
    camera = bpy.data.objects.get("Preview_camera_" + view_name)
    if camera is None:
        continue
    scene.camera = camera
    scene.render.filepath = os.path.join(ART, "PBR_" + view_name + ".png")
    bpy.ops.render.render(write_still=True)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ART, "is2_model1944_pbr_source.blend"))
print("Saved PBR source and textured preview renders:", ART)
