import * as THREE from 'three';
import { canBeSeen } from '../gen/visibility.js';
import { commonParsGLSL } from '../shaders/common.glsl.js';
import { noiseGLSL } from '../shaders/noise.glsl.js';
import { sharedUniforms, U } from '../core/uniforms.js';
import { RNG, hash2 } from '../core/rng.js';
import { makeConifer, makeBirch, makeShrub, makeBroadleaf, makeSnag, makeMushrooms, makeFern, makeHeath } from './treeGen.js';
import { buildFoliageAtlas } from '../gen/foliageAtlas.js';
import { WORLD } from '../core/world.js';

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const foliageShading = /* glsl */ `
// Species tint for foliage (kind: 3 spruce, 4 larch, 5 birch, 6 shrub, 7 stone pine, 8 aspen, 9 rowan, 10 bracken, 11 heath)
vec3 foliageTint( float kind, float rnd, float branch ) {
	float r2 = fract( rnd * 7.13 + branch * 0.37 );
	if ( kind < 3.5 ) return mix( vec3( 0.85, 0.95, 0.9 ), vec3( 1.1, 1.05, 0.95 ), rnd ) * ( 0.85 + 0.25 * r2 );
	if ( kind < 4.5 ) {
		// larches: most gold, some amber, a few lagging green-gold
		vec3 t = mix( vec3( 1.0, 0.92, 0.75 ), vec3( 1.08, 0.78, 0.55 ), smoothstep( 0.55, 0.95, rnd ) );
		t = mix( t, vec3( 0.8, 0.95, 0.55 ), step( rnd, 0.12 ) * 0.7 );
		return t * ( 0.85 + 0.3 * r2 );
	}
	if ( kind < 5.5 ) return mix( vec3( 1.0 ), vec3( 1.1, 0.85, 0.6 ), smoothstep( 0.6, 1.0, rnd ) ) * ( 0.85 + 0.3 * r2 );
	if ( kind < 6.5 ) return vec3( 0.9 + 0.3 * r2 );
	if ( kind < 7.5 ) return mix( vec3( 0.85, 0.95, 1.0 ), vec3( 1.0, 1.02, 0.95 ), rnd ) * ( 0.85 + 0.25 * r2 );
	if ( kind < 8.5 ) {
		// each aspen clone turns its own shade, lemon to orange, a few still green
		vec3 t = mix( vec3( 1.05, 1.0, 0.8 ), vec3( 1.12, 0.72, 0.5 ), smoothstep( 0.45, 0.95, rnd ) );
		t = mix( t, vec3( 0.75, 1.0, 0.55 ), step( rnd, 0.1 ) * 0.7 );
		return t * ( 0.85 + 0.3 * r2 );
	}
	if ( kind < 9.5 ) return mix( vec3( 1.1, 0.9, 0.75 ), vec3( 0.95, 0.62, 0.62 ), rnd ) * ( 0.85 + 0.3 * r2 );
	if ( kind < 10.5 ) return mix( vec3( 1.05, 0.95, 0.85 ), vec3( 0.95, 0.75, 0.6 ), rnd ) * ( 0.8 + 0.35 * r2 );
	return vec3( 0.85 + 0.35 * r2 );
}

vec3 shadeFoliage( vec3 albedo, vec3 N, vec3 V, vec3 wp, float ao, float sh ) {
	albedo *= 1.0 - uWeather.y * 0.25;
	vec3 L = uSunDir;
	float NoL = dot( N, L );
	float wrap = saturate( ( NoL + 0.45 ) / 1.45 );
	float back = pow( saturate( dot( -V, L ) ), 3.0 );
	vec3 trans = albedo * saturate( albedo * 2.2 ) * back * ( 0.5 + 0.5 * ao ) * 2.2;
	vec3 direct = uSunColor * sh * ( albedo / PI * wrap + trans * 0.3 );
	vec3 amb = albedo / PI * skyIrradiance( N ) * ao;
	vec3 H = normalize( L + V );
	float spec = pow( saturate( dot( N, H ) ), 20.0 ) * 0.035 * sh * ao;
	return ( direct + amb ) * underwaterLight( wp ) + uSunColor * spec;
}


// Sculpted deadwood (stumps, fallen trunks). axis: the trunk direction; origin: the instance.
// bk.x: bark still on (1) or bare wood (0); bk.y: 0 side, 1 end grain, 2 soil of a root plate.
vec3 sculptedWood( float kind, vec3 wp, vec3 N, vec3 axis, vec3 origin, vec2 bk, float ringR, float rnd, out float rough, out float bumpH, out float mossM ) {
	vec3 rel = wp - origin;
	float along = dot( rel, axis );
	vec3 perp = rel - axis * along;
	vec3 c = vec3( 0.0 );
	rough = 0.88;
	bumpH = 0.0;
	mossM = 0.0;
	if ( bk.y > 3.5 ) {
		// roots torn out of the ground: dark, earth-caked, pale where the bark has scuffed off
		float sc = gnoise3( wp * 14.0 ) * 0.5 + 0.5;
		c = mix( vec3( 0.07, 0.05, 0.035 ), vec3( 0.2, 0.15, 0.1 ), smoothstep( 0.3, 0.9, sc ) );
		c = mix( c, vec3( 0.1, 0.075, 0.05 ), smoothstep( 0.4, 0.9, gnoise3( wp * 4.0 + 7.0 ) ) * 0.5 );
		bumpH = sc * 0.5;
		mossM = 0.0;
		return c;
	}
	if ( bk.y > 2.5 ) {
		// the old forest floor on the plate's trunk side: a mat of turf, moss and needles
		float tn = gnoise3( wp * 7.0 ) * 0.5 + 0.5, tf = gnoise3( wp * 30.0 ) * 0.5 + 0.5;
		c = mix( vec3( 0.03, 0.04, 0.014 ), vec3( 0.11, 0.115, 0.04 ), smoothstep( 0.2, 0.9, tn ) );
		// dead grass and needle litter, and earth showing through
		c = mix( c, vec3( 0.17, 0.13, 0.07 ), smoothstep( 0.5, 0.85, tf ) * 0.55 );
		c = mix( c, vec3( 0.06, 0.045, 0.03 ), smoothstep( 0.6, 0.85, gnoise3( wp * 3.0 + 2.0 ) * 0.5 + 0.5 ) * 0.6 );
		bumpH = tn * 0.6 + tf * 0.4;
		mossM = 0.35;
		return c;
	}
	if ( bk.y > 1.5 ) {
		// the soil and stones held in an upturned root plate
		// dark humus, with patches of paler, sandy mineral soil torn up from below, and stones
		float clod = gnoise3( wp * 5.0 ) * 0.5 + 0.5;
		float grit = gnoise3( wp * 38.0 ) * 0.5 + 0.5;
		float sand = smoothstep( 0.55, 0.8, gnoise3( wp * 1.7 + 4.0 ) * 0.5 + 0.5 );
		c = mix( vec3( 0.045, 0.034, 0.024 ), vec3( 0.11, 0.085, 0.06 ), smoothstep( 0.35, 0.8, clod ) );
		c = mix( c, mix( vec3( 0.16, 0.12, 0.08 ), vec3( 0.24, 0.19, 0.13 ), clod ), sand * 0.8 );
		c = mix( c, vec3( 0.22, 0.21, 0.19 ), step( 0.84, grit ) * 0.6 );
		c = mix( c, vec3( 0.13, 0.1, 0.075 ), smoothstep( 0.6, 0.9, abs( gnoise3( wp * vec3( 9.0, 2.5, 9.0 ) ) ) ) * 0.6 );
		bumpH = clod * 0.9 + grit * 0.4;
		mossM = 0.0;
		return c;
	}
	if ( bk.y > 0.5 ) {
		// end grain: growth rings, drying checks from the heart, greyed by weather, rotten at the heart
		float r = ringR + 0.025 * gnoise3( wp * 7.0 );
		float rings = 0.5 + 0.5 * sin( r * 6.283 * 26.0 );
		c = mix( vec3( 0.27, 0.2, 0.13 ), vec3( 0.42, 0.33, 0.22 ), rings * 0.5 + 0.25 );
		c = mix( c, vec3( 0.26, 0.245, 0.22 ), 0.6 * smoothstep( -0.3, 0.5, gnoise3( wp * 3.0 + rnd * 7.0 ) ) );
		float check = smoothstep( 0.86, 0.97, 1.0 - abs( gnoise3( normalize( perp + 1e-4 ) * 6.0 + vec3( r * 0.8 ) ) ) ) * smoothstep( 0.12, 0.4, r );
		c *= 1.0 - check * 0.8;
		c = mix( c * vec3( 0.5, 0.4, 0.32 ), c, smoothstep( 0.1, 0.32, r ) );
		c = mix( c, vec3( 0.05, 0.038, 0.03 ), smoothstep( 0.9, 0.98, r ) );
		bumpH = rings * 0.15 - check * 0.9;
	} else {
		// bark: long plates split by dark fissures, following the grain
		float plates = gnoise3( perp * 26.0 + axis * along * 3.5 + rnd * 11.0 ) + 0.5 * gnoise3( perp * 9.0 + axis * along * 1.2 );
		float fiss = 1.0 - smoothstep( 0.0, 0.17, abs( plates ) );
		float flake = gnoise3( perp * 40.0 + axis * along * 9.0 );
		// stumps keep the warm, dark red-brown of old larch and spruce bark; fallen trunks weather greyer
		bool isStump = kind > -8.5;
		vec3 barkC = isStump ? mix( vec3( 0.06, 0.036, 0.024 ), vec3( 0.17, 0.1, 0.065 ), smoothstep( -0.6, 0.6, flake ) ) : mix( vec3( 0.075, 0.056, 0.042 ), vec3( 0.2, 0.155, 0.115 ), smoothstep( -0.6, 0.6, flake ) );
		barkC = mix( barkC, vec3( 0.022, 0.017, 0.013 ), fiss * 0.85 );
		barkC = mix( barkC, vec3( 0.3, 0.3, 0.26 ), smoothstep( 0.55, 0.8, gnoise3( wp * 5.0 + 3.0 ) ) * 0.3 * ( 1.0 - fiss ) );
		// bare wood: silvered, finely grained, split by long checks, stained dark where damp
		float grain = gnoise3( perp * 55.0 + axis * along * 1.8 );
		float crack = 1.0 - smoothstep( 0.0, 0.045, abs( gnoise3( perp * 13.0 + axis * along * 0.7 + 5.0 ) ) );
		vec3 woodC = mix( vec3( 0.16, 0.14, 0.115 ), vec3( 0.29, 0.26, 0.22 ), grain * 0.5 + 0.5 );
		woodC = mix( woodC, vec3( 0.1, 0.085, 0.07 ), smoothstep( -0.2, 0.6, gnoise3( wp * 1.6 + rnd * 5.0 ) ) * 0.45 );
		woodC *= 1.0 - crack * 0.7;
		float b = smoothstep( 0.3, 0.7, bk.x );
		c = mix( woodC, barkC, b );
		bumpH = mix( grain * 0.12 - crack * 0.8, ( 1.0 - fiss ) * 0.9 + flake * 0.2, b );
		rough = mix( 0.8, 0.92, b );
	}
	// moss cushions on what faces the sky; on stumps it creeps down the sides as well
	// (ringR, on the sides of a log, carries how mossy this one is: + rotten, - fresh-sawn)
	float mossX = bk.y < 0.5 && kind < -10.5 ? ringR : 0.0;
	float mn = gnoise3( wp * 1.3 + rnd * 9.0 ) + 0.4 * gnoise3( wp * 5.0 + 3.1 ) + 0.18 * gnoise3( wp * 17.0 );
	float m = smoothstep( 0.25, 0.7, N.y + 0.5 * mn + mossX * 1.6 );
	if ( kind > -8.5 ) m = max( m, smoothstep( 0.3, 0.65, mn + 0.3 * N.y ) );
	m *= smoothstep( -0.65, -0.2, gnoise3( wp * 0.3 + rnd * 13.0 ) );
	float lump = gnoise3( wp * 16.0 ) * 0.5 + 0.5, fuzz = gnoise3( wp * 65.0 ) * 0.5 + 0.5;
	vec3 moss = mix( vec3( 0.035, 0.06, 0.008 ), vec3( 0.29, 0.35, 0.034 ), smoothstep( 0.1, 0.9, lump * 0.75 + fuzz * 0.35 ) );
	moss = mix( moss, moss * vec3( 1.3, 1.05, 0.55 ), smoothstep( 0.2, 0.8, gnoise3( wp * 2.3 ) ) * 0.55 );
	c = mix( c, moss, m );
	bumpH = mix( bumpH, lump * 0.9 + fuzz * 0.35, m );
	rough = mix( rough, 0.95, m );
	mossM = m;
	return c;
}

// Bump from a procedural height using screen-space derivatives (no tangents needed).
vec3 bumpNormal( vec3 N, vec3 p, float h, float scale ) {
	vec3 dpx = dFdx( p ), dpy = dFdy( p );
	float dhx = dFdx( h ), dhy = dFdy( h );
	vec3 r1 = cross( dpy, N ), r2 = cross( N, dpx );
	float det = dot( dpx, r1 );
	vec3 g = sign( det ) * ( dhx * r1 + dhy * r2 );
	return normalize( abs( det ) * N - scale * g );
}

vec3 barkAlbedo( float kind, vec2 b, float rnd, vec3 wp, out float rough ) {
	rough = 0.85;
	float n = gnoise( vec2( b.x * 6.0, b.y * 1.2 ) + rnd * 13.0 );
	float fine = gnoise( vec2( b.x * 24.0, b.y * 5.0 ) );
	if ( kind < -0.5 ) {
		if ( kind < -9.5 ) {
			// end grain: pale weathered wood, growth rings and drying checks
			rough = 0.9;
			float r = b.y;
			float rings = 0.5 + 0.5 * sin( r * 170.0 + gnoise( wp.xz * 9.0 + wp.y * 7.0 ) * 2.5 );
			vec3 c = mix( vec3( 0.22, 0.17, 0.12 ), vec3( 0.32, 0.25, 0.17 ), rings * 0.6 + 0.2 );
			c = mix( c, vec3( 0.17, 0.165, 0.155 ), smoothstep( 0.0, 0.8, gnoise( wp.xz * 3.0 + wp.y * 2.0 ) ) * 0.45 );
			float check = smoothstep( 0.82, 0.95, abs( gnoise( ( wp.xz + wp.y ) * 11.0 ) ) );
			c *= 1.0 - check * 0.6;
			return c;
		}
		if ( kind < -6.5 ) {
			// penny bun: glossy chestnut cap
			rough = 0.42;
			return mix( vec3( 0.2, 0.1, 0.05 ), vec3( 0.36, 0.2, 0.1 ), gnoise( b * vec2( 5.0, 40.0 ) + rnd * 5.0 ) * 0.5 + 0.5 );
		}
		if ( kind < -5.5 ) {
			// fly agaric: scarlet, orange toward the crown, flecked with white warts
			rough = 0.42;
			vec3 c = mix( vec3( 0.5, 0.035, 0.015 ), vec3( 0.62, 0.17, 0.02 ), smoothstep( 0.02, 0.07, b.y ) );
			float wart = smoothstep( 0.42, 0.62, gnoise( vec2( b.x * 17.0, b.y * 62.0 ) + rnd * 9.0 ) );
			return mix( c, vec3( 0.78, 0.74, 0.62 ), wart * 0.9 );
		}
		// mushroom stems and gills
		if ( kind < -4.5 ) return vec3( 0.66, 0.62, 0.52 ) * ( 0.9 + 0.1 * fine );
		if ( kind < -3.5 ) {
			// rowan: smooth grey-brown with pale lenticels
			float len = smoothstep( 0.6, 0.8, gnoise( vec2( b.x * 3.0, b.y * 18.0 ) ) );
			return mix( vec3( 0.2, 0.17, 0.15 ), vec3( 0.34, 0.3, 0.26 ), len ) * ( 0.9 + 0.15 * n );
		}
		if ( kind < -2.5 ) {
			// deadwood: silver-grey weathered grain, blackened with lichen in patches
			rough = 0.9;
			float grain = gnoise( vec2( b.x * 30.0, b.y * 0.8 ) );
			vec3 c = mix( vec3( 0.14, 0.125, 0.11 ), vec3( 0.26, 0.235, 0.2 ), smoothstep( -0.6, 0.6, grain ) );
			c = mix( c, vec3( 0.1, 0.095, 0.085 ), smoothstep( 0.2, 0.7, n ) * 0.5 );
			// flaky grey-brown bark still clinging over most of it
			float plates = gnoise( vec2( b.x * 14.0, b.y * 8.0 ) + rnd * 3.0 );
			vec3 barkC = mix( vec3( 0.055, 0.042, 0.032 ), vec3( 0.16, 0.125, 0.095 ), smoothstep( -0.5, 0.6, plates ) );
			barkC *= 1.0 - smoothstep( 0.55, 0.8, abs( gnoise( vec2( b.x * 30.0, b.y * 15.0 ) ) ) ) * 0.5;
			float bark = smoothstep( -0.25, 0.2, gnoise( vec2( b.x * 2.2, b.y * 0.35 ) + rnd * 4.0 ) );
			c = mix( c, barkC, bark );
			return c * ( 0.9 + 0.15 * fine );
		}
		if ( kind < -1.5 ) {
			// aspen: pale green-grey with dark diamond scars, rough and dark at the foot
			float scar = smoothstep( 0.55, 0.8, gnoise( vec2( b.x * 4.0, b.y * 3.0 ) + 5.0 ) );
			vec3 c = vec3( 0.55, 0.56, 0.48 ) * ( 0.9 + 0.1 * fine );
			c = mix( c, vec3( 0.12, 0.11, 0.1 ), scar * 0.85 );
			return mix( c, vec3( 0.18, 0.16, 0.14 ), smoothstep( 2.0, 0.3, b.y ) * 0.8 );
		}
		// stone pine: grey and scaly
		vec3 c = mix( vec3( 0.14, 0.12, 0.11 ), vec3( 0.3, 0.25, 0.22 ), n * 0.5 + 0.5 );
		return c * ( 0.85 + 0.25 * fine );
	}
	if ( kind < 0.5 ) {
		// spruce: grey-brown flaky scales
		vec3 c = mix( vec3( 0.11, 0.08, 0.065 ), vec3( 0.22, 0.17, 0.14 ), n * 0.5 + 0.5 );
		return c * ( 0.85 + 0.25 * fine );
	}
	if ( kind < 1.5 ) {
		// larch: deep reddish fissures
		float fis = smoothstep( 0.1, 0.5, abs( gnoise( vec2( b.x * 9.0, b.y * 0.6 ) ) ) );
		vec3 c = mix( vec3( 0.09, 0.05, 0.04 ), vec3( 0.3, 0.16, 0.1 ), fis );
		return c * ( 0.85 + 0.2 * fine );
	}
	// birch: chalk white with dark lenticels, blackened base
	// lenticels: short black dashes running round the trunk
	float len = smoothstep( 0.62, 0.82, gnoise( vec2( b.x * 3.2, b.y * 48.0 ) + 3.0 ) ) * smoothstep( 0.0, 0.45, gnoise( vec2( b.x * 5.0, b.y * 5.0 ) + 11.0 ) );
	float patchy = smoothstep( 0.3, 0.7, gnoise( vec2( b.x * 3.0, b.y * 0.8 ) + 7.0 ) );
	vec3 c = vec3( 0.78, 0.76, 0.72 ) * ( 0.9 + 0.1 * fine );
	c = mix( c, vec3( 0.08, 0.07, 0.07 ), max( len * 0.9, patchy * 0.6 * smoothstep( 4.0, 0.0, wp.y - 0.0 ) ) );
	c = mix( c, vec3( 0.12, 0.1, 0.09 ), smoothstep( 1.8, 0.2, b.y ) * 0.85 );
	rough = 0.6;
	return c;
}
`;

