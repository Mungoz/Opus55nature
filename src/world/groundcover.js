import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { commonParsGLSL, terrainUniformsGLSL, terrainLookupFnGLSL } from '../shaders/common.glsl.js';
import { noiseGLSL } from '../shaders/noise.glsl.js';
import { sharedUniforms } from '../core/uniforms.js';
import { RNG } from '../core/rng.js';

// Instances laid on a grid that wraps around the camera (like the grass), so
// only nearby cover is ever processed and it stays planted as you move.
function tiledInstances( tile, spacing, seed ) {

	const n = Math.floor( tile / spacing );
	const rng = new RNG( seed );
	const off = new Float32Array( n * n * 4 );
	let k = 0;
	for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) {

		off[ k ++ ] = ( i + rng.next() ) * spacing;
		off[ k ++ ] = ( j + rng.next() ) * spacing;
		off[ k ++ ] = rng.next();
		off[ k ++ ] = rng.next();

	}

	return { off, count: n * n };

}

const wrapGLSL = /* glsl */ `
uniform vec4 uFocus;
vec2 wrapTile( vec2 o, float tile ) {
	vec2 cam = uFocus.w > 0.5 ? uFocus.xy : cameraPosition.xz;
	return o + tile * floor( ( cam - o ) / tile + 0.5 );
}
mat3 rotY( float a ) { float c = cos( a ), s = sin( a ); return mat3( c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c ); }
mat3 rotX( float a ) { float c = cos( a ), s = sin( a ); return mat3( 1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c ); }
`;

// ---------------------------------------------------------------------------
// Loose stones on the strand and in the shallows
// ---------------------------------------------------------------------------
const stoneVert = /* glsl */ `
${noiseGLSL}
${terrainUniformsGLSL}
${terrainLookupFnGLSL}
${wrapGLSL}
uniform float uTile;
uniform float uRadius;
uniform float uWaterLevel;
uniform sampler2D uNoiseTex;
uniform vec2 uSizeBand; // this mesh draws the stones whose size seed falls in this band
attribute vec4 aOff;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vObj;
varying vec3 vTint;
void main() {
	vec2 p = wrapTile( aOff.xy, uTile );
	float d = length( p - ( uFocus.w > 0.5 ? uFocus.xy : cameraPosition.xz ) );
	float fade = 1.0 - smoothstep( uRadius * 0.7, uRadius, d );
	vec4 bio = biomeAt( p );
	vec4 hn = terrainHN( p );
	float h = hn.x;
	float depth = uWaterLevel - h;
	// only on the strand itself; the lakebed texture carries the stones underwater
	float beds = smoothstep( 0.35, 0.75, textureLod( uNoiseTex, p / 26.0 + 0.4, 0.0 ).r ) * 0.8 + 0.2;
	float dens = bio.a * 0.55 * beds * ( 1.0 - smoothstep( -0.02, 0.1, depth ) );
	dens += ( 1.0 - smoothstep( 0.5, 0.9, h ) ) * 0.03 + bio.b * 0.2;
	float r1 = aOff.z, r2 = aOff.w;
	if ( r1 > dens || fade <= 0.0 || r2 < uSizeBand.x || r2 >= uSizeBand.y ) { gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 ); return; }
	float r3 = fract( r1 * 17.3 + r2 * 5.1 );
	// mostly pebbles, an occasional cobble
	float size = ( 0.02 + 0.035 * r3 + 0.13 * pow( r2, 4.0 ) + 0.12 * pow( r2, 14.0 ) ) * fade;
	// water-worn: rounded, a little elongated and flattened, lying on their broad side
	vec3 sc = vec3( 1.0 + r3 * 0.5, 0.5 + 0.35 * fract( r1 * 9.1 ), 0.75 + 0.35 * r2 ) * size;
	mat3 R = rotY( r2 * 40.0 ) * rotX( ( r3 - 0.5 ) * 0.9 ) * rotY( r1 * 23.0 );
	vec3 lp = R * ( position * sc );
	// bedded into the gravel, big ones more deeply
	vec3 base = vec3( p.x, h - sc.y * ( 0.35 + 0.3 * smoothstep( 0.06, 0.2, size ) ), p.y );
	vWorldPos = base + lp;
	vNormal = normalize( R * ( normal / sc ) );
	vObj = position * 3.0 + r2 * 17.0;
	float t = fract( r3 * 7.7 );
	vec3 col = mix( vec3( 0.42, 0.41, 0.38 ), vec3( 0.58, 0.56, 0.52 ), r3 );
	col = mix( col, vec3( 0.52, 0.47, 0.4 ), step( 0.7, t ) * 0.6 );
	col = mix( col, vec3( 0.33, 0.33, 0.32 ), step( 0.82, fract( t * 2.9 ) ) * 0.7 );
	col = mix( col, vec3( 0.5, 0.4, 0.32 ), step( 0.93, fract( t * 5.3 ) ) * 0.5 );
	col = mix( col, vec3( 0.42, 0.43, 0.36 ), step( 0.88, fract( t * 7.7 ) ) * 0.4 ); // lichen-greened
	vTint = pow( col, vec3( 2.2 ) );
	gl_Position = projectionMatrix * viewMatrix * vec4( vWorldPos, 1.0 );
}
`;

