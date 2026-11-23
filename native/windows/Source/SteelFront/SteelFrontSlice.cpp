#include "SteelFrontSlice.h"

#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/MemoryReader.h"

namespace SteelFront
{
static FVector ReadVector(FMemoryReader& Reader)
{
    float X, Y, Z;
    Reader << X << Y << Z;
    return FVector(X, Y, Z);
}

bool LoadSlice(FSlice& Slice)
{
    TArray<uint8> Bytes;
    const FString Path = FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Prototype/Normandy.sfbin"));
    if (!FFileHelper::LoadFileToArray(Bytes, *Path) || Bytes.Num() < 52 || Bytes.Num() > 64 * 1024 * 1024)
    {
        return false;
    }

    FMemoryReader Reader(Bytes, true);
    uint32 Magic = 0;
    uint32 Count = 0;
    Reader << Magic << Count;
    if (Magic != 0x324d4653 || Count != UE_ARRAY_COUNT(Slice.Sections))
    {
        return false;
    }
    Slice.Spawn = ReadVector(Reader);
    Reader << Slice.Heading;
    Slice.TurretMount = ReadVector(Reader);
    Slice.GunMount = ReadVector(Reader);
    Reader << Slice.BarrelLength;
    if (Slice.Spawn.ContainsNaN() || Slice.TurretMount.ContainsNaN() || Slice.GunMount.ContainsNaN()
        || !FMath::IsFinite(Slice.Heading) || !FMath::IsFinite(Slice.BarrelLength))
    {
        return false;
    }

    for (FSliceMesh& Mesh : Slice.Sections)
    {
        uint32 Vertices = 0;
        uint32 Indices = 0;
        Reader << Vertices << Indices;
        if (Reader.IsError() || Vertices == 0 || Vertices > 750000 || Indices > 2250000 || Indices % 3 != 0
            || Reader.TotalSize() - Reader.Tell() < int64(Vertices) * 28 + int64(Indices) * 4)
        {
            return false;
        }
        Mesh.Positions.Reserve(Vertices);
        Mesh.Normals.Reserve(Vertices);
        Mesh.Colors.Reserve(Vertices);
        for (uint32 Index = 0; Index < Vertices; ++Index)
        {
            const FVector Position = ReadVector(Reader);
            const FVector Normal = ReadVector(Reader);
            uint8 RGBA[4] = {};
            Reader.Serialize(RGBA, sizeof(RGBA));
            if (Position.ContainsNaN() || Normal.ContainsNaN()) return false;
            Mesh.Positions.Add(Position);
            Mesh.Normals.Add(Normal.GetSafeNormal());
            Mesh.Colors.Emplace(RGBA[0] / 255.f, RGBA[1] / 255.f, RGBA[2] / 255.f, RGBA[3] / 255.f);
        }

        Mesh.Indices.Reserve(Indices);
        for (uint32 Index = 0; Index < Indices; ++Index)
        {
            uint32 Vertex = 0;
            Reader << Vertex;
            if (Vertex >= Vertices) return false;
            Mesh.Indices.Add(Vertex);
        }
    }
    return !Reader.IsError() && Reader.Tell() == Reader.TotalSize();
}
}