const nearVert = /* glsl */ `
#define VERTEX_CULL
${noiseGLSL}
uniform float uTime;
uniform vec4 uWind;
uniform sampler2D uNoiseTex;
uniform float uNearDist;
uniform float uFadeBand;
attribute vec2 aBark;
attribute vec3 aInfo;
attribute vec2 aWind;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vBark;
varying vec3 vInfo;
varying float vRnd;
varying float vFade;
varying vec3 vAxis;
varying vec3 vOrigin;

void main() {
	#ifdef USE_INSTANCING
		mat4 im = modelMatrix * instanceMatrix;
	#else
		mat4 im = modelMatrix;
	#endif
	vec3 origin = im[ 3 ].xyz;
	#ifndef BAKE
		// the tallest variant is ~32 m and ~10 m in crown radius (scaled with the instance)
		float sc = length( im[ 1 ].xyz );
		if ( sphereOutsideView( origin + vec3( 0.0, 16.0 * sc, 0.0 ), 19.0 * sc ) ) { gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 ); return; }
	#endif
	float rnd = hash12( floor( origin.xz * 3.0 ) );
	vec3 wp = ( im * vec4( position, 1.0 ) ).xyz;
	vec3 n = normalize( mat3( im ) * normal );
	#ifndef BAKE
		// Wind: every tree leans the same way, downwind. Gust fronts roll through the wood
		// with the wind, so neighbours lean and swing together, each a little in its own time.
		float hm = max( wp.y - origin.y, 0.0 );
		vec2 wdir = normalize( uWind.xy + 1e-4 );
		vec3 fdir = vec3( wdir.x, 0.0, wdir.y );
		float gust = textureLod( uNoiseTex, origin.xz / 420.0 - wdir * uTime * 0.018, 0.0 ).g;
		float strength = uWind.z * ( 0.3 + 1.1 * smoothstep( 0.35, 0.8, gust ) );
		float along = dot( origin.xz, wdir );
		float swing = sin( uTime * 1.05 - along * 0.045 + rnd * 1.1 );
		float bend = ( strength * 0.0007 + swing * 0.00017 * uWind.z ) * hm * hm;
		// a bend, not a shear: the top moves downwind and drops a little
		wp.xz += wdir * bend;
		wp.y -= bend * bend / ( 2.0 * max( hm, 1.0 ) ) * 0.9;
		// branches flex downwind and bob with the gusts (never in and out along their normals)
		float flex = aWind.y;
		float bob = sin( uTime * ( 2.0 + rnd * 0.5 ) - along * 0.08 + aInfo.z * 6.283 );
		wp += fdir * flex * ( 0.05 + 0.09 * strength ) * ( 0.65 + 0.35 * bob );
		wp.y -= flex * 0.025 * strength * ( 0.6 + 0.4 * bob );
		// leaves flutter: quick and small, whatever the wind (aspens most)
		bool aspen = abs( aInfo.x - 8.0 ) < 0.5;
		if ( aInfo.x > 4.5 && abs( aInfo.x - 7.0 ) > 0.5 ) wp += n * sin( uTime * ( aspen ? 12.0 : 7.0 ) + aInfo.z * 40.0 ) * ( aspen ? 0.03 : 0.012 ) * min( aspen ? 0.5 + strength : strength, 1.2 );
	#endif
	vWorldPos = wp;
	vNormal = n;
	vUv = uv;
	vBark = aBark;
	vInfo = aInfo;
	vRnd = rnd;
	vAxis = normalize( aInfo.x < -10.5 ? im[ 0 ].xyz : im[ 1 ].xyz );
	vOrigin = origin;
	float d = length( cameraPosition.xz - origin.xz );
	vFade = 1.0 - smoothstep( uNearDist - uFadeBand, uNearDist, d );
	gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}
`;

