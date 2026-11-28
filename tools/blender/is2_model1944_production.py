#!/usr/bin/env python3
"""IS-2 Model 1944 production asset pipeline. This is an isolated review build.

Runs the existing dimensioned Blender source, then builds:
- high-poly source / low-poly game-mesh bake target
- packed UV atlas and baked Base Color, Tangent Normal, Roughness, Metallic and AO
- a shared PBR material and GLB export
- separate turret, elevation, recoil, wheel, sprocket, idler and 172 track-link nodes

The original Three.js model is not modified or replaced by this script.
Run from the repository root:
  blender --background --python-exit-code 1 --python tools/blender/is2_model1944_production.py
"""
import bpy
import os
import re
import json
import math
import runpy
import numpy as np
from PIL import Image, ImageDraw
from mathutils import Vector

REPO_ROOT = os.path.abspath(os.getcwd())
BASE_SCRIPT = os.path.join(REPO_ROOT, "tools", "blender", "is2_model1944_blockout.py")
if not os.path.isfile(BASE_SCRIPT):
    raise FileNotFoundError("Missing existing IS-2 source model: " + BASE_SCRIPT)

# Build the dimensioned source scene. This also produces the original blockout
# outputs, which are deliberately retained as a fallback/reference.
os.environ.setdefault("IS2_FAST_PREVIEW", "1")
with open(BASE_SCRIPT, "r", encoding="utf-8") as source_handle:
    source_text = source_handle.read()
source_render_call = 'render_view("01_front_three_quarter", (8.5, 9.0, 5.8), (0, 0.4, 1.25), 11.0)'
if source_render_call not in source_text:
    raise RuntimeError("The expected source preview call changed; review the base script before continuing")
source_text = source_text.replace(source_render_call, 'print("Skipping duplicate blockout render; production views are rendered below.")')
source_ns = {}
exec(compile(source_text, BASE_SCRIPT, "exec"), source_ns)
globals().update(source_ns)

PROD_DIR = os.path.join(ART_DIR, "production")
PBR_DIR = os.path.join(PROD_DIR, "pbr")
os.makedirs(PROD_DIR, exist_ok=True)
os.makedirs(PBR_DIR, exist_ok=True)
GLB_OUT = os.path.join(REPO_ROOT, "public", "models", "is2_model1944_production_candidate.glb")
BLEND_OUT = os.path.join(PROD_DIR, "is2_model1944_production_candidate.blend")
MANIFEST_OUT = os.path.join(PROD_DIR, "asset_manifest.json")
ATLAS_SIZE = int(os.environ.get("IS2_ATLAS_SIZE", "2048"))
ATLAS_SIZE = max(1024, min(4096, ATLAS_SIZE))

scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0

