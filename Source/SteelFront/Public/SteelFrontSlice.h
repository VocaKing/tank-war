#pragma once

#include "CoreMinimal.h"

namespace SteelFront
{
enum ESection { Terrain, Buildings, Water, Hull, Turret, Gun, Foliage, Walls, Decks, Grass, Pebbles, Horizon, RoadWheel, Sprocket, TrackLink, SectionCount };
inline const TCHAR* const SectionNames[] =
    { TEXT("Terrain"), TEXT("Buildings"), TEXT("Water"), TEXT("Hull"), TEXT("Turret"), TEXT("Gun"),
      TEXT("Foliage"), TEXT("Walls"), TEXT("Decks"), TEXT("Grass"), TEXT("Pebbles"), TEXT("Horizon"),
      TEXT("RoadWheel"), TEXT("Sprocket"), TEXT("TrackLink") };

struct FMaterialRange
{
    FName Name;
    int32 FirstIndex = 0;
    int32 NumIndices = 0;
};

struct FSliceMesh
{
    TArray<FVector> Positions;
    TArray<FVector> Normals;
    TArray<FLinearColor> Colors;
    TArray<FLinearColor> Extra;
    TArray<FVector2f> UV;
    TArray<FVector3f> Road;
    TArray<int32> Indices;
    TArray<FMaterialRange> Materials;
};

struct FWheel
{
    FVector Center;
    float RadiusMetres = 0;
    float WidthMetres = 0;
};

struct FRunningGear
{
    TArray<FWheel> Wheels;
    TArray<FWheel> Sprockets;
    TArray<FVector2D> Loop;
    int32 LinksPerTrack = 0;
    float Length = 0;
    float HalfSpan = 0;
};

struct FSlice
{
    FVector Spawn = FVector::ZeroVector;
    float Heading = 0;
    FVector TurretMount = FVector::ZeroVector;
    FVector GunMount = FVector::ZeroVector;
    float BarrelLength = 0;
    TArray<FTransform> GrassTransforms;
    FRunningGear RunningGear;
    FSliceMesh Sections[SectionCount];
};

STEELFRONT_API bool LoadSlice(FSlice& Slice);
}
