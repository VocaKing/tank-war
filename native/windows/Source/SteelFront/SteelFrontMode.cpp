#include "SteelFrontMode.h"
#include "SteelFrontSlice.h"

#include "Camera/CameraComponent.h"
#include "Camera/PlayerCameraManager.h"
#include "Components/BoxComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/InputComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/Canvas.h"
#include "Engine/DirectionalLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/PointLight.h"
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
constexpr double Boundary = 17400.0;
constexpr double Gravity = 980.0;
constexpr ECollisionChannel GroundChannel = ECC_GameTraceChannel1;
constexpr const TCHAR* CubePath = TEXT("/Engine/BasicShapes/Cube.Cube");

UStaticMeshComponent* AddShape(AActor& Actor, USceneComponent* Parent, UStaticMesh* Mesh,
    UMaterialInterface* Material = nullptr)
{
    auto* Shape = NewObject<UStaticMeshComponent>(&Actor);
    Actor.AddInstanceComponent(Shape);
    if (Parent) Shape->SetupAttachment(Parent);
    else Actor.SetRootComponent(Shape);
    Shape->SetStaticMesh(Mesh);
    Shape->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    if (Material) Shape->SetMaterial(0, Material);
    Shape->RegisterComponent();
    return Shape;
}

void AddSection(AActor& Owner, USceneComponent* Parent, const SteelFront::FSliceMesh& Data,
    SteelFront::ESection Index)
{
    const TCHAR* Name = SteelFront::SectionNames[Index];
    const bool bRoad = Index == SteelFront::Terrain || Index == SteelFront::Decks;
    const bool bBarrier = Index == SteelFront::Walls;
    const bool bVisible = Index != SteelFront::Walls && Index != SteelFront::Decks;
    UMaterialInterface* Material = nullptr;
    UStaticMesh* StaticMesh = nullptr;
    if (bVisible)
    {
        const FString MeshPath = FString::Printf(TEXT("/Game/Prototype/Meshes/SM_%s.SM_%s"), Name, Name);
        StaticMesh = LoadObject<UStaticMesh>(nullptr, *MeshPath, nullptr, LOAD_NoWarn);
        const TCHAR* Surface = Index == SteelFront::Terrain ? TEXT("Terrain") :
            Index == SteelFront::Buildings ? TEXT("Stone") : Index == SteelFront::Water ? TEXT("Water") :
            Index == SteelFront::Foliage ? TEXT("Foliage") : TEXT("Armor");
        const FString MaterialPath = FString::Printf(TEXT("/Game/Prototype/Materials/M_%s.M_%s"), Surface, Surface);
        Material = LoadObject<UMaterialInterface>(nullptr, *MaterialPath, nullptr, LOAD_NoWarn);
        if (StaticMesh) AddShape(Owner, Parent, StaticMesh, Material);
        if (StaticMesh && !bRoad) return;
    }
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
    Component->SetHiddenInGame(!bVisible || StaticMesh != nullptr);
    Component->SetCastShadow(bVisible && StaticMesh == nullptr);
    Component->RegisterComponent();
    Component->CreateMeshSection_LinearColor(0, Data.Positions, Data.Indices, Data.Normals,
        {}, {}, {}, {}, Data.Colors, {}, bRoad || bBarrier, false);
    if (Material && !StaticMesh) Component->SetMaterial(0, Material);
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
    if (auto* Sun = World.SpawnActor<ADirectionalLight>(FVector::ZeroVector, FRotator(-37, -138, 0), Params))
    {
        auto* Light = CastChecked<UDirectionalLightComponent>(Sun->GetLightComponent());
        Light->SetMobility(EComponentMobility::Movable);
        Light->SetAtmosphereSunLight(true);
        Light->SetIntensity(6.8f);
        Light->SetLightColor(FLinearColor(1.0f, 0.89f, 0.75f));
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
        Component->SetFogDensity(0.016f);
        Component->SetFogHeightFalloff(0.35f);
        Component->SetFogInscatteringColor(FLinearColor(0.43f, 0.51f, 0.60f));
        Component->SetStartDistance(650.0f);
        Component->SetVolumetricFog(true);
    }
}

