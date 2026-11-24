#!/usr/bin/env python3
"""Blender 4.x: procedural, editable concept-fleet asset generator.

Run from repository root:
  blender --background --python tools/blender/build_concept_fleet.py -- --all
  blender --background --python tools/blender/build_concept_fleet.py -- --vehicle aegis140 --preview

Creates one .glb and one .blend per vehicle in artifacts/concept-fleet.
The vehicle designs are FICTIONAL. Meshes are individually named/editable and are
not automatically enabled by the browser game: gameplay currently uses its own
distinct procedural fallback until rig/LOD/render parity is verified.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

# In metres: (hull length, width, height, turret length, width, height, gun length)
SPECS = {
    "aegis140": (8.30,4.05,1.72,4.25,3.75,0.82,6.70),
    "bastion125": (7.85,3.90,1.69,3.80,3.55,0.87,5.65),
    "harrier105": (6.45,3.06,1.34,2.80,2.45,0.66,5.00),
    "warden130": (8.05,3.95,1.64,3.38,3.20,0.48,7.40),
    "lancer120": (7.60,3.35,1.40,3.40,2.80,0.62,7.50),
    "leviathan160": (8.60,4.26,1.96,3.65,3.56,0.80,3.90),
    "thunderclad155": (8.00,3.72,1.64,4.70,3.42,1.50,7.30),
    "tempest155": (7.10,3.40,1.45,4.25,3.05,1.25,7.20),
    "cerberus135": (8.15,4.02,1.69,3.62,3.20,0.66,6.40),
    "raptor90": (5.65,2.76,1.23,2.35,1.96,0.55,4.25),
}
REAR_TURRETS = {"aegis140","bastion125","thunderclad155","tempest155"}
OPEN_TOP = {"harrier105","raptor90"}
ARTILLERY = {"thunderclad155","tempest155"}
ERA = {
    "aegis140": [("Hull","front",7,2),("Hull","side",6,2),("Turret","side",5,2)],
    "bastion125": [("Turret","front",7,3),("Turret","side",5,2)],
    "warden130": [("Hull","front",8,3)],
    "lancer120": [("Hull","side",7,2)],
    "cerberus135": [("Hull","side",8,2)],
}
COLORS = {
    "aegis140": (0.29,0.33,0.27,1), "bastion125": (0.27,0.29,0.24,1),
    "harrier105": (0.40,0.43,0.35,1), "warden130": (0.23,0.27,0.23,1),
    "lancer120": (0.32,0.34,0.28,1), "leviathan160": (0.31,0.29,0.22,1),
    "thunderclad155": (0.28,0.34,0.26,1), "tempest155": (0.29,0.36,0.32,1),
    "cerberus135": (0.25,0.30,0.26,1), "raptor90": (0.34,0.41,0.34,1),
}

def empty(name,parent=None,loc=(0,0,0)):
    obj=bpy.data.objects.new(name,None)
    bpy.context.scene.collection.objects.link(obj)
    if parent: obj.parent=parent
    obj.location=loc
    obj.empty_display_size=0.35
    return obj

def material(name,rgba,metallic=0.16,roughness=0.72):
    m=bpy.data.materials.new(name)
    m.diffuse_color=rgba
    m.use_nodes=True
    bs=m.node_tree.nodes.get("Principled BSDF")
    if bs:
        bs.inputs["Base Color"].default_value=rgba
        bs.inputs["Metallic"].default_value=metallic
        bs.inputs["Roughness"].default_value=roughness
    return m

def assign(obj,mat,parent):
    if parent: obj.parent=parent
    if mat: obj.data.materials.append(mat)
    if obj.type=="MESH":
        obj["mesh_role"]="game_asset"
    return obj

def cube(name,loc,size,mat,parent=None,rot=(0,0,0),bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1)
    ob=bpy.context.object
    ob.name=name
    ob.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.location=loc
    ob.rotation_euler=rot
    assign(ob,mat,parent)
    if bevel:
        mod=ob.modifiers.new("Subtle machined edge","BEVEL")
        mod.width=bevel;mod.segments=2
        mod.affect="EDGES" if hasattr(mod,"affect") else None
        ob.modifiers.new("Weighted normals","WEIGHTED_NORMAL")
    return ob

def cylinder(name,loc,radius,depth,mat,parent=None,axis="Z",vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth)
    ob=bpy.context.object;ob.name=name
    if axis=="X": ob.rotation_euler[1]=math.pi/2
    if axis=="Y": ob.rotation_euler[0]=-math.pi/2
    ob.location=loc
    return assign(ob,mat,parent)

def poly_prism(name,xy,z0,z1,mat,parent=None,top_scale=0.93):
    n=len(xy)
    verts=[(x,y,z0) for x,y in xy]+[(x*top_scale,y*top_scale,z1) for x,y in xy]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces.extend([(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)])
    mesh=bpy.data.meshes.new(name+"_Mesh");mesh.from_pydata(verts,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(ob)
    return assign(ob,mat,parent)

def shell_hull(name,L,W,H,mat,parent,blade=False):
    # Side profile in Y-Z: front (+Y) sloped, rear (-Y) nearly vertical.
    y=L/2
    profile=[(-y+0.14,0.40),(y-0.26,0.40),(y,0.67),
             (y-(1.95 if blade else 1.38),H),
             (-y+0.36,H),(-y+0.04,H-0.28)]
    n=len(profile);w=W/2-0.03
    verts=[(-w,a,b) for a,b in profile]+[(w,a,b) for a,b in profile]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces.extend([(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)])
    mesh=bpy.data.meshes.new(name+"_Mesh");mesh.from_pydata(verts,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(ob)
    return assign(ob,mat,parent)

def tube_y(name,r_outer,r_inner,length,mat,parent):
    # True hollow bore: an annular tube; do not cap the muzzle with a solid disk.
    n=24;verts=[]
    for r,yy in ((r_outer,0),(r_outer,length),(r_inner,0),(r_inner,length)):
        for j in range(n):
            a=j*2*math.pi/n;verts.append((r*math.cos(a),yy,r*math.sin(a)))
    faces=[]
    for i in range(n):
        j=(i+1)%n
        faces.extend([(i,j,n+j,n+i),(2*n+j,2*n+i,3*n+i,3*n+j),
                      (n+i,n+j,3*n+j,3*n+i),(j,i,2*n+i,2*n+j)])
    mesh=bpy.data.meshes.new(name+"_Mesh");mesh.from_pydata(verts,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(ob)
    return assign(ob,mat,parent)

def track_point(s,straight,r,front,rear,cz):
    if s<straight: return rear+s,cz-r,0
    s-=straight
    if s<math.pi*r:
        a=-math.pi/2+s/r
        return front+r*math.cos(a),cz+r*math.sin(a),a+math.pi/2
    s-=math.pi*r
    if s<straight: return front-s,cz+r,math.pi
    s-=straight
    a=math.pi/2+s/r
    return rear+r*math.cos(a),cz+r*math.sin(a),a+math.pi/2

def build_running_gear(spec,hull,mats):
    id=spec["id"];L=spec["L"];W=spec["W"]
    count=7 if id in {"aegis140","warden130","leviathan160","thunderclad155","cerberus135"} else 6
    radius=0.24 if id=="raptor90" else 0.37 if id=="leviathan160" else 0.31
    outer=W/2-0.27
    rear=-L*0.38;front=L*0.38
    for side in (-1,1):
        x=side*outer
        track=empty("TrackRoot_"+("L" if side<0 else "R"),hull)
        for i in range(count):
            y=rear+(front-rear)*i/(count-1)
            cylinder("RoadWheel_%s_%02d_%s"%(id,i,"L" if side<0 else "R"),
                     (x,y,radius+0.10),radius,0.18,mats["metal"],track,"X",32)
            cylinder("WheelHub_%02d_%s"%(i,"L" if side<0 else "R"),
                     (x+side*0.105,y,radius+0.10),radius*0.28,0.06,mats["dark"],track,"X",20)
        for role,y in (("DriveSprocket",rear-0.32),("FrontIdler",front+0.32)):
            cylinder(role+"_"+str(side),(x,y,radius+0.13),radius*1.05,0.24,mats["metal"],track,"X",28)
        straight=front-rear+0.64;r=radius+0.16;cc=radius+0.13
        total=2*straight+2*math.pi*r
        N=max(82,round(total/0.17))
        for i in range(N):
            y,z,a=track_point((i+0.5)*total/N,straight,r,front+0.32,rear-0.32,cc)
            ob=cube("TrackLink_%s_%03d"%(str(side),i),(x,y,z),
                    (0.52,0.155,0.085),mats["track"],track)
            ob.rotation_euler[0]=a
            if i%3==0:
                cube("TrackGrouser_%s_%03d"%(str(side),i),
                     (x,y,z+0.054),(0.50,0.045,0.035),mats["dark"],track)
    return count

def era_modules(spec,hull,turret,mats):
    count=0
    for part,face,cols,rows in ERA.get(spec["id"],[]):
        parent=hull if part=="Hull" else turret
        W=spec["W"] if part=="Hull" else spec["TW"]
        H=spec["H"] if part=="Hull" else spec["TH"]
        L=spec["L"] if part=="Hull" else spec["TL"]
        sides=[0] if face=="front" else [-1,1]
        for side in sides:
            for i in range(cols):
                for j in range(rows):
                    t=(i+0.5)/cols;v=(j+0.5)/rows
                    z=0.65*H*v+0.2 if part=="Hull" else max(0.08,H*0.82*v)
                    if face=="front":
                        x=(t-0.5)*W*0.86;y=L*0.46
                        size=(W*0.84/cols,0.14,max(0.14,H*0.55/rows))
                    else:
                        x=side*W*0.52;y=(t-0.50)*L*0.78
                        size=(0.13,L*0.75/cols,max(0.14,H*0.6/rows))
                    name="ERA_%s_%s_%s_%02d_%02d"%(part,face,side,i,j)
                    tile=cube(name,(x,y,z),size,mats["era"],parent,bevel=0.008)
                    tile["era_part"]=part.lower();tile["era_face"]=face
                    tile["era_col"]=i;tile["era_row"]=j;tile["era_side"]=side
                    count+=1
    return count

def add_turret(spec,root,mats):
    id=spec["id"];L=spec["TL"];W=spec["TW"];H=spec["TH"]
    pos_y= -0.9 if id=="aegis140" else -0.55 if id in REAR_TURRETS else 0.45 if id in {"warden130","leviathan160","raptor90"} else 0.12
    turret=empty("TurretRoot",root,(0,pos_y,spec["H"]))
    if id in OPEN_TOP:
        cube("OpenGunPlatform",(0,0,0.12),(W*0.91,L*0.89,0.15),mats["metal"],turret)
        for side in (-1,1):
            cube("OpenSideShield_"+str(side),(side*W*0.43,0,H*0.45),(0.11,L*0.8,H*0.85),mats["paint"],turret)
        cube("FrontGunShield",(0,L*0.36,H*0.43),(W*0.91,0.19,H*0.84),mats["paint"],turret)
        cube("ExposedBreech",(0,-0.25,H*0.36),(0.76,0.86,0.47),mats["steel"],turret)
    else:
        front=L*0.46
        if id=="warden130":
            polygon=[(-W*0.47,-L*.43),(W*.47,-L*.43),(W*.45,L*.12),(W*.28,front),(-W*.28,front),(-W*.45,L*.12)]
        elif id=="aegis140":
            polygon=[(-W*.5,-L*.48),(W*.5,-L*.48),(W*.47,L*.13),(W*.2,front),(-W*.2,front),(-W*.47,L*.13)]
        else:
            polygon=[(-W*.50,-L*.47),(W*.50,-L*.47),(W*.50,L*.11),(W*.28,front),(-W*.28,front),(-W*.50,L*.11)]
        poly_prism("ArmouredTurretShell",polygon,0,H,mats["paint"],turret,
                   0.91 if id!="thunderclad155" else 0.97)
        if id not in {"cerberus135","warden130"}:
            cylinder("CommanderCupola",(-W*.22,-L*.23,H+0.11),0.28,0.18,mats["paint"],turret,vertices=32)
            cylinder("LoaderHatch",(W*.22,-L*.18,H+0.04),0.25,0.08,mats["metal"],turret,vertices=28)
    gun=empty("GunElevationPivot",turret,(0,L*0.27,H*0.48))
    breech=cube("GunMantlet",(0,0,0),(0.8,0.58,0.58),mats["steel"],gun,bevel=0.035)
    barrel=empty("BarrelRecoil",gun)
    calibre=int("".join(c for c in id if c.isdigit()) or 125)
    bore=calibre/2000;r=bore*1.75
    tube=tube_y("HollowMainGunBarrel",r,bore,spec["GL"],mats["steel"],barrel)
    tube["calibre_mm"]=calibre
    cylinder("ThermalSleeve",(0,spec["GL"]*.57,0),r*1.10,0.52,mats["paint"],barrel,"Y")
    # Open port and twin raised ribs distinguish the muzzle brake.
    for side in (-1,1):
        cube("DoubleBaffleBrake_"+str(side),(side*r*1.06,spec["GL"]-0.23,0),
             (0.09,0.42,r*1.5),mats["metal"],barrel)
    if id in ARTILLERY:
        for side in (-1,1):
            cube("HowitzerCradle_"+str(side),(side*.43,-.28,-.08),
                 (0.15,1.25,0.42),mats["metal"],gun)
        cube("RearTurretEquipment",(0,-L*.37,H*.55),(W*.67,0.52,H*.55),mats["paint"],turret)
    return turret,gun,barrel

def add_signature(spec,hull,turret,gun,mats):
    id=spec["id"];L=spec["L"];W=spec["W"];H=spec["H"];TW=spec["TW"];TH=spec["TH"]
    if id=="aegis140":
        for side in (-1,1):
            cube("APS_Launcher_"+str(side),(side*TW*.40,0.35,TH+0.16),
                 (.42,.56,.24),mats["metal"],turret)
            cube("APS_Radar_"+str(side),(side*TW*.40,.58,TH+.25),
                 (.28,.08,.13),mats["glass"],turret)
    if id=="bastion125":
        for i in range(13):
            x=(i-6)*TW/13
            cube("RearSlatVertical_%02d"%i,(x,-spec["TL"]*.60,TH*.50),
                 (.035,.04,TH*.9),mats["steel"],turret)
        for z in (.12,TH*.88):
            cube("RearSlatRail_%.1f"%z,(0,-spec["TL"]*.60,z),
                 (TW*.9,.05,.05),mats["steel"],turret)
        cube("BlowoutPanel",(0,-spec["TL"]*.26,TH+0.045),
             (TW*.66,spec["TL"]*.32,.08),mats["metal"],turret)
    if id=="warden130":
        cube("FixedCasemateGunReinforcement",(0,spec["TL"]*.37,TH*.36),
             (TW*.65,.36,TH*.64),mats["metal"],turret)
    if id=="lancer120":
        for side in (-1,1):
            cube("SniperSideSensor_"+str(side),(side*TW*.40,.22,TH*.88),
                 (.22,.42,.21),mats["glass"],turret)
    if id=="leviathan160":
        cube("DozerBlade",(0,L/2+0.24,0.47),(W*1.07,.18,.82),
             mats["metal"],hull,rot=(math.radians(-18),0,0),bevel=.06)
        for side in (-1,1):
            cube("DozerPiston_"+str(side),(side*W*.33,L*.49,.73),
                 (.12,1.06,.12),mats["steel"],hull,rot=(math.radians(12),0,0))
    if id in ARTILLERY:
        spade=empty("SpadePivot",hull,(0,-L*.46,0.55))
        cube("RearSpadeBlade",(0,-.38,-.28),(W*.84,.20,.68),mats["metal"],spade)
        for side in (-1,1):
            cube("RearSpadeHydraulic_"+str(side),(side*W*.27,-.25,.02),
                 (.12,.86,.12),mats["steel"],spade,rot=(math.radians(25),0,0))
    if id=="cerberus135":
        for side in (-1,1):
            cube("UnmannedSight_"+str(side),(side*TW*.38,.30,TH+.13),
                 (.36,.32,.23),mats["glass"],turret)
        cube("ProtectedCrewCapsuleVisual",(0,L*.18,H+.10),
             (W*.44,.78,.18),mats["paint"],hull)
    if id=="raptor90":
        for side in (-1,1):
            cube("ExposedReconSensor_"+str(side),(side*TW*.45,.31,TH+.21),
                 (.26,.34,.23),mats["glass"],turret)
        cylinder("CommanderObservationMast",(0,-spec["TL"]*.30,TH+.40),
                 .055,.72,mats["steel"],turret,vertices=12)
    if id in OPEN_TOP:
        cylinder("OpenTopCrewSeat",(0,-spec["TL"]*.13,.19),.23,.28,
                 mats["dark"],turret,vertices=18)

def build_asset(id,out_dir,preview=False):
    bpy.ops.object.select_all(action="SELECT");bpy.ops.object.delete(use_global=False)
    bpy.context.scene.unit_settings.system="METRIC"
    bpy.context.scene.unit_settings.scale_length=1.0
    L,W,H,TL,TW,TH,GL=SPECS[id]
    spec={"id":id,"L":L,"W":W,"H":H,"TL":TL,"TW":TW,"TH":TH,"GL":GL}
    mats={
        "paint":material(id+"_paint",COLORS[id],.23,.79),
        "metal":material(id+"_armor",(0.25,0.28,0.27,1),.56,.58),
        "steel":material(id+"_steel",(0.18,0.19,0.20,1),.68,.43),
        "track":material(id+"_track",(0.12,0.12,0.12,1),.32,.86),
        "dark":material(id+"_rubber",(0.06,0.07,0.07,1),.02,.95),
        "era":material(id+"_ERA",(0.35,0.39,0.30,1),.46,.7),
        "glass":material(id+"_optics",(0.055,0.19,0.23,1),.45,.24),
    }
    root=empty("VehicleRoot")
    root["design_id"]=id;root["fictional_concept"]=True
    root["unit"]="metre";root["forward_axis"]="Blender +Y; game +Z"
    hull=empty("HullRoot",root)
    shell_hull("WeldedWedgeHull",L,W,H,mats["paint"],hull,id=="warden130")
    build_running_gear(spec,hull,mats)
    for side in (-1,1):
        cube("SideSkirt_"+str(side),(side*(W*.5-.04),0,H*.61),
             (.075,L*.80,H*.42),mats["paint"],hull)
        cylinder("FrontLamp_"+str(side),(side*W*.40,L*.43,H*.93),
                 .09,.10,mats["glass"],hull,axis="Y")
    for i in range(8):
        cube("EngineDeckLouvre_%02d"%i,(0,-L*.39+i*.12,H+.025),
             (W*.5,.07,.03),mats["dark"],hull)
    turret,gun,barrel=add_turret(spec,hull,mats)
    count=era_modules(spec,hull,turret,mats)
    add_signature(spec,hull,turret,gun,mats)
    root["era_module_count"]=count
    root["builder_version"]="2026-11-24-a"
    os.makedirs(out_dir,exist_ok=True)
    glb=os.path.join(out_dir,id+".glb")
    blend=os.path.join(out_dir,id+".blend")
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.context.scene.objects:
        if o.type in {"MESH","EMPTY"}:o.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=glb,export_format="GLB",use_selection=True,
                              export_apply=False,export_materials="EXPORT")
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    if preview:
        bpy.ops.object.camera_add(location=(W*2.4,L*1.35,H*3.5))
        cam=bpy.context.object
        cam.name="PreviewCamera"
        aim=Vector((0,0,H*.70))
        cam.rotation_euler=(aim-cam.location).to_track_quat("-Z","Y").to_euler()
        cam.data.type="ORTHO";cam.data.ortho_scale=max(L,W)*1.75
        bpy.context.scene.camera=cam
        bpy.ops.object.light_add(type="AREA",location=(W*1.5,L*.9,H*3))
        bpy.context.object.data.energy=1900;bpy.context.object.data.shape="DISK"
        bpy.context.object.data.size=max(L,W)
        bpy.context.scene.render.engine="BLENDER_WORKBENCH"
        bpy.context.scene.render.resolution_x=1280;bpy.context.scene.render.resolution_y=720
        bpy.context.scene.render.resolution_percentage=100
        bpy.context.scene.render.filepath=os.path.join(out_dir,id+"_preview.png")
        bpy.ops.render.render(write_still=True)
    print("CONCEPT_ASSET",id,glb,blend,"ERA",count)

def main():
    argv=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    ap=argparse.ArgumentParser()
    group=ap.add_mutually_exclusive_group()
    group.add_argument("--all",action="store_true")
    group.add_argument("--vehicle",choices=sorted(SPECS))
    ap.add_argument("--out-dir",default=os.path.join("artifacts","concept-fleet"))
    ap.add_argument("--preview",action="store_true")
    args=ap.parse_args(argv)
    chosen=[args.vehicle] if args.vehicle else list(SPECS)
    for id in chosen:build_asset(id,os.path.abspath(args.out_dir),args.preview)

if __name__=="__main__":
    main()
