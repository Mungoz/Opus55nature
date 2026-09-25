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
// Alpine marmot: pear-shaped, broad flat head, short limbs, bushy dark-tipped tail.
// ---------------------------------------------------------------------------
export function buildMarmot( material ) {

	const S = new Sculpt();
	S.bone( 'body', [ 0, 0.12, - 0.08 ] );
	S.bone( 'chest', [ 0, 0.13, 0.05 ], 'body' );
	S.bone( 'head', [ 0, 0.19, 0.16 ], 'chest' );
	S.bone( 'tail', [ 0, 0.12, - 0.2 ], 'body' );
	for ( const [ sd, s ] of SIDES ) {

		S.bone( 'f' + s, [ sd * 0.06, 0.1, 0.13 ], 'chest' );
		S.bone( 'h' + s, [ sd * 0.07, 0.09, - 0.1 ], 'body' );

	}

	// grizzled grey-brown back over a sandy belly (from the reference photo)
	const fur = ( x, y, z ) => coatMix( '#7d6c57', [ [ '#a99373', ss( 0.11, 0.07, y ) + ss( 0.08, 0.16, z ) * ss( 0.14, 0.1, y ) ], [ '#5d4f40', ss( 0.17, 0.23, y ) ] ], x, y, z, 0.18 );

	const F = ( bone, color, k, fuzz = 0.0015 ) => ( { bone, color, k, fuzz, fuzzFreq: 45 } );
	// heavy pear-shaped rump, shorter chest, broad head carried up
	S.ellipsoid( [ 0, 0.14, - 0.08 ], [ 0.12, 0.115, 0.13 ], F( 'body', fur, 0.07 ) );
	S.ellipsoid( [ 0, 0.15, 0.05 ], [ 0.095, 0.1, 0.1 ], F( 'chest', fur, 0.08 ) );
	S.ellipsoid( [ 0, 0.18, 0.13 ], [ 0.07, 0.07, 0.06 ], F( 'chest', fur, 0.06 ) );
	// dark crown and brow, pale muzzle and cheeks below the eyes
	const headCol = ( x, y, z ) => coatMix( '#6b5a48', [ [ '#b8a888', ss( 0.268, 0.285, z ) * ss( 0.21, 0.195, y ) + ss( 0.185, 0.17, y ) * ss( 0.225, 0.25, z ) ], [ '#3a3027', ss( 0.212, 0.232, y ) + ss( 0.02, 0.0, Math.abs( x ) ) * ss( 0.2, 0.21, y ) * ss( 0.22, 0.26, z ) ] ], x, y, z, 0.1 );
	// flat-topped, broad skull; short blunt muzzle with pale cheeks and a dark nose
	S.ellipsoid( [ 0, 0.205, 0.2 ], [ 0.072, 0.056, 0.07 ], F( 'head', headCol, 0.04, 0.001 ) );
	S.ellipsoid( [ 0, 0.19, 0.255 ], [ 0.046, 0.04, 0.04 ], F( 'head', headCol, 0.03, 0.001 ) );
	S.ellipsoid( [ 0, 0.196, 0.292 ], [ 0.014, 0.011, 0.008 ], F( 'head', '#1c1612', 0.01, 0 ) );
	for ( const [ sd, s ] of SIDES ) {

		S.ellipsoid( [ sd * 0.034, 0.182, 0.235 ], [ 0.034, 0.03, 0.032 ], F( 'head', headCol, 0.03, 0.001 ) );
		S.ellipsoid( [ sd * 0.058, 0.245, 0.18 ], [ 0.019, 0.016, 0.009 ], F( 'head', '#3a3027', 0.012, 0 ), Sculpt.frame( [ 0, 1, 0 ], [ sd * 0.3, 0, 1 ] ) );
		// stout forelegs with dark paws
		S.cone( [ sd * 0.058, 0.13, 0.1 ], [ sd * 0.06, 0.018, 0.125 ], 0.034, 0.024, F( 'f' + s, '#6b5a47', 0.035 ) );
		S.ellipsoid( [ sd * 0.06, 0.012, 0.14 ], [ 0.022, 0.012, 0.03 ], F( 'f' + s, '#3a3128', 0.012, 0 ) );
		// big haunches, feet flat
		S.ellipsoid( [ sd * 0.078, 0.095, - 0.1 ], [ 0.05, 0.07, 0.075 ], F( 'h' + s, fur, 0.05 ) );
		S.ellipsoid( [ sd * 0.074, 0.013, - 0.055 ], [ 0.024, 0.013, 0.055 ], F( 'h' + s, '#3a3128', 0.015, 0 ) );

	}

	S.cone( [ 0, 0.15, - 0.2 ], [ 0, 0.1, - 0.33 ], 0.042, 0.03, F( 'tail', ( x, y, z ) => coatMix( '#5e4f3e', [ [ '#221b15', ss( - 0.27, - 0.31, z ) ] ], x, y, z, 0.1 ), 0.04, 0.004 ) );
	const { mesh, bones } = S.mesh( material, 0.0085 );
	for ( const [ sd ] of SIDES ) {

		const e = eye( 0.0105, material );
		e.position.set( sd * 0.048, 0.22 - 0.19, 0.235 - 0.16 );
		bones.get( 'head' ).add( e );

	}

	return { mesh, bones };

}