const nearFrag = /* glsl */ `
${commonParsGLSL}
${foliageShading}
uniform sampler2D tAtlas;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vBark;
varying vec3 vInfo;
varying float vRnd;
varying float vFade;
varying vec3 vAxis;
varying vec3 vOrigin;

void main() {
	float kind = vInfo.x;
	#ifndef BAKE
		if ( vFade < 0.999 && interleavedGradient( gl_FragCoord.xy ) > vFade ) discard;
	#endif
	bool leaf = kind > 2.5;
	bool sculpted = kind < -10.5 || ( kind < -7.5 && kind > -8.5 );
	float mossM = 0.0, mossH = 0.0, sBump = 0.0;
	vec3 albedo;
	float alpha = 1.0;
	float rough = 0.8;
	if ( leaf ) {
		vec4 t = texture2D( tAtlas, vUv );
		alpha = t.a;
		albedo = t.rgb * foliageTint( kind, vRnd, vInfo.z );
	} else if ( sculpted ) {
		albedo = sculptedWood( kind, vWorldPos, normalize( vNormal ), vAxis, vOrigin, vBark, vInfo.z, vRnd, rough, sBump, mossM );
	} else {
		bool grain = kind < -9.5;
		albedo = barkAlbedo( kind, vBark, vRnd, vWorldPos, rough );
		if ( ( kind < -2.5 && kind > -3.5 ) || grain ) {
			// cushions of yellow-green moss on whatever faces the sky, creeping down the sides of stumps
			vec3 Nw = normalize( vNormal );
			vec3 q = vWorldPos;
			// patchy along the wood, ragged at the edges
			float mn = gnoise3( q * 1.4 ) + 0.35 * gnoise3( q * 6.0 + 3.1 ) + 0.15 * gnoise3( q * 20.0 );
			float m = smoothstep( 0.35, 0.7, Nw.y + 0.45 * mn ) * smoothstep( -0.55, -0.1, gnoise3( q * 0.45 + 7.0 ) ) * ( grain ? 0.8 : 0.97 );
			// lumpy cushions with a fuzzy, sparkling surface and dark hollows between them
			float lump = gnoise3( q * 17.0 ) * 0.5 + 0.5;
			float fuzz = gnoise3( q * 70.0 ) * 0.5 + 0.5;
			vec3 moss = mix( vec3( 0.03, 0.055, 0.007 ), vec3( 0.26, 0.33, 0.032 ), smoothstep( 0.1, 0.9, lump * 0.75 + fuzz * 0.35 ) );
			moss = mix( moss, moss * vec3( 1.25, 1.0, 0.6 ), smoothstep( 0.2, 0.8, gnoise3( q * 2.5 ) ) * 0.5 );
			albedo = mix( albedo, moss, m );
			mossM = m;
			mossH = lump * 0.8 + fuzz * 0.35;
		}
	}
	#ifdef A2C
		alpha = leaf ? saturate( ( alpha - 0.42 ) / max( fwidth( alpha ), 1e-4 ) + 0.5 ) : 1.0;
		if ( alpha < 0.02 ) discard;
	#else
		if ( alpha < 0.42 ) discard;
		alpha = 1.0;
	#endif
	vec3 N = normalize( vNormal );
	#ifdef BAKE_ALBEDO
		gl_FragColor = vec4( albedo * vInfo.y, leaf ? 1.0 : 0.5 );
		return;
	#endif
	#ifdef BAKE_NORMAL
		gl_FragColor = vec4( N * 0.5 + 0.5, 1.0 );
		return;
	#endif
	vec3 V = normalize( cameraPosition - vWorldPos );
	float ao = vInfo.y;
	vec3 col;
	if ( leaf ) {
		float sh = sunShadow( vWorldPos, N * 0.2 );
		col = shadeFoliage( albedo, N, V, vWorldPos, ao, sh );
	} else {
		if ( !gl_FrontFacing ) N = -N;
		#ifndef BAKE
			// relief: fissured bark plates, moss cushions; fades out with distance
			float bh = abs( gnoise( vec2( vBark.x * 10.0, vBark.y * 2.2 ) + vRnd * 7.0 ) ) + 0.45 * abs( gnoise( vec2( vBark.x * 30.0, vBark.y * 7.0 ) ) );
			bh = sculpted ? sBump : mix( bh, mossH, mossM );
			float bumpFade = 1.0 - smoothstep( 15.0, 45.0, length( cameraPosition - vWorldPos ) );
			if ( bumpFade > 0.0 ) N = bumpNormal( N, vWorldPos, bh, ( sculpted ? mix( 0.009, 0.012, mossM ) : mix( 0.012, 0.006, mossM ) ) * bumpFade );
		#endif
		col = shadeSurface( albedo, N, V, vWorldPos, ao, sunShadow( vWorldPos, N ), rough, 0.03 );
	}
	col = waterColumn( col, vWorldPos, uSunColor );
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, alpha );
}
`;

