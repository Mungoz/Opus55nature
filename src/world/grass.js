/* global __HORROR__ */
import * as THREE from 'three';
import { commonParsGLSL, terrainUniformsGLSL, terrainLookupFnGLSL } from '../shaders/common.glsl.js';
import { noiseGLSL } from '../shaders/noise.glsl.js';
import { paletteGLSL } from '../shaders/palette.glsl.js';
import { sharedUniforms } from '../core/uniforms.js';
import { RNG } from '../core/rng.js';

// "Infinite" grass: a fixed grid of blade instances tiled around the camera.
// Each blade finds its world position by wrapping its cell offset to the tile
// nearest the camera, so blades stay planted while the viewer moves.

const vert = /* glsl */ `
#define VERTEX_CULL
${noiseGLSL}
${terrainUniformsGLSL}
${terrainLookupFnGLSL}
${paletteGLSL}
uniform float uTime;
uniform vec4 uWind;
uniform sampler2D uNoiseTex;
uniform float uWaterLevel;
uniform float uTile;
uniform float uRadius;
uniform float uFadeIn;
uniform float uDensity;
uniform vec2 uHeightRange;
uniform float uWidth;
uniform float uType;
uniform vec4 uFocus;
uniform vec4 uCrop[ 12 ]; // (x, z, radius, strength): turf grazed short, e.g. around marmot burrows
attribute vec4 aOff;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vY;
varying float vAO;

void main() {
	vec2 cam = uFocus.w > 0.5 ? uFocus.xy : cameraPosition.xz;
	vec2 p = aOff.xy + uTile * floor( ( cam - aOff.xy ) / uTile + 0.5 );
	float r1 = aOff.z, r2 = aOff.w;
	float r3 = fract( r1 * 13.71 + r2 * 7.13 );
	float r4 = fract( r1 * 3.17 + r2 * 11.3 + 0.37 );
	if ( uType < 0.5 ) {
		// gather blades into tufts rather than an even lawn
		vec2 cc = floor( p / 0.42 );
		vec2 ctr = ( cc + hash22( cc + 3.7 ) ) * 0.42;
		p = mix( p, ctr, 0.6 * r4 );
	}
	float dist = length( p - cam );

	float fade = 1.0 - smoothstep( uRadius * 0.7, uRadius, dist );
	fade *= smoothstep( uFadeIn * 0.75, uFadeIn, dist );
	if ( fade <= 0.001 ) { gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 ); return; }

	vec4 hn = terrainHN( p );
	float h = hn.x;
	if ( sphereOutsideView( vec3( p.x, h + 0.5, p.y ), 1.6 ) ) { gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 ); return; }
	vec4 bio = biomeAt( p );
	float patchN = textureLod( uNoiseTex, p / 23.0, 0.0 ).g;
	float dens;
	if ( uType < 0.5 ) {
		dens = pow( bio.r, 0.6 ) * ( 1.0 - smoothstep( 0.3, 0.55, bio.b ) );
		dens *= smoothstep( 0.1, 0.4, patchN + bio.r * 0.4 );
	} else {
		// reeds: in the shallows and on the wet margin, in clumps
		float depth = uWaterLevel - h;
		dens = smoothstep( -0.5, 0.0, depth ) * ( 1.0 - smoothstep( 0.45, 0.85, depth ) );
		dens *= smoothstep( 0.5, 0.68, textureLod( uNoiseTex, p / 70.0 + 0.3, 0.0 ).r );
	}
${ __HORROR__ ? `#if STORY
	// nothing grows on the trail's tread (nor its braid), the verge is trodden short, and
	// nothing under the props
	vec4 sm = storyMap( p );
	{
		float ad = abs( sm.x );
		float rag = gnoise( p * 3.1 ) * 0.09 + gnoise( p * 9.0 ) * 0.045;
		float halfW = 0.28 + 0.11 * gnoise( p * 0.17 + 4.0 ) + 0.05 * gnoise( p * 0.7 );
		// tufts lean in over the edge, thinning toward the tread
		float tread = 1.0 - smoothstep( halfW - 0.12, halfW + 0.22, ad + rag );
		float side = gnoise( p * 0.019 + 2.0 ) > 0.0 ? 1.0 : -1.0;
		float braid = smoothstep( 0.05, 0.4, gnoise( p * 0.03 + 7.7 ) ) * ( 1.0 - smoothstep( 0.1, 0.2, abs( sm.x - side * ( 0.95 + 0.3 * gnoise( p * 0.05 + 1.3 ) ) ) + rag ) );
		dens *= ( 1.0 - max( tread, braid * 0.85 ) ) * ( 1.0 - sm.w ) * ( 1.0 - sm.y * 0.55 );
	}
