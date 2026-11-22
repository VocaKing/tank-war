#!/usr/bin/env python3
"""Build a modular, real-scale IS-2 late-1944 ChKZ asset.

Run:
  blender --background --factory-startup --python tools/blender/build_is2_model.py -- --output-dir build/is2

Blender authoring axes: X=width, +Y=front, Z=up. One Blender unit = one metre.
The script is intentionally deterministic; edit this source, not generated GLB files.
"""
import argparse
import math
import os
import sys
from mathutils import Vector

import bpy

PI = math.pi
DEG = PI / 180.0
WHEEL_R = 0.275
TRACK_WIDTH = 0.650
ROAD_WHEELS = 6
TRACK_LINKS = 86
INCLUDE_DSHK = os.environ.get("IS2_INCLUDE_DSHK", "0") == "1"


def args_after_separator():
    argv = sys.argv
    if "--" not in argv:
        return []
    return argv[argv.index("--") + 1:]


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="build/is2")
    return parser.parse_args(args_after_separator())


def ensure_collection(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def move_to_collection(obj, coll):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


def parent_keep_world(child, parent):
    matrix = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = matrix


def empty(name, location=(0, 0, 0), parent=None, coll=None):
    obj = bpy.data.objects.new(name, None)
    (coll or ensure_collection("IS2_ASSET")).objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.18
    obj.location = location
    if parent:
        parent_keep_world(obj, parent)
    return obj


def material(name, color, metallic=0.0, roughness=0.7, noise_scale=70.0, bump_strength=0.08):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if noise_scale and bump_strength:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = noise_scale
        noise.inputs["Detail"].default_value = 2.0
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = bump_strength
        bump.inputs["Distance"].default_value = 0.018
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def apply_bevel(obj, width=0.02, segments=3):
    if width <= 0:
        return obj
    mod = obj.modifiers.new("Machined edge radii", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    normal = obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
    normal.keep_sharp = True
    return obj


def add_box(name, location, dimensions, mat, coll, bevel=0.02, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        obj.data.materials.append(mat)
    move_to_collection(obj, coll)
    apply_bevel(obj, bevel)
    return obj


def add_cylinder(name, location, radius, depth, mat, coll, axis="Z", vertices=48, bevel=0.006):
    rotation = {"X": (0, PI / 2, 0), "Y": (PI / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    if mat:
        obj.data.materials.append(mat)
    move_to_collection(obj, coll)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    apply_bevel(obj, bevel, 2)
    return obj


def add_sphere(name, location, scale, mat, coll, segments=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        obj.data.materials.append(mat)
    move_to_collection(obj, coll)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def add_torus(name, location, major_radius, minor_radius, mat, coll, axis="Z"):
    rotation = {"X": (0, PI / 2, 0), "Y": (PI / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=10,
                                     major_radius=major_radius, minor_radius=minor_radius,
                                     location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    if mat:
        obj.data.materials.append(mat)
    move_to_collection(obj, coll)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def add_curve(name, points, radius, mat, coll, cyclic=False):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 12
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (co[0], co[1], co[2], 1.0)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    coll.objects.link(obj)
    if mat:
        curve.materials.append(mat)
    return obj


def extruded_yz_profile(name, profile, half_width, mat, coll):
    n = len(profile)
    verts = [(-half_width, y, z) for y, z in profile] + [(half_width, y, z) for y, z in profile]
    faces = [tuple(range(n)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, j + n, i + n))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    apply_bevel(obj, 0.035, 3)
    return obj


def turret_loft(name, base_poly, base_z, height, mat, coll):
    # Asymmetric cast turret: left wall nearly vertical, right wall slopes inward.
    # Front face draws back toward the roof; rear bustle stays broad.
    rings = [
        (0.00, 1.000, 1.000),
        (0.08, 1.000, 1.000),
        (0.28, 1.000, 0.985),
        (0.52, 1.000, 0.965),
        (0.78, 1.000, 0.940),
        (1.00, 1.000, 0.925),
    ]
    n = len(base_poly)
    verts = []
    for v, left_scale, rear_scale in rings:
        z = base_z + height * v
        rise = height * v
        for x, y in base_poly:
            if x < 0:
                xx = x * left_scale
            else:
                xx = x - math.tan(20 * DEG) * rise
            if y > 0:
                yy = y - math.tan(25 * DEG) * rise
            else:
                yy = y + math.tan(4 * DEG) * rise * rear_scale
            verts.append((xx, yy, z))
    faces = []
    for ring in range(len(rings) - 1):
        for i in range(n):
            a = ring * n + i
            b = ring * n + (i + 1) % n
            c = (ring + 1) * n + (i + 1) % n
            d = (ring + 1) * n + i
            faces.append((a, b, c, d))
    faces.append(tuple(range(n - 1, -1, -1)))
    top = (len(rings) - 1) * n
    faces.append(tuple(top + i for i in range(n)))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    apply_bevel(obj, 0.035, 4)
    return obj


def append_oriented_box(verts, faces, center, axis_x, axis_y, axis_z, dims):
    c = Vector(center)
    ax, ay, az = Vector(axis_x), Vector(axis_y), Vector(axis_z)
    dx, dy, dz = dims
    signs = [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
             (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]
    base = len(verts)
    for sx, sy, sz in signs:
        p = c + ax * sx * dx * 0.5 + ay * sy * dy * 0.5 + az * sz * dz * 0.5
        verts.append(tuple(p))
    faces.extend([
        (base + 0, base + 3, base + 2, base + 1),
        (base + 4, base + 5, base + 6, base + 7),
        (base + 0, base + 1, base + 5, base + 4),
        (base + 1, base + 2, base + 6, base + 5),
        (base + 2, base + 3, base + 7, base + 6),
        (base + 3, base + 0, base + 4, base + 7),
    ])


def track_path(front_y=2.72, rear_y=-2.72, center_z=0.76, radius=0.34, samples=1200):
    path = []
    half = samples // 4
    # Top run: rear to front.
    for i in range(half):
        t = i / half
        path.append(Vector((0, rear_y + (front_y - rear_y) * t, center_z + radius)))
    # Front semicircle: top to bottom around the forward idler.
    for i in range(half):
        a = PI / 2 - PI * (i / half)
        path.append(Vector((0, front_y + radius * math.cos(a), center_z + radius * math.sin(a))))
    # Bottom run: front to rear.
    for i in range(half):
        t = i / half
        path.append(Vector((0, front_y - (front_y - rear_y) * t, center_z - radius)))
    # Rear semicircle: bottom to top around the drive sprocket.
    for i in range(half):
        a = -PI / 2 - PI * (i / half)
        path.append(Vector((0, rear_y + radius * math.cos(a), center_z + radius * math.sin(a))))
    lengths = [0.0]
    for i in range(len(path)):
        lengths.append(lengths[-1] + (path[(i + 1) % len(path)] - path[i]).length)
    total = lengths[-1]
    centers = []
    pitch = total / TRACK_LINKS
    for k in range(TRACK_LINKS):
        target = (k + 0.5) * pitch
        idx = 0
        while idx < len(path) - 1 and lengths[idx + 1] < target:
            idx += 1
        span = max(1e-8, lengths[idx + 1] - lengths[idx])
        f = (target - lengths[idx]) / span
        p = path[idx].lerp(path[(idx + 1) % len(path)], f)
        before = path[(idx - 2) % len(path)]
        after = path[(idx + 2) % len(path)]
        tangent = (after - before).normalized()
        centers.append((p, tangent))
    return centers, pitch, total


def make_track(name, side, mat, coll):
    centers, pitch, total = track_path()
    verts, faces = [], []
    x_center = side * 1.20
    x_axis = Vector((1, 0, 0))
    for p, tangent in centers:
        tangent = Vector((0, tangent.y, tangent.z)).normalized()
        normal = Vector((0, -tangent.z, tangent.y)).normalized()
        c = Vector((x_center, p.y, p.z))
        # One stamped single-ridge shoe, a raised grouser and an inward guide horn.
        append_oriented_box(verts, faces, c, x_axis, tangent, normal,
                            (TRACK_WIDTH, pitch * 0.88, 0.078))
        append_oriented_box(verts, faces, c + normal * 0.052, x_axis, tangent, normal,
                            (TRACK_WIDTH * 0.92, pitch * 0.18, 0.030))
        append_oriented_box(verts, faces, c - x_axis * side * 0.145 + normal * 0.02,
                            x_axis, tangent, normal, (0.12, pitch * 0.34, 0.105))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    return obj, pitch, total


def create_wheel(name, side, y, z, x, steel, dark, coll, parent):
    pivot = empty(name + "_PIVOT", (x, y, z), parent, coll)
    disc = add_cylinder(name + "_CAST_DISC", (x, y, z), WHEEL_R, 0.145, steel, coll, "X", 48, 0.008)
    inner = add_cylinder(name + "_INNER_RIM", (x + side * 0.055, y, z), 0.205, 0.035, dark, coll, "X", 40, 0.004)
    face_x = x + side * 0.086
    hub = add_cylinder(name + "_HUB", (face_x, y, z), 0.092, 0.045, steel, coll, "X", 32, 0.004)
    ring = add_torus(name + "_HUB_RING", (face_x + side * 0.026, y, z), 0.112, 0.012, dark, coll, "X")
    parts = [disc, inner, hub, ring]
    for i in range(10):
        a = 2 * PI * i / 10
        bolt = add_cylinder(name + "_BOLT_%02d" % i,
                            (face_x + side * 0.052, y + math.cos(a) * 0.158,
                             z + math.sin(a) * 0.158),
                            0.012, 0.018, dark, coll, "X", 12, 0.001)
        parts.append(bolt)
    for obj in parts:
        parent_keep_world(obj, pivot)
    return pivot


def create_idler(name, side, y, z, x, steel, dark, coll, parent):
    pivot = empty(name + "_PIVOT", (x, y, z), parent, coll)
    disc = add_cylinder(name + "_DISC", (x, y, z), WHEEL_R, 0.24, steel, coll, "X", 56, 0.008)
    hub = add_cylinder(name + "_HUB", (x + side * 0.14, y, z), 0.11, 0.045, dark, coll, "X")
    ring = add_torus(name + "_RIM", (x + side * 0.13, y, z), 0.205, 0.018, dark, coll, "X")
    for obj in (disc, hub, ring):
        parent_keep_world(obj, pivot)
    return pivot


def create_sprocket(name, side, y, z, x, steel, dark, coll, parent):
    pivot = empty(name + "_PIVOT", (x, y, z), parent, coll)
    drum = add_cylinder(name + "_DRUM", (x, y, z), 0.30, 0.26, dark, coll, "X", 56, 0.006)
    parts = [drum]
    for rim_side in (-1, 1):
        rim_x = x + rim_side * 0.105
        parts.append(add_cylinder(name + "_RIM_%s" % rim_side, (rim_x, y, z), 0.34, 0.075, steel, coll, "X", 56, 0.004))
        for i in range(14):
            a = 2 * PI * i / 14
            tooth = add_box(name + "_TOOTH_%s_%02d" % (rim_side, i),
                            (rim_x, y + math.cos(a) * 0.355, z + math.sin(a) * 0.355),
                            (0.075, 0.135, 0.105), steel, coll, 0.008,
                            rotation=(a, 0, 0))
            parts.append(tooth)
    parts.append(add_cylinder(name + "_HUB", (x + side * 0.17, y, z), 0.12, 0.06, dark, coll, "X"))
    for obj in parts:
        parent_keep_world(obj, pivot)
    return pivot


def add_ring_of_bolts(name, center, radius, count, axis, mat, coll, bolt_radius=0.012, face_offset=0.02):
    cx, cy, cz = center
    result = []
    for i in range(count):
        a = 2 * PI * i / count
        if axis == "X":
            loc = (cx + face_offset, cy + math.cos(a) * radius, cz + math.sin(a) * radius)
        else:
            loc = (cx + math.cos(a) * radius, cy + math.sin(a) * radius, cz + face_offset)
        result.append(add_cylinder(name + "_%02d" % i, loc, bolt_radius, 0.018, mat, coll, axis, 12, 0.001))
    return result


def create_dshk(turret_root, steel, dark, coll):
    # Optional late-1944/1945 commander-cupola AA mount; not part of every 1944 vehicle.
    base = add_cylinder("DSHK_PINTLE_BASE", (-0.55, -0.68, 2.79), 0.16, 0.08, steel, coll)
    ring = add_torus("DSHK_RING", (-0.55, -0.68, 2.84), 0.14, 0.025, dark, coll)
    barrel = add_cylinder("DSHK_BARREL", (-0.55, -0.35, 3.02), 0.028, 0.62, dark, coll, "Y")
    for obj in (base, ring, barrel):
        parent_keep_world(obj, turret_root)


def build_model():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)

    asset = ensure_collection("IS2_ASSET")
    hull_coll = ensure_collection("HULL_STATIC")
    turret_coll = ensure_collection("TURRET_STATIC")
    running_coll = ensure_collection("RUNNING_GEAR")
    detail_coll = ensure_collection("EXTERNAL_DETAILS")
    root = empty("IS2_ROOT", (0, 0, 0), None, asset)
    hull_root = empty("HULL_ROOT", (0, 0, 0), root, asset)
    turret_root = empty("TURRET_ROOT", (0, 0, 1.92), root, asset)
    gun_pivot = empty("GUN_PIVOT", (0, 1.16, 2.28), turret_root, asset)
    track_l_root = empty("TRACK_L_ROOT", (-1.20, 0, 0), root, asset)
    track_r_root = empty("TRACK_R_ROOT", (1.20, 0, 0), root, asset)

    olive = material("Soviet olive drab - painted steel", (0.105, 0.145, 0.065), 0.22, 0.72, 78, 0.11)
    cast = material("Cast armor - olive", (0.12, 0.16, 0.078), 0.18, 0.78, 42, 0.16)
    dark = material("Dark steel and rubber", (0.035, 0.043, 0.035), 0.38, 0.82, 90, 0.08)
    steel = material("Worn steel", (0.19, 0.20, 0.17), 0.72, 0.48, 65, 0.07)
    rubber = material("Track contact rubber", (0.025, 0.029, 0.026), 0.0, 0.9, 60, 0.05)
    glass = material("Optics - dark glass", (0.012, 0.035, 0.028), 0.35, 0.18, 0, 0)
    lens = material("Headlamp glass", (0.42, 0.47, 0.39), 0.25, 0.2, 0, 0)

    # Main hull side silhouette, extruded to real width. Front slope is about 60 deg from vertical.
    profile = [
        (-3.385, 0.48), (-3.385, 1.58), (-3.02, 1.88),
        (1.27, 1.88), (3.385, 0.66), (3.385, 0.48)
    ]
    hull = extruded_yz_profile("HULL_CAST_AND_ROLLED_SHELL", profile, 1.405, cast, hull_coll)
    parent_keep_world(hull, hull_root)
    lower = add_box("LOWER_HULL", (0, -0.08, 0.89), (2.76, 6.25, 0.82), olive, hull_coll, 0.08)
    parent_keep_world(lower, hull_root)
    belly = add_box("BELLY_PLATE", (0, -0.12, 0.47), (2.65, 5.95, 0.16), dark, hull_coll, 0.025)
    parent_keep_world(belly, hull_root)

    # Upper deck and cast nose transitions.
    deck = add_box("ENGINE_AND_FIGHTING_COMPARTMENT_DECK", (0, -0.87, 1.83), (2.74, 4.28, 0.16), olive, hull_coll, 0.04)
    parent_keep_world(deck, hull_root)
    nose = add_box("CAST_NOSE_EDGE", (0, 3.27, 0.72), (2.70, 0.25, 0.22), cast, hull_coll, 0.04)
    parent_keep_world(nose, hull_root)

    # Driver vision slit lies on the late sloped nose, not in a large stepped-hull hatch.
    glacis_angle = math.radians(150)
    vision = add_box("DRIVER_DIRECT_VISION_PORT", (0, 2.05, 1.28), (0.31, 0.10, 0.035),
                     dark, detail_coll, 0.006, rotation=(glacis_angle, 0, 0))
    parent_keep_world(vision, hull_root)
    for x in (-0.58, 0.58):
        episcope = add_box("DRIVER_ROOF_EPISCOPE", (x, 1.12, 1.94), (0.13, 0.12, 0.08),
                           cast, detail_coll, 0.012)
        slit = add_box("DRIVER_ROOF_EPISCOPE_GLASS", (x, 1.17, 1.985), (0.075, 0.018, 0.014),
                       glass, detail_coll, 0.003)
        parent_keep_world(episcope, hull_root)
        parent_keep_world(slit, hull_root)

    # Turret ring and asymmetrical cast turret.
    ring = add_cylinder("TURRET_RING", (0, -0.02, 1.94), 1.19, 0.14, dark, hull_coll, "Z", 72, 0.01)
    parent_keep_world(ring, hull_root)
    turret_poly = [
        (-1.18, 1.30), (-0.82, 1.38), (0.55, 1.36), (1.12, 1.08),
        (1.30, 0.66), (1.28, -0.92), (0.96, -1.38), (0.05, -1.43),
        (-0.92, -1.30), (-1.28, -0.78), (-1.30, 0.52)
    ]
    turret = turret_loft("TURRET_CAST_BODY", turret_poly, 1.98, 0.70, cast, turret_coll)
    parent_keep_world(turret, turret_root)

    # Mantlet: broad cast 1944 shield, separate from the turret casting.
    mantlet = add_sphere("D25T_WIDE_CAST_MANTLET", (0, 1.15, 2.31), (0.98, 0.30, 0.36), cast, turret_coll, 48, 24)
    parent_keep_world(mantlet, turret_root)
    gun_breech = add_cylinder("D25T_BREECH", (0, 1.25, 2.30), 0.19, 0.48, dark, turret_coll, "Y", 48, 0.012)
    parent_keep_world(gun_breech, gun_pivot)
    barrel = add_cylinder("D25T_BARREL", (0, 3.79, 2.30), 0.082, 4.72, olive, turret_coll, "Y", 48, 0.008)
    parent_keep_world(barrel, gun_pivot)
    barrel_collar = add_cylinder("D25T_BARREL_ROOT_COLLAR", (0, 1.60, 2.30), 0.118, 0.28, cast, turret_coll, "Y", 48, 0.008)
    parent_keep_world(barrel_collar, gun_pivot)
    muzzle = add_cylinder("D25T_MUZZLE_BRAKE", (0, 6.235, 2.30), 0.135, 0.42, cast, turret_coll, "Y", 48, 0.012)
    parent_keep_world(muzzle, gun_pivot)
    for side in (-1, 1):
        port = add_box("MUZZLE_BRAKE_SIDE_PORT", (side * 0.122, 6.235, 2.30), (0.025, 0.25, 0.10),
                       dark, turret_coll, 0.008)
        parent_keep_world(port, gun_pivot)

    # Coaxial DT and telescopic-sight ports; separate inserts, not painted circles.
    coax = add_cylinder("COAXIAL_DT_PORT", (0.47, 1.43, 2.30), 0.043, 0.07, dark, turret_coll, "Y", 32, 0.004)
    sight = add_cylinder("TELESCOPIC_SIGHT_PORT", (-0.48, 1.42, 2.34), 0.050, 0.07, glass, turret_coll, "Y", 32, 0.004)
    parent_keep_world(coax, turret_root)
    parent_keep_world(sight, turret_root)

    # Commander cupola on the left rear; loader's hatch to the right.
    cupola = add_cylinder("COMMANDER_CUPOLA", (-0.57, -0.70, 2.63), 0.405, 0.24, cast, turret_coll, "Z", 56, 0.018)
    cupola_ring = add_torus("COMMANDER_CUPOLA_RING", (-0.57, -0.70, 2.75), 0.36, 0.025, dark, turret_coll)
    cupola_hatch = add_cylinder("COMMANDER_HATCH_LID", (-0.57, -0.70, 2.7525), 0.31, 0.045, olive, turret_coll)
    parent_keep_world(cupola, turret_root)
    parent_keep_world(cupola_ring, turret_root)
    parent_keep_world(cupola_hatch, turret_root)
    for i in range(6):
        a = 2 * PI * i / 6
        slot = add_box("CUPOLA_VISION_BLOCK", (-0.57 + math.cos(a) * 0.365,
                        -0.70 + math.sin(a) * 0.365, 2.67), (0.085, 0.025, 0.045),
                       glass, turret_coll, 0.004, rotation=(0, 0, a))
        parent_keep_world(slot, turret_root)

    loader_hatch = add_cylinder("LOADER_HATCH", (0.57, -0.78, 2.70), 0.32, 0.055, olive, turret_coll)
    loader_ring = add_torus("LOADER_HATCH_RIM", (0.57, -0.78, 2.72), 0.31, 0.018, dark, turret_coll)
    parent_keep_world(loader_hatch, turret_root)
    parent_keep_world(loader_ring, turret_root)

    ventilator = add_cylinder("TURRET_VENTILATOR_BASE", (0.58, -0.10, 2.70), 0.19, 0.08, dark, turret_coll)
    vent_cap = add_sphere("TURRET_VENTILATOR_CAP", (0.58, -0.10, 2.76), (0.20, 0.20, 0.07), cast, turret_coll)
    parent_keep_world(ventilator, turret_root)
    parent_keep_world(vent_cap, turret_root)

    gunner_periscope = add_box("GUNNER_PERISCOPE_HOUSING", (-0.40, 0.72, 2.70), (0.16, 0.22, 0.12),
                               cast, turret_coll, 0.018)
    gunner_glass = add_box("GUNNER_PERISCOPE_GLASS", (-0.40, 0.80, 2.765), (0.09, 0.025, 0.018),
                           glass, turret_coll, 0.003)
    loader_periscope = add_box("LOADER_PERISCOPE_HOUSING", (0.88, -0.08, 2.69), (0.14, 0.20, 0.10),
                               cast, turret_coll, 0.016)
    for obj in (gunner_periscope, gunner_glass, loader_periscope):
        parent_keep_world(obj, turret_root)

    # Turret handrails and lifting eyes.
    for side in (-1, 1):
        rail_points = [
            (side * 1.22, 0.52, 2.42),
            (side * 1.24, 0.10, 2.46),
            (side * 1.24, -0.55, 2.48),
            (side * 1.18, -1.05, 2.43)
        ]
        rail = add_curve("TURRET_SIDE_HANDRAIL", rail_points, 0.018, steel, turret_coll)
        parent_keep_world(rail, turret_root)
        hook = add_torus("TURRET_LIFTING_EYE", (side * 0.92, -1.18, 2.54), 0.075, 0.018, steel, turret_coll, "X")
        parent_keep_world(hook, turret_root)

    if INCLUDE_DSHK:
        create_dshk(turret_root, steel, dark, turret_coll)

    # Running gear: 6 paired 550 mm road wheels per side, three return rollers,
    # front idler, rear 14-tooth twin-rim drive sprocket.
    wheel_ys = [2.10, 1.25, 0.40, -0.45, -1.30, -2.15]
    for side, track_root in ((-1, track_l_root), (1, track_r_root)):
        for i, y in enumerate(wheel_ys, 1):
            for pair, xoff in enumerate((-0.115, 0.115), 1):
                x = side * (1.20 + xoff)
                create_wheel("ROAD_WHEEL_%s_%02d_%02d" % ("L" if side < 0 else "R", i, pair),
                             side, y, 0.76, x, steel, dark, running_coll, track_root)
        for i, y in enumerate((1.60, 0.0, -1.60), 1):
            roller = add_cylinder("RETURN_ROLLER_%s_%02d" % ("L" if side < 0 else "R", i),
                                  (side * 1.20, y, 1.13), 0.13, 0.20, dark, running_coll, "X", 40, 0.006)
            parent_keep_world(roller, track_root)
        idler = create_idler("FRONT_IDLER_%s" % ("L" if side < 0 else "R"), side, 2.72, 0.76,
                             side * 1.20, steel, dark, running_coll, track_root)
        sprocket = create_sprocket("REAR_DRIVE_SPROCKET_%s" % ("L" if side < 0 else "R"),
                                   side, -2.72, 0.76, side * 1.20, steel, dark, running_coll, track_root)
        track, pitch, loop_length = make_track("TRACK_LINKS_%s_86" % ("L" if side < 0 else "R"),
                                                side, rubber, running_coll)
        parent_keep_world(track, track_root)
        track["link_count"] = TRACK_LINKS
        track["track_width_m"] = TRACK_WIDTH
        track["link_pitch_m"] = pitch
        idler["wheel_diameter_m"] = WHEEL_R * 2
        sprocket["rim_tooth_count"] = 14

    # Fenders over the track run; thin plates with separate brackets.
    for side in (-1, 1):
        fender = add_box("FENDER_%s" % ("L" if side < 0 else "R"),
                         (side * 1.36, -0.05, 1.43), (0.34, 5.85, 0.075),
                         olive, hull_coll, 0.018)
        parent_keep_world(fender, hull_root)
        for y in (-2.50, -1.45, -0.40, 0.65, 1.70, 2.55):
            bracket = add_box("FENDER_BRACKET", (side * 1.28, y, 1.28),
                              (0.10, 0.12, 0.32), dark, detail_coll, 0.012)
            parent_keep_world(bracket, hull_root)

    # Four external rear auxiliary fuel tanks, two on each rear quarter.
    for side in (-1, 1):
        for i, y in enumerate((-2.72, -1.82), 1):
            tank = add_cylinder("AUX_FUEL_TANK_%s_%02d" % ("L" if side < 0 else "R", i),
                                (side * 1.20, y, 1.99), 0.18, 0.78, olive, detail_coll, "Y", 48, 0.012)
            parent_keep_world(tank, hull_root)
            for dy in (-0.30, 0.30):
                band = add_torus("AUX_TANK_RETAINING_BAND",
                                 (side * 1.20, y + dy, 1.99), 0.18, 0.014, steel, detail_coll, "Y")
                parent_keep_world(band, hull_root)
            cap = add_cylinder("AUX_TANK_FILLER_CAP", (side * 1.20, y + 0.22, 2.17),
                               0.045, 0.035, dark, detail_coll, "Z", 24, 0.003)
            parent_keep_world(cap, hull_root)

    # Engine deck grilles, access panels and rear exhaust outlets.
    for x in (-0.82, 0.82):
        for i in range(7):
            slat = add_box("ENGINE_DECK_GRILLE_SLAT", (x, -1.28 + i * 0.12, 1.925),
                           (0.48, 0.035, 0.025), dark, detail_coll, 0.004)
            parent_keep_world(slat, hull_root)
        hatch = add_box("ENGINE_DECK_ACCESS_PANEL", (x, -2.38, 1.94),
                        (0.60, 0.72, 0.055), olive, hull_coll, 0.018)
        parent_keep_world(hatch, hull_root)
        exhaust = add_cylinder("REAR_EXHAUST", (x, -3.28, 1.48), 0.12, 0.35, dark, detail_coll, "Y", 40, 0.01)
        parent_keep_world(exhaust, hull_root)
        exhaust_tip = add_cylinder("REAR_EXHAUST_TIP", (x, -3.46, 1.48), 0.13, 0.06, steel, detail_coll, "Y", 40, 0.005)
        parent_keep_world(exhaust_tip, hull_root)

    # Guarded headlights on the upper front corners.
    for side in (-1, 1):
        lamp = add_cylinder("GUARDED_HEADLIGHT", (side * 1.08, 2.43, 1.34), 0.105, 0.12, dark, detail_coll, "Y", 40, 0.008)
        lens_obj = add_cylinder("HEADLIGHT_LENS", (side * 1.08, 2.50, 1.34), 0.078, 0.018, lens, detail_coll, "Y", 32, 0.003)
        guard = add_torus("HEADLIGHT_GUARD", (side * 1.08, 2.51, 1.34), 0.105, 0.018, steel, detail_coll, "Y")
        for obj in (lamp, lens_obj, guard):
            parent_keep_world(obj, hull_root)

    # Bow DT mount: a small fixed port in the front hull; no unsupported rear turret MG.
    bow_port = add_cylinder("BOW_DT_PORT", (0.55, 2.70, 1.12), 0.065, 0.08, dark, detail_coll, "Y", 32, 0.004)
    parent_keep_world(bow_port, hull_root)

    # Tow hooks, tow cable, tools and spare track shoes.
    for side in (-1, 1):
        hook = add_torus("FRONT_TOW_EYE", (side * 1.05, 3.10, 0.64), 0.13, 0.035, steel, detail_coll, "X")
        rear_hook = add_torus("REAR_TOW_EYE", (side * 1.05, -3.38, 0.70), 0.13, 0.035, steel, detail_coll, "X")
        parent_keep_world(hook, hull_root)
        parent_keep_world(rear_hook, hull_root)
        cable = add_curve("SIDE_TOW_CABLE",
                          [(side * 1.43, 1.85, 1.10), (side * 1.47, 0.75, 1.08),
                           (side * 1.47, -0.65, 1.08), (side * 1.43, -2.10, 1.12)],
                          0.022, dark, detail_coll)
        parent_keep_world(cable, hull_root)

    # Compact tool boxes and track-link stowage on rear/side hull areas.
    for side in (-1, 1):
        box_obj = add_box("SIDE_TOOL_BOX", (side * 1.40, -0.95, 1.62), (0.10, 0.62, 0.28),
                          olive, detail_coll, 0.025)
        parent_keep_world(box_obj, hull_root)
        for i in range(3):
            spare = add_box("SPARE_TRACK_LINK", (side * 1.43, 0.25 + i * 0.18, 1.61),
                            (0.08, 0.15, 0.12), dark, detail_coll, 0.008)
            parent_keep_world(spare, hull_root)

    # Raise the hull/turret above the running gear to preserve the published ground clearance.
    # The track contact plane is z=0.42 m; hull bottom then sits at 0.86 m (0.44 m clearance).
    hull_root.location.z += 0.38
    turret_root.location.z += 0.38

    # Asset metadata used by the integration and audit scripts.
    root["vehicle"] = "IS-2"
    root["variant"] = "Late-1944 ChKZ production configuration"
    root["display_name"] = "IS-2 Model 1944"
    root["units"] = "metres"
    root["hull_length_m"] = 6.77
    root["overall_length_m"] = 9.83
    root["overall_width_m"] = 3.07
    root["overall_height_m"] = 2.735
    root["road_wheel_diameter_m"] = 0.55
    root["road_wheel_stations_per_side"] = ROAD_WHEELS
    root["track_links_per_side"] = TRACK_LINKS
    root["track_width_m"] = TRACK_WIDTH
    root["drive_sprocket_teeth"] = 14
    root["auxiliary_fuel_tanks"] = 4
    root["dshk_option_included"] = INCLUDE_DSHK
    root["rear_turret_dt_included"] = False

    # Parenting static groups after construction, keeping their world transforms.
    for obj in list(hull_coll.objects):
        if obj != hull_root and obj.parent is None:
            parent_keep_world(obj, hull_root)
    for obj in list(turret_coll.objects):
        if obj != turret_root and obj.parent is None:
            parent_keep_world(obj, turret_root)
    return root


def create_render_rig(out_dir):
    rig = ensure_collection("RENDER_RIG")
    floor_mat = material("Preview floor", (0.055, 0.065, 0.06), 0.0, 0.95, 0, 0)
    floor = add_box("PREVIEW_GROUND", (0, 0, 0.32), (30, 30, 0.15), floor_mat, rig, 0.02)
    # Workbench render uses studio lighting and material colors; cameras are orthographic.
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "BOTH"
    scene.display.shading.curvature_ridge_factor = 1.25
    scene.display.shading.curvature_valley_factor = 1.0
    scene.display.shading.background_type = "WORLD"
    scene.display.shading.background_color = (0.025, 0.03, 0.027)
    scene.render.image_settings.file_format = "PNG"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    target = Vector((0, 0.35, 1.78))
    views = {
        "front": (Vector((0, 12, 2.4)), 4.8),
        "front3q": (Vector((9.5, 10.5, 7.0)), 11.8),
        "left": (Vector((-12, 0, 2.8)), 11.8),
        "right": (Vector((12, 0, 2.8)), 11.8),
        "rear": (Vector((0, -12, 2.6)), 4.8),
        "top": (Vector((0, 0, 14)), 11.8),
    }
    for name, (position, scale) in views.items():
        cam_data = bpy.data.cameras.new("CAM_" + name)
        cam = bpy.data.objects.new("CAM_" + name, cam_data)
        rig.objects.link(cam)
        cam.location = position
        direction = target - position
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = scale
        scene.camera = cam
        scene.render.filepath = os.path.join(out_dir, name + ".png")
        bpy.ops.render.render(write_still=True)
    return floor


def main():
    args = parse_args()
    out_dir = os.path.abspath(args.output_dir)
    os.makedirs(out_dir, exist_ok=True)
    root = build_model()

    # Blender ships the glTF 2.0 exporter as an add-on; explicitly enable it in factory-startup CI.
    try:
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    except Exception as exc:
        print("GLTF_ADDON_ENABLE_NOTE", str(exc))

    # Export only the vehicle asset; preview cameras/floor are added afterward.
    bpy.ops.object.select_all(action="DESELECT")
    asset_objects = [obj for obj in bpy.context.scene.objects
                     if obj.name != "IS2_ROOT" and obj.type in {"MESH", "CURVE", "EMPTY"}]
    for obj in asset_objects:
        obj.select_set(True)
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    glb_path = os.path.join(out_dir, "is2-model1944.glb")
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_normals=True,
                              export_texcoords=True, export_materials="EXPORT",
                              export_cameras=False, export_lights=False)

    # Save editable native scene, including a render rig and six orthographic review views.
    create_render_rig(out_dir)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "is2-model1944.blend"))
    print("IS2_ASSET_REPORT", {
        "variant": "late-1944 ChKZ",
        "hull_length_m": 6.77,
        "overall_length_m": 9.83,
        "overall_width_m": 3.07,
        "overall_height_m": 2.735,
        "road_wheel_stations_per_side": ROAD_WHEELS,
        "road_wheel_diameter_m": 0.55,
        "track_links_per_side": TRACK_LINKS,
        "track_width_m": TRACK_WIDTH,
        "drive_sprocket_teeth": 14,
        "auxiliary_fuel_tanks": 4,
        "dshk_option_included": INCLUDE_DSHK,
        "glb": glb_path,
    })


if __name__ == "__main__":
    main()
