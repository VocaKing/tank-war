#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SteelFrontImpact.generated.h"

class UProceduralMeshComponent;

UCLASS()
class ASteelFrontImpact : public AActor
{
    GENERATED_BODY()

public:
    ASteelFrontImpact();
    void BeginBurst(const FVector& Normal, bool bHighExplosive);
    void Tick(float DeltaSeconds) override;

private:
    struct FPuff
    {
        FVector Offset, Velocity;
        FLinearColor Tint;
        double Delay, Life, InitialSize, FinalSize, Angle, Spin, Lift;
    };

    UPROPERTY()
    TObjectPtr<UProceduralMeshComponent> Cloud;
    TArray<FPuff> Puffs;
    TArray<FVector> Vertices;
    TArray<FVector2D> UVs;
    TArray<FColor> Colors;
    double Age = 0.0;
};
