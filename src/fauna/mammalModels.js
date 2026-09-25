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
		const n = noise3( x * 60, y * 60, z * 60 ), m = noise3( x * 17 + 4, y * 17, z * 17 );
		const c = new THREE.Color( '#a4917a' ).lerp( new THREE.Color( '#8f8b84' ), ss( - 0.2, 0.5, m ) * 0.65 ).lerp( new THREE.Color( '#4a4036' ), ss( 0.3, 0.75, n ) * 0.35 );
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
