import { noiseGLSL } from './noise.glsl.js';
import { skyMappingGLSL } from './atmosphere.glsl.js';

// Terrain heightmap / biome lookups, usable from vertex or fragment shaders.
export const terrainUniformsGLSL = /* glsl */ `
#ifndef STORY
#define STORY ${ __HORROR__ ? 1 : 0 }
#endif
${ __HORROR__ ? `#if STORY
uniform sampler2D uStoryMap;
uniform vec4 uStoryXf;
#endif` : '' }
uniform sampler2D uHNear;
uniform sampler2D uHFar;
uniform sampler2D uBiomeNear;
uniform sampler2D uBiomeFar;
uniform vec4 uNearXf;
uniform vec4 uFarXf;
`;

export const terrainLookupFnGLSL = /* glsl */ `
${ __HORROR__ ? `#if STORY
// the story's ground marks: x = metres across the trail (signed), y = trodden, z = puddle,
// w = cleared of plants
vec4 storyMap( vec2 p ) {
	vec2 uv = ( p - uStoryXf.xy ) * uStoryXf.zw;
	if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return vec4( 6.0, 0.0, 0.0, 0.0 );
	vec4 s = texture2D( uStoryMap, uv );
	return vec4( ( s.r - 0.5 ) * 12.0, s.gba );
}
#endif` : '' }
// ---------- terrain lookups ----------
float nearWeight( vec2 p ) {
	vec2 uv = ( p - uNearXf.xy ) * uNearXf.z;
	vec2 e = min( uv, 1.0 - uv );
	return smoothstep( 0.0, 0.03, min( e.x, e.y ) );
}
// (height, normal.x, normal.z, ao)
vec4 terrainHN( vec2 p ) {
	vec4 f = texture2D( uHFar, ( p - uFarXf.xy ) * uFarXf.z );
	float w = nearWeight( p );
	if ( w <= 0.0 ) return f;
	vec4 n = texture2D( uHNear, ( p - uNearXf.xy ) * uNearXf.z );
	vec4 r = mix( f, n, w );
	r.w = f.w * mix( 1.0, n.w, w );
	return r;
}
float terrainH( vec2 p ) { return terrainHN( p ).x; }
vec3 hnNormal( vec4 hn ) { return normalize( vec3( hn.y, sqrt( max( 0.0, 1.0 - hn.y * hn.y - hn.z * hn.z ) ), hn.z ) ); }
vec4 biomeAt( vec2 p ) {
	vec4 f = texture2D( uBiomeFar, ( p - uFarXf.xy ) * uFarXf.z );
	float w = nearWeight( p );
	if ( w <= 0.0 ) return f;
	return mix( f, texture2D( uBiomeNear, ( p - uNearXf.xy ) * uNearXf.z ), w );
}
`;

// Everything a nature material needs to agree on: terrain lookups, sky light,
// sun shadows (cascades x terrain x clouds), aerial perspective and the water column.
export const commonParsGLSL = /* glsl */ `
${noiseGLSL}
${skyMappingGLSL}

${terrainUniformsGLSL}
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uTrueSunDir;
uniform float uNight;
uniform sampler2D uSkyLUT;
uniform sampler2D uIrrLUT;
uniform sampler2D uTShadow;
uniform sampler2D uNoiseTex;
uniform vec4 uFog;
uniform vec4 uCloud;
uniform vec4 uWind;
uniform float uWaterLevel;
uniform vec4 uWeather;
uniform vec2 uCloudBase;
uniform vec3 uWaterAbsorb;
uniform vec3 uWaterScatter;

float saturate( float x ) { return clamp( x, 0.0, 1.0 ); }
vec3 saturate( vec3 x ) { return clamp( x, 0.0, 1.0 ); }
float luma( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }

${terrainLookupFnGLSL}
// ---------- sky light ----------
vec3 skyRadiance( vec3 d ) { return texture2D( uSkyLUT, dirToSkyUV( d ) ).rgb; }
vec3 skyIrradiance( vec3 n ) {
	// lightning lights the whole valley from above for an instant
	return texture2D( uIrrLUT, dirToSkyUV( n ) ).rgb + uWeather.w * vec3( 2.2, 2.4, 3.0 ) * ( 0.35 + 0.65 * saturate( n.y * 0.5 + 0.5 ) );
}