void ShowTrace(UWorld& World, const FVector& Start, const FVector& End)
{
    const FVector Segment = End - Start;
    if (Segment.IsNearlyZero()) return;
    static const auto TracerPath = TEXT("/Game/Prototype/Materials/M_Tracer.M_Tracer");
    auto* Material = LoadObject<UMaterialInterface>(nullptr, TracerPath, nullptr, LOAD_NoWarn);
    auto* Mesh = LoadObject<UStaticMesh>(nullptr, CubePath);
    if (Material && Mesh)
    {
        if (auto* Trail = World.SpawnActor<AActor>())
        {
            UStaticMeshComponent* Shape = AddShape(*Trail, nullptr, Mesh, Material);
            Shape->SetCastShadow(false);
            const double Length = Segment.Size();
            const double Visible = FMath::Min(Length, 750.0);
            const FVector Direction = Segment / Length;
            Shape->SetRelativeScale3D(FVector(Visible * 0.01, 0.025, 0.025));
            Trail->SetActorLocationAndRotation(End - Direction * (Visible * 0.5), Direction.Rotation());
            Trail->SetLifeSpan(0.075f);
        }
    }
    FActorSpawnParameters Params;
    if (auto* Flash = World.SpawnActor<APointLight>(Start, FRotator::ZeroRotator, Params))
    {
        auto* Light = Flash->FindComponentByClass<UPointLightComponent>();
        Light->SetMobility(EComponentMobility::Movable);
        Light->SetLightColor(FLinearColor(1.0f, 0.50f, 0.17f));
        Light->SetIntensity(13000.f);
        Light->SetAttenuationRadius(480.f);
        Light->SetCastShadows(false);
        Flash->SetLifeSpan(0.065f);
    }
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
    if (!Player || Player->bShowMouseCursor || !bStarted || DeltaSeconds <= 0) return;

    const double Step = FMath::Min(double(DeltaSeconds), 0.05);
    Drive(Step);
    Dispersion = FMath::FInterpConstantTo(Dispersion, Speed == 0 ? 0.0 : 1.0, Step, 1.0 / 1.25);
    Reload = FMath::Max(0.0, Reload - Step);
    Recoil *= FMath::Exp(-13.0 * Step);
    UpdateAim(Step);
}

void ASteelFrontTank::Drive(double Step)
{
    const FVector Origin = GetActorLocation();
    if (!bAirborne)
    {
        const double Desired = bBraking ? 0.0 : (Throttle >= 0 ? 1160.0 : 390.0) * Throttle;
        const double Rate = bBraking ? 920.0 : Desired == 0 ? 400.0 : 260.0;
        Speed = FMath::FInterpConstantTo(Speed, Desired, Step, Rate);
        const double Direction = Speed < -10 ? -1.0 : 1.0;
        AddActorWorldRotation(FRotator(0, Steer * Direction * 41.0 * Step, 0));
    }
    const FVector Forward = GetActorForwardVector();
    const FVector Right = GetActorRightVector();
    FVector Destination = Origin + Forward * (Speed * Step);
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
    const FVector End = Eye + View.Vector() * 48000.0;
    const FCollisionQueryParams Query(SCENE_QUERY_STAT(SteelFrontAim), true, this);
    FHitResult Hit;
    GetWorld()->LineTraceSingleByChannel(Hit, Eye, End, ECC_Visibility, Query);
    const FVector Aim = Hit.bBlockingHit ? Hit.ImpactPoint : End;
    AimDistance = FVector::Distance(Muzzle->GetComponentLocation(), Aim);
    const FVector Relative = Hull->GetComponentTransform().InverseTransformPosition(Aim) - Turret->GetRelativeLocation();
    const double DesiredYaw = FMath::RadiansToDegrees(FMath::Atan2(Relative.Y, Relative.X));
    const double Yaw = FMath::FixedTurn(Turret->GetRelativeRotation().Yaw, DesiredYaw, 76.0 * Step);
    Turret->SetRelativeRotation(FRotator(0, Yaw, 0));
    const FVector Ahead = Turret->GetComponentTransform().InverseTransformPosition(Aim) - GunMount;
    const double AimPitch = FMath::RadiansToDegrees(FMath::Atan2(Ahead.Z, FMath::Max(260.0, Ahead.X)));
    const double Current = Gun->GetRelativeRotation().Pitch;
    const double DesiredPitch = FMath::Clamp(AimPitch, -10.0, 24.0);
    Gun->SetRelativeRotation(FRotator(FMath::FixedTurn(Current, DesiredPitch, 48.0 * Step), 0, 0));
    Gun->SetRelativeLocation(GunMount - Gun->GetRelativeRotation().Vector() * Recoil);
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
    Reload = 1.15;
    Recoil = 13.0;

    const FVector Start = Muzzle->GetComponentLocation();
    const double Radius = FMath::Tan(DispersionRadians()) * FMath::Sqrt(FMath::FRand());
    const double Angle = FMath::FRand() * UE_DOUBLE_PI * 2.0;
    const FVector Direction = (Muzzle->GetForwardVector() + Radius *
        (Muzzle->GetRightVector() * FMath::Cos(Angle) + Muzzle->GetUpVector() * FMath::Sin(Angle))).GetSafeNormal();
    const FCollisionQueryParams Query(SCENE_QUERY_STAT(SteelFrontShot), true, this);
    FHitResult Hit;
    const FVector End = Start + Direction * 48000.0;
    GetWorld()->LineTraceSingleByChannel(Hit, Gun->GetComponentLocation(), Start, ECC_Visibility, Query);
    if (!Hit.bBlockingHit) GetWorld()->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Query);
    if (auto* Mode = GetWorld()->GetAuthGameMode<ASteelFrontMode>())
        Mode->RegisterHit(Hit.GetComponent());
    ShowTrace(*GetWorld(), Start, Hit.bBlockingHit ? Hit.ImpactPoint : End);
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
    if (auto* Mode = GetWorld()->GetAuthGameMode<ASteelFrontMode>()) Mode->ResetTargets();
}

