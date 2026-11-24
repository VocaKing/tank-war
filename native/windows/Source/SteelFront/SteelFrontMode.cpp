#include "SteelFrontMode.h"
#include "SteelFrontPracticeMath.h"
#include "SteelFrontSlice.h"

#include "Camera/CameraComponent.h"
#include "Camera/PlayerCameraManager.h"
#include "Components/BoxComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/InputComponent.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/Canvas.h"
#include "Engine/DirectionalLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/PointLight.h"
#include "Engine/PostProcessVolume.h"
#include "Engine/SkyAtmosphere.h"
#include "Engine/SkyLight.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "Materials/MaterialInterface.h"
#include "ProceduralMeshComponent.h"

namespace
{
constexpr double RideHeight = 85.0;
constexpr double Boundary = 23400.0;
constexpr double Gravity = 980.0;
constexpr ECollisionChannel GroundChannel = ECC_GameTraceChannel1;
constexpr const TCHAR* CubePath = TEXT("/Engine/BasicShapes/Cube.Cube");

UStaticMeshComponent* AddShape(AActor& Actor, USceneComponent* Parent, UStaticMesh* Mesh,
    UMaterialInterface* Material = nullptr)
{
    auto* Shape = NewObject<UStaticMeshComponent>(&Actor);
    Actor.AddInstanceComponent(Shape);
    if (Parent)
    {
        Shape->SetupAttachment(Parent);
        Shape->SetMobility(Parent->Mobility);
    }
    else Actor.SetRootComponent(Shape);
    Shape->SetStaticMesh(Mesh);
    Shape->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    if (Material) Shape->SetMaterial(0, Material);
    Shape->RegisterComponent();
    return Shape;
}

UStaticMesh* GetBakedMesh(SteelFront::ESection Index)
{
    const TCHAR* Name = SteelFront::SectionNames[Index];
    const FString Path = FString::Printf(TEXT("/Game/Prototype/Quality/Meshes/SM_%s.SM_%s"), Name, Name);
    return LoadObject<UStaticMesh>(nullptr, *Path);
}

UInstancedStaticMeshComponent* AddInstances(AActor& Owner, USceneComponent* Parent, SteelFront::ESection Index,
    bool bGrass)
{
    UStaticMesh* Mesh = GetBakedMesh(Index);
    if (!Mesh) return nullptr;
    auto* Component = bGrass ? NewObject<UHierarchicalInstancedStaticMeshComponent>(&Owner) :
        NewObject<UInstancedStaticMeshComponent>(&Owner);
    Owner.AddInstanceComponent(Component);
    Component->SetupAttachment(Parent);
    Component->SetMobility(Parent->Mobility);
    Component->SetStaticMesh(Mesh);
    Component->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Component->SetCanEverAffectNavigation(false);
    if (bGrass)
    {
        Component->SetCullDistances(5600, 8200);
        Component->SetCastShadow(false);
        // Reserve the ray tracing scene for buildings, terrain and large foliage.
        Component->SetVisibleInRayTracing(false);
        Component->SetAffectDistanceFieldLighting(false);
    }
    Component->RegisterComponent();
    return Component;
}

bool AddSection(AActor& Owner, USceneComponent* Parent, const SteelFront::FSliceMesh& Data,
    SteelFront::ESection Index)
{
    const TCHAR* Name = SteelFront::SectionNames[Index];
    const bool bRoad = Index == SteelFront::Terrain || Index == SteelFront::Decks;
    const bool bBarrier = Index == SteelFront::Walls;
    if (!bBarrier && Index != SteelFront::Decks)
    {
        if (UStaticMesh* Mesh = GetBakedMesh(Index)) AddShape(Owner, Parent, Mesh);
        else return false;
    }
    if (!bRoad && !bBarrier) return true;
    auto* Component = NewObject<UProceduralMeshComponent>(&Owner, FName(Name));
    Owner.AddInstanceComponent(Component);
    Component->SetupAttachment(Parent);
    Component->bUseAsyncCooking = false;
    Component->bUseComplexAsSimpleCollision = bRoad || bBarrier;
    Component->SetCollisionEnabled((bRoad || bBarrier) ? ECollisionEnabled::QueryOnly : ECollisionEnabled::NoCollision);
    Component->SetCollisionResponseToAllChannels(bBarrier ? ECR_Block : ECR_Ignore);
    // Terrain and bridge tops are followed by the suspension. Structure proxies block the hull box.
    if (bRoad)
    {
        Component->SetCollisionResponseToChannel(GroundChannel, ECR_Block);
        Component->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);
        Component->SetCollisionResponseToChannel(ECC_Camera, ECR_Block);
    }
    if (bBarrier) Component->SetCollisionResponseToChannel(GroundChannel, ECR_Ignore);
    Component->SetCollisionObjectType(ECC_WorldStatic);
    Component->SetHiddenInGame(true);
    Component->SetCastShadow(false);
    Component->RegisterComponent();
    Component->CreateMeshSection_LinearColor(0, Data.Positions, Data.Indices, Data.Normals,
        {}, {}, {}, {}, {}, {}, true, false);
    return true;
}

bool GroundAt(UWorld& World, const FVector& Point, const AActor* Ignore, double& Height)
{
    const FCollisionQueryParams Query(SCENE_QUERY_STAT(SteelFrontGround), true, Ignore);
    FHitResult Hit;
    if (!World.LineTraceSingleByChannel(Hit, Point + FVector(0, 0, 220),
        Point - FVector(0, 0, 1700), GroundChannel, Query)) return false;
    Height = Hit.ImpactPoint.Z;
    return true;
}