#endif` : '' }
	float keep = step( r1, dens * uDensity );
	float scale = keep * fade;
	if ( scale < 0.01 ) { gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 ); return; }

	float height = mix( uHeightRange.x, uHeightRange.y, r2 ) * ( 0.45 + 0.55 * dens ) * ( 0.6 + 0.6 * patchN );
	height *= mix( 0.35, 1.0, fade );
	// patches cropped short by grazing deer and marmots
	float graze = smoothstep( 0.45, 0.7, textureLod( uNoiseTex, p / 57.0 + 0.7, 0.0 ).b );
	height *= mix( 1.0, 0.45, graze * step( uType, 0.5 ) );
${ __HORROR__ ? `#if STORY
	height *= mix( 0.35, 1.0, smoothstep( 0.35, 1.8, abs( sm.x ) ) ) * ( 1.0 - sm.y * 0.5 );
#endif` : '' }
	float cropK = 0.0;
	for ( int i = 0; i < 12; i ++ ) {
		vec4 cr = uCrop[ i ];
		if ( cr.z <= 0.0 ) continue;
		float k = 1.0 - smoothstep( cr.z * 0.45, cr.z, length( p - cr.xy ) + ( r3 - 0.5 ) * cr.z * 0.3 + ( patchN - 0.5 ) * cr.z * 0.8 );
		height *= 1.0 - k * cr.w;
		cropK = max( cropK, k * cr.w );
	}

	// grass species: fine blades, broad leaves, flowering stems, dry lodged blades
	// grazed turf: short, broad, close-set blades so the ground stays covered
	float width = uWidth * ( 1.0 + cropK * 1.2 );
	float kBase = 0.3 + r2 * 0.5;
	float headFrac = 0.0;
	vec3 c = grassColor( p, h );
	if ( uType < 0.5 ) {
		// late autumn: much of the sward has cured to straw
		if ( r3 < 0.44 ) {
			width *= 0.5 + 0.3 * r1;
			c *= vec3( 0.92, 1.02, 0.86 );
		} else if ( r3 < 0.6 ) {
			width *= 1.0 + 0.35 * r1;
			height *= 0.62;
			kBase = 0.6 + r2 * 0.6;
			c *= vec3( 0.78, 1.0, 0.7 );
		} else if ( r3 < 0.76 ) {
			width *= 0.3;
			height *= 1.45 + r2 * 0.45;
			kBase = 0.14 + r2 * 0.2;
			headFrac = 0.26;
			c = mix( c, srgbToLinear( vec3( 0.6, 0.52, 0.3 ) ), 0.55 );
		} else {
			width *= 0.65;
			height *= 0.8;
			kBase = 1.1 + r2 * 0.9;
			c = srgbToLinear( mix( vec3( 0.58, 0.47, 0.28 ), vec3( 0.42, 0.31, 0.19 ), r1 ) );
		}
	}
	float ang = r1 * 57.0 + r2 * 11.0;
	vec2 facing = vec2( cos( ang ), sin( ang ) );

	// wind: rolling gust fronts plus per-blade flutter
	vec2 wdir = normalize( uWind.xy + 1e-4 );
	float gust = textureLod( uNoiseTex, p / 45.0 - wdir * uTime * 0.09, 0.0 ).g;
	gust = smoothstep( 0.3, 0.85, gust );
	float windBend = uWind.z * ( 0.15 + 1.1 * gust ) + 0.12 * uWind.z * sin( uTime * 2.6 + r2 * 6.28 + dot( p, vec2( 0.7, 0.5 ) ) );
	vec2 bendDir = normalize( facing * 0.55 + wdir * windBend );
	float k = max( kBase + windBend * 0.9, 0.001 );
	if ( uType > 0.5 ) k *= 0.35;

	float y = position.y;
	float horiz = height * ( 1.0 - cos( k * y ) ) / k;
	float up = height * sin( k * y ) / k;
	float w = width * ( 0.7 + 0.6 * r1 ) * ( 1.0 - y * 0.82 ) * ( 1.0 + ( uFocus.w > 0.5 ? dist : length( p - cameraPosition.xz ) ) * 0.03 );
	// seed heads: a loose, feathery panicle on flowering stems
	float headT = headFrac > 0.0 ? smoothstep( 1.0 - headFrac, 1.0 - headFrac + 0.04, y ) : 0.0;
	w = mix( w, uWidth * ( 0.28 + 0.22 * r4 ) * sin( clamp( ( y - ( 1.0 - headFrac ) ) / headFrac, 0.0, 1.0 ) * 3.1416 ) + 0.0015, headT );
	vec2 side = vec2( -bendDir.y, bendDir.x );
	vec3 base = vec3( p.x, h - 0.03, p.y );
	vec3 wp = base + vec3( bendDir.x * horiz, up, bendDir.y * horiz ) + vec3( side.x, 0.0, side.y ) * position.x * w;

	vec3 tangent = normalize( vec3( bendDir.x * sin( k * y ), cos( k * y ), bendDir.y * sin( k * y ) ) );
	vec3 across = vec3( side.x, 0.0, side.y );
	vec3 n = normalize( cross( across, tangent ) );
	if ( n.y < 0.0 ) n = -n;
	n = normalize( n + across * position.x * 0.9 );
	vNormal = normalize( mix( n, hnNormal( hn ), 0.4 ) );

	if ( uType > 0.5 ) {
		c = mix( vec3( 0.16, 0.2, 0.07 ), vec3( 0.42, 0.34, 0.16 ), r2 );
		// a few cattail heads
		float head = step( 0.72, r1 ) * smoothstep( 0.72, 0.76, y ) * ( 1.0 - smoothstep( 0.88, 0.9, y ) );
		c = mix( c, vec3( 0.12, 0.06, 0.03 ), head );
	}
	// individual blade variety; autumn yellowing creeps down from the tips
	c *= 0.72 + 0.56 * r2;
	c = mix( c, c * vec3( 1.4, 1.14, 0.6 ), smoothstep( 0.35, 1.0, y ) * ( 0.45 + 0.45 * r4 ) * ( 1.0 - headT ) );
	c = mix( c, srgbToLinear( mix( vec3( 0.7, 0.62, 0.44 ), vec3( 0.56, 0.47, 0.36 ), r4 ) ), headT );
	c = mix( c, c * vec3( 1.2, 1.15, 0.85 ) + vec3( 0.012, 0.01, 0.0 ), cropK * 0.6 );
	vColor = c;
	vY = y;
	vAO = mix( 0.25, 1.0, smoothstep( 0.0, 0.7, y ) ) * hn.w;
	vWorldPos = wp;
	gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}
