import * as THREE from 'three';
import { commonParsGLSL } from '../shaders/common.glsl.js';
import { noiseGLSL } from '../shaders/noise.glsl.js';
import { sharedUniforms } from '../core/uniforms.js';
import { RNG, hash2 } from '../core/rng.js';

// Plants of the water's edge, after photos of alpine tarns and meadow streams in autumn:
//  - yellow water-lily (Nuphar) pads in the ponds and sheltered bays, yellowing and
//    browning from the rim, with the odd late flower
//  - bottle sedge (Carex rostrata) tussocks along the banks: grey-green at the base,
//    arching blades turning golden-straw toward the tips
//  - soft rush (Juncus effusus) tufts: dense, upright, dark green, with brown flower tufts
//  - water horsetail (Equisetum fluviatile) stands in the shallows: jointed green stems

const vert = /* glsl */ `
${noiseGLSL}
uniform float uTime;
uniform vec4 uWind;
uniform sampler2D uNoiseTex;
attribute vec3 aPart; // kind (0 blade, 1 jointed stem, 2 pad, 3 flower), then per-kind coords
attribute vec3 aSide; // offset of this vertex from the blade's spine (for widening at a distance)
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vPart;
varying float vRnd;
varying float vAO;
void main() {
	mat4 im = modelMatrix * instanceMatrix;
	vec3 origin = im[ 3 ].xyz;
	float rnd = hash12( floor( origin.xz * 7.0 ) + 0.5 );
	vec3 wp = ( im * vec4( position, 1.0 ) ).xyz;
	vec3 n = normalize( mat3( im ) * normal );
	// thin blades would drop below a pixel: widen them with distance (as the meadow grass does)
	vec3 side = mat3( im ) * aSide;
	float hw = length( side );
	if ( hw > 1e-5 ) {
		float dist = length( cameraPosition - wp );
		float widen = clamp( dist * 0.0011 / hw, 1.0, 7.0 );
		wp += side * ( widen - 1.0 );
	}
	float kind = aPart.x;
	float hgt = max( wp.y - origin.y, 0.0 );
	if ( kind < 1.5 ) {
		// blades and stems lean with the gusts and nod on their own
		vec2 wdir = normalize( uWind.xy + 1e-4 );
		float gust = smoothstep( 0.3, 0.85, textureLod( uNoiseTex, origin.xz / 45.0 - wdir * uTime * 0.09, 0.0 ).g );
		float str = uWind.z * ( 0.25 + 1.1 * gust );
		float stiff = kind < 0.5 ? 1.0 : 0.45;
		float sway = ( str * 0.35 + 0.05 * sin( uTime * ( 1.6 + rnd * 0.8 ) + rnd * 6.28 + position.x * 9.0 ) * ( 0.3 + uWind.z ) ) * hgt * hgt * stiff;
		wp.xz += wdir * sway;
		wp.y -= sway * sway * 0.3;
	} else {
		// pads and flowers ride the ripples
		wp.y += 0.004 * sin( uTime * 1.3 + origin.x * 0.7 + origin.z * 0.5 );
	}
	vWorldPos = wp;
	vNormal = n;
	vColor = color;
	vPart = aPart;
	vRnd = rnd;
	vAO = kind < 1.5 ? mix( 0.35, 1.0, smoothstep( 0.0, 0.45, hgt ) ) : 1.0;
	gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}
`;

