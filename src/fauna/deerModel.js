import * as THREE from 'three';
import { Sculpt, noise3 } from './sdf.js';
import { taperedTube } from './birdModels.js';
import { PartBuilder, MAT } from './creature.js';

// Red deer sculpted from reference photographs (Luc Viatour's stag; Scottish
// hinds): deep barrel chest, tucked flank, pale rump patch, neck carried
// forward at ~45 degrees, long face with a blunt dark muzzle, big ears.
// Stag: dark maned neck and a 12-point rack. Metres, facing +z, feet on y = 0.

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
const SIDES = [ [ - 1, 'L' ], [ 1, 'R' ] ];
const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

export function coatMix( base, layers, x, y, z, mottle = 0.08 ) {

	const c = new THREE.Color( base );
	for ( const [ hex, w ] of layers ) if ( w > 0 ) c.lerp( new THREE.Color( hex ), Math.min( 1, w ) );
	const n = noise3( x * 18, y * 18, z * 18 ) * 0.6 + noise3( x * 55, y * 55, z * 55 ) * 0.4;
	return c.multiplyScalar( 1 + n * mottle );

}

export function eyeMesh( r, material ) {

	const b = new PartBuilder();
	b.add( new THREE.SphereGeometry( r, 12, 10 ), '#0b0806', null, 0, MAT.BILL );
	return new THREE.Mesh( b.build(), material );

}

