# Blender background script: IS-2 Model 1944 proportion blockout.
# Run: blender -b --python tools/blender/is2_model1944_blockout.py
# Output: public/models/is2_model1944_blockout.glb
#
# This is a dimensioned first-pass blockout, not a final historical mesh.
# Refine against the research/orthographic references before replacing the
# existing Three.js model. Blender axes: X=width, Y=length (bow +Y), Z=up.

import bpy
import math
import os
from mathutils import Vector

OUT = os.path.abspath("public/models/is2_model1944_blockout.glb")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# Clean scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials):
    pass

def material(name, color, metallic=0.15, roughness=0.72):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1.0)
    m.use_nodes = True
    bs = m.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = (*color, 1.0)
    bs.inputs["Metallic"].default_value = metallic
    bs.inputs["Roughness"].default_value = roughness
    return m

PAINT = material("Soviet_olive_painted_steel", (0.19, 0.22, 0.12), 0.25, 0.78)
CAST = material("Cast_armor_olive", (0.17, 0.20, 0.11), 0.22, 0.84)
STEEL = material("Worn_steel", (0.20, 0.20, 0.18), 0.72, 0.55)
RUBBER = material("Track_and_rubber", (0.035, 0.038, 0.034), 0.05, 0.94)
DARK = material("Optics_and_apertures", (0.012, 0.018, 0.02), 0.18, 0.24)

def assign(obj, mat):
    obj.data.materials.append(mat)
    return obj

def bevel(obj, width=0.04, segments=3):
    mod = obj.modifiers.new("Small_edge_radii", "BEVEL")
    mod.width = width
    mod.segments = segments
    obj.modifiers.new("Weighted_corner_normals", "WEIGHTED_NORMAL")
    return obj