double Ease(double Rate, double Step)
{
    return 1.0 - FMath::Exp(-Rate * Step);
}

void AddLighting(UWorld& World)
{
    FActorSpawnParameters Params;
    const FVector NormandySun(0.377, 0.555, 0.742);
    if (auto* Sun = World.SpawnActor<ADirectionalLight>(FVector::ZeroVector, (-NormandySun).Rotation(), Params))
    {
        auto* Light = CastChecked<UDirectionalLightComponent>(Sun->GetLightComponent());
        Light->SetMobility(EComponentMobility::Movable);
        Light->SetAtmosphereSunLight(true);
        Light->SetIntensity(7.0f);
        Light->SetLightColor(FLinearColor(0.993f, 1.0f, 0.909f), false);
        Light->SetLightSourceAngle(0.72f);
    }
    World.SpawnActor<ASkyAtmosphere>();
    if (auto* Sky = World.SpawnActor<ASkyLight>())
    {
        Sky->GetLightComponent()->SetMobility(EComponentMobility::Movable);
        Sky->GetLightComponent()->SetIntensity(1.0f);
        Sky->GetLightComponent()->SetRealTimeCaptureEnabled(true);
    }
    if (auto* Fog = World.SpawnActor<AExponentialHeightFog>())
    {
        auto* Component = Fog->FindComponentByClass<UExponentialHeightFogComponent>();
        Component->SetFogDensity(0.0105f);
        Component->SetFogHeightFalloff(0.35f);
        Component->SetFogInscatteringColor(FLinearColor(0.43f, 0.51f, 0.60f));
        Component->SetStartDistance(650.0f);
        Component->SetVolumetricFog(true);
    }
    if (auto* Volume = World.SpawnActor<APostProcessVolume>())
    {
        Volume->bUnbound = true;
        FPostProcessSettings& Settings = Volume->Settings;
        Settings.bOverride_LumenSceneLightingQuality = true;
        Settings.LumenSceneLightingQuality = 1.55f;
        Settings.bOverride_LumenSceneDetail = true;
        Settings.LumenSceneDetail = 1.30f;
        Settings.bOverride_LumenFinalGatherQuality = true;
        Settings.LumenFinalGatherQuality = 1.35f;
        Settings.bOverride_BloomIntensity = true;
        Settings.BloomIntensity = 0.30f;
        Settings.bOverride_MotionBlurAmount = true;
        Settings.MotionBlurAmount = 0.0f;
    }
}

void MoveTracer(AActor& Tracer, const FVector& Position, const FVector& Velocity, double Travel)
{
    const double Length = FMath::Clamp(Travel, 1.0, 400.0);
    const FVector Direction = Velocity.GetSafeNormal();
    Tracer.SetActorLocationAndRotation(Position - Direction * (Length * 0.5), Direction.Rotation());
    Tracer.SetActorScale3D(FVector(Length * 0.01, 0.025, 0.025));
}

AActor* SpawnTracer(UWorld& World, const FVector& Start, const FVector& Velocity)
{
    static const auto TracerPath = TEXT("/Game/Prototype/Quality/Materials/M_Tracer.M_Tracer");
    auto* Material = LoadObject<UMaterialInterface>(nullptr, TracerPath, nullptr, LOAD_NoWarn);
    auto* Mesh = LoadObject<UStaticMesh>(nullptr, CubePath);
    if (!Material || !Mesh) return nullptr;
    auto* Trail = World.SpawnActor<AActor>();
    if (!Trail) return nullptr;
    auto* Shape = AddShape(*Trail, nullptr, Mesh, Material);
    Shape->SetMobility(EComponentMobility::Movable);
    Shape->SetCastShadow(false);
    MoveTracer(*Trail, Start, Velocity, 0.0);
    Trail->SetLifeSpan(1.0f);
    return Trail;
}

void ShowFlash(UWorld& World, const FVector& Position, float Intensity, float Radius)
{
    FActorSpawnParameters Params;
    if (auto* Flash = World.SpawnActor<APointLight>(Position, FRotator::ZeroRotator, Params))
    {
        auto* Light = Flash->FindComponentByClass<UPointLightComponent>();
        Light->SetMobility(EComponentMobility::Movable);
        Light->SetLightColor(FLinearColor(1.0f, 0.50f, 0.17f));
        Light->SetIntensity(Intensity);
        Light->SetAttenuationRadius(Radius);
        Light->SetCastShadows(false);
        Flash->SetLifeSpan(0.065f);
    }
}

bool TraceRoundStep(UWorld& World, const FCollisionQueryParams& Query, FVector& Position,
    FVector& Velocity, double Step, FHitResult& Hit)
{
    const FVector Next = Position + Velocity * Step - FVector(0, 0, Gravity * Step * Step * 0.5);
    const bool bHit = World.LineTraceSingleByChannel(Hit, Position, Next, ECC_Visibility, Query);
    Position = bHit ? Hit.ImpactPoint : Next;
    Velocity.Z -= Gravity * Step * (bHit ? Hit.Time : 1.0);
    return bHit;
}
}

