import * as THREE from 'three';
import { Kit, M, col, mixc } from './kit.js';
import { beam, sweep, lathe, rope, bolt, ring } from './jetty.js';

// The hunting stand at the edge of the forest meadow (a Hochsitz with a closed Kanzel), after
// photographs of stands in Bavaria, Baden, Carinthia and Bohemia (mockups/refs/stand): four
// peeled spruce poles splayed a little, a ring of rails a knee's height off the ground and
// another at head height, diagonals between; two squared bearers across the pole tops carry a
// plank floor at 3.2 m, run out on the ladder's side into a small railed landing. On it the
// box: vertical boards nailed to a light frame, a single-pitch roof of boards under tar paper
// held down by laths, falling to the back; a long slit of a window toward the meadow, its board
// flap hinged at the top and propped up like an awning; a doorway in the side wall with a
// hessian curtain pulled aside. Inside: a bench across the back wall, a narrow shelf under the
// window (the gun rest), and what the hunter left: binoculars, his log, the shed key on a nail.
// The ladder leans against the landing from the -x side, its rails running on up as handholds.
// Everything grey and weathered; moss round the pole feet; rusty nail heads.
// Frame: origin on the ground at the middle of the stand, +z toward the meadow (the trail), y up.

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

function rand( seed ) {

	let s = seed >>> 0;
	return () => ( ( s = Math.imul( s ^ ( s >>> 15 ), 2246822507 ) + 0x6d2b79f5 | 0 ) >>> 0 ) / 4294967296;

}

const H = 3.2; // the top of the floor
const CX = 0.75, CZ = 0.675; // the box's half width (x) and half depth (z), outside the boards
const BT = 0.022; // board thickness
const HF = 2.0, HB = 1.72; // the walls' height above the floor, front (+z) and back
const WIN = [ - 0.62, 0.62, 0.95, 1.35 ]; // the window: wanted x range, sill and head above the floor
const DOOR = [ - 0.36, 0.14, 1.5 ]; // the doorway in the -x wall: wanted z range, its height
const LAND = - 1.27; // the landing's outer edge
const FR = 0.06; // the box's frame timbers
// the underside of the roof boards (a plane falling from the front wall to the back)
const roofU = ( z ) => H + HB + ( HF - HB ) * ( z + CZ ) / ( 2 * CZ );

export const STAND = { H, CX, CZ };

// darker inside the box, under the roof and the floor, and toward the ground
function standAO( ground ) {

	return ( x, y, z, ny ) => {

		let a = 1;
		const inside = Math.abs( x ) < CX - 0.012 && Math.abs( z ) < CZ - 0.012 && y > H - 0.005 && y < roofU( z ) + 0.002;
		if ( inside ) a = 0.28 + 0.14 * ss( H, H + 1.8, y ) + ( z > CZ - 0.35 && y > H + 0.8 ? 0.14 : 0 ) + ( x < - CX + 0.3 && y > H + 0.3 ? 0.08 : 0 );
		else {

			if ( ny < - 0.5 && y > H + 1.4 ) a = 0.55;
			if ( ny < - 0.5 && y < H + 0.01 && y > H - 0.35 ) a = 0.6;

		}

		const g = ground( x, z );
		a *= 0.55 + 0.45 * ss( - 0.05, 0.6, y - g );
		return Math.min( 1, a );

	};

}

// boards side by side from u0 to u1, 12-18 cm wide, a finger's gap between them
function lay( u0, u1, R, w0 = 0.125, dw = 0.055 ) {

	const out = [];
	let u = u0;
	while ( u < u1 - 0.03 ) {

		let w = w0 + R() * dw;
		if ( u1 - ( u + w ) < 0.07 ) w = u1 - u;
		out.push( [ u, Math.min( u1, u + w - 0.004 - R() * 0.005 ) ] );
		u += w;

	}

	return out;

}

// a vertical board of the box's walls. side: f / b / l / r (+z, -z, -x, +x); [ a, b ] its
// extent along the wall (x on the front and back, z on the sides); from y0 up to top( u ) - the
// side walls' boards are cut to the roof's slope
function wallBoard( k, side, a, b, y0, top, c ) {

	const w = b - a, uc = ( a + b ) / 2;
	const g = new THREE.BoxGeometry( w, 1, BT );
	const p = g.getAttribute( 'position' );
	for ( let i = 0; i < p.count; i ++ ) {

		const u = uc + p.getX( i );
		p.setXYZ( i, u, p.getY( i ) > 0 ? top( u ) : y0, p.getZ( i ) );

	}

	let cx, cz;
	if ( side === 'f' || side === 'b' ) {

		cz = ( side === 'f' ? 1 : - 1 ) * ( CZ - BT / 2 );
		cx = uc;
		g.translate( 0, 0, cz );

	} else {

		// ( u, y, t ) -> ( - t, y, u )
		g.rotateY( - Math.PI / 2 );
		cx = ( side === 'r' ? 1 : - 1 ) * ( CX - BT / 2 );
		cz = uc;
		g.translate( cx, 0, 0 );

	}

	g.computeVertexNormals();
	k.add( g, M.LOG, c, [ 0, 1, 0 ], [ cx, ( y0 + top( uc ) ) / 2, cz ] );

}

