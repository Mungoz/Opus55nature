import * as THREE from 'three';
import { Kit, M, mixc } from './kit.js';
import { sweep, bolt } from './jetty.js';

// The fishermen's boardwalk along the west shore, after the plank walks through the reeds at
// Cosmeston and the Federsee (shots/refs/boardwalk): a narrow way of planks laid across two
// stringers, on pairs of posts driven into the lake bed a few metres out from the waterline,
// a hand's breadth over the water. Old: the planks weathered silver-grey, a few replaced with
// newer brown ones, one or two gone, one split and sagging; moss in the seams, posts green
// and dark where they stand in the water. Built in world coordinates along a smooth line
// through pts ( [ x, z ] ), stepping down onto sleepers where it comes ashore at either end.

export const WALK = { W: 1.1, DECK: 0.46 };
const V = ( x, y, z ) => new THREE.Vector3( x, y, z );

function rand( seed ) {

	let s = seed >>> 0;
	return () => ( ( s = Math.imul( s ^ ( s >>> 15 ), 2246822507 ) + 0x6d2b79f5 | 0 ) >>> 0 ) / 4294967296;

}

// ground( x, z ): the terrain height. Returns the geometry, the decks to walk on (oriented
// rectangles with their floor heights), the post positions (for collision) and a function
// giving the distance from any point to the walk's centreline.
export function buildBoardwalk( pts, ground, { seed = 23 } = {} ) {

	const R = rand( seed );
	const { W, DECK } = WALK;
	const curve = new THREE.CatmullRomCurve3( pts.map( ( p ) => V( p[ 0 ], 0, p[ 1 ] ) ), false, 'centripetal' );
	const L = curve.getLength();
	// (the planks' top: level over the water; on the bank, on sleepers just above the ground)
	const topAt = ( x, z ) => Math.max( DECK, ground( x, z ) + 0.13 );
	const frame = ( s ) => {

		const u = THREE.MathUtils.clamp( s / L, 0, 1 );
		const p = curve.getPointAt( u ), t = curve.getTangentAt( u ).setY( 0 ).normalize();
		return { p, t, n: V( t.z, 0, - t.x ) };

	};

	const k = new Kit( ground, ( x, y, z, ny ) => ( ny < - 0.5 ? 0.45 : 1 ) * ( 0.55 + 0.45 * THREE.MathUtils.smoothstep( y, - 0.3, DECK ) ) );
	const grey = () => mixc( '#6f6a62', '#8b857b', R() ).multiplyScalar( 0.88 + 0.22 * R() );
	const postCol = () => mixc( '#4c463e', '#62594e', R() );

	// --- planks, one after another along the line
	let s = 0.05, i = 0, lastMissing = - 9;
	while ( s < L - 0.05 ) {

		const w = 0.14 + R() * 0.035;
		const { p, t, n } = frame( s + w / 2 );
		const yaw = Math.atan2( t.x, t.z );
		const top = topAt( p.x, p.z );
		const len = W + ( R() - 0.5 ) * 0.07;
		const cx = ( R() - 0.5 ) * 0.04;
		const c = R() < 0.07 ? mixc( '#76604a', '#8a7157', R() ) : grey();
		const missing = i - lastMissing > 30 && s > 6 && s < L - 6 && R() < 0.025;
		if ( missing ) lastMissing = i;
		else if ( R() < 0.012 && s > 6 && s < L - 6 ) {

			// split across the middle and sagging into the gap between the stringers
			for ( const side of [ - 1, 1 ] ) {

				const g = new THREE.BoxGeometry( len / 2 - 0.01, 0.03, w );
				g.translate( side * ( len / 4 ), 0, 0 );
				g.rotateZ( side * 0.07 );
				g.rotateY( yaw );
				const at = p.clone().addScaledVector( n, cx );
				g.translate( at.x, top - 0.015 - 0.02, at.z );
				k.add( g, M.LOG, c, n.toArray(), [ at.x, top, at.z ] );

			}

		} else {

			const g = new THREE.BoxGeometry( len, 0.032, w );
			// a slight twist and cup to each old plank
			g.rotateZ( ( R() - 0.5 ) * 0.02 );
			g.rotateY( yaw + ( R() - 0.5 ) * 0.03 );
			const at = p.clone().addScaledVector( n, cx );
			g.translate( at.x, top - 0.016 + ( R() - 0.5 ) * 0.006, at.z );
			k.add( g, M.LOG, c, n.toArray(), [ at.x, top, at.z ] );
			// two nails at each stringer
			if ( R() < 0.5 ) for ( const sx of [ - 0.36, 0.36 ] ) bolt( k, at.clone().addScaledVector( n, sx ).setY( top + 0.001 ), V( 0, 1, 0 ), 0.006 );

		}

		s += w + 0.012 + R() * 0.01;
		i ++;

	}

	// --- stringers under the planks, following the line
	const line = ( off, dy, step = 0.5 ) => {

		const out = [];
		for ( let q = 0; q <= L + 1e-6; q += step ) {

			const { p, n } = frame( Math.min( q, L ) );
			const a = p.clone().addScaledVector( n, off );
			out.push( a.setY( topAt( p.x, p.z ) + dy ) );

		}

		return out;

	};

	for ( const off of [ - 0.36, 0.36 ] ) sweep( k, line( off, - 0.032 - 0.06 ), 0.07, 0.12, M.LOG, postCol() );

	// --- posts in pairs with a cap beam across, every couple of metres where it stands in the water
	const posts = [];
	for ( let q = 1.2; q < L - 0.8; q += 1.9 + R() * 0.2 ) {

		const { p, t, n } = frame( q );
		const top = topAt( p.x, p.z );
		const yaw = Math.atan2( t.x, t.z );
		const onBank = ground( p.x, p.z ) > DECK - 0.3;
		if ( onBank ) {

			// on the bank: a sleeper under the stringers instead
			const g = new THREE.BoxGeometry( W + 0.2, 0.1, 0.16 );
			g.rotateY( yaw );
			g.translate( p.x, top - 0.032 - 0.12 - 0.05, p.z );
			k.add( g, M.LOG, postCol(), n.toArray(), [ p.x, top, p.z ] );
			continue;

		}

		for ( const sx of [ - 0.5, 0.5 ] ) {

			const a = p.clone().addScaledVector( n, sx + ( R() - 0.5 ) * 0.03 );
			const b = ground( a.x, a.z );
			const g = new THREE.CylinderGeometry( 0.065, 0.075, top - b + 0.3, 7, 3 );
			g.translate( a.x, ( top - 0.04 + b - 0.3 ) / 2, a.z );
			k.add( g, M.LOG, postCol(), [ 0, 1, 0 ], [ a.x, top, a.z ] );
			posts.push( [ a.x, a.z ] );

		}

		// the cap across the pair, under the stringers
		const g = new THREE.BoxGeometry( W + 0.12, 0.1, 0.09 );
		g.rotateY( yaw );
		g.translate( p.x, top - 0.032 - 0.12 - 0.05, p.z );
		k.add( g, M.LOG, postCol(), n.toArray(), [ p.x, top, p.z ] );

	}

	// --- the decks to walk on: a rectangle to each short run, their floors following the planks
	const decks = [];
	const seg = 1.6;
	for ( let q = 0; q < L; q += seg ) {

		const q1 = Math.min( L, q + seg );
		const a = frame( q ).p, b = frame( q1 ).p;
		const mid = a.clone().add( b ).multiplyScalar( 0.5 );
		const yaw = Math.atan2( b.x - a.x, b.z - a.z );
		const ya = topAt( a.x, a.z ), yb = topAt( b.x, b.z ), half = a.distanceTo( b ) / 2;
		decks.push( { x: mid.x, z: mid.z, hx: W / 2 + 0.03, hz: half + 0.08, yaw, y: Math.abs( ya - yb ) < 0.005 ? ya : ( lx, lz ) => THREE.MathUtils.lerp( ya, yb, THREE.MathUtils.clamp( ( lz + half ) / ( 2 * half ), 0, 1 ) ) } );

	}

	// how far from the walk's centreline (for keeping the reeds and the lilies off it)
	const samples = [];
	for ( let q = 0; q <= L; q += 0.5 ) samples.push( frame( q ).p );
	const distance = ( x, z ) => {

		let d = Infinity;
		for ( let j = 0; j < samples.length - 1; j ++ ) {

			const a = samples[ j ], b = samples[ j + 1 ];
			const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
			const u = l2 > 0 ? THREE.MathUtils.clamp( ( ( x - a.x ) * dx + ( z - a.z ) * dz ) / l2, 0, 1 ) : 0;
			d = Math.min( d, Math.hypot( a.x + dx * u - x, a.z + dz * u - z ) );

		}

		return d;

	};

	return { geometry: k.build(), decks, posts, length: L, distance, frame, topAt };

}