const stoneFrag = /* glsl */ `
${commonParsGLSL}
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vObj;
varying vec3 vTint;
void main() {
	vec3 N = normalize( vNormal );
	vec3 V = normalize( cameraPosition - vWorldPos );
	float speck = gnoise3( vObj * 9.0 ) * 0.5 + 0.5;
	float speck2 = gnoise3( vObj * 2.5 ) * 0.5 + 0.5;
	float vein = smoothstep( 0.9, 0.97, 1.0 - abs( gnoise3( vObj * 1.6 + vec3( 3.0 ) ) ) );
	vec3 alb = vTint * ( 0.82 + 0.16 * speck + 0.14 * speck2 ) * ( 1.0 + vein * 0.25 );
	float above = vWorldPos.y - uWaterLevel;
	// wet below the swash line, algae once submerged
	float wet = 1.0 - smoothstep( 0.0, 0.25, above );
	alb *= 1.0 - wet * 0.45;
	alb = mix( alb, alb * vec3( 0.55, 0.65, 0.35 ), smoothstep( 0.0, -0.4, above ) );
	float sh = sunShadow( vWorldPos, N );
	vec3 col = shadeSurface( alb, N, V, vWorldPos, 0.8 + 0.2 * N.y, sh, mix( 0.7, 0.25, wet ), 0.04 );
	if ( above < 0.0 ) col += alb * uSunColor * sh * caustics( vWorldPos ) * max( uSunDir.y, 0.0 ) * underwaterLight( vWorldPos );
	col = waterColumn( col, vWorldPos, uSunColor * sh );
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, 1.0 );
}
`;

function stoneGeometry( detail = 2 ) {

	let g = new THREE.IcosahedronGeometry( 1, detail );
	g.deleteAttribute( 'uv' );
	g = mergeVertices( g );
	const p = g.getAttribute( 'position' );
	const v = new THREE.Vector3();
	for ( let i = 0; i < p.count; i ++ ) {

		v.fromBufferAttribute( p, i );
		// a lumpy, water-worn ellipsoid: a couple of broad bulges, no facets
		const s = 1 + 0.12 * Math.sin( v.x * 2.1 + 0.7 ) * Math.cos( v.z * 1.7 ) + 0.07 * Math.sin( v.y * 3.3 + v.x * 1.3 );
		// a flatter underside
		const flat = v.y < 0 ? 0.75 : 1;
		p.setXYZ( i, v.x * s, v.y * s * flat, v.z * s );

	}

	g.computeVertexNormals();
	return g;

}

// ---------------------------------------------------------------------------
// pond positions for the cotton grass (filled in once the terrain is generated)
export const PONDS_GC = { value: Array.from( { length: 3 }, () => new THREE.Vector4( 1e6, 1e6, 0, - 100 ) ) };