def cube(name, loc, scale, mat, bevel_width=0.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(o, mat)
    if bevel_width:
        bevel(o, bevel_width)
    return o

def cylinder(name, loc, radius, depth, mat, axis='X', vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    o = bpy.context.object
    o.name = name
    if axis == 'X':
        o.rotation_euler[1] = math.pi / 2
    elif axis == 'Y':
        o.rotation_euler[0] = math.pi / 2
    assign(o, mat)
    bevel(o, 0.012, 2)
    return o

def mesh_obj(name, verts, faces, mat):
    me = bpy.data.meshes.new(name + "_Mesh")
    me.from_pydata(verts, [], faces)
    me.materials.append(mat)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob

def bevelled_hull_side():
    # Longitudinal side profile: rear -Y, bow +Y. Approximate Model 1944
    # sloped nose; this blockout deliberately keeps major plates separate.
    profile = [
        (-3.38, 0.48), (-3.20, 1.25), (-2.55, 1.60),
        (1.55, 1.60), (2.65, 1.60), (3.385, 0.88),
        (3.15, 0.48)
    ]
    verts = []
    for x in (-1.34, 1.34):
        verts.extend([(x, y, z) for y, z in profile])
    n = len(profile)
    faces = [tuple(range(n)), tuple(range(n, 2*n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n+j, n+i))
    return mesh_obj("Hull_Main_Blockout", verts, faces, PAINT)

# Hull shell and lower hull
hull = bevelled_hull_side()
cube("Lower_hull", (0, -0.02, 0.79), (2.72, 5.95, 0.88), PAINT, 0.10)
# Nose/glacis top surface: approximate 60-degree-from-vertical plate
glacis = cube("Upper_glacis_60deg", (0, 2.66, 1.31), (2.70, 1.12, 0.20), PAINT, 0.035)
glacis.rotation_euler[0] = math.radians(-30)

# Rear deck and engine access panels
cube("Engine_deck", (0, -2.15, 1.62), (2.55, 1.55, 0.14), PAINT, 0.045)
for side in (-1, 1):
    cube("Rear_grille_%s" % side, (side*0.77, -2.13, 1.715), (0.76, 1.12, 0.025), DARK, 0.01)
    for i in range(9):
        cube("Grille_louver_%s_%02d" % (side, i),
             (side*0.77, -2.63 + i*0.125, 1.74), (0.69, 0.025, 0.035), STEEL, 0.006)

# Turret base is a distinct object, with a broad asymmetric polygonal plan.
# Bow faces +Y. The asymmetry is a key Model 1944 recognition feature.
outline = [
    (-1.24, -1.05), (-1.22, 0.80), (-0.92, 1.22),
    (0.72, 1.18), (1.18, 0.82), (1.28, -0.62),
    (0.78, -1.18), (-0.65, -1.22)
]
rings = [(0.0, 1.0), (0.20, 1.0), (0.62, 0.94), (0.82, 0.86)]
verts = []
for zrel, scale in rings:
    for x, y in outline:
        # Near-vertical left wall, distinctly sloped right wall.
        sx = scale if x < 0 else 1.0 - (1.0-scale)*0.78
        verts.append((x*sx, y*scale, 1.62 + zrel))
n = len(outline)
faces = []
for r in range(len(rings)-1):
    for i in range(n):
        a = r*n+i; b = r*n+(i+1)%n
        faces.append((a, b, b+n, a+n))
faces.append(tuple(range((len(rings)-1)*n, len(rings)*n)))
turret = mesh_obj("Turret_Cast_Asymmetric_Blockout", verts, faces, CAST)
turret.location.z = 0.0

# Turret roof and commander cupola
cylinder("Commander_cupola", (0.0, -0.58, 2.57), 0.39, 0.25, CAST, axis='Z')
cylinder("Cupola_lid", (0.0, -0.58, 2.72), 0.34, 0.07, PAINT, axis='Z')

# Main gun: barrel along +Y; separate pivot object at the mantlet
pivot = bpy.data.objects.new("Gun_Elevation_Pivot", None)
bpy.context.collection.objects.link(pivot)
pivot.location = (0.0, 1.22, 2.18)
barrel = cylinder("D25T_barrel", (0.0, 3.05, 2.18), 0.105, 3.66, STEEL, axis='Y')
barrel.parent = pivot
barrel.location = (0.0, 1.83, 0.0)
# Muzzle brake: recognizable twin-port blockout
brake = cylinder("D25T_muzzle_brake", (0.0, 4.92, 2.18), 0.16, 0.34, STEEL, axis='Y')
brake.parent = pivot
brake.location = (0.0, 3.70, 0.0)
# Mantlet broad rounded cast shield
mantlet = cube("D25T_cast_mantlet", (0.0, 1.30, 2.18), (1.45, 0.28, 0.63), CAST, 0.17)

# Road wheels: six twin stations on each side, 550 mm diameter.
for side in (-1, 1):
    x = side * 1.30
    for i in range(6):
        y = -2.05 + i * 0.82
        cylinder("Roadwheel_%s_%02d" % (side, i+1), (x, y, 0.70), 0.275, 0.18, PAINT, 'X')
        cylinder("Roadwheel_hub_%s_%02d" % (side, i+1), (x + side*0.105, y, 0.70), 0.095, 0.045, STEEL, 'X')
    for i, y in enumerate((-1.5, 0.0, 1.5)):
        cylinder("Return_roller_%s_%02d" % (side, i+1), (x, y, 1.03), 0.085, 0.13, STEEL, 'X')
    # Continuous track-run placeholder; replace with individually modeled
    # 86 single-ridge links in the detail pass.
    cube("Track_run_%s" % side, (side*1.34, 0.78, 0.78), (0.12, 5.65, 0.62), RUBBER, 0.06)

# Rear drive sprockets and front idlers
for side in (-1, 1):
    cylinder("Rear_drive_sprocket_%s" % side, (side*1.30, -3.03, 0.76), 0.33, 0.26, STEEL, 'X')
    cylinder("Front_idler_%s" % side, (side*1.30, 3.02, 0.70), 0.275, 0.26, STEEL, 'X')

# Four external auxiliary fuel tanks, two per rear hull side
for side in (-1, 1):
    for i, y in enumerate((-2.35, -1.30)):
        cylinder("Aux_fuel_drum_%s_%s" % (side, i+1),
                 (side*1.40, y, 1.16), 0.19, 0.90, PAINT, axis='Y', vertices=32)

# Basic hatches, vision devices and headlights
cube("Driver_hatch", (-0.42, 2.05, 1.72), (0.58, 0.60, 0.08), CAST, 0.07)
for x in (-0.78, -0.22):
    cube("Driver_periscope_%s" % x, (x, 1.75, 1.79), (0.14, 0.18, 0.10), STEEL, 0.02)
for side in (-1, 1):
    cylinder("Headlight_%s" % side, (side*1.15, 2.75, 1.55), 0.09, 0.12, STEEL, 'X', 24)

# Origin conventions: turret origin at turret-ring center; gun pivot at trunnion.
# Put turret and its fittings into a single parent empty, preserving gun pivot.
turret_root = bpy.data.objects.new("Turret_Root", None)
bpy.context.collection.objects.link(turret_root)
turret_root.location = (0.0, 0.0, 1.62)
for ob in list(bpy.context.scene.objects):
    if ob.name.startswith(("Turret_", "Commander_", "Cupola_", "D25T_cast_mantlet")) or ob == pivot:
        world = ob.matrix_world.copy()
        ob.parent = turret_root
        ob.matrix_world = world

# Organize root and export GLB
root = bpy.data.objects.new("IS2_Model1944_Root", None)
bpy.context.collection.objects.link(root)
for ob in list(bpy.context.scene.objects):
    if ob != root and ob.parent is None:
        world = ob.matrix_world.copy()
        ob.parent = root
        ob.matrix_world = world
root["variant"] = "IS-2 Model 1944"
root["units"] = "meters"
root["forward_axis"] = "+Y (Blender source); convert to +Z in Three.js import adapter"
root["status"] = "BLOCKOUT — not production-ready"
bpy.ops.object.select_all(action='DESELECT')
for ob in bpy.context.scene.objects:
    if ob.type in {'MESH', 'EMPTY'}:
        ob.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True)
print("Exported IS-2 blockout:", OUT)