const frag = /* glsl */ `
${commonParsGLSL}
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vPart;
varying float vRnd;
varying float vAO;
void main() {
	vec3 N = normalize( vNormal );
	if ( ! gl_FrontFacing ) N = -N;
	vec3 V = normalize( cameraPosition - vWorldPos );
	vec3 alb = vColor;
	float kind = vPart.x;
	float rough = 0.7, f0 = 0.03, trans = 0.0, gloss = 0.0;
	if ( kind < 0.5 ) {
		trans = 1.0;
	} else if ( kind < 1.5 ) {
		// horsetail: dark toothed sheaths at every joint, fine ridges between
		float j = fract( vPart.y );
		float band = smoothstep( 0.9, 0.93, j ) * ( 1.0 - smoothstep( 0.97, 0.995, j ) );
		alb = mix( alb, vec3( 0.012, 0.011, 0.008 ), band * 0.92 );
		alb = mix( alb, alb * vec3( 1.25, 1.1, 0.7 ), smoothstep( 0.93, 0.97, j ) * 0.6 );
		trans = 0.4;
		rough = 0.45;
	} else if ( kind < 2.5 ) {
		// pad: radial veins, waxy gloss; autumn yellowing creeps in from the rim, then rot spots
		vec2 q = vPart.yz;
		float r = length( q ), a = atan( q.y, q.x );
		float vein = smoothstep( 0.82, 1.0, cos( a * 26.0 + r * 3.0 ) ) * smoothstep( 0.08, 0.3, r ) * ( 1.0 - smoothstep( 0.85, 1.0, r ) );
		float age = smoothstep( 0.25, 1.0, vRnd );
		float edge = smoothstep( 0.35, 1.0, r + 0.25 * gnoise( q * 3.0 + vRnd * 11.0 ) );
		vec3 green = alb;
		vec3 yellow = vec3( 0.34, 0.27, 0.05 );
		vec3 brown = vec3( 0.075, 0.045, 0.02 );
		alb = mix( green, yellow, saturate( age * 1.4 * ( 0.35 + edge ) ) );
		float rot = smoothstep( 0.55, 0.75, gnoise( q * 5.0 + vRnd * 7.0 ) * 0.5 + 0.5 ) * smoothstep( 0.5, 1.0, age );
		alb = mix( alb, brown, saturate( rot + smoothstep( 0.85, 1.0, age ) * edge ) );
		alb *= 1.0 + vein * 0.35;
		rough = mix( 0.22, 0.5, age );
		f0 = 0.045;
		gloss = 0.4;
		trans = 0.15;
	} else {
		trans = 0.6;
		rough = 0.4;
	}
	float sh = sunShadow( vWorldPos, N * 0.1 );
	vec3 L = uSunDir;
	float wrap = trans > 0.5 ? saturate( dot( N, L ) * 0.6 + 0.4 ) : saturate( dot( N, L ) );
	float back = pow( saturate( dot( -V, L ) ), 3.0 ) * trans;
	vec3 direct = uSunColor * sh * ( alb / PI * wrap + alb * saturate( alb * 2.2 ) * back * 0.9 );
	vec3 amb = alb / PI * skyIrradiance( N ) * vAO;
	vec3 spec = uSunColor * sh * specGGX( N, V, L, rough, f0 ) * ( kind > 1.5 ? 1.0 : 0.3 );
	vec3 R = reflect( -V, N );
	spec += skyRadiance( normalize( vec3( R.x, max( R.y, 0.02 ), R.z ) ) ) * F_Schlick( f0, saturate( dot( N, V ) ) ) * gloss * vAO;
	vec3 col = ( direct + amb ) * underwaterLight( vWorldPos ) + spec;
	col = waterColumn( col, vWorldPos, uSunColor * sh );
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, 1.0 );
}
`;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const srgb = ( hex ) => new THREE.Color( hex ).convertSRGBToLinear();

class Geo {

	constructor() {

		this.pos = [];
		this.nrm = [];
		this.col = [];
		this.part = [];
		this.side = [];
		this.idx = [];

	}

	v( p, n, c, part, side = null ) {

		this.side.push( side ? side.x : 0, side ? side.y : 0, side ? side.z : 0 );
		this.pos.push( p.x, p.y, p.z );
		this.nrm.push( n.x, n.y, n.z );
		this.col.push( c.r, c.g, c.b );
		this.part.push( part[ 0 ], part[ 1 ], part[ 2 ] );
		return this.pos.length / 3 - 1;

	}

	build() {

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( this.pos, 3 ) );
		g.setAttribute( 'normal', new THREE.Float32BufferAttribute( this.nrm, 3 ) );
		g.setAttribute( 'color', new THREE.Float32BufferAttribute( this.col, 3 ) );
		g.setAttribute( 'aPart', new THREE.Float32BufferAttribute( this.part, 3 ) );
		g.setAttribute( 'aSide', new THREE.Float32BufferAttribute( this.side, 3 ) );
		g.setIndex( this.idx );
		g.computeBoundingSphere();
		return g;

	}

}