// ---------- shadows ----------
float terrainShadow( vec3 wp ) {
	float f = texture2D( uTShadow, ( wp.xz - uFarXf.xy ) * uFarXf.z ).g;
	float w = nearWeight( wp.xz );
	if ( w <= 0.0 ) return f;
	float n = texture2D( uTShadow, ( wp.xz - uNearXf.xy ) * uNearXf.z ).r;
	return mix( f, n, w );
}

float cloudDensityAt( vec2 p ) {
	vec2 uv = ( p + uCloud.yz ) / 9000.0;
	float base = texture2D( uNoiseTex, uv ).r;
	float det = texture2D( uNoiseTex, uv * 3.7 + 0.31 ).g;
	float d = base * 0.75 + det * 0.25;
	float cov = uCloud.x;
	return smoothstep( 1.0 - cov, 1.0 - cov + 0.28, d );
}

float cloudShadow( vec3 wp ) {
	vec3 L = uTrueSunDir;
	if ( L.y < 0.03 ) return 1.0;
	float t = ( 2300.0 - wp.y ) / L.y;
	vec2 p = wp.xz + L.xz * t;
	float d = cloudDensityAt( p );
	float fade = smoothstep( 0.03, 0.2, L.y );
	return 1.0 - d * uCloud.w * fade * ( 1.0 - uNight );
}

#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
	uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
	struct DirectionalLightShadow {
		float shadowIntensity;
		float shadowBias;
		float shadowNormalBias;
		float shadowRadius;
		vec2 shadowMapSize;
	};
	uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];

	vec2 vogel( int i, int n, float phi ) {
		float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
		float th = float( i ) * 2.399963 + phi;
		return vec2( cos( th ), sin( th ) ) * r;
	}
	#define SHADOW_PCF( MAP, P, TEXEL, RADIUS, OUT ) { \
		float phi_ = interleavedGradient( gl_FragCoord.xy ) * TAU; \
		float acc_ = 0.0; \
		for ( int k_ = 0; k_ < 6; k_ ++ ) acc_ += texture( MAP, vec3( P.xy + vogel( k_, 6, phi_ ) * TEXEL * RADIUS, P.z ) ); \
		OUT = acc_ / 6.0; }
#endif

float cascadeShadow( vec3 wp, vec3 n ) {
	float s = 1.0;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
		// slope-scaled normal offset: grazing light needs more to avoid banding
		float slopeK = 1.0 + 2.5 * ( 1.0 - saturate( dot( n, uSunDir ) ) );
		vec4 c0 = directionalShadowMatrix[ 0 ] * vec4( wp + n * directionalLightShadows[ 0 ].shadowNormalBias * slopeK, 1.0 );
		vec3 p0 = c0.xyz / c0.w;
		p0.z += directionalLightShadows[ 0 ].shadowBias;
		vec2 e0 = min( p0.xy, 1.0 - p0.xy );
		float w0 = smoothstep( 0.0, 0.1, min( e0.x, e0.y ) ) * step( p0.z, 1.0 );
		float s0 = 1.0;
		if ( w0 > 0.0 ) {
			SHADOW_PCF( directionalShadowMap[ 0 ], p0, 1.0 / directionalLightShadows[ 0 ].shadowMapSize.x, directionalLightShadows[ 0 ].shadowRadius, s0 )
		}
		#if NUM_DIR_LIGHT_SHADOWS > 1
			float s1 = 1.0;
			if ( w0 < 1.0 ) {
				vec4 c1 = directionalShadowMatrix[ 1 ] * vec4( wp + n * directionalLightShadows[ 1 ].shadowNormalBias * slopeK, 1.0 );
				vec3 p1 = c1.xyz / c1.w;
				p1.z += directionalLightShadows[ 1 ].shadowBias;
				vec2 e1 = min( p1.xy, 1.0 - p1.xy );
				float w1 = smoothstep( 0.0, 0.12, min( e1.x, e1.y ) ) * step( p1.z, 1.0 );
				if ( w1 > 0.0 ) {
					float r1;
					SHADOW_PCF( directionalShadowMap[ 1 ], p1, 1.0 / directionalLightShadows[ 1 ].shadowMapSize.x, directionalLightShadows[ 1 ].shadowRadius, r1 )
					s1 = mix( 1.0, r1, w1 );
				}
			}
			s = mix( s1, s0, w0 );
		#else
			s = mix( 1.0, s0, w0 );
		#endif
	#endif
	return s;
}

float sunShadow( vec3 wp, vec3 n ) {
	return cascadeShadow( wp, n ) * terrainShadow( wp ) * cloudShadow( wp );
}

