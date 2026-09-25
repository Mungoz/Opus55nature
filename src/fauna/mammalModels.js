import * as THREE from 'three';
import { Sculpt, noise3 } from './sdf.js';
import { taperedTube } from './birdModels.js';
import { PartBuilder, MAT } from './creature.js';

// Mammals sculpted as signed-distance bodies, proportioned from reference
// photographs (red deer: Luc Viatour; alpine marmot: Giles Laurent; red squirrel).
// Units are metres, animals face +z, feet on y = 0.

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
const SIDES = [ [ - 1, 'L' ], [ 1, 'R' ] ];
const C = ( hex ) => new THREE.Color( hex );
const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// blend of sRGB colours with weights, plus mottling
function coatMix( base, layers, x, y, z, mottle = 0.08 ) {

	const c = C( base );
	for ( const [ hex, w ] of layers ) if ( w > 0 ) c.lerp( C( hex ), Math.min( 1, w ) );
	const n = noise3( x * 18, y * 18, z * 18 ) * 0.6 + noise3( x * 55, y * 55, z * 55 ) * 0.4;
	return c.multiplyScalar( 1 + n * mottle );

}

function eye( r, material ) {

	const b = new PartBuilder();
	b.add( new THREE.SphereGeometry( r, 12, 10 ), '#0b0806', null, 0, MAT.BILL );
	const m = new THREE.Mesh( b.build(), material );
	m.castShadow = false;
	return m;

}