// A narrow blade along a path of points, with a slight keel down the middle.
function blade( G, pts, widths, colors, kind = 0 ) {

	const rows = [];
	for ( let i = 0; i < pts.length; i ++ ) {

		const a = pts[ Math.max( 0, i - 1 ) ], b = pts[ Math.min( pts.length - 1, i + 1 ) ];
		const t = b.clone().sub( a ).normalize();
		const side = new THREE.Vector3( - t.z, 0, t.x );
		if ( side.lengthSq() < 1e-6 ) side.set( 1, 0, 0 );
		side.normalize();
		const n = new THREE.Vector3().crossVectors( side, t ).normalize();
		if ( n.y < 0 ) n.negate();
		const w = widths[ i ] * 0.5;
		const s = i / ( pts.length - 1 );
		rows.push( [
			G.v( pts[ i ].clone().addScaledVector( side, - w ), n.clone().addScaledVector( side, - 0.5 ).normalize(), colors[ i ], [ kind, s, 0 ], side.clone().multiplyScalar( - w ) ),
			G.v( pts[ i ].clone().addScaledVector( n, w * 0.35 ), n, colors[ i ], [ kind, s, 0 ], n.clone().multiplyScalar( w * 0.35 ) ),
			G.v( pts[ i ].clone().addScaledVector( side, w ), n.clone().addScaledVector( side, 0.5 ).normalize(), colors[ i ], [ kind, s, 0 ], side.clone().multiplyScalar( w ) ),
		] );

	}

	for ( let i = 0; i < rows.length - 1; i ++ ) {

		for ( let k = 0; k < 2; k ++ ) G.idx.push( rows[ i ][ k ], rows[ i + 1 ][ k ], rows[ i ][ k + 1 ], rows[ i ][ k + 1 ], rows[ i + 1 ][ k ], rows[ i + 1 ][ k + 1 ] );

	}

}

// Bottle sedge: a tussock of long, arching, keeled blades, golden toward the tips.
function makeSedge( rng ) {

	const G = new Geo();
	const n = rng.int( 42, 56 );
	const base = srgb( '#56693f' ), mid = srgb( '#98894a' ), straw = srgb( '#d0a452' ), dead = srgb( '#86592f' );
	for ( let b = 0; b < n; b ++ ) {

		const az = rng.next() * Math.PI * 2;
		const r0 = Math.sqrt( rng.next() ) * 0.1;
		const L = rng.range( 0.75, 1.35 );
		const th0 = rng.range( 0.05, 0.5 ), curl = rng.range( 0.6, 1.5 ) * ( 0.5 + th0 );
		const dir = new THREE.Vector3( Math.cos( az ), 0, Math.sin( az ) );
		const pts = [], ws = [], cs = [];
		const p = new THREE.Vector3( Math.cos( az ) * r0, - 0.02, Math.sin( az ) * r0 );
		const autumn = Math.pow( rng.next(), 1.6 ) * 0.9 + 0.05;
		const isDead = rng.next() < 0.14;
		const w0 = rng.range( 0.007, 0.012 );
		const N = 7;
		for ( let i = 0; i <= N; i ++ ) {

			const s = i / N;
			pts.push( p.clone() );
			ws.push( w0 * ( 1 - s * 0.85 ) + 0.0008 );
			let c = base.clone().lerp( mid, Math.min( 1, s * 1.6 ) * autumn ).lerp( straw, Math.max( 0, s - 0.35 ) / 0.65 * autumn );
			if ( isDead ) c = dead.clone().lerp( straw, s * 0.4 );
			cs.push( c );
			const th = th0 + curl * Math.pow( s, 1.4 );
			const step = L / N;
			p.addScaledVector( dir, Math.sin( th ) * step ).add( new THREE.Vector3( 0, Math.cos( th ) * step, 0 ) );

		}

		blade( G, pts, ws, cs );

	}

	// a few brown flower spikes held up on stiff stems
	const ns = rng.int( 0, 4 );
	for ( let k = 0; k < ns; k ++ ) {

		const az = rng.next() * Math.PI * 2, lean = rng.range( 0.05, 0.25 );
		const d = new THREE.Vector3( Math.cos( az ) * lean, 1, Math.sin( az ) * lean ).normalize();
		const H = rng.range( 0.55, 0.8 );
		const stemC = srgb( '#8f8a55' ), spikeC = srgb( '#6a4a28' );
		const pts = [], ws = [], cs = [];
		for ( let i = 0; i <= 5; i ++ ) {

			const s = i / 5;
			pts.push( d.clone().multiplyScalar( H * s ).add( new THREE.Vector3( 0, - 0.02, 0 ) ) );
			const spike = s > 0.7;
			ws.push( spike ? 0.012 : 0.004 );
			cs.push( spike ? spikeC : stemC );

		}

		blade( G, pts, ws, cs );

	}

	return G.build();

}

