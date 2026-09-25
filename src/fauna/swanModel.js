import * as THREE from 'three';
import { Sculpt, noise3 } from './sdf.js';
import { MAT } from './creature.js';

// Mute swan, traced from a side-on reference photograph: the body rides high
// with the folded wings arched up over the back, a pointed upswept tail, and
// a long neck that rises from the breast almost vertically before the head
// bows forward over an orange bill with its black basal knob.
// Real size (metres), facing +z, waterline at y = 0.

const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

export function swanGeometry() {

	const S = new Sculpt();
	S.bone( 'body', [ 0, 0.15, 0 ] );
	const white = ( x, y, z ) => {

		const c = new THREE.Color( '#f4f2ec' );
		// faintly greyer where the body meets the water, warmer on the crown
		c.lerp( new THREE.Color( '#cfcdc6' ), ss( 0.1, 0.0, y ) * 0.8 );
		c.multiplyScalar( 1 + noise3( x * 30, y * 30, z * 30 ) * 0.025 );
		return c;

	};

	const F = { bone: 'body', color: white, mat: MAT.FEATHER };
	const P = ( k, extra = {} ) => ( { ...F, k, ...extra } );
	// hull: long deep body and a full, rounded breast
	S.ellipsoid( [ 0, 0.1, - 0.04 ], [ 0.25, 0.16, 0.5 ], P( 0.12 ) );
	S.ellipsoid( [ 0, 0.13, 0.3 ], [ 0.2, 0.19, 0.2 ], P( 0.14 ) );
	S.ellipsoid( [ 0, 0.2, - 0.34 ], [ 0.19, 0.14, 0.26 ], P( 0.1 ) );
	// folded wings: arched and lifted toward the rear
	for ( const sd of [ - 1, 1 ] ) {

		const dir = new THREE.Vector3( sd * 0.12, 0.34, - 1 ).normalize();
		S.ellipsoid( [ sd * 0.13, 0.27, - 0.14 ], [ 0.11, 0.42, 0.13 ], P( 0.08 ), Sculpt.frame( dir, [ sd, 0.5, 0 ] ) );
		// the loose tertial plumes that stand up at the back
		for ( let i = 0; i < 4; i ++ ) {

			const z0 = - 0.34 - i * 0.05, y0 = 0.4 + i * 0.012;
			S.cone( [ sd * ( 0.09 - i * 0.012 ), y0 - 0.05, z0 + 0.1 ], [ sd * ( 0.07 - i * 0.01 ), y0 + 0.03, z0 - 0.08 ], 0.04, 0.012, P( 0.05 ) );

		}

	}

	// pointed, upswept tail
	S.cone( [ 0, 0.16, - 0.5 ], [ 0, 0.26, - 0.73 ], 0.085, 0.012, P( 0.07 ) );

	// neck: from the breast, rising almost vertically, head bowed at the top
	const neck = [
		[ [ 0, 0.14, 0.44 ], 0.13 ],
		[ [ 0, 0.34, 0.5 ], 0.085 ],
		[ [ 0, 0.56, 0.45 ], 0.06 ],
		[ [ 0, 0.74, 0.39 ], 0.05 ],
		[ [ 0, 0.86, 0.39 ], 0.046 ],
	];
	for ( let i = 0; i < neck.length - 1; i ++ ) S.cone( neck[ i ][ 0 ], neck[ i + 1 ][ 0 ], neck[ i ][ 1 ], neck[ i + 1 ][ 1 ], P( 0.06 ) );

	// head: rounded crown, sloping forehead into the bill
	const face = ( x, y, z ) => {

		// black lores: the bare skin from the eye to the knob
		const lore = ss( 0.5, 0.52, z ) * ss( 0.88, 0.9, y ) * ( 1 - ss( 0.93, 0.95, y ) ) * ss( 0.02, 0.035, Math.abs( x ) );
		return lore > 0.5 ? '#141414' : white( x, y, z );

	};

	S.ellipsoid( [ 0, 0.905, 0.45 ], [ 0.048, 0.052, 0.085 ], { bone: 'body', color: face, k: 0.04, mat: MAT.FEATHER } );
	S.ellipsoid( [ 0, 0.885, 0.51 ], [ 0.035, 0.035, 0.05 ], { bone: 'body', color: face, k: 0.03, mat: MAT.FEATHER } );
	// bill: orange, angled down, black nail at the tip and knob at the base
	const bill = ( x, y, z ) => ( z > 0.64 ? '#1b1510' : '#dd6a2a' );
	S.cone( [ 0, 0.88, 0.535 ], [ 0, 0.83, 0.655 ], 0.028, 0.014, { bone: 'body', color: bill, k: 0.012, mat: MAT.BILL } );
	S.ellipsoid( [ 0, 0.905, 0.54 ], [ 0.017, 0.02, 0.024 ], { bone: 'body', color: '#101010', k: 0.012, mat: MAT.BILL } );

	const g = S.build( 0.012 );
	g.deleteAttribute( 'skinIndex' );
	g.deleteAttribute( 'skinWeight' );
	// the flat underside that sits in the water is hidden; trim a little of the height
	return g;

}