void ASteelFrontHud::DrawHUD()
{
    Super::DrawHUD();
    if (!Canvas) return;
    const FLinearColor Cream(0.96f, 0.91f, 0.80f);
    const FLinearColor Panel(0.024f, 0.028f, 0.024f, 0.86f);
    const auto* Tank = Cast<ASteelFrontTank>(GetOwningPawn());
    if (!Tank || !Tank->IsPracticing())
    {
        const float Mid = Canvas->SizeY * 0.42f;
        DrawRect(Panel, 0, Mid - 45.f, Canvas->SizeX, 201.f);
        DrawText(TEXT("STEEL FRONT"), Cream, 55, Mid - 24.f, nullptr, 3.5f);
        DrawText(TEXT("NORMANDY TRAINING RANGE"), Cream, 60, Mid + 39.f, nullptr, 1.35f);
        DrawText(Tank ? TEXT("Press ENTER to deploy") : TEXT("Map data unavailable. Check the Steel Front log."),
            Cream, 60, Mid + 96.f, nullptr, 1.2f);
        return;
    }

    const auto* Mode = GetWorld()->GetAuthGameMode<ASteelFrontMode>();
    DrawRect(Panel, 24, 22, 322, 70);
    DrawText(FString::Printf(TEXT("%02d / %02d   TARGETS"), Mode ? Mode->Hits() : 0, Mode ? Mode->TotalTargets() : 0),
        Cream, 41, 31, nullptr, 1.25f);
    DrawText(FString::Printf(TEXT("%3.0f km/h     %s"), Tank->SpeedKmh(), Tank->IsReloading() ? TEXT("RELOADING") : TEXT("READY")),
        Cream, 41, 58, nullptr, 1.12f);
    DrawText(TEXT("WASD  Drive    SPACE  Brake    LMB  Fire    RMB  Scope    R  Reset targets    ESC  Cursor    ENTER  Resume"),
        Cream, 28, Canvas->SizeY - 44.f);

    const float X = Canvas->SizeX * 0.5f, Y = Canvas->SizeY * 0.5f;
    const auto* Player = GetOwningPlayerController();
    const double Fov = Player && Player->PlayerCameraManager ? Player->PlayerCameraManager->GetFOVAngle() : 68.0;
    const double Pixels = FMath::Tan(Tank->DispersionRadians()) * X / FMath::Tan(FMath::DegreesToRadians(Fov * 0.5));
    const float Radius = FMath::Max(1.f, float(Pixels));
    for (int32 Index = 0; Index < 32; ++Index)
    {
        const double A = Index * UE_DOUBLE_PI / 16.0, B = (Index + 1) * UE_DOUBLE_PI / 16.0;
        DrawLine(X + Radius * FMath::Cos(A), Y + Radius * FMath::Sin(A), X + Radius * FMath::Cos(B),
            Y + Radius * FMath::Sin(B), Cream, 1.2f);
    }
    const float Tick = FMath::Max(8.f, Radius + 4.f);
    DrawLine(X - Tick - 7, Y, X - Tick, Y, Cream, 1.5f);
    DrawLine(X + Tick, Y, X + Tick + 7, Y, Cream, 1.5f);
    DrawLine(X, Y - Tick - 7, X, Y - Tick, Cream, 1.5f);
    DrawLine(X, Y + Tick, X, Y + Tick + 7, Cream, 1.5f);
    DrawText(FString::Printf(TEXT("%.0f m"), Tank->AimDistanceMetres()), Cream, X + Tick + 11, Y + Tick);
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
    Root->RegisterComponent();
    for (const auto Index : {SteelFront::Terrain, SteelFront::Buildings, SteelFront::Water,
        SteelFront::Foliage, SteelFront::Walls, SteelFront::Decks})
        AddSection(*Environment, Root, Slice.Sections[Index], Index);

    FActorSpawnParameters Spawn;
    Spawn.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    const FRotator Rotation(0, Slice.Heading, 0);
    auto* Tank = World->SpawnActor<ASteelFrontTank>(Slice.Spawn, Rotation, Spawn);
    if (!Tank) return;
    AddSection(*Tank, Tank->Hull, Slice.Sections[SteelFront::Hull], SteelFront::Hull);
    AddSection(*Tank, Tank->Turret, Slice.Sections[SteelFront::Turret], SteelFront::Turret);
    AddSection(*Tank, Tank->Gun, Slice.Sections[SteelFront::Gun], SteelFront::Gun);
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
    auto* Stand = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Prototype/Materials/M_Stand.M_Stand"), nullptr, LOAD_NoWarn);
    auto* Marker = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Prototype/Materials/M_Target.M_Target"), nullptr, LOAD_NoWarn);
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