// Soft rush: a dense, upright tuft of dark green stems with brown flower tufts on the side.
function makeRush( rng ) {

	const G = new Geo();
	const n = rng.int( 50, 70 );
	const green = srgb( '#3b5528' ), dark = srgb( '#2a3d1d' ), tip = srgb( '#8f7c48' ), flower = srgb( '#6e5330' );
	for ( let b = 0; b < n; b ++ ) {

		const az = rng.next() * Math.PI * 2;
		const r0 = Math.sqrt( rng.next() ) * 0.12;
		const L = rng.range( 0.6, 1.1 );
		const lean = rng.range( 0.02, 0.3 ) * ( 0.4 + r0 / 0.12 );
		const dir = new THREE.Vector3( Math.cos( az ) * lean, 1, Math.sin( az ) * lean ).normalize();
		const bow = rng.range( 0.0, 0.35 );
		const pts = [], ws = [], cs = [];
		const c0 = dark.clone().lerp( green, rng.next() );
		const browned = rng.next() < 0.3;
		for ( let i = 0; i <= 4; i ++ ) {

			const s = i / 4;
			const p = new THREE.Vector3( Math.cos( az ) * r0, - 0.02, Math.sin( az ) * r0 ).addScaledVector( dir, L * s );
			p.x += Math.cos( az ) * bow * s * s * L * 0.4;
			p.z += Math.sin( az ) * bow * s * s * L * 0.4;
			p.y -= bow * s * s * L * 0.1;
			pts.push( p );
			ws.push( 0.0045 * ( 1 - s * 0.7 ) + 0.0006 );
			cs.push( browned && s > 0.6 ? c0.clone().lerp( tip, ( s - 0.6 ) / 0.4 ) : c0 );

		}

		blade( G, pts, ws, cs );
		// the flower cluster bursts from one side a little below the tip
		if ( rng.next() < 0.3 ) {

			const c = pts[ 3 ].clone().lerp( pts[ 2 ], 0.3 );
			const out = new THREE.Vector3( Math.cos( az + 1.2 ), 0.3, Math.sin( az + 1.2 ) ).normalize();
			const fp = [ c, c.clone().addScaledVector( out, 0.025 ), c.clone().addScaledVector( out, 0.045 ).add( new THREE.Vector3( 0, 0.012, 0 ) ) ];
			blade( G, fp, [ 0.012, 0.02, 0.01 ], [ flower, flower, flower ] );

		}

	}

	return G.build();

}

// Water horsetail: a stand of straight, jointed stems. Joints are drawn in the shader.
function makeHorsetail( rng ) {

	const G = new Geo();
	const n = rng.int( 14, 26 );
	for ( let b = 0; b < n; b ++ ) {

		const x = rng.range( - 0.45, 0.45 ), z = rng.range( - 0.45, 0.45 );
		const H = rng.range( 0.45, 1.0 );
		const lean = new THREE.Vector3( rng.range( - 0.06, 0.06 ), 1, rng.range( - 0.06, 0.06 ) ).normalize();
		const joint = rng.range( 0.05, 0.075 );
		const c = srgb( '#5d7a33' ).lerp( srgb( '#9a9550' ), rng.next() * 0.55 );
		const r = rng.range( 0.0028, 0.004 );
		const sides = 4;
		const rings = [];
		for ( let i = 0; i <= 5; i ++ ) {

			const s = i / 5;
			const cen = new THREE.Vector3( x, - 0.3, z ).addScaledVector( lean, ( H + 0.3 ) * s );
			const rr = r * ( s > 0.9 ? ( 1 - s ) * 10 * 0.8 + 0.2 : 1 );
			const ring = [];
			for ( let k = 0; k <= sides; k ++ ) {

				const a = k / sides * Math.PI * 2;
				const nn = new THREE.Vector3( Math.cos( a ), 0, Math.sin( a ) );
				ring.push( G.v( cen.clone().addScaledVector( nn, rr ), nn, c, [ 1, ( cen.y + 0.3 ) / joint, 0 ], nn.clone().multiplyScalar( rr ) ) );

			}

			rings.push( ring );

		}

		for ( let i = 0; i < rings.length - 1; i ++ ) for ( let k = 0; k < sides; k ++ ) G.idx.push( rings[ i ][ k ], rings[ i + 1 ][ k ], rings[ i ][ k + 1 ], rings[ i ][ k + 1 ], rings[ i + 1 ][ k ], rings[ i + 1 ][ k + 1 ] );

	}

	return G.build();

}