ASteelFrontTank::ASteelFrontTank()
{
    PrimaryActorTick.bCanEverTick = true;
    Collision = CreateDefaultSubobject<UBoxComponent>(TEXT("HullCollision"));
    SetRootComponent(Collision);
    Collision->SetBoxExtent(FVector(309, 148, 70));
    Collision->SetCollisionProfileName(TEXT("Pawn"));

    Hull = CreateDefaultSubobject<USceneComponent>(TEXT("Hull"));
    Hull->SetupAttachment(Collision);
    Hull->SetRelativeLocation(FVector(0, 0, -RideHeight));
    Turret = CreateDefaultSubobject<USceneComponent>(TEXT("Turret"));
    Turret->SetupAttachment(Hull);
    Gun = CreateDefaultSubobject<USceneComponent>(TEXT("Gun"));
    Gun->SetupAttachment(Turret);
    Muzzle = CreateDefaultSubobject<USceneComponent>(TEXT("Muzzle"));
    Muzzle->SetupAttachment(Gun);

    Arm = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraArm"));
    Arm->SetupAttachment(Collision);
    Arm->TargetArmLength = 1050;
    Arm->SetRelativeLocation(FVector(0, 0, 210));
    Arm->bUsePawnControlRotation = true;
    Arm->ProbeSize = 26;
    Arm->bEnableCameraLag = true;
    Arm->CameraLagSpeed = 11;
    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
    Camera->SetupAttachment(Arm, USpringArmComponent::SocketName);
    Camera->SetFieldOfView(68);
}

void ASteelFrontTank::SetupPlayerInputComponent(UInputComponent* Input)
{
    Super::SetupPlayerInputComponent(Input);
    Input->BindAxis(TEXT("Drive"), this, &ASteelFrontTank::SetThrottle);
    Input->BindAxis(TEXT("Steer"), this, &ASteelFrontTank::SetSteer);
    Input->BindAxis(TEXT("LookYaw"), this, &ASteelFrontTank::LookYaw);
    Input->BindAxis(TEXT("LookPitch"), this, &ASteelFrontTank::LookPitch);
    Input->BindAction(TEXT("Fire"), IE_Pressed, this, &ASteelFrontTank::Fire);
    Input->BindAction(TEXT("Scope"), IE_Pressed, this, &ASteelFrontTank::ToggleScope);
    Input->BindAction(TEXT("ReleaseMouse"), IE_Pressed, this, &ASteelFrontTank::ReleaseMouse);
    Input->BindAction(TEXT("StartPractice"), IE_Pressed, this, &ASteelFrontTank::StartPractice);
    Input->BindAction(TEXT("ResetTargets"), IE_Pressed, this, &ASteelFrontTank::ResetTargets);
    Input->BindAction(TEXT("Brake"), IE_Pressed, this, &ASteelFrontTank::PressBrake);
    Input->BindAction(TEXT("Brake"), IE_Released, this, &ASteelFrontTank::ReleaseBrake);
}

void ASteelFrontTank::LookYaw(float Value)
{
    auto* Player = Cast<APlayerController>(GetController());
    if (!Player || Player->bShowMouseCursor || !bStarted || Value == 0) return;
    FRotator Look = Player->GetControlRotation();
    Look.Yaw += Value * (bScoped ? 0.12 : 0.38);
    Player->SetControlRotation(Look);
}

void ASteelFrontTank::LookPitch(float Value)
{
    auto* Player = Cast<APlayerController>(GetController());
    if (!Player || Player->bShowMouseCursor || !bStarted || Value == 0) return;
    FRotator Look = Player->GetControlRotation();
    Look.Pitch = FMath::Clamp(FRotator::NormalizeAxis(Look.Pitch) + Value * (bScoped ? 0.12 : 0.38), -49.0, 32.0);
    Player->SetControlRotation(Look);
}

void ASteelFrontTank::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    const auto* Player = Cast<APlayerController>(GetController());
    if (!Player || !bStarted || DeltaSeconds <= 0) return;

    const double Step = FMath::Min(double(DeltaSeconds), 0.05);
    if (Player->bShowMouseCursor)
    {
        UpdateRounds(Step);
        return;
    }
    const FVector Start = GetActorLocation();
    const double Heading = GetActorRotation().Yaw;
    const int32 Substeps = FMath::Max(1, FMath::CeilToInt(Step * 120.0));
    for (int32 Index = 0; Index < Substeps; ++Index) Drive(Step / Substeps);
    UpdateRounds(Step);
    const double Travel = FVector::DotProduct(GetActorLocation() - Start, GetActorForwardVector());
    const double TurnArc = FMath::DegreesToRadians(FMath::FindDeltaAngleDegrees(Heading, GetActorRotation().Yaw)) * RunningGear.HalfSpan;
    if (FMath::Abs(Travel) + FMath::Abs(TurnArc) > 0.001) UpdateRunningGear(Travel, TurnArc);
    Dispersion = FMath::FInterpConstantTo(Dispersion, Speed == 0 ? 0.0 : 1.0, Step, 1.0 / 1.25);
    Reload = FMath::Max(0.0, Reload - Step);
    Recoil *= FMath::Exp(-13.0 * Step);
    UpdateAim(Step);
}

bool ASteelFrontTank::SetupRunningGear(const SteelFront::FRunningGear& Gear)
{
    RunningGear = Gear;
    RoadWheels = AddInstances(*this, Hull, SteelFront::RoadWheel, false);
    Sprockets = AddInstances(*this, Hull, SteelFront::Sprocket, false);
    TrackLinks = AddInstances(*this, Hull, SteelFront::TrackLink, false);
    if (!RoadWheels || !Sprockets || !TrackLinks) return false;
    GearTransforms.Init(FTransform::Identity, Gear.Wheels.Num());
    RoadWheels->AddInstances(GearTransforms, false);
    GearTransforms.Init(FTransform::Identity, Gear.Sprockets.Num());
    Sprockets->AddInstances(GearTransforms, false);
    GearTransforms.Init(FTransform::Identity, Gear.LinksPerTrack * 2);
    TrackLinks->AddInstances(GearTransforms, false);
    UpdateRunningGear(0, 0);
    return true;
}