// ---------------------------------------------------------------------------
// Alpine marmot, after Giles Laurent's Grand Muveran photographs and others:
// a stout, pear-shaped body under long coarse guard hairs (dark with buff and
// grey tips, so the coat looks grizzled), a broad flat-topped grey head, pale
// muzzle and cheeks, small round ears set low on the sides, short thick legs
// with dark feet, and a bushy tail that darkens to black at the tip.
// The sculpted skin sits a couple of centimetres inside the fur.
// ---------------------------------------------------------------------------
export function buildMarmot( material ) {

	const S = new Sculpt();
	S.bone( 'body', [ 0, 0.12, - 0.08 ] );
	S.bone( 'chest', [ 0, 0.13, 0.06 ], 'body' );
	S.bone( 'head', [ 0, 0.18, 0.17 ], 'chest' );
	S.bone( 'tail', [ 0, 0.13, - 0.22 ], 'body' );
	for ( const [ sd, s ] of SIDES ) {

		S.bone( 'f' + s, [ sd * 0.055, 0.1, 0.11 ], 'chest' );
		S.bone( 'h' + s, [ sd * 0.068, 0.09, - 0.11 ], 'body' );

	}

	// skin (roots) and guard-hair tips
	const root = ( x, y, z ) => coatMix( '#3a332c', [ [ '#5d4c3a', ss( 0.1, 0.05, y ) * ss( - 0.2, 0.0, z ) ] ], x, y, z, 0.2 );
	const tip = ( x, y, z ) => {

		// grizzle: buff, silver-grey and dark tips mixed in patches
		const n = noise3( x * 140, y * 140, z * 140 ) * 0.6 + noise3( x * 34, y * 34, z * 34 ) * 0.4, m = noise3( x * 17 + 4, y * 17, z * 17 );
		const c = new THREE.Color( '#a4917a' ).lerp( new THREE.Color( '#8f8b84' ), ss( - 0.2, 0.5, m ) * 0.65 ).lerp( new THREE.Color( '#4a4036' ), ss( 0.2, 0.8, n ) * 0.25 );
		// warmer, rusty belly and flanks low down; darker along the spine
		c.lerp( new THREE.Color( '#98805f' ), ss( 0.1, 0.04, y ) * 0.6 );
		c.lerp( new THREE.Color( '#5a5044' ), ss( 0.18, 0.22, y ) * 0.4 );
		return c;

	};

	const fur = ( len, extra = {} ) => ( { color: root, tip, fur: len, mat: MAT.FUR, ...extra } );
	const F = ( bone, k, o ) => ( { bone, k, ...o } );
	// heavy rump, round belly, shorter chest
	S.ellipsoid( [ 0, 0.122, - 0.1 ], [ 0.095, 0.085, 0.125 ], F( 'body', 0.06, fur( 0.03 ) ) );
	S.ellipsoid( [ 0, 0.118, 0.0 ], [ 0.088, 0.078, 0.1 ], F( 'body', 0.07, fur( 0.028 ) ) );
	S.ellipsoid( [ 0, 0.13, 0.085 ], [ 0.072, 0.072, 0.075 ], F( 'chest', 0.06, fur( 0.024 ) ) );
	S.ellipsoid( [ 0, 0.16, 0.14 ], [ 0.06, 0.058, 0.055 ], F( 'chest', 0.05, fur( 0.02 ) ) );

	// head: broad, flat-topped skull; grey crown, paler grey face, pale muzzle and cheeks
	const headRoot = ( x, y, z ) => coatMix( '#4d4943', [ [ '#8f877b', ss( 0.215, 0.24, z ) * ss( 0.2, 0.18, y ) ] ], x, y, z, 0.1 );
	const headTip = ( x, y, z ) => {

		const c = new THREE.Color( '#8c8882' );
		c.lerp( new THREE.Color( '#5b5750' ), ss( 0.205, 0.225, y ) * ss( 0.22, 0.17, z ) );
		c.lerp( new THREE.Color( '#d2c9b8' ), ss( 0.225, 0.25, z ) * ss( 0.195, 0.175, y ) );
		c.lerp( new THREE.Color( '#c7b9a0' ), ss( 0.185, 0.165, y ) * ss( 0.16, 0.2, z ) );
		return c.multiplyScalar( 1 + noise3( x * 70, y * 70, z * 70 ) * 0.12 );

	};

	const head = ( len ) => ( { color: headRoot, tip: headTip, fur: len, mat: MAT.FUR } );
	S.ellipsoid( [ 0, 0.182, 0.185 ], [ 0.058, 0.047, 0.062 ], F( 'head', 0.04, head( 0.01 ) ) );
	S.ellipsoid( [ 0, 0.2, 0.17 ], [ 0.052, 0.03, 0.05 ], F( 'head', 0.03, head( 0.009 ) ) );
	S.ellipsoid( [ 0, 0.168, 0.24 ], [ 0.034, 0.031, 0.034 ], F( 'head', 0.03, head( 0.005 ) ) );
	for ( const [ sd ] of SIDES ) S.ellipsoid( [ sd * 0.03, 0.163, 0.222 ], [ 0.029, 0.026, 0.028 ], F( 'head', 0.025, head( 0.007 ) ) );
	// nose and the dark cleft of the lip
	S.ellipsoid( [ 0, 0.173, 0.272 ], [ 0.012, 0.009, 0.008 ], F( 'head', 0.008, { color: '#25201b', mat: MAT.BILL } ) );
	S.ellipsoid( [ 0, 0.152, 0.262 ], [ 0.009, 0.008, 0.008 ], F( 'head', 0.008, { color: '#3a332c', fur: 0.002, tip: '#b8ad9c', mat: MAT.FUR } ) );
	for ( const [ sd, s ] of SIDES ) {

		// small round ears, low on the sides of the head
		S.ellipsoid( [ sd * 0.05, 0.208, 0.158 ], [ 0.017, 0.016, 0.007 ], F( 'head', 0.008, { color: '#3f3a33', tip: '#6e645a', fur: 0.004, mat: MAT.FUR } ), Sculpt.frame( [ 0, 1, 0 ], [ sd, 0.1, 0.4 ] ) );
		// short, thick forelegs; dark feet with pale claws
		S.cone( [ sd * 0.052, 0.11, 0.1 ], [ sd * 0.055, 0.02, 0.122 ], 0.027, 0.019, F( 'f' + s, 0.03, { color: '#3b3128', tip: '#7e6549', fur: 0.012, mat: MAT.FUR } ) );
		S.ellipsoid( [ sd * 0.056, 0.01, 0.137 ], [ 0.019, 0.01, 0.027 ], F( 'f' + s, 0.01, { color: ( x, y, z ) => ( z > 0.158 ? '#9a8f80' : '#2b241d' ), fur: 0.002, tip: '#3d342b', mat: MAT.FUR } ) );
		// haunches and long flat hind feet
		S.ellipsoid( [ sd * 0.068, 0.09, - 0.12 ], [ 0.044, 0.058, 0.064 ], F( 'h' + s, 0.04, fur( 0.026 ) ) );
		S.ellipsoid( [ sd * 0.068, 0.011, - 0.07 ], [ 0.02, 0.011, 0.048 ], F( 'h' + s, 0.012, { color: ( x, y, z ) => ( z > - 0.028 ? '#9a8f80' : '#2b241d' ), fur: 0.002, tip: '#3d342b', mat: MAT.FUR } ) );

	}

	// the tail: a thin core under long hair, darkening to a black tip
	const tailTip = ( x, y, z ) => new THREE.Color( '#4a3a2c' ).lerp( new THREE.Color( '#16110d' ), ss( - 0.26, - 0.33, z ) );
	S.cone( [ 0, 0.14, - 0.2 ], [ 0, 0.118, - 0.33 ], 0.024, 0.016, F( 'tail', 0.03, { color: '#2a221b', tip: tailTip, fur: 0.032, mat: MAT.FUR, comb: [ 0, 0.1, - 0.9 ] } ) );

	const { mesh, bones } = S.mesh( material, 0.0075 );
	for ( const [ sd ] of SIDES ) {

		const e = eye( 0.0095, material );
		e.position.set( sd * 0.046, 0.2 - 0.18, 0.214 - 0.17 );
		bones.get( 'head' ).add( e );

	}

	return { mesh, bones, fur: { density: 230 } };

}

