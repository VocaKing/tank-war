#include "SteelFrontImpact.h"

#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Materials/MaterialInterface.h"
#include "ProceduralMeshComponent.h"

ASteelFrontImpact::ASteelFrontImpact()
{
    PrimaryActorTick.bCanEverTick = true;
    Cloud = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Cloud"));
    SetRootComponent(Cloud);
    Cloud->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Cloud->SetCanEverAffectNavigation(false);
    Cloud->SetCastShadow(false);
    Cloud->SetVisibleInRayTracing(false);
    Cloud->SetAffectDistanceFieldLighting(false);
}

void ASteelFrontImpact::BeginBurst(const FVector& Normal, bool bHighExplosive)
{
    auto* Material = LoadObject<UMaterialInterface>(nullptr,
        TEXT("/Game/Prototype/Quality/Materials/M_ImpactCloud.M_ImpactCloud"));
    if (!Material)
    {
        Destroy();
        return;
    }
    Cloud->SetMaterial(0, Material);
    const double Scale = bHighExplosive ? 1.0 : 0.53;
    const FQuat Surface = FQuat::FindBetweenNormals(FVector::UpVector, Normal.GetSafeNormal());
    FRandomStream Rng(FMath::Rand());
    const auto Emit = [&](int32 Count, const FLinearColor& Tint, double Speed, double Vertical,
        double Delay, double Life, double Size, double Lift, bool bAlongSurface)
    {
        for (int32 Index = 0; Index < Count; ++Index)
        {
            const double Heading = (Index + Rng.FRand()) * UE_DOUBLE_PI * 2.0 / Count;
            FVector Velocity(FMath::Cos(Heading) * Speed, FMath::Sin(Heading) * Speed, Vertical);
            Velocity *= Scale * Rng.FRandRange(0.65f, 1.32f);
            if (bAlongSurface)
            {
                Velocity = Surface.RotateVector(Velocity);
                Velocity.Z = FMath::Max(38.0, Velocity.Z);
            }
            Puffs.Add({Normal * (42.0 * Scale), Velocity, Tint,
                Rng.FRand() * Delay, Life * Rng.FRandRange(0.75f, 1.18f),
                Size * Scale * 0.24, Size * Scale * Rng.FRandRange(0.72f, 1.26f),
                Heading, Rng.FRandRange(-0.62f, 0.62f), Lift * Scale});
        }
    };
    Emit(bHighExplosive ? 13 : 5, FLinearColor(1.f, 0.24f, 0.018f, 0.93f),
        480, 390, 0.09, 0.68, 610, 40, true);
    Emit(bHighExplosive ? 16 : 7, FLinearColor(0.53f, 0.40f, 0.24f, 0.73f),
        690, 96, 0.18, 3.9, 710, 17, true);
    Emit(bHighExplosive ? 21 : 8, FLinearColor(0.16f, 0.15f, 0.14f, 0.84f),
        290, 640, 1.45, bHighExplosive ? 8.6 : 4.0, 900, 105, false);
    Emit(bHighExplosive ? 7 : 3, FLinearColor(0.28f, 0.25f, 0.20f, 0.42f),
        90, 135, 2.15, bHighExplosive ? 7.5 : 3.1, 540, 58, false);

    TArray<int32> Indices;
    Vertices.Init(FVector::ZeroVector, Puffs.Num() * 4);
    Colors.Init(FColor(0, 0, 0, 0), Vertices.Num());
    UVs.Reserve(Vertices.Num());
    for (int32 Base = 0; Base < Vertices.Num(); Base += 4)
    {
        const int32 Quad[] = {Base, Base + 1, Base + 2, Base, Base + 2, Base + 3};
        Indices.Append(Quad, UE_ARRAY_COUNT(Quad));
        const FVector2D Corners[] = {{0, 1}, {1, 1}, {1, 0}, {0, 0}};
        UVs.Append(Corners, UE_ARRAY_COUNT(Corners));
    }
    Cloud->CreateMeshSection(0, Vertices, Indices, {}, UVs, Colors, {}, false);
    SetLifeSpan(bHighExplosive ? 12.5f : 6.5f);
}

void ASteelFrontImpact::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    Age += DeltaSeconds;
    const APlayerController* Player = GetWorld()->GetFirstPlayerController();
    if (!Player || Puffs.IsEmpty()) return;

    FVector Eye;
    FRotator View;
    Player->GetPlayerViewPoint(Eye, View);
    const FVector Right = FRotationMatrix(View).GetUnitAxis(EAxis::Y);
    const FVector Up = FRotationMatrix(View).GetUnitAxis(EAxis::Z);
    const FVector Forward = View.Vector();
    const FVector Origin = GetActorLocation();
    struct FBillboard
    {
        const FPuff* Puff;
        FVector Center;
        double Age, Depth;
    };
    TArray<FBillboard, TInlineAllocator<64>> Visible;
    for (const FPuff& Puff : Puffs)
    {
        const double Time = Age - Puff.Delay;
        if (Time <= 0 || Time >= Puff.Life) continue;
        const double Travel = (1.0 - FMath::Exp(-Time * 1.6)) / 1.6;
        const FVector Drift(36.0 * Time + FMath::Sin(Time + Puff.Angle) * 24.0,
            -18.0 * Time, Puff.Lift * Time);
        const FVector Center = Puff.Offset + Puff.Velocity * Travel + Drift;
        const double Depth = FVector::DotProduct(Center + Origin - Eye, Forward);
        if (Depth > 20.0) Visible.Add({&Puff, Center, Time, Depth});
    }
    Visible.Sort([](const FBillboard& A, const FBillboard& B) { return A.Depth > B.Depth; });
    int32 Base = 0;
    for (const auto& Item : Visible)
    {
        const FPuff& Puff = *Item.Puff;
        const double Progress = Item.Age / Puff.Life;
        const double Half = FMath::Lerp(Puff.InitialSize, Puff.FinalSize, FMath::Sqrt(Progress)) * 0.5;
        const double Angle = Puff.Angle + Item.Age * Puff.Spin;
        const FVector X = (Right * FMath::Cos(Angle) + Up * FMath::Sin(Angle)) * Half;
        const FVector Y = (Up * FMath::Cos(Angle) - Right * FMath::Sin(Angle)) * Half;
        Vertices[Base] = Item.Center - X - Y;
        Vertices[Base + 1] = Item.Center + X - Y;
        Vertices[Base + 2] = Item.Center + X + Y;
        Vertices[Base + 3] = Item.Center - X + Y;
        FLinearColor Tint = Puff.Tint;
        const double NearFade = FMath::Clamp(Item.Depth / (Half * 0.7 + 20.0), 0.0, 1.0);
        Tint.A *= float(FMath::Min(1.0, Item.Age / 0.24) * FMath::Pow(1.0 - Progress, 0.84) * NearFade);
        const FColor Color = Tint.ToFColor(false);
        for (int32 Corner = 0; Corner < 4; ++Corner) Colors[Base++] = Color;
    }
    for (int32 Index = Base; Index < Vertices.Num(); ++Index)
    {
        Vertices[Index] = FVector::ZeroVector;
        Colors[Index] = FColor(0, 0, 0, 0);
    }
    Cloud->UpdateMeshSection(0, Vertices, {}, UVs, Colors, {});
}