void ASteelFrontTank::UpdateRunningGear(double Travel, double TurnArc)
{
    if (!TrackLinks || !RoadWheels || !Sprockets) return;
    TrackTravel[0] += Travel + TurnArc;
    TrackTravel[1] += Travel - TurnArc;
    const auto UpdateWheels = [&](UInstancedStaticMeshComponent& Instances, const TArray<SteelFront::FWheel>& Wheels)
    {
        GearTransforms.Reset(Wheels.Num());
        for (const SteelFront::FWheel& Wheel : Wheels)
        {
            const double Radius = Wheel.RadiusMetres;
            const double Angle = FMath::Fmod(TrackTravel[Wheel.Center.Y < 0 ? 0 : 1] / (Radius * 100.0), UE_DOUBLE_PI * 2);
            GearTransforms.Emplace(FQuat(FVector::RightVector, Angle), Wheel.Center, FVector(Radius, Wheel.WidthMetres, Radius));
        }
        Instances.BatchUpdateInstancesTransforms(0, GearTransforms, false, true, true);
    };
    UpdateWheels(*RoadWheels, RunningGear.Wheels);
    UpdateWheels(*Sprockets, RunningGear.Sprockets);
    GearTransforms.Reset(RunningGear.LinksPerTrack * 2);
    const int32 Samples = RunningGear.Loop.Num();
    const double Length = RunningGear.Length, Step = Length / Samples, LinkStep = Length / RunningGear.LinksPerTrack;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const double Lateral = Side == 0 ? -RunningGear.HalfSpan : RunningGear.HalfSpan;
        for (int32 Link = 0; Link < RunningGear.LinksPerTrack; ++Link)
        {
            double Distance = FMath::Fmod(Link * LinkStep - TrackTravel[Side], Length);
            if (Distance < 0) Distance += Length;
            const int32 Index = FMath::Min(Samples - 1, FMath::FloorToInt(Distance / Step));
            const FVector2D A = RunningGear.Loop[Index], B = RunningGear.Loop[(Index + 1) % Samples];
            const FVector2D Position = FMath::Lerp(A, B, (Distance - Index * Step) / Step);
            const double Angle = FMath::RadiansToDegrees(FMath::Atan2(B.Y - A.Y, B.X - A.X));
            GearTransforms.Emplace(FRotator(Angle, 0, 0), FVector(Position.X, Lateral, Position.Y));
        }
    }
    TrackLinks->BatchUpdateInstancesTransforms(0, GearTransforms, false, true, true);
}

void ASteelFrontTank::Drive(double Step)
{
    const FVector Origin = GetActorLocation();
    const bool bDriveReleased = FMath::IsNearlyZero(Throttle) && FMath::IsNearlyZero(Steer) && !bBraking;
    AutoBrake = bDriveReleased ? FMath::Min(1.0, AutoBrake + Step / SteelFront::BrakeBuildup) : 0.0;
    double Travel = Speed * Step;
    if (!bAirborne)
    {
        if (bDriveReleased || bBraking)
        {
            const auto Motion = SteelFront::BrakeSherman(Speed, bBraking ? 1.0 : AutoBrake, Step);
            Speed = Motion.Speed;
            Travel = Motion.Travel;
        }
        else
        {
            const double Desired = (Throttle >= 0 ? 1160.0 : 390.0) * Throttle;
            Speed = FMath::FInterpConstantTo(Speed, Desired, Step, Desired == 0 ? 400.0 : 260.0);
            Travel = Speed * Step;
        }
        const double Direction = Speed < -10 ? -1.0 : 1.0;
        AddActorWorldRotation(FRotator(0, Steer * Direction * 41.0 * Step, 0));
    }
    const FVector Forward = GetActorForwardVector();
    const FVector Right = GetActorRightVector();
    FVector Destination = Origin + Forward * Travel;
    Destination.X = FMath::Clamp(Destination.X, -Boundary, Boundary);
    Destination.Y = FMath::Clamp(Destination.Y, -Boundary, Boundary);
    const double VerticalStep = (VerticalSpeed - Gravity * Step * 0.5) * Step;
    const double NextHeight = Origin.Z + VerticalStep;

    double Center;
    const bool bFound = GroundAt(*GetWorld(), Destination, this, Center);
    if (bFound)
    {
        constexpr double Axle = 250.0;
        constexpr double HalfTrack = 121.0;
        double Front = Center, Rear = Center, Left = Center, Side = Center;
        GroundAt(*GetWorld(), Destination + Forward * Axle, this, Front);
        GroundAt(*GetWorld(), Destination - Forward * Axle, this, Rear);
        GroundAt(*GetWorld(), Destination - Right * HalfTrack, this, Left);
        GroundAt(*GetWorld(), Destination + Right * HalfTrack, this, Side);
        const double Ground = FMath::Max3(Center, (Front + Rear) * 0.5, (Left + Side) * 0.5) + RideHeight;
        const double Grade = (Front - Rear) / (2.0 * Axle);
        const double SlopeVelocity = Grade * Speed;
        const double Blend = Ease(14.0, Step);
        const double GroundPitch = FMath::Lerp(Pitch, FMath::RadiansToDegrees(FMath::Atan(Grade)), Blend);
        const double GroundRoll = FMath::Lerp(Roll, FMath::RadiansToDegrees(FMath::Atan2(Left - Side, 2.0 * HalfTrack)), Blend);

        bool bLaunch = false;
        if (bHasSupport && !bAirborne && FMath::Abs(Speed) >= 430 && LastSupport + VerticalStep > Ground)
        {
            constexpr double LookAhead = 0.27;
            double Ahead;
            if (GroundAt(*GetWorld(), Destination + Forward * (Speed * (LookAhead - Step)), this, Ahead))
            {
                const double Expected = LastSupport + (VerticalSpeed - Gravity * LookAhead * 0.5) * LookAhead;
                bLaunch = Expected > Ahead + RideHeight + 22.0;
            }
        }
        if ((bAirborne || bLaunch) && NextHeight > Ground)
        {
            bAirborne = true;
            Destination.Z = NextHeight;
            VerticalSpeed -= Gravity * Step;
            Pitch = FMath::Lerp(Pitch, FMath::RadiansToDegrees(FMath::Atan2(
                VerticalSpeed * FMath::Sign(Speed), FMath::Max(430.0, FMath::Abs(Speed)))), Ease(2.5, Step));
            Roll = FMath::Lerp(Roll, 0.0, Ease(2.5, Step));
        }
        else
        {
            const bool bLanding = bAirborne;
            Pitch = GroundPitch;
            Roll = GroundRoll;
            const double FrontOffset = FMath::Sin(FMath::DegreesToRadians(Pitch)) * Axle;
            const double SideOffset = -FMath::Sin(FMath::DegreesToRadians(Roll)) * HalfTrack;
            const double TrackHeight = FMath::Max(FMath::Max(Front - FrontOffset, Rear + FrontOffset),
                FMath::Max(Side - SideOffset, Left + SideOffset));
            const double Floor = FMath::Max(Ground, TrackHeight + RideHeight - 10);
            const double Carried = FMath::Lerp(Origin.Z + SlopeVelocity * Step, Ground, Blend);
            Destination.Z = bLanding || !bHasSupport ? Floor :
                FMath::Max(Floor, FMath::Min(Ground + 18.0, Carried));
            if (bLanding)
            {
                const double Impact = FMath::Max(0.0, SlopeVelocity - VerticalSpeed);
                Speed *= 1.0 - FMath::Min(0.29, Impact * 0.00035);
            }
            VerticalSpeed = !bHasSupport || bLanding ? SlopeVelocity :
                FMath::Lerp(VerticalSpeed, FMath::Clamp((Ground - LastSupport) / Step, -1200.0, 1200.0), Blend);
            bAirborne = false;
        }
        bHasSupport = true;
        LastSupport = Ground;
    }
    else
    {
        bAirborne = true;
        VerticalSpeed -= Gravity * Step;
        Destination.Z = NextHeight;
    }

    FHitResult Contact;
    SetActorLocation(Destination, true, &Contact);
    if (Contact.bBlockingHit)
    {
        Speed *= 0.55;
        if (bAirborne && VerticalSpeed < 0 && Contact.ImpactNormal.Z > 0.4) VerticalSpeed = 0;
    }
    Hull->SetRelativeRotation(FRotator(Pitch, 0, Roll));
}

