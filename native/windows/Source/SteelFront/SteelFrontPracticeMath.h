#pragma once

#include <algorithm>
#include <cmath>

namespace SteelFront
{
constexpr double BrakeBuildup = 0.075;
constexpr double ShermanBrakeDeceleration = 2500.0; // cm/s²
constexpr double ShellSpeed = 79000.0; // cm/s
constexpr double ShotRange = 48000.0; // cm
constexpr double ShotLifetime = ShotRange / ShellSpeed;

struct FBrakeMotion
{
    double Speed;
    double Travel;
};

inline FBrakeMotion BrakeSherman(double Speed, double Progress, double Step)
{
    const double Rate = 400.0 + Progress * (ShermanBrakeDeceleration - 400.0);
    const double Duration = std::min(Step, std::abs(Speed) / Rate);
    const double Next = std::copysign(std::max(0.0, std::abs(Speed) - Rate * Duration), Speed);
    return {Next, (Speed + Next) * 0.5 * Duration};
}

// A density proportional to exp(-2.4r) per unit area gives a gamma-distributed radius.
inline double DispersionSample(double U, double V)
{
    return -std::log((1.0 - U) * (1.0 - V)) / 2.4;
}
}
