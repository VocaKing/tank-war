"""Import the web version's authored textures and build the UE materials."""
import json
from pathlib import Path

import unreal

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "ArtSource"
MATERIALS = "/Game/Prototype/Quality/Materials"
TEXTURES = "/Game/Prototype/Quality/Textures"
ASSETS = unreal.EditorAssetLibrary
TOOLS = unreal.AssetToolsHelpers.get_asset_tools()
EDIT = unreal.MaterialEditingLibrary
PROP = unreal.MaterialProperty
TEX = {}


def import_texture(filename, usage="color"):
    key = (filename, usage)
    if key in TEX:
        return TEX[key]
    name = Path(filename).stem
    path = f"{TEXTURES}/{name}"
    texture = ASSETS.load_asset(path) if ASSETS.does_asset_exist(path) else None
    if not texture:
        task = unreal.AssetImportTask()
        for prop, value in {
            "filename": str(ART / filename),
            "destination_path": TEXTURES,
            "automated": True,
            "save": True,
            "replace_existing": False,
        }.items():
            task.set_editor_property(prop, value)
        TOOLS.import_asset_tasks([task])
        texture = ASSETS.load_asset(path)
    if not isinstance(texture, unreal.Texture2D):
        raise RuntimeError(f"Could not import {filename}")
    if usage == "normal":
        texture.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
        texture.set_editor_property("flip_green_channel", True)
        texture.set_editor_property("srgb", False)
        ASSETS.save_loaded_asset(texture)
    if usage == "mask":
        texture.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_MASKS)
        texture.set_editor_property("srgb", False)
        ASSETS.save_loaded_asset(texture)
    TEX[key] = texture
    return texture


def expression(material, kind, x, y, **properties):
    node = EDIT.create_material_expression(material, kind, x, y)
    if node is None:
        raise RuntimeError(f"Could not create {kind}")
    for key, value in properties.items():
        node.set_editor_property(key, value)
    return node


def connect(output, output_pin, node, input_pin):
    key = "".join(ch for ch in input_pin.lower() if ch.isalnum())
    names = EDIT.get_material_expression_input_names(node)
    pin = next((name for name in names if "".join(ch for ch in name.lower() if ch.isalnum()) == key), input_pin)
    if not EDIT.connect_material_expressions(output, output_pin, node, pin):
        raise RuntimeError(f"Could not connect {output.get_class().get_name()}.{output_pin} to {node.get_class().get_name()}.{input_pin}")


def plug(node, pin, property_name):
    if not EDIT.connect_material_property(node, pin, property_name):
        raise RuntimeError(f"Could not connect {property_name}")


def constant(material, value, x=0, y=0):
    return expression(material, unreal.MaterialExpressionConstant, x, y, r=value)


def color(material, rgb, x=0, y=0):
    return expression(material, unreal.MaterialExpressionConstant3Vector, x, y,
                      constant=unreal.LinearColor(*rgb, 1.0))


def coordinates(material, channel, y=0):
    return expression(material, unreal.MaterialExpressionTextureCoordinate, -1300, y, coordinate_index=channel)


def texture_node(material, filename, usage, x, y, as_object=False):
    sampler = {"color": unreal.MaterialSamplerType.SAMPLERTYPE_COLOR,
               "normal": unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL,
               "mask": unreal.MaterialSamplerType.SAMPLERTYPE_MASKS}[usage]
    kind = unreal.MaterialExpressionTextureObject if as_object else unreal.MaterialExpressionTextureSample
    return expression(material, kind, x, y, texture=import_texture(filename, usage), sampler_type=sampler)


def multiply(material, node, pin, factor, x, y):
    result = expression(material, unreal.MaterialExpressionMultiply, x, y, const_b=factor)
    connect(node, pin, result, "A")
    return result


def custom(material, code, inputs, output_type, x=0, y=0, outputs=()):
    node = expression(material, unreal.MaterialExpressionCustom, x, y, code=code, output_type=output_type)
    slots = []
    for name, _, _ in inputs:
        slot = unreal.CustomInput()
        slot.set_editor_property("input_name", name)
        slots.append(slot)
    node.set_editor_property("inputs", slots)
    if outputs:
        pins = []
        for name, kind in outputs:
            pin = unreal.CustomOutput()
            pin.set_editor_property("output_name", name)
            pin.set_editor_property("output_type", kind)
            pins.append(pin)
        node.set_editor_property("additional_outputs", pins)
    for name, source, output in inputs:
        connect(source, output, node, name)
    return node


def new_material(name):
    path = f"{MATERIALS}/M_{name}"
    if ASSETS.does_asset_exist(path):
        return None
    material = TOOLS.create_asset(f"M_{name}", MATERIALS, unreal.Material, unreal.MaterialFactoryNew())
    if material is None:
        raise RuntimeError(f"Could not create {path}")
    return material