// A yellow water-lily pad: broad, ovate, deeply notched where the stalk joins, the rim a
// little curled. Local coords (for the veins) go in aPart.yz.
function makePad( rng, round = false ) {

	const G = new Geo();
	const green = srgb( round ? '#2f5320' : '#3d5d22' );
	const a = 1, bb = round ? 0.96 : 0.78;
	const notch = round ? 0.07 : 0.22;
	const seg = 18;
	const curl = rng.range( 0.02, 0.06 );
	const up = new THREE.Vector3( 0, 1, 0 );
	const c = G.v( new THREE.Vector3( 0.04, 0, 0 ), up, green, [ 2, 0, 0 ] );
	const ring = [];
	for ( let i = 0; i <= seg; i ++ ) {

		const th = notch + ( Math.PI * 2 - 2 * notch ) * i / seg;
		const wob = 1 + 0.03 * Math.sin( th * 5 + rng.next() );
		const x = Math.cos( th ) * a * wob, z = Math.sin( th ) * bb * wob;
		const y = curl * Math.pow( Math.hypot( x, z ), 4 ) * ( 0.6 + 0.4 * Math.sin( th * 2 + 1 ) );
		ring.push( G.v( new THREE.Vector3( x, y, z ), up, green, [ 2, x, z ] ) );

	}

	// a mid ring so the curl and veins have vertices to live on
	const mid = ring.map( ( i ) => {

		const x = G.pos[ i * 3 ] * 0.55, z = G.pos[ i * 3 + 2 ] * 0.55;
		return G.v( new THREE.Vector3( x, 0, z ), up, green, [ 2, x, z ] );

	} );
	for ( let i = 0; i < seg; i ++ ) {

		G.idx.push( c, mid[ i + 1 ], mid[ i ] );
		G.idx.push( mid[ i ], mid[ i + 1 ], ring[ i ], mid[ i + 1 ], ring[ i + 1 ], ring[ i ] );

	}

	const g = G.build();
	g.computeVertexNormals();
	return g;

}

// A late yellow water-lily flower: a small globe of five waxy sepals on a stalk above the pads.
function makeFlower( rng ) {

	const G = new Geo();
	const yellow = srgb( '#e3b919' ), stalkC = srgb( '#5f6a2c' );
	const h = rng.range( 0.05, 0.1 );
	blade( G, [ new THREE.Vector3( 0, - 0.2, 0 ), new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0.005, h, 0 ) ], [ 0.008, 0.008, 0.007 ], [ stalkC, stalkC, stalkC ], 3 );
	for ( let k = 0; k < 5; k ++ ) {

		const az = k / 5 * Math.PI * 2;
		const d = new THREE.Vector3( Math.cos( az ), 0, Math.sin( az ) );
		const pts = [];
		for ( let i = 0; i <= 4; i ++ ) {

			const s = i / 4;
			const ang = s * 1.9;
			pts.push( new THREE.Vector3( 0.005, h, 0 ).addScaledVector( d, Math.sin( ang ) * 0.022 ).add( new THREE.Vector3( 0, ( 1 - Math.cos( ang ) ) * 0.022, 0 ) ) );

		}

		blade( G, pts, [ 0.01, 0.024, 0.028, 0.024, 0.012 ], pts.map( () => yellow ), 3 );

	}

	return G.build();

}

// ---------------------------------------------------------------------------

function valueNoise( x, z ) {

	const ix = Math.floor( x ), iz = Math.floor( z );
	const fx = x - ix, fz = z - iz;
	const u = fx * fx * ( 3 - 2 * fx ), v = fz * fz * ( 3 - 2 * fz );
	const a = hash2( ix, iz ), b = hash2( ix + 1, iz ), c = hash2( ix, iz + 1 ), d = hash2( ix + 1, iz + 1 );
	return a + ( b - a ) * u + ( c - a ) * v + ( a - b - c + d ) * u * v;

}

export class WaterPlants {

