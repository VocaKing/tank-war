#include "SteelFrontBakeCommandlet.h"

#include "AssetCompilingManager.h"
#include "HAL/FileManager.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Engine/StaticMesh.h"
#include "MeshDescription.h"
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
FVector2f SurfaceUV(const FVector& Position, const FVector& Face, double Repeat)
{
    const FVector Normal = Face.GetAbs();
    if (Normal.Z >= Normal.X && Normal.Z >= Normal.Y)
        return FVector2f(Position.X / Repeat, Position.Y / Repeat);
    if (Normal.X >= Normal.Y)
        return FVector2f(Position.Y / Repeat, -Position.Z / Repeat);
    return FVector2f(Position.X / Repeat, -Position.Z / Repeat);
}

void WriteDescription(FMeshDescription& Description, const SteelFront::FSliceMesh& Source, double Repeat)
{
    FStaticMeshAttributes Attributes(Description);
    Attributes.Register();
    auto Positions = Attributes.GetVertexPositions();
    auto Normals = Attributes.GetVertexInstanceNormals();
    auto Colors = Attributes.GetVertexInstanceColors();
    auto Uvs = Attributes.GetVertexInstanceUVs();
    Uvs.SetNumChannels(1);
    const FPolygonGroupID Group = Description.CreatePolygonGroup();
    Attributes.GetPolygonGroupMaterialSlotNames()[Group] = FName(TEXT("Surface"));

    TArray<FVertexID> Vertices;
    Vertices.Reserve(Source.Positions.Num());
    for (const FVector& Position : Source.Positions)
    {
        const FVertexID Vertex = Description.CreateVertex();
        Positions[Vertex] = FVector3f(Position);
        Vertices.Add(Vertex);
    }
    for (int32 Offset = 0; Offset < Source.Indices.Num(); Offset += 3)
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
            const FVector Normal = Source.Normals[Index].IsNearlyZero() ? Face : Source.Normals[Index];
            Normals[Instance] = FVector3f(Normal);
            const FLinearColor& Color = Source.Colors[Index];
            Colors[Instance] = FVector4f(Color.R, Color.G, Color.B, Color.A);
            Uvs.Set(Instance, 0, SurfaceUV(Source.Positions[Index], Face, Repeat));
        }
        Description.CreateTriangle(Group, MakeArrayView(Corners));
    }
}

bool Bake(const SteelFront::FSliceMesh& Source, SteelFront::ESection Section)
{
    const FString Name = FString(TEXT("SM_")) + SteelFront::SectionNames[Section];
    const FString LongName = FString(TEXT("/Game/Prototype/Meshes/")) + Name;
    FString Filename;
    if (!FPackageName::TryConvertLongPackageNameToFilename(LongName, Filename, FPackageName::GetAssetPackageExtension()))
        return false;
    if (FPaths::FileExists(Filename) && !FParse::Param(FCommandLine::Get(), TEXT("rebuild")))
        return true;

    UPackage* Package = CreatePackage(*LongName);
    auto* Mesh = NewObject<UStaticMesh>(Package, FName(*Name), RF_Public | RF_Standalone);
    Mesh->SetNumSourceModels(1);
    Mesh->GetStaticMaterials().Add(FStaticMaterial(nullptr, FName(TEXT("Surface")), FName(TEXT("Surface"))));
    FMeshDescription* Description = Mesh->CreateMeshDescription(0);
    if (!Description) return false;
    WriteDescription(*Description, Source, Section == SteelFront::Terrain ? 390.0 :
        Section == SteelFront::Water ? 420.0 : 210.0);
    FStaticMeshSourceModel& Model = Mesh->GetSourceModel(0);
    Model.BuildSettings.bRecomputeNormals = false;
    Model.BuildSettings.bRecomputeTangents = true;
    Model.BuildSettings.bGenerateLightmapUVs = false;
    if (Section == SteelFront::Terrain || Section == SteelFront::Buildings || Section == SteelFront::Foliage)
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
        SteelFront::Hull, SteelFront::Turret, SteelFront::Gun, SteelFront::Foliage})
    {
        if (!Bake(Slice.Sections[Section], Section))
        {
            UE_LOG(LogTemp, Error, TEXT("Could not build %s"), SteelFront::SectionNames[Section]);
            return 1;
        }
    }
    return 0;
}