// ---------------------------------------------------------------------------
// Red squirrel, after photographs of feeding and alert squirrels: a slim rust-red
// body with a clean white chest and belly, a rounded head with large dark eyes in
// pale rings, tall ears ending in dark tufts, long hind feet, and a plume of a
// tail as long as the body, the hairs splayed out to the sides.
// ---------------------------------------------------------------------------
export function buildSquirrel( material ) {

	const S = new Sculpt();
	S.bone( 'body', [ 0, 0.06, - 0.02 ] );
	S.bone( 'chest', [ 0, 0.07, 0.04 ], 'body' );
	S.bone( 'head', [ 0, 0.1, 0.09 ], 'chest' );
	S.bone( 'tail1', [ 0, 0.07, - 0.085 ], 'body' );
	S.bone( 'tail2', [ 0, 0.12, - 0.14 ], 'tail1' );
	S.bone( 'tail3', [ 0, 0.2, - 0.14 ], 'tail2' );
	for ( const [ sd, s ] of SIDES ) {

		S.bone( 'f' + s, [ sd * 0.019, 0.06, 0.07 ], 'chest' );
		S.bone( 'h' + s, [ sd * 0.028, 0.05, - 0.035 ], 'body' );

	}

	const white = ( x, y, z ) => ss( 0.058, 0.048, y ) * ss( - 0.04, - 0.01, z ) * ss( 0.028, 0.018, Math.abs( x ) );
	const root = ( x, y, z ) => new THREE.Color( '#7a4424' ).lerp( new THREE.Color( '#d8cdbd' ), white( x, y, z ) );
	const tip = ( x, y, z ) => {

		const n = noise3( x * 90, y * 90, z * 90 );
		const c = new THREE.Color( '#c47a42' ).lerp( new THREE.Color( '#8f6446' ), ss( 0.2, 0.7, n ) * 0.5 );
		c.lerp( new THREE.Color( '#a45a30' ), ss( 0.085, 0.1, y ) * 0.35 );
		return c.lerp( new THREE.Color( '#f3ece0' ), white( x, y, z ) );

	};

	const fur = ( len ) => ( { color: root, tip, fur: len, mat: MAT.FUR } );
	const F = ( bone, k, o ) => ( { bone, k, ...o } );
	S.ellipsoid( [ 0, 0.062, - 0.035 ], [ 0.034, 0.038, 0.052 ], F( 'body', 0.025, fur( 0.012 ) ) );
	S.ellipsoid( [ 0, 0.068, 0.03 ], [ 0.027, 0.031, 0.04 ], F( 'chest', 0.025, fur( 0.01 ) ) );
	// head: round crown, big eyes in pale rings, short muzzle
	const eyeC = [ 0.021, 0.106, 0.103 ];
	const ring = ( x, y, z ) => ss( 0.011, 0.007, Math.hypot( Math.abs( x ) - eyeC[ 0 ], y - eyeC[ 1 ], z - eyeC[ 2 ] ) );
	const headTip = ( x, y, z ) => new THREE.Color( '#c27640' ).lerp( new THREE.Color( '#e8d6bd' ), ring( x, y, z ) * 0.9 ).lerp( new THREE.Color( '#f0e6d6' ), ss( 0.088, 0.08, y ) * ss( 0.1, 0.12, z ) );
	const head = ( len ) => ( { color: '#7a4424', tip: headTip, fur: len, mat: MAT.FUR } );
	S.ellipsoid( [ 0, 0.1, 0.092 ], [ 0.024, 0.025, 0.03 ], F( 'head', 0.015, head( 0.006 ) ) );
	S.ellipsoid( [ 0, 0.093, 0.12 ], [ 0.014, 0.014, 0.018 ], F( 'head', 0.012, head( 0.004 ) ) );
	S.ellipsoid( [ 0, 0.094, 0.137 ], [ 0.006, 0.005, 0.004 ], F( 'head', 0.004, { color: '#3a2620', mat: MAT.BILL } ) );
	for ( const [ sd, s ] of SIDES ) {

		// tall ears with long dark tufts
		S.cone( [ sd * 0.014, 0.116, 0.086 ], [ sd * 0.018, 0.146, 0.08 ], 0.008, 0.003, F( 'head', 0.006, { color: '#5a2a16', tip: ( x, y ) => ( y > 0.135 ? '#4a2414' : '#b3602f' ), fur: ( x, y ) => 0.003 + 0.02 * ss( 0.13, 0.146, y ), comb: [ 0, 1, - 0.2 ], mat: MAT.FUR } ) );
		S.cone( [ sd * 0.019, 0.06, 0.07 ], [ sd * 0.017, 0.012, 0.084 ], 0.0085, 0.006, F( 'f' + s, 0.01, fur( 0.005 ) ) );
		S.ellipsoid( [ sd * 0.028, 0.045, - 0.035 ], [ 0.017, 0.027, 0.031 ], F( 'h' + s, 0.014, fur( 0.009 ) ) );
		S.ellipsoid( [ sd * 0.028, 0.008, 0.0 ], [ 0.009, 0.007, 0.03 ], F( 'h' + s, 0.008, { color: '#5c2c17', tip: '#a8572b', fur: 0.003, mat: MAT.FUR } ) );

	}

	// the plume: a thin curling core under long hair that splays out sideways
	const tailTip = ( x, y, z ) => new THREE.Color( '#c47a42' ).lerp( new THREE.Color( '#86502e' ), ss( 0.3, 0.8, noise3( x * 40, y * 40, z * 40 ) ) * 0.5 ).lerp( new THREE.Color( '#dcae82' ), ss( 0.18, 0.26, y ) * 0.45 );
	const tailO = { color: '#6a3a1f', tip: tailTip, fur: 0.042, mat: MAT.FUR, comb: ( x ) => [ Math.sign( x || 1 ) * 0.9, 0, 0 ] };
	const T = [ [ 0, 0.068, - 0.085 ], [ 0, 0.1, - 0.13 ], [ 0, 0.155, - 0.15 ], [ 0, 0.205, - 0.138 ], [ 0, 0.238, - 0.105 ], [ 0, 0.245, - 0.075 ] ];
	const tb = [ 'tail1', 'tail2', 'tail2', 'tail3', 'tail3' ];
	for ( let i = 0; i < T.length - 1; i ++ ) S.cone( T[ i ], T[ i + 1 ], 0.017 - i * 0.0016, 0.0152 - i * 0.0016, F( tb[ i ], 0.014, { ...tailO, fur: 0.024 + 0.007 * Math.sin( i / 4 * Math.PI ) } ) );

	const { mesh, bones } = S.mesh( material, 0.004 );
	for ( const [ sd ] of SIDES ) {

		const e = eye( 0.0072, material );
		e.position.set( sd * eyeC[ 0 ], eyeC[ 1 ] - 0.1, eyeC[ 2 ] - 0.09 );
		bones.get( 'head' ).add( e );

	}

	return { mesh, bones, fur: { density: 520 } };

}

