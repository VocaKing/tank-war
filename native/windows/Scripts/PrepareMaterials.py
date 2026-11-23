"""Build the prototype's lit material assets inside the Unreal Editor."""
from pathlib import Path

import unreal

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "ArtSource"
MATERIALS = "/Game/Prototype/Materials"
TEXTURES = "/Game/Prototype/Textures"
ASSETS = unreal.EditorAssetLibrary
TOOLS = unreal.AssetToolsHelpers.get_asset_tools()
EDIT = unreal.MaterialEditingLibrary
PROP = unreal.MaterialProperty


def import_texture(filename, is_normal=False):
    path = f"{TEXTURES}/{Path(filename).stem}"
    texture = ASSETS.load_asset(path) if ASSETS.does_asset_exist(path) else None
    if not texture:
        task = unreal.AssetImportTask()
        for key, value in {
            "filename": str(ART / filename),
            "destination_path": TEXTURES,
            "automated": True,
            "save": True,
            "replace_existing": False,
        }.items():
            task.set_editor_property(key, value)
        TOOLS.import_asset_tasks([task])
        texture = ASSETS.load_asset(path)
    if not isinstance(texture, unreal.Texture2D):
        raise RuntimeError(f"Could not import {filename}")
    if is_normal:
        texture.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
        texture.set_editor_property("srgb", False)
        ASSETS.save_loaded_asset(texture)
    return texture


def expression(material, kind, x, y, **properties):
    node = EDIT.create_material_expression(material, kind, x, y)
    if node is None:
        raise RuntimeError(f"Could not create {kind}")
    for key, value in properties.items():
        node.set_editor_property(key, value)
    return node


def connect(output, output_pin, node, input_pin):
    if not EDIT.connect_material_expressions(output, output_pin, node, input_pin):
        raise RuntimeError(f"Could not connect {output_pin} to {input_pin}")


def plug(node, pin, property_name):
    if not EDIT.connect_material_property(node, pin, property_name):
        raise RuntimeError(f"Could not connect {property_name}")


def constant(material, value, x, y):
    return expression(material, unreal.MaterialExpressionConstant, x, y, r=value)


def color(material, rgb, x, y):
    return expression(material, unreal.MaterialExpressionConstant3Vector, x, y,
                      constant=unreal.LinearColor(*rgb, 1.0))


def sample(material, texture, x, y, is_normal=False):
    sampler = unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL if is_normal else unreal.MaterialSamplerType.SAMPLERTYPE_COLOR
    return expression(material, unreal.MaterialExpressionTextureSample, x, y,
                      texture=texture, sampler_type=sampler)


def new_material(name):
    path = f"{MATERIALS}/{name}"
    if ASSETS.does_asset_exist(path):
        return None
    material = TOOLS.create_asset(name, MATERIALS, unreal.Material, unreal.MaterialFactoryNew())
    if material is None:
        raise RuntimeError(f"Could not create {path}")
    return material


def finish(material):
    EDIT.recompile_material(material)
    if not ASSETS.save_loaded_asset(material, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {material.get_path_name()}")


def surface(name, roughness, metallic, diffuse=None, normal=None, color_strength=0.6, base=None, waves=False):
    material = new_material(name)
    if material is None:
        return
    material.set_editor_property("two_sided", True)
    tint = (color(material, base, -950, -140) if base else
            expression(material, unreal.MaterialExpressionVertexColor, -950, -140))
    if diffuse:
        tex = sample(material, import_texture(diffuse), -1150, 160)
        detail = expression(material, unreal.MaterialExpressionLinearInterpolate, -720, 100,
                            const_a=1.0, const_alpha=color_strength)
        connect(tex, "RGB", detail, "B")
        albedo = expression(material, unreal.MaterialExpressionMultiply, -390, -110)
        connect(tint, "", albedo, "A")
        connect(detail, "", albedo, "B")
        tint = albedo
    plug(tint, "", PROP.MP_BASE_COLOR)
    plug(constant(material, roughness, -320, 190), "", PROP.MP_ROUGHNESS)
    plug(constant(material, metallic, -320, 280), "", PROP.MP_METALLIC)
    if normal:
        tex = sample(material, import_texture(normal, is_normal=True), -660, 350, is_normal=True)
        if waves:
            pan = expression(material, unreal.MaterialExpressionPanner, -960, 370, speed_x=0.045, speed_y=0.026)
            if not EDIT.connect_material_expressions(pan, "", tex, "UVs"):
                EDIT.connect_material_expressions(pan, "", tex, "Coordinates")
        plug(tex, "RGB", PROP.MP_NORMAL)
    finish(material)


def target(name, rgb, emission):
    material = new_material(name)
    if material is None:
        return
    tint = color(material, rgb, -480, -100)
    plug(tint, "", PROP.MP_BASE_COLOR)
    plug(constant(material, 0.52, -320, 190), "", PROP.MP_ROUGHNESS)
    if emission:
        glow = expression(material, unreal.MaterialExpressionMultiply, -220, 0, const_b=emission)
        connect(tint, "", glow, "A")
        plug(glow, "", PROP.MP_EMISSIVE_COLOR)
    finish(material)


surface("M_Terrain", 0.88, 0.0, "leafy_grass_diff_2k.jpg", "leafy_grass_nor_2k.jpg", 0.47)
surface("M_Stone", 0.79, 0.0, "plastered_stone_wall_diff.jpg", "plastered_stone_wall_nor.jpg", 0.53)
surface("M_Foliage", 0.84, 0.0)
surface("M_Armor", 0.57, 0.44, normal="rusty_metal_02_nor.jpg")
surface("M_Water", 0.16, 0.06, normal="WaterNormal.png", base=(0.033, 0.095, 0.10), waves=True)
target("M_Target", (0.82, 0.123, 0.022), 0.58)
target("M_Stand", (0.09, 0.11, 0.13), 0.0)
target("M_Tracer", (1.0, 0.25, 0.015), 18.0)
unreal.log("Steel Front material preparation completed")
