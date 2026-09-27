import * as THREE from 'three';
import { Kit, M, col, mixc } from './kit.js';
import { beam, lathe, ring, bolt } from './jetty.js';

// The forester's lodge (a Forsthütte, the kind the Jäger and the forester share), after
// photographs of small hunting huts in the Carinthian, Styrian and Upper Austrian forests
// (mockups/refs/lodge: r6 the Göriacher Alm, r8 the Dürreck hut, r7 Dafins): one room of
// squared spruce logs dovetailed flush at the corners, on a low rubble plinth; a steep gable
// roof of split shingles, its front gable carried out on the purlins over a plank porch; the
// gable itself boarded upright, a red deer's skull and antlers nailed to it over the door; a
// stovepipe through the roof with a round rain cap; two small casement windows with board
// shutters folded back, faded green. Inside, lit from the door and the two windows: a plank
// floor, the roof open to its rafters, a desk under the back window with the diary, the field
// telephone and the oil lamp on it, the big map on the back wall, an empty gun rack, a cot, a
// little iron stove, shelves. Beside it, on the -x side, a padlocked woodshed of boards under a
// lean-to roof of tarred felt, with a pair of oars and the tools inside.
// Built in the lodge's own frame: origin at the prop's base (y = 0 is the ground there), +z
// out of the front (porch) gable toward the trail, +y up.

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );

// the log walls' footprint: width (x, the gable front), length (z); the logs' thickness
const W = 4.0, L = 5.0, T = 0.14;
const PITCH = 44 * Math.PI / 180, TAN = Math.tan( PITCH ), COS = Math.cos( PITCH ), SIN = Math.sin( PITCH );
// the roof's overhangs: at the eaves, at the back gable, and over the porch at the front
const OV = 0.55, BACK = 0.5, FRONT = 1.4, PORCH = 1.2;
const ZB = - L / 2 - BACK, ZF = L / 2 + FRONT;
// openings: the door (clear width) and the two windows' spans across their walls
const DOOR = [ - 0.5, 0.5 ];
const WIN_F = [ 0.98, 1.5 ];
const WIN_B = [ 0.55, 1.13 ];
// the shed: its middle, width (x), depth (z), the height of its front and back walls
const SX = - 5.55, SZ = 0.45, SW = 2.2, SD = 1.8, SHF = 2.42, SHB = 2.06;

// the logs' heights are random, so the door head, the window sills and the eave follow from
// stacking them
const rng = ( () => {

	let s = 7654321;
	return () => ( ( s = Math.imul( s ^ ( s >>> 15 ), 2246822507 ) + 0x6d2b79f5 | 0 ) >>> 0 ) / 4294967296;

} )();

const COURSES = [];
let DH = 0, EH = 0;
{

	let y = - 0.14;
	while ( true ) {

		const h = 0.17 + rng() * 0.045;
		COURSES.push( { y, h } );
		y += h;
		// the door is cut through whole courses up to its head; one more log over it, then the eave
		if ( ! DH && y >= 2.07 ) DH = y;
		else if ( DH ) {

			EH = y;
			break;

		}

	}

}

// window heights snapped to the courses' joints
const snap = ( t ) => {

	let best = COURSES[ 0 ].y;
	for ( const c of COURSES ) if ( Math.abs( c.y - t ) < Math.abs( best - t ) ) best = c.y;
	return best;

};

const WY = [ snap( 0.98 ), snap( 1.58 ) ];
// the bottom log runs on under the door: its sill
const SILL = COURSES[ 0 ].y + COURSES[ 0 ].h;
if ( WY[ 1 ] - WY[ 0 ] < 0.45 ) WY[ 1 ] = COURSES.find( ( c ) => c.y > WY[ 0 ] + 0.45 ).y;

// the roof: the rafters' undersides rest on the wall plates; deck boards on the rafters, the
// shingles on the deck. u is the distance out from the ridge line
const RAFTER = 0.14, DECK = 0.03;
const rafterY = ( u ) => EH + 0.18 + ( W / 2 - 0.08 - u ) * TAN;
const deckY = ( u ) => rafterY( u ) + RAFTER / COS; // the deck's underside
const topY = ( u ) => deckY( u ) + DECK / COS; // the deck's top, under the shingles
const S = ( W / 2 + OV ) / COS; // along the slope, ridge to eave

export const LODGE = { W, L, T, EH, DH, PITCH, ZB, ZF, PORCH, SX, SZ, SW, SD };

// A cheap tapered tube along a curve (antlers, the bow of a saw): radius r0 at the start to r1
function horn( k, pts, r0, r1, mat, c, seg = 6 ) {

	const curve = new THREE.CatmullRomCurve3( pts );
	const tub = Math.max( 3, pts.length * 3 );
	const g = new THREE.TubeGeometry( curve, tub, 1, seg, false );
	const p = g.getAttribute( 'position' );
	for ( let i = 0; i < p.count; i ++ ) {

		const j = Math.floor( i / ( seg + 1 ) ), t = j / tub;
		const c0 = curve.getPointAt( t );
		const r = r0 + ( r1 - r0 ) * t;
		p.setXYZ( i, c0.x + ( p.getX( i ) - c0.x ) * r, c0.y + ( p.getY( i ) - c0.y ) * r, c0.z + ( p.getZ( i ) - c0.z ) * r );

	}

	g.computeVertexNormals();
	const mid = curve.getPointAt( 0.5 );
	k.add( g, mat, c, curve.getTangentAt( 0.5 ).toArray(), mid.toArray() );

}

// a box whose top follows top( x, z ) (boards under a sloping roof, cut to its line)
function tbox( k, cx, cz, w, d, yb, top, mat, c, axis = [ 0, 1, 0 ] ) {

	const g = new THREE.BoxGeometry( w, 1, d );
	const p = g.getAttribute( 'position' );
	for ( let i = 0; i < p.count; i ++ ) {

		const x = p.getX( i ) + cx, z = p.getZ( i ) + cz;
		p.setXYZ( i, x, p.getY( i ) > 0 ? top( x, z ) : yb, z );

	}

	g.deleteAttribute( 'normal' );
	k.add( g, mat, c, axis, [ cx, yb, cz ] );

}

// an upright cylinder standing on ( x, y, z )
function cyl( k, x, y, z, r, h, mat, c, seg = 12, r2 = r ) {

	const g = new THREE.CylinderGeometry( r2, r, h, seg );
	g.translate( x, y + h / 2, z );
	k.add( g, mat, c, [ 0, 1, 0 ], [ x, y, z ] );

}

// an oar, from the grip a to the blade's tip b; the blade lies flat to `up`
function oar( k, a, b, up ) {

	const dir = b.clone().sub( a ), len = dir.length();
	dir.normalize();
	const at = ( d ) => a.clone().addScaledVector( dir, d );
	const loom = mixc( '#7a6248', '#6a5540', 0.5 );
	// the grip, the loom, a leather sleeve where it worked in the rowlock, then the blade
	k.pole( at( 0 ), at( 0.26 ), 0.017, M.LOG, loom.clone().multiplyScalar( 0.75 ), 1 );
	k.pole( at( 0.26 ), at( len - 0.66 ), 0.024, M.LOG, loom, 2 );
	k.pole( at( 0.86 ), at( 1.08 ), 0.028, M.LEATHER, col( '#4a3322' ), 3 );
	const sh = new THREE.Shape();
	sh.moveTo( - 0.022, 0 );
	sh.bezierCurveTo( - 0.035, 0.16, - 0.072, 0.32, - 0.072, 0.58 );
	sh.quadraticCurveTo( - 0.072, 0.68, 0, 0.68 );
	sh.quadraticCurveTo( 0.072, 0.68, 0.072, 0.58 );
	sh.bezierCurveTo( 0.072, 0.32, 0.035, 0.16, 0.022, 0 );
	const g = new THREE.ExtrudeGeometry( sh, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, curveSegments: 8 } );
	g.translate( 0, 0, - 0.005 );
	const side = new THREE.Vector3().crossVectors( up, dir ).normalize();
	const nrm = new THREE.Vector3().crossVectors( dir, side );
	g.applyMatrix4( new THREE.Matrix4().makeBasis( side, dir, nrm ).setPosition( at( len - 0.68 ) ) );
	k.add( g, M.LOG, loom.clone().multiplyScalar( 0.9 ), dir.toArray() );
	// a ridge down the back of the blade, and the tip worn pale where it was pushed off stones
	k.pole( at( len - 0.68 ), at( len - 0.1 ), 0.011, M.LOG, loom.clone().multiplyScalar( 0.9 ), 4 );

}