const MAX_VARIANTS = 24;
const IMP_COLS = 8;

const bbVert = /* glsl */ `
${noiseGLSL}
uniform float uNearDist;
uniform float uFadeBand;
uniform float uFarDist;
uniform vec4 uCell[ ${MAX_VARIANTS} ];
uniform vec4 uDim[ ${MAX_VARIANTS} ];
uniform float uTime;
uniform vec4 uWind;
attribute vec4 aTree;
attribute vec2 aVar;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vRight;
varying vec3 vFwd;
varying float vFade;
varying float vFlip;
varying float vRnd;
void main() {
	int vi = int( aVar.x + 0.5 );
	vec3 o = aTree.xyz;
	float s = aTree.w;
	vec2 toC = cameraPosition.xz - o.xz;
	float d = length( toC );
	float fade = smoothstep( uNearDist - uFadeBand, uNearDist, d );
	if ( fade <= 0.0 || d > uFarDist ) {
		gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 );
		return;
	}
	vec3 fwd = vec3( toC.x, 0.0, toC.y ) / max( d, 1e-3 );
	vec3 right = vec3( fwd.z, 0.0, -fwd.x );
	vec4 dim = uDim[ vi ];
	float aspect = abs( aVar.y ), flip = sign( aVar.y );
	vec3 wp = o + right * position.x * dim.x * s * aspect + vec3( 0.0, ( position.y * dim.y + dim.z ) * s, 0.0 );
	// lean slightly toward the camera when seen from above so trees don't look paper-thin
	vec3 toCam3 = normalize( cameraPosition - o );
	wp += fwd * position.y * dim.y * s * clamp( toCam3.y, 0.0, 0.6 ) * 0.5;
	// gentle sway
	vec2 wdir = normalize( uWind.xy + 1e-4 );
	float rnd = hash12( floor( o.xz * 3.0 ) );
	// the same lean and the same rolling swing as the near trees
	wp.xz += wdir * position.y * position.y * s * uWind.z * ( 0.25 + 0.1 * sin( uTime * 1.05 - dot( o.xz, wdir ) * 0.045 + rnd * 1.1 ) );
	vec4 cell = uCell[ vi ];
	vUv = cell.xy + vec2( 0.5 + position.x * flip, position.y ) * cell.zw;
	vWorldPos = wp;
	vRight = right;
	vFwd = fwd;
	vFade = fade;
	vFlip = flip;
	vRnd = rnd;
	gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}
`;

