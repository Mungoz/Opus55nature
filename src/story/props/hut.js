import * as THREE from 'three';
import { Kit, M, col, mixc } from './kit.js';

// The herder's hut, after photographs of alp huts in the
// Valais, Graubünden, Bavaria and Tyrol (mockups/refs): low and long under a big, shallow
// roof of split larch shingles laid loose (a Legschindeldach), held down by rows of poles
// with loaf-sized stones resting against them; walls of hewn logs crossed at the corners
// (Strickbau), the gables logged up too; a rubble-stone base; a small stone chimney with a
// slab cap; tiny windows; a roofed porch on two posts at the front gable. Around it: a
// hollowed-log trough, firewood under the eave, a log pile, a chopping block, a pole fence
// round a pen, trampled earth at the door.
// Built in the hut's own frame: origin at the middle of the floor, +z out of the front
// (porch) gable, +y up. Everything is procedurally shaded with the game's shared lighting.

const W = 6.0, L = 8.4; // footprint of the log walls: width (x), length (z)
const PITCH = 21 * Math.PI / 180, OV = 0.85, BACK = 0.7, PORCH = 1.9, FRONT = 0.35;
const LOG_T = 0.15;
// the logs' heights are random, so the eave and the ridge follow from stacking them
const rng = ( () => {

	let s = 1234567;
	return () => ( ( s = Math.imul( s ^ ( s >>> 15 ), 2246822507 ) + 0x6d2b79f5 | 0 ) >>> 0 ) / 4294967296;

} )();

const COURSES = [];
{

	let y = 0;
	while ( y < 2.05 ) {

		const h = 0.19 + rng() * 0.06;
		COURSES.push( { y, h } );
		y += h;

	}

}

const EAVE = COURSES[ COURSES.length - 1 ].y + COURSES[ COURSES.length - 1 ].h;
const RIDGE = EAVE + ( W / 2 ) * Math.tan( PITCH );
const Z0 = - L / 2 - BACK, Z1 = L / 2 + PORCH + FRONT; // the roof's back and front edges
// the trough stands out in front of the porch on the door's line, so that from its far end its
// water shows the doorway (see the story's hut beat)
export const HUT = { W, L, EAVE, RIDGE, PORCH, trough: new THREE.Vector3( - 0.8, 0, L / 2 + PORCH + 2.3 ), door: new THREE.Vector3( - 0.8, 0, L / 2 ) };

// ambient occlusion from where a point sits: under the roof, in the porch, near the ground
function hutAO( ground ) {

	return ( x, y, z, ny ) => {

		let a = 1;
		const under = Math.abs( x ) < W / 2 + OV - 0.05 && z > Z0 && z < Z1 && y < EAVE + 0.02;
		if ( under ) {

			const inside = Math.abs( x ) < W / 2 + 0.3;
			a = z > L / 2 + 0.2 ? 0.45 + 0.35 * Math.min( 1, ( z - L / 2 ) / PORCH ) * ( inside ? 1 : 1.3 ) : ( inside ? 0.75 : 0.7 );
			if ( ny < - 0.5 ) a *= 0.7;

		}

		if ( ny < - 0.5 && y > EAVE - 0.3 ) a = Math.min( a, 0.4 );
		const g = ground( x, z );
		a *= 0.5 + 0.5 * THREE.MathUtils.smoothstep( y - g, - 0.05, 0.5 );
		return Math.min( 1, a );

	};

}

