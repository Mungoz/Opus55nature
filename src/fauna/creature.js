import * as THREE from 'three';
import { commonParsGLSL } from '../shaders/common.glsl.js';
import { noiseGLSL } from '../shaders/noise.glsl.js';
import { sharedUniforms, U } from '../core/uniforms.js';

// Shared material for animals built from coloured primitives. Vertices tagged
// with aFlap (signed, 0 = body, +-1 = wing tip) flap about the body axis.
const vert = /* glsl */ `
${noiseGLSL}
uniform float uTime;
uniform float uFlapSpeed;
uniform float uFlapAmp;
uniform float uGlide;
attribute vec3 color;
attribute float aFlap;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
	#ifdef USE_INSTANCING
		mat4 im = modelMatrix * instanceMatrix;
		float id = float( gl_InstanceID );
	#else
		mat4 im = modelMatrix;
		float id = 0.0;
	#endif
	vec3 p = position;
	vec3 n = normal;
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
	vec4 wp = im * vec4( p, 1.0 );
	vWorldPos = wp.xyz;
	vNormal = normalize( mat3( im ) * n );
	vColor = color;
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const frag = /* glsl */ `
${commonParsGLSL}
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
	vec3 N = normalize( vNormal );
	if ( !gl_FrontFacing ) N = -N;
	vec3 V = normalize( cameraPosition - vWorldPos );
	vec3 alb = vColor;
	float sh = sunShadow( vWorldPos, N );
	// soft sheen on feathers and scales
	vec3 col = shadeSurface( alb, N, V, vWorldPos, 1.0, sh, 0.55, 0.04 );
	// thin rim of back light through wing edges
	col += alb * uSunColor * sh * pow( saturate( dot( -V, uSunDir ) ), 6.0 ) * 0.25;
	col = waterColumn( col, vWorldPos, uSunColor * sh );
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, 1.0 );
}
`;

export function creatureMaterial( { flapSpeed = 0, flapAmp = 0, glide = 0 } = {} ) {

	return new THREE.ShaderMaterial( {
		vertexShader: vert,
		fragmentShader: frag,
		uniforms: {
			...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ),
			...sharedUniforms(),
			uFlapSpeed: { value: flapSpeed },
			uFlapAmp: { value: flapAmp },
			uGlide: { value: glide },
		},
		lights: true,
		side: THREE.DoubleSide,
	} );

}

// Utility to merge coloured parts into one geometry with color + aFlap attributes.
export class PartBuilder {

	constructor() {

		this.parts = [];

	}

	add( geometry, color, matrix = null, flap = 0 ) {

		let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
		if ( matrix ) g.applyMatrix4( matrix );
		const n = g.getAttribute( 'position' ).count;
		const c = new Float32Array( n * 3 );
		const col = new THREE.Color( color ).convertSRGBToLinear();
		for ( let i = 0; i < n; i ++ ) c.set( [ col.r, col.g, col.b ], i * 3 );
		g.setAttribute( 'color', new THREE.BufferAttribute( c, 3 ) );
		const f = new Float32Array( n );
		if ( typeof flap === 'function' ) {

			const p = g.getAttribute( 'position' );
			for ( let i = 0; i < n; i ++ ) f[ i ] = flap( p.getX( i ), p.getY( i ), p.getZ( i ) );

		} else f.fill( flap );

		g.setAttribute( 'aFlap', new THREE.BufferAttribute( f, 1 ) );
		for ( const k of Object.keys( g.attributes ) ) if ( ! [ 'position', 'normal', 'color', 'aFlap' ].includes( k ) ) g.deleteAttribute( k );
		if ( ! g.getAttribute( 'normal' ) ) g.computeVertexNormals();
		this.parts.push( g );
		return this;

	}

	// raw triangles: array of [x,y,z] triplets, flat shaded
	tris( points, color, flapFn = () => 0 ) {

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( points.flat(), 3 ) );
		g.computeVertexNormals();
		return this.add( g, color, null, flapFn );

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
	for ( const [ name, size ] of [ [ 'position', 3 ], [ 'normal', 3 ], [ 'color', 3 ], [ 'aFlap', 1 ] ] ) {

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