// ---------------------------------------------------------------------------
// Mountain hare in its autumn coat, after photographs from Oppdal and the Alps:
// greyish-brown and grizzled, a pale grey belly, a pale ring round a large dark eye,
// ears shorter than a brown hare's with black tips, big hind feet, a white scut.
// Rest pose: crouched, hind legs folded under, forefeet together.
// ---------------------------------------------------------------------------
export function buildHare( material ) {

	const S = new Sculpt();
	S.bone( 'body', [ 0, 0.14, - 0.08 ] );
	S.bone( 'chest', [ 0, 0.15, 0.06 ], 'body' );
	S.bone( 'head', [ 0, 0.23, 0.15 ], 'chest' );
	S.bone( 'earL', [ - 0.022, 0.28, 0.13 ], 'head' );
	S.bone( 'earR', [ 0.022, 0.28, 0.13 ], 'head' );
	S.bone( 'tail', [ 0, 0.13, - 0.21 ], 'body' );
	for ( const [ sd, s ] of SIDES ) {

		S.bone( 'f' + s, [ sd * 0.033, 0.13, 0.11 ], 'chest' );
		S.bone( 'h' + s, [ sd * 0.058, 0.13, - 0.1 ], 'body' );

	}

	const belly = ( x, y, z ) => ss( 0.1, 0.06, y ) * ss( - 0.16, - 0.05, z ) * ( 1 - ss( 0.1, 0.16, z ) );
	const root = ( x, y, z ) => new THREE.Color( '#6a5a48' ).lerp( new THREE.Color( '#b9b2a6' ), belly( x, y, z ) );
	const tip = ( x, y, z ) => {

		const n = noise3( x * 120, y * 120, z * 120 ) * 0.6 + noise3( x * 30, y * 30, z * 30 ) * 0.4;
		const c = new THREE.Color( '#a8977f' ).lerp( new THREE.Color( '#b08d66' ), ss( 0.1, 0.18, y ) * 0.5 ).lerp( new THREE.Color( '#b8b2a8' ), ss( - 0.2, 0.6, n ) * 0.5 );
		c.lerp( new THREE.Color( '#4f4336' ), ss( 0.3, 0.8, noise3( x * 220, y * 220, z * 220 ) ) * 0.3 );
		return c.lerp( new THREE.Color( '#dcd6cb' ), belly( x, y, z ) );

	};

	const fur = ( len ) => ( { color: root, tip, fur: len, mat: MAT.FUR } );
	const F = ( bone, k, o ) => ( { bone, k, ...o } );
	// compact rounded body, deepest over the haunches
	S.ellipsoid( [ 0, 0.14, - 0.1 ], [ 0.078, 0.095, 0.115 ], F( 'body', 0.05, fur( 0.02 ) ) );
	S.ellipsoid( [ 0, 0.145, 0.03 ], [ 0.066, 0.085, 0.1 ], F( 'chest', 0.05, fur( 0.018 ) ) );
	S.ellipsoid( [ 0, 0.18, 0.1 ], [ 0.045, 0.055, 0.055 ], F( 'chest', 0.04, fur( 0.014 ) ) );
	// head: domed, a blunt muzzle, pale eye ring and chin
	const eyeC = [ 0.036, 0.245, 0.178 ];
	const headTip = ( x, y, z ) => {

		const ring = ss( 0.016, 0.009, Math.hypot( Math.abs( x ) - eyeC[ 0 ], y - eyeC[ 1 ], z - eyeC[ 2 ] ) );
		return new THREE.Color( '#8e7c64' ).lerp( new THREE.Color( '#a07d58' ), ss( 0.21, 0.19, z ) * 0.4 ).lerp( new THREE.Color( '#ddd5c6' ), Math.max( ring * 0.85, ss( 0.215, 0.2, y ) * ss( 0.2, 0.23, z ) ) );

	};

	const head = ( len ) => ( { color: '#5a4a3b', tip: headTip, fur: len, mat: MAT.FUR } );
	S.ellipsoid( [ 0, 0.24, 0.165 ], [ 0.042, 0.046, 0.058 ], F( 'head', 0.03, head( 0.008 ) ) );
	S.ellipsoid( [ 0, 0.226, 0.21 ], [ 0.026, 0.028, 0.03 ], F( 'head', 0.025, head( 0.005 ) ) );
	S.ellipsoid( [ 0, 0.229, 0.238 ], [ 0.007, 0.005, 0.004 ], F( 'head', 0.005, { color: '#4a3530', mat: MAT.BILL } ) );
	for ( const [ sd, s ] of SIDES ) {

		// ears: long ovals laid back a little, dark tips, the pale fringe of the inner edge
		const base = V( sd * 0.022, 0.278, 0.135 );
		const dir = V( sd * 0.35, 0.9, - 0.45 ).normalize();
		const inner = V( sd, 0, 0.35 ).normalize();
		const earTip = ( x, y, z ) => {

			const q = V( x, y, z ).sub( base );
			const t = q.dot( dir ) / 0.09;
			if ( t > 0.82 ) return '#171310';
			return new THREE.Color( '#8a7a66' ).lerp( new THREE.Color( '#d8d0c2' ), ss( 0.004, 0.0075, Math.abs( q.dot( inner ) ) ) * 0.5 );

		};

		S.ellipsoid( base.clone().addScaledVector( dir, 0.045 ), [ 0.021, 0.047, 0.006 ], F( 'ear' + s, 0.006, { color: '#4d4034', tip: earTip, fur: 0.003, comb: [ 0, 1, 0 ], mat: MAT.FUR } ), Sculpt.frame( dir, [ sd * 0.8, 0, 0.6 ] ) );
		// slim forelegs and feet
		S.cone( [ sd * 0.03, 0.13, 0.1 ], [ sd * 0.03, 0.012, 0.135 ], 0.015, 0.01, F( 'f' + s, 0.012, { color: root, tip: '#a09482', fur: 0.006, comb: [ 0, - 1, 0 ], mat: MAT.FUR } ) );
		S.ellipsoid( [ sd * 0.03, 0.008, 0.15 ], [ 0.011, 0.008, 0.022 ], F( 'f' + s, 0.008, { color: '#8a7f70', tip: '#c9c0b0', fur: 0.004, mat: MAT.FUR } ) );
		// haunches folded, and the long hind feet flat on the ground
		S.ellipsoid( [ sd * 0.055, 0.11, - 0.1 ], [ 0.036, 0.07, 0.085 ], F( 'h' + s, 0.035, fur( 0.02 ) ) );
		S.ellipsoid( [ sd * 0.05, 0.014, - 0.04 ], [ 0.018, 0.013, 0.075 ], F( 'h' + s, 0.012, { color: '#7d7263', tip: '#c9c0b0', fur: 0.006, mat: MAT.FUR } ) );

	}

	S.ellipsoid( [ 0, 0.135, - 0.215 ], [ 0.022, 0.024, 0.018 ], F( 'tail', 0.015, { color: '#d9d4ca', tip: '#f2efe8', fur: 0.018, mat: MAT.FUR } ) );
	const { mesh, bones } = S.mesh( material, 0.0055 );
	for ( const [ sd ] of SIDES ) {

		const e = eye( 0.0095, material );
		e.position.set( sd * eyeC[ 0 ], eyeC[ 1 ] - 0.23, eyeC[ 2 ] - 0.15 );
		bones.get( 'head' ).add( e );

	}

	return { mesh, bones, fur: { density: 300 } };

}