// Builds the hut in its frame; ground( x, z ) is the terrain height in the hut's frame.
// Returns { geometry, parts }: the pieces that change while no one is looking come separately -
// parts.door (hinged at parts.door.pivot; open = rotation.y 1.65), parts.shutter.open /
// .shut, parts.cover (boards over the trough).
export function buildHut( ground ) {

	const k = new Kit( ground, hutAO( ground ) );
	const parts = {};
	let seed = 1;
	const R = () => {

		const x = Math.sin( ( seed ++ ) * 127.1 + 311.7 ) * 43758.5453;
		return x - Math.floor( x );

	};

	const lowest = Math.min( ground( - W / 2, - L / 2 ), ground( W / 2, - L / 2 ), ground( - W / 2, L / 2 + PORCH ), ground( W / 2, L / 2 + PORCH ), ground( 0, 0 ) );
	const base = lowest - 0.35;
	// log colours: warm brown sheltered, silvered and darker toward the ground and the corners
	const logCol = ( y, exposed ) => {

		const warm = [ '#6e4526', '#7c5230', '#5e3b22', '#835a36' ][ Math.floor( R() * 4 ) ];
		const c = mixc( warm, '#77706a', Math.min( 1, exposed * 0.45 + ( 1 - y / EAVE ) * 0.3 + R() * 0.15 ) );
		return c.multiplyScalar( 0.85 + 0.25 * R() );

	};

	// --- rubble-stone base under the walls, with footing stones bulging out along it
	const T = 0.6;
	const bh = - base, by = base / 2;
	k.box( 0, by, - L / 2 + T / 2 - 0.05, W + 0.1, bh, T, M.RUBBLE, '#8a8479' );
	k.box( 0, by, L / 2 - T / 2 + 0.05, W + 0.1, bh, T, M.RUBBLE, '#8a8479' );
	for ( const xs of [ - 1, 1 ] ) k.box( xs * ( W / 2 - T / 2 + 0.05 ), by, 0, T, bh, L - T * 2 + 0.2, M.RUBBLE, '#8a8479' );
	for ( let i = 0; i < 44; i ++ ) {

		const side = i % 4, t = R() - 0.5;
		const x = side < 2 ? t * W : ( side === 2 ? - 1 : 1 ) * ( W / 2 + 0.08 );
		const z = side < 2 ? ( side === 0 ? - 1 : 1 ) * ( L / 2 + 0.08 ) : t * L;
		const g = ground( x, z );
		if ( g > - 0.05 ) continue;
		k.stone( x, g, z, 0.18 + R() * 0.2, 0.1 + R() * 0.12, 0.16 + R() * 0.15, mixc( '#9c978c', '#7a7266', R() ), R() * 50 );

	}

	// --- the log walls. The front and back logs lie on whole courses, the side logs half a
	// course up; all run past the corners (crossed, the ends showing), each a little different
	const DOOR = [ - 1.25, - 0.35 ], DOOR_H = 1.72;
	const WIN_F = [ 0.75, 1.2, 1.02, 1.42 ]; // front: x0, x1, y0, y1
	const WIN_S = [ 0.4, 0.85, 1.0, 1.4 ]; // west side: z0, z1, y0, y1
	const logBox = ( x, y, z, sx, sy, sz, c ) => k.box( x, y, z, sx, sy * 0.965, sz, M.LOG, c, { round: 0.035 } );
	for ( let i = 0; i < COURSES.length; i ++ ) {

		const { y, h } = COURSES[ i ];
		const cy = y + h / 2;
		for ( const zs of [ - 1, 1 ] ) {

			const z = zs * ( L / 2 - LOG_T / 2 );
			const cuts = [];
			if ( zs > 0 && y < DOOR_H - 0.05 ) cuts.push( DOOR );
			if ( zs > 0 && cy > WIN_F[ 2 ] && cy < WIN_F[ 3 ] ) cuts.push( [ WIN_F[ 0 ], WIN_F[ 1 ] ] );
			const oL = 0.2 + R() * 0.14, oR = 0.2 + R() * 0.14;
			let x0 = - W / 2 - oL;
			for ( const [ a, b ] of [ ...cuts, [ W / 2 + oR, W / 2 + oR ] ] ) {

				if ( a - x0 > 0.05 ) logBox( ( x0 + a ) / 2, cy, z + ( R() - 0.5 ) * 0.02, a - x0, h, LOG_T + ( R() - 0.5 ) * 0.02, logCol( cy, zs < 0 ? 0.6 : 0.25 ) );
				x0 = b;

			}

		}

		const ys = y + h, hs = COURSES[ i + 1 ]?.h ?? h;
		if ( ys + hs / 2 <= EAVE + 0.01 ) for ( const xs of [ - 1, 1 ] ) {

			const x = xs * ( W / 2 - LOG_T / 2 );
			const cuts = [];
			if ( xs < 0 && ys + hs / 2 > WIN_S[ 2 ] && ys + hs / 2 < WIN_S[ 3 ] ) cuts.push( [ WIN_S[ 0 ], WIN_S[ 1 ] ] );
			const oB = 0.2 + R() * 0.14, oF = 0.2 + R() * 0.14;
			let z0 = - L / 2 - oB;
			for ( const [ a, b ] of [ ...cuts, [ L / 2 + oF, L / 2 + oF ] ] ) {

				if ( a - z0 > 0.05 ) logBox( x + ( R() - 0.5 ) * 0.02, ys + hs / 2, ( z0 + a ) / 2, LOG_T + ( R() - 0.5 ) * 0.02, hs, a - z0, logCol( ys, xs < 0 ? 0.5 : 0.3 ) );
				z0 = b;

			}

		}

	}

	// half-height sill logs under the side walls
	for ( const xs of [ - 1, 1 ] ) logBox( xs * ( W / 2 - LOG_T / 2 ), COURSES[ 0 ].h / 4, 0, LOG_T, COURSES[ 0 ].h / 2, L + 0.5, logCol( 0, 0.6 ) );

	// the gables are logged up too, each log cut to the roof's slope at both ends
	{

		const line = RIDGE + 0.085, tan = Math.tan( PITCH );
		const trap = ( pts, z, c, cy ) => {

			const g = new THREE.ExtrudeGeometry( new THREE.Shape( pts.map( ( [ x, y ] ) => new THREE.Vector2( x, y ) ) ), { depth: LOG_T, bevelEnabled: false } );
			g.translate( 0, 0, z - LOG_T / 2 );
			k.add( g, M.LOG, c, [ 1, 0, 0 ], [ 0, cy, z ] );

		};

		let y = EAVE;
		while ( y < line - 0.03 ) {

			const h = Math.min( 0.19 + R() * 0.05, line - y ), y1 = y + h, cy = y + h / 2;
			const hb = ( line - y ) / tan, ht = Math.max( 0, ( line - y1 ) / tan );
			for ( const zs of [ - 1, 1 ] ) {

				const z = zs * ( L / 2 - LOG_T / 2 ), c = logCol( cy, zs < 0 ? 0.7 : 0.45 );
				if ( zs > 0 && cy > EAVE + 0.3 && cy < EAVE + 0.72 ) {

					// a small hatch high in the front gable
					trap( [ [ - hb, y ], [ - 0.24, y ], [ - 0.24, y1 * 0.999 ], [ - ht, y1 * 0.999 ] ], z, c, cy );
					trap( [ [ 0.24, y ], [ hb, y ], [ ht, y1 * 0.999 ], [ 0.24, y1 * 0.999 ] ], z, c, cy );
					continue;

				}

				trap( ht > 0.01 ? [ [ - hb, y ], [ hb, y ], [ ht, y1 * 0.999 ], [ - ht, y1 * 0.999 ] ] : [ [ - hb, y ], [ hb, y ], [ 0, y1 ] ], z, c, cy );

			}

			y = y1 + 0.006;

		}

	}

	// the dark inside, seen through the door, windows, hatch and the gaps between logs
	{

		const d = L - LOG_T * 2 - 0.02;
		k.box( 0, EAVE / 2 - 0.05, 0, W - LOG_T * 2 - 0.02, EAVE, d, M.VOID, '#000000' );
		const tri = new THREE.Shape( [ new THREE.Vector2( - ( W / 2 - 0.25 ), EAVE - 0.06 ), new THREE.Vector2( W / 2 - 0.25, EAVE - 0.06 ), new THREE.Vector2( 0, RIDGE - 0.14 ) ] );
		const pg = new THREE.ExtrudeGeometry( tri, { depth: d, bevelEnabled: false } );
		pg.translate( 0, 0, - d / 2 );
		k.add( pg, M.VOID, '#000000' );

	}

	// door and window frames: squared posts, a heavy lintel, a sill
	const frame = '#4a3120';
	for ( const x of DOOR ) k.box( x + ( x === DOOR[ 0 ] ? - 0.06 : 0.06 ), DOOR_H / 2, L / 2 + 0.005, 0.12, DOOR_H, LOG_T + 0.05, M.LOG, col( frame ), { axis: [ 0, 1, 0 ], round: 0.02 } );
	k.box( ( DOOR[ 0 ] + DOOR[ 1 ] ) / 2, DOOR_H + 0.07, L / 2 + 0.01, DOOR[ 1 ] - DOOR[ 0 ] + 0.34, 0.15, LOG_T + 0.06, M.LOG, col( frame ), { round: 0.02 } );
	k.box( ( DOOR[ 0 ] + DOOR[ 1 ] ) / 2, - 0.06, L / 2 + 0.05, DOOR[ 1 ] - DOOR[ 0 ] + 0.2, 0.12, 0.3, M.STONE, '#9a958a' );
	const winFrame = ( a, b, y0, y1, face ) => {

		// face: ( ox, oz, along x? )
		const [ ox, oz, alongX ] = face;
		const put = ( u, v, su, sv, d ) => alongX ? k.box( u, v, oz, su, sv, d, M.LOG, col( frame ), { round: 0.01 } ) : k.box( ox, v, u, d, sv, su, M.LOG, col( frame ), { round: 0.01 } );
		put( ( a + b ) / 2, y0 - 0.04, b - a + 0.16, 0.07, LOG_T + 0.06 );
		put( ( a + b ) / 2, y1 + 0.04, b - a + 0.16, 0.07, LOG_T + 0.05 );
		// two bars across the dark opening
		put( ( a + b ) / 2, ( y0 + y1 ) / 2, 0.025, y1 - y0, 0.03 );

	};

	winFrame( WIN_F[ 0 ], WIN_F[ 1 ], WIN_F[ 2 ], WIN_F[ 3 ], [ 0, L / 2 + 0.01, true ] );
	winFrame( WIN_S[ 0 ], WIN_S[ 1 ], WIN_S[ 2 ], WIN_S[ 3 ], [ - W / 2 - 0.01, 0, false ] );

	// the door: vertical boards on three battens with a diagonal brace, iron hinges and latch;
	// shut, or swung in on its left hinge into the dark
	{

		const dw = DOOR[ 1 ] - DOOR[ 0 ] - 0.02, dh = DOOR_H - 0.03;
		const d = new Kit( ground );
		for ( let x = 0.07; x < dw; x += 0.15 ) d.box( x, dh / 2, 0, 0.145, dh - R() * 0.03, 0.04, M.BOARD, logCol( 1, 0.5 ), { axis: [ 0, 1, 0 ] } );
		for ( const y of [ 0.25, dh / 2, dh - 0.25 ] ) d.box( dw / 2, y, - 0.035, dw - 0.06, 0.1, 0.03, M.BOARD, logCol( 1, 0.3 ), { axis: [ 1, 0, 0 ] } );
		for ( const y of [ 0.3, dh - 0.3 ] ) d.box( 0.25, y, 0.03, 0.5, 0.045, 0.012, M.IRON, '#3a342e' );
		d.box( dw - 0.1, dh * 0.52, 0.035, 0.03, 0.14, 0.03, M.IRON, '#3a342e' );
		parts.door = { geometry: d.build(), pivot: [ DOOR[ 0 ] + 0.01, 0, L / 2 - 0.03 ] };

	}

	// shutters: board shutters beside the little windows, one folded open, the rest shut
	{

		const [ a, b, y0, y1 ] = WIN_F, w = ( b - a ), h = y1 - y0 + 0.08;
		const so = new Kit( ground, k.ao ), sc = new Kit( ground, k.ao ), sh = logCol( 1, 0.6 );
		so.box( b + w / 2 + 0.03, ( y0 + y1 ) / 2, L / 2 + 0.035, w, h, 0.035, M.BOARD, sh, { axis: [ 0, 1, 0 ] } );
		sc.box( ( a + b ) / 2, ( y0 + y1 ) / 2, L / 2 + 0.09, w + 0.04, h, 0.035, M.BOARD, sh, { axis: [ 0, 1, 0 ] } );
		parts.shutter = { open: so.build(), shut: sc.build() };
		// the window's centre, for the cloth J. nailed over it
		parts.window = [ ( a + b ) / 2, ( y0 + y1 ) / 2, L / 2 + 0.09, w + 0.1, h + 0.06 ];
		const [ c, e, s0, s1 ] = WIN_S;
		k.box( - W / 2 - 0.09, ( s0 + s1 ) / 2, ( c + e ) / 2, 0.035, s1 - s0 + 0.08, e - c + 0.04, M.BOARD, logCol( 1, 0.7 ), { axis: [ 0, 1, 0 ] } );

	}

	// --- roof. Purlins run through the gables and out over the porch; boards on them; then
	// the shingles course by course from the eave up, each split, uneven, lifted a little at
	// its lower end where it lies on the course below
	const zl = Z1 - Z0, zc = ( Z0 + Z1 ) / 2;
	const purlin = '#46301f';
	k.box( 0, RIDGE - 0.12, zc, 0.2, 0.22, zl, M.LOG, col( purlin ), { round: 0.03 } );
	for ( const xs of [ - 1, 1 ] ) {

		k.box( xs * ( W / 2 - LOG_T / 2 ), EAVE + 0.05, zc, 0.2, 0.18, zl, M.LOG, col( purlin ), { round: 0.03 } );
		k.box( xs * W / 4, ( EAVE + RIDGE ) / 2 - 0.1, zc, 0.18, 0.18, zl, M.LOG, col( purlin ), { round: 0.03 } );
		// porch post: a debarked trunk on a stone, a knee brace up to the purlin
		const px = xs * ( W / 2 - LOG_T / 2 ), pz = L / 2 + PORCH - 0.15;
		const g0 = ground( px, pz );
		k.stone( px, Math.min( g0, - 0.05 ), pz, 0.2, 0.14, 0.2, '#98938a', xs * 5 );
		k.pole( new THREE.Vector3( px, Math.min( g0, - 0.05 ) + 0.12, pz ), new THREE.Vector3( px, EAVE - 0.04, pz ), 0.095, M.LOG, col( '#6a5440' ), xs );
		k.pole( new THREE.Vector3( px, EAVE - 0.55, pz ), new THREE.Vector3( px, EAVE - 0.02, pz - 0.55 ), 0.05, M.LOG, col( '#5e4936' ), xs * 2 );

	}

	const S = ( W / 2 + OV ) / Math.cos( PITCH ); // along the slope, ridge to eave
	const deckT = 0.03, t = 0.011, exposure = 0.24;
	// roof frame per side: s along the slope down from the ridge line
	const slope = ( xs, s, lift ) => new THREE.Vector3( xs * s * Math.cos( PITCH ), RIDGE + 0.1 + deckT - s * Math.sin( PITCH ) + lift / Math.cos( PITCH ), 0 );
	const shingleCols = [ '#857b6e', '#8f8579', '#766d62', '#978c7e', '#7e7163', '#8a7f71', '#6d655b' ];
	const poles = [];
	for ( const xs of [ - 1, 1 ] ) {

		// the boards under the shingles (seen from beneath)
		const mid = slope( xs, S / 2, - deckT / 2 );
		k.box( mid.x, mid.y, zc, S, deckT, zl, M.BOARD, col( '#5a4632' ), { rot: [ 0, 0, - xs * PITCH ], axis: [ 0, 0, 1 ] } );
		const courses = Math.ceil( ( S + 0.08 ) / exposure ) + 1;
		for ( let c = - 2; c < courses; c ++ ) {

			// lower edge of this course, measured up from the eave (two starter layers under
			// the first, so the eave shows the stack's thickness)
			const u0 = Math.max( 0, c ) * exposure;
			let z = Z0 - 0.02 - R() * 0.08;
			while ( z < Z1 + 0.02 ) {

				const w = 0.085 + R() * 0.075, len = 0.62 + R() * 0.16;
				if ( z + w > Z1 + 0.06 ) break;
				const sLow = S + 0.08 - u0 + ( R() - 0.5 ) * 0.11 + ( c < 0 ? 0.02 : 0 ), sHigh = Math.max( 0.0, sLow - len );
				const lenC = sLow - sHigh;
				// raised 3t at its lower end, t at its upper end, and each course above the last
				const tilt = Math.atan( 2 * t / Math.max( lenC, 0.1 ) ) * 1.0;
				const sm = ( sLow + sHigh ) / 2;
				const p = slope( xs, sm, c < 0 ? ( c + 2 ) * t * 0.9 : 2 * t + c * 0.0002 );
				const g = new THREE.BoxGeometry( lenC, t, w );
				const curl = R() < 0.08 ? 0.05 + R() * 0.05 : 0;
				const rz = - xs * ( PITCH - ( c < 0 ? 0 : tilt ) - curl ) + ( R() - 0.5 ) * 0.025;
				const ry = ( R() - 0.5 ) * 0.08, rx = ( R() - 0.5 ) * 0.06;
				k.put( g, p.x, p.y, z + w / 2, [ rx, ry, rz, 'YXZ' ] );
				const tone = shingleCols[ Math.floor( R() * shingleCols.length ) ];
				k.add( g, M.SHINGLE, col( tone, 0.85 + 0.3 * R() ), [ xs * Math.cos( PITCH ), - Math.sin( PITCH ), 0 ], [ p.x, p.y, z ] );
				z += w + 0.003 + R() * 0.012;

			}

		}

		// a last course lapped over the ridge on this (the weather) side
		if ( xs < 0 ) for ( let z = Z0; z < Z1 - 0.1; z += 0.12 ) {

			const p = slope( xs, 0.12, 4 * t );
			const g = new THREE.BoxGeometry( 0.5, t, 0.11 );
			k.put( g, p.x + 0.13, p.y + 0.02, z + 0.06, [ 0, ( R() - 0.5 ) * 0.05, - xs * PITCH * 0.6, 'YXZ' ] );
			k.add( g, M.SHINGLE, col( shingleCols[ Math.floor( R() * 6 ) ], 0.8 + 0.3 * R() ), [ 1, 0, 0 ], [ p.x, p.y, z ] );

		}

		// the weight poles, every 0.75 m up the slope, and stones resting against them
		for ( let s = S - 0.35; s > 0.4; s -= 0.72 + R() * 0.08 ) {

			const r = 0.05 + R() * 0.015;
			const a = slope( xs, s, 3 * t + r ), b = a.clone();
			a.z = Z0 + 0.05 + R() * 0.1;
			b.z = Z1 - 0.05 - R() * 0.1;
			k.pole( a, b, r, M.BARK, col( '#5a4b3c', 0.85 + 0.3 * R() ), s * 7 + xs );
			poles.push( { xs, s, r } );
			for ( let z = Z0 + 0.3 + R() * 0.3; z < Z1 - 0.2; z += 0.4 + R() * 0.5 ) {

				if ( R() < 0.12 ) continue;
				const rx = 0.12 + R() * 0.1, rz = 0.14 + R() * 0.12, ry = 0.08 + R() * 0.07;
				const q = slope( xs, s - r - rx * 0.9, 3 * t );
				k.stone( q.x, q.y, z, rx, ry, rz, mixc( '#6f6a61', R() < 0.5 ? '#524f4a' : '#6a5e4e', R() ).multiplyScalar( 0.8 + 0.35 * R() ), z * 13 + s * 3, [ 0, 0, - xs * PITCH ] );

			}

		}

	}

	// ridge boards, and a row of heavier stones along the ridge
	for ( const xs of [ - 1, 1 ] ) {

		const p = slope( xs, 0.11, 4 * t + 0.02 );
		k.box( p.x, p.y, zc, 0.24, 0.035, zl, M.BOARD, logCol( 2, 0.8 ), { rot: [ 0, 0, - xs * PITCH ], axis: [ 0, 0, 1 ] } );

	}

	for ( let z = Z0 + 0.4; z < Z1 - 0.3; z += 0.55 + R() * 0.4 ) k.stone( ( R() - 0.5 ) * 0.1, RIDGE + 0.17, z, 0.14 + R() * 0.08, 0.08 + R() * 0.06, 0.14 + R() * 0.08, mixc( '#6f6a61', '#524f4a', R() ), z * 17 );
	// barge boards along the gable edges
	for ( const zz of [ Z0 - 0.015, Z1 + 0.015 ] ) for ( const xs of [ - 1, 1 ] ) {

		const p = slope( xs, S / 2, 0.0 );
		k.box( p.x, p.y - 0.05, zz, S + 0.05, 0.2, 0.035, M.BOARD, logCol( 2, 0.9 ), { rot: [ 0, 0, - xs * PITCH ], axis: [ 1, 0, 0 ] } );

	}

	// --- a rubble chimney through the back half of the roof, with a slab on four stones
	{

		const cx = 0.7, cz = - 1.6, top = RIDGE + 0.75;
		const roofY = RIDGE + 0.1 - cx * Math.tan( PITCH );
		k.box( cx, ( roofY - 0.2 + top ) / 2, cz, 0.55, top - roofY + 0.2, 0.55, M.RUBBLE, '#938d82' );
		for ( const [ dx, dz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) k.stone( cx + dx * 0.2, top, cz + dz * 0.2, 0.07, 0.05, 0.07, '#8f8a80', dx * 3 + dz );
		k.box( cx, top + 0.12, cz, 0.78, 0.06, 0.74, M.STONE, '#8b877e', { rot: [ 0.04, 0.2, - 0.03 ] } );

	}

	// --- the porch: big flagstones on a rubble edge, a step, the bench, the tin, the cowbell
	{

		const fy = - 0.04;
		k.box( 0, ( base + fy ) / 2, L / 2 + PORCH / 2 + 0.02, W + 0.3, fy - base, PORCH + 0.1, M.RUBBLE, '#8a8479' );
		k.box( 0, fy + 0.01, L / 2 + PORCH / 2 + 0.02, W + 0.28, 0.02, PORCH + 0.08, M.DIRT, col( '#56473a' ) );
		k.parts[ k.parts.length - 1 ].getAttribute( 'aAO' ).array.fill( 0.2 );
		for ( let i = 0; i < 16; i ++ ) {

			const cx = ( R() - 0.5 ) * ( W - 0.6 ), cz = L / 2 + 0.25 + R() * ( PORCH - 0.4 ), r = 0.28 + R() * 0.3;
			const pts = [];
			const nv = 7 + Math.floor( R() * 4 );
			for ( let j = 0; j < nv; j ++ ) {

				const a = j / nv * Math.PI * 2 + R() * 0.4, rr = r * ( 0.7 + R() * 0.45 );
				pts.push( new THREE.Vector2( Math.cos( a ) * rr, Math.sin( a ) * rr ) );

			}

			const g = new THREE.ExtrudeGeometry( new THREE.Shape( pts ), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.025, bevelSegments: 2 } );
			g.rotateX( - Math.PI / 2 );
			g.translate( cx, fy - 0.02 + ( R() - 0.5 ) * 0.02, cz );
			k.add( g, M.STONE, mixc( '#77726a', R() < 0.5 ? '#6a6258' : '#80786c', R() ).multiplyScalar( 0.85 + 0.25 * R() ), [ 1, 0, 0 ], [ cx, fy, cz ] );

		}
		const sg = ground( 0, L / 2 + PORCH + 0.45 );
		if ( sg < fy - 0.2 ) k.stone( - 0.4, sg, L / 2 + PORCH + 0.45, 0.55, ( fy - sg ) * 0.85, 0.3, '#99948a', 7 );
		// a bench: a split half-log on two stumps, against the wall under the window
		const bx = 1.3, bz = L / 2 + 0.33;
		for ( const dx of [ - 0.7, 0.7 ] ) k.pole( new THREE.Vector3( bx + dx, fy, bz ), new THREE.Vector3( bx + dx, fy + 0.4, bz ), 0.11, M.LOG, col( '#6b5037' ), dx );
		{

			const g = new THREE.CylinderGeometry( 0.15, 0.15, 1.9, 12, 1, false, 0, Math.PI );
			g.rotateZ( - Math.PI / 2 );
			g.translate( bx, fy + 0.55, bz );
			const c = logCol( 1, 0.6 );
			k.add( g, M.LOG, c, [ 1, 0, 0 ], [ bx, fy + 0.55, bz ] );
			k.box( bx, fy + 0.55, bz, 1.9, 0.012, 0.3, M.LOG, c.clone().multiplyScalar( 1.15 ), { axis: [ 1, 0, 0 ] } );

		}

		// the tin with the hut book, on a nail by the door
		k.box( - 0.05, 1.3, L / 2 + 0.07, 0.24, 0.17, 0.09, M.IRON, '#6a665e' );
		k.box( - 0.05, 1.395, L / 2 + 0.07, 0.25, 0.02, 0.1, M.IRON, '#5a564f' );
		// a cowbell on a broad leather strap, hanging from a nail on the left post
		const px = - ( W / 2 - LOG_T / 2 ), pz = L / 2 + PORCH - 0.15 + 0.1;
		k.box( px, 1.66, pz, 0.05, 0.36, 0.012, M.LEATHER, '#3b2718' );
		const bell = new THREE.CylinderGeometry( 0.05, 0.085, 0.19, 12, 1 );
		const bp = bell.getAttribute( 'position' );
		for ( let i = 0; i < bp.count; i ++ ) bp.setX( i, bp.getX( i ) * 0.75 );
		bell.computeVertexNormals();
		bell.translate( px, 1.42, pz + 0.03 );
		k.add( bell, M.BRONZE, '#7a5f34', [ 0, 1, 0 ] );

	}

	// --- firewood stacked under the east eave: split logs, end grain out
	{

		const x0 = W / 2 + 0.33;
		for ( let z = - L / 2 + 0.5; z < L / 2 - 0.3; z += 0.16 ) {

			const g = ground( x0, z );
			const top = Math.min( g + 1.35 + 0.1 * Math.sin( z * 1.3 ), EAVE - 0.3 );
			for ( let y = g + 0.08; y < top; y += 0.14 ) {

				const r = 0.055 + R() * 0.025, len = 0.42 + R() * 0.06;
				const zz = z + ( R() - 0.5 ) * 0.03, yy = y + ( R() - 0.5 ) * 0.02;
				// split: a quarter or half round
				const g2 = new THREE.CylinderGeometry( r, r, len, 7, 1, false, R() * 6, Math.PI * ( R() < 0.5 ? 0.5 : 1.0 ) + 0.4 );
				g2.rotateZ( Math.PI / 2 );
				g2.translate( x0 + ( R() - 0.5 ) * 0.06, yy, zz );
				k.add( g2, M.LOG, mixc( '#7a6048', '#b89c78', 0.2 + 0.4 * R() ), [ 1, 0, 0 ], [ x0, yy, zz ] );

			}

		}

	}

	// --- a pile of long logs by the pen, and a chopping block with an axe
	{

		const ox = W / 2 + 2.2, oz = - L / 2 - 1.5;
		let n = 0;
		for ( const [ row, cnt ] of [ [ 0, 5 ], [ 1, 4 ], [ 2, 2 ] ] ) for ( let i = 0; i < cnt; i ++ ) {

			const r = 0.11 + R() * 0.05;
			const x = ox + ( i - cnt / 2 ) * 0.27 + row * 0.13, g = ground( x, oz );
			const y = g + r + row * 0.22;
			const a = new THREE.Vector3( x, y, oz - 2.0 - R() * 0.3 ), b = new THREE.Vector3( x + ( R() - 0.5 ) * 0.2, y, oz + 1.8 + R() * 0.3 );
			k.pole( a, b, r, M.BARK, col( '#5d4b3b', 0.8 + 0.3 * R() ), n ++ );

		}

		const cx = W / 2 + 1.1, cz = L / 2 + 0.9, g = ground( cx, cz );
		k.pole( new THREE.Vector3( cx, g - 0.05, cz ), new THREE.Vector3( cx, g + 0.5, cz ), 0.22, M.BARK, col( '#5a4838' ), 3 );
		k.box( cx + 0.05, g + 0.5 + 0.28, cz, 0.035, 0.6, 0.035, M.LOG, col( '#7a6248' ), { rot: [ 0, 0, 0.35 ], axis: [ 0, 1, 0 ] } );
		k.box( cx - 0.02, g + 0.53, cz, 0.16, 0.08, 0.025, M.IRON, '#4a4540', { rot: [ 0, 0, 0.35 ] } );

	}

	// --- the trough: a larch trunk hollowed out, on two stones, a pipe on a post feeding it;
	// boards laid over it, or open with still water
	{

		const tp = HUT.trough, tl = 2.6, ro = 0.36, ri = 0.27;
		const cover = new Kit( ground, k.ao );
		const g = Math.min( ground( tp.x, tp.z - tl / 2 ), ground( tp.x, tp.z + tl / 2 ) );
		const axisY = g + 0.3 + ro; // the log's axis (its flat top)
		HUT.troughWater = axisY - 0.06;
		for ( const dz of [ - 0.8, 0.8 ] ) k.stone( tp.x, ground( tp.x, tp.z + dz ), tp.z + dz, 0.3, 0.19, 0.24, '#8a857b', dz * 9 );
		const half = ( r, flip ) => {

			const c = new THREE.CylinderGeometry( r, r, tl, 20, 1, true, - Math.PI / 2, Math.PI );
			c.rotateX( Math.PI / 2 );
			c.translate( tp.x, axisY, tp.z );
			if ( flip ) {

				const p = c.getAttribute( 'position' ), idx = c.index.array;
				for ( let i = 0; i < idx.length; i += 3 ) [ idx[ i + 1 ], idx[ i + 2 ] ] = [ idx[ i + 2 ], idx[ i + 1 ] ];
				c.computeVertexNormals();
				p.needsUpdate = true;

			}

			return c;

		};

		k.add( half( ro, false ), M.BARK, col( '#5f4b3a' ), [ 0, 0, 1 ], [ tp.x, axisY, tp.z ] );
		k.add( half( ri, true ), M.LOG, col( '#16120e' ), [ 0, 0, 1 ], [ tp.x, axisY, tp.z ] );
		for ( const xs of [ - 1, 1 ] ) k.box( tp.x + xs * ( ri + ro ) / 2, axisY - 0.005, tp.z, ro - ri, 0.01, tl, M.LOG, col( '#6a5440' ), { axis: [ 0, 0, 1 ] } );
		for ( const zs of [ - 1, 1 ] ) {

			const e = new THREE.CircleGeometry( ro, 20, Math.PI, Math.PI );
			e.rotateX( 0 );
			e.translate( 0, 0, 0 );
			if ( zs < 0 ) e.rotateY( Math.PI );
			e.translate( tp.x, axisY, tp.z + zs * tl / 2 );
			k.add( e, M.END, col( '#7a6248' ), [ 0, 0, 1 ], [ tp.x, axisY, tp.z + zs * tl / 2 ] );
			// solid ends inside the hollow
			k.box( tp.x, axisY - ri / 2, tp.z + zs * ( tl / 2 - 0.06 ), ri * 1.6, ri, 0.12, M.LOG, col( '#1c1712' ), { axis: [ 0, 0, 1 ] } );

		}

		// the feed pipe on its post at the far end, spouting back into the trough
		const postZ = tp.z + tl / 2 + 0.25, pg = ground( tp.x, postZ );
		k.pole( new THREE.Vector3( tp.x, pg - 0.05, postZ ), new THREE.Vector3( tp.x, axisY + 0.75, postZ ), 0.08, M.LOG, col( '#5a4632' ), 9 );
		k.pole( new THREE.Vector3( tp.x, axisY + 0.42, postZ - 0.05 ), new THREE.Vector3( tp.x, axisY + 0.36, postZ - 0.75 ), 0.04, M.BARK, col( '#4d3e30' ), 4 );
		HUT.troughPipe = new THREE.Vector3( tp.x, axisY + 0.36, postZ - 0.75 );
		for ( let i = 0; i < 6; i ++ ) {

			const zz = tp.z - tl / 2 + 0.3 + i * 0.4 + ( R() - 0.5 ) * 0.06, dx = ( R() - 0.5 ) * 0.08, c = logCol( 1, 0.8 ), ry = ( R() - 0.5 ) * 0.15, rz = ( R() - 0.5 ) * 0.03;
			cover.box( tp.x + dx, axisY + 0.02, zz, 0.85, 0.035, 0.22, M.BOARD, c, { rot: [ 0, ry, rz ], axis: [ 1, 0, 0 ] } );

		}

		parts.cover = cover.build();

	}

	// --- a pole fence round the pen behind the hut: posts, two rails lashed to them
	{

		const pen = [ [ - W / 2 - 0.2, - L / 2 - 0.2 ], [ - W / 2 - 2.5, - L / 2 - 8.5 ], [ W / 2 + 5.5, - L / 2 - 10.5 ], [ W / 2 + 6.5, - L / 2 - 3.5 ], [ W / 2 + 4.2, - L / 2 - 0.2 ] ];
		let n = 0;
		for ( let s = 0; s < pen.length - 1; s ++ ) {

			const [ ax, az ] = pen[ s ], [ bx, bz ] = pen[ s + 1 ];
			const len = Math.hypot( bx - ax, bz - az ), ux = ( bx - ax ) / len, uz = ( bz - az ) / len;
			const posts = Math.max( 1, Math.round( len / 2.3 ) );
			let prev = null;
			for ( let i = 0; i <= posts; i ++ ) {

				const d = i / posts * len;
				const x = ax + ux * d + ( R() - 0.5 ) * 0.1, z = az + uz * d + ( R() - 0.5 ) * 0.1, g = ground( x, z );
				// a gate gap on the far side
				const gap = s === 2 && i === 2;
				const top = new THREE.Vector3( x + ( R() - 0.5 ) * 0.08, g + 1.15 + R() * 0.1, z + ( R() - 0.5 ) * 0.08 );
				k.pole( new THREE.Vector3( x, g - 0.1, z ), top, 0.055, M.BARK, col( '#6a5c4c', 0.85 + 0.3 * R() ), n ++ );
				if ( prev && ! gap && ! prev.gap ) for ( const h of [ 0.5, 0.95 ] ) {

					const a = new THREE.Vector3( prev.x - ux * 0.15, prev.g + h + ( R() - 0.5 ) * 0.06, prev.z - uz * 0.15 );
					const b = new THREE.Vector3( x + ux * 0.15, g + h + ( R() - 0.5 ) * 0.06, z + uz * 0.15 );
					a.addScaledVector( new THREE.Vector3( uz, 0, - ux ), 0.07 );
					b.addScaledVector( new THREE.Vector3( uz, 0, - ux ), 0.07 );
					k.pole( a, b, 0.04, M.BARK, col( '#7a6b5a', 0.8 + 0.3 * R() ), n ++ );

				}

				prev = { x, z, g, gap };

			}

		}

	}

	// --- trampled earth in front of the porch and round the trough, loose stones about
	{

		const patch = ( cx, cz, rx, rz, seedP ) => {

			const segs = 28, rings = 4, pos = [], idx = [];
			for ( let r = 0; r <= rings; r ++ ) for ( let i = 0; i < segs; i ++ ) {

				const a = i / segs * Math.PI * 2, f = r / rings;
				const wob = 1 + 0.25 * Math.sin( a * 3 + seedP ) + 0.12 * Math.sin( a * 7 + seedP * 2 );
				const x = cx + Math.cos( a ) * rx * f * wob, z = cz + Math.sin( a ) * rz * f * wob;
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
			k.add( g, M.DIRT, col( '#5b4a38' ) );
			// soften the patch's rim with grass (its "ao" doubles as the edge mask)
			const a = k.parts[ k.parts.length - 1 ].getAttribute( 'aAO' ), p = k.parts[ k.parts.length - 1 ].getAttribute( 'position' );
			for ( let i = 0; i < a.count; i ++ ) a.setX( i, Math.hypot( ( p.getX( i ) - cx ) / rx, ( p.getZ( i ) - cz ) / rz ) );

		};

		patch( - 0.3, L / 2 + PORCH + 1.6, 2.2, 1.6, 1 );
		patch( HUT.trough.x, HUT.trough.z, 1.1, 2.1, 2 );
		for ( let i = 0; i < 14; i ++ ) {

			const a = R() * Math.PI * 2, d = 6 + R() * 9;
			const x = Math.cos( a ) * d, z = Math.sin( a ) * d + 1;
			if ( Math.abs( x ) < W / 2 + 1.5 && z > - L / 2 - 1 && z < L / 2 + PORCH + 1 ) continue;
			k.stone( x, ground( x, z ), z, 0.15 + R() * 0.3, 0.1 + R() * 0.2, 0.15 + R() * 0.25, mixc( '#9c978c', '#7a7266', R() ), R() * 40 );

		}

	}

	return { geometry: k.build(), parts };

}
