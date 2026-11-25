#pragma once
#include <algorithm>
#include <cmath>
// SI-unit port of src/game/physics.js applyTraction at 00fe26f.
// Uses the native swept movement/terrain support instead of Rapier rigid bodies.
namespace SteelFrontWebDrive {
inline double Clamp(double x,double a,double b){return std::max(a,std::min(b,x));}
inline double Sign(double x){return (x>0)-(x<0);}
struct Input {
 double dt=1.0/120,mass=33700,power=900,length=6.27,width=3,forward=11.6,reverse=3.9,turnMax=.7156;
 double throttle=0,steer=0,road=0,longitudinal=0,lateral=0,yawRate=0,grade=0,bank=0,autoBrake=0,engine=1;
 double roadMultiplier=1,offRoadMultiplier=.72; bool light=false,wheeled=false,brake=false,mobile=true;
};
struct Output { double longitudinal,lateral,yawRate; };
inline Output Step(const Input& p){
 const double dt=p.dt,g=9.81,road=Clamp(p.road,0,1),grip=.82+road*.21;
 const double throttle=p.mobile?Clamp(p.throttle,-1,1):0,steer=p.mobile?Clamp(p.steer,-1,1):0;
 const double terrain=p.wheeled?(road>.12?(.88+.34*road)*p.roadMultiplier:p.offRoadMultiplier):.78+.22*std::min(1.,road*1.5);
 const double full=std::max(.1,p.forward),limit=(throttle<0?p.reverse:full)*p.engine*terrain;
 const double lowGear=4.3*std::pow(std::max(0.,1-std::abs(p.longitudinal)/9),2);
 const double driveLimit=(lowGear+Clamp(p.power/(p.mass/1000)*.075,.6,2.2)*(p.light?2.4:1))*p.engine;
 const double gradeAcceleration=-g*p.grade, coast=(!throttle&&std::abs(p.longitudinal)<.45)?6:.75+std::abs(p.longitudinal)*.07;
 const double downhill=std::max(0.,Sign(p.longitudinal)*gradeAcceleration);
 const double autoLimit=std::max(coast,25*Clamp(p.mass/33700,.33,2.5)+downhill);
 const double neutral=coast+(autoLimit-coast)*Clamp(p.autoBrake,0,1);
 const double braking=p.brake||!p.mobile?7:(throttle?(throttle*p.longitudinal<0?5:3.2):neutral);
 const double target=p.brake?0:throttle*limit,err=target-p.longitudinal;
 const double acceleration=!p.brake&&throttle&&Sign(err)==Sign(throttle)?driveLimit:braking;
 const double park=(!throttle&&std::abs(p.longitudinal)<.45)?-gradeAcceleration:0;
 const double drive=Clamp(err/dt+park,-acceleration,acceleration)*p.mass*dt;
 const double lateral=(-p.lateral/.075-g*p.bank)*p.mass*dt;
 const double maxTraction=p.mass*g*dt*grip*std::sqrt(std::max(0.,1-p.grade*p.grade));
 const double brakeGrip=p.autoBrake>0?std::max(1.,neutral/(g*.82)):1;
 const double demand=std::hypot(drive/brakeGrip,lateral),scale=demand>maxTraction?maxTraction/demand:1;
 double longitudinal=p.longitudinal+drive*scale/p.mass+gradeAcceleration*dt;
 double sideways=p.lateral+lateral*scale/p.mass+g*p.bank*dt;
 const double turnLimit=p.turnMax*(1-.45*std::min(1.,std::abs(p.longitudinal)/full));
 double commanded=p.brake?0:steer*turnLimit*(p.longitudinal<-.3?-1:1);
 // Wheeled vehicles cannot pivot in place; steering authority rises with speed.
 if(p.wheeled)commanded*=Clamp(std::abs(p.longitudinal)/2,0,1);
 const double inertia=std::max(1.,p.mass*(p.length*p.length+p.width*p.width)/12);
 const double torqueLimit=maxTraction*p.width*.53;
 const double response=steer?.105:.065;
 const double impulse=Clamp((commanded-p.yawRate)*dt/response*inertia,-torqueLimit,torqueLimit);
 double yaw=(p.yawRate+impulse/inertia)*std::exp(-.25*dt);
 longitudinal*=std::exp(-.014*dt);sideways*=std::exp(-.014*dt);
 if(!throttle&&std::abs(longitudinal)<.015&&std::abs(p.grade)<.02)longitudinal=0;
 return {longitudinal,sideways,yaw};
}
}