// Builds the lodge and its shed; ground( x, z ) is the terrain height in the lodge's frame.
// Returns { geometry, parts, info }. parts (each its own BufferGeometry): door (in its hinge's
// frame: hinge at the origin, the leaf along +x; set at info.doorPivot, rotation.y = +info.doorOpen
// swings it in), shedDoor (the same at info.shedPivot, its leaf along -x; +info.shedOpen swings it
// out), padlock, oars, diary, radio, lampGlow (the lit flame and chimney), map (a flat board
// facing into the room, with uvs, for the game's texture).
export function buildLodge( ground ) {

	let seed = 3;
	const R = () => {

		const x = Math.sin( ( seed ++ ) * 127.1 + 311.7 ) * 43758.5453;
		return x - Math.floor( x );

	};

	// the floor stands a plinth's height above the highest ground under the lodge and its porch
	let gmax = - Infinity, gmin = Infinity;
	for ( const [ x, z ] of [ [ - W / 2, - L / 2 ], [ W / 2, - L / 2 ], [ - W / 2, L / 2 ], [ W / 2, L / 2 ], [ 0, 0 ], [ - W / 2, L / 2 + PORCH ], [ W / 2, L / 2 + PORCH ], [ 0, L / 2 + PORCH ], [ 0, - L / 2 ] ] ) {

		const g = ground( x, z );
		gmax = Math.max( gmax, g );
		gmin = Math.min( gmin, g );

	}

	const FY = gmax + 0.32;
	const base = gmin - 0.3;
	const RIDGE = FY + topY( 0 );
	// the shed's floor, on stone piers
	const sx0 = SX - SW / 2, sx1 = SX + SW / 2, sz0 = SZ - SD / 2, sz1 = SZ + SD / 2;
	let sg = - Infinity;
	for ( const [ x, z ] of [ [ sx0, sz0 ], [ sx1, sz0 ], [ sx0, sz1 ], [ sx1, sz1 ], [ SX, SZ ] ] ) sg = Math.max( sg, ground( x, z ) );
	const SFY = sg + 0.16;
	const shedTop = ( z ) => SFY + SHB + ( z - sz0 ) / SD * ( SHF - SHB );

	// ambient occlusion from where a point sits: in the room, under the roof and the porch, in
	// the shed, near the ground
	const ao = ( x, y, z, ny ) => {

		let a = 1;
		const ax = Math.abs( x ), az = Math.abs( z );
		if ( ax < W / 2 - T * 0.6 && az < L / 2 - T * 0.6 && y > FY - 0.2 && y < RIDGE ) a = 0.55 + 0.25 * THREE.MathUtils.smoothstep( y - FY, 0, 2.2 );
		else if ( ax < W / 2 + OV && z > ZB && z < ZF && y < FY + topY( ax ) ) a = z > L / 2 ? 0.5 + 0.4 * Math.min( 1, ( z - L / 2 ) / FRONT ) : 0.72;
		if ( x > sx0 && x < sx1 && z > sz0 && z < sz1 && y > SFY - 0.1 && y < shedTop( z ) ) a = Math.min( a, 0.5 + 0.15 * ( y - SFY ) / 2 );
		if ( ny < - 0.5 ) a *= 0.7;
		const g = ground( x, z );
		a *= 0.5 + 0.5 * THREE.MathUtils.smoothstep( y - g, - 0.05, 0.5 );
		return Math.min( 1, a );

	};

	const k = new Kit( ground, ao );
	const parts = {};
	const info = { floorY: FY };
	const Y = ( y ) => FY + y;

	// squared spruce logs: warm brown where the eave keeps the rain off, silvered and darker
	// toward the plinth and on the weather side
	const logCol = ( y, exposed ) => {

		const warm = [ '#553a26', '#624430', '#4d3525', '#6a4b33' ][ Math.floor( R() * 4 ) ];
		const c = mixc( warm, '#6a655f', Math.min( 1, exposed * 0.5 + ( 1 - y / 2.4 ) * 0.25 + R() * 0.15 ) );
		return c.multiplyScalar( 0.75 + 0.25 * R() );

	};

	const board = ( a = 0.35 ) => mixc( '#6a4a2e', '#8a6a48', R() ).multiplyScalar( 0.72 + a * R() );
	const grey = ( a = 0.3 ) => mixc( '#4f453b', '#675d52', R() ).multiplyScalar( 0.75 + a * R() );
	const shutterCol = () => mixc( '#3d5639', '#566b4b', R() ).multiplyScalar( 0.75 + 0.2 * R() );
	const iron = col( '#34302b' );

	// --- the rubble plinth under the walls, and footing stones along it
	{

		const top = Y( COURSES[ 0 ].y ), h = top - base, cy = ( top + base ) / 2, t = 0.46, o = 0.03;
		k.box( 0, cy, - L / 2 + t / 2 - o, W + 2 * o, h, t, M.RUBBLE, '#8d877c' );
		k.box( 0, cy, L / 2 - t / 2 + o, W + 2 * o, h, t, M.RUBBLE, '#8d877c' );
		for ( const xs of [ - 1, 1 ] ) k.box( xs * ( W / 2 - t / 2 + o ), cy, 0, t, h, L - 2 * t + 0.2, M.RUBBLE, '#8d877c' );
		// a mortared cap along its top, where the sill log beds
		for ( const zs of [ - 1, 1 ] ) k.box( 0, top - 0.02, zs * ( L / 2 - T / 2 ), W + 0.07, 0.04, T + 0.08, M.STONE, '#8a857c' );
		for ( const xs of [ - 1, 1 ] ) k.box( xs * ( W / 2 - T / 2 ), top - 0.02, 0, T + 0.08, 0.04, L, M.STONE, '#8a857c' );
		for ( let i = 0; i < 18; i ++ ) {

			const side = i % 4, t2 = R() - 0.5;
			const x = side < 2 ? t2 * W : ( side === 2 ? - 1 : 1 ) * ( W / 2 + 0.1 );
			const z = side < 2 ? ( side === 0 ? - 1 : 1 ) * ( L / 2 + 0.1 ) : t2 * L;
			if ( side === 1 ) continue; // under the porch
			const g = ground( x, z );
			if ( g > top - 0.1 ) continue;
			k.stone( x, g, z, 0.14 + R() * 0.16, 0.08 + R() * 0.1, 0.12 + R() * 0.12, mixc( '#9c978c', '#7a7266', R() ), R() * 50 );

		}

	}

	// --- the log walls. Squared logs, the same courses all round, dovetailed flush at the
	// corners: the front and back logs run through the corner on even courses, the side logs on
	// odd ones, so the end grain shows in a checker up each corner
	const zf = L / 2 - T / 2, xw = W / 2 - T / 2;
	const doorCut = [ DOOR[ 0 ] - 0.1, DOOR[ 1 ] + 0.1 ];
	const wfCut = [ WIN_F[ 0 ] - 0.07, WIN_F[ 1 ] + 0.07 ], wbCut = [ WIN_B[ 0 ] - 0.07, WIN_B[ 1 ] + 0.07 ];
	const logBeam = ( a, b, h, c ) => beam( k, a, b, T - 0.004 + ( R() - 0.5 ) * 0.012, h - 0.006, M.LOG, c, { round: 0.03 } );
	COURSES.forEach( ( { y, h }, i ) => {

		const cy = Y( y + h / 2 ), through = i % 2 === 0;
		for ( const zs of [ - 1, 1 ] ) {

			const cuts = [];
			if ( zs > 0 && i > 0 && y + h <= DH + 0.001 ) cuts.push( doorCut );
			if ( y >= WY[ 0 ] - 0.001 && y + h <= WY[ 1 ] + 0.001 ) cuts.push( zs > 0 ? wfCut : wbCut );
			cuts.sort( ( p, q ) => p[ 0 ] - q[ 0 ] );
			const e0 = through ? W / 2 + R() * 0.012 : W / 2 - T, e1 = through ? W / 2 + R() * 0.012 : W / 2 - T;
			let x0 = - e0;
			for ( const [ a, b ] of [ ...cuts, [ e1, e1 ] ] ) {

				if ( a - x0 > 0.05 ) logBeam( V( x0, cy, zs * zf + ( R() - 0.5 ) * 0.01 ), V( a, cy, zs * zf + ( R() - 0.5 ) * 0.01 ), h, logCol( y + h / 2, zs < 0 ? 0.55 : 0.2 ) );
				x0 = b;

			}

		}

		for ( const xs of [ - 1, 1 ] ) {

			const e0 = ! through ? L / 2 + R() * 0.012 : L / 2 - T, e1 = ! through ? L / 2 + R() * 0.012 : L / 2 - T;
			logBeam( V( xs * xw + ( R() - 0.5 ) * 0.01, cy, - e0 ), V( xs * xw + ( R() - 0.5 ) * 0.01, cy, e1 ), h, logCol( y + h / 2, xs < 0 ? 0.45 : 0.35 ) );

		}

	} );

	// moss chinking in the joints: a dark core inside each wall, round the openings
	{

		const chink = ( cx, cz, sx, sz, ya, yb ) => k.box( cx, Y( ( ya + yb ) / 2 ), cz, sx, yb - ya, sz, M.LEATHER, '#3a3526' );
		const y0 = COURSES[ 0 ].y + 0.02, t = T * 0.4;
		const run = ( zs, cuts ) => {

			let x = - W / 2 + 0.01;
			for ( const [ a, b, ya, yb ] of cuts ) {

				chink( ( x + a ) / 2, zs * zf, a - x, t, y0, EH );
				if ( ya - y0 > 0.01 ) chink( ( a + b ) / 2, zs * zf, b - a, t, y0, ya );
				if ( EH - yb > 0.01 ) chink( ( a + b ) / 2, zs * zf, b - a, t, yb, EH );
				x = b;

			}

			chink( ( x + W / 2 - 0.01 ) / 2, zs * zf, W / 2 - 0.01 - x, t, y0, EH );

		};

		run( 1, [ [ ...doorCut, SILL - 0.02, DH ], [ ...wfCut, WY[ 0 ], WY[ 1 ] ] ] );
		run( - 1, [ [ ...wbCut, WY[ 0 ], WY[ 1 ] ] ] );
		for ( const xs of [ - 1, 1 ] ) chink( xs * xw, 0, t, L - 0.02, y0, EH );

	}

	// --- door and window frames: squared posts, a head, a sill; the casements with their bars
	const frame = '#4a3321';
	{

		// the door frame: two posts on the sill log, a head under the lintel log, the sill worn
		// pale where it has been stepped over
		for ( const x of [ DOOR[ 0 ] - 0.05, DOOR[ 1 ] + 0.05 ] ) k.box( x, Y( ( SILL + DH ) / 2 ), zf + 0.01, 0.1, DH - SILL, T + 0.04, M.LOG, col( frame, 0.9 + 0.2 * R() ), { axis: [ 0, 1, 0 ] } );
		k.box( ( DOOR[ 0 ] + DOOR[ 1 ] ) / 2, Y( DH - 0.035 ), zf + 0.01, DOOR[ 1 ] - DOOR[ 0 ] + 0.2, 0.07, T + 0.04, M.LOG, col( frame ), { axis: [ 1, 0, 0 ] } );
		k.box( ( DOOR[ 0 ] + DOOR[ 1 ] ) / 2, Y( SILL - 0.004 ), zf + 0.005, DOOR[ 1 ] - DOOR[ 0 ] - 0.1, 0.01, T - 0.02, M.LOG, col( '#8a7a66' ), { axis: [ 1, 0, 0 ] } );
		// the hinge side's pintles
		for ( const y of [ 0.28, DH - 0.38 ] ) k.box( DOOR[ 0 ] - 0.01, Y( y ), zf - 0.03, 0.03, 0.06, 0.03, M.IRON, iron );
		// the latch's keeper on the other post
		k.box( DOOR[ 1 ] + 0.01, Y( 1.02 ), zf - 0.07, 0.03, 0.05, 0.04, M.IRON, iron );

		const win = ( a, b, zs ) => {

			const z = zs * zf, y0 = Y( WY[ 0 ] ), y1 = Y( WY[ 1 ] ), w = b - a, cx = ( a + b ) / 2;
			// posts, head and a sill sloped out to shed the rain
			for ( const x of [ a - 0.035, b + 0.035 ] ) k.box( x, ( y0 + y1 ) / 2, z, 0.07, y1 - y0, T + 0.03, M.LOG, col( frame ), { axis: [ 0, 1, 0 ] } );
			k.box( cx, y1 - 0.03, z, w, 0.06, T + 0.03, M.LOG, col( frame ), { axis: [ 1, 0, 0 ] } );
			k.box( cx, y0 + 0.03, z + zs * 0.03, w + 0.2, 0.06, T + 0.1, M.LOG, col( '#5b4633' ), { axis: [ 1, 0, 0 ], rot: [ zs * 0.12, 0, 0 ] } );
			// the casement: two leaves, each of three panes, a little in from the outer face
			const zc = z - zs * 0.02, gy0 = y0 + 0.06, gy1 = y1 - 0.06, gh = gy1 - gy0;
			k.box( cx, ( gy0 + gy1 ) / 2, zc - zs * 0.004, w, gh, 0.006, M.BRONZE, col( '#0e1213' ) );
			for ( const x of [ a + 0.02, cx, b - 0.02 ] ) k.box( x, ( gy0 + gy1 ) / 2, zc, x === cx ? 0.05 : 0.04, gh, 0.04, M.LOG, col( '#5c5a50' ), { axis: [ 0, 1, 0 ] } );
			for ( const y of [ gy0 + 0.02, gy0 + gh / 3, gy0 + gh * 2 / 3, gy1 - 0.02 ] ) k.box( cx, y, zc, w, y === gy0 + 0.02 || y === gy1 - 0.02 ? 0.04 : 0.022, 0.035, M.LOG, col( '#5c5a50' ), { axis: [ 1, 0, 0 ] } );
			// the shutters, folded back flat against the logs: boards on two battens, a Z brace
			const sw = w / 2 + 0.05, sh = y1 - y0 + 0.04;
			for ( const s of [ - 1, 1 ] ) {

				const sx = s < 0 ? a - 0.07 - sw / 2 : b + 0.07 + sw / 2, sz = z + zs * ( T / 2 + 0.03 ), c = shutterCol();
				for ( let i = 0; i < 3; i ++ ) k.box( sx - sw / 2 + sw / 6 + i * sw / 3, ( y0 + y1 ) / 2, sz, sw / 3 - 0.006, sh - R() * 0.015, 0.025, M.LOG, c.clone().multiplyScalar( 0.9 + 0.2 * R() ), { axis: [ 0, 1, 0 ] } );
				for ( const y of [ y0 + 0.12, y1 - 0.12 ] ) k.box( sx, y, sz + zs * 0.02, sw - 0.04, 0.07, 0.018, M.LOG, c, { axis: [ 1, 0, 0 ] } );
				beam( k, V( sx - sw / 2 + 0.05, y0 + 0.16, sz + zs * 0.02 ), V( sx + sw / 2 - 0.05, y1 - 0.16, sz + zs * 0.02 ), 0.06, 0.018, M.LOG, c, { up: V( 0, 0, 1 ) } );
				// its hinges' ends and a turn-button holding it back
				for ( const y of [ y0 + 0.12, y1 - 0.12 ] ) k.box( s < 0 ? sx + sw / 2 - 0.08 : sx - sw / 2 + 0.08, y, sz + zs * 0.032, 0.16, 0.025, 0.006, M.IRON, iron );
				k.box( s < 0 ? sx - sw / 2 - 0.03 : sx + sw / 2 + 0.03, ( y0 + y1 ) / 2, z + zs * ( T / 2 + 0.02 ), 0.02, 0.09, 0.02, M.IRON, iron );

			}

		};

		win( WIN_F[ 0 ], WIN_F[ 1 ], 1 );
		win( WIN_B[ 0 ], WIN_B[ 1 ], - 1 );

	}

	// --- the gables, boarded upright: each board cut to the roof's line, a drip at their foot
	// where they lap down over the top log
	for ( const zs of [ - 1, 1 ] ) {

		const z = zs * ( L / 2 + 0.013 ), yb = Y( EH - 0.1 );
		for ( const xs of [ - 1, 1 ] ) {

			let u = 0;
			while ( u < W / 2 + 0.02 ) {

				const w = Math.min( 0.13 + R() * 0.08, W / 2 + 0.03 - u );
				const c = mixc( '#4b3829', '#6b5846', R() ).multiplyScalar( 0.8 + 0.3 * R() );
				tbox( k, xs * ( u + w / 2 ), z, w - 0.006, 0.024, yb - R() * 0.03, ( x ) => Y( deckY( Math.abs( x ) ) ) - 0.004, M.LOG, c );
				u += w;

			}

		}

		// a batten over each joint on the front, rough and uneven
		k.box( 0, Y( EH - 0.12 ), zs * ( L / 2 + 0.03 ), W + 0.06, 0.05, 0.03, M.LOG, grey(), { axis: [ 1, 0, 0 ] } );

	}

	// a small hatch high in the back gable, to the loft over the tie beams
	k.box( 0, Y( EH + 0.75 ), - L / 2 - 0.035, 0.5, 0.55, 0.025, M.LOG, grey(), { axis: [ 0, 1, 0 ] } );
	for ( const y of [ EH + 0.58, EH + 0.92 ] ) k.box( 0.08, Y( y ), - L / 2 - 0.05, 0.3, 0.03, 0.006, M.IRON, iron );

	// --- the roof. Purlins run the length of it: the wall plates on the side walls and the
	// ridge purlin on the gables, out over the porch on knee braces. Rafters on them, pairs every
	// metre or so, their feet showing under the eaves; the deck; the shingles course by course
	const purlin = '#46301f';
	const zl = ZF - ZB, zc = ( ZF + ZB ) / 2;
	for ( const xs of [ - 1, 1 ] ) beam( k, V( xs * ( W / 2 - 0.08 ), Y( EH + 0.09 ), ZB + 0.05 ), V( xs * ( W / 2 - 0.08 ), Y( EH + 0.09 ), ZF - 0.05 ), 0.16, 0.18, M.LOG, col( purlin, 0.9 + 0.2 * R() ), { round: 0.03 } );
	beam( k, V( 0, Y( rafterY( 0.1 ) - 0.1 ), ZB + 0.05 ), V( 0, Y( rafterY( 0.1 ) - 0.1 ), ZF - 0.05 ), 0.16, 0.2, M.LOG, col( purlin ), { round: 0.03 } );
	// boards stood on the wall plates between the rafters, closing the eaves
	for ( const xs of [ - 1, 1 ] ) tbox( k, xs * ( W / 2 - 0.03 ), 0, 0.03, L + 0.02, Y( EH + 0.17 ), ( x ) => Y( deckY( Math.abs( x ) ) ) - 0.003, M.LOG, col( '#4d3a2a' ), [ 0, 0, 1 ] );
	// two tie beams across the room at the eave
	for ( const z of [ - 0.85, 0.95 ] ) beam( k, V( - W / 2 + 0.02, Y( EH - 0.08 ), z ), V( W / 2 - 0.02, Y( EH - 0.08 ), z ), 0.14, 0.16, M.LOG, logCol( 2.2, 0.1 ), { round: 0.03 } );
	// knee braces under the purlins' ends, out over the porch and at the back
	for ( const zs of [ - 1, 1 ] ) {

		const zw = zs * ( L / 2 + 0.03 ), out = zs > 0 ? 0.75 : 0.35;
		for ( const xs of [ - 1, 1 ] ) beam( k, V( xs * ( W / 2 - 0.08 ), Y( EH - 0.55 ), zw ), V( xs * ( W / 2 - 0.08 ), Y( EH + 0.0 ), zw + zs * out ), 0.1, 0.1, M.LOG, col( purlin ) );
		if ( zs < 0 ) {

			const ry = rafterY( 0.1 ) - 0.2;
			beam( k, V( 0, Y( ry - 0.4 ), zw ), V( 0, Y( ry ), zw + zs * 0.42 ), 0.09, 0.09, M.LOG, col( purlin ) );

		}

	}

	// rafters: square to the slope, from the ridge out past the wall plates
	{

		const zs = [ ZB + 0.05, - L / 2 + 0.08 ];
		const n = 5;
		for ( let i = 1; i < n; i ++ ) zs.push( - L / 2 + 0.08 + ( L - 0.16 ) * i / n );
		zs.push( L / 2 - 0.08, L / 2 + 0.66, ZF - 0.05 );
		for ( const z of zs ) for ( const xs of [ - 1, 1 ] ) {

			const u1 = W / 2 + OV - 0.04;
			const mid = ( rafterY( 0 ) + rafterY( u1 ) ) / 2 + RAFTER / COS / 2;
			const len = u1 / COS;
			k.box( xs * u1 / 2, Y( mid ), z, len, RAFTER, 0.08, M.LOG, col( purlin, 0.85 + 0.25 * R() ), { rot: [ 0, 0, - xs * PITCH ], axis: [ xs * COS, - SIN, 0 ] } );

		}

	}

	// the frame on the deck's top: s along the slope from the ridge, lifted off it by `lift`
	const slope = ( xs, s, lift ) => V( xs * s * COS + xs * SIN * lift, Y( topY( 0 ) ) - s * SIN + COS * lift, 0 );
	{

		// the deck: boards down the slope, a crack of daylight between some of them (seen from
		// beneath, in the room and under the eaves)
		for ( const xs of [ - 1, 1 ] ) {

			const mid = slope( xs, S / 2, - DECK / 2 );
			let z = ZB;
			while ( z < ZF - 0.02 ) {

				const w = Math.min( 0.16 + R() * 0.08, ZF - z );
				k.box( mid.x, mid.y, z + w / 2, S, DECK, w - 0.004 - ( R() < 0.3 ? 0.008 : 0 ), M.LOG, mixc( '#4d3a2a', '#6a5238', R() ), { rot: [ 0, 0, - xs * PITCH ], axis: [ xs * COS, - SIN, 0 ] } );
				z += w;

			}

		}

		// shingles: split larch, silvered; only their tops and lower ends are ever seen, so
		// that is all they are made of
		const t = 0.011, exposure = 0.21;
		const shingleCols = [ '#7a7166', '#857b6f', '#6c655b', '#8f8578', '#746a5e', '#80766a', '#655e55' ];
		const shingle = ( len, w, low ) => {

			const g = new THREE.BoxGeometry( len, t, w );
			const ia = Array.from( g.index.array );
			g.setIndex( [ ...ia.slice( 12, 18 ), ...( low > 0 ? ia.slice( 0, 6 ) : ia.slice( 6, 12 ) ) ] );
			g.clearGroups();
			return g;

		};

		for ( const xs of [ - 1, 1 ] ) {

			const courses = Math.ceil( ( S + 0.08 ) / exposure ) + 1;
			for ( let c = - 2; c < courses; c ++ ) {

				const u0 = Math.max( 0, c ) * exposure;
				let z = ZB - 0.02 - R() * 0.06;
				while ( z < ZF + 0.02 ) {

					const w = 0.09 + R() * 0.08, len = 0.55 + R() * 0.12;
					if ( z + w > ZF + 0.05 ) break;
					const sLow = S + 0.07 - u0 + ( R() - 0.5 ) * 0.07 + ( c < 0 ? 0.02 : 0 ), sHigh = Math.max( 0.0, sLow - len );
					const lenC = sLow - sHigh;
					const tilt = Math.atan( 2 * t / Math.max( lenC, 0.1 ) );
					const p = slope( xs, ( sLow + sHigh ) / 2, c < 0 ? ( c + 2 ) * t * 0.9 : 2 * t + c * 0.0002 );
					const g = shingle( lenC, w, xs );
					const curl = R() < 0.06 ? 0.03 + R() * 0.04 : 0;
					k.put( g, p.x, p.y, z + w / 2, [ ( R() - 0.5 ) * 0.04, ( R() - 0.5 ) * 0.06, - xs * ( PITCH - ( c < 0 ? 0 : tilt ) - curl ) + ( R() - 0.5 ) * 0.02, 'YXZ' ] );
					k.add( g, M.SHINGLE, col( shingleCols[ Math.floor( R() * shingleCols.length ) ], 0.85 + 0.3 * R() ), [ xs * COS, - SIN, 0 ], [ p.x, p.y, z ] );
					z += w + 0.003 + R() * 0.01;

				}

			}

			// ridge boards along the top, lapped
			const p = slope( xs, 0.1, 4 * t + 0.02 );
			k.box( p.x, p.y, zc, 0.22, 0.03, zl + 0.02, M.LOG, grey(), { rot: [ 0, 0, - xs * PITCH ], axis: [ 0, 0, 1 ] } );

		}

		// barge boards along the gable edges, and the purlins' ends showing under them
		for ( const zz of [ ZB - 0.02, ZF + 0.02 ] ) for ( const xs of [ - 1, 1 ] ) {

			const p = slope( xs, S / 2, - 0.02 );
			k.box( p.x, p.y, zz, S + 0.06, 0.24, 0.04, M.LOG, grey(), { rot: [ 0, 0, - xs * PITCH ], axis: [ 1, 0, 0 ] } );

		}

		// a short carved king piece where the barge boards meet at the front
		{

			const p = slope( 1, 0, 0 );
			k.box( 0, p.y - 0.1, ZF + 0.045, 0.09, 0.34, 0.05, M.LOG, grey(), { axis: [ 0, 1, 0 ] } );
			k.box( 0, p.y - 0.29, ZF + 0.045, 0.05, 0.06, 0.05, M.LOG, grey(), { axis: [ 0, 1, 0 ], rot: [ 0, 0, Math.PI / 4 ] } );

		}

	}

	// --- the stovepipe through the roof, a sheet of flashing round it, a round rain cap on
	// three stays (r6)
	const PIPE = V( - 1.45, 0, - 2.08 );
	{

		const u = Math.abs( PIPE.x );
		const roofAt = Y( topY( u ) );
		const top = roofAt + 1.25;
		cyl( k, PIPE.x, roofAt - 0.25, PIPE.z, 0.08, top - roofAt + 0.25, M.IRON, col( '#403e3b' ), 12 );
		cyl( k, PIPE.x, top - 0.02, PIPE.z, 0.085, 0.05, M.IRON, col( '#5e5d58' ), 12 );
		// flashing: a square of sheet on the shingles, the pipe's collar
		k.box( PIPE.x + 0.03, roofAt + 0.04, PIPE.z, 0.62, 0.012, 0.6, M.IRON, col( '#5b5a55' ), { rot: [ 0, 0, PITCH ] } );
		cyl( k, PIPE.x, roofAt, PIPE.z, 0.11, 0.12, M.IRON, col( '#56554f' ), 12, 0.09 );
		for ( let i = 0; i < 3; i ++ ) {

			const a = i / 3 * Math.PI * 2;
			k.box( PIPE.x + Math.cos( a ) * 0.09, top + 0.08, PIPE.z + Math.sin( a ) * 0.09, 0.012, 0.16, 0.012, M.IRON, col( '#4e4d48' ) );

		}

		const cap = new THREE.ConeGeometry( 0.26, 0.09, 16, 1, true );
		cap.translate( PIPE.x, top + 0.2, PIPE.z );
		k.add( cap, M.IRON, col( '#5f5e59' ), [ 0, 1, 0 ] );
		cyl( k, PIPE.x, top + 0.145, PIPE.z, 0.26, 0.012, M.IRON, col( '#55544f' ), 16 );

	}

	// --- inside. One room open to its rafters: a plank floor from the door to the back wall,
	// the desk under the back window, the map beside it, the stove in the back corner, the cot
	// along the east wall, the gun rack and shelves on the west wall
	const x0 = - W / 2 + T, x1 = W / 2 - T, z0 = - L / 2 + T, z1 = L / 2 - T;
	const furniture = [];
	{

		for ( let x = x0; x < x1 - 0.02; x += 0.18 ) k.box( x + 0.09, Y( - 0.02 ), 0, 0.178, 0.04, z1 - z0, M.LOG, board(), { axis: [ 0, 0, 1 ] } );

		// the desk: a plain deal table under the window, a drawer in its apron
		const tx = ( WIN_B[ 0 ] + WIN_B[ 1 ] ) / 2, tz = z0 + 0.32, TH = 0.76, TW = 1.2, TD = 0.62;
		k.box( tx, Y( TH - 0.018 ), tz, TW, 0.035, TD, M.LOG, board( 0.3 ), { axis: [ 1, 0, 0 ] } );
		for ( const [ dx, dz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) k.box( tx + dx * ( TW / 2 - 0.05 ), Y( ( TH - 0.035 ) / 2 ), tz + dz * ( TD / 2 - 0.05 ), 0.05, TH - 0.035, 0.05, M.LOG, col( '#5e4430' ), { axis: [ 0, 1, 0 ] } );
		for ( const dz of [ - 1, 1 ] ) k.box( tx, Y( TH - 0.09 ), tz + dz * ( TD / 2 - 0.05 ), TW - 0.1, 0.1, 0.022, M.LOG, col( '#5e4430' ), { axis: [ 1, 0, 0 ] } );
		for ( const dx of [ - 1, 1 ] ) k.box( tx + dx * ( TW / 2 - 0.05 ), Y( TH - 0.09 ), tz, 0.022, 0.1, TD - 0.1, M.LOG, col( '#5e4430' ), { axis: [ 0, 0, 1 ] } );
		k.box( tx + 0.2, Y( TH - 0.09 ), tz + TD / 2 - 0.035, 0.42, 0.08, 0.02, M.LOG, board( 0.2 ), { axis: [ 1, 0, 0 ] } );
		k.box( tx + 0.2, Y( TH - 0.09 ), tz + TD / 2 - 0.018, 0.03, 0.02, 0.02, M.BRONZE, '#6a5530' );
		furniture.push( [ tx, tz, TW / 2, TD / 2 ] );

		// the chair: an Alpine board chair, the seat on four splayed legs, a shaped back
		{

			const cx = tx - 0.12, cz = tz + TD / 2 + 0.12, sy = 0.45;
			const c = board( 0.25 );
			k.box( cx, Y( sy ), cz, 0.4, 0.035, 0.38, M.LOG, c, { axis: [ 1, 0, 0 ], rot: [ 0, 0.12, 0 ] } );
			for ( const [ dx, dz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) k.pole( V( cx + dx * 0.2, Y( 0 ), cz + dz * 0.19 ), V( cx + dx * 0.14, Y( sy - 0.02 ), cz + dz * 0.13 ), 0.018, M.LOG, c, dx + dz * 2 );
			const back = new THREE.Shape();
			back.moveTo( - 0.14, 0 ); back.lineTo( 0.14, 0 ); back.lineTo( 0.17, 0.3 );
			back.quadraticCurveTo( 0.19, 0.42, 0.1, 0.44 ); back.quadraticCurveTo( 0, 0.4, - 0.1, 0.44 );
			back.quadraticCurveTo( - 0.19, 0.42, - 0.17, 0.3 ); back.lineTo( - 0.14, 0 );
			const hole = new THREE.Path();
			hole.absarc( 0, 0.3, 0.035, 0, Math.PI * 2, true );
			back.holes.push( hole );
			const bg = new THREE.ExtrudeGeometry( back, { depth: 0.03, bevelEnabled: false, curveSegments: 6 } );
			bg.translate( 0, 0, - 0.015 );
			bg.rotateX( 0.18 );
			bg.rotateY( 0.12 );
			bg.translate( cx + 0.02, Y( sy + 0.015 ), cz + 0.17 );
			k.add( bg, M.LOG, c, [ 0, 1, 0 ], [ cx, Y( sy ), cz ] );
			furniture.push( [ cx, cz, 0.22, 0.22 ] );

		}

		// on the desk: papers, a pencil, a mug, an ashtray (the diary, the telephone and the
		// lamp are parts)
		const top = Y( TH );
		k.box( tx + 0.12, top + 0.006, tz + 0.1, 0.22, 0.012, 0.3, M.LEATHER, '#cfc6ae', { rot: [ 0, 0.2, 0 ] } );
		k.box( tx + 0.14, top + 0.016, tz + 0.12, 0.21, 0.008, 0.29, M.LEATHER, '#d9d0b8', { rot: [ 0, 0.05, 0 ] } );
		k.box( tx - 0.02, top + 0.005, tz + 0.2, 0.15, 0.008, 0.008, M.LOG, '#8a6a2a', { rot: [ 0, 0.5, 0 ] } );
		cyl( k, tx + 0.46, top, tz + 0.16, 0.04, 0.09, M.IRON, '#8b8a82', 12 );
		cyl( k, tx + 0.46, top + 0.088, tz + 0.16, 0.034, 0.004, M.VOID, '#000000', 12 );
		cyl( k, tx + 0.34, top, tz + 0.2, 0.055, 0.02, M.IRON, '#56554f', 12, 0.06 );
		const DIARY = V( tx - 0.18, top, tz + 0.1 ), RADIO = V( tx + 0.36, top, tz - 0.1 ), LAMP = V( tx - 0.46, top, tz - 0.12 );

		// the diary: a clothbound ledger, lying open at the last page written
		{

			const dk = new Kit( ground, ao ), p = DIARY, rot = 0.15;
			const put = ( lx, ly, lz, sx, sy, sz, mat, c, rz = 0 ) => {

				const cs = Math.cos( rot ), sn = Math.sin( rot );
				dk.box( p.x + lx * cs + lz * sn, p.y + ly, p.z - lx * sn + lz * cs, sx, sy, sz, mat, c, { rot: [ 0, rot, rz ] } );

			};

			put( 0, 0.004, 0, 0.36, 0.008, 0.25, M.LEATHER, '#3a2a22' );
			put( - 0.086, 0.017, 0, 0.165, 0.018, 0.235, M.LEATHER, '#ddd3ba', 0.06 );
			put( 0.086, 0.017, 0, 0.165, 0.018, 0.235, M.LEATHER, '#d8ceb4', - 0.06 );
			// writing: grey lines down the right hand page
			for ( let i = 0; i < 9; i ++ ) put( 0.08 + ( R() - 0.5 ) * 0.01, 0.0275 - 0.0005 * i, - 0.085 + i * 0.02, 0.12 - ( i === 8 ? 0.06 : R() * 0.03 ), 0.001, 0.004, M.LEATHER, '#4a4a52', - 0.06 );
			put( 0, 0.03, 0.14, 0.005, 0.002, 0.08, M.LEATHER, '#6a1e1a' );
			parts.diary = dk.build();
			info.diary = [ p.x, p.y + 0.02, p.z ];

		}

		// the field telephone: an olive steel case, the handset in its cradle on top, the
		// generator's crank on its side, the line out of its back and up the wall
		{

			const rk = new Kit( ground, ao ), p = RADIO, olive = col( '#474a33' ), dark = col( '#1d1c1a' );
			const rot = - 0.1, cs = Math.cos( rot ), sn = Math.sin( rot );
			const P = ( lx, ly, lz ) => V( p.x + lx * cs + lz * sn, p.y + ly, p.z - lx * sn + lz * cs );
			const put = ( lx, ly, lz, sx, sy, sz, mat, c, extra = {} ) => {

				const q = P( lx, ly, lz );
				rk.box( q.x, q.y, q.z, sx, sy, sz, mat, c, { ...extra, rot: [ 0, rot, 0 ] } );

			};

			put( 0, 0.08, 0, 0.28, 0.16, 0.2, M.IRON, olive, { round: 0.01 } );
			put( 0, 0.162, 0, 0.29, 0.012, 0.21, M.IRON, olive.clone().multiplyScalar( 0.85 ) );
			// the handset: earpiece and mouthpiece on a grip, in two forks
			put( 0, 0.2, 0.02, 0.2, 0.028, 0.035, M.LEATHER, dark );
			for ( const s of [ - 1, 1 ] ) {

				const q = P( s * 0.09, 0.19, 0.02 );
				rk.add( new THREE.CylinderGeometry( 0.034, 0.028, 0.035, 12 ).translate( q.x, q.y, q.z ), M.LEATHER, dark, [ 0, 1, 0 ] );
				put( s * 0.06, 0.172, 0.02, 0.014, 0.02, 0.05, M.IRON, dark );

			}

			// the crank
			put( 0.15, 0.08, 0.0, 0.02, 0.02, 0.02, M.IRON, iron );
			put( 0.165, 0.08, - 0.04, 0.012, 0.018, 0.1, M.IRON, iron );
			put( 0.19, 0.08, - 0.085, 0.05, 0.02, 0.02, M.LEATHER, dark );
			// terminals and a dial plate on the front
			for ( const s of [ - 1, 1 ] ) put( s * 0.09, 0.05, 0.102, 0.018, 0.018, 0.012, M.BRONZE, col( '#6a5a36' ) );
			put( 0, 0.1, 0.101, 0.1, 0.05, 0.004, M.IRON, col( '#262622' ) );
			// the canvas strap, slack across the top
			put( - 0.07, 0.172, 0, 0.035, 0.006, 0.22, M.LEATHER, col( '#5a5438' ) );
			put( 0.07, 0.172, 0, 0.035, 0.006, 0.22, M.LEATHER, col( '#5a5438' ) );
			parts.radio = rk.build();
			info.radio = [ p.x, p.y + 0.1, p.z ];
			// the line: from the terminals over the desk's back edge, up the wall, out under the eave
			const a = P( 0.09, 0.05, 0.11 );
			k.pole( a, V( a.x + 0.05, top + 0.004, a.z + 0.12 ), 0.003, M.LEATHER, '#1a1a1a', 1 );
			k.pole( V( a.x + 0.05, top + 0.004, a.z + 0.12 ), V( tx + 0.58, top + 0.004, z0 + 0.02 ), 0.003, M.LEATHER, '#1a1a1a', 2 );
			k.pole( V( tx + 0.58, top + 0.004, z0 + 0.012 ), V( tx + 0.58, Y( EH + 0.1 ), z0 + 0.012 ), 0.003, M.LEATHER, '#1a1a1a', 3 );
			for ( let y = 1.0; y < EH; y += 0.45 ) k.box( tx + 0.58, Y( y ), z0 + 0.012, 0.02, 0.006, 0.012, M.IRON, iron );

		}

		// the oil lamp: a brass font, the burner, a glass chimney (glowing when lit: lampGlow)
		{

			const p = LAMP;
			lathe( k, [ [ 0, 0 ], [ 0.058, 0 ], [ 0.062, 0.012 ], [ 0.04, 0.03 ], [ 0.028, 0.06 ], [ 0.05, 0.085 ], [ 0.058, 0.115 ], [ 0.045, 0.14 ], [ 0.018, 0.15 ], [ 0, 0.15 ] ], p, M.BRONZE, col( '#7a6034' ), 14 );
			cyl( k, p.x, p.y + 0.145, p.z, 0.026, 0.03, M.IRON, col( '#5a5040' ), 10 );
			// the chimney's gallery, and a little wheel for the wick
			cyl( k, p.x, p.y + 0.172, p.z, 0.03, 0.012, M.BRONZE, col( '#6a5530' ), 12 );
			k.box( p.x + 0.035, p.y + 0.16, p.z, 0.004, 0.018, 0.018, M.IRON, iron );
			const gk = new Kit( ground, ao );
			lathe( gk, [ [ 0.024, 0 ], [ 0.028, 0.02 ], [ 0.036, 0.05 ], [ 0.033, 0.08 ], [ 0.022, 0.11 ], [ 0.02, 0.18 ], [ 0.021, 0.19 ] ], V( p.x, p.y + 0.178, p.z ), M.GLOW, col( '#2c1807' ), 12 );
			const flame = new THREE.SphereGeometry( 1, 8, 6 );
			flame.scale( 0.009, 0.026, 0.009 );
			flame.translate( p.x, p.y + 0.215, p.z );
			gk.add( flame, M.GLOW, col( '#b8802e' ), [ 0, 1, 0 ] );
			parts.lampGlow = gk.build();
			info.lamp = [ p.x, p.y + 0.215, p.z ];

		}

		// the map: a big survey sheet pinned on a board in a frame, on the back wall beside the
		// window, square to the door
		{

			const MW = 0.9, MH = 0.7, mx = - 0.45, my = Y( 1.52 ), mz = z0 + 0.034;
			k.box( mx, my, z0 + 0.012, MW + 0.08, MH + 0.08, 0.024, M.LOG, board( 0.2 ), { axis: [ 1, 0, 0 ] } );
			for ( const s of [ - 1, 1 ] ) {

				k.box( mx, my + s * ( MH / 2 + 0.025 ), mz - 0.005, MW + 0.1, 0.05, 0.03, M.LOG, col( '#3e2c1e' ), { axis: [ 1, 0, 0 ] } );
				k.box( mx + s * ( MW / 2 + 0.025 ), my, mz - 0.005, 0.05, MH, 0.03, M.LOG, col( '#3e2c1e' ), { axis: [ 0, 1, 0 ] } );

			}

			const mk = new Kit( ground, ao );
			const pg = new THREE.PlaneGeometry( MW, MH );
			pg.deleteAttribute( 'uv' );
			pg.translate( mx, my, mz );
			mk.add( pg, M.PAINT, '#c4bca6', [ 1, 0, 0 ], [ mx, my, mz ] );
			const mg = mk.build();
			const mp = mg.getAttribute( 'position' ), uv = new Float32Array( mp.count * 2 );
			for ( let i = 0; i < mp.count; i ++ ) {

				uv[ i * 2 ] = ( mp.getX( i ) - ( mx - MW / 2 ) ) / MW;
				uv[ i * 2 + 1 ] = ( mp.getY( i ) - ( my - MH / 2 ) ) / MH;

			}

			mg.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
			parts.map = mg;
			info.map = { centre: [ mx, my, mz ], normal: [ 0, 0, 1 ], w: MW, h: MH };
			// drawing pins at its corners
			for ( const [ dx, dy ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) cyl( k, mx + dx * ( MW / 2 - 0.02 ), my + dy * ( MH / 2 - 0.02 ), mz, 0.006, 0.006, M.IRON, '#8a2a20', 6 );

		}

		// the stove: a little cast-iron box on legs, its door to the room, a kettle on it, its
		// pipe straight up through the roof
		{

			const sx = PIPE.x, sz = z0 + 0.3, h0 = 0.16, bw = 0.44, bh = 0.46, bd = 0.44;
			const cast = col( '#1f1d1b' );
			k.box( sx, Y( h0 + bh / 2 ), sz, bw, bh, bd, M.LEATHER, cast, { round: 0.02 } );
			k.box( sx, Y( h0 + bh + 0.012 ), sz, bw + 0.04, 0.024, bd + 0.04, M.LEATHER, col( '#191715' ) );
			for ( const [ dx, dz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) k.box( sx + dx * ( bw / 2 - 0.03 ), Y( h0 / 2 ), sz + dz * ( bd / 2 - 0.03 ), 0.04, h0, 0.04, M.LEATHER, cast );
			k.box( sx, Y( h0 + bh * 0.6 ), sz + bd / 2 + 0.008, 0.26, 0.2, 0.016, M.LEATHER, col( '#2a2724' ) );
			k.box( sx, Y( h0 + 0.07 ), sz + bd / 2 + 0.008, 0.26, 0.07, 0.016, M.LEATHER, col( '#2a2724' ) );
			// a glow of rust along the fire door's seam, where it has been too hot
			k.box( sx, Y( h0 + bh * 0.6 - 0.105 ), sz + bd / 2 + 0.004, 0.27, 0.012, 0.012, M.IRON, col( '#4a3024' ) );
			k.box( sx + 0.1, Y( h0 + bh * 0.6 ), sz + bd / 2 + 0.024, 0.06, 0.02, 0.02, M.IRON, '#5a5550' );
			cyl( k, sx, Y( h0 + bh + 0.02 ), PIPE.z, 0.075, 0.06, M.LEATHER, cast, 12 );
			const roofIn = Y( deckY( Math.abs( sx ) ) );
			cyl( k, sx, Y( h0 + bh + 0.02 ), PIPE.z, 0.066, roofIn - Y( h0 + bh + 0.02 ), M.LEATHER, col( '#23211e' ), 12 );
			// a damper handle on the pipe, and a kettle
			k.box( sx + 0.09, Y( 1.2 ), PIPE.z, 0.05, 0.012, 0.012, M.IRON, '#4a4540' );
			cyl( k, sx + 0.1, Y( h0 + bh + 0.024 ), sz + 0.08, 0.085, 0.12, M.IRON, '#45403a', 12, 0.06 );
			// an iron sheet on the floor in front of it, a box of split wood beside it
			k.box( sx + 0.05, Y( 0.003 ), sz + 0.5, 0.6, 0.006, 0.5, M.IRON, '#3e3a35' );
			const bx = sx - 0.02, bz = sz + 0.78;
			k.box( bx, Y( 0.19 ), bz, 0.4, 0.38, 0.38, M.LOG, board( 0.3 ) );
			for ( let i = 0; i < 7; i ++ ) k.box( bx + ( R() - 0.5 ) * 0.2, Y( 0.4 + R() * 0.05 ), bz + ( R() - 0.5 ) * 0.2, 0.08, 0.07, 0.42, M.LOG, logCol( 1, 0.3 ), { rot: [ 0, ( R() - 0.5 ) * 0.5, R() * 0.5 ], axis: [ 0, 0, 1 ] } );
			furniture.push( [ sx, sz, bw / 2 + 0.03, bd / 2 + 0.03 ], [ bx, bz, 0.21, 0.2 ] );

		}

		// the cot along the east wall: a wooden frame on legs, a ticking mattress, an army
		// blanket folded at its foot, a pillow
		{

			const kx = x1 - 0.42, kz0 = - 1.12, kz1 = 0.82, kzc = ( kz0 + kz1 ) / 2, kl = kz1 - kz0;
			for ( const s of [ - 1, 1 ] ) k.box( kx + s * 0.37, Y( 0.36 ), kzc, 0.06, 0.13, kl, M.LOG, col( '#5a4331' ), { axis: [ 0, 0, 1 ] } );
			for ( const s of [ - 1, 1 ] ) k.box( kx, Y( 0.36 ), kzc + s * ( kl / 2 - 0.03 ), 0.74, 0.13, 0.06, M.LOG, col( '#5a4331' ), { axis: [ 1, 0, 0 ] } );
			for ( const [ dx, dz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) k.box( kx + dx * 0.37, Y( 0.21 ), kzc + dz * ( kl / 2 - 0.03 ), 0.065, 0.42, 0.065, M.LOG, col( '#5a4331' ), { axis: [ 0, 1, 0 ] } );
			k.box( kx, Y( 0.48 ), kzc, 0.72, 0.13, kl - 0.06, M.LEATHER, '#7a7462', { round: 0.04 } );
			k.box( kx - 0.01, Y( 0.56 ), kzc + 0.45, 0.76, 0.07, 0.9, M.LEATHER, '#4f4e46', { round: 0.03 } );
			k.box( kx, Y( 0.6 ), kz0 + 0.25, 0.52, 0.1, 0.32, M.LEATHER, '#a39c88', { round: 0.045 } );
			furniture.push( [ kx, kzc, 0.42, kl / 2 ] );

		}

		// the gun rack on the west wall, empty: two uprights screwed to the logs, a top rail with
		// a notch for each barrel, a rest with a cup for each butt, a little crest board on top;
		// stained dark, the stain rubbed pale where the guns went in and out
		{

			const rz = - 0.1, rx = x0, stain = col( '#35251a' ), RL = 0.86;
			for ( const s of [ - 1, 1 ] ) k.box( rx + 0.05, Y( 0.95 ), rz + s * ( RL / 2 - 0.02 ), 0.1, 1.3, 0.035, M.LOG, stain, { axis: [ 0, 1, 0 ] } );
			// the top rail: a board seen from above with four round-bottomed notches in its edge
			const sh = new THREE.Shape();
			sh.moveTo( - RL / 2, 0 );
			sh.lineTo( - RL / 2, 0.13 );
			for ( const u of [ - 0.3, - 0.1, 0.1, 0.3 ] ) {

				sh.lineTo( u - 0.028, 0.13 );
				sh.lineTo( u - 0.028, 0.08 );
				sh.absarc( u, 0.08, 0.028, Math.PI, 0, true );
				sh.lineTo( u + 0.028, 0.13 );

			}

			sh.lineTo( RL / 2, 0.13 );
			sh.lineTo( RL / 2, 0 );
			sh.lineTo( - RL / 2, 0 );
			const rail = new THREE.ExtrudeGeometry( sh, { depth: 0.045, bevelEnabled: false, curveSegments: 5 } );
			rail.applyMatrix4( new THREE.Matrix4().makeBasis( V( 0, 0, 1 ), V( 1, 0, 0 ), V( 0, 1, 0 ) ).setPosition( rx, Y( 1.4 ), rz ) );
			k.add( rail, M.LOG, stain, [ 0, 0, 1 ], [ rx, Y( 1.42 ), rz ] );
			// the butt rest: a shelf with a lip, dividers between the cups
			k.box( rx + 0.09, Y( 0.28 ), rz, 0.18, 0.035, RL, M.LOG, stain, { axis: [ 0, 0, 1 ] } );
			k.box( rx + 0.175, Y( 0.33 ), rz, 0.022, 0.08, RL, M.LOG, stain, { axis: [ 0, 0, 1 ] } );
			for ( const u of [ - 0.2, 0, 0.2 ] ) k.box( rx + 0.1, Y( 0.33 ), rz + u, 0.15, 0.07, 0.02, M.LOG, stain );
			for ( const u of [ - 0.3, - 0.1, 0.1, 0.3 ] ) k.box( rx + 0.1, Y( 0.3 ), rz + u, 0.1, 0.004, 0.1, M.LOG, col( '#6a4e36' ) );
			// the crest: an arched board over the rail
			const cr = new THREE.Shape();
			cr.moveTo( - RL / 2, 0 ); cr.lineTo( RL / 2, 0 ); cr.lineTo( RL / 2, 0.06 );
			cr.quadraticCurveTo( 0.2, 0.08, 0, 0.17 ); cr.quadraticCurveTo( - 0.2, 0.08, - RL / 2, 0.06 ); cr.lineTo( - RL / 2, 0 );
			const cg = new THREE.ExtrudeGeometry( cr, { depth: 0.022, bevelEnabled: false, curveSegments: 6 } );
			cg.applyMatrix4( new THREE.Matrix4().makeBasis( V( 0, 0, 1 ), V( 0, 1, 0 ), V( - 1, 0, 0 ) ).setPosition( rx + 0.03, Y( 1.6 ), rz ) );
			k.add( cg, M.LOG, stain, [ 0, 0, 1 ], [ rx, Y( 1.65 ), rz ] );
			// a leather cartridge belt hanging from a hook
			k.box( rx + 0.035, Y( 1.58 ), rz + 0.3, 0.02, 0.02, 0.03, M.IRON, iron );
			k.box( rx + 0.045, Y( 1.4 ), rz + 0.3, 0.012, 0.36, 0.05, M.LEATHER, '#4a3322' );
			furniture.push( [ rx + 0.09, rz, 0.1, 0.4 ] );

		}

		// shelves on the west wall by the door: tins, jars, books, a box of cartridges
		{

			const sz = 1.35;
			for ( const y of [ 1.3, 1.68 ] ) {

				k.box( x0 + 0.12, Y( y ), sz, 0.24, 0.028, 1.0, M.LOG, board( 0.3 ), { axis: [ 0, 0, 1 ] } );
				for ( const dz of [ - 0.42, 0.42 ] ) k.box( x0 + 0.04, Y( y - 0.08 ), sz + dz, 0.08, 0.14, 0.03, M.LOG, board( 0.3 ) );
				for ( let i = 0; i < 7; i ++ ) {

					const z = sz - 0.42 + i * 0.14 + ( R() - 0.5 ) * 0.04, r = 0.03 + R() * 0.025, h = 0.07 + R() * 0.12;
					const kind = R();
					if ( kind < 0.3 ) cyl( k, x0 + 0.12 + ( R() - 0.5 ) * 0.06, Y( y + 0.014 ), z, r, h, M.IRON, mixc( '#5a5550', '#7a6040', R() ) );
					else if ( kind < 0.55 ) cyl( k, x0 + 0.12 + ( R() - 0.5 ) * 0.06, Y( y + 0.014 ), z, r, h, M.STONE, mixc( '#b8ae98', '#6a7a70', R() ) );
					else k.box( x0 + 0.12, Y( y + 0.014 + 0.1 ), z, 0.17, 0.2, 0.035 + R() * 0.03, M.LEATHER, mixc( '#4a2a20', '#2e3a2c', R() ), { rot: [ ( R() - 0.5 ) * 0.1, 0, 0 ] } );

				}

			}

			k.box( x0 + 0.12, Y( 1.3 + 0.014 + 0.035 ), sz + 0.45, 0.1, 0.07, 0.07, M.LEATHER, '#7a3a22' );

		}

		// on the east wall by the door: a peg rail, a loden jacket and a hat; a rucksack under
		// them; a chest under the front window; a broom in the corner behind the door
		{

			k.box( x1 - 0.015, Y( 1.66 ), 1.55, 0.03, 0.08, 0.8, M.LOG, board( 0.3 ), { axis: [ 0, 0, 1 ] } );
			for ( const z of [ 1.25, 1.55, 1.85 ] ) k.pole( V( x1 - 0.02, Y( 1.66 ), z ), V( x1 - 0.12, Y( 1.69 ), z ), 0.012, M.LOG, col( '#4a3321' ), z );
			k.box( x1 - 0.1, Y( 1.26 ), 1.25, 0.12, 0.78, 0.46, M.LEATHER, '#4b4f3e', { round: 0.05, rot: [ 0.04, 0, 0.03 ] } );
			lathe( k, [ [ 0, 0 ], [ 0.15, 0 ], [ 0.15, 0.012 ], [ 0.085, 0.02 ], [ 0.075, 0.1 ], [ 0.05, 0.12 ], [ 0, 0.12 ] ], V( x1 - 0.1, Y( 1.6 ), 1.85 ), M.LEATHER, col( '#3b3a30' ), 12 );
			k.box( x1 - 0.2, Y( 0.26 ), 1.55, 0.28, 0.52, 0.38, M.LEATHER, '#5a5236', { round: 0.08 } );
			const cx = ( WIN_F[ 0 ] + WIN_F[ 1 ] ) / 2, cz = z1 - 0.25;
			k.box( cx, Y( 0.22 ), cz, 0.76, 0.44, 0.42, M.LOG, board( 0.25 ), { axis: [ 1, 0, 0 ] } );
			k.box( cx, Y( 0.455 ), cz, 0.8, 0.03, 0.45, M.LOG, board( 0.25 ), { axis: [ 1, 0, 0 ] } );
			for ( const s of [ - 1, 1 ] ) k.box( cx + s * 0.25, Y( 0.3 ), cz + 0.213, 0.06, 0.08, 0.01, M.IRON, iron );
			k.pole( V( x0 + 0.1, Y( 0 ), z1 - 0.08 ), V( x0 + 0.03, Y( 1.35 ), z1 - 0.04 ), 0.015, M.LOG, col( '#8a7050' ), 5 );
			k.box( x0 + 0.1, Y( 0.1 ), z1 - 0.1, 0.1, 0.2, 0.28, M.LEATHER, '#6a5a3a', { rot: [ 0, 0, - 0.05 ] } );
			furniture.push( [ x1 - 0.2, 1.55, 0.16, 0.2 ], [ cx, cz, 0.4, 0.22 ] );

		}

	}

	// the door: vertical boards on three battens with a Z brace inside, iron strap hinges and
	// a latch outside; in its hinge's frame, shut along +x
	{

		const dw = DOOR[ 1 ] - DOOR[ 0 ] - 0.012, dh = DH - 0.075 - SILL - 0.005;
		const d = new Kit( ground, () => 0.85 );
		const dc = mixc( '#5a4330', '#6a5642', 0.5 );
		let x = 0.004;
		while ( x < dw - 0.02 ) {

			const w = Math.min( 0.13 + R() * 0.05, dw - x );
			d.box( x + w / 2, dh / 2, 0, w - 0.004, dh - R() * 0.01, 0.036, M.LOG, dc.clone().multiplyScalar( 0.85 + 0.25 * R() ), { axis: [ 0, 1, 0 ] } );
			x += w;

		}

		for ( const y of [ 0.22, dh / 2, dh - 0.22 ] ) d.box( dw / 2, y, - 0.032, dw - 0.08, 0.11, 0.028, M.LOG, dc, { axis: [ 1, 0, 0 ] } );
		for ( const [ ya, yb ] of [ [ 0.22, dh / 2 ], [ dh / 2, dh - 0.22 ] ] ) beam( d, V( 0.08, ya + 0.05, - 0.032 ), V( dw - 0.08, yb - 0.05, - 0.032 ), 0.09, 0.026, M.LOG, dc, { up: V( 0, 0, 1 ) } );
		for ( const y of [ 0.28, dh - 0.38 ] ) {

			d.box( 0.28, y, 0.021, 0.52, 0.045, 0.006, M.IRON, iron );
			bolt( d, V( 0.46, y, 0.024 ), V( 0, 0, 1 ), 0.01 );

		}

		// the latch: a ring handle outside, an iron plate with a keyhole
		d.box( dw - 0.1, 1.0, 0.021, 0.07, 0.16, 0.006, M.IRON, iron );
		d.box( dw - 0.1, 0.95, 0.025, 0.012, 0.025, 0.004, M.VOID, '#000000' );
		ring( d, V( dw - 0.1, 1.05, 0.03 ), V( 0, 0, 1 ), 0.035, 0.006 );
		d.box( dw - 0.1, 1.02, - 0.05, 0.14, 0.03, 0.02, M.IRON, iron );
		parts.door = d.build();
		info.doorPivot = [ DOOR[ 0 ] + 0.006, FY + SILL + 0.004, zf - 0.035 ];
		info.doorOpen = 1.7;
		info.doorway = [ ( DOOR[ 0 ] + DOOR[ 1 ] ) / 2, FY, L / 2 ];

	}

	// --- the antlers over the door: a red deer's skull, boiled white, and its antlers (a
	// ten), screwed to a shield-shaped board on the gable
	{

		const ax = 0, ay = Y( EH + 0.5 ), az = L / 2 + 0.03;
		const sh = new THREE.Shape();
		sh.moveTo( - 0.13, 0.16 ); sh.lineTo( 0.13, 0.16 ); sh.quadraticCurveTo( 0.15, - 0.05, 0, - 0.2 ); sh.quadraticCurveTo( - 0.15, - 0.05, - 0.13, 0.16 );
		const sg = new THREE.ExtrudeGeometry( sh, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 1, curveSegments: 6 } );
		sg.translate( ax, ay, az );
		k.add( sg, M.LOG, col( '#3e2b1d' ), [ 0, 1, 0 ] );
		const bone = col( '#cfc7b3' ), antler = col( '#4e3c2a' ), tip = col( '#8d7c62' );
		// the skull: the brain case, the brow, the long face tapering to the nose, eye sockets
		const sk = new THREE.SphereGeometry( 1, 12, 9 );
		sk.scale( 0.07, 0.06, 0.055 );
		sk.translate( ax, ay + 0.1, az + 0.075 );
		k.add( sk, M.LEATHER, bone, [ 0, 1, 0 ] );
		const face = new THREE.SphereGeometry( 1, 10, 8 );
		face.scale( 0.048, 0.16, 0.04 );
		face.rotateX( - 0.22 );
		face.translate( ax, ay - 0.03, az + 0.085 );
		k.add( face, M.LEATHER, bone, [ 0, 1, 0 ] );
		for ( const s of [ - 1, 1 ] ) {

			// the eye sockets, deep and dark
			const eye = new THREE.SphereGeometry( 0.019, 8, 6 );
			eye.scale( 1, 1.2, 0.6 );
			eye.translate( ax + s * 0.052, ay + 0.055, az + 0.1 );
			k.add( eye, M.VOID, '#000000', [ 0, 1, 0 ] );
			const P = ( x, y, z ) => V( ax + s * x, ay + 0.12 + y, az + 0.07 + z );
			// the coronet, then the main beam out and up, curving back a little at the crown
			const main = [ P( 0.035, 0, 0 ), P( 0.12, 0.06, 0.04 ), P( 0.24, 0.22, 0.06 ), P( 0.31, 0.44, 0.04 ), P( 0.33, 0.66, - 0.01 ), P( 0.3, 0.8, - 0.03 ) ];
			horn( k, main, 0.034, 0.016, M.LEATHER, antler, 7 );
			k.add( new THREE.TorusGeometry( 0.032, 0.012, 5, 10 ).rotateY( s * 0.9 ).rotateX( 0.6 ).translate( ...P( 0.04, 0.005, 0.005 ).toArray() ), M.LEATHER, antler );
			// brow and bez tines forward, the trez halfway, the crown's fork
			horn( k, [ P( 0.08, 0.035, 0.03 ), P( 0.11, 0.06, 0.14 ), P( 0.08, 0.13, 0.23 ) ], 0.022, 0.006, M.LEATHER, tip );
			horn( k, [ P( 0.15, 0.1, 0.05 ), P( 0.2, 0.15, 0.14 ), P( 0.18, 0.22, 0.2 ) ], 0.018, 0.006, M.LEATHER, tip );
			horn( k, [ P( 0.3, 0.4, 0.045 ), P( 0.28, 0.46, 0.14 ), P( 0.23, 0.54, 0.19 ) ], 0.018, 0.006, M.LEATHER, tip );
			horn( k, [ P( 0.325, 0.64, 0.0 ), P( 0.4, 0.74, 0.03 ), P( 0.43, 0.84, 0.02 ) ], 0.016, 0.006, M.LEATHER, tip );
			horn( k, [ P( 0.315, 0.72, - 0.02 ), P( 0.24, 0.82, 0.0 ), P( 0.21, 0.9, - 0.02 ) ], 0.015, 0.006, M.LEATHER, tip );

		}

		for ( const s of [ - 1, 1 ] ) bolt( k, V( ax + s * 0.09, ay + 0.1, az + 0.034 ), V( 0, 0, 1 ), 0.008 );

	}

	// --- the porch: a rubble edge under a deck of planks laid across, steps down to the
	// trodden ground in front of the door, the bench under the window, split wood stacked
	// against the wall on the other side of the door
	const deckTop = FY - 0.03;
	{

		const pz0 = L / 2 + 0.02, pz1 = L / 2 + PORCH, pzc = ( pz0 + pz1 ) / 2, t = 0.36;
		const top = deckTop - 0.07;
		k.box( 0, ( top + base ) / 2, pz1 - t / 2, W + 0.1, top - base, t, M.RUBBLE, '#8d877c' );
		for ( const xs of [ - 1, 1 ] ) k.box( xs * ( W / 2 + 0.05 - t / 2 ), ( top + base ) / 2, pzc - 0.02, t, top - base, pz1 - pz0 - 0.1, M.RUBBLE, '#8d877c' );
		// joists and the deck
		for ( const x of [ - 1.3, 0, 1.3 ] ) k.box( x, deckTop - 0.07, pzc, 0.12, 0.1, pz1 - pz0, M.LOG, col( purlin ), { axis: [ 0, 0, 1 ] } );
		for ( let z = pz0; z < pz1 - 0.02; z += 0.155 ) {

			const w = Math.min( 0.15, pz1 - z );
			k.box( ( R() - 0.5 ) * 0.03, deckTop - 0.0175, z + w / 2, W + 0.12 + ( R() - 0.5 ) * 0.04, 0.035, w - 0.005, M.LOG, board( 0.35 ).lerp( col( '#77706a' ), 0.35 ), { axis: [ 1, 0, 0 ] } );

		}

		info.porch = { x0: - W / 2 - 0.06, x1: W / 2 + 0.06, z0: L / 2, z1: pz1, y: deckTop };
		// steps: dressed stones, a hand's height apiece, down to the ground in front of the door
		{

			const zs0 = pz1, TREAD = 0.3;
			const drop = deckTop - ground( 0, zs0 + 0.5 );
			const n = Math.max( 1, Math.round( drop / 0.18 ) ), rise = drop / n;
			info.steps = { n, rise, tread: TREAD, z0: zs0, x0: - 0.75, x1: 0.75, top: deckTop };
			for ( let i = 1; i < n; i ++ ) {

				const ty = deckTop - i * rise, za = zs0 + ( i - 1 ) * TREAD;
				const gmin = Math.min( ground( - 0.75, za ), ground( 0.75, za ), ground( - 0.75, za + TREAD ), ground( 0.75, za + TREAD ) );
				k.box( 0, ( gmin - 0.12 + ty - 0.06 ) / 2, za + TREAD / 2 - 0.01, 1.5, ty - 0.06 - gmin + 0.12, TREAD - 0.02, M.RUBBLE, '#8a8479' );
				k.box( 0, ty - 0.035, za + TREAD / 2 + 0.02, 1.52, 0.07, TREAD + 0.05, M.STONE, mixc( '#7d776e', '#857d70', R() ), { rot: [ ( R() - 0.5 ) * 0.02, ( R() - 0.5 ) * 0.03, ( R() - 0.5 ) * 0.02 ] } );

			}

		}

		// the bench: a thick plank on two slab legs, against the wall under the window
		const bx = ( WIN_F[ 0 ] + WIN_F[ 1 ] ) / 2 + 0.05, bz = L / 2 + 0.26;
		beam( k, V( bx - 0.675, deckTop + 0.44, bz ), V( bx + 0.675, deckTop + 0.44, bz ), 0.32, 0.055, M.LOG, grey(), { round: 0.02 } );
		for ( const dx of [ - 0.5, 0.5 ] ) k.box( bx + dx, deckTop + 0.21, bz, 0.055, 0.42, 0.28, M.LOG, grey(), { axis: [ 0, 1, 0 ] } );
		k.box( bx, deckTop + 0.12, bz, 1.0, 0.07, 0.05, M.LOG, grey(), { axis: [ 1, 0, 0 ] } );
		// split wood against the wall left of the door, end grain out
		const wx0 = - W / 2 + 0.12, wx1 = DOOR[ 0 ] - 0.28;
		for ( let x = wx0; x < wx1; x += 0.14 ) for ( let y = deckTop + 0.07; y < deckTop + 1.02; y += 0.13 ) {

			const r = 0.065 + R() * 0.02, g = new THREE.CylinderGeometry( r, r, 0.36, R() < 0.6 ? 3 : 4 );
			g.rotateX( Math.PI / 2 );
			g.rotateZ( R() * 6 );
			const xx = x + 0.06 + ( R() - 0.5 ) * 0.02, yy = y + ( R() - 0.5 ) * 0.02, zz = L / 2 + 0.22 + ( R() - 0.5 ) * 0.04;
			g.translate( xx, yy, zz );
			k.add( g, M.LOG, mixc( '#7a6048', '#b89c78', 0.2 + 0.4 * R() ), [ 0, 0, 1 ], [ xx, yy, zz ] );

		}

		info.solids = [ [ bx, bz, 0.7, 0.18 ], [ ( wx0 + wx1 ) / 2 + 0.05, L / 2 + 0.22, ( wx1 - wx0 ) / 2 + 0.06, 0.2 ] ];
		// a boot scraper by the steps
		k.box( 0.9, deckTop - 0.1, pz1 + 0.25, 0.3, 0.012, 0.012, M.IRON, iron );
		for ( const dx of [ - 0.14, 0.14 ] ) k.box( 0.9 + dx, deckTop - 0.2, pz1 + 0.25, 0.015, 0.2, 0.015, M.IRON, iron );

	}

	// --- firewood stacked under the east eave, split and dried, end grain out
	{

		const xw0 = W / 2 + 0.26;
		for ( let z = - L / 2 + 0.35; z < L / 2 - 0.4; z += 0.18 ) {

			const g0 = ground( xw0, z );
			const top = Math.min( g0 + 0.98 + 0.12 * Math.sin( z * 1.7 ), FY + EH - 0.45 );
			for ( let y = g0 + 0.1; y < top; y += 0.14 ) {

				const r = 0.075 + R() * 0.02;
				const g = new THREE.CylinderGeometry( r, r, 0.4, R() < 0.6 ? 3 : 4 );
				g.rotateY( R() * 6 );
				g.rotateZ( Math.PI / 2 );
				const yy = y + ( R() - 0.5 ) * 0.02, zz = z + ( R() - 0.5 ) * 0.03;
				g.translate( xw0 + ( R() - 0.5 ) * 0.05, yy, zz );
				k.add( g, M.LOG, mixc( '#7a6048', '#b89c78', 0.2 + 0.4 * R() ), [ 1, 0, 0 ], [ xw0, yy, zz ] );

			}

		}

		// on two rails, off the wet ground
		for ( const dx of [ - 0.12, 0.12 ] ) for ( const [ za, zb ] of [ [ - L / 2 + 0.25, 0 ], [ 0, L / 2 - 0.35 ] ] ) k.pole( V( xw0 + dx, ground( xw0 + dx, za ) + 0.03, za ), V( xw0 + dx, ground( xw0 + dx, zb ) + 0.03, zb ), 0.035, M.BARK, col( '#4d4035' ), za + dx );
		info.solids.push( [ xw0, 0, 0.26, L / 2 - 0.3 ] );

	}

	// --- the woodshed: a frame of squared posts on stone piers, walls of rough boards nailed
	// upright with gaps between for the air, a lean-to roof of boards under tarred felt held
	// down by battens; its door in the front, padlocked
	const SDOOR = [ SX - 0.47, SX + 0.48 ];
	{

		const pc = '#4f3b2a';
		// piers at the corners and mid-sides, down into the ground
		for ( const [ x, z ] of [ [ sx0, sz0 ], [ sx1, sz0 ], [ sx0, sz1 ], [ sx1, sz1 ], [ SX, sz0 ], [ SX, sz1 ] ] ) {

			const g = Math.min( ground( x, z ), ground( x + 0.15, z + 0.15 ), ground( x - 0.15, z - 0.15 ) );
			k.box( x, ( g - 0.15 + SFY - 0.11 ) / 2, z, 0.3, SFY - 0.11 - g + 0.15, 0.3, M.RUBBLE, '#8a8479' );
			k.box( x, SFY - 0.12, z, 0.32, 0.03, 0.32, M.STONE, '#86817a', { rot: [ 0, R() * 0.4, 0 ] } );

		}

		// sills, the floor on them
		for ( const z of [ sz0 + 0.05, sz1 - 0.05 ] ) k.box( SX, SFY - 0.055, z, SW, 0.1, 0.1, M.LOG, col( pc ), { axis: [ 1, 0, 0 ] } );
		for ( const x of [ sx0 + 0.05, sx1 - 0.05, SX ] ) k.box( x, SFY - 0.055, SZ, 0.1, 0.1, SD - 0.2, M.LOG, col( pc ), { axis: [ 0, 0, 1 ] } );
		for ( let x = sx0 + 0.02; x < sx1 - 0.04; x += 0.2 ) k.box( x + 0.1, SFY - 0.0, SZ, 0.195, 0.03, SD - 0.04, M.LOG, board( 0.3 ).multiplyScalar( 0.8 ), { axis: [ 0, 0, 1 ] } );
		// corner posts, the door's jambs, plates along the top, a rail round the middle
		for ( const [ x, z ] of [ [ sx0 + 0.05, sz0 + 0.05 ], [ sx1 - 0.05, sz0 + 0.05 ], [ sx0 + 0.05, sz1 - 0.05 ], [ sx1 - 0.05, sz1 - 0.05 ], [ SDOOR[ 0 ] - 0.05, sz1 - 0.05 ], [ SDOOR[ 1 ] + 0.05, sz1 - 0.05 ] ] ) {

			const h = shedTop( z ) - 0.1 - SFY + 0.1;
			k.box( x, SFY - 0.1 + h / 2, z, 0.1, h, 0.1, M.LOG, col( pc, 0.9 + 0.2 * R() ), { axis: [ 0, 1, 0 ] } );

		}

		k.box( SX, shedTop( sz1 - 0.05 ) - 0.05, sz1 - 0.05, SW, 0.1, 0.1, M.LOG, col( pc ), { axis: [ 1, 0, 0 ] } );
		k.box( SX, shedTop( sz0 + 0.05 ) - 0.05, sz0 + 0.05, SW, 0.1, 0.1, M.LOG, col( pc ), { axis: [ 1, 0, 0 ] } );
		for ( const x of [ sx0 + 0.05, sx1 - 0.05 ] ) beam( k, V( x, shedTop( sz0 ) - 0.05, sz0 ), V( x, shedTop( sz1 ) - 0.05, sz1 ), 0.1, 0.1, M.LOG, col( pc ) );
		// the door's head
		k.box( ( SDOOR[ 0 ] + SDOOR[ 1 ] ) / 2, SFY + 1.99, sz1 - 0.05, SDOOR[ 1 ] - SDOOR[ 0 ] + 0.2, 0.08, 0.1, M.LOG, col( pc ), { axis: [ 1, 0, 0 ] } );
		for ( const x of [ sx0 + 0.05, sx1 - 0.05 ] ) k.box( x, SFY + 1.0, SZ, 0.08, 0.08, SD - 0.2, M.LOG, col( pc ), { axis: [ 0, 0, 1 ] } );
		k.box( SX, SFY + 1.0, sz0 + 0.05, SW - 0.2, 0.08, 0.08, M.LOG, col( pc ), { axis: [ 1, 0, 0 ] } );

		// the boards: rough, of uneven widths, a finger's gap between them, silvered outside
		const skin = ( fixed, along, a, b, zx ) => {

			// fixed: the wall's plane (x for side walls, z for front and back); along: 'x' or 'z'
			let u = a;
			while ( u < b - 0.03 ) {

				const w = Math.min( 0.14 + R() * 0.08, b - u ), m = u + w / 2;
				const c = grey( 0.3 ).lerp( col( '#57493a' ), R() * 0.4 ).multiplyScalar( 0.85 );
				if ( along === 'x' ) tbox( k, m, fixed, w - 0.014, 0.022, SFY - 0.12, ( x, z ) => zx( z ) - 0.005, M.LOG, c );
				else tbox( k, fixed, m, 0.022, w - 0.014, SFY - 0.12, ( x, z ) => zx( z ) - 0.005, M.LOG, c );
				u += w;

			}

		};

		const topAt = ( z ) => shedTop( z ) + 0.0;
		skin( sz0 - 0.011, 'x', sx0 - 0.022, sx1 + 0.022, () => topAt( sz0 ) );
		skin( sz1 + 0.011, 'x', sx0 - 0.022, SDOOR[ 0 ] - 0.1, () => topAt( sz1 ) );
		skin( sz1 + 0.011, 'x', SDOOR[ 1 ] + 0.1, sx1 + 0.022, () => topAt( sz1 ) );
		// over the door
		k.box( ( SDOOR[ 0 ] + SDOOR[ 1 ] ) / 2, ( SFY + 1.95 + topAt( sz1 ) ) / 2, sz1 + 0.011, SDOOR[ 1 ] - SDOOR[ 0 ] + 0.2, topAt( sz1 ) - SFY - 1.95, 0.022, M.LOG, grey( 0.3 ), { axis: [ 0, 1, 0 ] } );
		for ( const xs of [ - 1, 1 ] ) skin( SX + xs * ( SW / 2 + 0.011 ), 'z', sz0 - 0.022, sz1 + 0.022, ( z ) => topAt( z ) );

		// the roof: rafters front to back, boards, tarred felt over them, battens down the slope
		const rise = SHF - SHB, ang = Math.atan2( rise, SD ), rl = ( SD + 0.65 ) / Math.cos( ang );
		const rzc = SZ + 0.025, ryc = shedTop( rzc );
		for ( const x of [ sx0 + 0.05, SX - 0.35, SX + 0.35, sx1 - 0.05 ] ) k.box( x, ryc + 0.05, rzc, 0.07, 0.1, rl, M.LOG, col( pc ), { rot: [ - ang, 0, 0 ], axis: [ 0, 0, 1 ] } );
		for ( let x = sx0 - 0.2; x < sx1 + 0.19; x += 0.2 ) k.box( x + 0.1, ryc + 0.115, rzc, 0.196, 0.03, rl, M.LOG, mixc( '#4d3a2a', '#6a5238', R() ), { rot: [ - ang, 0, 0 ], axis: [ 0, 0, 1 ] } );
		k.box( SX, ryc + 0.135, rzc, SW + 0.42, 0.01, rl + 0.02, M.PAINT, col( '#2b2926' ), { rot: [ - ang, 0, 0 ], axis: [ 1, 0, 0 ] } );
		for ( let x = sx0 - 0.18; x < sx1 + 0.2; x += 0.52 ) k.box( x, ryc + 0.16, rzc, 0.04, 0.035, rl + 0.02, M.LOG, grey(), { rot: [ - ang, 0, 0 ], axis: [ 0, 0, 1 ] } );
		// fascia boards at the front and back edges, the felt folded down over them
		for ( const s of [ - 1, 1 ] ) {

			const z = rzc + s * rl / 2 * Math.cos( ang ), y = ryc + 0.1 + s * rl / 2 * Math.sin( ang );
			k.box( SX, y - 0.02, z + s * 0.012, SW + 0.44, 0.14, 0.025, M.LOG, grey(), { axis: [ 1, 0, 0 ] } );
			k.box( SX, y + 0.02, z + s * 0.027, SW + 0.44, 0.08, 0.006, M.PAINT, col( '#2b2926' ), { axis: [ 1, 0, 0 ] } );

		}

		info.shedFloorY = SFY;
		info.shedWalls = [
			[ sx0, sz0, sx1, sz0 ], [ sx0, sz0, sx0, sz1 ], [ sx1, sz0, sx1, sz1 ],
			[ sx0, sz1, SDOOR[ 0 ], sz1 ], [ SDOOR[ 1 ], sz1, sx1, sz1 ],
		];

		// the door: upright boards on three battens and a brace inside, strap hinges on its right
		// (the hinge side, the lodge's side), the hasp on its left over the staple; in its hinge's
		// frame, shut along -x
		const dw = SDOOR[ 1 ] - SDOOR[ 0 ] - 0.012, dh = 1.93;
		const d = new Kit( ground, () => 0.85 );
		let x = 0;
		while ( x < dw - 0.02 ) {

			const w = Math.min( 0.13 + R() * 0.06, dw - x );
			d.box( - x - w / 2, dh / 2, 0, w - 0.006, dh - R() * 0.02, 0.024, M.LOG, grey( 0.3 ).multiplyScalar( 0.85 ), { axis: [ 0, 1, 0 ] } );
			x += w;

		}

		const dcol = grey( 0.2 );
		for ( const y of [ 0.2, 1.0, dh - 0.2 ] ) d.box( - dw / 2, y, - 0.024, dw - 0.06, 0.1, 0.024, M.LOG, dcol, { axis: [ 1, 0, 0 ] } );
		for ( const [ ya, yb ] of [ [ 0.2, 1.0 ], [ 1.0, dh - 0.2 ] ] ) beam( d, V( - 0.06, ya + 0.05, - 0.024 ), V( - dw + 0.06, yb - 0.05, - 0.024 ), 0.08, 0.022, M.LOG, dcol, { up: V( 0, 0, 1 ) } );
		for ( const y of [ 0.22, dh - 0.25 ] ) {

			d.box( - 0.25, y, 0.016, 0.5, 0.04, 0.006, M.IRON, iron );
			bolt( d, V( - 0.42, y, 0.018 ), V( 0, 0, 1 ), 0.009 );

		}

		// the hasp: a strap along the door's free edge, its slotted end laid over the staple on
		// the jamb; a ring pull beside it
		const hy = 1.08;
		d.box( - dw + 0.04, hy, 0.02, 0.24, 0.035, 0.006, M.IRON, iron );
		ring( d, V( - dw + 0.2, hy - 0.12, 0.024 ), V( 0, 0, 1 ), 0.03, 0.005 );
		parts.shedDoor = d.build();
		info.shedPivot = [ SDOOR[ 1 ] - 0.006, SFY + 0.02, sz1 + 0.012 ];
		info.shedOpen = 1.9;
		info.shedDoorway = [ ( SDOOR[ 0 ] + SDOOR[ 1 ] ) / 2, SFY, sz1 ];
		// the staple on the jamb (static) and the padlock through it
		const px = SDOOR[ 0 ] - 0.04, py = SFY + 0.02 + hy, pz = sz1 + 0.036;
		k.box( px, py, sz1 + 0.025, 0.012, 0.05, 0.05, M.IRON, iron );
		const pk = new Kit( ground, ao );
		const shackle = new THREE.TorusGeometry( 0.017, 0.004, 5, 10, Math.PI );
		shackle.translate( px, py - 0.02, pz + 0.004 );
		pk.add( shackle, M.IRON, col( '#6a6862' ), [ 1, 0, 0 ] );
		for ( const s of [ - 1, 1 ] ) pk.box( px + s * 0.017, py - 0.028, pz + 0.004, 0.008, 0.018, 0.008, M.IRON, col( '#6a6862' ) );
		pk.box( px, py - 0.06, pz + 0.004, 0.048, 0.048, 0.02, M.BRONZE, col( '#8a6c34' ), { round: 0.006 } );
		pk.box( px, py - 0.068, pz + 0.0145, 0.006, 0.014, 0.002, M.VOID, '#000000' );
		parts.padlock = pk.build();
		info.padlock = [ px, py - 0.045, pz + 0.004 ];

		// --- inside the shed: the oars leaning along the west wall, blades up; a bow saw and a
		// crosscut saw on nails; split wood along the back; a bucket, a shovel, a coil of rope
		{

			const ok = new Kit( ground, ao );
			const ox = sx0 + 0.13;
			oar( ok, V( ox, SFY + 0.03, sz1 - 0.16 ), V( ox + 0.02, SFY + 1.86, sz0 + 0.16 ), V( 1, 0, 0 ) );
			oar( ok, V( ox + 0.09, SFY + 0.03, sz1 - 0.22 ), V( ox + 0.06, SFY + 1.82, sz0 + 0.14 ), V( 1, 0, 0.3 ).normalize() );
			parts.oars = ok.build();
			info.oars = [ ox + 0.05, SFY + 0.95, SZ ];

			// split wood stacked along the back wall
			for ( let x = SX - 0.5; x < SX + 0.45; x += 0.14 ) for ( let y = SFY + 0.07; y < SFY + 0.85; y += 0.13 ) {

				const r = 0.065 + R() * 0.02, g = new THREE.CylinderGeometry( r, r, 0.36, R() < 0.6 ? 3 : 4 );
				g.rotateX( Math.PI / 2 );
				g.rotateZ( R() * 6 );
				const xx = x + ( R() - 0.5 ) * 0.02, yy = y + ( R() - 0.5 ) * 0.02, zz = sz0 + 0.3 + ( R() - 0.5 ) * 0.04;
				g.translate( xx, yy, zz );
				k.add( g, M.LOG, mixc( '#7a6048', '#b89c78', 0.2 + 0.4 * R() ), [ 0, 0, 1 ], [ xx, yy, zz ] );

			}

			// the bow saw: a steel bow, its paint worn, on a nail over the wood
			const bsx = SX - 0.05, bsy = SFY + 1.45, bsz = sz0 + 0.04;
			const bow = [];
			for ( let i = 0; i <= 8; i ++ ) {

				const a = Math.PI * ( 0.08 + 0.84 * i / 8 );
				bow.push( V( bsx - Math.cos( a ) * 0.4, bsy + Math.sin( a ) * 0.22 - 0.2, bsz ) );

			}

			horn( k, bow, 0.012, 0.012, M.IRON, col( '#7a3a22' ), 6 );
			k.box( bsx, bsy - 0.17, bsz, 0.76, 0.03, 0.003, M.IRON, col( '#6a6a66' ) );
			k.box( bsx, bsy + 0.03, bsz, 0.01, 0.03, 0.03, M.IRON, iron );
			// the crosscut saw on the east wall: a long toothed blade, a handle at each end
			const csx = sx1 - 0.035, csy = SFY + 1.45, csz = SZ;
			k.box( csx, csy, csz, 0.003, 0.14, 1.3, M.IRON, col( '#6e6d68' ), { axis: [ 0, 0, 1 ] } );
			for ( const s of [ - 1, 1 ] ) k.pole( V( csx - 0.01, csy - 0.12, csz + s * 0.68 ), V( csx - 0.01, csy + 0.2, csz + s * 0.68 ), 0.018, M.LOG, col( '#6a4a2e' ), s );
			k.box( csx, csy + 0.1, csz, 0.02, 0.02, 0.02, M.IRON, iron );
			// the bucket, galvanised, with its bail
			const bk = V( SX + 0.72, SFY + 0.015, sz0 + 0.62 );
			lathe( k, [ [ 0, 0 ], [ 0.12, 0 ], [ 0.125, 0.01 ], [ 0.15, 0.28 ], [ 0.156, 0.285 ], [ 0.148, 0.285 ], [ 0.142, 0.27 ], [ 0.115, 0.03 ], [ 0, 0.03 ] ], bk, M.IRON, col( '#8a8c88' ), 16 );
			k.add( new THREE.TorusGeometry( 0.15, 0.004, 4, 12, Math.PI ).rotateY( 0.4 ).translate( bk.x, bk.y + 0.285, bk.z ), M.IRON, col( '#6a6a66' ) );
			// the shovel, leaning in the back corner
			k.pole( V( sx1 - 0.2, SFY + 0.3, sz0 + 0.25 ), V( sx1 - 0.1, SFY + 1.45, sz0 + 0.1 ), 0.017, M.LOG, col( '#7a6248' ), 7 );
			k.box( sx1 - 0.21, SFY + 0.16, sz0 + 0.27, 0.24, 0.3, 0.012, M.IRON, col( '#4a4640' ), { rot: [ - 0.1, 0.5, 0.08 ] } );
			// a coil of rope on a nail on the back wall
			for ( let i = 0; i < 3; i ++ ) {

				const g = new THREE.TorusGeometry( 0.14 + i * 0.012, 0.011, 5, 14 );
				g.scale( 1, 1.25, 1 );
				g.translate( SX + 0.72 + i * 0.01, SFY + 1.5 - i * 0.02, sz0 + 0.03 + i * 0.012 );
				k.add( g, M.ROPE, col( '#7a6a4e', 0.9 + 0.2 * R() ), [ 0, 1, 0 ], [ SX + 0.72, SFY + 1.5, sz0 + 0.04 ] );

			}

			info.shedFurniture = [ [ SX - 0.05, sz0 + 0.3, 0.55, 0.2 ], [ bk.x, bk.z, 0.16, 0.16 ] ];

		}

	}

	// --- in the yard: a sawbuck with a log on it and sawdust under it, a chopping block by
	// the shed with the axe in it, trodden earth in front of the porch and the shed
	{

		const patch = ( pcx, pcz, rx, rz, sd, c = '#5b4a38' ) => {

			const segs = 26, rings = 4, pos = [], idx = [];
			for ( let r = 0; r <= rings; r ++ ) for ( let i = 0; i < segs; i ++ ) {

				const a = i / segs * Math.PI * 2, f = r / rings;
				const wob = 1 + 0.25 * Math.sin( a * 3 + sd ) + 0.12 * Math.sin( a * 7 + sd * 2 );
				const x = pcx + Math.cos( a ) * rx * f * wob, z = pcz + Math.sin( a ) * rz * f * wob;
				pos.push( x, ground( x, z ) + 0.025, z );

			}

			for ( let r = 0; r < rings; r ++ ) for ( let i = 0; i < segs; i ++ ) {

				const a = r * segs + i, b = r * segs + ( i + 1 ) % segs, c = ( r + 1 ) * segs + i, d = ( r + 1 ) * segs + ( i + 1 ) % segs;
				idx.push( a, c, b, b, c, d );

			}

			const g = new THREE.BufferGeometry();
			g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
			g.setIndex( idx );
			g.computeVertexNormals();
			k.add( g, M.DIRT, col( c ) );
			const a = k.parts[ k.parts.length - 1 ].getAttribute( 'aAO' ), p = k.parts[ k.parts.length - 1 ].getAttribute( 'position' );
			for ( let i = 0; i < a.count; i ++ ) a.setX( i, Math.hypot( ( p.getX( i ) - pcx ) / rx, ( p.getZ( i ) - pcz ) / rz ) );

		};

		const bx = - W / 2 - 1.25, bz = - 0.9, g = ground( bx, bz );
		for ( const dz of [ - 0.4, 0.4 ] ) for ( const s of [ - 1, 1 ] ) k.pole( V( bx - s * 0.32, g - 0.05, bz + dz ), V( bx + s * 0.12, g + 0.95, bz + dz ), 0.04, M.LOG, col( '#6a5a48' ), s + dz );
		k.pole( V( bx, g + 0.28, bz - 0.45 ), V( bx, g + 0.28, bz + 0.45 ), 0.03, M.LOG, col( '#6a5a48' ), 4 );
		k.pole( V( bx - 0.02, g + 0.84, bz - 1.2 ), V( bx + 0.02, g + 0.86, bz + 1.1 ), 0.12, M.BARK, col( '#5d4b3b' ), 8 );
		k.box( bx, g + 0.01, bz, 0.9, 0.02, 1.2, M.DIRT, col( '#9a7a52' ) );
		k.parts[ k.parts.length - 1 ].getAttribute( 'aAO' ).array.fill( 0.5 );
		info.solids.push( [ bx, bz, 0.4, 1.1 ] );
		const cx = sx1 + 0.75, cz = sz1 + 0.9, cg = ground( cx, cz );
		k.pole( V( cx, cg - 0.05, cz ), V( cx, cg + 0.52, cz ), 0.24, M.BARK, col( '#5a4838' ), 3 );
		k.box( cx, cg + 0.525, cz, 0.44, 0.012, 0.44, M.END, col( '#8a7050' ) );
		{

			// the axe, its bit sunk in the block, the helve slanting up
			const H = V( cx + 0.04, cg + 0.53, cz - 0.02 ), dir = V( - 0.42, 0.8, 0.3 ).normalize();
			beam( k, H.clone().addScaledVector( dir, 0.04 ), H.clone().addScaledVector( dir, 0.7 ), 0.032, 0.026, M.LOG, col( '#7a6248' ) );
			const flat = Math.atan2( dir.x, dir.z );
			k.box( H.x, H.y + 0.02, H.z, 0.025, 0.07, 0.17, M.IRON, '#4a4540', { rot: [ 0, flat, 0 ] } );

		}
		info.solids.push( [ cx, cz, 0.28, 0.28 ] );
		for ( let i = 0; i < 6; i ++ ) {

			const a = R() * Math.PI * 2, d = 0.4 + R() * 0.5, x = cx + Math.cos( a ) * d, z = cz + Math.sin( a ) * d;
			const gg = new THREE.CylinderGeometry( 0.06, 0.06, 0.34, 3 );
			gg.rotateZ( Math.PI / 2 );
			gg.rotateY( R() * 6 );
			gg.translate( x, ground( x, z ) + 0.04, z );
			k.add( gg, M.LOG, mixc( '#7a6048', '#b89c78', 0.3 + 0.4 * R() ), [ 1, 0, 0 ], [ x, 0, z ] );

		}

		patch( 0, L / 2 + PORCH + 1.3, 1.8, 1.1, 1 );
		patch( ( SDOOR[ 0 ] + SDOOR[ 1 ] ) / 2 + 0.6, sz1 + 1.1, 1.7, 0.9, 2 );
		for ( let i = 0; i < 10; i ++ ) {

			const a = R() * Math.PI * 2, d = 5 + R() * 5;
			const x = Math.cos( a ) * d, z = Math.sin( a ) * d;
			if ( Math.abs( x ) < W / 2 + 1.5 && z > ZB - 0.5 && z < ZF + 2.5 ) continue;
			if ( x > sx0 - 1 && x < sx1 + 1.5 && z > sz0 - 1 && z < sz1 + 2 ) continue;
			k.stone( x, ground( x, z ), z, 0.15 + R() * 0.25, 0.1 + R() * 0.16, 0.15 + R() * 0.2, mixc( '#9c978c', '#7a7266', R() ), R() * 40 );

		}

	}

	// where things are, for the collision and the story
	// (the wall segments run down the middle of the logs, T thick; the doorway is left open)
	info.walls = [
		[ - W / 2, - zf, W / 2, - zf ], [ - xw, - L / 2, - xw, L / 2 ], [ xw, - L / 2, xw, L / 2 ],
		[ - W / 2, zf, DOOR[ 0 ], zf ], [ DOOR[ 1 ], zf, W / 2, zf ],
	];
	info.wallT = T;
	info.furniture = furniture;
	info.room = { x0, x1, z0, z1, floorY: FY, eave: FY + EH, ridge: RIDGE, pitch: TAN };

	return { geometry: k.build(), parts, info };

}

// Dev only (tools/propview.mjs): the lodge with its doors hung on their hinges and swung open
// (or shut), so the preview shows them where the game will.
export function previewLodge( ground, open = true ) {

	const out = buildLodge( ground );
	const hang = ( g, pivot, a ) => g.clone().rotateY( a ).translate( ...pivot );
	const parts = { ...out.parts };
	parts.door = hang( out.parts.door, out.info.doorPivot, open ? out.info.doorOpen : 0 );
	parts.shedDoor = hang( out.parts.shedDoor, out.info.shedPivot, open ? out.info.shedOpen : 0 );
	if ( open ) delete parts.padlock;
	const tris = ( g ) => g.getAttribute( 'position' ).count / 3;
	const info = { ...out.info, tris: { body: tris( out.geometry ), parts: Object.fromEntries( Object.entries( out.parts ).map( ( [ n, g ] ) => [ n, tris( g ) ] ) ) } };
	return { ...out, parts, info };

}

export const previewLodgeShut = ( ground ) => previewLodge( ground, false );