// Mallard (~58 cm), sculpted like the swan. Drake: glossy green head, white
// collar, chestnut breast, pale vermiculated flanks, grey-brown back, blue
// speculum, black stern with curled tail feathers. Hen: mottled brown.
export function mallardGeometry( drake ) {

	const S = new Sculpt();
	S.bone( 'body', [ 0, 0.08, 0 ] );
	const col = drake ? ( x, y, z ) => {

		const ax = Math.abs( x );
		const n = noise3( x * 90, y * 90, z * 90 );
		if ( z > 0.14 && y > 0.185 ) return new THREE.Color( '#0f3f26' ).lerp( new THREE.Color( '#2a6b3d' ), ss( 0.2, 0.26, y ) * 0.5 + n * 0.1 );
		if ( z > 0.12 && y > 0.172 ) return '#efefe9';
		if ( z > 0.07 && y > 0.03 ) return new THREE.Color( '#5a3121' ).multiplyScalar( 1 + n * 0.06 );
		if ( z < - 0.23 ) return y > 0.12 || ax < 0.03 ? '#101010' : '#e8e6df';
		if ( y > 0.115 ) {

			const spec = ss( - 0.14, - 0.12, z ) * ( 1 - ss( - 0.06, - 0.04, z ) ) * ss( 0.07, 0.09, ax );
			return spec > 0.5 ? '#27409a' : new THREE.Color( '#877f71' ).multiplyScalar( 1 + n * 0.08 );

		}

		// fine grey vermiculation on the flanks
		return new THREE.Color( '#b9b6ae' ).multiplyScalar( 1 + Math.sin( z * 400 + n * 3 ) * 0.04 );

	} : ( x, y, z ) => {

		// hen: each feather dark-centred with a buff edge
		const n = noise3( x * 70, y * 70, z * 70 );
		const scal = Math.sin( z * 140 + n * 4 ) * Math.sin( x * 120 + y * 60 );
		if ( z > 0.15 && y > 0.19 ) {

			const stripe = ss( 0.012, 0.004, Math.abs( y - 0.255 + ( z - 0.22 ) * 0.2 ) );
			const crown = ss( 0.275, 0.285, y );
			return new THREE.Color( '#8d714f' ).lerp( new THREE.Color( '#3b2c1f' ), Math.max( stripe, crown ) );

		}

		const spec = y > 0.115 && z > - 0.14 && z < - 0.05 && Math.abs( x ) > 0.075 ? 1 : 0;
		if ( spec ) return '#27409a';
		return new THREE.Color( '#8a6a47' ).lerp( new THREE.Color( '#4a3522' ), ss( 0.2, 0.7, scal ) * 0.8 ).multiplyScalar( 1 + n * 0.08 );

	};

	const P = ( k, extra = {} ) => ( { bone: 'body', color: col, k, mat: MAT.FEATHER, ...extra } );
	S.ellipsoid( [ 0, 0.07, - 0.02 ], [ 0.125, 0.085, 0.235 ], P( 0.06 ) );
	S.ellipsoid( [ 0, 0.1, 0.12 ], [ 0.1, 0.095, 0.1 ], P( 0.06 ) );
	S.ellipsoid( [ 0, 0.105, - 0.19 ], [ 0.09, 0.07, 0.1 ], P( 0.05 ) );
	// folded wings along the back
	for ( const sd of [ - 1, 1 ] ) S.ellipsoid( [ sd * 0.07, 0.125, - 0.07 ], [ 0.06, 0.17, 0.03 ], P( 0.03 ), Sculpt.frame( [ sd * 0.1, 0.12, - 1 ], [ sd * 0.4, 1, 0 ] ) );
	// tail
	S.cone( [ 0, 0.12, - 0.25 ], [ 0, 0.14, - 0.31 ], 0.035, 0.01, P( 0.03 ) );
	// neck and head
	S.cone( [ 0, 0.13, 0.16 ], [ 0, 0.21, 0.2 ], 0.05, 0.034, P( 0.04 ) );
	S.ellipsoid( [ 0, 0.25, 0.215 ], [ 0.037, 0.043, 0.055 ], P( 0.03 ) );
	// bill
	const billC = drake ? '#d4c23a' : ( x, y, z ) => ( z < 0.29 && y > 0.237 ? '#3d2a1c' : '#c47a2e' );
	S.ellipsoid( [ 0, 0.236, 0.29 ], [ 0.02, 0.042, 0.009 ], { bone: 'body', color: billC, k: 0.012, mat: MAT.BILL }, Sculpt.frame( [ 0, 0.25, 1 ], [ 0, 1, - 0.25 ] ) );
	if ( drake ) {

		// the curled black tail feathers
		for ( const sd of [ - 1, 1 ] ) S.cone( [ sd * 0.006, 0.14, - 0.25 ], [ sd * 0.006, 0.18, - 0.235 ], 0.009, 0.005, { bone: 'body', color: '#0c0c0c', k: 0.006, mat: MAT.FEATHER } );

	}

	const g = S.build( 0.0065 );
	g.deleteAttribute( 'skinIndex' );
	g.deleteAttribute( 'skinWeight' );
	return g;

}

export function mallardEyes( material ) {

	const group = new THREE.Group();
	for ( const sd of [ - 1, 1 ] ) {

		const e = new THREE.Mesh( new THREE.SphereGeometry( 0.0055, 8, 6 ), material );
		e.position.set( sd * 0.033, 0.262, 0.235 );
		group.add( e );

	}

	return group;

}

export function swanEyes( material ) {

	const group = new THREE.Group();
	for ( const sd of [ - 1, 1 ] ) {

		const e = new THREE.Mesh( new THREE.SphereGeometry( 0.0075, 10, 8 ), material );
		e.position.set( sd * 0.041, 0.915, 0.49 );
		group.add( e );

	}

	return group;

}