// ---------------------------------------------------------------------------
// Eurasian brown bear (a female, ~1.9 m long, ~1 m at the shoulder), after photographs
// from Slovenia and Finland: a heavy body with the shoulder hump standing above the
// line of the back, the head carried low; a broad, slightly dished face, small round
// furry ears, a pale muzzle and dark nose; massive forelegs, plantigrade hind feet.
// A long shaggy coat, dark at the roots and on the legs, grizzled paler at the tips
// over the hump, shoulders and flanks.
// ---------------------------------------------------------------------------
export function buildBear( material ) {

	const S = new Sculpt();
	S.bone( 'body', [ 0, 0.8, - 0.1 ] );
	S.bone( 'chest', [ 0, 0.82, 0.3 ], 'body' );
	S.bone( 'neck', [ 0, 0.86, 0.52 ], 'chest' );
	S.bone( 'head', [ 0, 0.8, 0.74 ], 'neck' );
	S.bone( 'tail', [ 0, 0.8, - 0.72 ], 'body' );
	const J = {};
	for ( const [ sd, s ] of SIDES ) {

		J[ 'fS' + s ] = V( sd * 0.19, 0.86, 0.34 );
		J[ 'fE' + s ] = V( sd * 0.18, 0.46, 0.3 );
		J[ 'fF' + s ] = V( sd * 0.17, 0.1, 0.36 );
		J[ 'hH' + s ] = V( sd * 0.2, 0.78, - 0.5 );
		J[ 'hK' + s ] = V( sd * 0.2, 0.44, - 0.46 );
		J[ 'hF' + s ] = V( sd * 0.18, 0.12, - 0.62 );
		S.bone( 'fS' + s, J[ 'fS' + s ], 'chest' );
		S.bone( 'fE' + s, J[ 'fE' + s ], 'fS' + s );
		S.bone( 'fF' + s, J[ 'fF' + s ], 'fE' + s );
		S.bone( 'hH' + s, J[ 'hH' + s ], 'body' );
		S.bone( 'hK' + s, J[ 'hK' + s ], 'hH' + s );
		S.bone( 'hF' + s, J[ 'hF' + s ], 'hK' + s );

	}

	const root = ( x, y, z ) => coatMix( '#4a3a2c', [ [ '#33271d', ss( 0.5, 0.2, y ) ] ], x, y, z, 0.1 );
	const tip = ( x, y, z ) => {

		const n = noise3( x * 18, y * 18, z * 18 ) * 0.6 + noise3( x * 55, y * 55, z * 55 ) * 0.4;
		const c = new THREE.Color( '#86684c' ).lerp( new THREE.Color( '#6b5039' ), ss( - 0.3, 0.5, n ) * 0.6 );
		// grizzled paler tips over the hump and shoulders, darker legs and belly
		c.lerp( new THREE.Color( '#b9a283' ), ss( 0.85, 1.15, y ) * ss( - 0.2, 0.3, z ) * ( 0.55 + 0.35 * n ) );
		c.lerp( new THREE.Color( '#4a3423' ), ss( 0.5, 0.25, y ) * 0.8 );
		return c;

	};

	const fur = ( len, comb ) => ( { color: root, tip, fur: len, comb, mat: MAT.FUR } );
	const F = ( bone, k, o ) => ( { bone, k, ...o } );
	// barrel of a body, the rump a little lower than the hump
	S.ellipsoid( [ 0, 0.78, - 0.45 ], [ 0.29, 0.31, 0.33 ], F( 'body', 0.18, fur( 0.07 ) ) );
	S.ellipsoid( [ 0, 0.74, - 0.06 ], [ 0.31, 0.33, 0.42 ], F( 'body', 0.2, fur( 0.075 ) ) );
	S.ellipsoid( [ 0, 0.74, 0.3 ], [ 0.27, 0.31, 0.24 ], F( 'chest', 0.16, fur( 0.07 ) ) );
	S.ellipsoid( [ 0, 0.97, 0.24 ], [ 0.22, 0.17, 0.25 ], F( 'chest', 0.14, fur( 0.09, [ 0, - 0.6, - 0.6 ] ) ) );
	// thick neck, head held low and forward
	S.cone( [ 0, 0.86, 0.45 ], [ 0, 0.82, 0.68 ], 0.22, 0.17, F( 'neck', 0.12, fur( 0.07, [ 0, - 0.5, - 0.8 ] ) ) );
	const face = ( x, y, z ) => new THREE.Color( '#8a6e52' ).lerp( new THREE.Color( '#a88d6e' ), ss( 0.86, 0.96, z ) * 0.8 ).lerp( new THREE.Color( '#5a412c' ), ss( 0.08, 0.14, Math.abs( x ) ) * ss( 0.86, 0.8, z ) * 0.5 );
	const headO = ( len ) => ( { color: '#5a412c', tip: face, fur: len, comb: [ 0, 0.2, - 1 ], mat: MAT.FUR } );
	// broad skull with full cheeks, the forehead rising steeply above a longish muzzle
	S.ellipsoid( [ 0, 0.84, 0.78 ], [ 0.185, 0.165, 0.175 ], F( 'head', 0.09, headO( 0.04 ) ) );
	for ( const [ sd ] of SIDES ) S.ellipsoid( [ sd * 0.1, 0.78, 0.8 ], [ 0.1, 0.1, 0.11 ], F( 'head', 0.07, headO( 0.045 ) ) );
	S.cone( [ 0, 0.8, 0.88 ], [ 0, 0.745, 1.07 ], 0.1, 0.066, F( 'head', 0.06, headO( 0.012 ) ) );
	S.ellipsoid( [ 0, 0.752, 1.085 ], [ 0.05, 0.036, 0.03 ], F( 'head', 0.015, { color: '#15110e', mat: MAT.BILL } ) );
	for ( const [ sd, s ] of SIDES ) {

		// small round ears, furred
		S.ellipsoid( [ sd * 0.13, 0.99, 0.73 ], [ 0.065, 0.062, 0.026 ], F( 'head', 0.02, { color: '#2e2117', tip: '#6a4d33', fur: 0.03, mat: MAT.FUR } ), Sculpt.frame( [ sd * 0.3, 1, 0 ], [ 0, 0.1, 1 ] ) );
		// massive forelegs
		S.cone( J[ 'fS' + s ], J[ 'fE' + s ], 0.135, 0.105, F( 'fS' + s, 0.1, fur( 0.06, [ 0, - 1, 0 ] ) ) );
		S.cone( J[ 'fE' + s ], J[ 'fF' + s ], 0.105, 0.085, F( 'fE' + s, 0.06, fur( 0.05, [ 0, - 1, 0 ] ) ) );
		S.ellipsoid( J[ 'fF' + s ].clone().add( V( 0, - 0.05, 0.07 ) ), [ 0.085, 0.05, 0.13 ], F( 'fF' + s, 0.04, { color: '#221810', tip: '#3a2a1d', fur: 0.025, mat: MAT.FUR } ) );
		// hind legs: heavy thighs, long plantigrade feet
		S.ellipsoid( [ sd * 0.19, 0.66, - 0.5 ], [ 0.13, 0.24, 0.2 ], F( 'hH' + s, 0.1, fur( 0.065, [ 0, - 1, 0 ] ) ) );
		S.cone( J[ 'hK' + s ], J[ 'hF' + s ], 0.11, 0.085, F( 'hK' + s, 0.06, fur( 0.05, [ 0, - 1, 0 ] ) ) );
		S.ellipsoid( J[ 'hF' + s ].clone().add( V( 0, - 0.07, 0.12 ) ), [ 0.08, 0.05, 0.17 ], F( 'hF' + s, 0.04, { color: '#221810', tip: '#3a2a1d', fur: 0.025, mat: MAT.FUR } ) );
		// pale claws
		for ( let c = - 2; c <= 2; c ++ ) {

			const cx = J[ 'fF' + s ].x + c * 0.03, cz = J[ 'fF' + s ].z + 0.19;
			S.cone( [ cx, 0.05, cz ], [ cx, 0.015, cz + 0.05 ], 0.011, 0.004, F( 'fF' + s, 0.006, { color: '#b8ad9a', mat: MAT.BILL } ) );

		}

	}

	S.ellipsoid( [ 0, 0.8, - 0.76 ], [ 0.05, 0.05, 0.04 ], F( 'tail', 0.04, fur( 0.05 ) ) );
	const { mesh, bones } = S.mesh( material, 0.024 );
	for ( const [ sd ] of SIDES ) {

		const e = eye( 0.012, material );
		e.position.set( sd * 0.085, 0.885 - 0.8, 0.905 - 0.74 );
		bones.get( 'head' ).add( e );

	}

	return { mesh, bones, fur: { density: 70 } };

}