// One hardware-filtered tap per cascade: for grass and particles.
float sunShadowFast( vec3 wp ) {
	float s = 1.0;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
		vec4 c0 = directionalShadowMatrix[ 0 ] * vec4( wp + uSunDir * 0.08, 1.0 );
		vec3 p0 = c0.xyz / c0.w;
		p0.z += directionalLightShadows[ 0 ].shadowBias * 2.0;
		vec2 e0 = min( p0.xy, 1.0 - p0.xy );
		float w0 = smoothstep( 0.0, 0.1, min( e0.x, e0.y ) ) * step( p0.z, 1.0 );
		float s0 = w0 > 0.0 ? texture( directionalShadowMap[ 0 ], p0 ) : 1.0;
		float s1 = 1.0;
		#if NUM_DIR_LIGHT_SHADOWS > 1
			if ( w0 < 1.0 ) {
				vec4 c1 = directionalShadowMatrix[ 1 ] * vec4( wp + uSunDir * 0.3, 1.0 );
				vec3 p1 = c1.xyz / c1.w;
				p1.z += directionalLightShadows[ 1 ].shadowBias * 2.0;
				vec2 e1 = min( p1.xy, 1.0 - p1.xy );
				float w1 = smoothstep( 0.0, 0.12, min( e1.x, e1.y ) ) * step( p1.z, 1.0 );
				if ( w1 > 0.0 ) s1 = mix( 1.0, texture( directionalShadowMap[ 1 ], p1 ), w1 );
			}
		#endif
		s = mix( s1, s0, w0 );
	#endif
	return s * terrainShadow( wp ) * cloudShadow( wp );
}

// ---------- water column ----------
vec3 waterExtinction() { return uWaterAbsorb + uWaterScatter * 4.0; }

// Light reaching a submerged point (attenuated on the way down) plus caustics.
vec3 underwaterLight( vec3 wp ) {
	float depth = uWaterLevel - wp.y;
	if ( depth <= 0.0 ) return vec3( 1.0 );
	vec3 atten = exp( -waterExtinction() * depth * 1.3 );
	return atten;
}

float caustics( vec3 wp ) {
	float depth = uWaterLevel - wp.y;
	if ( depth <= 0.0 ) return 0.0;
	vec2 p = wp.xz + uSunDir.xz / max( uSunDir.y, 0.2 ) * depth;
	float t = uTime * 0.045;
	float a = texture2D( uNoiseTex, p * 0.07 + vec2( t, t * 0.6 ) ).a;
	float b = texture2D( uNoiseTex, p * 0.057 + vec2( -t * 0.7, t * 0.9 ) + 0.5 ).a;
	float c = min( a, b );
	return c * smoothstep( 0.0, 0.4, depth ) * exp( -depth * 0.12 );
}

// Colour seen at the water surface for a submerged point (camera above water).
vec3 waterColumn( vec3 col, vec3 wp, vec3 sunLit ) {
	if ( wp.y >= uWaterLevel || cameraPosition.y < uWaterLevel ) return col;
	vec3 v = wp - cameraPosition;
	float len = length( v );
	float dy = max( -v.y / len, 0.03 );
	float depth = uWaterLevel - wp.y;
	float path = depth / dy;
	// refraction bends the ray toward the normal, shortening the path at grazing angles
	path = min( path, depth * 4.0 + 10.0 );
	vec3 ext = waterExtinction();
	vec3 T = exp( -ext * path );
	vec3 lightIn = sunLit * max( uSunDir.y, 0.0 ) * 0.5 + skyIrradiance( vec3( 0.0, 1.0, 0.0 ) ) * 0.25;
	lightIn *= exp( -ext * depth * 0.5 );
	vec3 inscatter = uWaterScatter / ext * lightIn * ( 1.0 - T );
	return col * T + inscatter;
}

// Colour of the cloud deck when you are looking into it (shared with the sky dome).
vec3 lowCloudColor() {
	vec3 e = skyIrradiance( vec3( 0.0, 1.0, 0.0 ) );
	float l = dot( e, vec3( 0.2126, 0.7152, 0.0722 ) );
	return mix( e, vec3( l ) * vec3( 0.9, 0.95, 1.02 ), 0.6 ) * 0.2 + uSunColor * 0.02;
}