// Builds the stand; ground( x, z ) is the terrain height in its frame. Returns { geometry,
// parts: { binoculars, key, log }, info }. info, in the stand's frame: ladderFoot (where to stand
// at the ladder's foot, on the ground), ladderTop (just inside the doorway, y = the floor),
// seat (the eye seated on the bench at the window), lookYaw (out of the window; 0 = +z), key /
// log / binoculars (where each part lies), collision ([ cx, cz, halfX, halfZ ]: the four pole
// feet, the ladder's foot), footprint (the base inside the legs), floor (its height), door
// ([ x, z ] of the doorway), cabin ([ cx, cz, halfX, halfZ ] of the box), window ([ x0, x1, y0,
// y1, z ] of the opening).
export function buildStand( ground ) {

	const R = rand( 1994 );
	const AO = standAO( ground );
	const k = new Kit( ground, AO );
	const parts = {}, info = {};
	// weathered boards: silver-grey, a few browner ones put in later
	const board = () => ( R() < 0.06 ? mixc( '#5b4838', '#6b5544', R() ) : mixc( '#48423b', '#615950', R() ) ).multiplyScalar( 0.85 + 0.25 * R() );
	const poleCol = () => mixc( '#554c42', '#6a6053', R() ).multiplyScalar( 0.85 + 0.2 * R() );
	const rust = () => mixc( '#3a261a', '#5e3a22', R() );
	const mossC = new THREE.Color( '#3f4f22' ), tmp = new THREE.Color();

	// green creeping up the last piece added from the ground, thicker on one side
	const moss = ( gy, h, amt, seed ) => {

		const g = k.parts[ k.parts.length - 1 ];
		const p = g.getAttribute( 'position' ), c = g.getAttribute( 'color' );
		for ( let i = 0; i < p.count; i ++ ) {

			const side = 0.55 + 0.45 * Math.sin( p.getX( i ) * 19 + p.getZ( i ) * 23 + seed );
			const f = ss( h, 0, p.getY( i ) - gy + 0.08 * Math.sin( p.getX( i ) * 40 + seed ) ) * amt * side;
			tmp.setRGB( c.getX( i ), c.getY( i ), c.getZ( i ) ).lerp( mossC, Math.max( 0, Math.min( 1, f ) ) );
			c.setXYZ( i, tmp.r, tmp.g, tmp.b );

		}

	};

	// a rusty nail head on a wall's face; n: the face's outward normal [ nx, nz ]
	const nail = ( x, y, z, nx, nz ) => {

		const s = 0.011 + R() * 0.003, t = 0.005;
		k.box( x + nx * t / 2, y, z + nz * t / 2, nx ? t : s, s, nz ? t : s, M.IRON, rust() );

	};

	// --- the legs: four peeled poles, feet splayed out, sunk into the ground
	const legs = [];
	for ( const [ sx, sz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) {

		const top = V( sx * 0.65 + ( R() - 0.5 ) * 0.03, H - 0.17, sz * 0.6 );
		const fx = sx * 1.1 + ( R() - 0.5 ) * 0.07, fz = sz * 1.02 + ( R() - 0.5 ) * 0.07, gy = ground( fx, fz );
		const foot = V( fx, gy - 0.35, fz );
		legs.push( { top, foot, gy, sx, sz } );
		k.pole( foot, top, 0.085, M.LOG, poleCol(), sx * 2 + sz * 5 );
		moss( gy, 0.6, 0.9, sx + sz * 3 );
		// moss cushions and a stone or two round the foot
		for ( let i = 0; i < 3; i ++ ) {

			const a = R() * Math.PI * 2, d = 0.1 + R() * 0.08;
			const x = fx + Math.cos( a ) * d, z = fz + Math.sin( a ) * d;
			k.stone( x, ground( x, z ) - 0.01, z, 0.08 + R() * 0.06, 0.03 + R() * 0.02, 0.07 + R() * 0.05, mixc( '#3a4a1f', '#55602e', R() ), R() * 30 );

		}

		if ( R() < 0.7 ) {

			const a = R() * Math.PI * 2, x = fx + Math.cos( a ) * 0.3, z = fz + Math.sin( a ) * 0.3;
			k.stone( x, ground( x, z ), z, 0.1 + R() * 0.08, 0.06 + R() * 0.04, 0.09 + R() * 0.06, mixc( '#8a857b', '#6f695f', R() ), R() * 50 );

		}

	}

	const legAt = ( L, y ) => L.foot.clone().lerp( L.top, ( y - L.foot.y ) / ( L.top.y - L.foot.y ) );
	const gAvg = legs.reduce( ( s, l ) => s + l.gy, 0 ) / 4;
	const midY = gAvg + 1.75;

	// --- the bracing, face by face: rails nailed on the outside of the legs (low, middle, and on
	// the sides one under the platform), diagonals on the inside - an X in the lower tier, one
	// brace in the upper, alternating
	const strut = ( A, ya, B, yb, off, r, over, c, seed ) => {

		const a = legAt( A, ya ).add( off ), b = legAt( B, yb ).add( off );
		const u = b.clone().sub( a ).normalize();
		k.pole( a.addScaledVector( u, - over ), b.addScaledVector( u, over ), r, M.LOG, c, seed );

	};

	const faces = [ [ 0, 1, V( 0, 0, - 1 ) ], [ 1, 2, V( 1, 0, 0 ) ], [ 2, 3, V( 0, 0, 1 ) ], [ 3, 0, V( - 1, 0, 0 ) ] ];
	faces.forEach( ( [ ia, ib, n ], fi ) => {

		const A = legs[ ia ], B = legs[ ib ];
		const out = n.clone().multiplyScalar( 0.085 + 0.05 ), inn = n.clone().multiplyScalar( - ( 0.085 + 0.045 ) );
		const railY = [ [ A.gy + 0.4 + ( R() - 0.5 ) * 0.06, B.gy + 0.4 + ( R() - 0.5 ) * 0.06, 0.055 ], [ midY + ( R() - 0.5 ) * 0.05, midY + ( R() - 0.5 ) * 0.05, 0.05 ] ];
		if ( fi % 2 === 1 ) railY.push( [ H - 0.42, H - 0.42, 0.048 ] );
		railY.forEach( ( [ ya, yb, r ], ri ) => {

			strut( A, ya, B, yb, out, r, 0.13 + R() * 0.08, poleCol(), fi * 7 + ri );
			if ( ri === 0 ) moss( Math.min( A.gy, B.gy ), 0.75, 0.5, fi );
			// a bolt through each crossing
			for ( const [ L, y ] of [ [ A, ya ], [ B, yb ] ] ) bolt( k, legAt( L, y ).add( n.clone().multiplyScalar( 0.085 + 0.1 ) ), n, 0.011 );

		} );

		const lo = ( L ) => L.gy + 0.5;
		strut( A, lo( A ), B, midY - 0.08, inn, 0.045, 0.1, poleCol(), fi * 5 + 1 );
		if ( fi % 2 === 1 ) strut( B, lo( B ), A, midY - 0.08, inn.clone().multiplyScalar( 1.7 ), 0.045, 0.1, poleCol(), fi * 5 + 2 );
		// (zigzag on the front and back, an X under a single brace on the sides)
		if ( fi % 2 === 0 ) strut( B, midY + 0.06, A, H - 0.3, inn, 0.045, 0.1, poleCol(), fi * 5 + 3 );
		else strut( A, midY + 0.06, B, H - 0.3, inn, 0.045, 0.1, poleCol(), fi * 5 + 3 );

	} );

	// --- the platform: two squared bearers across the pole tops (running out on the -x side
	// under the landing), an edge beam across their ends, the floor planks along z
	for ( const zs of [ - 1, 1 ] ) {

		const x0 = LAND + 0.06, x1 = CX + 0.1;
		k.box( ( x0 + x1 ) / 2, H - 0.1, zs * 0.6, x1 - x0, 0.14, 0.1, M.LOG, poleCol(), { axis: [ 1, 0, 0 ], round: 0.015 } );
		// an iron cramp over each pole top into the bearer
		for ( const L of legs ) if ( L.sz === zs ) k.box( L.top.x, H - 0.17, zs * ( 0.6 + 0.051 ), 0.012, 0.16, 0.008, M.IRON, rust() );
		// knee braces from the -x legs out to the landing's end of the bearers
		const L = legs.find( ( l ) => l.sx < 0 && l.sz === zs );
		const a = legAt( L, H - 1.05 ).add( V( 0, 0, - zs * 0.02 ) ), b = V( LAND + 0.12, H - 0.19, zs * 0.6 );
		k.pole( a, b, 0.045, M.LOG, poleCol(), zs * 4 );

	}

	k.box( LAND + 0.04, H - 0.1, 0, 0.08, 0.14, 1.46, M.LOG, poleCol(), { axis: [ 0, 0, 1 ], round: 0.015 } );
	for ( const [ a, b ] of lay( LAND, CX - 0.012, R, 0.14, 0.05 ) ) {

		const x = ( a + b ) / 2;
		k.box( x, H - 0.015, 0, b - a, 0.03, 2 * CZ - 0.024, M.LOG, board().multiplyScalar( 0.95 ), { axis: [ 0, 0, 1 ] } );
		if ( x < - CX ) for ( const z of [ - 0.6, 0.6 ] ) nail( x + ( R() - 0.5 ) * 0.04, H + 0.0, z, 0, 0 );

	}

	// --- the box's frame: corner posts, sills, a rail round at 0.9 m, top plates (the front and
	// back ones run out past the walls under the roof's overhang), the window and door framed
	const ix = CX - BT - FR / 2, iz = CZ - BT - FR / 2;
	const frameC = () => poleCol().multiplyScalar( 0.85 );
	const tim = ( a, b ) => beam( k, a, b, FR, FR, M.LOG, frameC(), { up: V( 0, 1, 0 ) } );
	for ( const [ sx, sz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) k.box( sx * ix, ( H + roofU( sz * iz ) - FR ) / 2, sz * iz, FR, roofU( sz * iz ) - FR - H, FR, M.LOG, frameC(), { axis: [ 0, 1, 0 ] } );
	for ( const sz of [ - 1, 1 ] ) {

		const y = roofU( sz * iz ) - FR / 2;
		tim( V( - CX - 0.21, y, sz * iz ), V( CX + 0.15, y, sz * iz ) );

	}

	for ( const sx of [ - 1, 1 ] ) tim( V( sx * ix, roofU( - iz ) - FR / 2, - iz ), V( sx * ix, roofU( iz ) - FR / 2, iz ) );
	const sillY = H + FR / 2, railY = H + 0.87;

	// --- the walls, board by board; the window cut out of the front, the doorway out of the -x
	// side; a nail through each board wherever it crosses a rail
	const wall = ( side, u0, u1, y0, top, cut, rails ) => {

		const ext = [ Infinity, - Infinity ];
		const n = { f: [ 0, 1 ], b: [ 0, - 1 ], l: [ - 1, 0 ], r: [ 1, 0 ] }[ side ];
		const plane = side === 'f' || side === 'b' ? n[ 1 ] * CZ : n[ 0 ] * CX;
		for ( const [ a, b ] of lay( u0, u1, R ) ) {

			// (on the weather sides a board or two has rotted short at its foot)
			const rotted = ( side === 'b' || side === 'r' ) && R() < 0.12;
			const c = board(), m = ( a + b ) / 2, yb = rotted ? y0 + 0.12 + R() * 0.12 : y0 - R() * 0.03;
			const pieces = [];
			if ( cut && m > cut[ 0 ] && m < cut[ 1 ] ) {

				ext[ 0 ] = Math.min( ext[ 0 ], a );
				ext[ 1 ] = Math.max( ext[ 1 ], b );
				if ( cut[ 2 ] > y0 + 0.05 ) pieces.push( [ yb, () => cut[ 2 ] ] );
				pieces.push( [ cut[ 3 ], top ] );

			} else pieces.push( [ yb, top ] );
			for ( const [ ya, tf ] of pieces ) {

				wallBoard( k, side, a, b, ya, tf, c );
				// green algae creeping up from the foot of the boards the rain drives against
				if ( side !== 'f' && ya < H + 0.05 ) moss( ya, 0.35, side === 'b' ? 0.45 : 0.25, m * 13 );
				const yt = tf( m );
				for ( const r of rails ) {

					const ry = typeof r === 'function' ? r( m ) : r;
					if ( ry < ya + 0.02 || ry > yt - 0.015 ) continue;
					const u = m + ( R() - 0.5 ) * ( b - a ) * 0.4, y = ry + ( R() - 0.5 ) * 0.015;
					if ( side === 'f' || side === 'b' ) nail( u, y, plane, 0, n[ 1 ] );
					else nail( plane, y, u, n[ 0 ], 0 );

				}

			}

		}

		return ext;

	};

	const win = wall( 'f', - CX, CX, H - 0.07, () => H + HF - 0.005, [ WIN[ 0 ], WIN[ 1 ], H + WIN[ 2 ], H + WIN[ 3 ] ], [ sillY, H + WIN[ 2 ] - FR / 2, H + WIN[ 3 ] + FR / 2, H + HF - 0.04 ] );
	wall( 'b', - CX, CX, H - 0.07, () => H + HB - 0.005, null, [ sillY, railY, H + HB - 0.04 ] );
	// (a narrower slit in the +x side, toward the front, to watch the edge of the wood)
	const side = wall( 'r', - CZ + BT, CZ - BT, H - 0.07, ( u ) => roofU( u ) - 0.006, [ 0.0, 0.5, H + WIN[ 2 ], H + WIN[ 3 ] - 0.05 ], [ sillY, railY, H + WIN[ 3 ] - 0.05 + FR / 2, ( u ) => roofU( u ) - 0.04 ] );
	tim( V( ix, H + WIN[ 2 ] - FR / 2, side[ 0 ] - FR ), V( ix, H + WIN[ 2 ] - FR / 2, side[ 1 ] + FR ) );
	tim( V( ix, H + WIN[ 3 ] - 0.05 + FR / 2, side[ 0 ] - FR ), V( ix, H + WIN[ 3 ] - 0.05 + FR / 2, side[ 1 ] + FR ) );
	const door = wall( 'l', - CZ + BT, CZ - BT, H + 0.002, ( u ) => roofU( u ) - 0.006, [ DOOR[ 0 ], DOOR[ 1 ], H, H + DOOR[ 2 ] ], [ sillY, railY, ( u ) => roofU( u ) - 0.04 ] );

	// sills and rails inside
	tim( V( - ix, sillY, - iz ), V( ix, sillY, - iz ) );
	tim( V( - ix, sillY, iz ), V( ix, sillY, iz ) );
	tim( V( ix, sillY, - iz ), V( ix, sillY, iz ) );
	tim( V( - ix, sillY, - iz ), V( - ix, sillY, door[ 0 ] - FR ) );
	tim( V( - ix, sillY, door[ 1 ] + FR ), V( - ix, sillY, iz ) );
	tim( V( - ix, railY, - iz ), V( ix, railY, - iz ) );
	tim( V( ix, railY, - iz ), V( ix, railY, iz ) );
	tim( V( - ix, railY, - iz ), V( - ix, railY, door[ 0 ] - FR ) );
	tim( V( - ix, railY, door[ 1 ] + FR ), V( - ix, railY, iz ) );
	// the window: a sill rail, a head rail, posts at its ends
	tim( V( - ix, H + WIN[ 2 ] - FR / 2, iz ), V( ix, H + WIN[ 2 ] - FR / 2, iz ) );
	tim( V( - ix, H + WIN[ 3 ] + FR / 2, iz ), V( ix, H + WIN[ 3 ] + FR / 2, iz ) );
	for ( const x of [ win[ 0 ] - FR / 2, win[ 1 ] + FR / 2 ] ) if ( Math.abs( x ) < ix - FR ) tim( V( x, H + WIN[ 2 ], iz ), V( x, H + WIN[ 3 ], iz ) );
	// the doorway: two posts and a lintel
	for ( const z of [ door[ 0 ] - FR / 2, door[ 1 ] + FR / 2 ] ) tim( V( - ix, H, z ), V( - ix, H + DOOR[ 2 ] + FR, z ) );
	tim( V( - ix, H + DOOR[ 2 ] + FR / 2, door[ 0 ] - FR ), V( - ix, H + DOOR[ 2 ] + FR / 2, door[ 1 ] + FR ) );
	// an outer sill under the window, sloped to shed the rain
	k.box( ( win[ 0 ] + win[ 1 ] ) / 2, H + WIN[ 2 ] - 0.012, CZ + 0.028, win[ 1 ] - win[ 0 ] + 0.1, 0.024, 0.07, M.LOG, board(), { rot: [ 0.12, 0, 0 ], axis: [ 1, 0, 0 ] } );

	// --- the roof: boards down the slope on the top plates, tar paper over them turned down
	// over a fascia at the front and barge boards at the sides, laths nailed down the slope to
	// hold the paper; at the back corner a sheet of it has torn loose and hangs
	{

		const rx0 = - CX - 0.24, rx1 = CX + 0.17, rz0 = - CZ - 0.22, rz1 = CZ + 0.32;
		const nR = V( 0, 2 * CZ, - ( HF - HB ) ).normalize();
		const at = ( x, z, lift ) => V( x, roofU( z ) + lift / nR.y, z );
		for ( const [ a, b ] of lay( rx0, rx1, R, 0.16, 0.06 ) ) {

			const x = ( a + b ) / 2;
			beam( k, at( x, rz0 + ( R() - 0.5 ) * 0.02, 0.012 ), at( x, rz1, 0.012 ), b - a, 0.024, M.LOG, board(), { up: nR } );

		}

		const felt = mixc( '#2f2e2b', '#3a3732', 0.5 );
		const xc = ( rx0 + rx1 ) / 2, wR = rx1 - rx0;
		beam( k, at( xc, rz0 - 0.01, 0.027 ), at( xc, rz1 + 0.024, 0.027 ), wR + 0.03, 0.006, M.LEATHER, felt, { up: nR } );
		// the fascia at the front, the paper over it; a board along the back edge too
		k.box( xc, roofU( rz1 ) - 0.04, rz1 + 0.011, wR + 0.045, 0.13, BT, M.LOG, board(), { axis: [ 1, 0, 0 ] } );
		k.box( xc, roofU( rz1 ) + 0.0, rz1 + 0.025, wR + 0.05, 0.06, 0.005, M.LEATHER, felt );
		k.box( xc, roofU( rz0 ) - 0.03, rz0 - 0.011, wR + 0.045, 0.1, BT, M.LOG, board(), { axis: [ 1, 0, 0 ] } );
		for ( const [ x, s ] of [ [ rx0 - 0.011, - 1 ], [ rx1 + 0.011, 1 ] ] ) {

			beam( k, at( x, rz0 - 0.022, - 0.035 ), at( x, rz1 + 0.022, - 0.035 ), BT, 0.12, M.LOG, board(), { up: nR } );
			beam( k, at( x + s * 0.014, rz0 - 0.02, 0.0 ), at( x + s * 0.014, rz1 + 0.03, 0.0 ), 0.005, 0.06, M.LEATHER, felt, { up: nR } );

		}

		for ( let x = rx0 + 0.08; x < rx1 - 0.05; x += 0.4 + R() * 0.08 ) {

			beam( k, at( x, rz0 + 0.02, 0.041 ), at( x, rz1 - 0.02, 0.041 ), 0.045, 0.022, M.LOG, board().multiplyScalar( 0.65 ), { up: nR } );
			for ( let z = rz0 + 0.1; z < rz1; z += 0.45 ) {

				const p = at( x + ( R() - 0.5 ) * 0.01, z, 0.054 );
				k.box( p.x, p.y, p.z, 0.011, 0.004, 0.011, M.IRON, rust() );

			}

		}

		// the torn sheet: hanging from the back edge near the -x corner, curling
		const t0 = at( rx0 + 0.3, rz0 - 0.01, 0.027 );
		sweep( k, [ t0, t0.clone().add( V( 0.01, - 0.05, - 0.035 ) ), t0.clone().add( V( 0.03, - 0.13, - 0.04 ) ), t0.clone().add( V( 0.05, - 0.19, - 0.01 ) ) ], 0.22, 0.005, M.LEATHER, felt.clone().multiplyScalar( 1.15 ), { up: V( 0, 0, 1 ) } );

	}

	// --- the window flap: boards on two battens, hinged over the window and propped up past
	// level like an awning; a stick at one end, a cord to the fascia at the other
	{

		const hinge = V( 0, H + WIN[ 3 ] + 0.06, CZ + 0.002 );
		const x0 = win[ 0 ] - 0.05, x1 = win[ 1 ] + 0.05, FH = WIN[ 3 ] - WIN[ 2 ] + 0.13;
		const th = 1.3; // from hanging shut, swung up three quarters of the way to level
		const P = ( x, y, z ) => V( x, y, z ).applyAxisAngle( V( 1, 0, 0 ), - th ).add( hinge );
		const put = ( x, y, z, sx, sy, sz, mat, c, axis ) => {

			const p = P( x, y, z );
			k.box( p.x, p.y, p.z, sx, sy, sz, mat, c, { rot: [ - th, 0, 0 ], axis: V( ...axis ).applyAxisAngle( V( 1, 0, 0 ), - th ).toArray() } );

		};

		for ( const [ a, b ] of lay( x0, x1, R ) ) put( ( a + b ) / 2, - FH / 2, BT / 2, b - a, FH - R() * 0.02, BT, M.LOG, board(), [ 0, 1, 0 ] );
		for ( const y of [ - 0.08, - FH + 0.08 ] ) put( ( x0 + x1 ) / 2, y, BT * 1.5, x1 - x0 - 0.1, 0.075, BT, M.LOG, board(), [ 1, 0, 0 ] );
		for ( const x of [ x0 + 0.14, x1 - 0.14 ] ) {

			// strap hinges on the battens, their knuckles on pins driven into the wall
			put( x, - 0.1, BT * 2 + 0.002, 0.03, 0.2, 0.004, M.IRON, rust(), [ 0, 1, 0 ] );
			k.box( x, hinge.y + 0.03, CZ + 0.004, 0.035, 0.07, 0.006, M.IRON, rust() );
			const kn = new THREE.CylinderGeometry( 0.008, 0.008, 0.05, 6 );
			kn.rotateZ( Math.PI / 2 );
			kn.translate( x, hinge.y, hinge.z + 0.006 );
			k.add( kn, M.IRON, rust() );

		}

		// the stick, from the outer sill up to the flap's edge
		const tip = P( x1 - 0.1, - FH + 0.03, - 0.005 );
		k.pole( V( x1 - 0.08, H + WIN[ 2 ] - 0.005, CZ + 0.05 ), tip, 0.014, M.LOG, poleCol(), 7 );
		// the cord, from a screw eye on the flap to a nail in the fascia
		const e = P( x0 + 0.12, - FH + 0.04, BT * 2 );
		rope( k, [ e, e.clone().lerp( V( x0 + 0.1, roofU( CZ + 0.32 ) - 0.1, CZ + 0.33 ), 0.5 ).add( V( 0, - 0.01, 0 ) ), V( x0 + 0.1, roofU( CZ + 0.32 ) - 0.09, CZ + 0.33 ) ], 0.005, '#5b4d3c' );
		info.window = [ win[ 0 ], win[ 1 ], H + WIN[ 2 ], H + WIN[ 3 ], CZ ];

	}

	// --- inside: the shelf under the window on two brackets, the bench across the back wall, a
	// folded blanket on it, an empty bottle under it; the curtain at the doorway, pulled aside
	const SY = H + WIN[ 2 ] + 0.025; // the shelf's top
	const shelfZ0 = CZ - BT - 0.25, shelfZ1 = CZ - BT;
	k.box( 0, SY - 0.0125, ( shelfZ0 + shelfZ1 ) / 2, 1.3, 0.025, shelfZ1 - shelfZ0, M.LOG, board(), { axis: [ 1, 0, 0 ] } );
	for ( const x of [ - 0.5, 0.5 ] ) {

		k.box( x, SY - 0.13, CZ - BT - 0.012, 0.03, 0.2, 0.024, M.LOG, frameC(), { axis: [ 0, 1, 0 ] } );
		beam( k, V( x, SY - 0.22, CZ - BT - 0.02 ), V( x, SY - 0.03, shelfZ0 + 0.04 ), 0.03, 0.035, M.LOG, frameC(), { up: V( 1, 0, 0 ) } );

	}

	const benchZ = - CZ + BT + FR + 0.14, benchY = H + 0.45;
	k.box( 0.08, benchY - 0.015, benchZ, 1.2, 0.03, 0.28, M.LOG, board(), { axis: [ 1, 0, 0 ] } );
	for ( const x of [ - 0.44, 0.6 ] ) k.box( x, ( H + benchY - 0.03 ) / 2, benchZ + 0.02, 0.028, benchY - 0.03 - H, 0.24, M.LOG, board(), { axis: [ 0, 1, 0 ] } );
	k.box( 0.08, benchY - 0.08, - CZ + BT + FR + 0.012, 1.1, 0.06, 0.024, M.LOG, frameC(), { axis: [ 1, 0, 0 ] } );
	k.box( 0.36, benchY + 0.03, benchZ + 0.01, 0.42, 0.06, 0.25, M.LEATHER, mixc( '#4a4136', '#554a3c', R() ), { round: 0.022 } );
	k.box( 0.33, benchY + 0.075, benchZ + 0.0, 0.38, 0.035, 0.22, M.LEATHER, mixc( '#51473a', '#3f3830', R() ), { round: 0.015, rot: [ 0, 0.08, 0 ] } );
	lathe( k, [ [ 0, 0 ], [ 0.034, 0 ], [ 0.036, 0.005 ], [ 0.036, 0.17 ], [ 0.028, 0.2 ], [ 0.013, 0.225 ], [ 0.013, 0.27 ], [ 0.015, 0.275 ], [ 0, 0.276 ] ], V( 0.3, H, benchZ - 0.02 ), M.BRONZE, col( '#1e2a1b' ), 12 );
	{

		// a hessian sack, slit open, hung as a curtain: gathered on its rod at the back post
		const x = - CX + BT + FR + 0.035;
		k.pole( V( x - 0.01, H + DOOR[ 2 ] - 0.02, door[ 0 ] - 0.12 ), V( x - 0.01, H + DOOR[ 2 ] - 0.02, door[ 1 ] + 0.1 ), 0.007, M.IRON, col( '#2e2a26' ), 1 );
		// (a cylinder squashed flat against the wall, fanned out where it bunches on the rod,
		// deep folds down its length, the hem swinging a little into the doorway)
		const len = 1.08, g = new THREE.CylinderGeometry( 0.05, 0.085, len, 14, 8 );
		const p = g.getAttribute( 'position' );
		for ( let i = 0; i < p.count; i ++ ) {

			const px = p.getX( i ), py = p.getY( i ), pz = p.getZ( i ), t = 0.5 - py / len;
			const a = Math.atan2( pz, px );
			const f = 1 + 0.3 * Math.sin( a * 6 + py * 1.5 ) + 0.1 * Math.sin( a * 11 - py * 4 ) + 0.06 * Math.sin( py * 13 );
			const fan = py > len * 0.42 ? 1 + ( py - len * 0.42 ) * 4 : 1;
			const pinch = 1 - 0.4 * Math.exp( - ( py / 0.07 ) * ( py / 0.07 ) );
			p.setXYZ( i, px * f * 0.45 * pinch, py, pz * f * fan * pinch + t * t * 0.05 );

		}

		g.computeVertexNormals();
		g.translate( x + 0.02, H + DOOR[ 2 ] - 0.02 - len / 2, door[ 0 ] + 0.02 );
		k.add( g, M.LEATHER, col( '#4f4435' ), [ 0, 1, 0 ] );
		// a length of twine tied round it at hip height
		const tie = new THREE.TorusGeometry( 0.045, 0.004, 4, 12 );
		tie.scale( 0.48, 1, 1 );
		tie.rotateX( Math.PI / 2 );
		tie.translate( x + 0.02, H + DOOR[ 2 ] - 0.02 - len / 2, door[ 0 ] + 0.02 + 0.0125 );
		k.add( tie, M.ROPE, col( '#7a6a50' ), [ 0, 0, 1 ] );

	}

	// --- the landing's rail: two posts, a rail at hand height and one at the knee to the box,
	// short rails along the edge to the ladder
	const zd = ( door[ 0 ] + door[ 1 ] ) / 2;
	{

		for ( const zs of [ - 1, 1 ] ) {

			const px = LAND + 0.05, pz = zs * ( CZ - 0.04 );
			k.pole( V( px, H - 0.17, pz ), V( px + 0.01, H + 1.02, pz ), 0.042, M.LOG, poleCol(), zs * 3 );
			k.box( px + 0.01, H + 1.03, pz, 0.075, 0.018, 0.075, M.LOG, poleCol() );
			for ( const y of [ H + 0.96, H + 0.5 ] ) k.pole( V( px - 0.02, y, pz + zs * 0.05 ), V( - CX - 0.005, y + ( R() - 0.5 ) * 0.03, pz + zs * 0.05 ), 0.03, M.LOG, poleCol(), y + zs );
			const ze = zd + zs * 0.36;
			k.pole( V( px - 0.05, H + 0.96, pz ), V( px - 0.05, H + 0.95, ze ), 0.028, M.LOG, poleCol(), zs * 7 );

		}

	}

	// --- the ladder: two poles leaning against the landing's edge beam from the -x side, their
	// tops running on up past the floor as handholds; round rungs nailed on across them (one
	// broken rung replaced with a squared batten), a flat stone under each foot
	{

		const footX = LAND - 1.02, rest = V( LAND - 0.06, H - 0.1, 0 );
		const rails = [];
		for ( const zs of [ - 1, 1 ] ) {

			const z = zd + zs * 0.27, gy = ground( footX, z );
			const F = V( footX + ( R() - 0.5 ) * 0.03, gy - 0.08, z ), P = V( rest.x, rest.y, z );
			const d = P.clone().sub( F ).normalize();
			const T = F.clone().addScaledVector( d, ( H + 1.0 - F.y ) / d.y );
			k.pole( F, T, 0.05, M.LOG, poleCol(), zs * 11 );
			moss( gy, 0.4, 0.7, zs * 2 );
			k.stone( F.x, gy - 0.02, z, 0.13, 0.05, 0.12, mixc( '#8a857b', '#76705f', R() ), zs * 13 );
			rails.push( { F, d, gy } );

		}

		const d = rails[ 0 ].d, nC = V( - d.y, d.x, 0 ).normalize();
		const F0 = rails[ 0 ].F;
		const lineX = ( y ) => F0.x + d.x * ( y - F0.y ) / d.y;
		let i = 0;
		for ( let y = Math.max( rails[ 0 ].gy, rails[ 1 ].gy ) + 0.3; y < H - 0.12; y += 0.3, i ++ ) {

			const c = V( lineX( y ), y, 0 ).addScaledVector( nC, 0.05 + 0.024 );
			const a = V( c.x, c.y, zd - 0.27 - 0.075 ), b = V( c.x, c.y, zd + 0.27 + 0.075 + ( R() - 0.5 ) * 0.03 );
			if ( i === 5 ) beam( k, a, b, 0.065, 0.032, M.LOG, mixc( '#7a5d44', '#8a6a4e', R() ), { up: nC } );
			else k.pole( a, b, 0.026, M.LOG, poleCol().multiplyScalar( 1.05 ), i * 3.7 );
			for ( const zs of [ - 1, 1 ] ) {

				const p = V( c.x, c.y, zd + zs * 0.27 ).addScaledVector( nC, 0.027 );
				k.box( p.x, p.y, p.z, 0.012, 0.012, 0.012, M.IRON, rust(), { rot: [ 0, 0, Math.atan2( nC.y, nC.x ) ] } );

			}

		}

		info.ladderFoot = [ footX - 0.8, ground( footX - 0.8, zd ), zd ];
		info.collision = legs.map( ( L ) => [ L.foot.x, L.foot.z, 0.12, 0.12 ] );
		// (the ladder's foot, out to where it passes above head height)
		info.collision.push( [ footX + 0.22, zd, 0.3, 0.36 ] );
		// the base inside the legs, fenced by the knee-high rails
		info.footprint = [ 0, 0, 1.2, 1.12 ];

	}

	// --- a tin notice on the front-left leg, facing the trail: its words weathered away, the
	// red border still there
	{

		const L = legs[ 3 ], p = legAt( L, L.gy + 1.65 ).add( V( 0, 0, 0.085 + 0.004 ) );
		k.box( p.x, p.y, p.z, 0.22, 0.15, 0.004, M.IRON, col( '#b3ad9e' ), { rot: [ 0, 0, 0.04 ] } );
		for ( const [ dx, dy, sx, sy ] of [ [ 0, 0.064, 0.2, 0.012 ], [ 0, - 0.064, 0.2, 0.012 ], [ 0.098, 0, 0.012, 0.13 ], [ - 0.098, 0, 0.012, 0.13 ] ] ) k.box( p.x + dx, p.y + dy + dx * 0.04, p.z + 0.0025, sx, sy, 0.002, M.IRON, col( '#7d2a1f' ), { rot: [ 0, 0, 0.04 ] } );
		for ( const dx of [ - 0.085, 0.085 ] ) k.box( p.x + dx, p.y + 0.05 + dx * 0.04, p.z + 0.004, 0.01, 0.01, 0.005, M.IRON, rust() );

	}

	// --- the things left inside (parts: taken away, or moved, while no one is looking)

	// the key: on a nail in the -x wall inside, in front of the doorway; a wooden tag with it on
	// a loop of string
	{

		const kk = new Kit( ground, AO );
		const xw = - CX + BT, z = door[ 1 ] + FR + 0.1, y = H + 1.42;
		// (the nail itself stays)
		k.pole( V( xw - 0.005, y, z ), V( xw + 0.035, y + 0.004, z ), 0.0022, M.IRON, rust(), 0 );
		k.box( xw + 0.036, y + 0.004, z, 0.003, 0.009, 0.009, M.IRON, rust() );
		const xk = xw + 0.02;
		ring( kk, V( xk, y - 0.011, z ), V( 1, 0, 0 ), 0.013, 0.0032 );
		kk.box( xk, y - 0.024 - 0.029, z, 0.005, 0.058, 0.005, M.IRON, col( '#3c3833' ) );
		kk.box( xk, y - 0.03, z, 0.007, 0.006, 0.009, M.IRON, col( '#3c3833' ) );
		kk.box( xk, y - 0.074, z + 0.009, 0.004, 0.016, 0.014, M.IRON, col( '#3c3833' ) );
		kk.box( xk, y - 0.068, z + 0.013, 0.004, 0.005, 0.006, M.VOID, col( '#000000' ) );
		// the tag, behind the key on its string
		const ts = new THREE.TorusGeometry( 0.018, 0.0012, 4, 12 );
		ts.scale( 1, 1.6, 1 );
		ts.rotateY( Math.PI / 2 );
		ts.translate( xk - 0.006, y - 0.026, z - 0.012 );
		kk.add( ts, M.ROPE, col( '#8a7a5c' ), [ 0, 1, 0 ] );
		kk.box( xk - 0.007, y - 0.078, z - 0.016, 0.008, 0.055, 0.024, M.LOG, col( '#86725a' ), { rot: [ 0.15, 0, 0 ], axis: [ 0, 1, 0 ] } );
		parts.key = kk.build();
		info.key = [ xk, y - 0.045, z ];

	}

	// the binoculars: an old pair of 7x50s, rubber-armoured, lying on the shelf toward the
	// right-hand end, pointing out of the window; the strap in a loop beside them
	{

		const bk = new Kit( ground, () => 0.62 );
		const black = col( '#1b1a18' ), trim = col( '#2c2b29' );
		const cylZ = ( x, y, z0, z1, r, mat, c, seg = 14 ) => {

			const g = new THREE.CylinderGeometry( r, r, z1 - z0, seg );
			g.rotateX( Math.PI / 2 );
			g.translate( x, y, ( z0 + z1 ) / 2 );
			bk.add( g, mat, c, [ 0, 0, 1 ], [ x, y, ( z0 + z1 ) / 2 ] );

		};

		for ( const s of [ - 1, 1 ] ) {

			cylZ( s * 0.063, 0.031, - 0.005, 0.085, 0.031, M.LEATHER, black );
			cylZ( s * 0.063, 0.031, 0.083, 0.092, 0.033, M.IRON, trim );
			cylZ( s * 0.063, 0.031, 0.091, 0.093, 0.026, M.BRONZE, col( '#243646' ) );
			bk.box( s * 0.048, 0.03, - 0.045, 0.062, 0.054, 0.085, M.LEATHER, black, { round: 0.012 } );
			cylZ( s * 0.034, 0.024, - 0.125, - 0.085, 0.018, M.LEATHER, black );
			cylZ( s * 0.034, 0.024, - 0.14, - 0.122, 0.021, M.LEATHER, col( '#141312' ) );
			cylZ( s * 0.034, 0.024, - 0.1415, - 0.139, 0.012, M.BRONZE, col( '#1d2c38' ) );
			// the strap's lugs
			bk.box( s * 0.082, 0.045, - 0.055, 0.012, 0.012, 0.018, M.IRON, trim );

		}

		cylZ( 0, 0.032, - 0.1, 0.06, 0.011, M.IRON, trim, 8 );
		const fw = new THREE.CylinderGeometry( 0.014, 0.014, 0.022, 12 );
		fw.rotateZ( Math.PI / 2 );
		fw.translate( 0, 0.043, - 0.075 );
		bk.add( fw, M.LEATHER, col( '#23221f' ) );
		// the strap: from one lug round in a loop on the shelf to the other
		const strap = [ V( - 0.088, 0.045, - 0.055 ), V( - 0.13, 0.01, - 0.07 ), V( - 0.17, 0.003, - 0.02 ), V( - 0.16, 0.003, 0.06 ), V( - 0.1, 0.003, 0.1 ), V( 0.0, 0.003, 0.11 ), V( 0.11, 0.003, 0.09 ), V( 0.12, 0.012, - 0.02 ), V( 0.088, 0.045, - 0.055 ) ];
		const curve = new THREE.CatmullRomCurve3( strap );
		sweep( bk, curve.getPoints( 28 ), 0.016, 0.003, M.LEATHER, col( '#2d2218' ), { up: V( 0, 1, 0 ) } );
		const yaw = - 0.3, p = V( 0.3, SY, ( shelfZ0 + shelfZ1 ) / 2 + 0.005 );
		const m = new THREE.Matrix4().makeRotationY( yaw ).setPosition( p );
		for ( const g of bk.parts ) g.applyMatrix4( m );
		parts.binoculars = bk.build();
		info.binoculars = [ p.x, p.y + 0.03, p.z ];

	}

	// the hunter's log: a cloth-bound notebook with a pencil on it, a ribbon marking the page
	{

		const lk = new Kit( ground, () => 0.62 );
		const cover = col( '#2c3528' ), W = 0.15, D = 0.21;
		lk.box( 0, 0.00125, 0, W, 0.0025, D, M.LEATHER, cover );
		lk.box( 0.002, 0.0065, 0, W - 0.006, 0.0085, D - 0.006, M.LEATHER, col( '#c9c0a6' ) );
		lk.box( 0, 0.01175, 0, W, 0.0025, D, M.LEATHER, cover );
		const sp = new THREE.CylinderGeometry( 0.0065, 0.0065, D, 8, 1, false, Math.PI, Math.PI );
		sp.rotateX( Math.PI / 2 );
		sp.translate( - W / 2, 0.0065, 0 );
		lk.add( sp, M.LEATHER, cover );
		lk.box( 0.03, 0.006, D / 2 + 0.018, 0.006, 0.001, 0.04, M.LEATHER, col( '#6a1f1a' ), { rot: [ 0.6, 0, 0 ] } );
		// the pencil: a green hexagon, sharpened
		const pc = new THREE.CylinderGeometry( 0.0038, 0.0038, 0.15, 6 );
		pc.rotateZ( Math.PI / 2 );
		pc.rotateY( 0.5 );
		pc.translate( 0.0, 0.0172, 0.01 );
		lk.add( pc, M.LEATHER, col( '#34503a' ) );
		const tipG = new THREE.ConeGeometry( 0.0038, 0.018, 6 );
		tipG.rotateZ( - Math.PI / 2 );
		tipG.translate( 0.084, 0, 0 );
		tipG.rotateY( 0.5 );
		tipG.translate( 0.0, 0.0172, 0.01 );
		lk.add( tipG, M.LOG, col( '#b39a72' ), [ 1, 0, 0 ] );
		const yaw = 0.22, p = V( - 0.3, SY, ( shelfZ0 + shelfZ1 ) / 2 - 0.01 );
		const m = new THREE.Matrix4().makeRotationY( yaw ).setPosition( p );
		for ( const g of lk.parts ) g.applyMatrix4( m );
		parts.log = lk.build();
		info.log = [ p.x, p.y + 0.012, p.z ];

	}

	// --- where the player stands and looks
	info.floor = H;
	info.ladderTop = [ - CX + 0.3, H, zd ];
	info.seat = [ 0.05, H + 1.2, benchZ + 0.12 ];
	info.lookYaw = 0;
	info.door = [ - CX, zd ];
	info.cabin = [ 0, 0, CX, CZ ];
	return { geometry: k.build(), parts, info };

}
