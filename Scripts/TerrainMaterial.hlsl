// Vertex splat and road spline data from the Normandy heightfield.
// All terrain textures tile and share a sampler, leaving room for UE's lighting samplers.
float2 uvA = UV, uvB = UV * 1.1, uvC = UV * (3.2 / 6.0), uvD = UV * (3.2 / 3.5);
float br = Texture2DSample(CC, CASampler, UV * (3.2 / 41.0)).r;
float br2 = Texture2DSample(CA, CASampler, UV * (3.2 / 133.0)).g;
float3 World = float3(-UV.y, UV.x, RoadMask.y / 3.2) * 320.0;
float3 normal = normalize(cross(ddx(World), ddy(World)));
float3 face = abs(normal);
float steep = smoothstep(0.28, 0.55, 1.0 - face.z);
float4 w = max(Blend, 0.0);
w.x *= (0.8 + br2 * 0.4) * (1.0 - steep * 0.85);
w.y *= (0.55 + br * 0.9) * (1.0 - steep * 0.85);
w.z += steep * 2.5 * (1.0 - w.w);

float3 a = Texture2DSample(CA, CASampler, uvA).rgb * TintA;
float3 b = Texture2DSample(CB, CASampler, uvB).rgb * TintB;
float3 c = Texture2DSample(CC, CASampler, uvC).rgb;
float3 d = Texture2DSample(CD, CASampler, uvD).rgb;
float distant = smoothstep(2500.0, 14000.0, Distance);
a = lerp(a, (a + Texture2DSample(CA, CASampler, uvA * 0.173).rgb * TintA) * 0.5, distant);
b = lerp(b, (b + Texture2DSample(CB, CASampler, uvB * 0.173).rgb * TintB) * 0.5, distant);
if (steep > 0.01) {
    float3 axes = pow(face, 4.0);
    axes /= max(0.001, axes.x + axes.y + axes.z);
    c = Texture2DSample(CC, CASampler, World.yz / 600.0).rgb * axes.x +
        Texture2DSample(CC, CASampler, World.xz / 600.0).rgb * axes.y + c * axes.z;
}
float3 average = 1.0 / 3.0;
float4 height = float4(dot(a, average), dot(b, average), dot(c, average), dot(d, average)) * 0.6 + w * 1.4;
float crest = max(max(height.x, height.y), max(height.z, height.w)) - 0.18;
w = max(height - crest, 0.0) * step(0.001, w);
w /= max(0.001, dot(w, float4(1, 1, 1, 1)));
float3 ground = (a * w.x + b * w.y + c * w.z + d * w.w) * float3(TintRG, TintBWet.x) * 1.5;

float rut = 1 - smoothstep(0.23, 0.59, abs(abs(RoadUV.x) - 0.97) + (br - 0.5) * 0.19);
float roadFade = RoadMask.x * w.w * (1.0 - smoothstep(5500.0, 15500.0, Distance));
float gravel = Texture2DSample(CD, CASampler, RoadUV * float2(0.54, 0.27)).r;
ground *= lerp(1, 0.71 + 0.19 * gravel, roadFade * rut);
ground *= lerp(float3(1, 1, 1), float3(0.76, 0.79, 0.68), TintBWet.y * 0.74);
ground *= 0.84 + 0.32 * Texture2DSample(CB, CASampler, UV * (3.2 / 97.0)).g;

float3 properties = Texture2DSample(PA, CASampler, uvA).rgb * w.x +
    Texture2DSample(PB, CASampler, uvB).rgb * w.y + Texture2DSample(PC, CASampler, uvC).rgb * w.z +
    Texture2DSample(PD, CASampler, uvD).rgb * w.w;
OutAO = lerp(properties.r, 1, distant * 0.8);
OutRoughness = lerp(lerp(0.72, 1, properties.g), 0.66, TintBWet.y * 0.58);
float2 micro = (Texture2DSample(NA, CASampler, uvA).rg * w.x +
    Texture2DSample(NB, CASampler, uvB).rg * w.y + Texture2DSample(NC, CASampler, uvC).rg * w.z +
    Texture2DSample(ND, CASampler, uvD).rg * w.w) * 2.0 - 1.0;
OutNormal = normalize(float3(micro * (0.9 - distant * 0.63), 1));
return ground;