export function buildDeer( stag, material ) {

	const S = new Sculpt();
	// joints, proportioned for a 1.2 m (withers) stag in an alert stance
	S.bone( 'body', [ 0, 0.95, 0 ] );
	S.bone( 'neck1', [ 0, 1.02, 0.42 ], 'body' );
	S.bone( 'neck2', [ 0, 1.24, 0.64 ], 'neck1' );
	S.bone( 'head', [ 0, 1.46, 0.8 ], 'neck2' );
	S.bone( 'earL', [ - 0.07, 1.57, 0.8 ], 'head' );
	S.bone( 'earR', [ 0.07, 1.57, 0.8 ], 'head' );
	S.bone( 'tail', [ 0, 1.05, - 0.7 ], 'body' );
	const J = {};
	for ( const [ sd, s ] of SIDES ) {

		J[ 'fS' + s ] = V( sd * 0.125, 0.95, 0.38 );
		J[ 'fE' + s ] = V( sd * 0.12, 0.67, 0.32 );
		J[ 'fK' + s ] = V( sd * 0.11, 0.36, 0.34 );
		J[ 'fF' + s ] = V( sd * 0.105, 0.09, 0.35 );
		J[ 'hH' + s ] = V( sd * 0.125, 0.98, - 0.46 );
		J[ 'hS' + s ] = V( sd * 0.135, 0.66, - 0.34 );
		J[ 'hC' + s ] = V( sd * 0.11, 0.44, - 0.6 );
		J[ 'hF' + s ] = V( sd * 0.105, 0.09, - 0.56 );
		S.bone( 'fS' + s, J[ 'fS' + s ], 'body' );
		S.bone( 'fE' + s, J[ 'fE' + s ], 'fS' + s );
		S.bone( 'fK' + s, J[ 'fK' + s ], 'fE' + s );
		S.bone( 'fF' + s, J[ 'fF' + s ], 'fK' + s );
		S.bone( 'hH' + s, J[ 'hH' + s ], 'body' );
		S.bone( 'hS' + s, J[ 'hS' + s ], 'hH' + s );
		S.bone( 'hC' + s, J[ 'hC' + s ], 'hS' + s );
		S.bone( 'hF' + s, J[ 'hF' + s ], 'hC' + s );

	}

	// palettes sampled from the reference photos (autumn coats)
	const red = stag ? '#7b5337' : '#78614b';
	const back = stag ? '#6a4630' : '#6a5542';
	const belly = stag ? '#6b5b4b' : '#8b7863';
	const neckC = stag ? '#5a4a3d' : '#735e4b';
	const legC = stag ? '#5a4839' : '#5f4d3d';
	const coat = ( x, y, z ) => {

		const ax = Math.abs( x );
		// the pale caudal (rump) patch: a tall oval around the tail, softly edged darker
		const rp = Math.hypot( ax / 0.13, ( y - 0.97 ) / 0.22 );
		const behind = ss( - 0.5, - 0.62, z );
		const patch = behind * ( 1 - ss( 0.85, 1.0, rp ) );
		const rim = behind * ss( 0.8, 1.0, rp ) * ( 1 - ss( 1.05, 1.3, rp ) );
		const under = ss( 0.84, 0.7, y ) * ss( - 0.45, - 0.3, z ) * ss( 0.55, 0.4, z );
		const top = ss( 1.04, 1.16, y );
		const toNeck = ss( 0.3, 0.5, z ) * ss( 0.95, 1.1, y );
		const toLeg = ss( 0.72, 0.56, y );
		return coatMix( red, [ [ back, top * 0.8 ], [ belly, under ], [ neckC, toNeck ], [ legC, toLeg ], [ '#4a3626', rim * 0.8 ], [ '#d9c7a4', patch ] ], x, y, z );

	};

	const B = ( bone, color, k = 0.08, extra = {} ) => ( { bone, color, k, ...extra } );
	// torso from masses: deep ribcage, tucked flank, rump, withers, brisket
	S.ellipsoid( [ 0, 0.9, 0.12 ], [ 0.19, 0.29, 0.36 ], B( 'body', coat, 0.1 ) );
	S.ellipsoid( [ 0, 0.94, - 0.3 ], [ 0.175, 0.21, 0.3 ], B( 'body', coat, 0.12 ) );
	S.ellipsoid( [ 0, 1.0, - 0.5 ], [ 0.17, 0.2, 0.2 ], B( 'body', coat, 0.08 ) );
	S.ellipsoid( [ 0, 1.12, 0.3 ], [ 0.09, 0.1, 0.22 ], B( 'body', coat, 0.1 ) );
	S.ellipsoid( [ 0, 0.8, 0.44 ], [ 0.13, 0.16, 0.12 ], B( 'body', coat, 0.08 ) );

	for ( const [ sd, s ] of SIDES ) {

		// shoulder blade, upper arm, muscular forearm tapering to a slim cannon
		S.ellipsoid( [ sd * 0.13, 1.0, 0.37 ], [ 0.06, 0.21, 0.12 ], B( 'fS' + s, coat, 0.08 ), Sculpt.frame( [ 0, 1, - 0.35 ], [ sd, 0, 0 ] ) );
		S.cone( J[ 'fS' + s ], J[ 'fE' + s ], 0.085, 0.066, B( 'fS' + s, coat, 0.07 ) );
		S.cone( J[ 'fE' + s ], J[ 'fK' + s ], 0.068, 0.034, B( 'fE' + s, legC, 0.04 ) );
		S.ellipsoid( J[ 'fK' + s ].clone().add( V( 0, 0.005, 0.004 ) ), [ 0.034, 0.044, 0.038 ], B( 'fK' + s, legC, 0.02 ) );
		S.cone( J[ 'fK' + s ], J[ 'fF' + s ], 0.028, 0.023, B( 'fK' + s, legC, 0.02 ) );
		S.cone( J[ 'fF' + s ], J[ 'fF' + s ].clone().add( V( 0, - 0.045, 0.03 ) ), 0.026, 0.024, B( 'fF' + s, legC, 0.015 ) );
		S.cone( J[ 'fF' + s ].clone().add( V( 0, - 0.04, 0.03 ) ), J[ 'fF' + s ].clone().add( V( 0, - 0.08, 0.075 ) ), 0.029, 0.017, B( 'fF' + s, '#17120e', 0.008 ) );
		// haunch, thigh, gaskin, hock
		S.ellipsoid( [ sd * 0.105, 0.86, - 0.46 ], [ 0.1, 0.27, 0.19 ], B( 'hH' + s, coat, 0.09 ) );
		S.cone( J[ 'hH' + s ], J[ 'hS' + s ], 0.11, 0.07, B( 'hH' + s, coat, 0.07 ) );
		S.cone( J[ 'hS' + s ], J[ 'hC' + s ], 0.07, 0.034, B( 'hS' + s, legC, 0.04 ) );
		S.ellipsoid( J[ 'hC' + s ].clone().add( V( 0, 0.01, - 0.018 ) ), [ 0.028, 0.046, 0.037 ], B( 'hC' + s, legC, 0.02 ) );
		S.cone( J[ 'hC' + s ], J[ 'hF' + s ], 0.03, 0.023, B( 'hC' + s, legC, 0.02 ) );
		S.cone( J[ 'hF' + s ], J[ 'hF' + s ].clone().add( V( 0, - 0.045, 0.03 ) ), 0.026, 0.024, B( 'hF' + s, legC, 0.015 ) );
		S.cone( J[ 'hF' + s ].clone().add( V( 0, - 0.04, 0.03 ) ), J[ 'hF' + s ].clone().add( V( 0, - 0.08, 0.075 ) ), 0.029, 0.017, B( 'hF' + s, '#17120e', 0.008 ) );

	}

	// neck carried forward: thick and maned in the stag, slender in the hind
	const nb = stag ? 0.24 : 0.17, nm = stag ? 0.165 : 0.118, nt = stag ? 0.11 : 0.085;
	S.cone( [ 0, 1.0, 0.4 ], [ 0, 1.24, 0.64 ], nb, nm, B( 'neck1', neckC, 0.14 ) );
	S.cone( [ 0, 1.24, 0.64 ], [ 0, 1.45, 0.8 ], nm, nt, B( 'neck2', neckC, 0.05 ) );
	if ( stag ) S.ellipsoid( [ 0, 1.1, 0.66 ], [ 0.12, 0.23, 0.12 ], B( 'neck1', '#4b3a2d', 0.06, { fuzz: 0.016, fuzzFreq: 38 } ), Sculpt.frame( [ 0, 1, 0.9 ], [ 0, - 0.7, 1 ] ) );

	// head: a long face (~0.4 m), domed forehead, blunt dark muzzle, pale chin
	const face = stag ? '#6f5847' : '#7c6552';
	const fdir = V( 0, - 0.45, 1 ).normalize();
	const headCol = ( x, y, z ) => coatMix( face, [ [ '#b3a58c', ss( 1.345, 1.325, y ) * ss( 1.02, 1.08, z ) ], [ '#2a2019', ss( 1.09, 1.14, z ) * ss( 1.31, 1.34, y ) ], [ neckC, ss( 0.84, 0.78, z ) ], [ '#4f3f33', ss( 1.52, 1.56, y ) ] ], x, y, z, 0.05 );
	S.ellipsoid( [ 0, 1.5, 0.84 ], [ 0.08, 0.085, 0.12 ], B( 'head', headCol, 0.035 ) );
	S.cone( [ 0, 1.475, 0.9 ], [ 0, 1.35, 1.14 ], 0.068, 0.05, B( 'head', headCol, 0.04 ) );
	S.ellipsoid( [ 0, 1.41, 0.93 ], [ 0.058, 0.05, 0.13 ], B( 'head', headCol, 0.03 ), Sculpt.frame( fdir.clone().applyAxisAngle( V( 1, 0, 0 ), - Math.PI / 2 ), fdir ) );
	S.ellipsoid( [ 0, 1.35, 1.16 ], [ 0.047, 0.046, 0.032 ], B( 'head', '#1d1611', 0.02 ) );
	// ears: large, set wide, raised up and out
	const earLen = stag ? 0.16 : 0.19;
	for ( const [ sd, s ] of SIDES ) {

		const base = V( sd * 0.07, 1.57, 0.8 );
		const dir = V( sd * 0.8, 0.6, - 0.2 ).normalize();
		S.ellipsoid( base.clone().addScaledVector( dir, earLen * 0.5 ), [ stag ? 0.06 : 0.072, earLen * 0.5, 0.016 ], B( 'ear' + s, '#6a5442', 0.015 ), Sculpt.frame( dir, [ sd * 0.3, 0.3, 1 ] ) );

	}

	S.cone( [ 0, 1.06, - 0.7 ], [ 0, 0.95, - 0.765 ], 0.045, 0.03, B( 'tail', '#6a4a33', 0.03 ) );

	const { mesh, bones } = S.mesh( material, 0.019 );
	const head = bones.get( 'head' );
	for ( const [ sd ] of SIDES ) {

		const e = eyeMesh( 0.018, material );
		e.position.set( sd * 0.068, 1.5 - 1.46, 0.915 - 0.8 );
		head.add( e );

	}

	if ( stag ) head.add( antlers( material ) );
	return { mesh, bones, stag };

}

