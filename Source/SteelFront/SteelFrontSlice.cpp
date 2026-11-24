#include "SteelFrontSlice.h"

#include "Misc/Compression.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/MemoryReader.h"

namespace SteelFront
{
namespace
{
constexpr int64 MaxRawBytes = 200 * 1024 * 1024;
constexpr int64 VertexBytes = 52;

FVector ReadVector(FMemoryReader& Reader)
{
    float X = 0, Y = 0, Z = 0;
    Reader << X << Y << Z;
    return FVector(X, Y, Z);
}

FLinearColor ReadColor(FMemoryReader& Reader)
{
    uint8 Bytes[4] = {};
    Reader.Serialize(Bytes, sizeof(Bytes));
    return FLinearColor(Bytes[0] / 255.f, Bytes[1] / 255.f, Bytes[2] / 255.f, Bytes[3] / 255.f);
}

bool ReadGroups(FMemoryReader& Reader, FSliceMesh& Mesh, uint32 Count, uint32 Indices)
{
    uint32 First = 0;
    for (uint32 Group = 0; Group < Count; ++Group)
    {
        uint32 NameLength = 0, GroupIndices = 0;
        Reader << NameLength << GroupIndices;
        if (Reader.IsError() || NameLength == 0 || NameLength > 80 || GroupIndices == 0
            || GroupIndices % 3 || GroupIndices > Indices - First) return false;

        ANSICHAR Name[81] = {};
        Reader.Serialize(Name, NameLength);
        for (uint32 I = 0; I < NameLength; ++I)
        {
            const ANSICHAR Ch = Name[I];
            if (!((Ch >= 'A' && Ch <= 'Z') || (Ch >= 'a' && Ch <= 'z') ||
                (Ch >= '0' && Ch <= '9') || Ch == '_')) return false;
        }
        Mesh.Materials.Add({FName(ANSI_TO_TCHAR(Name)), int32(First), int32(GroupIndices)});
        First += GroupIndices;
    }
    return First == Indices;
}

bool ReadWheels(FMemoryReader& Reader, TArray<FWheel>& Wheels, uint32 Count)
{
    Wheels.Reserve(Count);
    for (uint32 Index = 0; Index < Count; ++Index)
    {
        FWheel Wheel;
        Wheel.Center = ReadVector(Reader);
        Reader << Wheel.RadiusMetres << Wheel.WidthMetres;
        if (Reader.IsError() || Wheel.Center.ContainsNaN() || !FMath::IsFinite(Wheel.RadiusMetres)
            || !FMath::IsFinite(Wheel.WidthMetres) || Wheel.RadiusMetres < 0.05f || Wheel.WidthMetres < 0.02f) return false;
        Wheels.Add(Wheel);
    }
    return true;
}

bool ReadMesh(FMemoryReader& Reader, FSliceMesh& Mesh)
{
    uint32 Vertices = 0, Indices = 0, Materials = 0;
    Reader << Vertices << Indices << Materials;
    if (Reader.IsError() || Vertices == 0 || Vertices > 2000000 || Indices == 0 || Indices > 6000000
        || Materials == 0 || Materials > 128 || !ReadGroups(Reader, Mesh, Materials, Indices)
        || Reader.TotalSize() - Reader.Tell() < int64(Vertices) * VertexBytes + int64(Indices) * 4) return false;

    Mesh.Positions.Reserve(Vertices);
    Mesh.Normals.Reserve(Vertices);
    Mesh.UV.Reserve(Vertices);
    Mesh.Colors.Reserve(Vertices);
    Mesh.Extra.Reserve(Vertices);
    Mesh.Road.Reserve(Vertices);
    for (uint32 Index = 0; Index < Vertices; ++Index)
    {
        const FVector Position = ReadVector(Reader);
        const FVector Normal = ReadVector(Reader);
        float U = 0, V = 0;
        Reader << U << V;
        if (Position.ContainsNaN() || Normal.ContainsNaN() || !FMath::IsFinite(U) || !FMath::IsFinite(V)) return false;

        Mesh.Positions.Add(Position);
        Mesh.Normals.Add(Normal.GetSafeNormal());
        Mesh.UV.Emplace(U, V);
        Mesh.Colors.Add(ReadColor(Reader));
        Mesh.Extra.Add(ReadColor(Reader));
        const FVector Road = ReadVector(Reader);
        if (Road.ContainsNaN()) return false;
        Mesh.Road.Add(FVector3f(Road));
    }

    Mesh.Indices.Reserve(Indices);
    for (uint32 Index = 0; Index < Indices; ++Index)
    {
        uint32 Vertex = 0;
        Reader << Vertex;
        if (Vertex >= Vertices) return false;
        Mesh.Indices.Add(int32(Vertex));
    }
    return !Reader.IsError();
}
}

bool LoadSlice(FSlice& Slice)
{
    TArray<uint8> Packed;
    const FString Path = FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Prototype/Normandy.sfbin"));
    if (!FFileHelper::LoadFileToArray(Packed, *Path) || Packed.Num() < 8) return false;
    FMemoryReader PackedHeader(Packed, true);
    uint32 Magic = 0, RawSize = 0;
    PackedHeader << Magic << RawSize;
    if (Magic != 0x334d4653 || RawSize < 76 || RawSize > MaxRawBytes) return false;

    TArray<uint8> Bytes;
    Bytes.SetNumUninitialized(RawSize);
    if (!FCompression::UncompressMemory(NAME_Zlib, Bytes.GetData(), Bytes.Num(), Packed.GetData() + 8, Packed.Num() - 8))
        return false;
    Packed.Empty();

    FMemoryReader Reader(Bytes, true);
    uint32 Count = 0, GrassCount = 0, WheelCount = 0, SprocketCount = 0, TrackSamples = 0, Links = 0;
    FRunningGear& Gear = Slice.RunningGear;
    Reader << Count;
    if (Count != SectionCount) return false;
    Slice.Spawn = ReadVector(Reader);
    Reader << Slice.Heading;
    Slice.TurretMount = ReadVector(Reader);
    Slice.GunMount = ReadVector(Reader);
    Reader << Slice.BarrelLength << GrassCount << WheelCount << SprocketCount << TrackSamples << Links << Gear.Length << Gear.HalfSpan;
    if (Reader.IsError() || Slice.Spawn.ContainsNaN() || Slice.TurretMount.ContainsNaN() || Slice.GunMount.ContainsNaN()
        || !FMath::IsFinite(Slice.Heading) || !FMath::IsFinite(Slice.BarrelLength) || GrassCount > 300000
        || WheelCount > 80 || SprocketCount > 8 || TrackSamples < 8 || TrackSamples > 2048 || Links < 8 || Links > 256
        || !FMath::IsFinite(Gear.Length) || Gear.Length < 100 || !FMath::IsFinite(Gear.HalfSpan) || Gear.HalfSpan < 20
        || Reader.TotalSize() - Reader.Tell() < int64(GrassCount) * 28 + int64(WheelCount + SprocketCount) * 20 + int64(TrackSamples) * 8)
        return false;
    Gear.LinksPerTrack = int32(Links);

    Slice.GrassTransforms.Reserve(GrassCount);
    for (uint32 Index = 0; Index < GrassCount; ++Index)
    {
        const FVector Position = ReadVector(Reader);
        float Yaw = 0;
        Reader << Yaw;
        const FVector Scale = ReadVector(Reader);
        if (Position.ContainsNaN() || Scale.ContainsNaN() || !FMath::IsFinite(Yaw) || Scale.GetMin() <= 0) return false;
        Slice.GrassTransforms.Emplace(FRotator(0, Yaw, 0), Position, Scale);
    }

    if (!ReadWheels(Reader, Gear.Wheels, WheelCount) || !ReadWheels(Reader, Gear.Sprockets, SprocketCount)) return false;
    Gear.Loop.Reserve(TrackSamples);
    for (uint32 Index = 0; Index < TrackSamples; ++Index)
    {
        float X = 0, Y = 0;
        Reader << X << Y;
        if (!FMath::IsFinite(X) || !FMath::IsFinite(Y)) return false;
        Gear.Loop.Emplace(X, Y);
    }
    for (FSliceMesh& Mesh : Slice.Sections) if (!ReadMesh(Reader, Mesh)) return false;
    return !Reader.IsError() && Reader.Tell() == Reader.TotalSize();
}
}