void ASteelFrontTank::UpdateAim(double Step)
{
    const auto* Player = Cast<APlayerController>(GetController());
    if (!Player || !Player->PlayerCameraManager) return;
    FVector Eye;
    FRotator View;
    Player->GetPlayerViewPoint(Eye, View);
    const FVector End = Eye + View.Vector() * SteelFront::ShotRange;
    const FCollisionQueryParams Query(SCENE_QUERY_STAT(SteelFrontAim), true, this);
    FHitResult Hit;
    GetWorld()->LineTraceSingleByChannel(Hit, Eye, End, ECC_Visibility, Query);
    const FVector Aim = Hit.bBlockingHit ? Hit.ImpactPoint : End;
    const FVector Relative = Hull->GetComponentTransform().InverseTransformPosition(Aim) - Turret->GetRelativeLocation();
    const double DesiredYaw = FMath::RadiansToDegrees(FMath::Atan2(Relative.Y, Relative.X));
    const double Yaw = FMath::FixedTurn(Turret->GetRelativeRotation().Yaw, DesiredYaw, 76.0 * Step);
    Turret->SetRelativeRotation(FRotator(0, Yaw, 0));
    const FVector Ahead = Turret->GetComponentTransform().InverseTransformPosition(Aim) - GunMount;
    const double RangeAhead = FMath::Max(260.0, Ahead.X);
    const double Flight = FMath::Max(0.0, RangeAhead - Muzzle->GetRelativeLocation().X) / SteelFront::ShellSpeed;
    const double AimPitch = FMath::RadiansToDegrees(FMath::Atan2(Ahead.Z + Gravity * Flight * Flight * 0.5, RangeAhead));
    const double Current = Gun->GetRelativeRotation().Pitch;
    const double DesiredPitch = FMath::Clamp(AimPitch, -10.0, 24.0);
    Gun->SetRelativeRotation(FRotator(FMath::FixedTurn(Current, DesiredPitch, 48.0 * Step), 0, 0));
    Gun->SetRelativeLocation(GunMount - Gun->GetRelativeRotation().Vector() * Recoil);

    const FVector Start = Muzzle->GetComponentLocation();
    AimImpact = Start;
    if (GetWorld()->LineTraceSingleByChannel(Hit, Gun->GetComponentLocation(), Start, ECC_Visibility, Query))
    {
        AimImpact = Hit.ImpactPoint;
    }
    else
    {
        FVector Velocity = Muzzle->GetForwardVector() * SteelFront::ShellSpeed;
        constexpr int32 Steps = 12;
        constexpr double TraceStep = SteelFront::ShotLifetime / Steps;
        for (int32 Index = 0; Index < Steps; ++Index)
        {
            if (TraceRoundStep(*GetWorld(), Query, AimImpact, Velocity, TraceStep, Hit)) break;
        }
    }
    AimDistance = FVector::Distance(Start, AimImpact);
}

