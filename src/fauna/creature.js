import * as THREE from 'three';
import { commonParsGLSL } from '../shaders/common.glsl.js';
import { noiseGLSL } from '../shaders/noise.glsl.js';
import { sharedUniforms, U } from '../core/uniforms.js';

// Surface kinds stored per vertex (aMat)
export const MAT = { PLAIN: 0, FEATHER: 1, FUR: 2, SCALES: 3, BILL: 4 };

// Shared material for animals built from coloured parts. Vertices tagged
// with aFlap (signed, 0 = body, +-1 = wing tip) flap about the body axis;
// fish bodies wag when uWag > 0.
const vert = /* glsl */ `
${noiseGLSL}
uniform float uTime;
uniform float uFlapSpeed;
uniform float uFlapAmp;
uniform float uGlide;
uniform float uWag;
uniform float uWagSpeed;
attribute vec3 color;
attribute float aFlap;
attribute float aMat;
attribute vec3 aPat;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vObj;
varying float vMat;
varying vec3 vPat;
#include <skinning_pars_vertex>
void main() {
	#ifdef USE_INSTANCING
		mat4 im = modelMatrix * instanceMatrix;
		float id = float( gl_InstanceID );
	#else
		mat4 im = modelMatrix;
		float id = 0.0;
	#endif
	vec3 transformed = position;
	vec3 objectNormal = normal;
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <skinning_vertex>
	vec3 p = transformed;
	vec3 n = objectNormal;
	float a = abs( aFlap );
	if ( a > 0.0 ) {
		float r = hash11( id * 0.137 + 0.5 );
		// gliders flap in short bursts
		float burst = mix( 1.0, smoothstep( 0.6, 0.9, sin( uTime * 0.45 + r * 40.0 ) ), uGlide );
		float ph = uTime * uFlapSpeed * ( 0.9 + 0.2 * r ) + r * 6.283;
		float f = sin( ph - a * 0.9 ) * uFlapAmp * burst + 0.12 * uGlide;
		float ang = f * sign( aFlap );
		float c = cos( ang ), s = sin( ang );
		p.xy = vec2( p.x * c - p.y * s, p.x * s + p.y * c );
		n.xy = vec2( n.x * c - n.y * s, n.x * s + n.y * c );
	}
	if ( uWag > 0.0 ) {
		// travelling body wave, strongest at the tail
		float r = hash11( id * 0.371 + 0.2 );
		float amp = uWag * smoothstep( 0.15, -0.3, p.z );
		float w = sin( uTime * uWagSpeed * ( 0.85 + 0.3 * r ) + r * 6.283 - p.z * 9.0 );
		p.x += w * amp;
		n.x -= cos( uTime * uWagSpeed + r * 6.283 - p.z * 9.0 ) * amp * 4.0;
	}
	vec4 wp = im * vec4( p, 1.0 );
	vWorldPos = wp.xyz;
	vNormal = normalize( mat3( im ) * n );
	vColor = color;
	vObj = position;
	vMat = aMat;
	vPat = aPat;
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const frag = /* glsl */ `
${commonParsGLSL}
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vObj;
varying float vMat;
varying vec3 vPat;
void main() {
	vec3 N = normalize( vNormal );
	if ( !gl_FrontFacing ) N = -N;
	vec3 V = normalize( cameraPosition - vWorldPos );
	vec3 alb = vColor;
	float irid = 0.0;
	if ( vPat.x + vPat.y + vPat.z > 0.01 ) {
		// ---- plumage, drawn per pixel ----
		// vermiculation: fine wavy dark lines (drake flanks), faded out before it can alias
		float ph = vObj.y * 1500.0 + gnoise3( vObj * 70.0 ) * 5.0 + gnoise3( vObj * 260.0 ) * 1.2;
		float vf = 1.0 - smoothstep( 1.5, 4.5, fwidth( ph ) );
		float vl = smoothstep( 0.55, 0.95, sin( ph ) ) * vf;
		alb = mix( alb, alb * mix( 1.0, 0.45, vl ), vPat.x );
		alb *= 1.0 - vPat.x * ( 1.0 - vf ) * 0.12;
		// scalloped feathers: overlapping rows, each tip curved; dark centre, pale fringe
		vec3 q = vObj * 40.0;
		q += 0.9 * vec3( gnoise3( q * 0.17 ), gnoise3( q * 0.17 + 5.0 ), gnoise3( q * 0.17 + 9.0 ) );
		float rz = -q.z;
		float row = floor( rz );
		float rf = fract( rz );
		float colF = q.y * 0.9 + q.x * 0.55 + row * 0.5;
		float af = fract( colF ) - 0.5;
		float tone = hash12( vec2( row, floor( colF ) ) );
		// each feather: a dark chevron down its centre, a pale fringe round its tip
		float tipLine = rf - 0.5 * ( 1.0 - 4.0 * af * af );
		float fringe = smoothstep( -0.04, 0.06, tipLine ) * ( 1.0 - smoothstep( 0.1, 0.26, tipLine ) );
		float centre = smoothstep( 0.3, 0.06, abs( af ) + ( 1.0 - rf ) * 0.12 ) * smoothstep( 0.1, 0.45, rf );
		float sf = 1.0 - smoothstep( 0.5, 1.4, fwidth( rz ) );
		vec3 feather = alb * ( 0.82 + 0.36 * tone ) * mix( 1.0, 0.5, centre ) + fringe * alb * vec3( 0.55, 0.5, 0.35 );
		alb = mix( alb, mix( alb, feather, sf ), vPat.y );
		irid = vPat.z;
	}
	float rough = 0.55, f0 = 0.04, ao = 1.0, wrap = 0.0, sheen = 0.0;
	if ( vMat > 0.5 && vMat < 1.5 ) {
		// feathers: overlapping scalloped rows with soft, fluffy light
		vec3 q = vObj * 38.0;
		float row = fract( q.z + gnoise( q.xy * 0.35 ) * 0.6 );
		float scallop = smoothstep( 0.0, 0.35, row ) * ( 1.0 - smoothstep( 0.75, 1.0, row ) );
		float fibre = gnoise3( vObj * vec3( 260.0, 260.0, 60.0 ) );
		N = normalize( N + ( vec3( gnoise3( q * 0.5 ), gnoise3( q * 0.5 + 7.0 ), 0.0 ) * 0.12 + vec3( 0.0, 0.0, fibre * 0.06 ) ) );
		ao = 0.93 + 0.07 * scallop;
		alb *= 0.93 + 0.1 * fibre;
		rough = 0.8;
		wrap = 0.45;
		sheen = 0.25;
	} else if ( vMat > 1.5 && vMat < 2.5 ) {
		// fur: grizzled guard hairs, soft wrap lighting and a velvety rim
		float g = gnoise3( vObj * 180.0 ) * 0.5 + 0.5;
		float g2 = gnoise3( vObj * 22.0 ) * 0.5 + 0.5;
		alb *= 0.72 + 0.35 * g + 0.2 * ( g2 - 0.5 );
		N = normalize( N + vec3( gnoise3( vObj * 90.0 ), gnoise3( vObj * 90.0 + 3.0 ), gnoise3( vObj * 90.0 + 7.0 ) ) * 0.18 );
		rough = 0.9;
		wrap = 0.35;
		sheen = 0.45;
		ao = 0.85 + 0.15 * g;
	} else if ( vMat > 2.5 && vMat < 3.5 ) {
		// scales: glossy with a faint rainbow sheen along the flank
		float sc = smoothstep( 0.2, 0.6, fract( vObj.z * 160.0 + fract( vObj.y * 80.0 ) * 0.5 ) );
		alb *= 0.9 + 0.12 * sc;
		alb += vec3( 0.05, 0.02, 0.06 ) * ( 1.0 - abs( dot( N, V ) ) );
		rough = 0.3;
		f0 = 0.08;
	} else if ( vMat > 3.5 ) {
		rough = 0.35;
		f0 = 0.05;
	}
	if ( irid > 0.01 ) {
		// structural colour: the hue swings from green toward blue-violet at grazing angles
		float g = pow( 1.0 - saturate( dot( N, V ) ), 1.5 );
		vec3 shifted = vec3( alb.g * 0.35 + alb.b * 0.6, alb.g * 0.55 + alb.b * 0.3, alb.g * 0.9 + alb.b );
		alb = mix( alb, shifted, irid * g );
		rough = mix( rough, 0.32, irid );
		f0 = mix( f0, 0.07, irid );
	}
	float sh = sunShadow( vWorldPos, N );
	vec3 col = shadeSurface( alb, N, V, vWorldPos, ao, sh, rough, f0 );
	// soft wrap-around light through feathers and fur
	col += alb / PI * uSunColor * sh * saturate( ( dot( N, uSunDir ) + wrap ) / ( 1.0 + wrap ) - saturate( dot( N, uSunDir ) ) ) * underwaterLight( vWorldPos );
	// velvety rim / back light
	float rim = pow( 1.0 - saturate( dot( N, V ) ), 3.0 );
	col += alb * ( uSunColor * sh * pow( saturate( dot( -V, uSunDir ) ), 4.0 ) * 0.4 + skyIrradiance( N ) * 0.15 ) * rim * sheen * 2.0;
	col = waterColumn( col, vWorldPos, uSunColor * sh );
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, 1.0 );
}
`;

export function creatureMaterial( { flapSpeed = 0, flapAmp = 0, glide = 0, wag = 0, wagSpeed = 0 } = {} ) {

	return new THREE.ShaderMaterial( {
		vertexShader: vert,
		fragmentShader: frag,
		uniforms: {
			...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ),
			...sharedUniforms(),
			uFlapSpeed: { value: flapSpeed },
			uFlapAmp: { value: flapAmp },
			uGlide: { value: glide },
			uWag: { value: wag },
			uWagSpeed: { value: wagSpeed },
		},
		lights: true,
		side: THREE.DoubleSide,
	} );

}

// Fur as shells: the skin drawn again N times (instanced, one draw call), each layer pushed
// out along the normal and combed back along the body. Strands are columns of 3D noise
// that thin toward their tips; root colour comes from the skin, tips from aFur.
const furVert = /* glsl */ `
uniform float uShells;
uniform float uFurScale;
attribute vec3 color;
attribute vec4 aFur; // tip colour (linear), length (m)
attribute vec3 aComb;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vRoot;
varying vec3 vRootCol;
varying vec3 vTipCol;
varying float vH;
varying float vLen;
#include <skinning_pars_vertex>
void main() {
	float h = ( float( gl_InstanceID ) + 1.0 ) / uShells;
	float len = aFur.w * uFurScale;
	vec3 n = normalize( normal );
	// hairs rise off the skin, then lie over along the comb as they lengthen
	vec3 transformed = position + n * len * h * 0.8 + aComb * len * h * h * 0.55;
	vec3 objectNormal = normal;
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <skinning_vertex>
	vec4 wp = modelMatrix * vec4( transformed, 1.0 );
	vWorldPos = wp.xyz;
	vNormal = normalize( mat3( modelMatrix ) * objectNormal );
	vRoot = position;
	vRootCol = color;
	vTipCol = aFur.rgb;
	vH = h;
	vLen = aFur.w;
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const furFrag = /* glsl */ `
${commonParsGLSL}
uniform float uDensity;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vRoot;
varying vec3 vRootCol;
varying vec3 vTipCol;
varying float vH;
varying float vLen;
void main() {
	// bare skin (hooves, nose): no hair
	if ( vLen < 0.0012 ) discard;
	float h = vH;
	// long hair falls in coarser, softer locks
	vec3 q = vRoot * uDensity / ( 1.0 + vLen * 30.0 );
	// clumped strands: a coarse clump field and finer hairs within it
	float n = ( gnoise3( q ) * 0.5 + 0.5 ) * 0.6 + ( gnoise3( q * 2.6 + 11.0 ) * 0.5 + 0.5 ) * 0.4;
	float thr = mix( 0.3, 0.78, pow( h, 0.85 ) );
	// where a strand is smaller than a pixel, stop drawing strands: inner layers solid,
	// outer layers gone (no sparkle)
	float fw = length( fwidth( q ) );
	thr = mix( thr, h > 0.45 ? 2.0 : -1.0, smoothstep( 0.9, 2.4, fw ) );
	if ( n < thr ) discard;
	vec3 N = normalize( vNormal );
	if ( ! gl_FrontFacing ) N = -N;
	vec3 V = normalize( cameraPosition - vWorldPos );
	// the root colour already carries the skin's ambient occlusion; tips pick it up partly
	float aoRoot = clamp( luma( vRootCol ) / max( luma( vTipCol ) * 0.75, 1e-3 ), 0.35, 1.0 );
	vec3 alb = mix( vRootCol * 0.7, vTipCol * mix( aoRoot, 1.0, 0.5 ), smoothstep( 0.0, 0.55, h ) );
	alb *= 0.82 + 0.36 * n;
	float ao = mix( 0.4, 1.0, pow( h, 0.7 ) );
	float sh = sunShadow( vWorldPos, N );
	vec3 L = uSunDir;
	float wrap = saturate( ( dot( N, L ) + 0.4 ) / 1.4 );
	vec3 col = alb / PI * ( uSunColor * sh * wrap * ( 0.55 + 0.45 * ao ) + skyIrradiance( N ) * ao );
	// light glancing through the tips of the fur at the silhouette
	float rim = pow( 1.0 - saturate( dot( N, V ) ), 2.5 ) * h;
	col += alb * ( uSunColor * sh * ( 0.25 + pow( saturate( dot( -V, L ) ), 3.0 ) ) * 0.5 + skyIrradiance( N ) * 0.1 ) * rim;
	col *= underwaterLight( vWorldPos );
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, 1.0 );
}
`;

export function furMaterial( { density = 300, shells = 12, scale = 1 } = {} ) {

	return new THREE.ShaderMaterial( {
		vertexShader: furVert,
		fragmentShader: furFrag,
		uniforms: {
			...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ),
			...sharedUniforms(),
			uShells: { value: shells },
			uFurScale: { value: scale },
			uDensity: { value: density },
		},
		lights: true,
	} );

}