`;

const frag = /* glsl */ `
${commonParsGLSL}
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vY;
varying float vAO;
void main() {
	vec3 N = normalize( vNormal );
	vec3 V = normalize( cameraPosition - vWorldPos );
	vec3 L = uSunDir;
	float sh = sunShadowFast( vWorldPos );
	float wrap = saturate( dot( N, L ) * 0.6 + 0.4 );
	float back = pow( saturate( dot( -V, L ) ), 3.0 ) * vY;
	vec3 alb = vColor * ( 1.0 - uWeather.y * 0.3 );
	vec3 direct = uSunColor * sh * ( alb / PI * wrap + alb * saturate( alb * 2.0 ) * back * 0.9 );
	vec3 amb = alb / PI * skyIrradiance( N ) * vAO;
	vec3 H = normalize( L + V );
	float spec = pow( saturate( dot( N, H ) ), mix( 30.0, 80.0, uWeather.y ) ) * mix( 0.08, 0.4, uWeather.y ) * vY;
	vec3 col = ( direct + amb ) * underwaterLight( vWorldPos ) + uSunColor * sh * spec;
	col = waterColumn( col, vWorldPos, uSunColor * sh );
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, 1.0 );
}
`;

function bladeGeometry( segs ) {

	const pos = [];
	const idx = [];
	for ( let i = 0; i < segs; i ++ ) {

		const y = i / segs;
		pos.push( - 0.5, y, 0, 0.5, y, 0 );

	}

	pos.push( 0, 1, 0 );
	for ( let i = 0; i < segs - 1; i ++ ) {

		const a = i * 2;
		idx.push( a, a + 1, a + 2, a + 1, a + 3, a + 2 );

	}

	const t = ( segs - 1 ) * 2;
	idx.push( t, t + 1, t + 2 );
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	return g;

}

// shared by every grass layer
export const CROP = { value: Array.from( { length: 12 }, () => new THREE.Vector4( 0, 0, 0, 0 ) ) };

export class GrassLayer {

	constructor( opts ) {

		const { tile, spacing, segs, radius, fadeIn = 0, heightRange, width, type = 0, density = 1, seed = 1 } = opts;
		const n = Math.floor( tile / spacing );
		const rng = new RNG( seed );
		const blade = bladeGeometry( segs );
		const geo = new THREE.InstancedBufferGeometry();
		geo.index = blade.index;
		geo.setAttribute( 'position', blade.getAttribute( 'position' ) );
		const off = new Float32Array( n * n * 4 );
		let k = 0;
		for ( let j = 0; j < n; j ++ ) {

			for ( let i = 0; i < n; i ++ ) {

				off[ k ++ ] = ( i + rng.next() ) * spacing;
				off[ k ++ ] = ( j + rng.next() ) * spacing;
				off[ k ++ ] = rng.next();
				off[ k ++ ] = rng.next();

			}

		}

		geo.setAttribute( 'aOff', new THREE.InstancedBufferAttribute( off, 4 ) );
		geo.instanceCount = n * n;
		this.uniforms = {
			...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ),
			...sharedUniforms(),
			uTile: { value: tile },
			uRadius: { value: radius },
			uFadeIn: { value: fadeIn },
			uDensity: { value: density },
			uHeightRange: { value: new THREE.Vector2( ...heightRange ) },
			uWidth: { value: width },
			uType: { value: type },
			uCrop: CROP,
		};
		this.material = new THREE.ShaderMaterial( {
			vertexShader: vert,
			fragmentShader: frag,
			uniforms: this.uniforms,
			lights: true,
			side: THREE.DoubleSide,
		} );
		this.mesh = new THREE.Mesh( geo, this.material );
		this.mesh.frustumCulled = false;
		this.mesh.layers.set( 1 );
		this.mesh.name = type ? 'reeds' : 'grass';

	}

}

export class Meadow {

	constructor( quality ) {

		this.group = new THREE.Group();
		const d = quality.grassDensity;
		const near = quality.grassNear, far = quality.grassFar;
		this.near = new GrassLayer( { tile: near * 2, spacing: 0.1 / Math.sqrt( d ), segs: 5, radius: near, heightRange: [ 0.25, 0.7 ], width: 0.05, seed: 3 } );
		this.far = new GrassLayer( { tile: far * 2, spacing: 0.34 / Math.sqrt( d ), segs: 3, radius: far, fadeIn: near * 0.85, heightRange: [ 0.28, 0.65 ], width: 0.1, seed: 5 } );
		this.reeds = new GrassLayer( { tile: 90, spacing: 0.3, segs: 4, radius: 45, heightRange: [ 1.1, 2.1 ], width: 0.035, type: 1, seed: 9 } );
		this.group.add( this.near.mesh, this.far.mesh, this.reeds.mesh );

	}

}
