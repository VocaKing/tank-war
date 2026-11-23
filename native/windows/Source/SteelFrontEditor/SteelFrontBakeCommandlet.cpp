#include "SteelFrontBakeCommandlet.h"

#include "AssetCompilingManager.h"
#include "HAL/FileManager.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Engine/StaticMesh.h"
#include "MeshDescription.h"
#include "Materials/MaterialInterface.h"
#include "Misc/CommandLine.h"
#include "Misc/PackageName.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "StaticMeshAttributes.h"
#include "SteelFrontSlice.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"
#include "UObject/UnrealType.h"

namespace
{
bool WriteDescription(FMeshDescription& Description, UStaticMesh& Mesh, const SteelFront::FSliceMesh& Source)
{
    FStaticMeshAttributes Attributes(Description);
    Attributes.Register();
    auto Positions = Attributes.GetVertexPositions();
    auto Normals = Attributes.GetVertexInstanceNormals();
    auto Colors = Attributes.GetVertexInstanceColors();
    auto Uvs = Attributes.GetVertexInstanceUVs();
    Uvs.SetNumChannels(5);

    TArray<FVertexID> Vertices;
    Vertices.Reserve(Source.Positions.Num());
    for (const FVector& Position : Source.Positions)
    {
        const FVertexID Vertex = Description.CreateVertex();
        Positions[Vertex] = FVector3f(Position);
        Vertices.Add(Vertex);
    }

    for (const SteelFront::FMaterialRange& Range : Source.Materials)
    {
        const FName Slot = Range.Name;
        const FString Name = Slot.ToString();
        const FString Path = FString::Printf(TEXT("/Game/Prototype/Quality/Materials/M_%s.M_%s"), *Name, *Name);
        auto* Material = LoadObject<UMaterialInterface>(nullptr, *Path);
        if (!Material)
        {
            UE_LOG(LogTemp, Error, TEXT("Missing baked material at %s"), *Path);
            return false;
        }
        Mesh.GetStaticMaterials().Add(FStaticMaterial(Material, Slot, Slot));
        const FPolygonGroupID Group = Description.CreatePolygonGroup();
        Attributes.GetPolygonGroupMaterialSlotNames()[Group] = Slot;
        for (int32 Offset = Range.FirstIndex; Offset < Range.FirstIndex + Range.NumIndices; Offset += 3)
        {
            const int32* Indices = Source.Indices.GetData() + Offset;
            const FVector Cross = FVector::CrossProduct(Source.Positions[Indices[1]] - Source.Positions[Indices[0]],
                Source.Positions[Indices[2]] - Source.Positions[Indices[0]]);
            if (Cross.IsNearlyZero(1e-6)) continue;
            const FVector Face = Cross.GetSafeNormal();
            FVertexInstanceID Corners[3];
            // Unreal's static mesh convention uses clockwise faces.
            for (int32 Corner = 0; Corner < 3; ++Corner)
            {
                const int32 Index = Indices[2 - Corner];
                const auto Instance = Description.CreateVertexInstance(Vertices[Index]);
                Corners[Corner] = Instance;
                Normals[Instance] = FVector3f(Source.Normals[Index].IsNearlyZero() ? Face : Source.Normals[Index]);
                const FLinearColor& Color = Source.Colors[Index];
                Colors[Instance] = FVector4f(Color.R, Color.G, Color.B, Color.A);
                const FLinearColor& Extra = Source.Extra[Index];
                const FVector3f& Road = Source.Road[Index];
                Uvs.Set(Instance, 0, Source.UV[Index]);
                Uvs.Set(Instance, 1, FVector2f(Extra.R, Extra.G));
                Uvs.Set(Instance, 2, FVector2f(Extra.B, Extra.A));
                Uvs.Set(Instance, 3, FVector2f(Road.X, Road.Y));
                Uvs.Set(Instance, 4, FVector2f(Road.Z, float(Source.Positions[Index].Z * 0.01)));
            }
            Description.CreateTriangle(Group, MakeArrayView(Corners));
        }
    }
    return true;
}

bool Bake(const SteelFront::FSliceMesh& Source, SteelFront::ESection Section)
{
    const FString Name = FString(TEXT("SM_")) + SteelFront::SectionNames[Section];
    const FString LongName = FString(TEXT("/Game/Prototype/Quality/Meshes/")) + Name;
    FString Filename;
    if (!FPackageName::TryConvertLongPackageNameToFilename(LongName, Filename, FPackageName::GetAssetPackageExtension()))
        return false;
    if (FPaths::FileExists(Filename) && !FParse::Param(FCommandLine::Get(), TEXT("rebuild")))
        return true;

    UPackage* Package = CreatePackage(*LongName);
    auto* Mesh = NewObject<UStaticMesh>(Package, FName(*Name), RF_Public | RF_Standalone);
    Mesh->SetNumSourceModels(1);
    FMeshDescription* Description = Mesh->CreateMeshDescription(0);
    if (!Description || !WriteDescription(*Description, *Mesh, Source)) return false;
    FStaticMeshSourceModel& Model = Mesh->GetSourceModel(0);
    Model.BuildSettings.bRecomputeNormals = false;
    Model.BuildSettings.bRecomputeTangents = true;
    Model.BuildSettings.bGenerateLightmapUVs = false;
    Model.BuildSettings.bUseFullPrecisionUVs = true;
    if (Section == SteelFront::Terrain || Section == SteelFront::Buildings || Section == SteelFront::Foliage
        || Section == SteelFront::Horizon || Section == SteelFront::Pebbles)
    {
        const auto* Nanite = FindFProperty<FStructProperty>(UStaticMesh::StaticClass(), TEXT("NaniteSettings"));
        if (!Nanite || Nanite->Struct != FMeshNaniteSettings::StaticStruct())
        {
            UE_LOG(LogTemp, Error, TEXT("Static mesh Nanite settings are unavailable"));
            return false;
        }
        Nanite->ContainerPtrToValuePtr<FMeshNaniteSettings>(Mesh)->bEnabled = true;
    }
    Mesh->CommitMeshDescription(0);
    Mesh->Build(false);
    FAssetCompilingManager::Get().FinishAllCompilation();
    IFileManager::Get().MakeDirectory(*FPaths::GetPath(Filename), true);
    Mesh->MarkPackageDirty();
    FAssetRegistryModule::AssetCreated(Mesh);
    FSavePackageArgs Args;
    Args.TopLevelFlags = RF_Public | RF_Standalone;
    if (!UPackage::SavePackage(Package, Mesh, *Filename, Args)) return false;
    UE_LOG(LogTemp, Display, TEXT("Steel Front prepared %s"), *LongName);
    return true;
}
}

USteelFrontBakeCommandlet::USteelFrontBakeCommandlet()
{
    IsClient = false;
    IsServer = false;
    IsEditor = true;
    LogToConsole = true;
}

int32 USteelFrontBakeCommandlet::Main(const FString& Params)
{
    SteelFront::FSlice Slice;
    if (!SteelFront::LoadSlice(Slice))
    {
        UE_LOG(LogTemp, Error, TEXT("Could not read Normandy.sfbin"));
        return 1;
    }
    for (const auto Section : {SteelFront::Terrain, SteelFront::Buildings, SteelFront::Water,
        SteelFront::Hull, SteelFront::Turret, SteelFront::Gun, SteelFront::Foliage,
        SteelFront::Grass, SteelFront::Pebbles, SteelFront::Horizon,
        SteelFront::RoadWheel, SteelFront::Sprocket, SteelFront::TrackLink})
    {
        if (!Bake(Slice.Sections[Section], Section))
        {
            UE_LOG(LogTemp, Error, TEXT("Could not build %s"), SteelFront::SectionNames[Section]);
            return 1;
        }
    }
    return 0;
}
