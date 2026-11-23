#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/HUD.h"
#include "GameFramework/Pawn.h"
#include "SteelFrontSlice.h"
#include "SteelFrontMode.generated.h"

class UBoxComponent;
class UCameraComponent;
class UInputComponent;
class UInstancedStaticMeshComponent;
class UPrimitiveComponent;
class USceneComponent;
class USpringArmComponent;
class UStaticMeshComponent;

UCLASS()
class ASteelFrontTank : public APawn
{
    GENERATED_BODY()

public:
    ASteelFrontTank();
    void Tick(float DeltaSeconds) override;
    void SetupPlayerInputComponent(UInputComponent* Input) override;
    bool IsPracticing() const { return bStarted; }
    bool IsScoped() const { return bScoped; }
    double SpeedKmh() const { return FMath::Abs(Speed) * 0.036; }
    double DispersionRadians() const { return FMath::Atan(FMath::Lerp(0.25, 2.4, Dispersion) / 100.0); }
    bool IsReloading() const { return Reload > 0.0; }
    double AimDistanceMetres() const { return AimDistance * 0.01; }
    void SetGunMount(const FVector& Mount);
    bool SetupRunningGear(const SteelFront::FRunningGear& Gear);

    UPROPERTY()
    TObjectPtr<USceneComponent> Hull;

    UPROPERTY()
    TObjectPtr<USceneComponent> Turret;

    UPROPERTY()
    TObjectPtr<USceneComponent> Gun;

    UPROPERTY()
    TObjectPtr<USceneComponent> Muzzle;

private:
    void SetThrottle(float Value) { Throttle = Value; }
    void SetSteer(float Value) { Steer = Value; }
    void PressBrake() { bBraking = true; }
    void ReleaseBrake() { bBraking = false; }
    void LookYaw(float Value);
    void LookPitch(float Value);
    void Drive(double Step);
    void UpdateRunningGear(double Travel, double TurnArc);
    void UpdateAim(double Step);
    void Fire();
    void ToggleScope();
    void ReleaseMouse();
    void StartPractice();
    void ResetTargets();

    UPROPERTY()
    TObjectPtr<UBoxComponent> Collision;

    UPROPERTY()
    TObjectPtr<USpringArmComponent> Arm;

    UPROPERTY()
    TObjectPtr<UCameraComponent> Camera;

    UPROPERTY()
    TObjectPtr<UInstancedStaticMeshComponent> RoadWheels;

    UPROPERTY()
    TObjectPtr<UInstancedStaticMeshComponent> Sprockets;

    UPROPERTY()
    TObjectPtr<UInstancedStaticMeshComponent> TrackLinks;

    SteelFront::FRunningGear RunningGear;
    TArray<FTransform> GearTransforms;
    double TrackTravel[2] = {0.0, 0.0};
    FVector GunMount = FVector::ZeroVector;
    float Throttle = 0;
    float Steer = 0;
    double Speed = 0;
    double VerticalSpeed = 0;
    double LastSupport = 0;
    double Pitch = 0;
    double Roll = 0;
    double Dispersion = 0;
    double AimDistance = 0;
    double Reload = 0;
    double Recoil = 0;
    bool bHasSupport = false;
    bool bAirborne = false;
    bool bBraking = false;
    bool bScoped = false;
    bool bStarted = false;
};

UCLASS()
class ASteelFrontHud : public AHUD
{
    GENERATED_BODY()

public:
    void DrawHUD() override;
};

UCLASS()
class ASteelFrontMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    ASteelFrontMode();
    void StartPlay() override;
    void RegisterHit(UPrimitiveComponent* Component);
    void ResetTargets();
    int32 Hits() const { return HitCount; }
    int32 TotalTargets() const { return Targets.Num(); }

private:
    void CreateTargets(const FVector& Spawn, const FRotator& Rotation);

    UPROPERTY()
    TArray<TObjectPtr<UStaticMeshComponent>> Targets;

    int32 HitCount = 0;
};