def get_collection(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
    if coll.name not in scene.collection.children:
        scene.collection.children.link(coll)
    return coll

HP_COLL = get_collection("00_HIGH_POLY_BAKE_SOURCE")
LP_COLL = get_collection("01_LOW_POLY_BAKE_TARGET")
FINAL_COLL = get_collection("02_GAME_READY_RIG")

def move_to_collection(obj, coll):
    for old in list(obj.users_collection):
        if old != coll:
            old.objects.unlink(obj)
    if obj.name not in coll.objects:
        coll.objects.link(obj)

def deselect_all():
    bpy.ops.object.select_all(action="DESELECT")

def apply_modifiers(obj):
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for modifier in list(obj.modifiers):
        if modifier.type == "BEVEL":
            modifier.segments = 1
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except RuntimeError:
            # A non-critical modifier that cannot be applied remains on the
            # editable source; the exporter applies remaining modifiers.
            pass
    obj.select_set(False)

def classify_part(name):
    m = re.match(r"Roadwheel_(?:hub_cap_|relief_|rim_|hub_|rubber_tire_|hub_bolt_)?(-?1)_(\d+)_", name, re.I)
    if m:
        side = "L" if int(m.group(1)) < 0 else "R"
        return "RoadWheel_%s_%02d" % (side, int(m.group(2)))
    m = re.match(r"Return_roller_(-?1)_(\d+)", name, re.I)
    if m:
        side = "L" if int(m.group(1)) < 0 else "R"
        return "ReturnRoller_%s_%02d" % (side, int(m.group(2)))
    m = re.match(r"(?:Drive_sprocket_core|Drive_rim|Drive_tooth)_(-?1)(?:_|$)", name, re.I)
    if m:
        return "DriveSprocket_%s" % ("L" if int(m.group(1)) < 0 else "R")
    m = re.match(r"Front_idler(?:_hub)?_(-?1)(?:_|$)", name, re.I)
    if m:
        return "FrontIdler_%s" % ("L" if int(m.group(1)) < 0 else "R")
    if name.startswith(("D25T_barrel_", "D25T_double_baffle_muzzle_brake", "Muzzle_brake_side_port", "Muzzle_brake_baffle_", "Muzzle_brake_front_lip", "Muzzle_bore_")):
        return "Gun_Recoil"
    if name.startswith(("D25T_cast_mantlet", "Main_gun_recess", "Main_gun_mantlet_", "Coaxial_", "Telescope_")):
        return "Gun_Elevation"
    if name.startswith(("Turret_cast_", "Commander_", "Cupola_", "DShK_", "Loader_hatch", "Turret_rear_DT_")):
        return "Turret"
    return "Hull"

def make_bake_material(name, source_material):
    # The atlas is split by assembly AND original source material. This lets us
    # bake material colour/roughness/metallic directly on the low-poly target
    # without relying on a fragile high-to-low colour projection.
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    color = tuple(float(v) for v in source_material.diffuse_color[:3])
    roughness = get_scalar_from_material(source_material, "Roughness", 0.78)
    metallic = get_scalar_from_material(source_material, "Metallic", 0.18)
    emission = nodes.new("ShaderNodeEmission")
    emission.name = "IS2_BAKE_EMISSION"
    emission.inputs["Color"].default_value = (*color, 1.0)
    output = nodes.new("ShaderNodeOutputMaterial")
    mat.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    mat["bake_basecolor"] = list(color)
    mat["bake_roughness"] = roughness
    mat["bake_metallic"] = metallic
    mat["source_material"] = source_material.name
    return mat

def make_emission_material(name, value):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (value, value, value, 1.0)
    output = nodes.new("ShaderNodeOutputMaterial")
    mat.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return mat

def get_scalar_from_material(mat, socket_name, fallback):
    if not mat or not mat.use_nodes or not mat.node_tree:
        return fallback
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if not bsdf or socket_name not in bsdf.inputs:
        return fallback
    socket = bsdf.inputs[socket_name]
    if socket.is_linked:
        return fallback
    try:
        return float(socket.default_value)
    except (TypeError, ValueError):
        return fallback

def add_weld_bead(name, points, material):
    curve = bpy.data.curves.new(name + "_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 16
    curve.bevel_depth = 0.0045
    curve.bevel_resolution = 4
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, xyz in zip(spline.points, points):
        point.co = (xyz[0], xyz[1], xyz[2], 1.0)
    curve.materials.append(material)
    obj = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(obj)
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active
    move_to_collection(obj, HP_COLL)
    obj["asset_role"] = "high_poly_weld_detail"
    return obj

def add_track_piece_box(name, location, dimensions, material, bevel, segments):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("TrackLink_HardSurface_Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(material)
    return obj

def add_track_piece_cylinder(name, location, radius, depth, material, segments):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=32, radius=radius, depth=depth,
        location=location, rotation=(0.0, math.pi / 2.0, 0.0)
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    mod = obj.modifiers.new("TrackPin_EdgeRadius", "BEVEL")
    mod.width = 0.004
    mod.segments = segments
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def build_track_link_template(side, material, bevel_segments, name, collection):
    # The guide horn is mirrored toward the hull centreline on each side.
    centre = (side * 2.0, 0.0, -5.0)
    pitch = TRACK_PITCH
    parts = []
    parts.append(add_track_piece_box(
        name + "_Shoe", centre,
        (TRACK_WIDTH, pitch * 0.91, 0.075), material, 0.010, bevel_segments
    ))
    parts.append(add_track_piece_box(
        name + "_Grouser", (centre[0], centre[1], centre[2] + 0.050),
        (TRACK_WIDTH * 0.94, 0.035, 0.025), material, 0.006, bevel_segments
    ))
    parts.append(add_track_piece_box(
        name + "_GuideHorn",
        (centre[0] - side * 0.22, centre[1], centre[2] - 0.058),
        (0.12, pitch * 0.38, 0.10), material, 0.008, bevel_segments
    ))
    for sign in (-1, 1):
        parts.append(add_track_piece_cylinder(
            name + "_HingePin_" + str(sign),
            (centre[0] + sign * 0.315, centre[1], centre[2]),
            0.022, 0.055, material, bevel_segments
        ))
    deselect_all()
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    template = bpy.context.view_layer.objects.active
    template.name = name
    move_to_collection(template, collection)
    template["asset_role"] = "track_link_template"
    template["track_width_m"] = TRACK_WIDTH
    template["track_pitch_m"] = pitch
    return template

def set_bake_image_on_materials(target, image):
    for mat in target.data.materials:
        if mat is None or not mat.use_nodes:
            continue
        nodes = mat.node_tree.nodes
        for node in nodes:
            if node.type == "TEX_IMAGE" and node.name.startswith("IS2_BAKE_TARGET"):
                nodes.remove(node)
        for existing in nodes:
            existing.select = False
        node = nodes.new("ShaderNodeTexImage")
        node.name = "IS2_BAKE_TARGET_" + image.name
        node.label = "Bake target: " + image.name
        node.image = image
        node.select = True
        nodes.active = node

def new_bake_image(name, colorspace):
    image = bpy.data.images.new(name, width=ATLAS_SIZE, height=ATLAS_SIZE, alpha=False, float_buffer=False)
    image.generated_color = (0.0, 0.0, 0.0, 1.0)
    image.colorspace_settings.name = colorspace
    image.file_format = "PNG"
    return image

def uv_triangles(target):
    if not target.data.uv_layers:
        raise RuntimeError("Cannot rasterize material atlas without UV coordinates")
    target.data.calc_loop_triangles()
    uv_layer = target.data.uv_layers.active
    for tri in target.data.loop_triangles:
        polygon = target.data.polygons[tri.polygon_index]
        points = []
        for loop_index in tri.loops:
            uv = uv_layer.data[loop_index].uv
            x = int(round(float(uv.x) * (ATLAS_SIZE-1)))
            y = int(round((1.0-float(uv.y)) * (ATLAS_SIZE-1)))
            points.append((
                max(0, min(ATLAS_SIZE-1, x)),
                max(0, min(ATLAS_SIZE-1, y))
            ))
        yield polygon.material_index, points

def linear_to_srgb(value):
    value = max(0.0, min(1.0, float(value)))
    return 12.92*value if value <= 0.0031308 else 1.055*(value ** (1.0/2.4)) - 0.055

def rasterize_material_atlas(target, channel, filepath):
    """Rasterize the target's UV triangles and material IDs into a texture atlas.

    This deterministic path is used for Base Color/Roughness/Metallic because
    Blender's background bake operator returned FINISHED while writing all-zero
    pixels in this runner. It preserves the original source-material values.
    """
    mode = "RGB" if channel == "BaseColor" else "L"
    image = Image.new(mode, (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0) if mode == "RGB" else 0)
    draw = ImageDraw.Draw(image)
    coverage = Image.new("L", (ATLAS_SIZE, ATLAS_SIZE), 0)
    coverage_draw = ImageDraw.Draw(coverage)
    material_count = len(target.data.materials)
    painted = 0
    for material_index, points in uv_triangles(target):
        if material_index < 0 or material_index >= material_count:
            continue
        mat = target.data.materials[material_index]
        if mat is None:
            continue
        if channel == "BaseColor":
            linear = mat["bake_basecolor"]
            fill = tuple(int(round(linear_to_srgb(v)*255.0)) for v in linear)
        else:
            scalar = float(mat["bake_" + channel.lower()])
            fill = int(round(max(0.0, min(1.0, scalar))*255.0))
        draw.polygon(points, fill=fill)
        coverage_draw.polygon(points, fill=255)
        painted += 1
    if painted == 0:
        raise RuntimeError("UV material-ID rasterizer found no mapped triangles for " + channel)

    # The source materials are intentionally simple, but a completely flat
    # albedo/roughness atlas makes the vehicle look like a plastic blockout.
    # Add restrained, deterministic paint grain and broad tonal variation only
    # inside UV islands. Keep the variation subtle enough that markings,
    # camouflage and historical paint layers can be added separately later.
    mask = np.asarray(coverage, dtype=np.uint8) > 0
    rng = np.random.default_rng({
        "BaseColor": 1944,
        "Roughness": 1945,
        "Metallic": 1946,
    }.get(channel, 1947))
    pixels = np.asarray(image, dtype=np.float32).copy()
    high = rng.normal(0.0, 1.0, (ATLAS_SIZE, ATLAS_SIZE)).astype(np.float32)
    low_seed = rng.normal(0.0, 1.0, (96, 96)).astype(np.float32)
    low_u8 = np.clip(low_seed * 28.0 + 128.0, 0, 255).astype(np.uint8)
    low_img = Image.fromarray(low_u8, mode="L").resize(
        (ATLAS_SIZE, ATLAS_SIZE), resample=Image.Resampling.BICUBIC
    )
    low = (np.asarray(low_img, dtype=np.float32) - 128.0) / 28.0
    if channel == "BaseColor":
        variation = high * 2.0 + low * 2.8
        pixels[mask] = np.clip(pixels[mask] + variation[mask, None], 0, 255)
    elif channel == "Roughness":
        variation = high * 3.0 + low * 3.5
        pixels[mask] = np.clip(pixels[mask] + variation[mask], 0, 255)
    elif channel == "Metallic":
        variation = high * 1.0 + low * 1.0
        pixels[mask] = np.clip(pixels[mask] + variation[mask], 0, 255)
    # Extend island edge colors into the surrounding gutter before filtering.
    # Without padding, bilinear sampling and mipmaps mix black background into
    # the vehicle's surface, particularly along the many small UV islands.
    pixels = np.clip(pixels, 0, 255).astype(np.uint8)
    filled = mask.copy()
    for _ in range(8):
        previous = filled.copy()
        for dy, dx in ((-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)):
            dst_y = slice(max(0,dy), ATLAS_SIZE+min(0,dy))
            dst_x = slice(max(0,dx), ATLAS_SIZE+min(0,dx))
            src_y = slice(max(0,-dy), ATLAS_SIZE+min(0,-dy))
            src_x = slice(max(0,-dx), ATLAS_SIZE+min(0,-dx))
            take = previous[src_y,src_x] & ~filled[dst_y,dst_x]
            pixels[dst_y,dst_x][take] = pixels[src_y,src_x][take]
            filled[dst_y,dst_x][take] = True
    image = Image.fromarray(pixels, mode=mode)
    image.save(filepath, format="PNG", optimize=True)
    bpy_image = bpy.data.images.load(filepath, check_existing=False)
    bpy_image.name = "IS2_" + channel + "_Atlas"
    bpy_image.colorspace_settings.name = "sRGB" if channel == "BaseColor" else "Non-Color"
    bpy_image.pack()
    print("UV_ATLAS_RASTERIZED", channel, "triangles", painted, "path", filepath)
    return bpy_image

def create_procedural_normal_atlas(target, filepath):
    """Create a restrained UV-masked tangent micro-normal fallback."""
    mask = Image.new("L", (ATLAS_SIZE, ATLAS_SIZE), 0)
    draw = ImageDraw.Draw(mask)
    painted = 0
    for _material_index, points in uv_triangles(target):
        draw.polygon(points, fill=255)
        painted += 1
    if painted == 0:
        raise RuntimeError("Normal fallback has no UV triangles")
    mask_array = np.asarray(mask, dtype=np.float32) / 255.0
    axis = np.arange(ATLAS_SIZE, dtype=np.float32) / float(ATLAS_SIZE)
    u, v = np.meshgrid(axis, axis, indexing="xy")
    rng = np.random.default_rng(1944)
    height = np.zeros((ATLAS_SIZE, ATLAS_SIZE), dtype=np.float32)
    for max_freq, amplitude in ((4, 1.0), (12, 0.55), (36, 0.25), (96, 0.10)):
        for _ in range(6):
            fx = int(rng.integers(1, max_freq+1))
            fy = int(rng.integers(1, max_freq+1))
            phase = float(rng.uniform(0.0, math.tau))
            height += (amplitude/6.0) * np.sin(math.tau*(fx*u+fy*v)+phase)
    height -= float(height.mean())
    height /= float(height.std()) + 1e-6
    height *= 0.00035
    dy, dx = np.gradient(height)
    nx = -dx * ATLAS_SIZE * 0.12
    ny = -dy * ATLAS_SIZE * 0.12
    nz = np.ones_like(nx)
    length = np.sqrt(nx*nx + ny*ny + nz*nz)
    rgb = np.empty((ATLAS_SIZE, ATLAS_SIZE, 3), dtype=np.uint8)
    rgb[...,0] = np.clip((nx/length+1.0)*127.5, 0, 255).astype(np.uint8)
    rgb[...,1] = np.clip((ny/length+1.0)*127.5, 0, 255).astype(np.uint8)
    rgb[...,2] = np.clip((nz/length+1.0)*127.5, 0, 255).astype(np.uint8)
    rgb[mask_array < 0.5] = (128, 128, 255)
    Image.fromarray(rgb, mode="RGB").save(filepath, format="PNG", optimize=True)
    bpy_image = bpy.data.images.load(filepath, check_existing=False)
    bpy_image.name = "IS2_Procedural_TangentNormal_Fallback"
    bpy_image.colorspace_settings.name = "Non-Color"
    bpy_image.pack()
    print("NORMAL_FALLBACK_CREATED", filepath)
    return bpy_image

def create_neutral_ao_atlas(filepath):
    """Neutral white AO multiplier; AO is optional and not wired into the GLB material."""
    Image.new("L", (ATLAS_SIZE, ATLAS_SIZE), 255).save(filepath, format="PNG", optimize=True)
    bpy_image = bpy.data.images.load(filepath, check_existing=False)
    bpy_image.name = "IS2_AO_Neutral_Fallback"
    bpy_image.colorspace_settings.name = "Non-Color"
    bpy_image.pack()
    print("AO_NEUTRAL_FALLBACK_CREATED", filepath)
    return bpy_image

def save_bake_image(image, filename):
    image.filepath_raw = os.path.join(PBR_DIR, filename)
    image.file_format = "PNG"
    image.save()
    image.pack()

def select_sources_to_target(sources, target):
    deselect_all()
    for source in sources:
        if source and source.name in bpy.data.objects:
            source.hide_set(False)
            source.hide_render = False
            source.select_set(True)
    target.hide_set(False)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target

def bake_selected_to_active(target, sources, image, bake_type, pass_filter=None):
    set_bake_image_on_materials(target, image)
    select_sources_to_target(sources, target)
    kwargs = {
        "type": bake_type,
        "use_selected_to_active": True,
        "cage_extrusion": 0.025,
        "max_ray_distance": 0.16,
        "margin": 16,
        "use_clear": True,
    }
    if pass_filter is not None:
        kwargs["pass_filter"] = pass_filter
    if bake_type == "NORMAL":
        kwargs["normal_space"] = "TANGENT"
    # Set BakeSettings explicitly as well as passing operator arguments. This
    # avoids Blender background-mode defaults silently disabling selected-to-active
    # projection or the diffuse color contribution.
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.025
    scene.render.bake.max_ray_distance = 0.16
    scene.render.bake.use_clear = True
    if bake_type == "DIFFUSE":
        scene.render.bake.use_pass_color = True
        scene.render.bake.use_pass_direct = False
        scene.render.bake.use_pass_indirect = False
    bpy.context.view_layer.update()
    result = bpy.ops.object.bake(**kwargs)
    print("BAKE_RESULT", bake_type, result)
    if "FINISHED" not in result:
        raise RuntimeError("Bake operator did not finish: " + bake_type)
    save_bake_image(image, image.name.lower() + ".png")
    pixels = image.pixels
    sample_count = image.size[0] * image.size[1]
    stride = max(1, sample_count // 4096)
    rgb = []
    for pixel_index in range(0, sample_count, stride):
        offset = pixel_index * 4
        rgb.extend((float(pixels[offset]), float(pixels[offset+1]), float(pixels[offset+2])))
    stats = (min(rgb), max(rgb), sum(rgb) / len(rgb)) if rgb else (0.0, 0.0, 0.0)
    print("BAKE_PIXEL_STATS", image.name, stats)
    if bake_type == "DIFFUSE" and stats[1] < 0.01:
        raise RuntimeError("Diffuse Base Color bake is empty; refusing to export a black atlas")

def bake_scalar_selected_to_active(target, sources, image, socket_name, fallback):
    originals = {}
    for source in sources:
        if source.type != "MESH":
            continue
        old_materials = list(source.data.materials)
        old_indices = [poly.material_index for poly in source.data.polygons]
        values = [get_scalar_from_material(mat, socket_name, fallback) for mat in old_materials]
        value = sum(values) / len(values) if values else fallback
        emission = make_emission_material("IS2_TEMP_%s_%s" % (socket_name, source.name), value)
        originals[source.name] = (old_materials, old_indices, emission)
        source.data.materials.clear()
        source.data.materials.append(emission)
        for poly in source.data.polygons:
            poly.material_index = 0
    try:
        bake_selected_to_active(target, sources, image, "EMIT")
    finally:
        for source in sources:
            saved = originals.get(source.name)
            if not saved:
                continue
            old_materials, old_indices, emission = saved
            source.data.materials.clear()
            for mat in old_materials:
                source.data.materials.append(mat)
            for poly, index in zip(source.data.polygons, old_indices):
                poly.material_index = index
            if emission.users == 0:
                bpy.data.materials.remove(emission)

def image_rgb_stats(image):
    pixels = image.pixels
    total = image.size[0] * image.size[1]
    stride = max(1, total // 4096)
    values = []
    for pixel_index in range(0, total, stride):
        offset = pixel_index * 4
        values.extend((float(pixels[offset]), float(pixels[offset+1]), float(pixels[offset+2])))
    return (min(values), max(values), sum(values) / len(values)) if values else (0.0, 0.0, 0.0)

def bake_target_emission(target, image, channel):
    # Material-ID bake: every low-poly face already has the corresponding
    # source material's stored value, so no ray projection is needed.
    set_bake_image_on_materials(target, image)
    for mat in target.data.materials:
        if not mat or not mat.use_nodes:
            continue
        emission = mat.node_tree.nodes.get("IS2_BAKE_EMISSION")
        if emission is None:
            raise RuntimeError("Missing bake emission node on " + mat.name)
        if channel == "BaseColor":
            value = tuple(float(v) for v in mat["bake_basecolor"])
            color = (*value, 1.0)
        else:
            scalar = float(mat["bake_" + channel.lower()])
            color = (scalar, scalar, scalar, 1.0)
        emission.inputs["Color"].default_value = color
    deselect_all()
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.use_clear = True
    scene.render.bake.target = "IMAGE_TEXTURES"
    bpy.context.view_layer.update()
    result = bpy.ops.object.bake(type="EMIT", margin=16, use_clear=True)
    print("BAKE_RESULT", channel, result)
    if "FINISHED" not in result:
        raise RuntimeError(channel + " material-ID bake did not finish")
    save_bake_image(image, image.name.lower() + ".png")
    stats = image_rgb_stats(image)
    print("BAKE_PIXEL_STATS", image.name, stats)
    if stats[1] < 0.01:
        raise RuntimeError(channel + " material-ID atlas is empty")
    return stats

def bake_target_normal_fallback(target, image):
    print("WARNING: selected-to-active normal projection was empty; baking low-poly tangent normals as fallback")
    set_bake_image_on_materials(target, image)
    deselect_all()
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.use_clear = True
    scene.render.bake.target = "IMAGE_TEXTURES"
    result = bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", margin=16, use_clear=True)
    print("BAKE_RESULT NORMAL_FALLBACK", result)
    if "FINISHED" not in result:
        raise RuntimeError("Low-poly tangent normal fallback failed")
    save_bake_image(image, "normal.png")
    stats = image_rgb_stats(image)
    print("BAKE_PIXEL_STATS", image.name, stats)
    if stats[1] < 0.01:
        raise RuntimeError("Normal map remains empty after fallback")

def set_origin_at_world(obj, location):
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    scene.cursor.location = Vector(location)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    obj.select_set(False)

def parent_keep_world(child, parent):
    bpy.context.view_layer.update()
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world

def create_empty(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    FINAL_COLL.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.12
    obj.location = location
    if parent:
        parent_keep_world(obj, parent)
    return obj

def move_final_object(obj):
    move_to_collection(obj, FINAL_COLL)
    obj.hide_set(False)
    obj.hide_render = False

# ---- Source inventory and high-poly-only details --------------------------------
source_objects = [
    obj for obj in ASSET_OBJECTS
    if obj.type == "MESH"
    and not obj.name.startswith(("Track_run_86_links_", "Track_link_pin_caps_"))
]
for obj in ASSET_OBJECTS:
    if obj.name.startswith(("Track_run_86_links_", "Track_link_pin_caps_")):
        obj.hide_set(True)
        obj.hide_render = True
        obj["asset_role"] = "legacy_combined_track_fallback"
    elif obj.type == "MESH":
        move_to_collection(obj, HP_COLL)
        obj["asset_role"] = "high_poly_bake_source"

# Keep the source hull's welded-plate character in the bake source. These beads
# are intentionally subtle and remain non-destructive high-poly-only details.
weld_objects = []
for side in (-1, 1):
    weld_objects.append(add_weld_bead(
        "HP_Weld_Hull_Side_%s" % side,
        [
            (side * 1.205, -2.55, 1.37),
            (side * 1.205, -1.80, 1.37),
            (side * 1.205, -0.95, 1.37),
            (side * 1.205, -0.10, 1.37),
            (side * 1.205, 0.75, 1.37),
            (side * 1.205, 1.55, 1.37),
        ], PAINT
    ))
weld_objects.append(add_weld_bead(
    "HP_Weld_EngineDeck_Seam",
    [(-1.05, -1.38, 1.73), (-0.52, -1.38, 1.73), (0.0, -1.38, 1.73),
     (0.52, -1.38, 1.73), (1.05, -1.38, 1.73)], PAINT
))

# A separate high-poly track shoe is used as the bake source. The runtime track
# is not a scrolling ribbon: it is 86 individually transformable links per side.
track_hp = {}
track_lp = {}
bake_groups = sorted(set(classify_part(obj.name) for obj in source_objects))
bake_groups.extend(["TrackLink_L", "TrackLink_R"])
bake_groups = sorted(set(bake_groups))
bake_mats = {}
for source in source_objects:
    group = classify_part(source.name)
    materials = list(source.data.materials) or [PAINT]
    for source_material in materials:
        key = (group, source_material.name)
        if key not in bake_mats:
            bake_mats[key] = make_bake_material(
                "IS2_BAKE__%s__%s" % (group, source_material.name), source_material
            )
for label in ("L", "R"):
    key = ("TrackLink_" + label, TRACK.name)
    if key not in bake_mats:
        bake_mats[key] = make_bake_material(
            "IS2_BAKE__%s__%s" % key, TRACK
        )

for side, label in [(-1, "L"), (1, "R")]:
    track_hp[label] = build_track_link_template(
        side, TRACK, 5, "HP_TrackLink_" + label, HP_COLL
    )
    track_lp[label] = build_track_link_template(
        side, bake_mats[("TrackLink_" + label, TRACK.name)], 1,
        "LP_TrackLink_" + label, LP_COLL
    )

# ---- Low-poly copies and material-ID grouping -----------------------------------
group_duplicates = {}
for source in source_objects:
    group = classify_part(source.name)
    duplicate = source.copy()
    duplicate.data = source.data.copy()
    duplicate.name = "LP_SRC_" + source.name
    LP_COLL.objects.link(duplicate)
    duplicate.parent = None
    duplicate.matrix_world = source.matrix_world.copy()
    apply_modifiers(duplicate)
    source_materials = list(source.data.materials) or [PAINT]
    duplicate.data.materials.clear()
    for source_material in source_materials:
        duplicate.data.materials.append(bake_mats[(group, source_material.name)])
    group_duplicates.setdefault(group, []).append(duplicate)

group_objects = []
for group, duplicates in group_duplicates.items():
    deselect_all()
    for obj in duplicates:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = duplicates[0]
    if len(duplicates) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = "LP_" + group
    group_objects.append(joined)

group_objects.extend([track_lp["L"], track_lp["R"]])
deselect_all()
for obj in group_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = group_objects[0]
bpy.ops.object.join()
target = bpy.context.view_layer.objects.active
target.name = "LP_AtlasBakeTarget"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# One packed UV atlas for the complete animated vehicle. Every assembly receives
# a unique temporary material ID so it can be separated again after baking.
deselect_all()
target.select_set(True)
bpy.context.view_layer.objects.active = target
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(
    angle_limit=math.radians(66.0),
    island_margin=0.004,
    area_weight=0.0,
    correct_aspect=True
)
bpy.ops.uv.pack_islands(margin=0.008)
bpy.ops.object.mode_set(mode="OBJECT")
if not target.data.uv_layers:
    raise RuntimeError("UV unwrap failed: bake target has no UV layer")

# ---- PBR baking -----------------------------------------------------------------
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 16
scene.render.bake.margin = 16
scene.render.bake.use_clear = True

hp_sources = list(source_objects) + weld_objects + list(track_hp.values())
base_img = new_bake_image("IS2_BaseColor_Atlas", "sRGB")
normal_img = new_bake_image("IS2_TangentNormal_Atlas", "Non-Color")
rough_img = new_bake_image("IS2_Roughness_Atlas", "Non-Color")
metal_img = new_bake_image("IS2_Metallic_Atlas", "Non-Color")
ao_img = new_bake_image("IS2_AO_Atlas", "Non-Color")

print("ATLAS: Base Color from UV triangles and source material IDs")
base_img = rasterize_material_atlas(target, "BaseColor", os.path.join(PBR_DIR, "basecolor.png"))

# Run 79's 27-minute CPU projection returned constant X/Y channels. For
# review builds, use a deterministic micro-normal instead of a broken bake.
# The high-to-low projection remains explicitly opt-in for material R&D.
normal_source = "procedural_uv_micro_normal_review"
if os.environ.get("IS2_PROJECT_NORMALS", "0") == "1":
    print("BAKE: Tangent-space Normal (high-poly to low-poly)")
    try:
        bake_selected_to_active(target, hp_sources, normal_img, "NORMAL")
        sample = np.asarray(Image.open(normal_img.filepath_raw).convert("RGB"), dtype=np.float32)
        if max(float(sample[...,0].std()), float(sample[...,1].std())) < 0.25:
            raise RuntimeError("Projected normal has no meaningful tangent detail")
        normal_source = "high_poly_selected_to_active"
    except (RuntimeError, OSError) as exc:
        print("NORMAL_PROJECTION_REJECTED", str(exc))
if normal_source != "high_poly_selected_to_active":
    normal_img = create_procedural_normal_atlas(target, os.path.join(PBR_DIR, "normal.png"))

print("ATLAS: Roughness from UV triangles and source material IDs")
rough_img = rasterize_material_atlas(target, "Roughness", os.path.join(PBR_DIR, "roughness.png"))
print("ATLAS: Metallic from UV triangles and source material IDs")
metal_img = rasterize_material_atlas(target, "Metallic", os.path.join(PBR_DIR, "metallic.png"))

# AO is not wired into the GLB yet. Do not spend review build time on
# a CPU bake that is unused by the material; label the neutral map honestly.
ao_img = create_neutral_ao_atlas(os.path.join(PBR_DIR, "ao.png"))
ao_source = "neutral_white_review_not_wired"

# ---- Final game PBR material ------------------------------------------------------
def create_final_pbr_material():
    mat = bpy.data.materials.new("IS2_Model1944_PBR_Atlas")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Metallic"].default_value = 0.18
    bsdf.inputs["Roughness"].default_value = 0.78
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

    base = nodes.new("ShaderNodeTexImage")
    base.name = "IS2_BaseColor"
    base.image = base_img
    base.image.colorspace_settings.name = "sRGB"
    links.new(base.outputs["Color"], bsdf.inputs["Base Color"])

    rough = nodes.new("ShaderNodeTexImage")
    rough.name = "IS2_Roughness"
    rough.image = rough_img
    rough.image.colorspace_settings.name = "Non-Color"
    links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])

    metal = nodes.new("ShaderNodeTexImage")
    metal.name = "IS2_Metallic"
    metal.image = metal_img
    metal.image.colorspace_settings.name = "Non-Color"
    links.new(metal.outputs["Color"], bsdf.inputs["Metallic"])

    normal = nodes.new("ShaderNodeTexImage")
    normal.name = "IS2_TangentNormal"
    normal.image = normal_img
    normal.image.colorspace_settings.name = "Non-Color"
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.space = "TANGENT"
    normal_map.inputs["Strength"].default_value = 1.0
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

    # Keep the baked AO map packed and available for engine-specific AO wiring.
    # It is also included in the asset manifest and review package.
    return mat

final_mat = create_final_pbr_material()
for image, filename in (
    (base_img, "basecolor.png"),
    (normal_img, "normal.png"),
    (rough_img, "roughness.png"),
    (metal_img, "metallic.png"),
    (ao_img, "ao.png"),
):
    save_bake_image(image, filename)

# ---- Split atlas target back into animated assemblies ----------------------------
deselect_all()
target.select_set(True)
bpy.context.view_layer.objects.active = target
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="MATERIAL")
bpy.ops.object.mode_set(mode="OBJECT")

separated = [
    obj for obj in LP_COLL.objects
    if obj.type == "MESH" and obj.name.startswith("LP_AtlasBakeTarget")
]
if len(separated) < 5:
    raise RuntimeError("Material separation failed; expected multiple material pieces")

pieces_by_group = {}
for obj in separated:
    used = {}
    for poly in obj.data.polygons:
        used[poly.material_index] = used.get(poly.material_index, 0) + 1
    if not used:
        continue
    material_index = max(used, key=used.get)
    source_mat = obj.data.materials[material_index]
    if not source_mat or not source_mat.name.startswith("IS2_BAKE__"):
        raise RuntimeError("Cannot identify separated assembly material for " + obj.name)
    encoded = source_mat.name.split("IS2_BAKE__", 1)[1]
    group = encoded.split("__", 1)[0]
    pieces_by_group.setdefault(group, []).append(obj)

# Rejoin each assembly after the material-ID atlas has been baked. The shared
# final PBR material uses the preserved atlas UVs, so the assembly keeps all
# original sub-material colour/roughness/metallic distinctions.
parts = {}
for group, pieces in pieces_by_group.items():
    deselect_all()
    for obj in pieces:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    if len(pieces) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = "LP_" + group
    joined.data.materials.clear()
    joined.data.materials.append(final_mat)
    for poly in joined.data.polygons:
        poly.material_index = 0
    parts[group] = joined
    move_final_object(joined)

required_groups = {"Hull", "Turret", "Gun_Elevation", "Gun_Recoil", "TrackLink_L", "TrackLink_R"}
missing_groups = required_groups - set(parts)
if missing_groups:
    raise RuntimeError("Missing separated mesh groups: " + ", ".join(sorted(missing_groups)))

# ---- Runtime node hierarchy -------------------------------------------------------
# The dimensioned source script already created hidden empties with these names.
# Rename them before creating the final rig so Blender does not append ".001"
# to the production node names and break the runtime contract.
for old_obj, safe_name in (
    (source_ns.get("root"), "HP_Source_Root"),
    (source_ns.get("turret_root"), "HP_Source_Turret_Root"),
    (source_ns.get("gun_pivot"), "HP_Source_Gun_Elevation_Pivot"),
):
    if old_obj is not None and old_obj.name in bpy.data.objects:
        old_obj.name = safe_name

root = create_empty("IS2_Model1944_Root", (0.0, 0.0, 0.0))
root["variant"] = "IS-2 Model 1944 late-war sloped-glacis"
root["units"] = "meters"
root["source_forward_axis"] = "+Y"
root["gltf_up_axis"] = "+Y"
root["gltf_forward_axis"] = "-Z"
root["runtime_forward_axis"] = "+Z"
root["runtime_yaw_correction_radians"] = math.pi
root["runtime_track_side_names_swapped"] = True
root["asset_status"] = "production candidate; visual review required"
root["pbr_atlas_resolution"] = ATLAS_SIZE

hull = create_empty("Hull_Body", (0.0, 0.0, 0.0), root)
turret = create_empty("Turret_Root", (0.0, 0.0, 1.62), hull)
turret["animated_axis"] = "Blender Z yaw"
gun_elev = create_empty("Gun_Elevation_Pivot", (0.0, 1.48, 2.17), turret)
gun_elev["animated_axis"] = "Blender X pitch"
gun_recoil = create_empty("Gun_Recoil_Pivot", (0.0, 1.78, 2.17), gun_elev)
gun_recoil["animated_axis"] = "local -Y recoil"
# Named gameplay anchors: muzzle follows recoil, while the optical sight follows
# gun elevation. These are consumed by the Three.js firing/aiming adapter.
muzzle_anchor = create_empty("Muzzle", (0.0, 6.38, 2.17), gun_recoil)
sight_anchor = create_empty("Gun_Sight", (0.43, 1.645, 2.18), gun_elev)
track_roots = {
    "L": create_empty("Track_L_Root", (0.0, 0.0, 0.0), hull),
    "R": create_empty("Track_R_Root", (0.0, 0.0, 0.0), hull),
}
track_roots["L"]["track_links"] = TRACK_LINKS
track_roots["R"]["track_links"] = TRACK_LINKS

def attach_part(group, obj):
    if group == "Hull":
        location, parent = (0.0, 0.0, 0.0), hull
    elif group == "Turret":
        location, parent = (0.0, 0.0, 1.62), turret
    elif group == "Gun_Elevation":
        location, parent = (0.0, 1.48, 2.17), gun_elev
    elif group == "Gun_Recoil":
        location, parent = (0.0, 1.78, 2.17), gun_recoil
    elif group.startswith("RoadWheel_"):
        _, side, index = group.split("_")
        station_y = wheel_y[int(index) - 1]
        side_sign = -1 if side == "L" else 1
        location = (side_sign * 1.145, station_y, ROADWHEEL_Z)
        parent = create_empty(group + "_Pivot", location, hull)
        parent["animated_axis"] = "Blender X wheel rotation"
    elif group.startswith("ReturnRoller_"):
        _, side, index = group.split("_")
        side_sign = -1 if side == "L" else 1
        roller_y = (-1.48, 0.0, 1.48)[int(index) - 1]
        location = (side_sign * 1.36, roller_y, RETURN_ROLLER_Z)
        parent = create_empty(group + "_Pivot", location, hull)
        parent["animated_axis"] = "Blender X roller rotation"
    elif group.startswith("DriveSprocket_"):
        side = group.split("_")[-1]
        side_sign = -1 if side == "L" else 1
        location = (side_sign * TRACK_CENTER_X, -TRACK_HALF_STRAIGHT, TRACK_Z)
        parent = create_empty(group + "_Pivot", location, hull)
        parent["animated_axis"] = "Blender X drive rotation"
    elif group.startswith("FrontIdler_"):
        side = group.split("_")[-1]
        side_sign = -1 if side == "L" else 1
        location = (side_sign * TRACK_CENTER_X, TRACK_HALF_STRAIGHT, TRACK_Z)
        parent = create_empty(group + "_Pivot", location, hull)
        parent["animated_axis"] = "Blender X idler rotation"
    else:
        raise RuntimeError("Unknown animation group: " + group)
    set_origin_at_world(obj, location)
    parent_keep_world(obj, parent)

for group, obj in list(parts.items()):
    if group in ("TrackLink_L", "TrackLink_R"):
        continue
    attach_part(group, obj)

# Turn each baked track-link template into 86 separately named nodes per side.
for side, label in [(-1, "L"), (1, "R")]:
    group = "TrackLink_" + label
    template = parts[group]
    template_center = (side * 2.0, 0.0, -5.0)
    set_origin_at_world(template, template_center)
    template.location = (0.0, 0.0, 0.0)
    template.rotation_euler = (0.0, 0.0, 0.0)
    template.parent = None
    for index in range(TRACK_LINKS):
        distance = (index + 0.5) * TRACK_PITCH
        y, z = track_point(distance)
        y0, z0 = track_point(distance - 0.01)
        y1, z1 = track_point(distance + 0.01)
        tangent = math.atan2(z1 - z0, y1 - y0)
        link = template.copy()
        link.data = template.data
        FINAL_COLL.objects.link(link)
        link.name = "TrackLink_%s_%03d" % (label, index)
        link.location = (side * TRACK_CENTER_X, y, z)
        link.rotation_euler = (tangent, 0.0, 0.0)
        link["track_side"] = label
        link["link_index"] = index
        link["path_distance_m"] = distance
        link["animated"] = True
        parent_keep_world(link, track_roots[label])
    bpy.data.objects.remove(template, do_unlink=True)

# Ensure all final objects are visible and every exported mesh has a UV map.
for obj in FINAL_COLL.objects:
    obj.hide_set(False)
    obj.hide_render = False
    if obj.type == "MESH":
        if not obj.data.uv_layers:
            raise RuntimeError("Game mesh has no UV map: " + obj.name)
        obj["asset_lod"] = "LOD0_candidate"
        obj["material_pipeline"] = "baked_PBR_atlas"

# Hide original source rig and bake geometry in the saved authoring file.
for source in hp_sources:
    source.hide_set(True)
    source.hide_render = True
for old in (source_ns.get("root"), source_ns.get("turret_root"), source_ns.get("gun_pivot")):
    if old and old.name in bpy.data.objects:
        old.hide_set(True)
        old.hide_render = True

# ---- Geometry gate before expensive export and renders --------------------------
bpy.context.view_layer.update()
mesh_objects = [obj for obj in FINAL_COLL.objects if obj.type == "MESH"]
track_l = [obj.name for obj in mesh_objects if re.fullmatch(r"TrackLink_L_\d{3}", obj.name)]
track_r = [obj.name for obj in mesh_objects if re.fullmatch(r"TrackLink_R_\d{3}", obj.name)]
def exact_world_min_z(objects):
    values = [
        (obj.matrix_world @ Vector(vertex.co)).z
        for obj in objects
        if obj.type == "MESH"
        for vertex in obj.data.vertices
    ]
    if not values:
        raise RuntimeError("Cannot measure vertical bounds of an empty mesh group")
    return min(values)

track_link_objects = [bpy.data.objects[name] for name in track_l + track_r]
hull_mesh_objects = [obj for obj in mesh_objects if obj.parent == hull]
track_min_z = exact_world_min_z(track_link_objects)
hull_min_z = exact_world_min_z(hull_mesh_objects)
measured_clearance = hull_min_z - track_min_z
if abs(track_min_z) > 0.010:
    raise RuntimeError("Track shoes do not sit within 10 mm of the ground plane: min Z %.4f m" % track_min_z)
if abs(measured_clearance - 0.46) > 0.025:
    raise RuntimeError("Hull ground clearance mismatch: measured %.4f m, expected 0.46 m" % measured_clearance)

print("GEOMETRY_GATE", track_min_z, measured_clearance, flush=True)

# ---- Export the candidate GLB -----------------------------------------------------
os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
deselect_all()
for obj in FINAL_COLL.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(
    filepath=GLB_OUT,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_extras=True
)
print("PRODUCTION CANDIDATE EXPORTED:", GLB_OUT)

# ---- Production preview renders --------------------------------------------------
engines = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
if hasattr(scene, "eevee"):
    scene.eevee.taa_render_samples = 48
scene.render.resolution_x = 1200
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX" if "AgX" in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items.keys() else "Standard"

def add_production_light(name, location, power, size):
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = power
    light.data.shape = "DISK"
    light.data.size = size
    direction = Vector((0.0, 0.0, 1.25)) - light.location
    light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

add_production_light("Production_Key", (6.0, 7.0, 8.0), 1450, 6.0)
add_production_light("Production_Fill", (-6.0, 2.0, 5.0), 900, 5.0)
add_production_light("Production_Rim", (0.0, -7.0, 6.5), 1250, 4.0)

def render_production_view(name, location, target_point, ortho):
    bpy.ops.object.camera_add(location=location)
    camera = bpy.context.object
    camera.name = "Production_Camera_" + name
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = ortho
    camera.rotation_euler = (Vector(target_point) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    scene.render.filepath = os.path.join(PROD_DIR, name + ".png")
    bpy.ops.render.render(write_still=True)

render_production_view("01_front_three_quarter", (8.5, 9.0, 5.8), (0.0, 0.4, 1.25), 11.0)
render_production_view("02_left_side", (-12.0, 1.45, 1.50), (0.0, 1.45, 1.50), 12.0)
render_production_view("03_front", (0.0, 11.0, 3.0), (0.0, 0.0, 1.25), 8.0)
render_production_view("04_rear", (0.0, -11.0, 3.0), (0.0, 0.0, 1.25), 8.0)
render_production_view("05_top", (0.0, 1.45, 13.0), (0.0, 1.45, 0.7), 15.0)

# ---- Manifest and in-process GLB structure validation ----------------------------
mesh_objects = [obj for obj in FINAL_COLL.objects if obj.type == "MESH"]
unique_meshes = len(set(obj.data.as_pointer() for obj in mesh_objects))
triangles = sum(max(0, len(poly.vertices) - 2) for obj in mesh_objects for poly in obj.data.polygons)
node_names = sorted(obj.name for obj in FINAL_COLL.objects)
track_l = [name for name in node_names if re.match(r"TrackLink_L_\d{3}$", name)]
track_r = [name for name in node_names if re.match(r"TrackLink_R_\d{3}$", name)]
if len(track_l) != TRACK_LINKS or len(track_r) != TRACK_LINKS:
    raise RuntimeError("Track node count mismatch: L=%d R=%d" % (len(track_l), len(track_r)))


manifest = {
    "vehicle": "IS-2 Model 1944",
    "variant": "late-war sloped-glacis",
    "status": "production_candidate_unreviewed",
    "source_script": "tools/blender/is2_model1944_blockout.py",
    "workflow": [
        "dimensioned source geometry",
        "high-poly-only weld and track-link details",
        "low-poly duplicate with reduced bevel segments",
        "packed multi-assembly UV atlas",
        "UV-triangle material-ID rasterization for Base Color, Roughness and Metallic",
        "selected-to-active high-poly Tangent Normal bake with procedural UV micro-normal fallback",
        "Ambient Occlusion bake with neutral-white fallback when empty",
        "shared PBR atlas material",
        "articulated GLB export"
    ],
    "atlas_resolution": ATLAS_SIZE,
    "normal_source": normal_source,
    "ao_source": ao_source,
    "axis_convention": {
        "blender_source_forward": "+Y",
        "gltf_up": "+Y",
        "gltf_forward": "-Z",
        "runtime_forward": "+Z",
        "runtime_yaw_correction_radians": math.pi,
        "runtime_track_side_names_swapped": True
    },
    "texture_maps": {
        "basecolor": "pbr/basecolor.png",
        "normal": "pbr/normal.png",
        "roughness": "pbr/roughness.png",
        "metallic": "pbr/metallic.png",
        "ao": "pbr/ao.png"
    },
    "track_links_per_side": TRACK_LINKS,
    "track_pitch_m": TRACK_PITCH,
    "track_loop_length_m": TRACK_LINKS * TRACK_PITCH,
    "track_ground_z_m": track_min_z,
    "hull_min_z_m": hull_min_z,
    "hull_ground_clearance_m": measured_clearance,
    "track_links_total": len(track_l) + len(track_r),
    "mesh_object_nodes": len(mesh_objects),
    "unique_mesh_datablocks": unique_meshes,
    "triangle_count": triangles,
    "node_count": len(FINAL_COLL.objects),
    "required_nodes": [
        "IS2_Model1944_Root", "Hull_Body", "Turret_Root",
        "Gun_Elevation_Pivot", "Gun_Recoil_Pivot", "Muzzle", "Gun_Sight",
        "Track_L_Root", "Track_R_Root"
    ],
    "visual_review_required": True,
    "runtime_integration_required": True
}
with open(MANIFEST_OUT, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2)

# Validate the actual exported GLB JSON rather than trusting Blender's exit code.
import struct
with open(GLB_OUT, "rb") as handle:
    magic, version, total_length = struct.unpack("<4sII", handle.read(12))
    if magic != b"glTF" or version != 2:
        raise RuntimeError("Invalid GLB header")
    chunk_length, chunk_type = struct.unpack("<II", handle.read(8))
    if chunk_type != 0x4E4F534A:
        raise RuntimeError("GLB JSON chunk missing")
    gltf = json.loads(handle.read(chunk_length).decode("utf-8"))
gltf_names = [node.get("name", "") for node in gltf.get("nodes", [])]
for required in manifest["required_nodes"]:
    if required not in gltf_names:
        raise RuntimeError("Required GLB node missing: " + required)
if sum(1 for name in gltf_names if re.match(r"TrackLink_L_\d{3}$", name)) != TRACK_LINKS:
    raise RuntimeError("GLB left track links are incomplete")
if sum(1 for name in gltf_names if re.match(r"TrackLink_R_\d{3}$", name)) != TRACK_LINKS:
    raise RuntimeError("GLB right track links are incomplete")
if not gltf.get("meshes") or not gltf.get("materials"):
    raise RuntimeError("GLB is missing meshes or materials")

bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
print("PRODUCTION BLEND SAVED:", BLEND_OUT)
print("PRODUCTION MANIFEST:", MANIFEST_OUT)
print(json.dumps(manifest, indent=2))
print("IS-2 PRODUCTION PIPELINE COMPLETE — candidate only; no game integration or deployment.")