// the skin's geometry, drawn once per shell
export function furGeometry( geo, shells ) {

	const g = new THREE.InstancedBufferGeometry();
	g.index = geo.index;
	for ( const k of [ 'position', 'normal', 'color', 'skinIndex', 'skinWeight', 'aFur', 'aComb' ] ) g.setAttribute( k, geo.getAttribute( k ) );
	g.instanceCount = shells;
	g.boundingSphere = geo.boundingSphere.clone();
	return g;

}

// Fur on a skinned mesh: a child that follows the same skeleton.
export function addFur( mesh, geo, mat ) {

	const f = new THREE.SkinnedMesh( geo, mat );
	f.frustumCulled = false;
	f.castShadow = false;
	f.receiveShadow = false;
	f.name = 'fur';
	mesh.add( f );
	f.bind( mesh.skeleton, mesh.bindMatrix );
	return f;

}

// Loft a smooth closed body along +z from cross-sections.
// section( t ) -> { z, w, top, bot, cx, cy, n } with t in [0,1] (tail -> head).
// Ends collapse to points so the surface is watertight.
export function loft( section, segs = 28, around = 20 ) {

	const pos = [];
	const idx = [];
	for ( let i = 0; i <= segs; i ++ ) {

		const t = i / segs;
		const s = section( t );
		const n = s.n ?? 2.2;
		for ( let j = 0; j <= around; j ++ ) {

			const a = j / around * Math.PI * 2;
			const c = Math.cos( a ), si = Math.sin( a );
			const x = Math.sign( c ) * Math.pow( Math.abs( c ), 2 / n ) * s.w;
			const yh = si >= 0 ? s.top : s.bot;
			const y = Math.sign( si ) * Math.pow( Math.abs( si ), 2 / n ) * yh;
			pos.push( ( s.cx ?? 0 ) + x, ( s.cy ?? 0 ) + y, s.z );

		}

	}

	for ( let i = 0; i < segs; i ++ ) {

		for ( let j = 0; j < around; j ++ ) {

			const a = i * ( around + 1 ) + j, b = a + around + 1;
			idx.push( a, b, a + 1, b, b + 1, a + 1 );

		}

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

// Utility to merge coloured parts into one geometry with color + aFlap + aMat.
export class PartBuilder {

	constructor() {

		this.parts = [];

	}

	add( geometry, color, matrix = null, flap = 0, mat = MAT.PLAIN ) {

		let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
		if ( matrix ) g.applyMatrix4( matrix );
		const n = g.getAttribute( 'position' ).count;
		const p = g.getAttribute( 'position' );
		const c = new Float32Array( n * 3 );
		if ( typeof color === 'function' ) {

			const tmp = new THREE.Color();
			for ( let i = 0; i < n; i ++ ) {

				tmp.set( color( p.getX( i ), p.getY( i ), p.getZ( i ) ) ).convertSRGBToLinear();
				c.set( [ tmp.r, tmp.g, tmp.b ], i * 3 );

			}

		} else {

			const col = new THREE.Color( color ).convertSRGBToLinear();
			for ( let i = 0; i < n; i ++ ) c.set( [ col.r, col.g, col.b ], i * 3 );

		}

		g.setAttribute( 'color', new THREE.BufferAttribute( c, 3 ) );
		const f = new Float32Array( n );
		if ( typeof flap === 'function' ) {

			for ( let i = 0; i < n; i ++ ) f[ i ] = flap( p.getX( i ), p.getY( i ), p.getZ( i ) );

		} else f.fill( flap );

		g.setAttribute( 'aFlap', new THREE.BufferAttribute( f, 1 ) );
		g.setAttribute( 'aMat', new THREE.BufferAttribute( new Float32Array( n ).fill( mat ), 1 ) );
		for ( const k of Object.keys( g.attributes ) ) if ( ! [ 'position', 'normal', 'color', 'aFlap', 'aMat' ].includes( k ) ) g.deleteAttribute( k );
		if ( ! g.getAttribute( 'normal' ) ) g.computeVertexNormals();
		this.parts.push( g );
		return this;

	}

	// raw triangles: array of [x,y,z] triplets, flat shaded
	tris( points, color, flapFn = () => 0, mat = MAT.PLAIN ) {

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( points.flat(), 3 ) );
		g.computeVertexNormals();
		return this.add( g, color, null, flapFn, mat );

	}

	build() {

		const merged = mergeGeometries( this.parts );
		merged.computeBoundingSphere();
		return merged;

	}

}

function mergeGeometries( geos ) {

	let count = 0;
	for ( const g of geos ) count += g.getAttribute( 'position' ).count;
	const out = new THREE.BufferGeometry();
	for ( const [ name, size ] of [ [ 'position', 3 ], [ 'normal', 3 ], [ 'color', 3 ], [ 'aFlap', 1 ], [ 'aMat', 1 ] ] ) {

		const arr = new Float32Array( count * size );
		let off = 0;
		for ( const g of geos ) {

			const a = g.getAttribute( name );
			arr.set( a.array.subarray( 0, a.count * size ), off );
			off += a.count * size;

		}

		out.setAttribute( name, new THREE.BufferAttribute( arr, size ) );

	}

	return out;

}

export { U };
