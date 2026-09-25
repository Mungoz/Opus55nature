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

	const F = { bone: 'body', color: white, mat: MAT.FEATHER, pat: ( x, y ) => [ 0, 0.3 * ss( 0.18, 0.3, y ), 0 ] };
	const P = ( k, extra = {} ) => ( { ...F, k, ...extra } );
	// hull: long deep body and a full, rounded breast
	S.ellipsoid( [ 0, 0.1, - 0.04 ], [ 0.25, 0.16, 0.5 ], P( 0.12 ) );
	S.ellipsoid( [ 0, 0.13, 0.3 ], [ 0.2, 0.19, 0.2 ], P( 0.14 ) );
	S.ellipsoid( [ 0, 0.2, - 0.34 ], [ 0.19, 0.14, 0.26 ], P( 0.1 ) );
	// folded wings: arched and lifted toward the rear
	for ( const sd of [ - 1, 1 ] ) {

		const dir = new THREE.Vector3( sd * 0.12, 0.34, - 1 ).normalize();
		S.ellipsoid( [ sd * 0.13, 0.27, - 0.14 ], [ 0.11, 0.42, 0.13 ], P( 0.04 ), Sculpt.frame( dir, [ sd, 0.5, 0 ] ) );
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
// collar, chestnut breast, pale grey flanks finely vermiculated, grey-brown back,
// blue speculum edged in white, black stern with curled tail feathers. Hen: every
// feather dark-centred with a buff fringe, dark eye stripe, orange-and-brown bill.
// Colour zones come from the region function; the fine plumage (vermiculation,
// scalloped feathers, iridescence) is drawn per pixel from the pattern weights.
export function mallardGeometry( drake ) {

	const S = new Sculpt();
	S.bone( 'body', [ 0, 0.08, 0 ] );
	// which part of the plumage a point is on
	const region = ( x, y, z ) => {

		const ax = Math.abs( x );
		if ( z > 0.14 && y > 0.185 ) return 'head';
		if ( z > 0.12 && y > 0.172 ) return 'collar';
		if ( z > 0.07 && y > 0.03 ) return 'breast';
		if ( z < - 0.23 ) return y > 0.12 || ax < 0.03 ? 'stern' : 'tail';
		if ( y > 0.108 ) {

			// the speculum: a narrow band along the rear of the folded wing, edged in white
			const spec = ss( - 0.125, - 0.115, z ) * ( 1 - ss( - 0.075, - 0.065, z ) ) * ss( 0.125, 0.13, y ) * ss( 0.07, 0.08, ax );
			const edge = ss( - 0.135, - 0.125, z ) * ( 1 - ss( - 0.065, - 0.055, z ) ) * ss( 0.121, 0.126, y ) * ss( 0.068, 0.078, ax );
			if ( spec > 0.5 ) return 'speculum';
			if ( edge > 0.5 ) return 'specEdge';
			return ax > 0.055 ? 'wing' : 'back';

		}

		return 'flank';

	};

	const DRAKE = {
		head: '#12422a', collar: '#efefe9', breast: '#5c3322', stern: '#101010', tail: '#e8e6df',
		speculum: '#2c3fa0', specEdge: '#f0f0ea', wing: '#7b7367', back: '#6f6557', flank: '#bdbab2',
	};
	const HEN = {
		head: '#8d714f', collar: '#8d714f', breast: '#8a6a47', stern: '#6e5236', tail: '#9a8466',
		speculum: '#2c3fa0', specEdge: '#f0f0ea', wing: '#7a5e40', back: '#6e5236', flank: '#8a6a47',
	};
	const PAT = drake ? {
		head: [ 0, 0, 1 ], breast: [ 0, 0.25, 0 ], flank: [ 1, 0, 0 ], back: [ 0.6, 0.2, 0 ], wing: [ 0, 0.35, 0 ], speculum: [ 0, 0, 1 ],
	} : {
		head: [ 0, 0, 0 ], breast: [ 0, 1, 0 ], flank: [ 0, 1, 0 ], back: [ 0, 1, 0 ], wing: [ 0, 0.8, 0 ], stern: [ 0, 1, 0 ], tail: [ 0, 0.6, 0 ], speculum: [ 0, 0, 1 ],
	};
	const col = ( x, y, z ) => {

		const r = region( x, y, z );
		const n = noise3( x * 90, y * 90, z * 90 );
		if ( ! drake && r === 'head' ) {

			// hen's face: buff with a dark eye stripe and crown
			const stripe = ss( 0.012, 0.004, Math.abs( y - 0.255 + ( z - 0.22 ) * 0.2 ) );
			const crown = ss( 0.275, 0.285, y );
			return new THREE.Color( '#9a7d58' ).lerp( new THREE.Color( '#3b2c1f' ), Math.max( stripe, crown ) );

		}

		const c = new THREE.Color( ( drake ? DRAKE : HEN )[ r ] );
		if ( drake && r === 'head' ) c.lerp( new THREE.Color( '#2a6b3d' ), ss( 0.2, 0.26, y ) * 0.5 );
		return c.multiplyScalar( 1 + n * 0.05 );

	};

	const pat = ( x, y, z ) => PAT[ region( x, y, z ) ] || [ 0, 0, 0 ];
	const P = ( k, extra = {} ) => ( { bone: 'body', color: col, pat, k, mat: MAT.FEATHER, ...extra } );
	S.ellipsoid( [ 0, 0.07, - 0.02 ], [ 0.125, 0.085, 0.235 ], P( 0.05 ) );
	S.ellipsoid( [ 0, 0.1, 0.12 ], [ 0.1, 0.095, 0.1 ], P( 0.05 ) );
	S.ellipsoid( [ 0, 0.105, - 0.19 ], [ 0.09, 0.07, 0.1 ], P( 0.04 ) );
	// folded wings lie over the flanks with a clean edge
	for ( const sd of [ - 1, 1 ] ) S.ellipsoid( [ sd * 0.072, 0.128, - 0.07 ], [ 0.058, 0.17, 0.028 ], P( 0.01 ), Sculpt.frame( [ sd * 0.1, 0.12, - 1 ], [ sd * 0.4, 1, 0 ] ) );
	// tail
	S.cone( [ 0, 0.12, - 0.25 ], [ 0, 0.14, - 0.31 ], 0.035, 0.01, P( 0.02 ) );
	// neck and a distinctly rounded head
	S.cone( [ 0, 0.13, 0.16 ], [ 0, 0.21, 0.2 ], 0.046, 0.03, P( 0.025 ) );
	S.ellipsoid( [ 0, 0.25, 0.215 ], [ 0.037, 0.043, 0.055 ], P( 0.018 ) );
	// bill
	const billC = drake ? '#d4c23a' : ( x, y, z ) => ( z < 0.29 && y > 0.237 ? '#3d2a1c' : '#c47a2e' );
	S.ellipsoid( [ 0, 0.236, 0.29 ], [ 0.02, 0.042, 0.009 ], { bone: 'body', color: billC, k: 0.01, mat: MAT.BILL }, Sculpt.frame( [ 0, 0.25, 1 ], [ 0, 1, - 0.25 ] ) );
	if ( drake ) {

		// the curled black tail feathers
		for ( const sd of [ - 1, 1 ] ) S.cone( [ sd * 0.006, 0.14, - 0.25 ], [ sd * 0.006, 0.18, - 0.235 ], 0.009, 0.005, { bone: 'body', color: '#0c0c0c', k: 0.006, mat: MAT.FEATHER } );

	}

	const g = S.build( 0.006 );
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
