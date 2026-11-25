#include "SteelFrontRecoveredTracks.h"
#include "GameFramework/Actor.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/MemoryReader.h"

namespace SteelFront
{
namespace
{
FVector2D Sample(const TArray<FVector2D>& Path,double Phase)
{
    const int32 Count=Path.Num();
    Phase=FMath::Fmod(Phase,double(Count)); if(Phase<0) Phase+=Count;
    const int32 I=FMath::FloorToInt(Phase);
    return FMath::Lerp(Path[I],Path[(I+1)%Count],Phase-I);
}
double TangentAngle(const TArray<FVector2D>& Path,double Phase)
{
    const FVector2D D=Sample(Path,Phase+2.0)-Sample(Path,Phase-2.0);
    return FMath::Atan2(D.Y,D.X);
}
}
bool RecoverTracks(AActor& Actor,USceneComponent* Hull,const FString& Id,const FWebPart& Source,FWebPart& StaticPart,FRecoveredTracks& Out)
{
    TArray<uint8> Bytes;
    if(!FFileHelper::LoadFileToArray(Bytes,*FPaths::Combine(FPaths::ProjectContentDir(),TEXT("Prototype/WebFleet/RecoveredTracks"),Id+TEXT(".sft")))||Bytes.Num()<28||Bytes.Num()>20*1024*1024)return false;
    FMemoryReader R(Bytes,true);uint32 Magic=0,NV=0,NI=0,NG=0,NP=0;float L0=0,L1=0;
    R<<Magic<<NV<<NI<<NG<<NP<<L0<<L1;
    if(Magic!=0x31544653||NV!=uint32(Source.P.Num())||NI!=uint32(Source.I.Num())||NI%3||NG==0||NG>12000||NP<16||NP>2048||!FMath::IsFinite(L0)||!FMath::IsFinite(L1)||L0<100||L1<100||R.TotalSize()!=28+int64(NP)*16+int64(NG)*20+int64(NI/3)*2)return false;
    FRecoveredTracks Candidate; Candidate.Length[0]=L0;Candidate.Length[1]=L1;
    for(int32 Side=0;Side<2;++Side) for(uint32 J=0;J<NP;++J){float X=0,Z=0;R<<X<<Z;if(!FMath::IsFinite(X)||!FMath::IsFinite(Z))return false;Candidate.Path[Side].Emplace(X,Z);}
    for(uint32 J=0;J<NG;++J){uint32 Side=0;float Phase=0,X=0,Y=0,Z=0;R<<Side<<Phase<<X<<Y<<Z;if(Side>1||!FMath::IsFinite(Phase)||Phase<0||Phase>=NP||!FMath::IsFinite(X)||!FMath::IsFinite(Y)||!FMath::IsFinite(Z))return false;FRecoveredTrackGroup G;G.Side=int32(Side);G.Phase=Phase;G.Center=FVector(X,Y,Z);Candidate.Groups.Add(G);}
    FWebPart Moving; TArray<int32> StaticIndices;StaticIndices.Reserve(Source.I.Num());
    TArray<int32> Remap,VertexGroup;Remap.Init(INDEX_NONE,Source.P.Num());VertexGroup.Init(INDEX_NONE,Source.P.Num());
    for(uint32 J=0;J<NI/3;++J)
    {
        uint16 Group=0;R<<Group;if(Group>NG)return false;
        for(int32 C=0;C<3;++C)
        {
            const int32 I=Source.I[int32(J)*3+C];
            if(Group==0){StaticIndices.Add(I);continue;}
            if(Remap[I]==INDEX_NONE){Remap[I]=Moving.P.Num();VertexGroup[I]=int32(Group)-1;Moving.P.Add(Source.P[I]);Moving.N.Add(Source.N[I]);Moving.UV.Add(Source.UV[I]);Moving.C.Add(Source.C[I]);Candidate.GroupForVertex.Add(int32(Group)-1);}
            else if(VertexGroup[I]!=int32(Group)-1)return false;
            Moving.I.Add(Remap[I]);
        }
    }
    if(R.IsError()||R.Tell()!=R.TotalSize()||Moving.I.IsEmpty()||StaticIndices.IsEmpty())return false;
    // Preserve source winding and authored vertex attributes using the existing mesh creation path.
    auto* Mesh=Cast<UProceduralMeshComponent>(CreateWebPart(Actor,Hull,Moving,0,TEXT("WebFleet")));
    if(!Mesh)return false;
    Candidate.Mesh=Mesh;Candidate.BasePositions=MoveTemp(Moving.P);Candidate.BaseNormals=MoveTemp(Moving.N);
    Candidate.Positions=Candidate.BasePositions;Candidate.Normals=Candidate.BaseNormals;
    if(const FProcMeshSection* Section=Mesh->GetProcMeshSection(0))
        for(const FProcMeshVertex& V:Section->ProcVertexBuffer)Candidate.BaseTangents.Add(V.Tangent);
    if(Candidate.BaseTangents.Num()!=Candidate.BasePositions.Num()){Mesh->DestroyComponent();return false;}
    Candidate.Tangents=Candidate.BaseTangents;
    StaticPart=Source;StaticPart.I=MoveTemp(StaticIndices);Out=MoveTemp(Candidate);
    UE_LOG(LogTemp,Display,TEXT("Steel Front: recovered %d track components on %s"),Out.Groups.Num(),*Id);
    return true;
}
void MoveRecoveredTracks(FRecoveredTracks& Rig,const double* Travel,double Delta,bool bNear,bool bPlayer,
    const TArray<FVector>& Wheels,const TArray<int32>& Sides,const TArray<double>& Suspension)
{
    auto* Mesh=Rig.Mesh.Get();if(!Mesh||!Mesh->IsVisible()||!bNear)return;
    Rig.Timer-=Delta;if(Rig.Timer>0)return;
    Rig.Timer=bPlayer?(Rig.BasePositions.Num()>200000?1.0/24.0:1.0/30.0):1.0/15.0;
    bool bSuspensionChanged=Rig.LastSuspension.Num()!=Suspension.Num();
    if(!bSuspensionChanged)for(int32 I=0;I<Suspension.Num();++I)if(FMath::Abs(Rig.LastSuspension[I]-Suspension[I])>.5){bSuspensionChanged=true;break;}
    if(FMath::Abs(Travel[0]-Rig.LastTravel[0])+FMath::Abs(Travel[1]-Rig.LastTravel[1])<0.05&&!bSuspensionChanged)return;
    Rig.LastSuspension=Suspension;
    Rig.LastTravel[0]=Travel[0];Rig.LastTravel[1]=Travel[1];
    TArray<FQuat> Rotations;TArray<FVector> Centers;Rotations.Reserve(Rig.Groups.Num());Centers.Reserve(Rig.Groups.Num());
    double MinZ[2]={1e9,1e9},MaxZ[2]={-1e9,-1e9};
    for(int32 S=0;S<2;++S)for(const auto& P:Rig.Path[S]){MinZ[S]=FMath::Min(MinZ[S],P.Y);MaxZ[S]=FMath::Max(MaxZ[S],P.Y);}
    for(const auto& G:Rig.Groups)
    {
        const auto& Path=Rig.Path[G.Side];
        const double Phase=G.Phase-FMath::Fmod(Travel[G.Side],Rig.Length[G.Side])*Path.Num()/Rig.Length[G.Side];
        const FVector2D A=Sample(Path,G.Phase),B=Sample(Path,Phase);
        const FQuat Q(FVector::RightVector,TangentAngle(Path,G.Phase)-TangentAngle(Path,Phase));
        FVector Center=FVector(B.X,G.Center.Y,B.Y)+Q.RotateVector(G.Center-FVector(A.X,G.Center.Y,A.Y));
        double Weight=0,Height=0;
        for(int32 J=0;J<Wheels.Num();++J)if(Sides.IsValidIndex(J)&&Suspension.IsValidIndex(J)&&Sides[J]==G.Side){const double W=FMath::Max(0.0,1.0-FMath::Abs(Wheels[J].X-Center.X)/95.0);Weight+=W;Height+=W*Suspension[J];}
        if(Weight>0.001)Center.Z+=Height/Weight*(1.0-FMath::Clamp((B.Y-MinZ[G.Side])/FMath::Max(1.0,(MaxZ[G.Side]-MinZ[G.Side])*.65),0.0,1.0));
        Rotations.Add(Q);Centers.Add(Center);
    }
    for(int32 I=0;I<Rig.BasePositions.Num();++I){const int32 J=Rig.GroupForVertex[I];const FQuat& Q=Rotations[J];Rig.Positions[I]=Centers[J]+Q.RotateVector(Rig.BasePositions[I]-Rig.Groups[J].Center);Rig.Normals[I]=Q.RotateVector(Rig.BaseNormals[I]);Rig.Tangents[I]=FProcMeshTangent(Q.RotateVector(Rig.BaseTangents[I].TangentX),Rig.BaseTangents[I].bFlipTangentY);}
    Mesh->UpdateMeshSection_LinearColor(0,Rig.Positions,Rig.Normals,{},{},{},{},{},Rig.Tangents,false);
}
}
