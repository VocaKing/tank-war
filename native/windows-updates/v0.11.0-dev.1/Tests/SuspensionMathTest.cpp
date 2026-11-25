#include "../Source/SteelFront/SteelFrontSuspensionMath.h"
#include <cassert>
#include <cmath>
#include <iostream>
#include <limits>
using namespace SteelFrontSuspension;
int main(){
    const double m=45000,n=12,load=m*980/n;
    assert(std::abs(Spring(m,n,0,0)*n-m*980)<1e-6);
    assert(Spring(m,n,5,0)>load);
    assert(Spring(m,n,0,50)<load);
    assert(Spring(m,n,10000,0)==3*load);
    assert(Spring(m,n,-10000,0)==0);
    assert(Spring(0,n,0,0)==0);
    assert(Spring(m,n,std::numeric_limits<double>::quiet_NaN(),0)==0);
    auto t=Traction(m,n,load,1000,0,500);
    assert(t.Forward>0&&t.Lateral<0);
    assert(std::hypot(t.Forward,t.Lateral)<=.85*load+1e-6);
    t=Traction(m,n,load,0,200,-100);
    assert(t.Forward<0&&t.Lateral>0);
    assert(SideTarget(500,1,100,0)==600&&SideTarget(500,1,100,1)==400);
    assert(SideTarget(0,-1,100,0)==-100&&SideTarget(0,-1,100,1)==100);
    std::cout<<"Suspension and traction math: 12 assertions passed\n";
}
