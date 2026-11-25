#pragma once
#include "CoreMinimal.h"
#include "SteelFrontWeb.h"
#include "ProceduralMeshComponent.h"
namespace SteelFront
{
struct FRecoveredTrackGroup { int32 Side=0; double Phase=0; FVector Center=FVector::ZeroVector; };
struct FRecoveredTracks
{
    TWeakObjectPtr<UProceduralMeshComponent> Mesh;
    TArray<FVector2D> Path[2];
    double Length[2]={0,0};
    TArray<FRecoveredTrackGroup> Groups;
    TArray<int32> GroupForVertex;
    TArray<FVector> BasePositions, BaseNormals, Positions, Normals;
    TArray<FProcMeshTangent> BaseTangents, Tangents;
    TArray<double> LastSuspension;
    double Timer=0, LastTravel[2]={0,0};
};
// Optional sidecar: source vehicle bytes remain unchanged. Only activate after complete validation.
bool RecoverTracks(AActor& Actor,USceneComponent* Hull,const FString& Id,const FWebPart& Source,FWebPart& StaticPart,FRecoveredTracks& Out);
void MoveRecoveredTracks(FRecoveredTracks& Rig,const double* Travel,double Delta,bool bNear,bool bPlayer,
    const TArray<FVector>& Wheels,const TArray<int32>& Sides,const TArray<double>& Suspension);
}
