// Single-scattering atmosphere (Rayleigh + Mie + ozone) used to bake the sky LUT.
export const atmosphereGLSL = /* glsl */ `
const float R_GROUND = 6360e3;
const float R_TOP = 6460e3;
const vec3 BETA_R = vec3( 5.802e-6, 13.558e-6, 33.1e-6 );
const float BETA_M_S = 3.996e-6;
const float BETA_M_E = 4.40e-6;
const vec3 BETA_O = vec3( 0.650e-6, 1.881e-6, 0.085e-6 );
const float H_R = 8000.0;
const float H_M = 1200.0;

uniform float uMieScale;
uniform float uRayleighScale;

vec2 raySphere( vec3 ro, vec3 rd, float r ) {
	float b = dot( ro, rd );
	float c = dot( ro, ro ) - r * r;
	float d = b * b - c;
	if ( d < 0.0 ) return vec2( -1.0 );
	d = sqrt( d );
	return vec2( -b - d, -b + d );
}

vec3 atmoDensity( float h ) {
	float oz = max( 0.0, 1.0 - abs( h - 25000.0 ) / 15000.0 );
	return vec3( exp( -h / H_R ), exp( -h / H_M ), oz );
}

vec3 extinction( vec3 d ) {
	return BETA_R * uRayleighScale * d.x + BETA_M_E * uMieScale * d.y + BETA_O * d.z;
}

vec3 transmittanceToTop( vec3 p, vec3 dir ) {
	vec2 g = raySphere( p, dir, R_GROUND );
	if ( g.x > 0.0 ) return vec3( 0.0 );
	float tMax = raySphere( p, dir, R_TOP ).y;
	const int N = 10;
	float dt = tMax / float( N );
	vec3 od = vec3( 0.0 );
	for ( int i = 0; i < N; i ++ ) {
		vec3 q = p + dir * ( float( i ) + 0.5 ) * dt;
		od += atmoDensity( length( q ) - R_GROUND ) * dt;
	}
	return exp( -( BETA_R * uRayleighScale * od.x + BETA_M_E * uMieScale * od.y + BETA_O * od.z ) );
}

float phaseRayleigh( float mu ) { return 3.0 / ( 16.0 * PI ) * ( 1.0 + mu * mu ); }
float phaseMie( float mu, float g ) {
	float gg = g * g;
	return 3.0 / ( 8.0 * PI ) * ( ( 1.0 - gg ) * ( 1.0 + mu * mu ) ) / ( ( 2.0 + gg ) * pow( max( 1.0 + gg - 2.0 * g * mu, 1e-4 ), 1.5 ) );
}

// In-scattered radiance along a view ray, for up to two light sources (sun, moon).
vec3 scatter( vec3 ro, vec3 rd, vec3 L1, vec3 E1, vec3 L2, vec3 E2 ) {
	vec2 top = raySphere( ro, rd, R_TOP );
	vec2 gnd = raySphere( ro, rd, R_GROUND );
	float tMax = top.y;
	if ( gnd.x > 0.0 ) tMax = min( tMax, gnd.x );
	const int N = 24;
	float mu1 = dot( rd, L1 ), mu2 = dot( rd, L2 );
	float pR1 = phaseRayleigh( mu1 ), pM1 = phaseMie( mu1, 0.78 );
	float pR2 = phaseRayleigh( mu2 ), pM2 = phaseMie( mu2, 0.78 );
	vec3 sum = vec3( 0.0 );
	vec3 odView = vec3( 0.0 );
	float tPrev = 0.0;
	for ( int i = 0; i < N; i ++ ) {
		// quadratic step distribution: dense near the viewer
		float f1 = ( float( i ) + 1.0 ) / float( N );
		float t = tMax * f1 * f1;
		float dt = t - tPrev;
		float tm = tPrev + dt * 0.5;
		tPrev = t;
		vec3 q = ro + rd * tm;
		float h = length( q ) - R_GROUND;
		vec3 d = atmoDensity( h );
		odView += d * dt;
		vec3 Tv = exp( -( BETA_R * uRayleighScale * odView.x + BETA_M_E * uMieScale * odView.y + BETA_O * odView.z ) );
		vec3 up = q / length( q );
		vec3 sR = BETA_R * uRayleighScale * d.x;
		float sM = BETA_M_S * uMieScale * d.y;
		vec3 T1 = transmittanceToTop( q, L1 );
		vec3 T2 = transmittanceToTop( q, L2 );
		vec3 s1 = ( sR * pR1 + sM * pM1 ) * T1 * E1;
		vec3 s2 = ( sR * pR2 + sM * pM2 ) * T2 * E2;
		// cheap multiple-scattering term: isotropic, driven by how lit the upper atmosphere is
		vec3 ms = ( sR + sM ) * ( E1 * T1 * 0.16 * max( dot( up, L1 ) + 0.25, 0.0 ) + E2 * T2 * 0.16 * max( dot( up, L2 ) + 0.25, 0.0 ) );
		sum += Tv * ( s1 + s2 + ms ) * dt;
	}
	return sum;
}
`;

// Shared LUT direction mapping: azimuth around u, elevation packed with extra resolution at the horizon.
export const skyMappingGLSL = /* glsl */ `
vec2 dirToSkyUV( vec3 d ) {
	float az = atan( d.x, -d.z );
	float el = asin( clamp( d.y, -1.0, 1.0 ) );
	float v = 0.5 + 0.5 * sign( el ) * sqrt( abs( el ) / ( 0.5 * PI ) );
	return vec2( az / ( 2.0 * PI ) + 0.5, v );
}
vec3 skyUVToDir( vec2 uv ) {
	float az = ( uv.x - 0.5 ) * 2.0 * PI;
	float s = ( uv.y - 0.5 ) * 2.0;
	float el = sign( s ) * s * s * 0.5 * PI;
	return vec3( sin( az ) * cos( el ), sin( el ), -cos( az ) * cos( el ) );
}
`;
