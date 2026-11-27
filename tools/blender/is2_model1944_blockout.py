# IS-2 Model 1944: dimensioned Blender blockout / Level-2 asset foundation.
# Run: blender --background --python tools/blender/is2_model1944_blockout.py
# Outputs: public/models/is2_model1944_blockout.glb and artifacts/is2-model1944/*.png
# Blender axes: X=width, Y=length (bow +Y), Z=up. Runtime adapter converts +Y to Three.js +Z.
# This is a reviewable first asset pass; validate silhouette against the linked museum
# photographs before treating this as final historical geometry.

import bpy
import math
import os
from mathutils import Vector

ROOT_DIR = os.path.abspath(".")
GLB_OUT = os.path.join(ROOT_DIR, "public", "models", "is2_model1944_blockout.glb")
ART_DIR = os.path.join(ROOT_DIR, "artifacts", "is2-model1944")
os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
os.makedirs(ART_DIR, exist_ok=True)

# Clean scene and establish metric units.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0

def make_mat(name, color, metallic=0.15, roughness=0.75):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1.0)
    m.use_nodes = True
    bs = m.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = (*color, 1.0)
    bs.inputs["Metallic"].default_value = metallic
    bs.inputs["Roughness"].default_value = roughness
    # Subtle cast/rolled-steel microtexture. Keep it restrained so the model
    # reads as painted armor in-game rather than noisy concrete.
    if "olive" in name.lower() or "steel" in name.lower():
        nodes = m.node_tree.nodes
        links = m.node_tree.links
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 48.0 if "cast" in name.lower() else 72.0
        noise.inputs["Detail"].default_value = 3.0
        noise.inputs["Roughness"].default_value = 0.68
        ramp = nodes.new("ShaderNodeValToRGB")
        base = tuple(color)
        ramp.color_ramp.elements[0].position = 0.18
        ramp.color_ramp.elements[0].color = (base[0]*0.82, base[1]*0.82, base[2]*0.82, 1.0)
        ramp.color_ramp.elements[1].position = 0.82
        ramp.color_ramp.elements[1].color = (min(1,base[0]*1.10), min(1,base[1]*1.10), min(1,base[2]*1.10), 1.0)
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.035 if "cast" in name.lower() else 0.025
        bump.inputs["Distance"].default_value = 0.008
        links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], bs.inputs["Base Color"])
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bs.inputs["Normal"])
    return m

PAINT = make_mat("Soviet_olive_painted_steel", (0.19, 0.215, 0.12), 0.22, 0.78)
CAST = make_mat("Cast_armor_olive", (0.17, 0.195, 0.105), 0.18, 0.86)
STEEL = make_mat("Worn_steel", (0.22, 0.215, 0.19), 0.72, 0.57)
TRACK = make_mat("Manganese_steel_track", (0.095, 0.10, 0.09), 0.68, 0.76)
RUBBER = make_mat("Rubber", (0.028, 0.03, 0.027), 0.02, 0.94)
DARK = make_mat("Optics_apertures_and_recesses", (0.008, 0.012, 0.014), 0.16, 0.28)
GLASS = make_mat("Optical_glass", (0.035, 0.075, 0.085), 0.72, 0.17)

ASSET_OBJECTS = []

def register(obj):
    ASSET_OBJECTS.append(obj)
    return obj

def apply_scale(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)

def add_bevel(obj, width=0.025, segments=3):
    if width > 0:
        mod = obj.modifiers.new("Machined_edge_radii", "BEVEL")
        mod.width = width
        mod.segments = segments
        mod.limit_method = "ANGLE"
        pass
    return obj

def box(name, loc, dims, mat, bevel_width=0.02, rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    if rotation is not None:
        obj.rotation_euler = rotation
    apply_scale(obj)
    obj.data.materials.append(mat)
    add_bevel(obj, bevel_width, 3)
    return register(obj)

def cylinder(name, loc, radius, depth, mat, axis="X", vertices=48, bevel_width=0.008):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    if axis == "X":
        obj.rotation_euler[1] = math.pi / 2
    elif axis == "Y":
        obj.rotation_euler[0] = math.pi / 2
    apply_scale(obj)
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    add_bevel(obj, bevel_width, 2)
    return register(obj)

def torus(name, loc, major, minor, mat, axis="X"):
    bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=10,
                                     major_radius=major, minor_radius=minor, location=loc)
    obj = bpy.context.object
    obj.name = name
    if axis == "X":
        obj.rotation_euler[1] = math.pi / 2
    elif axis == "Y":
        obj.rotation_euler[0] = math.pi / 2
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return register(obj)