const bbFrag = /* glsl */ `
${commonParsGLSL}
${foliageShading}
uniform sampler2D tImpAlbedo;
uniform sampler2D tImpNormal;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vRight;
varying vec3 vFwd;
varying float vFade;
varying float vFlip;
varying float vRnd;
void main() {
	vec4 nb = texture2D( tImpNormal, vUv );
	float cov = nb.a;
	#ifdef A2C
		float alpha = saturate( ( cov - 0.4 ) / max( fwidth( cov ), 1e-4 ) + 0.5 );
		if ( alpha < 0.02 ) discard;
	#else
		if ( cov < 0.4 ) discard;
		float alpha = 1.0;
	#endif
	if ( vFade < 0.999 && interleavedGradient( gl_FragCoord.xy + 7.0 ) > vFade ) discard;
	vec4 ab = texture2D( tImpAlbedo, vUv );
	vec3 albedo = ab.rgb;
	vec3 n = nb.rgb * 2.0 - 1.0;
	n.x *= vFlip;
	vec3 N = normalize( vRight * n.x + vec3( 0.0, 1.0, 0.0 ) * n.y + vFwd * n.z );
	vec3 V = normalize( cameraPosition - vWorldPos );
	float sh = sunShadow( vWorldPos, N * 0.2 ) ;
	// self-occlusion inside the crown, lost when flattening to a card
	float ao = 0.8;
	vec3 col = ab.a / max( cov, 1e-3 ) > 0.75 ? shadeFoliage( albedo, N, V, vWorldPos, ao, sh ) : shadeSurface( albedo, N, V, vWorldPos, ao, sh, 0.85, 0.03 );
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, alpha );
}
`;

// ---------------------------------------------------------------------------

function valueNoise( x, z ) {

	const ix = Math.floor( x ), iz = Math.floor( z );
	const fx = x - ix, fz = z - iz;
	const u = fx * fx * ( 3 - 2 * fx ), v = fz * fz * ( 3 - 2 * fz );
	const a = hash2( ix, iz ), b = hash2( ix + 1, iz ), c = hash2( ix, iz + 1 ), d = hash2( ix + 1, iz + 1 );
	return a + ( b - a ) * u + ( c - a ) * v + ( a - b - c + d ) * u * v;

}

export class Forest {

	constructor( terrain, quality, renderer, deadwood ) {

		this.terrain = terrain;
		this.quality = quality;
		this.renderer = renderer;
		this.group = new THREE.Group();
		this.group.name = 'forest';
		this.atlas = buildFoliageAtlas();
		this.a2c = quality.msaa > 0;
		this._lastUpdate = new THREE.Vector3( 1e9, 0, 0 );

		const rng = new RNG( 7 );
		this.variants = [
			makeConifer( rng, 'spruce' ), makeConifer( rng, 'spruce' ), makeConifer( rng, 'spruce' ),
			makeConifer( rng, 'larch' ), makeConifer( rng, 'larch' ), makeConifer( rng, 'larch' ),
			makeBirch( rng ), makeBirch( rng ),
		];
		this.shrubVariants = [ makeShrub( rng ), makeShrub( rng ), makeShrub( rng ) ];
		this.variants.push(
			makeConifer( rng, 'pine' ), makeConifer( rng, 'pine' ),
			makeBroadleaf( rng, 'aspen' ), makeBroadleaf( rng, 'aspen' ),
			makeBroadleaf( rng, 'rowan' ), makeBroadleaf( rng, 'rowan' ),
			makeSnag( rng ), makeSnag( rng ),
			// growth forms, so a stand is not a row of the same tree
			makeConifer( rng, 'spruce', 'narrow' ), makeConifer( rng, 'spruce', 'old' ), makeConifer( rng, 'spruce', 'young' ),
			makeConifer( rng, 'larch', 'old' ), makeConifer( rng, 'larch', 'young' ), makeConifer( rng, 'larch', 'old' ),
			makeConifer( rng, 'pine', 'old' ), makeBroadleaf( rng, 'birch' ),
		);
		this.speciesVariants = { spruce: [ 0, 1, 2, 16, 16, 17, 18 ], larch: [ 3, 4, 5, 19, 20, 21 ], birch: [ 6, 7, 23 ], pine: [ 8, 9, 22 ], aspen: [ 10, 11 ], rowan: [ 12, 13 ], snag: [ 14, 15 ] };
		// understorey and forest-floor props, drawn only near the camera
		this.props = {
			fern: { variants: [ makeFern( rng ), makeFern( rng ) ], maxD: 120, cap: 9000, shadow: true },
			heath: { variants: [ makeHeath( rng ), makeHeath( rng ) ], maxD: 95, cap: 9000, shadow: false },
			log: { variants: deadwood.logs, maxD: 190, loD: 40, cap: 1500, shadow: true },
			stump: { variants: deadwood.stumps, maxD: 150, loD: 35, cap: 1500, shadow: true },
			mush: { variants: [ makeMushrooms( rng, 'agaric' ), makeMushrooms( rng, 'agaric' ), makeMushrooms( rng, 'bolete' ) ], maxD: 55, cap: 1200, shadow: false },
		};

		this.sharedNear = {
			...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ),
			...sharedUniforms(),
			tAtlas: { value: this.atlas },
			uNearDist: { value: quality.treeNear },
			uFadeBand: { value: 18 },
		};