// ---------------------------------------------------------------------------
// Red squirrel: rusty coat, white belly, tufted ears, a tail as big as the body.
// ---------------------------------------------------------------------------
export function buildSquirrel( material ) {

	const S = new Sculpt();
	S.bone( 'body', [ 0, 0.06, - 0.02 ] );
	S.bone( 'chest', [ 0, 0.07, 0.04 ], 'body' );
	S.bone( 'head', [ 0, 0.1, 0.09 ], 'chest' );
	S.bone( 'tail1', [ 0, 0.07, - 0.08 ], 'body' );
	S.bone( 'tail2', [ 0, 0.12, - 0.13 ], 'tail1' );
	S.bone( 'tail3', [ 0, 0.2, - 0.12 ], 'tail2' );
	for ( const [ sd, s ] of SIDES ) {

		S.bone( 'f' + s, [ sd * 0.02, 0.06, 0.07 ], 'chest' );
		S.bone( 'h' + s, [ sd * 0.03, 0.05, - 0.03 ], 'body' );

	}

	const rust = '#b0623a';
	const coat = ( x, y, z ) => ( y < 0.06 && z > 0.0 && Math.abs( x ) < 0.028 ? '#efe5d4' : rust );
	S.ellipsoid( [ 0, 0.058, - 0.03 ], [ 0.04, 0.043, 0.054 ], { bone: 'body', color: coat, k: 0.025 } );
	S.ellipsoid( [ 0, 0.068, 0.035 ], [ 0.031, 0.035, 0.045 ], { bone: 'chest', color: coat, k: 0.025 } );
	S.ellipsoid( [ 0, 0.098, 0.095 ], [ 0.027, 0.028, 0.033 ], { bone: 'head', color: rust, k: 0.015 } );
	S.ellipsoid( [ 0, 0.092, 0.125 ], [ 0.015, 0.015, 0.02 ], { bone: 'head', color: ( x, y, z ) => ( z > 0.14 ? '#3a2418' : rust ), k: 0.012 } );
	for ( const [ sd, s ] of SIDES ) {

		// ears end in dark tufts
		S.cone( [ sd * 0.015, 0.118, 0.088 ], [ sd * 0.02, 0.152, 0.083 ], 0.009, 0.0025, { bone: 'head', color: ( x, y ) => ( y > 0.138 ? '#5a2a16' : rust ), k: 0.008 } );
		S.cone( [ sd * 0.02, 0.06, 0.07 ], [ sd * 0.018, 0.013, 0.085 ], 0.009, 0.006, { bone: 'f' + s, color: rust, k: 0.012 } );
		S.ellipsoid( [ sd * 0.03, 0.045, - 0.035 ], [ 0.019, 0.03, 0.034 ], { bone: 'h' + s, color: rust, k: 0.015 } );
		S.ellipsoid( [ sd * 0.03, 0.011, 0.0 ], [ 0.011, 0.009, 0.03 ], { bone: 'h' + s, color: '#8a4424', k: 0.01 } );

	}

	// the plume: a curling chain of fluffy masses
	const tail = ( bone, c, r, dir ) => S.ellipsoid( c, r.map( ( v ) => v * 0.85 ), { bone, color: ( x, y, z ) => coatMix( '#9a5530', [ [ '#c08a5e', Math.max( 0, y - 0.15 ) * 4 ] ], x, y, z, 0.12 ), k: 0.035, fuzz: 0.003, fuzzFreq: 40 }, dir ? Sculpt.frame( dir, Math.abs( dir[ 2 ] ) > 0.7 ? [ 0, 1, 0 ] : [ 0, 0, 1 ] ) : null );
	// a plume: flattened side to side, broad in profile
	tail( 'tail1', [ 0, 0.072, - 0.09 ], [ 0.018, 0.022, 0.03 ] );
	tail( 'tail2', [ 0, 0.13, - 0.14 ], [ 0.024, 0.05, 0.05 ], [ 0, 1, - 0.25 ] );
	tail( 'tail3', [ 0, 0.205, - 0.13 ], [ 0.026, 0.05, 0.055 ], [ 0, 1, 0.3 ] );
	tail( 'tail3', [ 0, 0.25, - 0.085 ], [ 0.022, 0.04, 0.035 ], [ 0, 0.4, 1 ] );
	const { mesh, bones } = S.mesh( material, 0.0045 );
	for ( const [ sd ] of SIDES ) {

		const e = eye( 0.0068, material );
		e.position.set( sd * 0.022, 0.106 - 0.1, 0.107 - 0.09 );
		bones.get( 'head' ).add( e );

	}

	return { mesh, bones };

}
