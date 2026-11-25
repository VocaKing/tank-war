#pragma once
#include <cmath>
namespace SteelFrontSuspension
{
inline double Clamp(double X,double A,double B){return X<A?A:X>B?B:X;}
inline double Spring(double Mass,double Contacts,double Compression,double VerticalSpeed,double Gravity=980.0)
{
    if(Mass<=0||Contacts<=0||!std::isfinite(Compression)||!std::isfinite(VerticalSpeed))return 0;
    const double Load=Mass*Gravity/Contacts, K=Load/12.0, D=2.0*0.84*std::sqrt(K*Mass/Contacts);
    return Clamp(Load+K*Compression-D*VerticalSpeed,0.0,3.0*Load);
}
struct FTraction{double Forward,Lateral;};
inline FTraction Traction(double Mass,double Contacts,double Normal,double Desired,double Forward,double Side,double Mu=0.85)
{
    if(Mass<=0||Contacts<=0||Normal<=0||!std::isfinite(Desired)||!std::isfinite(Forward)||!std::isfinite(Side))return {0,0};
    FTraction F{(Desired-Forward)*Mass/Contacts*2.0,-Side*Mass/Contacts*4.0};
    const double Limit=Mu*Normal, Magnitude=std::hypot(F.Forward,F.Lateral);
    if(Magnitude>Limit&&Magnitude>0){F.Forward*=Limit/Magnitude;F.Lateral*=Limit/Magnitude;}
    return F;
}
inline double SideTarget(double Forward,double TurnRadians,double HalfGauge,int Side)
{return Forward+(Side==0?1.0:-1.0)*TurnRadians*HalfGauge;}
}