		this.nearMaterial = this._makeNearMaterial( {} );
		this.depthMaterial = new THREE.MeshDepthMaterial( { map: this.atlas, alphaTest: 0.42, side: THREE.DoubleSide } );

	}

	_makeNearMaterial( defines ) {

		const d = { ...defines };
		if ( this.a2c && ! d.BAKE_ALBEDO && ! d.BAKE_NORMAL ) d.A2C = '';
		return new THREE.ShaderMaterial( {
			vertexShader: nearVert,
			fragmentShader: nearFrag,
			uniforms: this.sharedNear,
			defines: d,
			lights: true,
			side: THREE.DoubleSide,
			alphaToCoverage: d.A2C !== undefined,
		} );

	}

	// ---------- impostor atlas ----------
	bakeImpostors() {

		const r = this.renderer;
		const cellW = 256, cellH = 512;
		const W = cellW * IMP_COLS, H = cellH * Math.ceil( MAX_VARIANTS / IMP_COLS );
		const mk = () => new THREE.WebGLRenderTarget( W, H, {
			type: THREE.UnsignedByteType, depthBuffer: true, generateMipmaps: true,
			minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
		} );
		this.impAlbedo = mk();
		this.impNormal = mk();
		const matA = this._makeNearMaterial( { BAKE: '', BAKE_ALBEDO: '' } );
		const matN = this._makeNearMaterial( { BAKE: '', BAKE_NORMAL: '' } );
		const scene = new THREE.Scene();
		const cam = new THREE.OrthographicCamera( - 1, 1, 1, - 1, - 200, 200 );
		cam.position.set( 0, 0, 50 );
		cam.lookAt( 0, 0, 0 );
		this.cells = [];
		this.dims = [];

		const prevTarget = r.getRenderTarget();
		const prevAuto = r.autoClear;
		const prevClear = r.getClearColor( new THREE.Color() );
		const prevAlpha = r.getClearAlpha();
		r.autoClear = false;
		for ( const [ rt, mat, clear ] of [ [ this.impAlbedo, matA, 0x3a3a1a ], [ this.impNormal, matN, 0x8080ff ] ] ) {

			r.setRenderTarget( rt );
			r.setClearColor( clear, 0 );
			r.clear( true, true, false );
			this.variants.forEach( ( v, i ) => {

				const mesh = new THREE.Mesh( v.geometry, mat );
				scene.add( mesh );
				const halfW = v.radius * 1.08;
				const top = v.height * 1.04;
				// keep the 1:2 cell aspect: fit whichever dimension is larger
				const h = Math.max( top, halfW * 2 * ( cellH / cellW ) );
				const w = h * cellW / cellH;
				cam.left = - w / 2; cam.right = w / 2; cam.top = h - 0.5; cam.bottom = - 0.5;
				cam.updateProjectionMatrix();
				const cx = ( i % IMP_COLS ) * cellW, cy = Math.floor( i / IMP_COLS ) * cellH;
				rt.viewport.set( cx, cy, cellW, cellH );
				rt.scissor.set( cx, cy, cellW, cellH );
				rt.scissorTest = true;
				r.setRenderTarget( rt );
				r.render( scene, cam );
				scene.remove( mesh );
				this.cells[ i ] = new THREE.Vector4( cx / W, cy / H, cellW / W, cellH / H );
				this.dims[ i ] = new THREE.Vector4( w, h, - 0.5, 0 );

			} );
			rt.scissorTest = false;
			rt.viewport.set( 0, 0, W, H );

		}

		r.setRenderTarget( prevTarget );
		r.autoClear = prevAuto;
		r.setClearColor( prevClear, prevAlpha );
		matA.dispose();
		matN.dispose();

	}

	// ---------- placement ----------
	place() {

		const td = this.terrain;
		const rng = new RNG( 99 );
		const trees = [];
		const bio = [ 0, 0, 0, 0 ];
		const n = new THREE.Vector3();
		const near = WORLD.near;
		const nx0 = near.cx - near.size / 2, nx1 = near.cx + near.size / 2;
		const nz0 = near.cz - near.size / 2, nz1 = near.cz + near.size / 2;
		const R = 3900;

		const consider = ( x, z, cellArea, detailed ) => {

			// nothing behind the cirque headwall can be seen from the valley
			if ( z > 2150 + 0.00022 * x * x ) return;
			const h = td.heightAt( x, z );
			if ( h < 1.2 ) return;
			td.biomeAt( x, z, bio );
			const forest = bio[ 1 ], grass = bio[ 0 ], rock = bio[ 2 ], shore = bio[ 3 ];
			if ( rock > 0.5 || shore > 0.4 ) return;
			// no trees where no one can ever see them
			if ( ! canBeSeen( x, z ) ) return;
			td.normalAt( x, z, n, 1.5 );
			if ( n.y < 0.74 ) return;
			const treeline = 640 + ( valueNoise( x * 0.004, z * 0.004 ) - 0.5 ) * 160;
			if ( h > treeline ) return;
			let p = Math.pow( forest, 1.25 ) * 0.9;
			// the walls are wooded thinly, broken by open ground, thinner the higher they go
			p *= 1 - 0.7 * THREE.MathUtils.smoothstep( h, 45, 280 );
			if ( detailed && h < 70 ) {

				// the valley floor: copses of mixed wood with open glades between them, lone
				// trees across the meadows; the marmot meadow in front of the start stays open
				const copse = THREE.MathUtils.smoothstep( valueNoise( x * 0.013 + 3, z * 0.013 - 9 ), 0.4, 0.6 );
				const edge = THREE.MathUtils.smoothstep( valueNoise( x * 0.04 - 2, z * 0.04 + 6 ), 0.3, 0.7 );
				const open = THREE.MathUtils.smoothstep( Math.hypot( x + 5, z - 500 ), 22, 42 );
				p += grass * ( 0.34 * copse * ( 0.55 + 0.45 * edge ) + 0.025 ) * open;

			} else if ( detailed ) p += grass * 0.012 + ( valueNoise( x * 0.02 + 5, z * 0.02 ) > 0.78 ? grass * 0.05 : 0 );
			// thin out near the treeline
			p *= 1 - 0.7 * THREE.MathUtils.smoothstep( h, treeline - 120, treeline );
			p *= cellArea / 45;
			if ( rng.next() > p ) return;

			const cluster = valueNoise( x * 0.012 + 11, z * 0.012 - 3 );
			const larchP = 0.18 + THREE.MathUtils.smoothstep( h, 120, 520 ) * 0.5 + ( cluster - 0.5 ) * 0.5;
			const birchP = h < 70 ? 0.3 * ( 1 - forest * 0.6 ) : 0.03;
			// stone pines join the larches toward the treeline, aspens stand in clonal groves low down,
			// rowans at the margins, and a few dead snags everywhere
			const pineP = THREE.MathUtils.smoothstep( h, 140, 460 ) * 0.3 * ( 0.4 + cluster );
			const aspenP = h < 200 ? 0.5 * THREE.MathUtils.smoothstep( valueNoise( x * 0.009 - 7, z * 0.009 + 2 ), 0.58, 0.72 ) : 0;
			const rowanP = h < 450 ? 0.03 + ( 1 - forest ) * 0.1 : 0.01;
			const snagP = 0.018 + THREE.MathUtils.smoothstep( h, treeline - 220, treeline ) * 0.05;
			const k = rng.next();
			let species = 'spruce', acc = snagP;
			if ( k < acc ) species = 'snag';
			else if ( k < ( acc += birchP ) ) species = 'birch';
			else if ( k < ( acc += aspenP ) ) species = 'aspen';
			else if ( k < ( acc += rowanP ) ) species = 'rowan';
			else if ( k < ( acc += pineP ) ) species = 'pine';
			else if ( k < ( acc += larchP ) ) species = 'larch';
			const vs = this.speciesVariants[ species ];
			const variant = vs[ Math.floor( rng.next() * vs.length ) ];
			let s = rng.range( 0.72, 1.15 ) * ( 1 - 0.4 * THREE.MathUtils.smoothstep( h, treeline - 250, treeline ) );
			if ( forest < 0.3 ) s *= rng.range( 0.75, 1.0 );
			const aspect = rng.range( 0.82, 1.2 );
			trees.push( { x, y: h - 0.15, z, s, rot: rng.next() * Math.PI * 2, variant, aspect, lean: rng.range( - 0.03, 0.03 ), leanA: rng.next() * Math.PI * 2 } );

		};

		// detailed near region
		const c1 = 6.2;
		for ( let z = nz0; z < nz1; z += c1 ) for ( let x = nx0; x < nx1; x += c1 ) consider( x + rng.next() * c1, z + rng.next() * c1, c1 * c1, true );
		// the wider valley
		const c2 = 8.5;
		for ( let z = - R; z < R; z += c2 ) {

			for ( let x = - R; x < R; x += c2 ) {

				if ( x > nx0 && x < nx1 && z > nz0 && z < nz1 ) continue;
				if ( x * x + ( z + 300 ) * ( z + 300 ) > R * R ) continue;
				consider( x + rng.next() * c2, z + rng.next() * c2, c2 * c2, false );

			}

		}

		this.trees = trees;

		// shrubs along the shore and forest margins (near region only)
		const shrubs = [];
		for ( let z = nz0; z < nz1; z += 4 ) {

			for ( let x = nx0; x < nx1; x += 4 ) {

				const px = x + rng.next() * 4, pz = z + rng.next() * 4;
				const h = td.heightAt( px, pz );
				if ( h < 0.9 || h > 500 ) continue;
				td.biomeAt( px, pz, bio );
				const edge = bio[ 1 ] * ( 1 - bio[ 1 ] ) * 4; // forest margins
				const shoreBand = h < 4.5 ? 0.8 : 0;
				let p = ( edge * 0.1 + shoreBand * 0.035 ) * ( 1 - bio[ 2 ] ) * ( valueNoise( px * 0.05, pz * 0.05 ) > 0.5 ? 1 : 0.1 );
				if ( rng.next() > p ) continue;
				shrubs.push( { x: px, y: h - 0.15, z: pz, s: rng.range( 0.45, 0.85 ), rot: rng.next() * 6.28, variant: Math.floor( rng.next() * 3 ) } );

			}

		}

		this.shrubs = shrubs;
		this._placeProps( rng );
		this._placeSpawnVignette();
		if ( this.showcase ) {

			// debug: a row of every variant in front of the start position
			const { x, z } = this.showcase;
			this.trees = this.trees.filter( ( t ) => Math.hypot( t.x - x, t.z - z ) > 90 );
			this.shrubs = this.shrubs.filter( ( t ) => Math.hypot( t.x - x, t.z - z ) > 60 );
			// ?showcase=N shows variants 8N..8N+7
			const page = this.showcase.page || 0;
			this.variants.forEach( ( v, i ) => {

				if ( Math.floor( i / 8 ) !== page ) return;
				const px = x + ( ( i % 8 ) - 3.5 ) * 11, pz = z - 38;
				this.trees.push( { x: px, y: td.heightAt( px, pz ) - 0.15, z: pz, s: 1, rot: i, variant: i } );

			} );
			for ( let i = 0; i < 3; i ++ ) {

				const px = x - 8 + i * 8, pz = z - 16;
				this.shrubs.push( { x: px, y: td.heightAt( px, pz ) - 0.1, z: pz, s: 1, rot: i, variant: i } );

			}

		}

		return this.trees.length;

	}

	// Bracken and heath in patches, fallen timber and toadstools, mostly in and around the woods
	// but spilling into the meadows too.
	_placeProps( rng ) {

		const td = this.terrain;
		const bio = [ 0, 0, 0, 0 ];
		const n = new THREE.Vector3();
		const near = WORLD.near;
		const x0 = near.cx - near.size / 2 + 30, x1 = near.cx + near.size / 2 - 30;
		const z0 = near.cz - near.size / 2 + 30, z1 = near.cz + near.size / 2 - 30;
		const out = { fern: [], heath: [], log: [], stump: [], mush: [] };
		const ss = THREE.MathUtils.smoothstep;
		const c = 3.2;
		for ( let z = z0; z < z1; z += c ) {

			for ( let x = x0; x < x1; x += c ) {

				const px = x + rng.next() * c, pz = z + rng.next() * c;
				const h = td.heightAt( px, pz );
				if ( h < 1.1 || h > 950 ) continue;
				td.biomeAt( px, pz, bio );
				const grass = bio[ 0 ], forest = bio[ 1 ], rock = bio[ 2 ], shore = bio[ 3 ];
				if ( shore > 0.3 || rock > 0.55 ) continue;
				const edge = forest * ( 1 - forest ) * 4;
				const r = rng.next();
				const fernPatch = valueNoise( px * 0.028 + 17, pz * 0.028 - 5 );
				const heathPatch = valueNoise( px * 0.02 - 9, pz * 0.02 + 31 );
				// bracken stands at the wood edges and in clearings, rarely out in the open meadow
				const pFern = h < 480 ? ss( fernPatch, 0.58, 0.74 ) * ( edge * 0.8 + forest * 0.35 + 0.04 ) * ( 0.4 + grass * 0.6 ) : 0;
				const pHeath = ss( heathPatch, 0.52, 0.68 ) * ( 0.25 + ss( h, 40, 320 ) * 0.5 + edge * 0.3 ) * ( 1 - rock );
				const pLog = 0.03 * forest + 0.006 * edge + 0.0005 * grass;
				const pStump = 0.012 * forest + 0.006 * edge + 0.0004 * grass;
				const pMush = ( 0.006 * edge + 0.003 * forest + 0.0012 * grass ) * ( h < 700 ? 1 : 0 );
				let kind = null, acc = pFern * 0.4;
				if ( r < acc ) kind = 'fern';
				else if ( r < ( acc += pHeath * 0.35 ) ) kind = 'heath';
				else if ( r < ( acc += pLog ) ) kind = 'log';
				else if ( r < ( acc += pStump ) ) kind = 'stump';
				else if ( r < ( acc += pMush ) ) kind = 'mush';
				if ( ! kind ) continue;
				if ( kind === 'fern' || kind === 'heath' ) {

					// bracken and bilberry grow as spreading colonies: a clump of plants per pick
					const set = this.props[ kind ];
					const m = rng.int( 3, 6 );
					for ( let j = 0; j < m; j ++ ) {

						const qx = px + rng.range( - 1.8, 1.8 ), qz = pz + rng.range( - 1.8, 1.8 );
						out[ kind ].push( { x: qx, y: td.heightAt( qx, qz ) - 0.04, z: qz, s: rng.range( 0.75, 1.2 ), rot: rng.next() * Math.PI * 2, pitch: 0, variant: Math.floor( rng.next() * set.variants.length ) } );

					}

					continue;

				}
				const set = this.props[ kind ];
				const variant = Math.floor( rng.next() * set.variants.length );
				const rot = rng.next() * Math.PI * 2;
				let y = h - 0.05, pitch = 0, sc = rng.range( 0.75, 1.2 );
				if ( kind === 'log' ) {

					td.normalAt( px, pz, n, 1.5 );
					if ( n.y < 0.9 ) continue;
					// lie along the ground: pitch to the slope between the two ends
					const hl = set.variants[ variant ].halfLen * sc;
					const ax = Math.cos( rot ), az = - Math.sin( rot );
					const ha = td.heightAt( px + ax * hl, pz + az * hl ), hb = td.heightAt( px - ax * hl, pz - az * hl );
					pitch = Math.atan2( ha - hb, hl * 2 );
					y = ( ha + hb ) / 2 - 0.06;
					sc = rng.range( 0.85, 1.15 );

				}

				if ( kind === 'mush' ) sc = rng.range( 0.8, 1.25 );
				out[ kind ].push( { x: px, y, z: pz, s: sc, rot, pitch, variant } );

			}

		}

		// driftwood: bleached trunks and branches washed up on the strand near the start
		const logs = this.props.log.variants.map( ( v, i ) => ( { v, i } ) ).filter( ( e ) => ! e.v.plate && ! e.v.rotten && ! e.v.branchy );
		for ( let k = 0, placed = 0; k < 3000 && placed < 16; k ++ ) {

			const px = - 5 + rng.range( - 320, 320 ), pz = rng.range( 330, 520 );
			const h = td.heightAt( px, pz );
			if ( h < 0.38 || h > 0.9 ) continue;
			const e = logs[ Math.floor( rng.next() * logs.length ) ];
			const rot = rng.next() * Math.PI * 2, sc = rng.range( 0.45, 0.8 );
			const hl = e.v.halfLen * sc, ax = Math.cos( rot ), az = - Math.sin( rot );
			const ha = td.heightAt( px + ax * hl, pz + az * hl ), hb = td.heightAt( px - ax * hl, pz - az * hl );
			if ( Math.min( ha, hb ) < 0.3 ) continue;
			out.log.push( { x: px, y: ( ha + hb ) / 2 - 0.05, z: pz, s: sc, rot, pitch: Math.atan2( ha - hb, hl * 2 ), variant: e.i } );
			placed ++;

		}

		for ( const k in out ) this.props[ k ].items = out[ k ];

	}

	// Just off to the left of the start: an old mossy stump and a fallen trunk, with a larch
	// and a spruce behind them - where a red squirrel forages in plain view.
	_placeSpawnVignette() {

		const td = this.terrain;
		const V = { stump: { x: - 9, z: 499 }, log: { x: - 19, z: 502 }, larch: { x: - 26, z: 503 }, spruce: { x: - 31, z: 496 } };
		const clear = ( list, x, z, r ) => list.filter( ( t ) => Math.hypot( t.x - x, t.z - z ) > r );
		for ( const set of Object.values( this.props ) ) {

			set.items = clear( clear( set.items, V.stump.x, V.stump.z, 5 ), V.log.x, V.log.z, 6 );

		}

		this.trees = clear( clear( this.trees, V.larch.x, V.larch.z, 7 ), V.spruce.x, V.spruce.z, 7 );
		this.shrubs = clear( this.shrubs, V.stump.x, V.stump.z, 8 );
		const stumps = this.props.stump.variants;
		const sv = stumps.length - 1;
		const sy = td.heightAt( V.stump.x, V.stump.z ) - 0.05;
		this.props.stump.items.push( { x: V.stump.x, y: sy, z: V.stump.z, s: 1, rot: 0.7, pitch: 0, variant: sv } );
		const lvi = this.props.log.variants.findIndex( ( v ) => ! v.plate );
		const lv = this.props.log.variants[ lvi ];
		const rot = 0.35, ax = Math.cos( rot ), az = - Math.sin( rot );
		const ha = td.heightAt( V.log.x + ax * lv.halfLen, V.log.z + az * lv.halfLen ), hb = td.heightAt( V.log.x - ax * lv.halfLen, V.log.z - az * lv.halfLen );
		this.props.log.items.push( { x: V.log.x, y: ( ha + hb ) / 2 - 0.06, z: V.log.z, s: 1, rot, pitch: Math.atan2( ha - hb, lv.halfLen * 2 ), variant: lvi } );
		const larch = { x: V.larch.x, y: td.heightAt( V.larch.x, V.larch.z ) - 0.15, z: V.larch.z, s: 0.72, rot: 1.3, variant: 4 };
		this.trees.push( larch, { x: V.spruce.x, y: td.heightAt( V.spruce.x, V.spruce.z ) - 0.15, z: V.spruce.z, s: 0.78, rot: 2.1, variant: 1 } );
		this.spawnVignette = { perch: { x: V.stump.x, z: V.stump.z, top: sy + stumps[ sv ].height + 0.01 }, tree: larch };

	}

	// ---------- scene objects ----------
	build() {

		this.bakeImpostors();

		// far billboards: every tree, faded in beyond the near distance
		const quad = new THREE.PlaneGeometry( 1, 1, 1, 1 );
		quad.translate( 0, 0.5, 0 );
		const geo = new THREE.InstancedBufferGeometry();
		geo.index = quad.index;
		geo.setAttribute( 'position', quad.getAttribute( 'position' ) );
		const aTree = new Float32Array( this.trees.length * 4 );
		const aVar = new Float32Array( this.trees.length * 2 );
		this.trees.forEach( ( t, i ) => {

			aTree.set( [ t.x, t.y, t.z, t.s ], i * 4 );
			aVar.set( [ t.variant, ( t.rot > Math.PI ? 1 : - 1 ) * ( t.aspect ?? 1 ) ], i * 2 );

		} );
		geo.setAttribute( 'aTree', new THREE.InstancedBufferAttribute( aTree, 4 ) );
		geo.setAttribute( 'aVar', new THREE.InstancedBufferAttribute( aVar, 2 ) );
		geo.instanceCount = this.trees.length;

		const bbDefines = this.a2c ? { A2C: '' } : {};
		this.bbMaterial = new THREE.ShaderMaterial( {
			vertexShader: bbVert,
			fragmentShader: bbFrag,
			uniforms: {
				...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ),
				...sharedUniforms(),
				tImpAlbedo: { value: this.impAlbedo.texture },
				tImpNormal: { value: this.impNormal.texture },
				uCell: { value: this.cells },
				uDim: { value: this.dims },
				uNearDist: this.sharedNear.uNearDist,
				uFadeBand: this.sharedNear.uFadeBand,
				uFarDist: { value: 5200 },
			},
			defines: bbDefines,
			lights: true,
			side: THREE.DoubleSide,
			alphaToCoverage: this.a2c,
		} );
		this.billboards = new THREE.Mesh( geo, this.bbMaterial );
		this.billboards.frustumCulled = false;
		this.billboards.name = 'tree-billboards';
		this.group.add( this.billboards );

		// near meshes, one InstancedMesh per variant
		this.nearMeshes = this.variants.map( ( v ) => {

			const m = new THREE.InstancedMesh( v.geometry, this.nearMaterial, 4000 );
			m.count = 0;
			m.frustumCulled = false;
			m.castShadow = true;
			m.receiveShadow = true;
			m.customDepthMaterial = this.depthMaterial;
			m.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
			this.group.add( m );
			return m;

		} );

		this.shrubMeshes = this.shrubVariants.map( ( v ) => {

			const m = new THREE.InstancedMesh( v.geometry, this.nearMaterial, 6000 );
			m.count = 0;
			m.frustumCulled = false;
			m.castShadow = true;
			m.customDepthMaterial = this.depthMaterial;
			m.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
			this.group.add( m );
			return m;

		} );

		// precomputed instance matrices
		const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
		const up = new THREE.Vector3( 0, 1, 0 );
		const compose = ( list ) => {

			const arr = new Float32Array( list.length * 16 );
			list.forEach( ( t, i ) => {

				q.setFromAxisAngle( up, t.rot );
				mat.compose( p.set( t.x, t.y, t.z ), q, s.set( t.s, t.s, t.s ) );
				mat.toArray( arr, i * 16 );

			} );
			return arr;

		};

		// trees: width scaled apart from height, and a slight lean
		{

			const arr = new Float32Array( this.trees.length * 16 );
			const ql = new THREE.Quaternion(), axis = new THREE.Vector3();
			this.trees.forEach( ( t, i ) => {

				const a = t.aspect ?? 1;
				axis.set( Math.cos( t.leanA ?? 0 ), 0, Math.sin( t.leanA ?? 0 ) );
				q.setFromAxisAngle( axis, t.lean ?? 0 ).multiply( ql.setFromAxisAngle( up, t.rot ) );
				mat.compose( p.set( t.x, t.y, t.z ), q, s.set( t.s * a, t.s, t.s * a ) );
				mat.toArray( arr, i * 16 );

			} );
			this.treeMatrices = arr;

		}
		this.shrubMatrices = compose( this.shrubs );

		const qz = new THREE.Quaternion(), zAxis = new THREE.Vector3( 0, 0, 1 );
		for ( const set of Object.values( this.props ) ) {

			if ( set.loD ) {

				set.loMeshes = set.variants.map( ( v ) => {

					const m = new THREE.InstancedMesh( v.lo, this.nearMaterial, set.cap );
					m.count = 0;
					m.frustumCulled = false;
					m.castShadow = set.shadow;
					m.receiveShadow = true;
					m.customDepthMaterial = this.depthMaterial;
					m.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
					this.group.add( m );
					return m;

				} );

			}

			set.meshes = set.variants.map( ( v ) => {

				const m = new THREE.InstancedMesh( v.geometry, this.nearMaterial, set.cap );
				m.count = 0;
				m.frustumCulled = false;
				m.castShadow = set.shadow;
				m.receiveShadow = true;
				m.customDepthMaterial = this.depthMaterial;
				m.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
				this.group.add( m );
				return m;

			} );
			set.matrices = new Float32Array( set.items.length * 16 );
			set.items.forEach( ( t, i ) => {

				q.setFromAxisAngle( up, t.rot ).multiply( qz.setFromAxisAngle( zAxis, t.pitch ) );
				mat.compose( p.set( t.x, t.y, t.z ), q, s.set( t.s, t.s, t.s ) );
				mat.toArray( set.matrices, i * 16 );

			} );

		}

		return this.group;

	}

	setNearDistance( d ) {

		this.sharedNear.uNearDist.value = d;
		this._lastUpdate.set( 1e9, 0, 0 );

	}

	update( camera ) {

		const cp = camera.position;
		if ( cp.distanceToSquared( this._lastUpdate ) < 16 ) return;
		this._lastUpdate.copy( cp );
		const nearD = this.sharedNear.uNearDist.value + 4;
		const nd2 = nearD * nearD;
		const fill = ( list, matrices, meshes, maxD2, minD2 = - 1 ) => {

			const counts = meshes.map( () => 0 );
			for ( let i = 0; i < list.length; i ++ ) {

				const t = list[ i ];
				const dx = t.x - cp.x, dz = t.z - cp.z;
				const d2 = dx * dx + dz * dz;
				if ( d2 > maxD2 || d2 <= minD2 ) continue;
				const m = meshes[ t.variant ];
				const c = counts[ t.variant ];
				if ( c >= m.instanceMatrix.count ) continue;
				m.instanceMatrix.array.set( matrices.subarray( i * 16, i * 16 + 16 ), c * 16 );
				counts[ t.variant ] = c + 1;

			}

			meshes.forEach( ( m, k ) => {

				m.count = counts[ k ];
				// an empty InstancedMesh still costs a full draw set-up in every pass
				m.visible = counts[ k ] > 0;
				m.instanceMatrix.clearUpdateRanges();
				m.instanceMatrix.addUpdateRange( 0, counts[ k ] * 16 );
				m.instanceMatrix.needsUpdate = true;

			} );

		};

		fill( this.trees, this.treeMatrices, this.nearMeshes, nd2 );
		const sd = Math.min( 160, nearD );
		fill( this.shrubs, this.shrubMatrices, this.shrubMeshes, sd * sd );
		for ( const set of Object.values( this.props ) ) {

			const d = Math.min( set.maxD, nearD );
			if ( set.loD ) {

				fill( set.items, set.matrices, set.meshes, set.loD * set.loD );
				fill( set.items, set.matrices, set.loMeshes, d * d, set.loD * set.loD );

			} else fill( set.items, set.matrices, set.meshes, d * d );

		}

	}

}
