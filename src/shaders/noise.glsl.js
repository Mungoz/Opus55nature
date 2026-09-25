// Shared GLSL noise library. Hashes are sine-free (Dave Hoskins) so they stay stable across GPUs.
export const noiseGLSL = /* glsl */ `
#ifndef NOISE_GLSL
#define NOISE_GLSL

#ifndef PI
#define PI 3.141592653589793
#endif
#define TAU 6.283185307179586

const mat2 M2 = mat2( 0.8, -0.6, 0.6, 0.8 );

float hash11( float p ) { p = fract( p * .1031 ); p *= p + 33.33; p *= p + p; return fract( p ); }
float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * .1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float hash13( vec3 p3 ) { p3 = fract( p3 * .1031 ); p3 += dot( p3, p3.zyx + 31.32 ); return fract( ( p3.x + p3.y ) * p3.z ); }
vec2 hash21( float p ) { vec3 p3 = fract( vec3( p ) * vec3( .1031, .1030, .0973 ) ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.xx + p3.yz ) * p3.zy ); }
vec2 hash22( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * vec3( .1031, .1030, .0973 ) ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.xx + p3.yz ) * p3.zy ); }
vec3 hash32( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * vec3( .1031, .1030, .0973 ) ); p3 += dot( p3, p3.yxz + 33.33 ); return fract( ( p3.xxy + p3.yzz ) * p3.zyx ); }
vec3 hash33( vec3 p3 ) { p3 = fract( p3 * vec3( .1031, .1030, .0973 ) ); p3 += dot( p3, p3.yxz + 33.33 ); return fract( ( p3.xxy + p3.yxx ) * p3.zyx ); }

// Value noise with analytic derivatives. Returns (value in [-1,1], d/dx, d/dy).
vec3 vnoised( vec2 x ) {
	vec2 p = floor( x );
	vec2 w = fract( x );
	vec2 u = w * w * w * ( w * ( w * 6.0 - 15.0 ) + 10.0 );
	vec2 du = 30.0 * w * w * ( w * ( w - 2.0 ) + 1.0 );
	float a = hash12( p );
	float b = hash12( p + vec2( 1.0, 0.0 ) );
	float c = hash12( p + vec2( 0.0, 1.0 ) );
	float d = hash12( p + vec2( 1.0, 1.0 ) );
	float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
	return vec3( -1.0 + 2.0 * ( a + k1 * u.x + k2 * u.y + k4 * u.x * u.y ), 2.0 * du * vec2( k1 + k4 * u.y, k2 + k4 * u.x ) );
}

float vnoise( vec2 x ) {
	vec2 p = floor( x );
	vec2 w = fract( x );
	vec2 u = w * w * ( 3.0 - 2.0 * w );
	float a = hash12( p );
	float b = hash12( p + vec2( 1.0, 0.0 ) );
	float c = hash12( p + vec2( 0.0, 1.0 ) );
	float d = hash12( p + vec2( 1.0, 1.0 ) );
	return -1.0 + 2.0 * mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

// Gradient noise, roughly [-1,1].
float gnoise( vec2 p ) {
	vec2 i = floor( p );
	vec2 f = fract( p );
	vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
	vec2 ga = hash22( i ) * 2.0 - 1.0;
	vec2 gb = hash22( i + vec2( 1.0, 0.0 ) ) * 2.0 - 1.0;
	vec2 gc = hash22( i + vec2( 0.0, 1.0 ) ) * 2.0 - 1.0;
	vec2 gd = hash22( i + vec2( 1.0, 1.0 ) ) * 2.0 - 1.0;
	float va = dot( ga, f );
	float vb = dot( gb, f - vec2( 1.0, 0.0 ) );
	float vc = dot( gc, f - vec2( 0.0, 1.0 ) );
	float vd = dot( gd, f - vec2( 1.0, 1.0 ) );
	return 1.6 * ( va + u.x * ( vb - va ) + u.y * ( vc - va ) + u.x * u.y * ( va - vb - vc + vd ) );
}

float gnoise3( vec3 p ) {
	vec3 i = floor( p );
	vec3 f = fract( p );
	vec3 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
	#define G3(o) dot( hash33( i + o ) * 2.0 - 1.0, f - o )
	float n000 = G3( vec3( 0, 0, 0 ) );
	float n100 = G3( vec3( 1, 0, 0 ) );
	float n010 = G3( vec3( 0, 1, 0 ) );
	float n110 = G3( vec3( 1, 1, 0 ) );
	float n001 = G3( vec3( 0, 0, 1 ) );
	float n101 = G3( vec3( 1, 0, 1 ) );
	float n011 = G3( vec3( 0, 1, 1 ) );
	float n111 = G3( vec3( 1, 1, 1 ) );
	#undef G3
	return 1.4 * mix( mix( mix( n000, n100, u.x ), mix( n010, n110, u.x ), u.y ),
	                  mix( mix( n001, n101, u.x ), mix( n011, n111, u.x ), u.y ), u.z );
}

float fbm2( vec2 p, int oct ) {
	float a = 0.0, b = 0.5;
	for ( int i = 0; i < 10; i ++ ) {
		if ( i >= oct ) break;
		a += b * gnoise( p );
		b *= 0.5;
		p = M2 * p * 2.03 + 17.1;
	}
	return a;
}

float fbm3( vec3 p, int oct ) {
	float a = 0.0, b = 0.5;
	for ( int i = 0; i < 8; i ++ ) {
		if ( i >= oct ) break;
		a += b * gnoise3( p );
		b *= 0.5;
		p = p * 2.02 + vec3( 13.1, 7.3, 5.9 );
	}
	return a;
}

// Cellular noise: returns (F1, F2, cell id hash).
vec3 voronoi( vec2 x ) {
	vec2 n = floor( x );
	vec2 f = fract( x );
	float f1 = 8.0, f2 = 8.0, id = 0.0;
	for ( int j = -1; j <= 1; j ++ )
	for ( int i = -1; i <= 1; i ++ ) {
		vec2 g = vec2( float( i ), float( j ) );
		vec2 o = hash22( n + g );
		vec2 r = g + o - f;
		float d = dot( r, r );
		if ( d < f1 ) { f2 = f1; f1 = d; id = hash12( n + g + 71.3 ); }
		else if ( d < f2 ) { f2 = d; }
	}
	return vec3( sqrt( f1 ), sqrt( f2 ), id );
}

float interleavedGradient( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }

#endif
`;

