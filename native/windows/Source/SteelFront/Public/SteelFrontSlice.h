#pragma once

#include "CoreMinimal.h"

namespace SteelFront
{
enum ESection { Terrain, Buildings, Water, Hull, Turret, Gun, Foliage, Walls, Decks, SectionCount };
inline const TCHAR* const SectionNames[] =
    { TEXT("Terrain"), TEXT("Buildings"), TEXT("Water"), TEXT("Hull"), TEXT("Turret"),
      TEXT("Gun"), TEXT("Foliage"), TEXT("Walls"), TEXT("Decks") };

struct FSliceMesh
{
    TArray<FVector> Positions;
    TArray<FVector> Normals;
    TArray<FLinearColor> Colors;
    TArray<int32> Indices;
};

struct FSlice
{
    FVector Spawn = FVector::ZeroVector;
    float Heading = 0;
    FVector TurretMount = FVector::ZeroVector;
    FVector GunMount = FVector::ZeroVector;
    float BarrelLength = 0;
    FSliceMesh Sections[SectionCount];
};

STEELFRONT_API bool LoadSlice(FSlice& Slice);
}