void ASteelFrontTank::SetGunMount(const FVector& Mount)
{
    GunMount = Mount;
    Gun->SetRelativeLocation(GunMount);
}

void ASteelFrontTank::Fire()
{
    auto* Player = Cast<APlayerController>(GetController());
    if (!Player) return;
    if (!bStarted || Player->bShowMouseCursor) { StartPractice(); return; }
    if (Reload > 0.0) return;
    Reload = ReloadDuration;
    Recoil = 13.0;

    const FVector Start = Muzzle->GetComponentLocation();
    double UnitRadius;
    do { UnitRadius = SteelFront::DispersionSample(FMath::FRand(), FMath::FRand()); } while (UnitRadius >= 1.0);
    const double Radius = FMath::Tan(DispersionRadians()) * UnitRadius;
    const double Angle = FMath::FRand() * UE_DOUBLE_PI * 2.0;
    const FVector Direction = (Muzzle->GetForwardVector() + Radius *
        (Muzzle->GetRightVector() * FMath::Cos(Angle) + Muzzle->GetUpVector() * FMath::Sin(Angle))).GetSafeNormal();
    const FCollisionQueryParams Query(SCENE_QUERY_STAT(SteelFrontShot), true, this);
    FHitResult Hit;
    UWorld& World = *GetWorld();
    if (World.LineTraceSingleByChannel(Hit, Gun->GetComponentLocation(), Start, ECC_Visibility, Query))
    {
        if (auto* Mode = World.GetAuthGameMode<ASteelFrontMode>()) Mode->RegisterHit(Hit.GetComponent());
        ShowFlash(World, Hit.ImpactPoint + Hit.ImpactNormal * 5.0, 7400.f, 280.f);
        return;
    }
    const FVector Velocity = Direction * SteelFront::ShellSpeed;
    Rounds.Add(SteelFront::FPracticeRound{
        Start, Velocity, TWeakObjectPtr<AActor>(SpawnTracer(World, Start, Velocity)), SteelFront::ShotLifetime});
    ShowFlash(World, Start, 13000.f, 480.f);
}

void ASteelFrontTank::UpdateRounds(double Step)
{
    UWorld& World = *GetWorld();
    const FCollisionQueryParams Query(SCENE_QUERY_STAT(SteelFrontShot), true, this);
    for (int32 Index = Rounds.Num() - 1; Index >= 0; --Index)
    {
        auto& Round = Rounds[Index];
        const double TravelStep = FMath::Min(Step, Round.Lifetime);
        FHitResult Hit;
        const bool bHit = TraceRoundStep(World, Query, Round.Position, Round.Velocity, TravelStep, Hit);
        Round.Lifetime -= TravelStep * (bHit ? Hit.Time : 1.0);
        if (bHit)
        {
            if (auto* Mode = World.GetAuthGameMode<ASteelFrontMode>()) Mode->RegisterHit(Hit.GetComponent());
            ShowFlash(World, Hit.ImpactPoint + Hit.ImpactNormal * 5.0, 7400.f, 280.f);
        }
        const bool bFinished = bHit || Round.Lifetime <= 0.0;
        if (auto* Tracer = Round.Tracer.Get())
        {
            const double Travel = (SteelFront::ShotLifetime - Round.Lifetime) * SteelFront::ShellSpeed;
            MoveTracer(*Tracer, Round.Position, Round.Velocity, Travel);
            if (bFinished) Tracer->SetLifeSpan(0.045f);
        }
        if (bFinished) Rounds.RemoveAtSwap(Index);
    }
}

void ASteelFrontTank::ToggleScope()
{
    const auto* Player = Cast<APlayerController>(GetController());
    if (!Player || Player->bShowMouseCursor || !bStarted) return;
    bScoped = !bScoped;
    Arm->TargetArmLength = bScoped ? 0.f : 1050.f;
    Arm->SetRelativeLocation(bScoped ? FVector(125, 0, 158) : FVector(0, 0, 210));
    Arm->bEnableCameraLag = !bScoped;
    Camera->SetFieldOfView(bScoped ? 23.f : 68.f);
    Hull->SetVisibility(!bScoped, true);
}

void ASteelFrontTank::StartPractice()
{
    if (auto* Player = Cast<APlayerController>(GetController()))
    {
        bStarted = true;
        Player->bShowMouseCursor = false;
        FInputModeGameOnly Mode;
        Mode.SetConsumeCaptureMouseDown(false);
        Player->SetInputMode(Mode);
    }
}

void ASteelFrontTank::ReleaseMouse()
{
    if (auto* Player = Cast<APlayerController>(GetController()))
    {
        Player->bShowMouseCursor = true;
        Player->SetInputMode(FInputModeGameAndUI());
    }
}

void ASteelFrontTank::ResetTargets()
{
    for (const auto& Round : Rounds) if (auto* Tracer = Round.Tracer.Get()) Tracer->Destroy();
    Rounds.Reset();
    if (auto* Mode = GetWorld()->GetAuthGameMode<ASteelFrontMode>()) Mode->ResetTargets();
}