// 6 points a side: brow, bez, trez, then a crown; the beams sweep back then up.
function antlers( material ) {

	const b = new PartBuilder();
	const base = V( 0, 1.58 - 1.46, 0.8 - 0.8 );
	const col = ( x, y ) => ( y > 0.6 ? '#e3dac6' : '#4a3b2c' );
	for ( const [ sd ] of SIDES ) {

		const o = base.clone().add( V( sd * 0.05, 0, 0 ) );
		const pts = [ [ 0, 0, 0 ], [ 0.1, 0.16, - 0.12 ], [ 0.22, 0.36, - 0.26 ], [ 0.3, 0.56, - 0.3 ], [ 0.33, 0.72, - 0.22 ], [ 0.29, 0.84, - 0.1 ] ]
			.map( ( [ x, y, z ] ) => o.clone().add( V( sd * x, y, z ) ) );
		const beam = new THREE.CatmullRomCurve3( pts );
		b.add( taperedTube( beam, ( t ) => THREE.MathUtils.lerp( 0.029, 0.011, t ) * ( 1 + 0.1 * Math.sin( t * 37 ) ), 30, 7 ), col, null, 0, MAT.BILL );
		b.add( new THREE.TorusGeometry( 0.03, 0.009, 6, 10 ), '#3a2e22', new THREE.Matrix4().makeRotationX( Math.PI / 2 ).setPosition( o.x, o.y + 0.012, o.z ), 0, MAT.BILL );
		const tine = ( u, d, len, bend ) => {

			const p0 = beam.getPointAt( u );
			const dir = V( sd * d[ 0 ], d[ 1 ], d[ 2 ] ).normalize();
			const p1 = p0.clone().addScaledVector( dir, len * 0.55 );
			const p2 = p0.clone().addScaledVector( dir, len ).add( V( 0, bend, 0 ) );
			b.add( taperedTube( new THREE.CatmullRomCurve3( [ p0, p1, p2 ] ), ( t ) => THREE.MathUtils.lerp( 0.018, 0.004, t ), 10, 6 ), ( x, y, z ) => ( p2.distanceTo( V( x, y, z ) ) < len * 0.35 ? '#e3dac6' : '#4a3b2c' ), null, 0, MAT.BILL );

		};

		tine( 0.05, [ 0.1, 0.25, 1 ], 0.27, 0.07 ); // brow: forward over the face
		tine( 0.15, [ 0.15, 0.4, 1 ], 0.2, 0.05 ); // bez
		tine( 0.48, [ 0.1, 0.5, 1 ], 0.17, 0.04 ); // trez
		tine( 0.8, [ - 0.4, 1, 0.6 ], 0.14, 0.02 ); // crown
		tine( 0.88, [ 0.3, 1, 0.2 ], 0.13, 0.02 );

	}

	const m = new THREE.Mesh( b.build(), material );
	m.castShadow = true;
	return m;

}