def mesh_object(name, verts, faces, mat, smooth=False):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if smooth:
        for p in mesh.polygons:
            p.use_smooth = True
    return register(obj)

def add_uv_sphere(name, loc, scale, mat, segments=48, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    apply_scale(obj)
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return register(obj)

# Hull: six-sided transverse sections create the broad trapezoidal welded hull.
# Length is 6.77 m; upper glacis and lower nose are separate plates for readable
# plate breaks. Cross-section top width is slightly narrower than the lower side.
stations = [
    (-3.385, 2.38, 0.48, 1.43),
    (-2.95,  2.48, 0.46, 1.58),
    (-2.10,  2.52, 0.46, 1.62),
    ( 1.45,  2.52, 0.46, 1.62),
    ( 2.10,  2.50, 0.48, 1.54),
    ( 2.78,  2.43, 0.54, 1.12),
    ( 3.385, 2.34, 0.62, 0.88),
]
verts = []
ring_n = 6
for y, width, bottom, top in stations:
    wb = width * 0.96
    wt = width * 0.90
    zshoulder = bottom + 0.22
    verts.extend([
        (-wb/2, y, bottom), (wb/2, y, bottom),
        (width/2, y, zshoulder), (wt/2, y, top),
        (-wt/2, y, top), (-width/2, y, zshoulder),
    ])
faces = [tuple(range(ring_n-1, -1, -1))]
for j in range(len(stations)-1):
    for i in range(ring_n):
        a = j*ring_n+i
        b = j*ring_n+(i+1)%ring_n
        faces.append((a, b, b+ring_n, a+ring_n))
faces.append(tuple((len(stations)-1)*ring_n+i for i in range(ring_n)))
mesh_object("Hull_welded_trapezoidal_shell", verts, faces, PAINT)

# Upper 120 mm glacis: 60 degrees from vertical (=30 degrees from horizontal).
box("Upper_glacis_120mm_60deg", (0, 2.40, 1.34), (2.78, 1.48, 0.14),
    PAINT, 0.035, (math.radians(-30), 0, 0))
# Lower front plate is steeper and visibly distinct from the upper glacis.
box("Lower_nose_plate", (0, 3.20, 0.75), (2.72, 0.22, 0.50),
    PAINT, 0.025, (math.radians(-60), 0, 0))
# Engine deck and rear plate details.
box("Engine_deck_main", (0, -2.20, 1.64), (2.62, 1.52, 0.13), PAINT, 0.035)
box("Rear_hull_plate", (0, -3.34, 1.02), (2.70, 0.12, 0.92), PAINT, 0.025)
for side in (-1, 1):
    x = side * 0.76
    box("Engine_grille_recess_%s" % side, (x, -2.18, 1.715), (0.78, 1.10, 0.025), DARK, 0.01)
    for i in range(11):
        box("Engine_grille_louver_%s_%02d" % (side, i),
            (x, -2.68 + i*0.10, 1.745), (0.70, 0.025, 0.035), STEEL, 0.006)
    # Rear exhaust outlets and covers.
    cylinder("Rear_exhaust_%s" % side, (side*0.88, -3.43, 1.12), 0.105, 0.20, STEEL, "Y", 32)
    cylinder("Rear_exhaust_dark_%s" % side, (side*0.88, -3.545, 1.12), 0.070, 0.012, DARK, "Y", 24, 0.0)

# Front driver's hatch, rectangular vision port and roof periscopes.
box("Driver_hatch", (-0.43, 2.02, 1.67), (0.58, 0.63, 0.075), CAST, 0.045)
box("Driver_vision_port_frame", (-0.43, 3.05, 1.16), (0.34, 0.10, 0.20), CAST, 0.025)
box("Driver_vision_slit", (-0.43, 3.108, 1.17), (0.22, 0.018, 0.045), DARK, 0.006)
for x in (-0.79, -0.23):
    box("Driver_roof_periscope_%s" % x, (x, 1.77, 1.70), (0.13, 0.16, 0.13), CAST, 0.018)
    box("Driver_periscope_glass_%s" % x, (x, 1.80, 1.77), (0.075, 0.07, 0.012), GLASS, 0.004)

# Front DT bow ball mount, tow eyes, fenders and headlight guards.
add_uv_sphere("Bow_DT_ball_mount", (0.62, 3.16, 1.13), (0.14, 0.10, 0.13), CAST)
cylinder("Bow_DT_barrel", (0.62, 3.27, 1.13), 0.022, 0.30, STEEL, "Y", 16)
for side in (-1, 1):
    x = side * 1.35
    box("Full_length_fender_%s" % side, (x, 0.0, 1.20), (0.30, 5.70, 0.07), PAINT, 0.025)
    cylinder("Headlight_body_%s" % side, (side*1.18, 2.90, 1.48), 0.095, 0.13, STEEL, "X", 32)
    cylinder("Headlight_lens_%s" % side, (side*1.18, 2.90, 1.48), 0.068, 0.014, GLASS, "X", 32, 0.0)
    # Protective headlight hoops and front towing shackles.
    torus("Headlight_guard_%s" % side, (side*1.18, 2.90, 1.48), 0.12, 0.012, STEEL, "X")
    torus("Front_tow_eye_%s" % side, (side*1.12, 3.34, 0.69), 0.105, 0.025, STEEL, "X")
    box("Tow_eye_mount_%s" % side, (side*1.12, 3.27, 0.68), (0.30, 0.20, 0.12), PAINT, 0.025)

# Cast turret: a rounded superelliptic loft, with a slight left/right asymmetry
# and the Model 1944 enlarged/bulged forward casting. This replaces the crude
# polygonal turret silhouette in the original Three.js-only asset.
turret_sections = [
    # z, x-radius, y-radius, center-x, center-y, exponent.
    # The 1944 casting has a broad lower cheek, a distinctly drawn-in roof,
    # a fuller rear bustle and a steeper front face. Avoid a uniform capsule.
    (1.62, 1.18, 1.25,  0.00, 0.02, 3.0),
    (1.78, 1.30, 1.38,  0.00, 0.02, 3.2),
    (2.04, 1.31, 1.34, -0.01, 0.00, 3.0),
    (2.24, 1.28, 1.25, -0.03, -0.02, 2.8),
    (2.40, 1.21, 1.14, -0.06, -0.05, 2.6),
    (2.50, 1.12, 1.05, -0.08, -0.07, 2.4),
    (2.55, 1.04, 0.98, -0.08, -0.07, 2.2),
]
N = 64
tv = []
for z, rx, ry, cx, cy, expn in turret_sections:
    for i in range(N):
        a = 2*math.pi*i/N
        ca, sa = math.cos(a), math.sin(a)
        x = cx + rx * math.copysign(abs(ca)**(2/expn), ca)
        y = cy + ry * math.copysign(abs(sa)**(2/expn), sa)
        # Build the characteristic forward cheek swell only in the lower
        # casting. The front face then draws inward toward the roof instead
        # of remaining a symmetric rounded capsule.
        if sa > 0.55:
            cheek = max(0.0, 1.0 - abs(z - 1.92) / 0.42)
            x += 0.075 * cheek * (sa-0.55)/0.45 * (1 if ca >= 0 else -1)
        # Rear bustle remains fuller than the forward roof transition.
        if sa < -0.55:
            y -= 0.045 * max(0.0, 1.0 - abs(z - 2.02) / 0.48)
        tv.append((x, y, z))
tf = []
for j in range(len(turret_sections)-1):
    for i in range(N):
        a=j*N+i; b=j*N+(i+1)%N
        tf.append((a,b,b+N,a+N))
tf.append(tuple((len(turret_sections)-1)*N+i for i in range(N)))
turret_body = mesh_object("Turret_cast_1944_loft", tv, tf, CAST, True)

# D-25T mantlet: flattened, broad cast shield with a sloping lower edge.
# The asymmetry and raised shoulders keep it from reading as a spherical knob.
mantlet = add_uv_sphere("D25T_cast_mantlet", (0.0, 1.31, 2.13), (0.82, 0.235, 0.32), CAST)
mantlet.rotation_euler[0] = math.radians(-7)
cylinder("Main_gun_recess", (0.0, 1.625, 2.17), 0.19, 0.025, DARK, "Y", 40, 0.0)
torus("Main_gun_mantlet_collar", (0.0, 1.64, 2.17), 0.19, 0.035, STEEL, "Y")
cylinder("Coaxial_DT_aperture", (-0.43, 1.62, 2.11), 0.055, 0.03, DARK, "Y", 24, 0.0)
cylinder("Coaxial_DT_barrel_stub", (-0.43, 1.70, 2.11), 0.025, 0.18, STEEL, "Y", 16)
cylinder("Telescope_sight_aperture", (0.43, 1.62, 2.18), 0.045, 0.03, DARK, "Y", 24, 0.0)
cylinder("Telescope_sight_glass", (0.43, 1.645, 2.18), 0.028, 0.012, GLASS, "Y", 20, 0.0)

# Elevation pivot and stepped D-25T barrel. The pivot is independent so the game
# can animate elevation without moving the mantlet or turret shell.
gun_pivot = bpy.data.objects.new("Gun_Elevation_Pivot", None)
bpy.context.collection.objects.link(gun_pivot)
gun_pivot.location = (0.0, 1.48, 2.17)
barrel = cylinder("D25T_barrel_main", (0.0, 3.77, 2.17), 0.112, 4.58, STEEL, "Y", 48, 0.012)
breech_collar = cylinder("D25T_barrel_breech_collar", (0.0, 1.78, 2.17), 0.155, 0.38, STEEL, "Y", 40)
barrel_world = barrel.matrix_world.copy()
barrel.parent = gun_pivot
barrel.matrix_world = barrel_world
collar_world = breech_collar.matrix_world.copy()
breech_collar.parent = gun_pivot
breech_collar.matrix_world = collar_world
# Muzzle brake with two lateral ports, not a plain exposed cylinder.
brake = cylinder("D25T_double_baffle_muzzle_brake", (0.0, 6.19, 2.17), 0.165, 0.36, STEEL, "Y", 48, 0.018)
brake_world = brake.matrix_world.copy()
brake.parent = gun_pivot
brake.matrix_world = brake_world
for side in (-1, 1):
    box("Muzzle_brake_side_port_%s" % side, (side*0.145, 6.19, 2.17),
        (0.035, 0.19, 0.085), DARK, 0.012)

# Cupola shifted left, characteristic of the revised 1944 turret roof.
cylinder("Commander_cupola_base", (-0.36, -0.52, 2.60), 0.37, 0.18, CAST, "Z", 48)
cylinder("Commander_cupola_ring", (-0.36, -0.52, 2.71), 0.34, 0.07, STEEL, "Z", 48)
cylinder("Commander_cupola_lid", (-0.36, -0.52, 2.76), 0.31, 0.06, PAINT, "Z", 48)
# Periscope blocks around cupola.
for i in range(6):
    a = i*math.tau/6
    x = -0.36 + math.cos(a)*0.285
    y = -0.52 + math.sin(a)*0.285
    box("Cupola_periscope_%02d" % i, (x, y, 2.77), (0.10, 0.055, 0.045), DARK, 0.008)
# DShK anti-aircraft machine gun and ring/pedestal.
cylinder("DShK_pedestal", (-0.36, -0.52, 2.87), 0.055, 0.22, STEEL, "Z", 20)
box("DShK_receiver", (-0.36, -0.15, 2.94), (0.12, 0.58, 0.13), STEEL, 0.025)
cylinder("DShK_barrel", (-0.36, 0.22, 2.94), 0.025, 0.36, STEEL, "Y", 20)
box("DShK_stock", (-0.36, -0.48, 2.94), (0.12, 0.22, 0.10), PAINT, 0.025)

# Loader hatch on the opposite/rear roof area.
cylinder("Loader_hatch_ring", (0.56, -0.62, 2.62), 0.29, 0.055, CAST, "Z", 40)
cylinder("Loader_hatch_lid", (0.56, -0.62, 2.66), 0.25, 0.045, PAINT, "Z", 40)
box("Loader_hatch_handle", (0.56, -0.62, 2.70), (0.22, 0.035, 0.035), STEEL, 0.012)

# Rear turret DT ball mount on the right half of the bustle (rear faces -Y).
# The 1944 wartime turret retains the rear DT position; do not substitute the
# post-1954 IS-2M ventilator fitting.
add_uv_sphere("Turret_rear_DT_ball_mount", (0.57, -1.12, 2.02), (0.135, 0.095, 0.12), CAST)
cylinder("Turret_rear_DT_aperture", (0.57, -1.215, 2.02), 0.041, 0.03, DARK, "Y", 20, 0.0)
cylinder("Turret_rear_DT_barrel", (0.57, -1.30, 2.02), 0.022, 0.17, STEEL, "Y", 16)

# Road wheels: six twin stations per side, 550 mm diameter. Each station is a
# pair of separate cast wheels with dished faces, rims and central hubs.
wheel_y = [-2.10, -1.26, -0.42, 0.42, 1.26, 2.10]
for side in (-1, 1):
    for i, y in enumerate(wheel_y):
        for pair, xabs in enumerate((1.04, 1.25)):
            x = side*xabs
            cylinder("Roadwheel_%s_%02d_%d" % (side, i+1, pair+1),
                     (x, y, 0.70), 0.275, 0.155, PAINT, "X", 48)
            torus("Roadwheel_rim_%s_%02d_%d" % (side, i+1, pair+1),
                  (x + side*0.073, y, 0.70), 0.235, 0.018, STEEL, "X")
            cylinder("Roadwheel_hub_%s_%02d_%d" % (side, i+1, pair+1),
                     (x + side*0.09, y, 0.70), 0.095, 0.045, CAST, "X", 32)
            cylinder("Roadwheel_hub_cap_%s_%02d_%d" % (side, i+1, pair+1),
                     (x + side*0.116, y, 0.70), 0.052, 0.022, STEEL, "X", 24)
            # Six shallow circular reliefs on the outer face give the cast wheel
            # its characteristic scalloped/star-like visual rhythm.
            for k in range(6):
                a = k*math.tau/6
                yy = y + math.cos(a)*0.17
                zz = 0.70 + math.sin(a)*0.17
                cylinder("Roadwheel_relief_%s_%02d_%d_%d" % (side, i+1, pair+1, k),
                         (x + side*0.083, yy, zz), 0.022, 0.012, DARK, "X", 12, 0.0)
    # Three return rollers per side.
    for i, y in enumerate((-1.48, 0.0, 1.48)):
        cylinder("Return_roller_%s_%d" % (side, i+1),
                 (side*1.36, y, 1.075), 0.09, 0.18, STEEL, "X", 32)

# Rear drive sprockets: twin removable 14-tooth rims. Front idlers are plain.
for side in (-1, 1):
    sx = side*1.21
    cylinder("Drive_sprocket_core_%s" % side, (sx, -2.72, 0.70), 0.32, 0.52, STEEL, "X", 48)
    for rim_index, xoff in enumerate((-0.19, 0.19)):
        cylinder("Drive_rim_%s_%d" % (side, rim_index), (sx+xoff, -2.72, 0.70),
                 0.34, 0.095, CAST, "X", 48)
        for tooth in range(14):
            a = tooth*math.tau/14
            yy = -2.72 + math.cos(a)*0.355
            zz = 0.70 + math.sin(a)*0.355
            box("Drive_tooth_%s_%d_%02d" % (side, rim_index, tooth),
                (sx+xoff, yy, zz), (0.105, 0.12, 0.10), STEEL, 0.012,
                (a, 0, 0))
    cylinder("Front_idler_%s" % side, (sx, 2.72, 0.70), 0.275, 0.42, PAINT, "X", 48)
    cylinder("Front_idler_hub_%s" % side, (sx+side*0.23, 2.72, 0.70), 0.11, 0.05, STEEL, "X", 32)

# Continuous stadium path sampled into 86 individual track-link shapes per side.
# Each link is a separate named mesh object; same dimensions and material.
TRACK_LINKS = 86
TRACK_WIDTH = 0.65
TRACK_CENTER_X = 1.21
TRACK_Z = 0.70
TRACK_RADIUS = 0.405
TRACK_HALF_STRAIGHT = 2.72
TRACK_PITCH = (2*TRACK_HALF_STRAIGHT + 2*math.pi*TRACK_RADIUS)/TRACK_LINKS

def track_point(distance):
    straight = 2*TRACK_HALF_STRAIGHT
    arc = math.pi*TRACK_RADIUS
    total = 2*straight + 2*arc
    s = distance % total
    # Top run: rear to front.
    if s < straight:
        return (-TRACK_HALF_STRAIGHT+s, TRACK_Z+TRACK_RADIUS)
    s -= straight
    if s < arc:
        theta = math.pi/2 - s/TRACK_RADIUS
        return (TRACK_HALF_STRAIGHT+TRACK_RADIUS*math.cos(theta),
                TRACK_Z+TRACK_RADIUS*math.sin(theta))
    s -= arc
    if s < straight:
        return (TRACK_HALF_STRAIGHT-s, TRACK_Z-TRACK_RADIUS)
    s -= straight
    theta = -math.pi/2 - s/TRACK_RADIUS
    return (-TRACK_HALF_STRAIGHT+TRACK_RADIUS*math.cos(theta),
            TRACK_Z+TRACK_RADIUS*math.sin(theta))

def append_box(vs, fs, center, dims, angle):
    cx, cy, cz = center
    dx, dy, dz = [d/2 for d in dims]
    local = [(-dx,-dy,-dz),(dx,-dy,-dz),(dx,dy,-dz),(-dx,dy,-dz),
             (-dx,-dy,dz),(dx,-dy,dz),(dx,dy,dz),(-dx,dy,dz)]
    base = len(vs)
    ca, sa = math.cos(angle), math.sin(angle)
    for x,y,z in local:
        # Rotate local track-plane Y/Z around X by the path tangent.
        yy = y*ca-z*sa
        zz = y*sa+z*ca
        vs.append((cx+x, cy+yy, cz+zz))
    fs.extend([tuple(base+i for i in face) for face in
               ((0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7))])

for side in (-1, 1):
    tv, tf = [], []
    for i in range(TRACK_LINKS):
        s = (i+0.5)*TRACK_PITCH
        y,z = track_point(s)
        y0,z0 = track_point(s-0.01)
        y1,z1 = track_point(s+0.01)
        angle = math.atan2(z1-z0, y1-y0)
        # Link shoe plus raised transverse grouser; each is geometrically distinct.
        append_box(tv, tf, (side*TRACK_CENTER_X, y, z),
                   (TRACK_WIDTH, TRACK_PITCH*0.91, 0.075), angle)
        append_box(tv, tf, (side*TRACK_CENTER_X, y, z+0.047),
                   (TRACK_WIDTH*0.94, 0.035, 0.025), angle)
        # Inner guide horn points toward the vehicle centerline.
        append_box(tv, tf, (side*(TRACK_CENTER_X-0.22), y, z-0.055),
                   (0.12, TRACK_PITCH*0.38, 0.10), angle)
    mesh_object("Track_run_86_links_%s" % ("L" if side < 0 else "R"), tv, tf, TRACK)

# Four rear auxiliary fuel tanks, two per side, on rear-side brackets.
for side in (-1, 1):
    for i, y in enumerate((-2.42, -1.42)):
        x = side*1.48
        cylinder("Auxiliary_fuel_tank_%s_%d" % (side, i+1), (x, y, 1.48),
                 0.19, 0.86, PAINT, "Y", 40)
        for end in (-0.38, 0.38):
            torus("Fuel_tank_end_rim_%s_%d_%s" % (side, i+1, end),
                  (x, y+end, 1.48), 0.178, 0.014, STEEL, "Y")
        for band_y in (-0.23, 0.23):
            torus("Fuel_tank_retaining_band_%s_%d_%s" % (side, i+1, band_y),
                  (x, y+band_y, 1.48), 0.194, 0.018, STEEL, "Y")
        box("Fuel_tank_mount_%s_%d" % (side, i+1), (x-side*0.18, y, 1.25),
            (0.12, 0.56, 0.12), STEEL, 0.018)

# Tie down / towing details and spare equipment. These are restrained to avoid
# cluttering the silhouette or inventing fittings not confirmed by references.
for side in (-1, 1):
    for y in (-2.85, 2.70):
        torus("Side_tow_eye_%s_%s" % (side, y), (side*1.48, y, 0.83),
              0.09, 0.018, STEEL, "X")
    # Rear fender support / brackets.
    for y in (-2.85, -2.35, -1.85):
        box("Rear_fender_bracket_%s_%s" % (side, y), (side*1.46, y, 1.05),
            (0.10, 0.09, 0.20), STEEL, 0.012)

# Parent hierarchy: preserve world transforms and keep the gun pivot separately
# addressable for runtime elevation. Turret meshes share a Turret_Root parent.
turret_root = bpy.data.objects.new("Turret_Root", None)
bpy.context.collection.objects.link(turret_root)
turret_names = ("Turret_cast_", "D25T_cast_mantlet", "Main_gun_", "Main_gun_mantlet",
                "Coaxial_", "Telescope_", "Commander_", "Cupola_", "DShK_",
                "Loader_hatch", "Turret_rear_DT_")
for obj in list(ASSET_OBJECTS):
    if obj.name.startswith(turret_names) or obj == gun_pivot:
        world = obj.matrix_world.copy()
        obj.parent = turret_root
        obj.matrix_world = world
# Keep gun pivot as a child of turret root and barrel assembly under the pivot.
for obj in (barrel, breech_collar, brake):
    world = obj.matrix_world.copy()
    obj.parent = gun_pivot
    obj.matrix_world = world
world = gun_pivot.matrix_world.copy()
gun_pivot.parent = turret_root
gun_pivot.matrix_world = world

root = bpy.data.objects.new("IS2_Model1944_Root", None)
bpy.context.collection.objects.link(root)
for obj in list(ASSET_OBJECTS) + [turret_root]:
    if obj.parent is None:
        world = obj.matrix_world.copy()
        obj.parent = root
        obj.matrix_world = world
root["variant"] = "IS-2 Model 1944 (late-war sloped-glacis)"
root["units"] = "meters"
root["source_forward_axis"] = "+Y"
root["runtime_forward_axis"] = "+Z"
root["road_wheel_stations_per_side"] = 6
root["track_links_per_side"] = TRACK_LINKS
root["track_width_m"] = TRACK_WIDTH
root["status"] = "FIRST BLENDER ASSET PASS — requires visual review"

# Export only vehicle meshes/empties; render-only ground/cameras/lights are added after.
bpy.ops.object.select_all(action="DESELECT")
for obj in list(ASSET_OBJECTS) + [root, turret_root, gun_pivot]:
    obj.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format="GLB",
                          use_selection=True, export_apply=True,
                          export_texcoords=True, export_normals=True,
                          export_materials="EXPORT")