void ASteelFrontHud::DrawHUD()
{
    Super::DrawHUD();
    if (!Canvas) return;
    const FLinearColor Ink(0.031f, 0.048f, 0.058f, 0.92f);
    const FLinearColor Text(0.93f, 0.94f, 0.91f);
    const FLinearColor Muted(0.66f, 0.75f, 0.78f);
    const FLinearColor Gold(0.88f, 0.63f, 0.29f);
    const FLinearColor Ready(0.50f, 0.82f, 0.63f);
    const float Scale = FMath::Clamp(FMath::Min(Canvas->SizeX / 1280.f, Canvas->SizeY / 720.f), 0.5f, 2.f);
    const float Margin = 24.f * Scale;
    const float CX = Canvas->SizeX * 0.5f, CY = Canvas->SizeY * 0.5f;
    const auto* Tank = Cast<ASteelFrontTank>(GetOwningPawn());
    auto* Player = GetOwningPlayerController();
    if (!Tank || !Tank->IsPracticing() || (Player && Player->bShowMouseCursor))
    {
        const bool bResume = Tank && Tank->IsPracticing();
        const float X = 2 * Margin;
        const float Y = CY - 65.f * Scale;
        DrawRect(Ink, X, Y, 410.f * Scale, 144.f * Scale);
        DrawRect(Gold, X, Y, 3.f * Scale, 144.f * Scale);
        DrawText(TEXT("STEEL FRONT"), Text, X + 20.f * Scale, Y + 20.f * Scale, nullptr, 2.35f * Scale);
        DrawText(TEXT("Normandy training range"), Muted, X + 21.f * Scale, Y + 67.f * Scale, nullptr, 1.15f * Scale);
        const TCHAR* Action = !Tank ? TEXT("Check Steel Front logs for map data.") :
            bResume ? TEXT("ENTER   Resume") : TEXT("ENTER   Deploy");
        DrawText(Action, Gold, X + 21.f * Scale, Y + 105.f * Scale, nullptr, 1.15f * Scale);
        return;
    }

    const auto* Mode = GetWorld()->GetAuthGameMode<ASteelFrontMode>();
    const int32 Hits = Mode ? Mode->Hits() : 0;
    const int32 Total = Mode ? Mode->TotalTargets() : 0;
    const bool bCleared = Total > 0 && Hits == Total;
    DrawRect(Ink, Margin, Margin, 263.f * Scale, 69.f * Scale);
    DrawRect(Gold, Margin, Margin, 3.f * Scale, 69.f * Scale);
    DrawText(TEXT("NORMANDY RANGE"), Muted, Margin + 14.f * Scale, Margin + 9.f * Scale, nullptr, 0.95f * Scale);
    DrawText(bCleared ? FString(TEXT("Range clear   ·   R to reset")) : FString::Printf(TEXT("%02d / %02d   Targets"), Hits, Total),
        bCleared ? Ready : Text, Margin + 14.f * Scale, Margin + 32.f * Scale, nullptr, 1.33f * Scale);

    const float StatusY = Canvas->SizeY - Margin - 98.f * Scale;
    DrawRect(Ink, Margin, StatusY, 230.f * Scale, 72.f * Scale);
    DrawText(FString::Printf(TEXT("%02.0f km/h"), Tank->SpeedKmh()), Text, Margin + 12.f * Scale,
        StatusY + 6.f * Scale, nullptr, 1.54f * Scale);
    if (Tank->IsAutoBraking())
        DrawText(TEXT("BRAKING"), Gold, Margin + 126.f * Scale, StatusY + 12.f * Scale, nullptr, 0.95f * Scale);
    const FLinearColor LoadColor = Tank->IsReloading() ? Gold : Ready;
    DrawText(Tank->IsReloading() ? TEXT("Reloading") : TEXT("Gun ready"), LoadColor, Margin + 12.f * Scale,
        StatusY + 36.f * Scale, nullptr, 1.0f * Scale);
    DrawRect(FLinearColor(0.17f, 0.21f, 0.23f), Margin + 12.f * Scale, StatusY + 58.f * Scale, 206.f * Scale, 3.f * Scale);
    DrawRect(LoadColor, Margin + 12.f * Scale, StatusY + 58.f * Scale, 206.f * Scale * Tank->ReloadProgress(), 3.f * Scale);
    DrawText(TEXT("WASD  Drive    LMB  Fire    RMB  Scope    R  Reset    ESC  Cursor"),
        Text, Margin, Canvas->SizeY - Margin - 9.f * Scale, nullptr, 0.97f * Scale);

    DrawRect(Muted, CX - Scale, CY - Scale, 2.f * Scale, 2.f * Scale);
    FVector2D Reticle;
    if (!Player || !Player->ProjectWorldLocationToScreen(Tank->GetAimImpact(), Reticle, true)) return;
    const double Fov = Player->PlayerCameraManager ? Player->PlayerCameraManager->GetFOVAngle() : 68.0;
    const float Radius = float(FMath::Tan(Tank->DispersionRadians()) * CX / FMath::Tan(FMath::DegreesToRadians(Fov * 0.5)));
    const float X = Reticle.X, Y = Reticle.Y;
    const FLinearColor ReticleColor = Tank->IsReloading() ? Muted : Ready;
    for (int32 Index = 0; Index < 40; ++Index)
    {
        const double A = Index * UE_DOUBLE_PI / 20.0, B = (Index + 1) * UE_DOUBLE_PI / 20.0;
        DrawLine(X + Radius * FMath::Cos(A), Y + Radius * FMath::Sin(A), X + Radius * FMath::Cos(B),
            Y + Radius * FMath::Sin(B), ReticleColor, 1.25f * Scale);
    }
    DrawRect(ReticleColor, X - Scale, Y - Scale, 2.f * Scale, 2.f * Scale);
    DrawText(FString::Printf(TEXT("%.0f m"), Tank->AimDistanceMetres()), Text, X + Radius + 8.f * Scale,
        Y + Radius + 4.f * Scale, nullptr, Scale);
}

ASteelFrontMode::ASteelFrontMode()
{
    DefaultPawnClass = nullptr;
    HUDClass = ASteelFrontHud::StaticClass();
}