// Autumn wildflowers
// ---------------------------------------------------------------------------
// types: 0 autumn crocus, 1 gentian, 2 yarrow, 3 harebell, 4 hawkbit, 5 cotton grass (wet ground)
const flowerVert = /* glsl */ `
${noiseGLSL}
${terrainUniformsGLSL}
${terrainLookupFnGLSL}
${wrapGLSL}
uniform float uTile;
uniform float uRadius;
uniform float uTime;
uniform vec4 uWind;
uniform sampler2D uNoiseTex;
uniform vec4 uPondsGC[ 3 ]; // x, z, radius, surface
attribute vec4 aOff;
attribute vec3 aGeo; // x: 0 stem / 1 petal, y: petal index
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vPetal;
void main() {
	vec2 p = wrapTile( aOff.xy, uTile );
	float d = length( p - ( uFocus.w > 0.5 ? uFocus.xy : cameraPosition.xz ) );
	float fade = 1.0 - smoothstep( uRadius * 0.6, uRadius, d );
	vec4 bio = biomeAt( p );
	float r1 = aOff.z, r2 = aOff.w;
	float patch_ = textureLod( uNoiseTex, p / 18.0 + 0.23, 0.0 ).r;
	vec4 hn = terrainHN( p );
	// boggy margins of the pools, the stream and the lake
	float wet = smoothstep( 0.03, 0.2, bio.a ) * ( 1.0 - smoothstep( 0.5, 0.85, bio.a ) ) * step( 1.8, hn.x );
	for ( int i = 0; i < 3; i ++ ) {
		// the boggy fringe of the pools
		vec4 pd = uPondsGC[ i ];
		if ( length( p - pd.xy ) > pd.z * 2.4 ) continue;
		float above = hn.x - pd.w;
		wet = max( wet, smoothstep( 0.02, 0.1, above ) * ( 1.0 - smoothstep( 0.35, 0.8, above ) ) );
	}
	float cotton = wet * smoothstep( 0.55, 0.7, textureLod( uNoiseTex, p / 13.0 + 0.61, 0.0 ).b );
	float dens = max( bio.r * smoothstep( 0.4, 0.72, patch_ ) * 0.7, cotton * 0.9 );
	if ( r1 > dens || fade <= 0.0 ) { gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 ); return; }
	// each drift is mostly one species
	float kind = cotton > 0.25 ? 5.0 : floor( fract( textureLod( uNoiseTex, p / 31.0, 0.0 ).g * 3.7 + r2 * 0.35 ) * 5.0 );
	float stemH, headR, tilt, pw = 0.7; vec3 col;
	if ( kind < 0.5 ) { stemH = 0.07; headR = 0.035; tilt = 1.25; col = vec3( 0.62, 0.45, 0.8 ); }
	else if ( kind < 1.5 ) { stemH = 0.06; headR = 0.022; tilt = 1.3; col = vec3( 0.14, 0.24, 0.82 ); }
	else if ( kind < 2.5 ) { stemH = 0.36; headR = 0.03; tilt = 0.35; pw = 1.9; col = vec3( 0.86, 0.84, 0.76 ); }
	else if ( kind < 3.5 ) { stemH = 0.28; headR = 0.019; tilt = -1.15; col = vec3( 0.48, 0.55, 0.9 ); }
	else if ( kind < 4.5 ) { stemH = 0.2; headR = 0.026; tilt = 0.28; col = vec3( 0.98, 0.76, 0.16 ); }
	else { stemH = 0.38; headR = 0.034; tilt = -0.75; pw = 2.3; col = vec3( 0.97, 0.96, 0.93 ); }
	stemH *= 0.8 + 0.4 * r2;
	headR *= 1.5;
	float s = fade;
	vec2 wdir = normalize( uWind.xy + 1e-4 );
	float gust = textureLod( uNoiseTex, p / 45.0 - wdir * uTime * 0.09, 0.0 ).g;
	vec2 sway = wdir * ( uWind.z * ( 0.1 + 0.6 * gust ) + 0.04 * sin( uTime * 3.0 + r1 * 30.0 ) ) * stemH;
	vec3 base = vec3( p.x, hn.x - 0.01, p.y );
	vec3 top = base + vec3( sway.x, stemH * s, sway.y );
	vec3 wp;
	vec3 n;
	if ( aGeo.x < 0.5 ) {
		// stem: crossed thin quads
		float ang = aGeo.y * 1.5708 + r1 * 6.0;
		vec3 side = vec3( cos( ang ), 0.0, sin( ang ) );
		wp = mix( base, top, position.y ) + side * position.x * 0.004 * s;
		n = vec3( -side.z, 0.3, side.x );
		col = vec3( 0.18, 0.3, 0.1 );
	} else {
		// petals radiate from the head, cupped, flat or hanging as a bell
		float a = aGeo.y / 6.0 * 6.2832 + r1 * 6.0;
		vec3 radial = vec3( cos( a ), 0.0, sin( a ) );
		vec3 dir = normalize( radial * cos( tilt ) + vec3( 0.0, 1.0, 0.0 ) * sin( tilt ) );
		vec3 side = vec3( -sin( a ), 0.0, cos( a ) );
		float r = position.y;
		float wProf = sin( r * 3.1416 ) * 0.85 + 0.15;
		wp = top + ( dir * r * headR + side * position.x * headR * pw * wProf ) * s;
		n = normalize( cross( side, dir ) );
		if ( n.y < 0.0 ) n = -n;
		col *= 0.8 + 0.35 * r;
	}
	vColor = pow( col, vec3( 2.2 ) );
	vNormal = n;
	vPetal = aGeo.x;
	vWorldPos = wp;
	gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}
`;