print("GLB exported:", GLB_OUT)

# Optional fast iteration mode for Windows workstations; full five-view mode
# remains the default for CI and historical silhouette validation.
FAST_PREVIEW = os.environ.get("IS2_FAST_PREVIEW", "0") == "1"

# Studio preview scene.
floor_mat = make_mat("Preview_floor", (0.055, 0.06, 0.065), 0.0, 0.94)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0.16))
floor = bpy.context.object
floor.name = "Preview_only_ground"
floor.data.materials.append(floor_mat)
scene.world.color = (0.12, 0.12, 0.12)
# EEVEE identifier changed across Blender releases; select an available one.
engines = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else ("BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "CYCLES")
if hasattr(scene, "eevee"):
    scene.eevee.taa_render_samples = 64
scene.render.resolution_x = 720 if FAST_PREVIEW else 1200
scene.render.resolution_y = 540 if FAST_PREVIEW else 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX" if "AgX" in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items.keys() else "Standard"

world = bpy.data.worlds.new("Studio_world") if not bpy.data.worlds else bpy.data.worlds[0]
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.12, 0.14, 0.17, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45

def area_light(name, loc, energy, size):
    bpy.ops.object.light_add(type="AREA", location=loc)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    direction = Vector((0, 0, 1.1)) - light.location
    light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

area_light("Key_softbox", (5, 4, 8), 1250, 6)
area_light("Fill_softbox", (-5, 1, 5), 800, 5)
area_light("Rear_rim", (0, -6, 6), 950, 4)

def render_view(name, loc, target, ortho=9):
    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.object
    cam.name = "Preview_camera_" + name
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = ortho
    cam.rotation_euler = (Vector(target)-cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = os.path.join(ART_DIR, name + ".png")
    bpy.ops.render.render(write_still=True)

render_view("01_front_three_quarter", (8.5, 9.0, 5.8), (0, 0.4, 1.25), 11.0)
if not FAST_PREVIEW:
    render_view("02_left_side", (10.5, 0.0, 3.0), (0, 0.0, 1.25), 10.8)
    render_view("03_front", (0.0, 11.0, 3.0), (0, 0.0, 1.25), 8.0)
    render_view("04_rear", (0.0, -11.0, 3.0), (0, 0.0, 1.25), 8.0)
    render_view("05_top", (0.0, 0.0, 12.0), (0, 0.0, 0.7), 8.0)

# Save an editable Blender scene for subsequent sculpting/refinement.
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ART_DIR, "is2_model1944_first_pass.blend"))
print("Saved Blender source and five-view review renders in:", ART_DIR)