// Periodic variants used to bake seamless tiling textures.
export const tileNoiseGLSL = /* glsl */ `
float tgnoise( vec2 p, vec2 period ) {
	vec2 i = floor( p );
	vec2 f = fract( p );
	vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
	vec2 i00 = mod( i, period );
	vec2 i10 = mod( i + vec2( 1.0, 0.0 ), period );
	vec2 i01 = mod( i + vec2( 0.0, 1.0 ), period );
	vec2 i11 = mod( i + vec2( 1.0, 1.0 ), period );
	float va = dot( hash22( i00 ) * 2.0 - 1.0, f );
	float vb = dot( hash22( i10 ) * 2.0 - 1.0, f - vec2( 1.0, 0.0 ) );
	float vc = dot( hash22( i01 ) * 2.0 - 1.0, f - vec2( 0.0, 1.0 ) );
	float vd = dot( hash22( i11 ) * 2.0 - 1.0, f - vec2( 1.0, 1.0 ) );
	return 1.6 * ( va + u.x * ( vb - va ) + u.y * ( vc - va ) + u.x * u.y * ( va - vb - vc + vd ) );
}

float tfbm( vec2 p, vec2 period, int oct ) {
	float a = 0.0, b = 0.5;
	for ( int i = 0; i < 10; i ++ ) {
		if ( i >= oct ) break;
		a += b * tgnoise( p, period );
		b *= 0.5;
		p *= 2.0;
		period *= 2.0;
	}
	return a;
}

// Periodic cellular noise: (F1, F2, id)
vec3 tvoronoi( vec2 x, vec2 period ) {
	vec2 n = floor( x );
	vec2 f = fract( x );
	float f1 = 8.0, f2 = 8.0, id = 0.0;
	for ( int j = -1; j <= 1; j ++ )
	for ( int i = -1; i <= 1; i ++ ) {
		vec2 g = vec2( float( i ), float( j ) );
		vec2 c = mod( n + g, period );
		vec2 o = hash22( c + 0.37 );
		vec2 r = g + o - f;
		float d = dot( r, r );
		if ( d < f1 ) { f2 = f1; f1 = d; id = hash12( c + 71.3 ); }
		else if ( d < f2 ) { f2 = d; }
	}
	return vec3( sqrt( f1 ), sqrt( f2 ), id );
}
`;
