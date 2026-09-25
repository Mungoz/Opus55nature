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
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vObj;
varying float vMat;
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
void main() {
	vec3 N = normalize( vNormal );
	if ( !gl_FrontFacing ) N = -N;
	vec3 V = normalize( cameraPosition - vWorldPos );
	vec3 alb = vColor;
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