	constructor( terrain ) {

		this.terrain = terrain;
		this.group = new THREE.Group();
		this.group.name = 'waterplants';
		this._last = new THREE.Vector3( 1e9, 0, 0 );
		this.material = new THREE.ShaderMaterial( {
			vertexShader: vert,
			fragmentShader: frag,
			uniforms: { ...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ), ...sharedUniforms() },
			vertexColors: true,
			lights: true,
			side: THREE.DoubleSide,
		} );
		const rng = new RNG( 5150 );
		this.sets = {
			sedge: { variants: [ makeSedge( rng ), makeSedge( rng ), makeSedge( rng ) ], items: [], maxD: 150, shadow: true },
			rush: { variants: [ makeRush( rng ), makeRush( rng ) ], items: [], maxD: 130, shadow: true },
			horsetail: { variants: [ makeHorsetail( rng ), makeHorsetail( rng ) ], items: [], maxD: 110, shadow: false },
		};
		this.padGeo = [ makePad( rng ), makePad( rng ), makePad( rng, true ) ];
		this.flowerGeo = makeFlower( rng );
		this._place( rng );
		this._build();

	}

	_place( rng ) {

		const td = this.terrain;
		const S = this.sets;
		const pads = [], flowers = [];
		const add = ( set, x, z, s = rng.range( 0.8, 1.2 ), y = null ) => {

			S[ set ].items.push( { x, y: y ?? td.heightAt( x, z ) - 0.03, z, s, rot: rng.next() * Math.PI * 2, variant: Math.floor( rng.next() * S[ set ].variants.length ) } );

		};

		// a colony of pads floating at level y, packed without overlapping much
		const colony = ( cx, cz, R, y, n, ok ) => {

			const mine = [];
			for ( let t = 0; t < n * 4 && mine.length < n; t ++ ) {

				const a = rng.next() * Math.PI * 2, r = Math.sqrt( rng.next() ) * R;
				const x = cx + Math.cos( a ) * r, z = cz + Math.sin( a ) * r;
				const s = rng.range( 0.13, 0.22 );
				if ( ! ok( x, z ) ) continue;
				if ( mine.some( ( p ) => Math.hypot( p.x - x, p.z - z ) < ( p.s + s ) * 0.7 ) ) continue;
				const p = { x, y: y + 0.015 + rng.next() * 0.008, z, s, rot: rng.next() * Math.PI * 2, variant: rng.next() < 0.25 ? 2 : Math.floor( rng.next() * 2 ) };
				mine.push( p );
				pads.push( p );
				if ( rng.next() < 0.035 ) flowers.push( { x: x + rng.range( - 0.1, 0.1 ), y, z: z + rng.range( - 0.1, 0.1 ), s: rng.range( 0.9, 1.2 ), rot: rng.next() * 6.28 } );

			}

		};

		// ---- ponds: lilies in the open water, sedge and rush round the rim, horsetail in the margin
		for ( const pd of td.ponds ) {

			const inPond = ( x, z ) => Math.hypot( x - pd.c.x, z - pd.c.y ) < pd.r * 0.82 && td.heightAt( x, z ) < pd.surf - 0.25;
			const nc = rng.int( 2, 3 );
			for ( let k = 0; k < nc; k ++ ) {

				const a = rng.next() * Math.PI * 2, r = rng.range( 0.3, 0.6 ) * pd.r;
				const R = pd.r * rng.range( 0.25, 0.4 );
				colony( pd.c.x + Math.cos( a ) * r, pd.c.y + Math.sin( a ) * r, R, pd.surf, Math.floor( R * R * rng.range( 5, 9 ) ), inPond );

			}

			// shoreline radius at an angle (measured when the water surface was built)
			const shore = ( a ) => {

				const N = pd.edge.length, f = ( ( a / ( Math.PI * 2 ) ) % 1 + 1 ) % 1 * N, i = Math.floor( f );
				return THREE.MathUtils.lerp( pd.edge[ i % N ], pd.edge[ ( i + 1 ) % N ], f - i ) - 0.8;

			};

			const perim = pd.r * 2 * Math.PI * 1.3;
			const ring = Math.floor( perim / 0.7 );
			for ( let k = 0; k < ring; k ++ ) {

				const a = k / ring * Math.PI * 2 + rng.range( - 0.02, 0.02 );
				const R = shore( a );
				const patchy = valueNoise( a * 3 + pd.c.x, pd.c.y );
				const r = R + rng.range( 0.2, 1.8 );
				const x = pd.c.x + Math.cos( a ) * r, z = pd.c.y + Math.sin( a ) * r;
				if ( patchy > 0.22 ) add( patchy > 0.68 ? 'rush' : 'sedge', x, z, rng.range( 0.9, 1.3 ) );
				// horsetail wades out into the shallows in stands
				if ( valueNoise( a * 4 + 9, pd.c.x ) > 0.58 ) {

					for ( let j = 0; j < 2; j ++ ) {

						const rr = R - rng.range( 0.3, 3.0 );
						const hx = pd.c.x + Math.cos( a ) * rr, hz = pd.c.y + Math.sin( a ) * rr;
						if ( td.heightAt( hx, hz ) > pd.surf - 0.7 ) add( 'horsetail', hx, hz, rng.range( 0.8, 1.2 ), pd.surf - 0.02 );

					}

				}

			}

		}

		// ---- the stream: sedge and rush lining both banks in stretches, horsetail in slack water
		const riv = td.river;
		for ( let i = 1; i < riv.length - 1; i ++ ) {

			const a = riv[ i ], b = riv[ i + 1 ];
			const seg = b.p.clone().sub( a.p );
			const len = seg.length();
			const t = seg.clone().normalize(), nrm = new THREE.Vector2( - t.y, t.x );
			for ( let d = 0; d < len; d += 1.3 ) {

				const u = d / len;
				const c = a.p.clone().lerp( b.p, u );
				const w = THREE.MathUtils.lerp( a.width, b.width, u );
				const k = THREE.MathUtils.lerp( a.k, b.k, u );
				if ( a.s < 60 ) continue; // the tumbling reach below the fall is stony
				for ( const side of [ - 1, 1 ] ) {

					const patchy = valueNoise( ( a.s + d ) * 0.05 + side * 17, 3.3 );
					if ( patchy < 0.3 || rng.next() > 0.75 ) continue;
					const inner = side * k > 0.006; // inside of a bend: low gravel, sedge beds
					const off = w + rng.range( inner ? 1.0 : 0.4, inner ? 3.5 : 1.6 );
					const p = c.clone().addScaledVector( nrm, off * side );
					add( patchy > 0.7 && ! inner ? 'rush' : 'sedge', p.x, p.y );
					if ( inner && rng.next() < 0.18 ) {

						const q = c.clone().addScaledVector( nrm, ( w - rng.range( 0.3, 0.9 ) ) * side );
						add( 'horsetail', q.x, q.y, rng.range( 0.7, 1 ), THREE.MathUtils.lerp( a.surf, b.surf, u ) - 0.02 );

					}

				}

			}

		}

		// ---- a colony in the shallows off the start, where people will see it
		{

			let best = null;
			for ( let k = 0; k < 400 && ! best; k ++ ) {

				const x = - 45 + ( k % 20 ) * 4, z = 445 - Math.floor( k / 20 ) * 4;
				const h = td.heightAt( x, z );
				if ( h < - 0.8 && h > - 1.6 ) best = [ x, z ];

			}

			if ( best ) colony( best[ 0 ], best[ 1 ], 5, 0, 220, ( x2, z2 ) => {

				const h2 = td.heightAt( x2, z2 );
				return h2 < - 0.5 && h2 > - 2.4;

			} );

		}

		// ---- the lake: lilies in sheltered shallows, horsetail and sedge fringing the margin
		const lx0 = - 460, lx1 = 460, lz0 = - 1150, lz1 = 480, st = 2.2;
		for ( let z = lz0; z < lz1; z += st ) {

			for ( let x = lx0; x < lx1; x += st ) {

				const px = x + rng.next() * st, pz = z + rng.next() * st;
				const h = td.heightAt( px, pz );
				if ( h > 1.3 || h < - 2.2 ) continue;
				const patch = valueNoise( px * 0.03 + 5, pz * 0.03 - 2 );
				const fine = valueNoise( px * 0.2, pz * 0.2 + 7 );
				// the shore people see from the start is lusher
				const lush = 1 - THREE.MathUtils.smoothstep( Math.hypot( px + 5, pz - 508 ), 140, 420 );
				if ( h < - 0.6 && h > - 2.0 && patch > 0.7 && rng.next() < 0.012 ) colony( px, pz, rng.range( 2.5, 5 ), 0, rng.int( 60, 160 ), ( x2, z2 ) => {

					const h2 = td.heightAt( x2, z2 );
					return h2 < - 0.5 && h2 > - 2.4;

				} );
				else if ( h < 0.05 && h > - 0.5 && patch > 0.55 && fine > 0.45 && rng.next() < 0.3 ) add( 'horsetail', px, pz, rng.range( 0.8, 1.2 ), h - 0.02 );
				else if ( h > 0.25 && h < 1.2 + 0.3 * lush && rng.next() < 1.2 - h * 0.6 && patch > 0.5 - 0.25 * lush && fine > 0.4 - 0.2 * lush && rng.next() < 0.12 + 0.2 * lush ) {

					// tussocks gather in little colonies
					const m = lush > 0.3 ? rng.int( 1, 3 ) : 1;
					for ( let j = 0; j < m; j ++ ) {

						const qx = px + rng.range( - 1.2, 1.2 ) * ( j ? 1 : 0 ), qz = pz + rng.range( - 1.2, 1.2 ) * ( j ? 1 : 0 );
						add( fine > 0.7 || rng.next() < 0.2 ? 'rush' : 'sedge', qx, qz, rng.range( 0.55, 1.3 ) );

					}

				} else if ( lush > 0.2 && h > 0.05 && h < 0.35 && fine > 0.55 && rng.next() < 0.1 * lush ) add( 'horsetail', px, pz, rng.range( 0.7, 1.0 ) );

			}

		}

		this.pads = pads;
		this.flowers = flowers;

	}

	_build() {

		const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3( 0, 1, 0 );
		const compose = ( list, arr, i, t ) => {

			q.setFromAxisAngle( up, t.rot );
			mat.compose( p.set( t.x, t.y, t.z ), q, s.set( t.s, t.s, t.s ) );
			mat.toArray( arr, i * 16 );

		};

		for ( const set of Object.values( this.sets ) ) {

			set.matrices = new Float32Array( set.items.length * 16 );
			set.items.forEach( ( t, i ) => compose( set.items, set.matrices, i, t ) );
			set.meshes = set.variants.map( ( g ) => {

				const m = new THREE.InstancedMesh( g, this.material, Math.max( 1, set.items.length ) );
				m.count = 0;
				m.frustumCulled = false;
				m.castShadow = set.shadow;
				m.receiveShadow = true;
				m.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
				this.group.add( m );
				return m;

			} );

		}

		// pads and flowers: few enough to draw all the time; on the surface, so not mirrored
		this.padGeo.forEach( ( g, v ) => {

			const list = this.pads.filter( ( t ) => t.variant === v );
			const m = new THREE.InstancedMesh( g, this.material, Math.max( 1, list.length ) );
			list.forEach( ( t, i ) => {

				compose( list, m.instanceMatrix.array, i, t );

			} );
			m.count = list.length;
			m.frustumCulled = false;
			m.layers.set( 1 );
			m.name = 'lilypads';
			this.group.add( m );

		} );
		const fm = new THREE.InstancedMesh( this.flowerGeo, this.material, Math.max( 1, this.flowers.length ) );
		this.flowers.forEach( ( t, i ) => compose( this.flowers, fm.instanceMatrix.array, i, t ) );
		fm.count = this.flowers.length;
		fm.frustumCulled = false;
		fm.layers.set( 1 );
		this.group.add( fm );

	}

	counts() {

		return { sedge: this.sets.sedge.items.length, rush: this.sets.rush.items.length, horsetail: this.sets.horsetail.items.length, pads: this.pads.length, flowers: this.flowers.length };

	}

	update( camera ) {

		const cp = camera.position;
		if ( cp.distanceToSquared( this._last ) < 16 ) return;
		this._last.copy( cp );
		for ( const set of Object.values( this.sets ) ) {

			const md2 = set.maxD * set.maxD;
			const counts = set.meshes.map( () => 0 );
			for ( let i = 0; i < set.items.length; i ++ ) {

				const t = set.items[ i ];
				const dx = t.x - cp.x, dz = t.z - cp.z;
				if ( dx * dx + dz * dz > md2 ) continue;
				const m = set.meshes[ t.variant ];
				m.instanceMatrix.array.set( set.matrices.subarray( i * 16, i * 16 + 16 ), counts[ t.variant ] * 16 );
				counts[ t.variant ] ++;

			}

			set.meshes.forEach( ( m, k ) => {

				m.count = counts[ k ];
				m.instanceMatrix.clearUpdateRanges();
				m.instanceMatrix.addUpdateRange( 0, counts[ k ] * 16 );
				m.instanceMatrix.needsUpdate = true;

			} );

		}

	}

}