def finish(material):
    EDIT.recompile_material(material)
    if not ASSETS.save_loaded_asset(material, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {material.get_path_name()}")


def terrain(spec):
    material = new_material(spec["name"])
    if material is None:
        return
    vertex = expression(material, unreal.MaterialExpressionVertexColor, -1450, -600)
    weights = expression(material, unreal.MaterialExpressionAppendVector, -1150, -600)
    connect(vertex, "RGB", weights, "A")
    connect(vertex, "A", weights, "B")
    inputs = [
        ("Blend", weights, ""),
        ("UV", coordinates(material, 0, -450), ""),
        ("TintRG", coordinates(material, 1, -350), ""),
        ("TintBWet", coordinates(material, 2, -250), ""),
        ("RoadUV", coordinates(material, 3, -150), ""),
        ("RoadMask", coordinates(material, 4, -50), ""),
        ("TintA", color(material, spec["tintA"], -1360, 50), ""),
        ("TintB", color(material, spec["tintB"], -1360, 130), ""),
        ("Distance", expression(material, unreal.MaterialExpressionPixelDepth, -1360, 295), ""),
    ]
    for index, (label, layer) in enumerate(zip("ABCD", spec["layers"])):
        for row, (prefix, field, usage) in enumerate([("C", "diffuse", "color"), ("N", "normal", "normal"), ("P", "arm", "mask")]):
            value = texture_node(material, layer[field], usage, -1100 + index * 175, 420 + 145 * row, as_object=True)
            inputs.append((prefix + label, value, ""))
    code = (ROOT / "Scripts" / "TerrainMaterial.hlsl").read_text(encoding="utf-8")
    float3 = unreal.CustomMaterialOutputType.CMOT_FLOAT3
    float1 = unreal.CustomMaterialOutputType.CMOT_FLOAT1
    graph = custom(material, code, inputs, float3, x=-380,
                   outputs=(("OutNormal", float3), ("OutRoughness", float1), ("OutAO", float1)))
    plug(graph, "", PROP.MP_BASE_COLOR)
    plug(graph, "OutNormal", PROP.MP_NORMAL)
    plug(graph, "OutRoughness", PROP.MP_ROUGHNESS)
    plug(graph, "OutAO", PROP.MP_AMBIENT_OCCLUSION)
    finish(material)


def add_wind(material, grass):
    time = expression(material, unreal.MaterialExpressionTime, -1250, 760)
    height = coordinates(material, 0 if grass else 1, 870)
    inputs = [("Clock", time, ""), ("Height", height, "")]
    if grass:
        seed = expression(material, unreal.MaterialExpressionPerInstanceRandom, -1250, 980)
        inputs.append(("Seed", seed, ""))
    phase = "Seed" if grass else "Height.y"
    amount = "pow(saturate(1.0 - Height.y), 2) * 5.0" if grass else "Height.x * 22.0"
    code = (f"float p = ({phase}) * 6.28318; "
            "float gust = 0.6 + 0.4 * sin(Clock * 0.44 + p); "
            f"float bend = ({amount}) * gust; "
            "return float3(sin(Clock * 1.4 + p), cos(Clock * 1.14 + p * 1.3) * 0.64, 0) * bend;")
    node = custom(material, code, inputs, unreal.CustomMaterialOutputType.CMOT_FLOAT3, x=-490, y=620)
    plug(node, "", PROP.MP_WORLD_POSITION_OFFSET)


def surface(spec):
    material = new_material(spec["name"])
    if material is None:
        return
    kind = spec.get("kind", "surface")
    material.set_editor_property("two_sided", bool(spec.get("doubleSided") or spec.get("masked")))
    if spec.get("masked"):
        material.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
        material.set_editor_property("opacity_mask_clip_value", spec.get("cutoff", 0.45))
    if kind == "grass" or spec.get("instanced"):
        material.set_editor_property("used_with_instanced_static_meshes", True)
    if kind in ("leaf", "grass"):
        material.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
        add_wind(material, kind == "grass")

    vertex = expression(material, unreal.MaterialExpressionVertexColor, -900, -170)
    albedo = multiply(material, vertex, "RGB", 1.5, -640, -170)
    if spec.get("diffuse"):
        detail = texture_node(material, spec["diffuse"], "color", -920, 40)
        tint = expression(material, unreal.MaterialExpressionMultiply, -350, -100)
        connect(albedo, "", tint, "A")
        connect(detail, "RGB", tint, "B")
        albedo = tint
        if spec.get("masked"):
            if kind == "grass":
                fade = expression(material, unreal.MaterialExpressionPerInstanceFadeAmount, -915, 230)
                alpha = expression(material, unreal.MaterialExpressionMultiply, -590, 160)
                connect(detail, "A", alpha, "A")
                connect(fade, "", alpha, "B")
                plug(alpha, "", PROP.MP_OPACITY_MASK)
            else:
                plug(detail, "A", PROP.MP_OPACITY_MASK)
    plug(albedo, "", PROP.MP_BASE_COLOR)
    if kind in ("leaf", "grass"):
        plug(multiply(material, albedo, "", 0.85, -120, -140), "", PROP.MP_SUBSURFACE_COLOR)

    roughness = spec.get("roughness", 0.9)
    if spec.get("arm"):
        detail = texture_node(material, spec["arm"], "mask", -860, 330)
        plug(detail, "R", PROP.MP_AMBIENT_OCCLUSION)
        plug(multiply(material, detail, "G", roughness, -540, 330), "", PROP.MP_ROUGHNESS)
    elif spec.get("roughMap"):
        detail = texture_node(material, spec["roughMap"], "mask", -860, 330)
        plug(multiply(material, detail, "R", roughness, -540, 330), "", PROP.MP_ROUGHNESS)
    else:
        plug(constant(material, roughness, -300, 240), "", PROP.MP_ROUGHNESS)
    plug(constant(material, spec.get("metalness", 0.0), -300, 310), "", PROP.MP_METALLIC)
    if spec.get("normal"):
        value = texture_node(material, spec["normal"], "normal", -650, 490)
        plug(value, "RGB", PROP.MP_NORMAL)
    finish(material)


def water(spec):
    material = new_material(spec["name"])
    if material is None:
        return
    material.set_editor_property("two_sided", True)
    material.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_SINGLE_LAYER_WATER)
    uv = coordinates(material, 0, 0)
    time = expression(material, unreal.MaterialExpressionTime, -1300, 160)
    normal_texture = texture_node(material, spec["normal"], "normal", -1300, 280, as_object=True)
    # Raw texture data in a Custom node is BC5; reconstruct Z after combining
    # both scrolling wave scales. Unreal flips the source green on import.
    waves = custom(material, """
float2 a = Texture2DSample(Wave, WaveSampler, UV + Clock * float2(0.029, -0.018)).rg * 2.0 - 1.0;
float2 b = Texture2DSample(Wave, WaveSampler, UV * 2.3 + Clock * float2(-0.038, 0.025)).rg * 2.0 - 1.0;
float2 n = a * 0.32 + b * 0.19;
return normalize(float3(n, 1.0));
""", [("UV", uv, ""), ("Clock", time, ""), ("Wave", normal_texture, "")],
        unreal.CustomMaterialOutputType.CMOT_FLOAT3, x=-380, y=260)
    plug(waves, "", PROP.MP_NORMAL)
    depth = expression(material, unreal.MaterialExpressionVertexColor, -1260, -160)
    tone = custom(material, "return lerp(float3(.06,.10,.076),float3(.014,.052,.060), saturate(Depth));",
                  [("Depth", depth, "R")], unreal.CustomMaterialOutputType.CMOT_FLOAT3, x=-590, y=-120)
    plug(tone, "", PROP.MP_BASE_COLOR)
    plug(constant(material, 0.13, -250, -210), "", PROP.MP_ROUGHNESS)
    plug(constant(material, 0.17, -250, -130), "", PROP.MP_OPACITY)
    output = expression(material, unreal.MaterialExpressionSingleLayerWaterMaterialOutput, 40, 490)
    connect(color(material, (0.00044, 0.00066, 0.00057), -320, 540), "", output, "Scattering Coefficients")
    connect(color(material, (0.0058, 0.0028, 0.0024), -320, 630), "", output, "Absorption Coefficients")
    connect(constant(material, 0.18, -320, 720), "", output, "PhaseG")
    connect(constant(material, 1.0, -320, 800), "", output, "Color Scale Behind Water")
    finish(material)


def target(name, rgb, emission):
    material = new_material(name)
    if material is None:
        return
    tint = color(material, rgb, -480, -100)
    plug(tint, "", PROP.MP_BASE_COLOR)
    plug(constant(material, 0.52, -320, 190), "", PROP.MP_ROUGHNESS)
    if emission:
        plug(multiply(material, tint, "", emission, -220, 0), "", PROP.MP_EMISSIVE_COLOR)
    finish(material)


catalog = json.loads((ART / "NormandyMaterials.json").read_text(encoding="utf-8"))
for spec in catalog["materials"]:
    if "layers" in spec:
        terrain(spec)
    elif spec.get("kind") == "water":
        water(spec)
    else:
        surface(spec)
target("Target", (0.82, 0.123, 0.022), 0.58)
target("Stand", (0.09, 0.11, 0.13), 0.0)
target("Tracer", (1.0, 0.25, 0.015), 18.0)
unreal.log("Steel Front high-quality materials are ready")
