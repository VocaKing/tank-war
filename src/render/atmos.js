// v5 atmosphere + far shadows (global shader chunk overrides; import before any material compiles).
//
// 1) Exponential height fog. The FOG_EXP2 path is extended: fog density falls off with altitude
//    (density(y) = d * (floor + (1-floor) * exp(-k * (y - base)))), integrated analytically along the view ray,
//    so valleys and low ground hold haze while ridges and the sky stay clear. Parameters live in one shared
//    plain object (kept by reference through UniformsUtils.clone), so every material sees updates.
//    k = 0 disables the height term and reproduces the stock FogExp2 exactly. Linear Fog (garage) is untouched.
// 2) Far shadows. When a second shadow-casting directional light exists (World.farSun: same direction as the sun,
//    zero intensity, wide low-res frustum), the sun's shadow term uses the near map inside its frustum and fades to
//    the far map outside it. The far light adds no light of its own, so lighting energy is unchanged.
import * as THREE from 'three';

export const heightFog = { x: 0, y: 0, z: 1 }; // x: falloff k (1/m), y: base height (m), z: floor fraction

const U = THREE.UniformsLib.fog; U.twHFog = { value: heightFog };
for (const k of Object.keys(THREE.ShaderLib)) { const u = THREE.ShaderLib[k].uniforms; if (u && u.fogDensity) u.twHFog = { value: heightFog }; }

const C = THREE.ShaderChunk;
C.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth; varying float vTwFogDY;
#endif`;
C.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vTwFogDY = ( transpose( mat3( viewMatrix ) ) * mvPosition.xyz ).y;
#endif`;
C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor; varying float vFogDepth; varying float vTwFogDY;
  #ifdef FOG_EXP2
    uniform float fogDensity; uniform vec3 twHFog;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
#endif`;
C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float twDen = fogDensity;
    if ( twHFog.x > 0.0 ) {
      float k = twHFog.x; float t = k * vTwFogDY;
      float camF = exp( clamp( - k * ( cameraPosition.y - twHFog.y ), -12.0, 2.0 ) );
      float ray = abs( t ) > 1e-3 ? ( 1.0 - exp( - t ) ) / t : 1.0 - 0.5 * t; // mean of exp(-k*dy) along the ray
      twDen = fogDensity * ( twHFog.z + ( 1.0 - twHFog.z ) * camF * ray );
    }
    float fogFactor = 1.0 - exp( - twDen * twDen * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;

// near/far shadow blend for directional light 0 (sun) using directional shadow 1 (far sun)
const L0 = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
if (!C.lights_fragment_begin.includes(L0)) console.warn('atmos: lights_fragment_begin changed; far shadows disabled');
C.lights_fragment_begin = C.lights_fragment_begin.replace(L0, `
    #if NUM_DIR_LIGHT_SHADOWS > 1
      #if UNROLLED_LOOP_INDEX == 0
      if ( directLight.visible && receiveShadow ) {
        vec3 twc = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
        float twE = max( abs( twc.x - 0.5 ), abs( twc.y - 0.5 ) ) * 2.0; float twB = smoothstep( 0.82, 0.98, twE );
        float twS = twB < 1.0 ? getShadow( directionalShadowMap[ 0 ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ 0 ] ) : 1.0;
        if ( twB > 0.0 ) { DirectionalLightShadow twF = directionalLightShadows[ 1 ];
          float twSF = getShadow( directionalShadowMap[ 1 ], twF.shadowMapSize, twF.shadowIntensity, twF.shadowBias, twF.shadowRadius, vDirectionalShadowCoord[ 1 ] );
          twS = mix( twS, twSF, twB ); }
        directLight.color *= twS;
      }
      #elif UNROLLED_LOOP_INDEX == 1
      directLight.color = vec3( 0.0 );
      #else
      ${L0}
      #endif
    #else
      ${L0}
    #endif`);
