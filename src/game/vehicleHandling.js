// Direction-aware tracked-vehicle steering and shared track friction budget.
export function steeringTravelDirection(throttle,longitudinal,threshold=.3){
 if(Math.abs(throttle)>.08)return Math.sign(throttle);
 if(Math.abs(longitudinal)>threshold)return Math.sign(longitudinal);
 return 1;
}
export function remainingTraction(maxTraction,longitudinalImpulse,lateralImpulse){
 const remaining=maxTraction*maxTraction-longitudinalImpulse*longitudinalImpulse-lateralImpulse*lateralImpulse;
 return Math.sqrt(Math.max(0,remaining));
}
export function longitudinalBrakeMode(throttle,longitudinal,brake,deadband=.45){
 if(brake)return 'service';
 if(Math.abs(throttle)>.08&&throttle*longitudinal<-.3&&Math.abs(longitudinal)>deadband)return 'counter';
 return 'drive';
}