void ASteelFrontMode::StartPlay()
{
    Super::StartPlay();
    UWorld* World = GetWorld();
    APlayerController* Player = World ? World->GetFirstPlayerController() : nullptr;
    SteelFront::FSlice Slice;
    if (!World || !Player || !SteelFront::LoadSlice(Slice))
    {
        UE_LOG(LogTemp, Error, TEXT("Steel Front could not open Content/Prototype/Normandy.sfbin"));
        return;
    }
    AddLighting(*World);
    auto* Environment = World->SpawnActor<AActor>();
    if (!Environment) return;
    auto* Root = NewObject<USceneComponent>(Environment, TEXT("Normandy"));
    Environment->AddInstanceComponent(Root);
    Environment->SetRootComponent(Root);
    Root->SetMobility(EComponentMobility::Static);
    Root->RegisterComponent();
    for (const auto Index : {SteelFront::Terrain, SteelFront::Buildings, SteelFront::Water,
        SteelFront::Foliage, SteelFront::Walls, SteelFront::Decks, SteelFront::Pebbles, SteelFront::Horizon})
    {
        if (!AddSection(*Environment, Root, Slice.Sections[Index], Index)) return;
    }
    if (UInstancedStaticMeshComponent* Grass = AddInstances(*Environment, Root, SteelFront::Grass, true))
        Grass->AddInstances(Slice.GrassTransforms, false);
    else return;

    FActorSpawnParameters Spawn;
    Spawn.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    const FRotator Rotation(0, Slice.Heading, 0);
    auto* Tank = World->SpawnActor<ASteelFrontTank>(Slice.Spawn, Rotation, Spawn);
    if (!Tank) return;
    if (!AddSection(*Tank, Tank->Hull, Slice.Sections[SteelFront::Hull], SteelFront::Hull)
        || !AddSection(*Tank, Tank->Turret, Slice.Sections[SteelFront::Turret], SteelFront::Turret)
        || !AddSection(*Tank, Tank->Gun, Slice.Sections[SteelFront::Gun], SteelFront::Gun)
        || !Tank->SetupRunningGear(Slice.RunningGear))
    {
        Tank->Destroy();
        return;
    }
    Tank->Turret->SetRelativeLocation(Slice.TurretMount);
    Tank->SetGunMount(Slice.GunMount);
    Tank->Muzzle->SetRelativeLocation(FVector(Slice.BarrelLength, 0, 0));

    CreateTargets(Slice.Spawn, Rotation);
    Player->Possess(Tank);
    Player->SetControlRotation(FRotator(-7, Slice.Heading, 0));
    Player->SetInputMode(FInputModeGameOnly());
}

void ASteelFrontMode::CreateTargets(const FVector& Spawn, const FRotator& Rotation)
{
    auto* Cube = LoadObject<UStaticMesh>(nullptr, CubePath);
    auto* Stand = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Prototype/Quality/Materials/M_Stand.M_Stand"), nullptr, LOAD_NoWarn);
    auto* Marker = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Prototype/Quality/Materials/M_Target.M_Target"), nullptr, LOAD_NoWarn);
    if (!Cube) return;
    const FVector Forward = Rotation.Vector(), Right = FRotationMatrix(Rotation).GetUnitAxis(EAxis::Y);
    const FCollisionQueryParams Query(SCENE_QUERY_STAT(SteelFrontTargetSites), true);
    for (int32 Slot = 0; Slot < 6; ++Slot)
    {
        for (int32 Attempt = 0; Attempt < 12; ++Attempt)
        {
            const double Distance = 1850.0 + Slot * 760.0 + Attempt * 115.0;
            const double Side = (Slot % 2 == 0 ? -1.0 : 1.0) * (320.0 + (Slot / 2) * 440.0 + Attempt * 105.0);
            FVector Point = Spawn + Forward * Distance + Right * Side;
            double Elevation;
            if (!GroundAt(*GetWorld(), Point + FVector(0, 0, 400), nullptr, Elevation)) continue;
            Point.Z = Elevation + 151;
            FHitResult Obstruction;
            const FVector Eye = Spawn + FVector(0, 0, 245);
            if (GetWorld()->LineTraceSingleByChannel(Obstruction, Eye, Point, ECC_Visibility, Query)) continue;
            if (FVector::DistSquared2D(Spawn, Point) < FMath::Square(1200.0)) continue;
            auto* Target = GetWorld()->SpawnActor<AActor>();
            if (!Target) break;
            auto* Plate = AddShape(*Target, nullptr, Cube, Marker);
            Plate->SetRelativeScale3D(FVector(0.20, 1.45, 1.35));
            Plate->SetCollisionProfileName(TEXT("BlockAll"));
            Target->SetActorLocationAndRotation(Point, Rotation);
            auto* Leg = AddShape(*Target, Plate, Cube, Stand);
            Leg->SetAbsolute(false, false, true);
            Leg->SetRelativeLocation(FVector(20, 0, -82.0 / 1.35));
            Leg->SetWorldScale3D(FVector(0.26, 0.25, 1.64));
            Targets.Add(Plate);
            break;
        }
    }
}

void ASteelFrontMode::RegisterHit(UPrimitiveComponent* Component)
{
    for (UStaticMeshComponent* Target : Targets)
    {
        if (Target != Component || Target->GetCollisionEnabled() == ECollisionEnabled::NoCollision) continue;
        Target->SetHiddenInGame(true);
        Target->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        ++HitCount;
        return;
    }
}

void ASteelFrontMode::ResetTargets()
{
    HitCount = 0;
    for (UStaticMeshComponent* Target : Targets)
    {
        Target->SetHiddenInGame(false);
        Target->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
    }
}
