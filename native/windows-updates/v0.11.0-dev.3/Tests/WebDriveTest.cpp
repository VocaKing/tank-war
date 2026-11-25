#include "../Source/SteelFront/SteelFrontWebDrive.h"
#include <cassert>
#include <iostream>
using namespace SteelFrontWebDrive;
void advance(Input& x,int n){for(int i=0;i<n;i++){auto y=Step(x);x.longitudinal=y.longitudinal;x.lateral=y.lateral;x.yawRate=y.yawRate;}}
int main(){
 Input p;p.throttle=1;auto first=Step(p);assert(first.longitudinal>0&&first.longitudinal<.08);
 Input road=p,field=p;road.road=1;advance(road,120*20);advance(field,120*20);assert(road.longitudinal>field.longitudinal+1);
 Input turn=p;turn.steer=1;auto a=Step(turn);assert(a.yawRate>0&&a.yawRate<turn.turnMax*.2);advance(turn,120);assert(turn.yawRate>0&&turn.yawRate<turn.turnMax);
 Input lateral;p.lateral=3;lateral=p;lateral.throttle=0;advance(lateral,120);assert(std::abs(lateral.lateral)<.01);
 Input reverse;reverse.throttle=-1;reverse.steer=1;advance(reverse,240);assert(reverse.longitudinal<-.3&&reverse.yawRate<0);
 Input stop=road;stop.throttle=0;stop.autoBrake=1;advance(stop,240);assert(std::abs(stop.longitudinal)<.02);
 Input wheeled;wheeled.wheeled=true;wheeled.steer=1;advance(wheeled,120);assert(std::abs(wheeled.yawRate)<.0001);
 Input light;light.throttle=1;light.light=true;assert(Step(light).longitudinal>Step(Input{light.dt,light.mass,light.power,light.length,light.width,light.forward,light.reverse,light.turnMax,1}).longitudinal);
 Input park;park.grade=.1;park.autoBrake=1;advance(park,120);assert(std::abs(park.longitudinal)<.03);
 std::cout<<"PASS: web-drive acceleration, grip, yaw response, lateral scrub, reversing, neutral brake, wheeled steering, class acceleration, slope hold\n";
}