// ---------- aerial perspective ----------
vec3 applyAtmosphere( vec3 col, vec3 wp ) {
	vec3 v = wp - cameraPosition;
	float dist = length( v );
	vec3 rd = v / max( dist, 1e-3 );
	float y0 = max( cameraPosition.y, -50.0 );
	// exponential haze with a 1.3 km scale height, integrated analytically along the ray
	float H = 1300.0;
	float k = rd.y * dist / H;
	float od = dist * exp( -y0 / H ) * ( abs( k ) > 1e-4 ? ( 1.0 - exp( -k ) ) / k : 1.0 );
	vec3 sigma = ( vec3( 5.8e-6, 13.5e-6, 33.1e-6 ) + vec3( 7.0e-6 ) ) * uFog.x;
	vec3 T = exp( -sigma * od );
	vec3 fogCol = skyRadiance( normalize( vec3( rd.x, max( rd.y, 0.0 ) + 0.035, rd.z ) ) );
	col = col * T + fogCol * ( 1.0 - T );

	// valley mist hugging the lake
	float mh = uFog.z;
	float km = rd.y * dist / mh;
	float odm = dist * exp( -max( y0 - uWaterLevel, 0.0 ) / mh ) * ( abs( km ) > 1e-4 ? ( 1.0 - exp( -km ) ) / km : 1.0 );
	float Tm = exp( -uFog.y * odm );
	float mu = dot( rd, uSunDir );
	float phase = 0.25 + 1.6 * pow( max( mu, 0.0 ), 8.0 );
	vec3 mistCol = skyIrradiance( vec3( 0.0, 1.0, 0.0 ) ) * 0.28 + uSunColor * phase * 0.12 * terrainShadow( mix( cameraPosition, wp, 0.5 ) );
	col = col * Tm + mistCol * ( 1.0 - Tm );

	// low cloud: in foul weather the peaks vanish into the cloud deck
	if ( uCloudBase.y > 0.0 ) {
		float y1 = wp.y;
		float hi = max( y0, y1 ), lo = min( y0, y1 );
		float above = dist * saturate( ( hi - uCloudBase.x ) / max( hi - lo, 1.0 ) );
		if ( lo > uCloudBase.x ) above = dist;
		float Tc = exp( -above * uCloudBase.y );
		vec3 cloudCol = lowCloudColor();
		col = col * Tc + cloudCol * ( 1.0 - Tc );
	}
	return col;
}

// ---------- shading helpers ----------
float D_GGX( float NoH, float a ) {
	float a2 = a * a;
	float d = NoH * NoH * ( a2 - 1.0 ) + 1.0;
	return a2 / ( PI * d * d );
}
float F_Schlick( float f0, float VoH ) { return f0 + ( 1.0 - f0 ) * pow( 1.0 - VoH, 5.0 ); }
float V_SmithApprox( float NoV, float NoL, float a ) {
	float k = a * 0.5;
	return 0.25 / ( ( NoV * ( 1.0 - k ) + k ) * ( NoL * ( 1.0 - k ) + k ) );
}
vec3 specGGX( vec3 N, vec3 V, vec3 L, float rough, float f0 ) {
	vec3 H = normalize( V + L );
	float NoL = saturate( dot( N, L ) );
	float NoV = max( dot( N, V ), 1e-3 );
	float NoH = saturate( dot( N, H ) );
	float VoH = saturate( dot( V, H ) );
	float a = rough * rough;
	return vec3( D_GGX( NoH, a ) * V_SmithApprox( NoV, NoL, a ) * F_Schlick( f0, VoH ) * NoL );
}

// Standard lit result for opaque diffuse-ish surfaces.
vec3 shadeSurface( vec3 albedo, vec3 N, vec3 V, vec3 wp, float ao, float shadow, float rough, float f0 ) {
	// rain soaks surfaces: darker, glossier, the more so the more they face the sky
	float wetS = uWeather.y * saturate( N.y * 0.7 + 0.3 );
	albedo *= 1.0 - wetS * 0.42;
	rough = mix( rough, 0.22, wetS * 0.75 );
	f0 = mix( f0, 0.05, wetS );
	vec3 L = uSunDir;
	float NoL = saturate( dot( N, L ) );
	vec3 sun = uSunColor * shadow;
	vec3 uw = underwaterLight( wp );
	vec3 direct = albedo / PI * sun * NoL * uw;
	vec3 amb = albedo / PI * skyIrradiance( N ) * ao * uw;
	vec3 spec = sun * specGGX( N, V, L, rough, f0 ) * uw;
	vec3 R = reflect( -V, N );
	float fres = F_Schlick( f0, saturate( dot( N, V ) ) );
	spec += skyRadiance( normalize( vec3( R.x, max( R.y, 0.02 ), R.z ) ) ) * fres * wetS * ao * 0.8;
	return direct + amb + spec;
}
`;