const flowerFrag = /* glsl */ `
${commonParsGLSL}
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying float vPetal;
void main() {
	vec3 N = normalize( vNormal );
	vec3 V = normalize( cameraPosition - vWorldPos );
	float sh = sunShadowFast( vWorldPos );
	float wrap = saturate( dot( N, uSunDir ) * 0.5 + 0.5 );
	float back = pow( saturate( dot( -V, uSunDir ) ), 3.0 ) * vPetal;
	vec3 alb = vColor;
	vec3 col = uSunColor * sh * ( alb / PI * wrap + alb * back * 0.6 ) + alb / PI * skyIrradiance( N );
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, 1.0 );
}
`;

function flowerGeometry() {

	const pos = [], geo = [], idx = [];
	const quad = ( verts, part, index ) => {

		const b = pos.length / 3;
		for ( const v of verts ) {

			pos.push( ...v );
			geo.push( part, index, 0 );

		}

		idx.push( b, b + 1, b + 2, b + 1, b + 3, b + 2 );

	};

	// two crossed stems
	for ( let k = 0; k < 2; k ++ ) quad( [ [ - 0.5, 0, 0 ], [ 0.5, 0, 0 ], [ - 0.5, 1, 0 ], [ 0.5, 1, 0 ] ], 0, k );
	// six petals (x across, y along the petal)
	for ( let k = 0; k < 6; k ++ ) quad( [ [ - 0.5, 0, 0 ], [ 0.5, 0, 0 ], [ - 0.5, 1, 0 ], [ 0.5, 1, 0 ] ], 1, k );
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'aGeo', new THREE.Float32BufferAttribute( geo, 3 ) );
	g.setIndex( idx );
	return g;

}

function instanced( base, tile, spacing, seed ) {

	const { off, count } = tiledInstances( tile, spacing, seed );
	const g = new THREE.InstancedBufferGeometry();
	g.index = base.index;
	for ( const [ k, a ] of Object.entries( base.attributes ) ) g.setAttribute( k, a );
	g.setAttribute( 'aOff', new THREE.InstancedBufferAttribute( off, 4 ) );
	g.instanceCount = count;
	return g;

}

export class GroundCover {

	constructor( quality ) {

		this.group = new THREE.Group();
		this.group.name = 'groundcover';
		const lights = () => ( { ...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ), ...sharedUniforms() } );
		const k = Math.sqrt( quality.grassDensity );

		// pebbles (most of them, a few cm across) on a light mesh; the larger cobbles, a fifth
		// of the stones, on a finer one - and that mesh only carries their instances
		const stoneTile = 56, cut = 0.78;
		const all = instanced( stoneGeometry( 1 ), stoneTile, 0.3 / k, 11 );
		const big = instanced( stoneGeometry( 2 ), stoneTile, 0.3 / k, 11 );
		{

			const src = big.getAttribute( 'aOff' ).array, keep = [];
			for ( let i = 0; i < src.length; i += 4 ) if ( src[ i + 3 ] >= cut ) keep.push( src[ i ], src[ i + 1 ], src[ i + 2 ], src[ i + 3 ] );
			big.setAttribute( 'aOff', new THREE.InstancedBufferAttribute( new Float32Array( keep ), 4 ) );
			big.instanceCount = keep.length / 4;

		}

		const stoneMat = ( band ) => new THREE.ShaderMaterial( {
			vertexShader: stoneVert,
			fragmentShader: stoneFrag,
			uniforms: { ...lights(), uTile: { value: stoneTile }, uRadius: { value: stoneTile * 0.5 }, uSizeBand: { value: new THREE.Vector2( ...band ) } },
			lights: true,
		} );
		this.stones = new THREE.Group();
		for ( const [ geo, band ] of [ [ all, [ 0, cut ] ], [ big, [ cut, 2 ] ] ] ) {

			const m = new THREE.Mesh( geo, stoneMat( band ) );
			m.frustumCulled = false;
			m.layers.set( 1 );
			this.stones.add( m );

		}

		const flowerTile = 64;
		this.flowers = new THREE.Mesh( instanced( flowerGeometry(), flowerTile, 0.42 / k, 13 ), new THREE.ShaderMaterial( {
			vertexShader: flowerVert,
			fragmentShader: flowerFrag,
			uniforms: { ...lights(), uTile: { value: flowerTile }, uRadius: { value: flowerTile * 0.5 }, uPondsGC: PONDS_GC },
			lights: true,
			side: THREE.DoubleSide,
		} ) );
		this.flowers.frustumCulled = false;
		this.flowers.layers.set( 1 );
		this.group.add( this.stones, this.flowers );

	}

}
