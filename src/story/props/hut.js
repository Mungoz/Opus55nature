import * as THREE from 'three';
import { Kit, M, col, mixc } from './kit.js';
import { ring } from './jetty.js';

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

	// --- inside. The herder's room, after photographs of alp huts and their cheese kitchens in the
	// Bernese Oberland, Appenzell, Graubünden and Tyrol (mockups/refs/hutinside): the logs and the
	// boarded ceiling gone brown-black with smoke; in the back corner a raised hearth of flags behind a
	// drystone fire-back, the copper cheese kettle hanging over the cold ashes from a wooden crane
	// that swings on its post; a cast-iron cook stove, its pipe up through the ceiling, pans and a
	// ladle on the wall over it, split wood stacked beside it; a rack of cheeses, moulds, tubs and
	// bowls on the back wall; the table in the other corner with a bench round two sides of it and
	// the crucifix on its shelf above (the Herrgottswinkel), the calendar; the bunk under the side
	// window, its straw mattress and wool blankets left as he got up, his boots by it; a coat and a
	// hat on the pegs by the door; along the east wall the milk cans, the churn, the tubs and the
	// one-legged milking stool. The storm lantern on the table is the only light (the props' shader
	// keeps the sun and most of the sky out: see ROOM in kit.js) and it throws no shadows of its own,
	// so they are baked into the colours at the end, with the smoke and the dark in the corners.
	{

		const x0 = - W / 2 + LOG_T, x1 = W / 2 - LOG_T, z0 = - L / 2 + LOG_T, z1 = L / 2 - LOG_T;
		// (the room throws its own dice, Q; the outside's, R, are left where they were for what follows)
		const seedA = seed;
		const Q = ( () => {

			let a = 90210;
			return () => {

				a = a + 0x6d2b79f5 | 0;
				let t = Math.imul( a ^ a >>> 15, 1 | a );
				t = t + Math.imul( t ^ t >>> 7, 61 | t ) ^ t;
				return ( ( t ^ t >>> 14 ) >>> 0 ) / 4294967296;

			};

		} )();
		const i0 = k.parts.length;
		const ink = '#000000';
		// the chinking in the gaps between the logs: a dark core inside each wall, round the openings
		const chink = ( cx, cz, sx, sz, ya, yb ) => k.box( cx, ( ya + yb ) / 2, cz, sx, yb - ya, sz, M.VOID, ink );
		const zf = L / 2 - LOG_T / 2, xs = W / 2 - LOG_T / 2, t = LOG_T * 0.45;
		chink( 0, - zf, W, t, 0, EAVE );
		chink( ( - W / 2 + DOOR[ 0 ] ) / 2, zf, DOOR[ 0 ] + W / 2, t, 0, EAVE );
		chink( ( DOOR[ 0 ] + DOOR[ 1 ] ) / 2, zf, DOOR[ 1 ] - DOOR[ 0 ], t, DOOR_H + 0.02, EAVE );
		chink( ( DOOR[ 1 ] + WIN_F[ 0 ] ) / 2, zf, WIN_F[ 0 ] - DOOR[ 1 ], t, 0, EAVE );
		chink( ( WIN_F[ 0 ] + WIN_F[ 1 ] ) / 2, zf, WIN_F[ 1 ] - WIN_F[ 0 ], t, 0, WIN_F[ 2 ] - 0.02 );
		chink( ( WIN_F[ 0 ] + WIN_F[ 1 ] ) / 2, zf, WIN_F[ 1 ] - WIN_F[ 0 ], t, WIN_F[ 3 ] + 0.02, EAVE );
		chink( ( WIN_F[ 1 ] + W / 2 ) / 2, zf, W / 2 - WIN_F[ 1 ], t, 0, EAVE );
		chink( xs, 0, t, L, 0, EAVE );
		chink( - xs, ( - L / 2 + WIN_S[ 0 ] ) / 2, t, WIN_S[ 0 ] + L / 2, 0, EAVE );
		chink( - xs, ( WIN_S[ 1 ] + L / 2 ) / 2, t, L / 2 - WIN_S[ 1 ], 0, EAVE );
		chink( - xs, ( WIN_S[ 0 ] + WIN_S[ 1 ] ) / 2, t, WIN_S[ 1 ] - WIN_S[ 0 ], 0, WIN_S[ 2 ] - 0.02 );
		chink( - xs, ( WIN_S[ 0 ] + WIN_S[ 1 ] ) / 2, t, WIN_S[ 1 ] - WIN_S[ 0 ], WIN_S[ 3 ] + 0.02, EAVE );

		// small makers
		const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
		const ss = ( x, a, b ) => THREE.MathUtils.smoothstep( x, a, b );
		// a colour between two, a little lighter or darker
		const tone = ( a, b, v = 0.2 ) => mixc( a, b, Q() ).multiplyScalar( 1 - v / 2 + v * Q() );
		const cyl = ( kit, x, y, z, r, h, mat, c, seg = 12, rTop = r ) => {

			const g = new THREE.CylinderGeometry( rTop, r, h, seg );
			g.translate( x, y + h / 2, z );
			kit.add( g, mat, c, [ 0, 1, 0 ], [ x, y, z ] );

		};
		// turned or coopered things: a profile of [ r, y ] from the middle of the bottom out, up the
		// outside, over the rim and down the inside (so the faces all look the right way)
		const lathe = ( kit, prof, x, y, z, mat, c, seg = 16, rot = null ) => {

			const g = new THREE.LatheGeometry( prof.map( ( [ r, h ] ) => new THREE.Vector2( r, h ) ), seg );
			if ( rot ) g.applyMatrix4( new THREE.Matrix4().makeRotationFromEuler( new THREE.Euler( ...rot ) ) );
			g.translate( x, y, z );
			kit.add( g, mat, c, [ 0, 1, 0 ], [ x, y, z ] );

		};
		// a squared timber from a to b ( w across, h up )
		const beam = ( kit, a, b, w, h, mat, c, up = V( 0, 1, 0 ) ) => {

			const d = b.clone().sub( a ), len = d.length(), zA = d.clone().normalize();
			let xA = new THREE.Vector3().crossVectors( up, zA );
			if ( xA.lengthSq() < 1e-6 ) xA = new THREE.Vector3( 1, 0, 0 ).cross( zA );
			if ( xA.lengthSq() < 1e-6 ) xA = V( 0, 0, 1 );
			xA.normalize();
			const yA = new THREE.Vector3().crossVectors( zA, xA );
			const g = new THREE.BoxGeometry( w, h, len );
			const mid = a.clone().add( b ).multiplyScalar( 0.5 );
			g.applyMatrix4( new THREE.Matrix4().makeBasis( xA, yA, zA ).setPosition( mid ) );
			kit.add( g, mat, c, zA.toArray(), mid.toArray() );

		};
		// a round bar, a wire, a pipe or a cord through points
		const tube = ( kit, pts, r, mat, c, rs = 6 ) => {

			const curve = new THREE.CatmullRomCurve3( pts, false, 'catmullrom', 0.3 );
			const g = new THREE.TubeGeometry( curve, Math.max( 3, ( pts.length - 1 ) * 5 ), r, rs, false );
			kit.add( g, mat, c, curve.getTangent( 0.5 ).toArray(), curve.getPoint( 0.5 ).toArray() );

		};
		// a hoop, a ring, a rim: a torus round axis
		const hoop = ( kit, x, y, z, r, tt, mat, c, axis = V( 0, 1, 0 ), seg = 24, arc = Math.PI * 2 ) => {

			const g = new THREE.TorusGeometry( r, tt, 4, seg, arc );
			g.applyQuaternion( new THREE.Quaternion().setFromUnitVectors( V( 0, 0, 1 ), axis.clone().normalize() ) );
			g.translate( x, y, z );
			kit.add( g, mat, c, [ 0, 1, 0 ], [ x, y, z ] );

		};
		// something soft or heaped: a sack, a pillow, a bundle, a heap of ash; sat on its base
		const lump = ( kit, x, y, z, rx, ry, rz, mat, c, s = 1, yaw = 0, seg = 10 ) => {

			const g = new THREE.SphereGeometry( 1, seg, Math.max( 5, seg * 0.7 | 0 ) );
			const p = g.getAttribute( 'position' );
			for ( let i = 0; i < p.count; i ++ ) {

				const px = p.getX( i ), py = p.getY( i ), pz = p.getZ( i );
				const f = 1 + 0.13 * Math.sin( px * 3.1 + s ) * Math.cos( pz * 2.7 + s * 1.3 ) + 0.07 * Math.sin( py * 5.3 + s * 2.1 );
				const yy = py < - 0.35 ? - 0.35 - ( - 0.35 - py ) * 0.2 : py;
				p.setXYZ( i, px * f * rx, ( yy + 0.39 ) * f * ry / 1.39, pz * f * rz );

			}

			g.computeVertexNormals();
			k.put( g, x, y, z, [ 0, yaw, 0 ] );
			kit.add( g, mat, c, [ 1, 0, 0 ], [ x, y, z ] );

		};

		// what the lantern's light cannot pass (boxes: min x, y, z, max x, y, z), for its shadows
		const occ = [];
		const block = ( cx, cy, cz, sx, sy, sz ) => occ.push( cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2 );
		const CE = EAVE - 0.035; // the underside of the ceiling boards
		const FL = 0.012; // the top of the floor (a hair above the footing that runs in under it)
		const furniture = [];
		const iron = col( '#2b2724' ), ironD = col( '#1c1a18' );
		const oldWood = () => tone( '#4a3726', '#5e4630', 0.25 );
		const paleWood = () => tone( '#8e7658', '#a58a68', 0.2 );

		// --- the floor: wide boards from the door to the back wall, some butt-jointed where one ran
		// out, black between them; a sill timber along the foot of each side wall
		k.box( 0, - 0.06, 0, x1 - x0, 0.02, z1 - z0, M.VOID, ink );
		{

			let x = x0;
			while ( x < x1 - 0.02 ) {

				let w = 0.17 + Q() * 0.1;
				if ( x1 - ( x + w ) < 0.12 ) w = x1 - x;
				const c = tone( '#42362b', '#564537', 0.3 );
				const cut = Q() < 0.55 ? z0 + 1.2 + Q() * ( z1 - z0 - 2.4 ) : null;
				for ( const [ a, b ] of cut ? [ [ z0, cut ], [ cut, z1 ] ] : [ [ z0, z1 ] ] ) {

					const len = b - a - 0.005, n = Math.max( 2, Math.round( len / 0.24 ) );
					const g = new THREE.BoxGeometry( w - 0.007, 0.04, len, 1, 1, n );
					g.translate( x + w / 2, FL - 0.02, ( a + b ) / 2 );
					k.add( g, M.BOARD, c.clone().multiplyScalar( 0.9 + 0.2 * Q() ), [ 0, 0, 1 ], [ x + w / 2, FL, ( a + b ) / 2 ] );

				}

				x += w;

			}

		}

		for ( const s of [ - 1, 1 ] ) k.box( s * ( x1 - 0.045 ), 0.125, 0, 0.09, 0.23, z1 - z0 - 0.002, M.LOG, tone( '#3a2819', '#4a3421', 0.1 ), { axis: [ 0, 0, 1 ] } );

		// --- the ceiling: hewn joists across, boards along over them (the loft above, out of sight),
		// black-brown with smoke; a hole over the hearth where the smoke finds its way up to the roof
		const hole = [ 1.62, 2.28, - 3.9, - 3.24 ];
		k.box( 0, CE + 0.08, 0, x1 - x0, 0.02, z1 - z0, M.VOID, ink );
		for ( const z of [ - 3.1, - 1.05, 1.05, 3.1 ] ) {

			const zz = z + ( Q() - 0.5 ) * 0.04;
			k.box( 0, CE - 0.075, zz, x1 - x0, 0.15, 0.14 + Q() * 0.03, M.LOG, tone( '#281e15', '#34281c', 0.2 ), { axis: [ 1, 0, 0 ] } );
			block( 0, CE - 0.075, zz, x1 - x0, 0.15, 0.14 );

		}

		{

			let x = x0;
			while ( x < x1 - 0.02 ) {

				let w = 0.18 + Q() * 0.08;
				if ( x1 - ( x + w ) < 0.12 ) w = x1 - x;
				const c = tone( '#211912', '#2e2319', 0.3 );
				const over = x + w > hole[ 0 ] && x < hole[ 1 ];
				for ( const [ a, b ] of over ? [ [ z0, hole[ 2 ] ], [ hole[ 3 ], z1 ] ] : [ [ z0, z1 ] ] ) {

					const len = b - a, n = Math.max( 1, Math.round( len / 0.25 ) );
					const g = new THREE.BoxGeometry( w - 0.006, 0.03, len, 1, 1, n );
					g.translate( x + w / 2, CE + 0.015, ( a + b ) / 2 );
					k.add( g, M.BOARD, c, [ 0, 0, 1 ], [ x + w / 2, CE, ( a + b ) / 2 ] );

				}

				x += w;

			}

		}

		// --- the corner bench round the back and west walls: seat boards on a boarded box, a
		// backrest leaning on the logs
		const BH = 0.46, xb = x0 + 2.12, zb = z0 + 1.95;
		{

			const wood = tone( '#4e3a28', '#5a4430', 0.1 );
			const w = () => wood.clone().multiplyScalar( 0.88 + 0.24 * Q() );
			k.box( ( x0 + xb ) / 2, BH - 0.025, z0 + 0.215, xb - x0, 0.05, 0.43, M.BOARD, w(), { axis: [ 1, 0, 0 ] } );
			k.box( x0 + 0.215, BH - 0.025, ( z0 + 0.43 + zb ) / 2, 0.43, 0.05, zb - z0 - 0.43, M.BOARD, w(), { axis: [ 0, 0, 1 ] } );
			k.box( ( x0 + 0.4 + xb ) / 2, BH / 2, z0 + 0.4, xb - x0 - 0.4, BH - 0.05, 0.025, M.BOARD, w(), { axis: [ 1, 0, 0 ] } );
			k.box( x0 + 0.4, BH / 2, ( z0 + 0.4 + zb ) / 2, 0.025, BH - 0.05, zb - z0 - 0.4, M.BOARD, w(), { axis: [ 0, 0, 1 ] } );
			k.box( xb - 0.015, BH / 2, z0 + 0.2, 0.03, BH - 0.05, 0.4, M.BOARD, w(), { axis: [ 0, 1, 0 ] } );
			k.box( x0 + 0.2, BH / 2, zb - 0.015, 0.4, BH - 0.05, 0.03, M.BOARD, w(), { axis: [ 0, 1, 0 ] } );
			// a plinth board along the foot, kicked dark
			k.box( ( x0 + 0.4 + xb ) / 2, 0.05, z0 + 0.415, xb - x0 - 0.4, 0.08, 0.012, M.BOARD, w().multiplyScalar( 0.6 ), { axis: [ 1, 0, 0 ] } );
			k.box( x0 + 0.415, 0.05, ( z0 + 0.4 + zb ) / 2, 0.012, 0.08, zb - z0 - 0.4, M.BOARD, w().multiplyScalar( 0.6 ), { axis: [ 0, 0, 1 ] } );
			k.box( ( x0 + xb ) / 2, 0.69, z0 + 0.075, xb - x0, 0.3, 0.025, M.BOARD, w(), { rot: [ - 0.22, 0, 0 ], axis: [ 1, 0, 0 ] } );
			k.box( x0 + 0.075, 0.69, ( z0 + zb ) / 2, 0.025, 0.3, zb - z0, M.BOARD, w(), { rot: [ 0, 0, 0.22 ], axis: [ 0, 0, 1 ] } );
			block( ( x0 + xb ) / 2, BH / 2, z0 + 0.215, xb - x0, BH, 0.43 );
			block( x0 + 0.215, BH / 2, ( z0 + zb ) / 2, 0.43, BH, zb - z0 );
			furniture.push( [ ( x0 + xb ) / 2, z0 + 0.215, ( xb - x0 ) / 2, 0.22 ], [ x0 + 0.215, ( z0 + 0.43 + zb ) / 2, 0.22, ( zb - z0 - 0.43 ) / 2 ] );
			// a sheepskin thrown on the seat in the corner
			lump( k, x0 + 0.36, BH, z0 + 0.3, 0.3, 0.05, 0.22, M.LEATHER, col( '#8a806c' ), 3, 0.5 );

		}

		// --- the table in the corner: a thick scrubbed top of three boards on a frame, four legs, low
		// rails, a drawer on the room side
		const TW = 1.3, TD = 0.82, TH = 0.78, tx = x0 + 1.17, tz = z0 + 0.86;
		{

			const top = tone( '#6c5842', '#7a644c', 0.08 ), frame = tone( '#46341f', '#54402a', 0.1 );
			for ( let i = 0; i < 3; i ++ ) k.box( tx + ( Q() - 0.5 ) * 0.01, TH - 0.028, tz - TD / 2 + TD / 6 * ( 2 * i + 1 ), TW, 0.055, TD / 3 - 0.005, M.LOG, top.clone().multiplyScalar( 0.9 + 0.2 * Q() ), { axis: [ 1, 0, 0 ] } );
			const lx = TW / 2 - 0.13, lz = TD / 2 - 0.09;
			for ( const s of [ - 1, 1 ] ) {

				k.box( tx, TH - 0.11, tz + s * lz, TW - 0.26, 0.11, 0.025, M.BOARD, frame, { axis: [ 1, 0, 0 ] } );
				k.box( tx + s * lx, TH - 0.11, tz, 0.025, 0.11, TD - 0.18, M.BOARD, frame, { axis: [ 0, 0, 1 ] } );
				k.box( tx + s * lx, 0.15, tz, 0.045, 0.05, TD - 0.18, M.LOG, frame, { axis: [ 0, 0, 1 ] } );

			}

			k.box( tx, 0.15, tz, TW - 0.26, 0.045, 0.045, M.LOG, frame, { axis: [ 1, 0, 0 ] } );
			for ( const [ sx, sz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) k.box( tx + sx * lx, ( TH - 0.055 ) / 2, tz + sz * lz, 0.07, TH - 0.055, 0.07, M.LOG, frame, { axis: [ 0, 1, 0 ] } );
			// the drawer, its knob
			k.box( tx + 0.12, TH - 0.11, tz + lz + 0.016, 0.42, 0.08, 0.012, M.BOARD, top.clone().multiplyScalar( 0.7 ), { axis: [ 1, 0, 0 ] } );
			cyl( k, tx + 0.12, TH - 0.12, tz + lz + 0.03, 0.014, 0.02, M.LOG, frame, 8 );
			block( tx, TH - 0.07, tz, TW, 0.14, TD );
			furniture.push( [ tx, tz, TW / 2 + 0.02, TD / 2 + 0.02 ] );

		}

		// the lantern and the key lie at the table's room end (they are parts, below); left on the
		// table: a blue-rimmed enamel plate with the end of a loaf and a rind of cheese, a knife, an
		// enamel mug, a brown bottle, a newspaper, matches
		const lampAt = V( tx + 0.3, TH, tz + 0.1 ), keyAt = V( tx + 0.5, TH, tz + 0.3 );
		{

			const px = tx - 0.2, pz = tz + 0.12;
			lathe( k, [ [ 0, 0 ], [ 0.08, 0 ], [ 0.11, 0.019 ], [ 0.113, 0.022 ], [ 0.105, 0.021 ], [ 0.078, 0.006 ], [ 0, 0.006 ] ], px, TH, pz, M.LEATHER, col( '#c2beb2' ), 20 );
			hoop( k, px, TH + 0.021, pz, 0.109, 0.0025, M.LEATHER, col( '#1f2a44' ), V( 0, 1, 0 ), 24 );
			lump( k, px - 0.03, TH + 0.006, pz - 0.02, 0.065, 0.055, 0.05, M.LEATHER, col( '#5a3c20' ), 2, 0.4, 8 );
			k.box( px + 0.04, TH + 0.022, pz + 0.035, 0.07, 0.03, 0.022, M.LEATHER, col( '#8c6c34' ), { rot: [ 0, 0.8, 0 ] } );
			k.box( px + 0.14, TH + 0.003, pz + 0.07, 0.12, 0.004, 0.018, M.IRON, col( '#6e6a64' ), { rot: [ 0, - 0.35, 0 ] } );
			k.box( px + 0.25, TH + 0.008, pz + 0.11, 0.1, 0.016, 0.02, M.LOG, col( '#3a2616' ), { rot: [ 0, - 0.35, 0 ], axis: [ 1, 0, 0 ] } );
			// the mug
			const mx = tx - 0.42, mz = tz - 0.08;
			lathe( k, [ [ 0, 0 ], [ 0.04, 0 ], [ 0.042, 0.004 ], [ 0.043, 0.085 ], [ 0.045, 0.089 ], [ 0.04, 0.09 ], [ 0.039, 0.012 ], [ 0, 0.012 ] ], mx, TH, mz, M.LEATHER, col( '#c0bcb0' ), 14 );
			hoop( k, mx, TH + 0.088, mz, 0.043, 0.003, M.LEATHER, col( '#1f2a44' ), V( 0, 1, 0 ), 16 );
			tube( k, [ V( mx + 0.04, TH + 0.075, mz ), V( mx + 0.068, TH + 0.068, mz ), V( mx + 0.071, TH + 0.045, mz ), V( mx + 0.041, TH + 0.024, mz ) ], 0.005, M.LEATHER, col( '#c0bcb0' ), 5 );
			// the bottle and its cork
			const bx = tx - 0.5, bz = tz - 0.25;
			lathe( k, [ [ 0, 0 ], [ 0.036, 0 ], [ 0.037, 0.16 ], [ 0.03, 0.2 ], [ 0.014, 0.22 ], [ 0.013, 0.255 ], [ 0.015, 0.26 ], [ 0, 0.26 ] ], bx, TH, bz, M.LEATHER, col( '#231a0e' ), 14 );
			cyl( k, bx, TH + 0.26, bz, 0.011, 0.02, M.LEATHER, col( '#8a6e48' ), 8 );
			// the newspaper, folded; a box of matches
			k.box( tx - 0.02, TH + 0.005, tz - 0.25, 0.3, 0.01, 0.21, M.LEATHER, col( '#8e897c' ), { rot: [ 0, 0.18, 0 ] } );
			k.box( tx - 0.03, TH + 0.0105, tz - 0.25, 0.27, 0.002, 0.012, M.LEATHER, col( '#3a3834' ), { rot: [ 0, 0.18, 0 ] } );
			k.box( tx + 0.12, TH + 0.008, tz - 0.05, 0.052, 0.016, 0.036, M.LEATHER, col( '#7a2a18' ), { rot: [ 0, - 0.5, 0 ] } );

		}

		// a three-legged stool at the table's end
		const stool = ( x, z, h, r, yaw ) => {

			const wood = oldWood();
			cyl( k, x, h - 0.045, z, r, 0.045, M.LOG, wood, 14 );
			for ( let i = 0; i < 3; i ++ ) {

				const a = yaw + i / 3 * Math.PI * 2;
				beam( k, V( x + Math.cos( a ) * r * 0.55, h - 0.045, z + Math.sin( a ) * r * 0.55 ), V( x + Math.cos( a ) * r * 1.15, FL, z + Math.sin( a ) * r * 1.15 ), 0.035, 0.035, M.LOG, wood );

			}

			block( x, h - 0.022, z, r * 1.6, 0.045, r * 1.6 );
			furniture.push( [ x, z, r + 0.02, r + 0.02 ] );

		};

		stool( tx + TW / 2 + 0.3, tz + 0.12, 0.47, 0.16, 0.4 );

		// --- the Herrgottswinkel over the table: a three-cornered shelf in the corner, a cloth
		// worked in red hanging from its edge, the crucifix above, a holy picture either side, a red
		// glass for a candle, a bunch of dried flowers
		{

			const y = 1.6, s = 0.36;
			const sh = new THREE.Shape( [ new THREE.Vector2( 0, 0 ), new THREE.Vector2( s, 0 ), new THREE.Vector2( 0, s ) ] );
			const g = new THREE.ExtrudeGeometry( sh, { depth: 0.028, bevelEnabled: false } );
			g.rotateX( Math.PI / 2 );
			g.translate( x0, y, z0 );
			k.add( g, M.BOARD, oldWood(), [ 1, 0, 1 ], [ x0, y, z0 ] );
			const c = V( x0 + s / 2 + 0.006, y - 0.09, z0 + s / 2 + 0.006 );
			k.box( c.x, c.y, c.z, s * 1.414, 0.16, 0.005, M.LEATHER, col( '#b4ad9c' ), { rot: [ 0, Math.PI / 4, 0 ] } );
			k.box( c.x + 0.003, c.y - 0.05, c.z + 0.003, s * 1.414 - 0.01, 0.03, 0.004, M.LEATHER, col( '#7a1c16' ), { rot: [ 0, Math.PI / 4, 0 ] } );
			k.box( c.x + 0.003, c.y + 0.03, c.z + 0.003, s * 1.414 - 0.08, 0.014, 0.004, M.LEATHER, col( '#7a1c16' ), { rot: [ 0, Math.PI / 4, 0 ] } );
			for ( let i = 0; i < 5; i ++ ) k.box( c.x + 0.003 + ( i - 2 ) * 0.06 / 1.414, c.y - 0.008, c.z + 0.003 - ( i - 2 ) * 0.06 / 1.414, 0.025, 0.025, 0.004, M.LEATHER, col( '#7a1c16' ), { rot: [ 0, Math.PI / 4, Math.PI / 4 ] } );
			// the cross, facing the room across the corner
			const cx = x0 + 0.1, cz = z0 + 0.1;
			const rot = [ 0, Math.PI / 4, 0 ];
			k.box( cx, y + 0.3, cz, 0.03, 0.42, 0.02, M.LOG, col( '#2e2016' ), { rot, axis: [ 0, 1, 0 ] } );
			k.box( cx, y + 0.4, cz, 0.24, 0.03, 0.02, M.LOG, col( '#2e2016' ), { rot, axis: [ 1, 0, 0 ] } );
			const f = 0.016 / 1.414;
			k.box( cx + f, y + 0.3, cz + f, 0.03, 0.16, 0.014, M.LEATHER, col( '#b8a888' ), { rot } );
			k.box( cx + f, y + 0.39, cz + f, 0.2, 0.02, 0.012, M.LEATHER, col( '#b8a888' ), { rot } );
			k.box( cx + f, y + 0.415, cz + f, 0.03, 0.03, 0.016, M.LEATHER, col( '#b8a888' ), { rot } );
			k.box( cx + f, y + 0.2, cz + f, 0.024, 0.05, 0.012, M.LEATHER, col( '#b8a888' ), { rot } );
			k.box( cx, y + 0.49, cz, 0.07, 0.03, 0.024, M.LEATHER, col( '#b4ad9c' ), { rot } );
			// the red glass and the flowers in a jar
			cyl( k, x0 + 0.1, y, z0 + 0.1, 0.028, 0.07, M.LEATHER, col( '#5a120c' ), 10 );
			cyl( k, x0 + 0.2, y, z0 + 0.06, 0.03, 0.09, M.LEATHER, col( '#4a4a3e' ), 10 );
			for ( let i = 0; i < 6; i ++ ) {

				const a = i * 1.1, top = V( x0 + 0.2 + Math.cos( a ) * 0.07, y + 0.2 + Q() * 0.08, z0 + 0.07 + Math.abs( Math.sin( a ) ) * 0.06 );
				beam( k, V( x0 + 0.2, y + 0.07, z0 + 0.06 ), top, 0.004, 0.004, M.LOG, col( '#4a4028' ) );
				lump( k, top.x, top.y - 0.01, top.z, 0.018, 0.02, 0.018, M.LEATHER, i % 2 ? col( '#6a5a36' ) : col( '#5a2a28' ), i, 0, 6 );

			}

			// the pictures, left and right of the corner, in black frames
			for ( const [ px, pz, nx, nz, tint ] of [ [ x0 + 0.62, z0 + 0.006, 0, 1, '#3a4a66' ], [ x0 + 0.006, z0 + 0.62, 1, 0, '#6a3024' ] ] ) {

				const along = nz ? [ 1, 0, 0 ] : [ 0, 0, 1 ];
				k.box( px, y + 0.28, pz, nz ? 0.2 : 0.012, 0.26, nx ? 0.2 : 0.012, M.LOG, col( '#1a1612' ), { axis: along } );
				k.box( px + nx * 0.007, y + 0.28, pz + nz * 0.007, nz ? 0.15 : 0.004, 0.2, nx ? 0.15 : 0.004, M.LEATHER, col( '#9c9078' ) );
				k.box( px + nx * 0.01, y + 0.29, pz + nz * 0.01, nz ? 0.1 : 0.003, 0.13, nx ? 0.1 : 0.003, M.LEATHER, col( tint ) );

			}

		}

		// --- the calendar on the west wall over the bench (October 1994), on its nail
		{

			const z = z0 + 1.42, y = 1.32, x = x0 + 0.004;
			k.box( x, y, z, 0.006, 0.46, 0.31, M.LEATHER, col( '#bdb6a4' ) );
			k.box( x + 0.004, y + 0.11, z, 0.004, 0.2, 0.28, M.LEATHER, col( '#56687c' ) );
			k.box( x + 0.006, y + 0.07, z, 0.004, 0.08, 0.28, M.LEATHER, col( '#cfc9bb' ) );
			k.box( x + 0.008, y + 0.035, z + 0.03, 0.004, 0.05, 0.2, M.LEATHER, col( '#46502e' ) );
			for ( let i = 0; i < 5; i ++ ) k.box( x + 0.005, y - 0.03 - i * 0.034, z, 0.003, 0.012, 0.26, M.LEATHER, col( '#6a665c' ) );
			k.box( x + 0.006, y - 0.2, z, 0.003, 0.03, 0.14, M.LEATHER, col( '#7a1c16' ) );
			cyl( k, x + 0.01, y + 0.235, z, 0.004, 0.02, M.IRON, iron, 5 );

		}

		// a photograph in a frame over the table: cattle on the alp
		k.box( tx + 0.25, 1.3, z0 + 0.008, 0.26, 0.19, 0.014, M.LOG, col( '#3a2a1c' ), { axis: [ 1, 0, 0 ] } );
		k.box( tx + 0.25, 1.3, z0 + 0.016, 0.21, 0.14, 0.004, M.LEATHER, col( '#7a766c' ) );
		k.box( tx + 0.25, 1.27, z0 + 0.019, 0.21, 0.05, 0.003, M.LEATHER, col( '#4a4a40' ) );
		// the hook over the table where the lantern hangs at night (it stands on the table now)
		tube( k, [ V( tx + 0.3, CE - 0.15, - 3.1 + 0.07 ), V( tx + 0.3, CE - 0.3, - 3.1 + 0.07 ), V( tx + 0.33, CE - 0.34, - 3.1 + 0.07 ), V( tx + 0.35, CE - 0.3, - 3.1 + 0.07 ) ], 0.005, M.IRON, iron, 4 );

		// --- the rack on the back wall: four shelves on posts, the cheese things on it - wheels of
		// alp cheese on a board, the bent-wood moulds (Järbe), wooden tubs and bowls, a milk sieve,
		// enamel pots, tins, a radio
		const xr0 = - 0.62, xr1 = 0.98;
		{

			const wood = tone( '#4c3826', '#5a4430', 0.1 ), d = 0.36, zc = z0 + d / 2;
			for ( const x of [ xr0 + 0.025, xr1 - 0.025 ] ) for ( const z of [ z0 + 0.03, z0 + d - 0.025 ] ) k.box( x, 0.93, z, 0.045, 1.86, 0.045, M.LOG, wood, { axis: [ 0, 1, 0 ] } );
			const shelves = [ 0.1, 0.56, 1.02, 1.47 ];
			for ( const y of shelves ) {

				k.box( ( xr0 + xr1 ) / 2, y, zc, xr1 - xr0, 0.03, d, M.BOARD, wood.clone().multiplyScalar( 0.9 + 0.2 * Q() ), { axis: [ 1, 0, 0 ] } );
				block( ( xr0 + xr1 ) / 2, y, zc, xr1 - xr0, 0.03, d );

			}

			k.box( ( xr0 + xr1 ) / 2, 1.84, z0 + d - 0.025, xr1 - xr0, 0.06, 0.03, M.LOG, wood, { axis: [ 1, 0, 0 ] } );
			let y = shelves[ 0 ] + 0.015;
			// bottom: two tubs one on the other, upside down; a big basket; a sieve
			// (a tub the right way up, or turned over: the same profile upside down, run backwards)
			const tub = ( x, yy, z, r, h, c, up = true ) => {

				const p = [ [ 0, 0 ], [ r * 0.9, 0 ], [ r, h ], [ r - 0.015, h ], [ r * 0.9 - 0.015, 0.02 ], [ 0, 0.02 ] ];
				lathe( k, up ? p : p.map( ( [ a, b ] ) => [ a, h - b ] ).reverse(), x, yy, z, M.BOARD, c, 18 );
				for ( const f of [ 0.25, 0.75 ] ) hoop( k, x, yy + h * f, z, r * ( 0.9 + 0.1 * ( up ? f : 1 - f ) ) + 0.004, 0.005, M.BOARD, c.clone().multiplyScalar( 0.6 ), V( 0, 1, 0 ), 20 );

			};

			tub( xr0 + 0.28, y, zc + 0.05, 0.2, 0.16, paleWood(), false );
			tub( xr0 + 0.28, y + 0.16, zc + 0.05, 0.185, 0.15, paleWood(), false );
			lathe( k, [ [ 0, 0 ], [ 0.16, 0 ], [ 0.2, 0.26 ], [ 0.19, 0.26 ], [ 0.15, 0.012 ], [ 0, 0.012 ] ], xr0 + 0.8, y, zc + 0.03, M.ROPE, col( '#6e5a3a' ), 16 );
			lathe( k, [ [ 0, 0 ], [ 0.05, 0 ], [ 0.16, 0.14 ], [ 0.155, 0.145 ], [ 0.045, 0.01 ], [ 0, 0.01 ] ], xr0 + 1.3, y, zc, M.BOARD, paleWood(), 16 );
			// the cheeses on their board
			y = shelves[ 1 ] + 0.015;
			for ( const [ x, r, h, lift ] of [ [ xr0 + 0.22, 0.18, 0.09, 0 ], [ xr0 + 0.22, 0.17, 0.085, 0.09 ], [ xr0 + 0.62, 0.19, 0.095, 0 ], [ xr0 + 1.02, 0.18, 0.09, 0 ], [ xr0 + 1.38, 0.15, 0.08, 0 ] ] ) {

				lathe( k, [ [ 0, 0 ], [ r - 0.015, 0 ], [ r, 0.015 ], [ r + 0.004, h / 2 ], [ r, h - 0.015 ], [ r - 0.015, h ], [ 0, h ] ], x, y + lift, zc + 0.02 + Q() * 0.02, M.LEATHER, tone( '#7a5a28', '#8e6a32', 0.15 ), 18 );

			}

			// moulds, bowls
			y = shelves[ 2 ] + 0.015;
			for ( const [ x, r, h ] of [ [ xr0 + 0.2, 0.17, 0.11 ], [ xr0 + 0.2, 0.15, 0.1 ], [ xr0 + 0.55, 0.16, 0.12 ] ] ) {

				const yy = y + ( r < 0.16 ? 0.11 : 0 );
				lathe( k, [ [ r, 0 ], [ r, h ], [ r - 0.007, h ], [ r - 0.007, 0 ], [ r, 0 ] ], x, yy, zc, M.BOARD, paleWood(), 20 );

			}

			for ( const [ x, r, h ] of [ [ xr0 + 0.92, 0.14, 0.07 ], [ xr0 + 0.92, 0.12, 0.06 ], [ xr0 + 1.3, 0.13, 0.075 ] ] ) {

				const yy = y + ( r < 0.13 ? 0.055 : 0 );
				lathe( k, [ [ 0, 0 ], [ r * 0.5, 0 ], [ r * 0.9, h * 0.5 ], [ r, h ], [ r - 0.01, h ], [ r * 0.88, h * 0.5 ], [ r * 0.48, 0.01 ], [ 0, 0.01 ] ], x, yy, zc, M.BOARD, tone( '#6e5438', '#8a6a48' ), 16 );

			}

			// top: enamel pots, tins, a paraffin can, the radio
			y = shelves[ 3 ] + 0.015;
			lathe( k, [ [ 0, 0 ], [ 0.1, 0 ], [ 0.105, 0.14 ], [ 0.11, 0.145 ], [ 0.1, 0.145 ], [ 0.095, 0.01 ], [ 0, 0.01 ] ], xr0 + 0.18, y, zc, M.LEATHER, col( '#28385a' ), 16 );
			lathe( k, [ [ 0, 0 ], [ 0.08, 0 ], [ 0.085, 0.12 ], [ 0.09, 0.125 ], [ 0.08, 0.125 ], [ 0.075, 0.01 ], [ 0, 0.01 ] ], xr0 + 0.42, y, zc + 0.03, M.LEATHER, col( '#b8b2a4' ), 16 );
			for ( let i = 0; i < 4; i ++ ) cyl( k, xr0 + 0.62 + i * 0.1, y, zc + ( Q() - 0.5 ) * 0.1, 0.035 + Q() * 0.015, 0.08 + Q() * 0.08, M.LEATHER, [ '#5a4a3a', '#6a2a1c', '#3a4a4a', '#7a6a4a' ][ i ], 10 );
			k.box( xr0 + 1.12, y + 0.1, zc, 0.12, 0.2, 0.08, M.LEATHER, col( '#6a1a12' ) );
			cyl( k, xr0 + 1.12, y + 0.2, zc, 0.015, 0.03, M.LEATHER, col( '#2a2622' ), 8 );
			// the radio: a dark case, a pale grille, a knob, its aerial folded down
			k.box( xr0 + 1.4, y + 0.085, zc + 0.02, 0.26, 0.17, 0.08, M.LEATHER, col( '#1e1c1a' ), { round: 0.012 } );
			k.box( xr0 + 1.35, y + 0.085, zc + 0.061, 0.13, 0.11, 0.004, M.LEATHER, col( '#6a665e' ) );
			cyl( k, xr0 + 1.48, y + 0.1, zc + 0.06, 0.016, 0.012, M.IRON, col( '#8a8680' ), 8 );
			beam( k, V( xr0 + 1.28, y + 0.175, zc ), V( xr0 + 1.52, y + 0.182, zc - 0.01 ), 0.005, 0.005, M.IRON, col( '#8a8680' ) );
			furniture.push( [ ( xr0 + xr1 ) / 2, z0 + d / 2, ( xr1 - xr0 ) / 2 + 0.02, d / 2 + 0.03 ] );

		}

		// --- the hearth in the back east corner: a platform of flags on a rubble kerb, a drystone
		// fire-back up the two walls, a ring of stones round the cold ashes and charred ends; the
		// crane - a post turning between the flags and the ceiling, an arm with a brace - and the
		// cheese kettle hanging from it by its bail, black outside, copper within
		const HX = 1.93, HZ = - 3.22, hx0 = 1.18, hz1 = - 2.5, PH = 0.15;
		{

			// (split stone, laid dry: a slab here and there paler where the smoke has not reached, the
			// rest gone black; the gaps between them dark)
			const stoneCol = () => Q() < 0.15 ? tone( '#4a453e', '#5a544a', 0.2 ) : tone( '#26231f', '#3a3631', 0.35 );
			// lay a dry-stone face from ( ax, az ) along ( ux, uz ) for len, into the room along
			// ( nx, nz ), from y0 up to y1, the stones about `deep` deep
			const drystone = ( ax, az, ux, uz, nx, nz, len, y0, y1, deep ) => {

				const yaw = Math.atan2( - uz, ux );
				for ( let y = y0; y < y1 - 0.03; ) {

					const h = Math.min( 0.08 + Q() * 0.09, y1 - y );
					for ( let s = - Q() * 0.2; s < len; ) {

						const l = 0.16 + Q() * 0.28, s0 = Math.max( 0, s ), s1 = Math.min( len, s + l );
						if ( s1 - s0 > 0.05 ) {

							const d = deep - Q() * 0.05, m = ( s0 + s1 ) / 2;
							k.box( ax + ux * m + nx * d / 2, y + h / 2, az + uz * m + nz * d / 2, s1 - s0 - 0.014, h - 0.014, d, M.LEATHER, stoneCol(), { rot: [ ( Q() - 0.5 ) * 0.05, yaw + ( Q() - 0.5 ) * 0.05, ( Q() - 0.5 ) * 0.06 ] } );

						}

						s += l;

					}

					y += h;

				}

			};

			// the platform: a kerb of stones round a dark core, flags on it
			k.box( ( hx0 + x1 ) / 2, PH / 2, ( z0 + hz1 ) / 2, x1 - hx0 - 0.02, PH, hz1 - z0 - 0.02, M.VOID, ink );
			drystone( hx0 + 0.19, hz1 - 0.19, 1, 0, 0, 1, x1 - hx0 - 0.19, 0, PH, 0.2 );
			drystone( hx0 + 0.19, z0, 0, 1, - 1, 0, hz1 - z0, 0, PH, 0.2 );
			for ( let x = hx0; x < x1 - 0.1; ) {

				const w = Math.min( 0.35 + Q() * 0.25, x1 - x );
				for ( let z = z0; z < hz1 - 0.1; ) {

					const d = Math.min( 0.3 + Q() * 0.3, hz1 - z );
					k.box( x + w / 2, PH + 0.012, z + d / 2, w - 0.02, 0.03, d - 0.02, M.LEATHER, tone( '#34302b', '#46413a', 0.3 ), { rot: [ ( Q() - 0.5 ) * 0.02, 0, ( Q() - 0.5 ) * 0.02 ] } );
					z += d;

				}

				x += w;

			}

			// the fire-back, up the back wall and the east wall, capped with slabs
			const fb = 1.38, ft = 0.26;
			k.box( ( hx0 + x1 ) / 2, PH + fb / 2, z0 + 0.05, x1 - hx0 - 0.02, fb, 0.1, M.VOID, ink );
			k.box( x1 - 0.05, PH + fb / 2, ( z0 + hz1 ) / 2, 0.1, fb, hz1 - z0 - 0.02, M.VOID, ink );
			drystone( hx0, z0, 1, 0, 0, 1, x1 - hx0, PH + 0.03, PH + fb, ft );
			drystone( x1, z0 + ft, 0, 1, - 1, 0, hz1 - z0 - ft, PH + 0.03, PH + fb, ft );
			for ( let x = hx0 - 0.03; x < x1 - 0.1; ) {

				const w = Math.min( 0.3 + Q() * 0.3, x1 - x );
				k.box( x + w / 2, PH + fb + 0.03, z0 + ft / 2 + 0.02, w - 0.02, 0.05 + Q() * 0.03, ft + 0.03 + Q() * 0.05, M.LEATHER, stoneCol(), { rot: [ ( Q() - 0.5 ) * 0.04, ( Q() - 0.5 ) * 0.1, ( Q() - 0.5 ) * 0.04 ] } );
				x += w;

			}

			for ( let z = z0 + ft + 0.02; z < hz1 - 0.05; ) {

				const w = Math.min( 0.3 + Q() * 0.3, hz1 + 0.03 - z );
				k.box( x1 - ft / 2 - 0.02, PH + fb + 0.03, z + w / 2, ft + 0.03 + Q() * 0.05, 0.05 + Q() * 0.03, w - 0.02, M.LEATHER, stoneCol(), { rot: [ ( Q() - 0.5 ) * 0.04, ( Q() - 0.5 ) * 0.1, ( Q() - 0.5 ) * 0.04 ] } );
				z += w;

			}

			block( ( hx0 + x1 ) / 2, PH + fb / 2, z0 + ft / 2, x1 - hx0, fb, ft );
			block( x1 - ft / 2, PH + fb / 2, ( z0 + hz1 ) / 2, ft, fb, hz1 - z0 );
			// the ring of stones, the ashes, the burnt ends
			for ( let i = 0; i < 9; i ++ ) {

				const a = i / 9 * Math.PI * 2 + Q() * 0.3, r = 0.34 + Q() * 0.04;
				lump( k, HX + Math.cos( a ) * r, PH + 0.015, HZ + Math.sin( a ) * r, 0.09 + Q() * 0.04, 0.12 + Q() * 0.05, 0.08 + Q() * 0.04, M.LEATHER, tone( '#1e1b18', '#322e2a', 0.3 ), i * 7 + 3, a, 8 );

			}

			lump( k, HX, PH + 0.015, HZ, 0.3, 0.06, 0.28, M.LEATHER, col( '#403c38' ), 5, 0, 12 );
			for ( let i = 0; i < 5; i ++ ) {

				const a = Q() * Math.PI * 2, l = 0.2 + Q() * 0.15;
				const p = V( HX + Math.cos( a ) * 0.1, PH + 0.06 + i * 0.012, HZ + Math.sin( a ) * 0.1 );
				beam( k, p.clone().add( V( - Math.cos( a + 1.2 ) * l / 2, 0, - Math.sin( a + 1.2 ) * l / 2 ) ), p.clone().add( V( Math.cos( a + 1.2 ) * l / 2, 0.02, Math.sin( a + 1.2 ) * l / 2 ) ), 0.045, 0.04, M.LOG, col( '#16110d' ) );

			}

			// the crane, its post at the front corner by the east fire-back, clear of the way to the
			// kettle as you look at it from the room
			const post = V( x1 - 0.34, 0, hz1 - 0.12 );
			k.pole( V( post.x, PH + 0.02, post.z ), V( post.x, CE, post.z ), 0.07, M.LOG, col( '#3a2a1c' ), 2 );
			const dir = V( HX - post.x, 0, HZ - post.z ), reach = dir.length();
			dir.normalize();
			const ay = 1.6, end = post.clone().addScaledVector( dir, reach + 0.14 );
			beam( k, V( post.x, ay, post.z ), V( end.x, ay, end.z ), 0.08, 0.11, M.LOG, col( '#3e2d1e' ) );
			beam( k, V( post.x, ay - 0.62, post.z ).addScaledVector( dir, 0.05 ), V( post.x, ay - 0.05, post.z ).addScaledVector( dir, 0.55 ), 0.06, 0.06, M.LOG, col( '#3e2d1e' ), V( dir.z, 0, - dir.x ) );
			for ( const y of [ ay, ay - 0.62 ] ) hoop( k, post.x, y, post.z, 0.078, 0.008, M.IRON, iron, V( 0, 1, 0 ), 14 );
			block( post.x, ay, post.z, 0.3, 0.12, 0.3 );
			// the kettle, and the notched hanger it hangs by
			const kb = 0.44, KR = 0.34;
			lathe( k, [ [ 0, 0 ], [ 0.13, 0.004 ], [ 0.24, 0.05 ], [ 0.31, 0.14 ], [ KR, 0.27 ], [ KR - 0.006, 0.39 ], [ KR - 0.012, 0.44 ] ], HX, kb, HZ, M.LEATHER, col( '#141210' ), 28 );
			// (the copper scoured inside, dulled; a rim of it round the black)
			lathe( k, [ [ KR - 0.012, 0.44 ], [ KR + 0.006, 0.452 ], [ KR + 0.006, 0.47 ], [ KR - 0.018, 0.47 ], [ KR - 0.02, 0.4 ], [ KR - 0.013, 0.27 ], [ 0.3, 0.145 ], [ 0.23, 0.06 ], [ 0.12, 0.018 ], [ 0, 0.014 ] ], HX, kb, HZ, M.LEATHER, col( '#8c4a26' ), 28 );
			// the bail swings in the arm's plane, square on to you as you look at it from the room
			const side = V( dir.z, 0, - dir.x );
			for ( const s of [ - 1, 1 ] ) k.box( HX + dir.x * s * ( KR + 0.01 ), kb + 0.43, HZ + dir.z * s * ( KR + 0.01 ), 0.03, 0.06, 0.03, M.IRON, ironD );
			{

				const g = new THREE.TorusGeometry( KR + 0.02, 0.009, 5, 22, Math.PI );
				g.rotateY( Math.atan2( - dir.z, dir.x ) );
				g.translate( HX, kb + 0.44, HZ );
				k.add( g, M.IRON, ironD );

			}

			beam( k, V( HX, ay - 0.05, HZ ), V( HX, kb + 0.44 + KR + 0.02, HZ ), 0.022, 0.012, M.IRON, ironD, dir );
			for ( let i = 0; i < 4; i ++ ) k.box( HX + dir.x * 0.016, ay - 0.12 - i * 0.07, HZ + dir.z * 0.016, 0.012, 0.02, 0.012, M.IRON, ironD );
			hoop( k, HX, kb + 0.44 + KR + 0.005, HZ, 0.025, 0.006, M.IRON, ironD, side, 10 );
			block( HX, kb + 0.23, HZ, KR * 1.7, 0.46, KR * 1.7 );
			// by the fire-back: a poker and a fire shovel leaning, the stirring paddle
			beam( k, V( x1 - 0.32, PH + 0.02, z0 + 0.34 ), V( x1 - 0.27, PH + 1.05, z0 + 0.27 ), 0.014, 0.014, M.IRON, iron );
			beam( k, V( x1 - 0.42, PH + 0.03, z0 + 0.33 ), V( x1 - 0.38, PH + 0.98, z0 + 0.27 ), 0.018, 0.018, M.LOG, col( '#4a3828' ) );
			k.box( x1 - 0.425, PH + 0.08, z0 + 0.335, 0.14, 0.12, 0.012, M.IRON, iron, { rot: [ - 0.07, 0, 0 ] } );
			beam( k, V( hx0 + 0.02, PH + 0.03, z0 + 0.32 ), V( hx0 + 0.12, PH + 1.25, z0 + 0.27 ), 0.03, 0.03, M.LOG, paleWood() );
			k.box( hx0 + 0.015, PH + 0.15, z0 + 0.325, 0.09, 0.2, 0.018, M.BOARD, paleWood(), { rot: [ 0, 0, 0.08 ], axis: [ 0, 1, 0 ] } );
			furniture.push( [ ( hx0 + x1 ) / 2, ( z0 + hz1 ) / 2, ( x1 - hx0 ) / 2 + 0.02, ( hz1 - z0 ) / 2 + 0.03 ] );

		}

		// --- split wood stacked along the east wall between the hearth and the stove, end grain
		// out; a hatchet leaning on it
		{

			// (each piece a split of a round: a quarter, a third or a half, closed, turned any way)
			const za = hz1 + 0.06, zb2 = - 1.38, xw = x1 - 0.21;
			for ( let y = FL + 0.06, row = 0; y < 1.0; y += 0.105, row ++ ) {

				for ( let z = za + 0.05 + ( row % 2 ) * 0.05; z < zb2 - 0.05; z += 0.1 + Q() * 0.025 ) {

					const r = 0.075 + Q() * 0.03, len = 0.36 + Q() * 0.06, arc = [ Math.PI / 2, Math.PI * 2 / 3, Math.PI ][ Math.floor( Q() * 3 ) ];
					const pts = [ new THREE.Vector2( 0, 0 ) ];
					for ( let i = 0; i <= 4; i ++ ) {

						const a = - arc / 2 + arc * i / 4;
						pts.push( new THREE.Vector2( Math.cos( a ) * r * ( 0.92 + 0.12 * Q() ), Math.sin( a ) * r ) );

					}

					const g = new THREE.ExtrudeGeometry( new THREE.Shape( pts ), { depth: len, bevelEnabled: false } );
					// (the wedge's middle at the origin, its length along x, turned about it)
					g.translate( - r * 0.45, 0, - len / 2 );
					g.rotateZ( Q() * Math.PI * 2 );
					g.rotateY( Math.PI / 2 );
					g.translate( xw + ( Q() - 0.5 ) * 0.04, y + ( Q() - 0.5 ) * 0.012, z );
					k.add( g, M.LOG, tone( '#6a5238', '#9a7e5c', 0.3 ), [ 1, 0, 0 ], [ xw, y, z ] );

				}

			}

			block( xw, 0.5, ( za + zb2 ) / 2, 0.42, 1.0, zb2 - za );
			furniture.push( [ xw, ( za + zb2 ) / 2, 0.23, ( zb2 - za ) / 2 + 0.02 ] );
			beam( k, V( xw - 0.3, FL, zb2 - 0.1 ), V( xw - 0.22, FL + 0.55, zb2 - 0.14 ), 0.03, 0.022, M.LOG, col( '#7a6040' ) );
			k.box( xw - 0.215, FL + 0.56, zb2 - 0.14, 0.03, 0.06, 0.13, M.IRON, iron, { rot: [ 0.2, 0, - 0.14 ] } );

		}

		// --- the cook stove against the east wall: an iron box on short legs, a plate with rings on
		// top, the rail along its front, the fire, oven and ash doors; its pipe up through the
		// ceiling; a black kettle and an enamel pot on it
		const SX = x1 - 0.33, SZ = - 0.72;
		{

			// (cast iron blacked with stove polish: matt, not rusty)
			const sw = 0.6, sd = 1.0, sh = 0.8, black = col( '#1d1b19' );
			for ( const [ dx, dz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) k.box( SX + dx * ( sw / 2 - 0.04 ), FL + 0.06, SZ + dz * ( sd / 2 - 0.04 ), 0.05, 0.12, 0.05, M.LEATHER, black );
			k.box( SX, FL + 0.12 + ( sh - 0.15 ) / 2, SZ, sw - 0.02, sh - 0.15, sd - 0.02, M.LEATHER, col( '#24211e' ) );
			k.box( SX - 0.005, FL + sh - 0.015, SZ, sw + 0.03, 0.03, sd + 0.03, M.LEATHER, black );
			k.box( SX - sw / 2 + 0.01, FL + sh - 0.05, SZ, 0.02, 0.05, sd + 0.01, M.BRONZE, col( '#6a665e' ) );
			for ( const dz of [ - 0.22, 0.2 ] ) {

				cyl( k, SX - 0.04, FL + sh, SZ + dz, 0.11, 0.006, M.LEATHER, col( '#191715' ), 18 );
				hoop( k, SX - 0.04, FL + sh + 0.006, SZ + dz, 0.07, 0.004, M.LEATHER, col( '#2a2724' ), V( 0, 1, 0 ), 16 );

			}

			const fx = SX - sw / 2 + 0.005;
			for ( const [ dz, y, w, h ] of [ [ - 0.24, 0.55, 0.26, 0.18 ], [ 0.17, 0.44, 0.44, 0.3 ], [ - 0.24, 0.26, 0.26, 0.09 ] ] ) {

				k.box( fx - 0.012, FL + y, SZ + dz, 0.02, h, w, M.LEATHER, col( '#2e2a26' ) );
				k.box( fx - 0.023, FL + y, SZ + dz, 0.004, h - 0.04, w - 0.04, M.LEATHER, col( '#24211e' ) );
				k.box( fx - 0.03, FL + y + h * 0.3, SZ + dz + w * 0.3, 0.02, 0.018, 0.08, M.BRONZE, col( '#8a8274' ) );

			}

			// the rail
			tube( k, [ V( fx - 0.02, FL + sh - 0.1, SZ - sd / 2 + 0.05 ), V( fx - 0.07, FL + sh - 0.1, SZ - sd / 2 + 0.08 ), V( fx - 0.07, FL + sh - 0.1, SZ + sd / 2 - 0.08 ), V( fx - 0.02, FL + sh - 0.1, SZ + sd / 2 - 0.05 ) ], 0.009, M.BRONZE, col( '#8a8478' ), 6 );
			k.box( fx - 0.07, FL + sh - 0.2, SZ - 0.1, 0.012, 0.2, 0.26, M.LEATHER, col( '#9a8e7a' ) );
			k.box( fx - 0.078, FL + sh - 0.2, SZ - 0.1, 0.004, 0.2, 0.03, M.LEATHER, col( '#6a2a22' ) );
			// the pipe, up the back and through the ceiling, its damper
			const pz = SZ + 0.34, pxx = SX + 0.1;
			cyl( k, pxx, FL + sh, pz, 0.07, CE - FL - sh + 0.06, M.IRON, col( '#1e1c1a' ), 14 );
			hoop( k, pxx, 1.3, pz, 0.072, 0.006, M.IRON, ironD, V( 0, 1, 0 ), 14 );
			beam( k, V( pxx - 0.07, 1.42, pz ), V( pxx - 0.14, 1.42, pz ), 0.01, 0.01, M.IRON, ironD );
			k.box( pxx, CE - 0.01, pz, 0.26, 0.012, 0.26, M.IRON, ironD );
			// on the plate: the kettle, the pot
			{

				const kx = SX - 0.04, kz = SZ - 0.22, y = FL + sh + 0.006;
				lathe( k, [ [ 0, 0 ], [ 0.1, 0 ], [ 0.115, 0.03 ], [ 0.115, 0.12 ], [ 0.08, 0.165 ], [ 0.045, 0.172 ], [ 0, 0.18 ] ], kx, y, kz, M.IRON, col( '#1e1b19' ), 16 );
				tube( k, [ V( kx - 0.1, y + 0.05, kz ), V( kx - 0.16, y + 0.12, kz ), V( kx - 0.19, y + 0.17, kz ) ], 0.014, M.IRON, col( '#1e1b19' ), 6 );
				const g = new THREE.TorusGeometry( 0.075, 0.006, 4, 14, Math.PI );
				g.translate( kx, y + 0.17, kz );
				k.add( g, M.IRON, ironD );
				const ox = SX - 0.04, oz = SZ + 0.2;
				lathe( k, [ [ 0, 0 ], [ 0.11, 0 ], [ 0.115, 0.13 ], [ 0.12, 0.135 ], [ 0, 0.135 ] ], ox, y, oz, M.LEATHER, col( '#2a3a5c' ), 16 );
				lathe( k, [ [ 0, 0.135 ], [ 0.118, 0.135 ], [ 0.1, 0.15 ], [ 0.02, 0.155 ], [ 0.015, 0.175 ], [ 0, 0.178 ] ], ox, y, oz, M.LEATHER, col( '#2a3a5c' ), 16 );
				for ( const s of [ - 1, 1 ] ) k.box( ox, y + 0.11, oz + s * 0.13, 0.05, 0.015, 0.03, M.LEATHER, col( '#2a3a5c' ) );

			}

			block( SX, FL + sh / 2, SZ, sw, sh, sd );
			furniture.push( [ SX, SZ, sw / 2 + 0.05, sd / 2 + 0.02 ] );

		}

		// pans, a ladle, a skimmer and a spoon on hooks along a board over the stove; a cheese harp
		// hanging over the wood
		{

			const xw = x1 - 0.012, y = 1.62;
			k.box( x1 - 0.012, y, SZ, 0.024, 0.09, 1.3, M.BOARD, oldWood(), { axis: [ 0, 0, 1 ] } );
			const facing = [ 0, 0, Math.PI / 2 ];
			for ( const [ kind, z, r ] of [ [ 'pan', - 1.22, 0.13 ], [ 'ladle', - 0.99, 0.05 ], [ 'pan', - 0.82, 0.1 ], [ 'skim', - 0.62, 0.07 ] ] ) {

				tube( k, [ V( xw - 0.012, y - 0.02, z ), V( xw - 0.05, y - 0.03, z ), V( xw - 0.05, y - 0.07, z ) ], 0.004, M.IRON, ironD, 4 );
				if ( kind === 'pan' ) {

					const hl = 0.26;
					beam( k, V( xw - 0.045, y - 0.07, z ), V( xw - 0.045, y - 0.07 - hl, z ), 0.018, 0.008, M.IRON, ironD, V( 1, 0, 0 ) );
					lathe( k, [ [ 0, 0 ], [ r - 0.01, 0 ], [ r, 0.035 ], [ r - 0.004, 0.036 ], [ r - 0.014, 0.004 ], [ 0, 0.004 ] ], xw - 0.02, y - 0.07 - hl - r, z, M.IRON, col( '#221f1c' ), 18, facing );

				} else {

					const hl = 0.3;
					beam( k, V( xw - 0.045, y - 0.07, z ), V( xw - 0.045, y - 0.07 - hl, z ), 0.014, 0.006, M.IRON, col( '#4a4642' ), V( 1, 0, 0 ) );
					if ( kind === 'ladle' ) lathe( k, [ [ 0, 0 ], [ r * 0.7, 0.004 ], [ r, 0.04 ], [ r - 0.004, 0.042 ], [ r * 0.7 - 0.004, 0.008 ], [ 0, 0.004 ] ], xw - 0.06, y - 0.07 - hl - r * 0.8, z, M.IRON, col( '#4a4642' ), 14, [ 0, 0, 1.1 ] );
					else lathe( k, [ [ 0, 0 ], [ r, 0.004 ], [ r, 0.012 ], [ 0, 0.008 ] ], xw - 0.035, y - 0.07 - hl - r, z, M.IRON, col( '#4a4642' ), 12, facing );

				}

			}

			// the cheese harp: a frame strung with wires on a long handle
			const hz = hz1 + 0.5, hy = 1.12;
			const hw = 0.012, fx = x1 - 0.03;
			beam( k, V( fx, hy, hz - 0.17 ), V( fx, hy, hz + 0.17 ), hw, 0.03, M.LOG, paleWood() );
			beam( k, V( fx, hy + 0.42, hz - 0.17 ), V( fx, hy + 0.42, hz + 0.17 ), hw, 0.03, M.LOG, paleWood() );
			for ( const s of [ - 1, 1 ] ) beam( k, V( fx, hy, hz + s * 0.17 ), V( fx, hy + 0.42, hz + s * 0.17 ), hw, 0.03, M.LOG, paleWood(), V( 0, 0, 1 ) );
			for ( let i = 1; i < 6; i ++ ) beam( k, V( fx, hy, hz - 0.17 + i * 0.057 ), V( fx, hy + 0.42, hz - 0.17 + i * 0.057 ), 0.003, 0.003, M.IRON, col( '#6a6660' ) );
			beam( k, V( fx, hy + 0.42, hz ), V( fx, 1.98, hz ), 0.03, 0.03, M.LOG, paleWood() );

		}

		// --- along the east wall toward the door: the milk bench with two wide tubs and a milking
		// pail on it, the churn, two aluminium milk cans; the one-legged milking stool hanging on a peg
		{

			const bz0 = 0.22, bz1 = 1.9, bw = 0.46, bh = 0.5, bx = x1 - bw / 2 - 0.02;
			const wood = oldWood();
			k.box( bx, bh - 0.025, ( bz0 + bz1 ) / 2, bw, 0.05, bz1 - bz0, M.BOARD, wood, { axis: [ 0, 0, 1 ] } );
			for ( const z of [ bz0 + 0.08, bz1 - 0.08 ] ) {

				k.box( bx, ( bh - 0.05 ) / 2 + FL / 2, z, bw - 0.06, bh - 0.05 - FL, 0.05, M.BOARD, wood, { axis: [ 0, 1, 0 ] } );

			}

			k.box( bx - bw / 2 + 0.06, 0.18, ( bz0 + bz1 ) / 2, 0.04, 0.06, bz1 - bz0 - 0.1, M.LOG, wood, { axis: [ 0, 0, 1 ] } );
			block( bx, bh - 0.025, ( bz0 + bz1 ) / 2, bw, 0.05, bz1 - bz0 );
			furniture.push( [ bx, ( bz0 + bz1 ) / 2, bw / 2 + 0.02, ( bz1 - bz0 ) / 2 + 0.02 ] );
			// the wide shallow tubs (Gebsen) the milk stood in for the cream to rise
			for ( const z of [ bz0 + 0.38, bz0 + 0.98 ] ) {

				const r = 0.24, h = 0.13, c = paleWood();
				lathe( k, [ [ 0, 0 ], [ r * 0.9, 0 ], [ r, h ], [ r - 0.016, h ], [ r * 0.9 - 0.016, 0.018 ], [ 0, 0.018 ] ], bx - 0.02, bh, z, M.BOARD, c, 20 );
				for ( const f of [ 0.3, 0.8 ] ) hoop( k, bx - 0.02, bh + h * f, z, r * ( 0.9 + 0.1 * f ) + 0.004, 0.005, M.BOARD, c.clone().multiplyScalar( 0.55 ), V( 0, 1, 0 ), 20 );

			}

			// the milking pail: a coopered bucket with one stave standing up as its handle
			{

				const pz = bz1 - 0.3, r = 0.13, h = 0.28, c = paleWood();
				lathe( k, [ [ 0, 0 ], [ r * 0.88, 0 ], [ r, h ], [ r - 0.014, h ], [ r * 0.88 - 0.014, 0.018 ], [ 0, 0.018 ] ], bx, bh, pz, M.BOARD, c, 16 );
				for ( const f of [ 0.2, 0.75 ] ) hoop( k, bx, bh + h * f, pz, r * ( 0.88 + 0.12 * f ) + 0.004, 0.005, M.IRON, iron, V( 0, 1, 0 ), 16 );
				k.box( bx + 0.005, bh + h + 0.07, pz - r + 0.012, 0.07, 0.2, 0.022, M.BOARD, c, { axis: [ 0, 1, 0 ] } );

			}

			// the churn: a tall coopered cask, hooped, a lid, the dasher's staff standing out of it
			{

				const cx = x1 - 0.25, cz = 2.3, r = 0.16, h = 0.86;
				lathe( k, [ [ 0, 0 ], [ r, 0 ], [ r + 0.004, 0.05 ], [ r * 0.84, h ], [ 0, h ] ], cx, FL, cz, M.BOARD, paleWood(), 18 );
				for ( const f of [ 0.08, 0.45, 0.88 ] ) hoop( k, cx, FL + h * f, cz, r * ( 1 - 0.16 * f ) + 0.006, 0.007, M.IRON, iron, V( 0, 1, 0 ), 18 );
				cyl( k, cx, FL + h, cz, r * 0.8, 0.025, M.BOARD, oldWood(), 16 );
				beam( k, V( cx, FL + h, cz ), V( cx + 0.02, FL + h + 0.48, cz - 0.02 ), 0.03, 0.03, M.LOG, paleWood() );
				block( cx, FL + h / 2, cz, 2 * r, h, 2 * r );
				furniture.push( [ cx, cz, r + 0.02, r + 0.02 ] );

			}

			// the milk cans
			for ( const [ cx, cz, lid ] of [ [ x1 - 0.23, 3.02, true ], [ x1 - 0.58, 3.5, false ] ] ) {

				const c = col( '#8a8b86' );
				lathe( k, [ [ 0, 0 ], [ 0.15, 0 ], [ 0.162, 0.02 ], [ 0.162, 0.44 ], [ 0.13, 0.52 ], [ 0.085, 0.56 ], [ 0.082, 0.64 ], [ 0.092, 0.648 ], [ 0.088, 0.656 ], [ 0.074, 0.652 ], [ 0.07, 0.6 ], [ 0, 0.6 ] ], cx, FL, cz, M.LEATHER, c, 20 );
				hoop( k, cx, FL + 0.44, cz, 0.163, 0.01, M.LEATHER, c.clone().multiplyScalar( 0.85 ), V( 0, 1, 0 ), 20 );
				for ( const s of [ - 1, 1 ] ) {

					const g = new THREE.TorusGeometry( 0.045, 0.007, 4, 10, Math.PI );
					g.rotateX( s * 0.9 );
					g.translate( cx, FL + 0.5, cz + s * 0.14 );
					k.add( g, M.LEATHER, c );

				}

				if ( lid ) lathe( k, [ [ 0, 0.63 ], [ 0.1, 0.64 ], [ 0.1, 0.66 ], [ 0.05, 0.69 ], [ 0.02, 0.71 ], [ 0, 0.715 ] ], cx, FL, cz, M.LEATHER, c.clone().multiplyScalar( 0.9 ), 16 );
				else lathe( k, [ [ 0, 0 ], [ 0.1, 0.01 ], [ 0.1, 0.03 ], [ 0.05, 0.06 ], [ 0.02, 0.08 ], [ 0, 0.085 ] ], cx - 0.2, FL, cz + 0.1, M.LEATHER, c.clone().multiplyScalar( 0.9 ), 16, [ 1.9, 0, 0.3 ] );
				block( cx, FL + 0.33, cz, 0.3, 0.66, 0.3 );

			}

			furniture.push( [ x1 - 0.42, 3.28, 0.42, 0.42 ] );
			// the milking stool on its peg: a round seat, one leg, the strap it is buckled on with
			{

				const sz = 2.78, sy = 1.3, sxx = x1 - 0.035;
				cyl( k, x1 - 0.02, sy + 0.03, sz, 0.012, 0.05, M.LOG, oldWood(), 6 );
				const g = new THREE.CylinderGeometry( 0.13, 0.13, 0.045, 14 );
				g.rotateZ( Math.PI / 2 );
				g.translate( sxx, sy - 0.1, sz );
				k.add( g, M.LOG, oldWood(), [ 1, 0, 0 ], [ sxx, sy - 0.1, sz ] );
				beam( k, V( sxx - 0.03, sy - 0.1, sz ), V( sxx - 0.1, sy - 0.42, sz + 0.06 ), 0.045, 0.045, M.LOG, oldWood() );
				tube( k, [ V( sxx - 0.03, sy - 0.02, sz - 0.1 ), V( sxx - 0.04, sy + 0.05, sz ), V( sxx - 0.03, sy - 0.02, sz + 0.1 ) ], 0.012, M.LEATHER, col( '#2a1c10' ), 4 );

			}

		}

		// the big bells for the procession down in the autumn (still here), each on a broad
		// embroidered strap looped over a peg over the milk bench
		// (hammered sheet-iron Treicheln, tall and flattened, blackened, a band of brass at the mouth)
		for ( const [ z, r, h, band ] of [ [ 0.5, 0.15, 0.3, '#7a1c16' ], [ 1.1, 0.19, 0.38, '#2a4a2c' ], [ 1.7, 0.16, 0.32, '#7a1c16' ] ] ) {

			const py = 1.94, top = py - 0.3 - r * 0.5, bx = x1 - r * 0.62 - 0.012;
			beam( k, V( x1 - 0.012, py, z ), V( x1 - 0.1, py + 0.03, z ), 0.03, 0.03, M.LOG, oldWood() );
			for ( const s of [ - 1, 1 ] ) {

				const a = V( x1 - 0.07, py + 0.02, z + s * 0.02 ), b = V( bx, top + 0.02, z + s * ( r * 0.55 ) );
				beam( k, a, b, 0.07, 0.008, M.LEATHER, col( '#241810' ), V( 1, 0, 0 ) );
				beam( k, a.clone().add( V( - 0.006, 0, 0 ) ), b.clone().add( V( - 0.006, 0, 0 ) ), 0.03, 0.004, M.LEATHER, col( band ), V( 1, 0, 0 ) );

			}

			k.box( bx, top + 0.01, z, 0.05, 0.04, r * 1.3, M.LOG, paleWood() );
			const g = new THREE.LatheGeometry( [ [ 0, 0.02 ], [ r * 0.84, 0.02 ], [ r * 0.88, 0 ], [ r * 0.98, h * 0.2 ], [ r * 1.03, h * 0.5 ], [ r * 0.94, h * 0.8 ], [ r * 0.62, h * 0.96 ], [ 0, h ] ].map( ( [ a, b ] ) => new THREE.Vector2( a, b ) ), 18 );
			g.scale( 0.62, 1, 1 );
			g.translate( bx, top - h, z );
			k.add( g, M.LEATHER, col( '#2a241c' ), [ 0, 1, 0 ], [ bx, top - h / 2, z ] );
			const rim = new THREE.TorusGeometry( r * 0.9, 0.012, 4, 20 );
			rim.rotateX( Math.PI / 2 );
			rim.scale( 0.62, 1, 1 );
			rim.translate( bx, top - h + 0.03, z );
			k.add( rim, M.LEATHER, col( '#7a6034' ) );

		}

		// the hay rake leaning on the east wall in the corner by the door, its teeth to the room
		{

			const a = V( x1 - 0.42, FL, 3.74 ), b = V( x1 - 0.07, 1.86, 3.72 );
			beam( k, a, b, 0.03, 0.03, M.LOG, paleWood() );
			const hd = V( b.x - 0.02, b.y - 0.03, b.z );
			beam( k, hd.clone().add( V( 0, 0, - 0.27 ) ), hd.clone().add( V( 0, 0, 0.27 ) ), 0.035, 0.03, M.LOG, paleWood() );
			for ( let i = 0; i < 11; i ++ ) {

				const p = hd.clone().add( V( - 0.015, - 0.01, - 0.24 + i * 0.048 ) );
				beam( k, p, p.clone().add( V( - 0.09, - 0.03, 0 ) ), 0.01, 0.01, M.LOG, paleWood() );

			}

		}

		// --- by the door: the washstand under the front window, an enamel basin and jug on it, a
		// pail under it; a little mirror on the wall, a towel on a nail; the fire extinguisher and a
		// printed notice between the door and the window
		{

			const wx = 0.97, wz = z1 - 0.21, wh = 0.8, wood = oldWood();
			k.box( wx, wh - 0.015, wz, 0.56, 0.03, 0.38, M.BOARD, wood, { axis: [ 1, 0, 0 ] } );
			for ( const [ dx, dz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) k.box( wx + dx * 0.24, wh / 2, wz + dz * 0.15, 0.04, wh - 0.03, 0.04, M.LOG, wood, { axis: [ 0, 1, 0 ] } );
			k.box( wx, 0.22, wz, 0.5, 0.025, 0.32, M.BOARD, wood, { axis: [ 1, 0, 0 ] } );
			lathe( k, [ [ 0, 0 ], [ 0.08, 0 ], [ 0.17, 0.09 ], [ 0.18, 0.1 ], [ 0.172, 0.1 ], [ 0.162, 0.09 ], [ 0.075, 0.01 ], [ 0, 0.01 ] ], wx - 0.06, wh, wz, M.LEATHER, col( '#bcb8ac' ), 20 );
			hoop( k, wx - 0.06, wh + 0.1, wz, 0.177, 0.004, M.LEATHER, col( '#1f2a44' ), V( 0, 1, 0 ), 22 );
			lathe( k, [ [ 0, 0 ], [ 0.06, 0 ], [ 0.07, 0.08 ], [ 0.05, 0.17 ], [ 0.045, 0.22 ], [ 0.055, 0.24 ], [ 0.045, 0.24 ], [ 0, 0.24 ] ], wx + 0.2, wh, wz + 0.03, M.LEATHER, col( '#bcb8ac' ), 16 );
			lathe( k, [ [ 0, 0 ], [ 0.12, 0 ], [ 0.14, 0.24 ], [ 0.13, 0.24 ], [ 0.11, 0.012 ], [ 0, 0.012 ] ], wx, 0.235, wz, M.IRON, col( '#6e6a62' ), 16 );
			furniture.push( [ wx, wz, 0.3, 0.21 ] );
			block( wx, wh - 0.015, wz, 0.56, 0.03, 0.38 );
			// the mirror
			k.box( 1.47, 1.36, z1 - 0.01, 0.2, 0.26, 0.018, M.LOG, col( '#3a2a1c' ), { axis: [ 1, 0, 0 ] } );
			k.box( 1.47, 1.36, z1 - 0.02, 0.16, 0.22, 0.004, M.IRON, col( '#2c3034' ) );
			// the towel
			k.box( 1.74, 1.12, z1 - 0.02, 0.2, 0.5, 0.012, M.LEATHER, col( '#a49a86' ), { rot: [ 0.03, 0, 0.02 ] } );
			k.box( 1.74, 0.92, z1 - 0.027, 0.2, 0.04, 0.004, M.LEATHER, col( '#6a2a22' ), { rot: [ 0.03, 0, 0.02 ] } );
			// the fire extinguisher on its bracket
			const ex = 0.1, ey = 0.82, ez = z1 - 0.1;
			lathe( k, [ [ 0, 0 ], [ 0.075, 0 ], [ 0.078, 0.02 ], [ 0.078, 0.4 ], [ 0.06, 0.44 ], [ 0.02, 0.46 ], [ 0, 0.46 ] ], ex, ey, ez, M.LEATHER, col( '#8a1810' ), 16 );
			k.box( ex, ey + 0.2, ez - 0.075, 0.08, 0.12, 0.004, M.LEATHER, col( '#c8c2b0' ) );
			cyl( k, ex, ey + 0.46, ez, 0.018, 0.05, M.IRON, col( '#2a2826' ), 8 );
			k.box( ex + 0.04, ey + 0.52, ez, 0.1, 0.012, 0.03, M.IRON, col( '#2a2826' ) );
			tube( k, [ V( ex - 0.02, ey + 0.5, ez ), V( ex - 0.09, ey + 0.45, ez ), V( ex - 0.09, ey + 0.2, ez - 0.02 ), V( ex - 0.07, ey + 0.14, ez - 0.03 ) ], 0.009, M.LEATHER, col( '#141414' ), 5 );
			k.box( ex, ey + 0.3, z1 - 0.015, 0.05, 0.1, 0.03, M.IRON, iron );
			// the notice: a printed sheet pinned to the logs
			k.box( 0.44, 1.45, z1 - 0.004, 0.21, 0.3, 0.004, M.LEATHER, col( '#bab4a2' ) );
			k.box( 0.44, 1.575, z1 - 0.007, 0.16, 0.025, 0.003, M.LEATHER, col( '#7a1c16' ) );
			for ( let i = 0; i < 7; i ++ ) k.box( 0.44 - ( i === 6 ? 0.04 : 0 ), 1.53 - i * 0.03, z1 - 0.007, i === 6 ? 0.08 : 0.16, 0.008, 0.003, M.LEATHER, col( '#5a564e' ) );

		}

		// --- the pegs by the door (west of it): his coat, his hat, a coil of rope, a leather bag;
		// a pail and a birch broom in the corner behind the door
		{

			const py = 1.66, pz = z1 - 0.012, wood = oldWood();
			k.box( - 2.1, py, pz, 1.3, 0.1, 0.024, M.BOARD, wood, { axis: [ 1, 0, 0 ] } );
			const pegs = [ - 2.55, - 2.13, - 1.86, - 1.58 ];
			for ( const x of pegs ) beam( k, V( x, py, pz - 0.01 ), V( x, py + 0.03, pz - 0.12 ), 0.024, 0.024, M.LOG, wood );
			// the coat: hung by its loop, the shoulders drawn in to the peg, the body falling in folds
			{

				const cx = pegs[ 0 ], cy = py - 0.47, cz = z1 - 0.1;
				const g = new THREE.BoxGeometry( 0.52, 0.86, 0.14, 5, 9, 2 );
				const p = g.getAttribute( 'position' );
				for ( let i = 0; i < p.count; i ++ ) {

					let x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
					const tt = ( y + 0.43 ) / 0.86;
					x *= tt > 0.8 ? 1 - ( tt - 0.8 ) / 0.2 * 0.62 : 1 + ( 0.8 - tt ) * 0.1;
					z *= 0.55 + 0.45 * Math.cos( x * 3.2 );
					z += 0.012 * Math.sin( x * 38 + 1 ) * ( 1 - tt ) + ( tt > 0.8 ? ( tt - 0.8 ) * 0.25 : 0 );
					y += 0.02 * Math.sin( x * 9 ) * ( 1 - tt );
					p.setXYZ( i, x, y, z );

				}

				g.computeVertexNormals();
				g.translate( cx, cy, cz );
				const loden = col( '#3a3e30' );
				k.add( g, M.LEATHER, loden, [ 0, 1, 0 ], [ cx, cy, cz ] );
				for ( const s of [ - 1, 1 ] ) k.box( cx + s * 0.21, cy + 0.04, cz - 0.07, 0.12, 0.58, 0.1, M.LEATHER, loden.clone().multiplyScalar( 0.9 ), { rot: [ 0.05, 0, s * 0.07 ], round: 0.04 } );
				k.box( cx, cy + 0.34, cz - 0.02, 0.2, 0.08, 0.13, M.LEATHER, loden.clone().multiplyScalar( 0.8 ), { round: 0.03 } );

			}

			// the hat: a felt hat hung by its brim, a cord round the crown
			{

				const hx = pegs[ 1 ], hy = py - 0.12, hz = z1 - 0.07;
				const brim = new THREE.CylinderGeometry( 0.16, 0.165, 0.014, 20 );
				brim.rotateX( Math.PI / 2 - 0.15 );
				brim.translate( hx, hy, hz );
				k.add( brim, M.LEATHER, col( '#2c2e26' ) );
				const crown = new THREE.CylinderGeometry( 0.085, 0.095, 0.11, 16 );
				crown.rotateX( Math.PI / 2 - 0.15 );
				crown.translate( hx, hy + 0.01, hz - 0.06 );
				k.add( crown, M.LEATHER, col( '#2c2e26' ) );
				hoop( k, hx, hy + 0.005, hz - 0.03, 0.096, 0.009, M.LEATHER, col( '#4a2a1a' ), V( 0, Math.sin( 0.15 ), - Math.cos( 0.15 ) ), 16 );

			}

			// the rope, coiled and hung
			for ( let i = 0; i < 3; i ++ ) hoop( k, pegs[ 2 ] + 0.01 * i, py - 0.17 - 0.012 * i, z1 - 0.055 - i * 0.012, 0.13 - i * 0.008, 0.013, M.ROPE, col( '#7a6a50' ), V( 0.05 * i, 0.15, - 1 ), 26 );
			// the bag, on a strap
			k.box( pegs[ 3 ] + 0.03, py - 0.42, z1 - 0.06, 0.26, 0.24, 0.09, M.LEATHER, col( '#3a2618' ), { round: 0.03 } );
			k.box( pegs[ 3 ] + 0.03, py - 0.33, z1 - 0.11, 0.26, 0.1, 0.02, M.LEATHER, col( '#2e1e12' ), { rot: [ 0.1, 0, 0 ] } );
			tube( k, [ V( pegs[ 3 ] - 0.1, py - 0.32, z1 - 0.06 ), V( pegs[ 3 ], py + 0.02, z1 - 0.1 ), V( pegs[ 3 ] + 0.16, py - 0.32, z1 - 0.06 ) ], 0.008, M.LEATHER, col( '#2a1c10' ), 4 );
			// the pail
			const bx = - 2.45, bz = z1 - 0.3;
			lathe( k, [ [ 0, 0 ], [ 0.12, 0 ], [ 0.145, 0.27 ], [ 0.135, 0.27 ], [ 0.112, 0.012 ], [ 0, 0.012 ] ], bx, FL, bz, M.IRON, col( '#6a665e' ), 18 );
			hoop( k, bx, FL + 0.27, bz, 0.145, 0.005, M.IRON, col( '#5a564e' ), V( 0, 1, 0 ), 18 );
			{

				const g = new THREE.TorusGeometry( 0.145, 0.004, 4, 14, Math.PI );
				g.rotateY( 0.5 );
				g.rotateZ( - 1.3 );
				g.translate( bx, FL + 0.27, bz );
				k.add( g, M.IRON, iron );

			}

			furniture.push( [ bx, bz, 0.16, 0.16 ] );
			// the broom: a staff, a bundle of birch twigs bound on
			{

				const a = V( - 1.66, FL + 0.03, z1 - 0.25 ), b = V( - 1.72, 1.5, z1 - 0.06 );
				beam( k, a.clone().lerp( b, 0.2 ), b, 0.03, 0.03, M.LOG, paleWood() );
				const g = new THREE.ConeGeometry( 0.12, 0.5, 10, 2, false );
				const p = g.getAttribute( 'position' );
				for ( let i = 0; i < p.count; i ++ ) p.setX( i, p.getX( i ) * ( 1 + 0.2 * Math.sin( i * 1.7 ) ) );
				g.computeVertexNormals();
				g.applyQuaternion( new THREE.Quaternion().setFromUnitVectors( V( 0, 1, 0 ), b.clone().sub( a ).normalize() ) );
				const m = a.clone().lerp( b, 0.16 );
				g.translate( m.x, m.y, m.z );
				k.add( g, M.ROPE, col( '#4a3a26' ), b.clone().sub( a ).normalize().toArray(), m.toArray() );

			}

		}

		// --- the bunk under the west window: a box bed, the straw mattress in its ticking, a grey
		// wool blanket with red stripes thrown back, a red one folded at the foot, the pillow; his
		// boots stood by it; a shelf over it with a few books, an alarm clock, a candle
		const kz0 = 1.12, kz1 = 3.22, kw = 0.9, kx = x0 + kw / 2;
		{

			const wood = tone( '#4e3a28', '#5c4630', 0.1 ), w = () => wood.clone().multiplyScalar( 0.9 + 0.2 * Q() );
			const kzc = ( kz0 + kz1 ) / 2, rx = x0 + kw - 0.03;
			k.box( rx, 0.33, kzc, 0.04, 0.26, kz1 - kz0 - 0.1, M.BOARD, w(), { axis: [ 0, 0, 1 ] } );
			for ( const [ z, h ] of [ [ kz0 + 0.025, 0.86 ], [ kz1 - 0.025, 0.62 ] ] ) {

				k.box( kx, h / 2, z, kw - 0.1, h - 0.06, 0.03, M.BOARD, w(), { axis: [ 1, 0, 0 ] } );
				k.box( rx, h / 2, z, 0.07, h, 0.07, M.LOG, w(), { axis: [ 0, 1, 0 ] } );

			}

			k.box( kx, 0.39, kzc, kw - 0.1, 0.03, kz1 - kz0 - 0.08, M.BOARD, w(), { axis: [ 0, 0, 1 ] } );
			// the mattress: a straw sack, lumpy
			{

				const g = new THREE.BoxGeometry( kw - 0.12, 0.15, kz1 - kz0 - 0.1, 4, 1, 10 );
				const p = g.getAttribute( 'position' );
				for ( let i = 0; i < p.count; i ++ ) {

					const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
					const edge = Math.min( 1, ( ( kw - 0.12 ) / 2 - Math.abs( x ) ) / 0.12 );
					p.setY( i, y > 0 ? y * ( 0.4 + 0.6 * edge ) + 0.012 * Math.sin( z * 7 + x * 5 ) : y );

				}

				g.computeVertexNormals();
				g.translate( kx - 0.01, 0.48, kzc );
				k.add( g, M.LEATHER, col( '#7e6e50' ), [ 0, 0, 1 ], [ kx, 0.48, kzc ] );

			}

			// the grey blanket, thrown back in a roll, hanging over the side
			const bz0 = kz0 + 0.62, top = 0.56;
			k.box( kx + 0.02, top, ( bz0 + kz1 - 0.05 ) / 2, kw - 0.06, 0.04, kz1 - 0.05 - bz0, M.LEATHER, col( '#58544c' ), { round: 0.018 } );
			{

				const g = new THREE.CylinderGeometry( 0.065, 0.07, kw - 0.04, 12 );
				const p = g.getAttribute( 'position' );
				for ( let i = 0; i < p.count; i ++ ) p.setX( i, p.getX( i ) * ( 1 + 0.25 * Math.sin( p.getY( i ) * 11 ) ) );
				g.computeVertexNormals();
				g.rotateZ( Math.PI / 2 );
				g.translate( kx + 0.02, top + 0.04, bz0 );
				k.add( g, M.LEATHER, col( '#5c584f' ) );

			}

			k.box( rx + 0.045, top - 0.14, ( bz0 + kz1 - 0.08 ) / 2, 0.03, 0.3, kz1 - 0.12 - bz0, M.LEATHER, col( '#555149' ), { rot: [ 0, 0, 0.08 ], round: 0.012 } );
			for ( const z of [ kz1 - 0.3, kz1 - 0.38 ] ) {

				k.box( kx + 0.02, top + 0.021, z, kw - 0.08, 0.004, 0.035, M.LEATHER, col( '#6a1a14' ) );
				k.box( rx + 0.064, top - 0.14, z, 0.004, 0.28, 0.035, M.LEATHER, col( '#6a1a14' ), { rot: [ 0, 0, 0.08 ] } );

			}

			// the red blanket, folded; the pillow
			k.box( kx - 0.1, top + 0.07, kz1 - 0.3, 0.52, 0.1, 0.36, M.LEATHER, col( '#5e1a14' ), { rot: [ 0, 0.06, 0 ], round: 0.03 } );
			lump( k, kx - 0.02, 0.53, kz0 + 0.3, 0.3, 0.11, 0.2, M.LEATHER, col( '#9c9482' ), 4, 0.1, 12 );
			block( kx, 0.3, kzc, kw, 0.6, kz1 - kz0 );
			furniture.push( [ kx, kzc, kw / 2 + 0.02, ( kz1 - kz0 ) / 2 + 0.02 ] );
			// the boots, standing
			for ( const [ bx, bz, yaw ] of [ [ x0 + kw + 0.14, kz1 + 0.12, 0.2 ], [ x0 + kw + 0.3, kz1 + 0.15, 0.05 ] ] ) {

				const c = col( '#191817' );
				cyl( k, bx, FL, bz, 0.058, 0.36, M.LEATHER, c, 12, 0.068 );
				k.box( bx + Math.sin( yaw ) * 0.07, FL + 0.045, bz - Math.cos( yaw ) * 0.07, 0.1, 0.09, 0.26, M.LEATHER, c, { rot: [ 0, yaw, 0 ], round: 0.035 } );

			}

			// the shelf over the bunk
			const sy = 1.5, sz0 = 1.9, sz1 = 2.75;
			k.box( x0 + 0.11, sy, ( sz0 + sz1 ) / 2, 0.22, 0.025, sz1 - sz0, M.BOARD, w(), { axis: [ 0, 0, 1 ] } );
			for ( const z of [ sz0 + 0.08, sz1 - 0.08 ] ) k.box( x0 + 0.06, sy - 0.08, z, 0.12, 0.14, 0.025, M.BOARD, w(), { axis: [ 0, 1, 0 ] } );
			let z = sz0 + 0.05;
			for ( const [ h, d, c ] of [ [ 0.2, 0.035, '#3a2a22' ], [ 0.18, 0.03, '#2a3440' ], [ 0.21, 0.045, '#4a3a24' ], [ 0.16, 0.025, '#5a2a20' ] ] ) {

				k.box( x0 + 0.1, sy + 0.012 + h / 2, z + d / 2, 0.14, h, d, M.LEATHER, col( c ) );
				z += d + 0.004;

			}

			k.box( x0 + 0.1, sy + 0.03, z + 0.1, 0.15, 0.035, 0.12, M.LEATHER, col( '#343028' ), { rot: [ 0, 0.3, 0 ] } );
			// the alarm clock: a round case on little feet, two bells on top
			{

				const cz = z + 0.33, cy = sy + 0.075;
				const g = new THREE.CylinderGeometry( 0.055, 0.055, 0.035, 16 );
				g.rotateZ( Math.PI / 2 );
				g.translate( x0 + 0.12, cy, cz );
				k.add( g, M.IRON, col( '#6a1c16' ) );
				const f = new THREE.CircleGeometry( 0.045, 16 );
				f.rotateY( Math.PI / 2 );
				f.translate( x0 + 0.139, cy, cz );
				k.add( f, M.LEATHER, col( '#c4bca8' ) );
				for ( const s of [ - 1, 1 ] ) {

					const b = new THREE.SphereGeometry( 0.026, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2 );
					b.translate( x0 + 0.12, cy + 0.05, cz + s * 0.035 );
					k.add( b, M.BRONZE, col( '#6a5a3a' ) );

				}

				for ( const s of [ - 1, 1 ] ) k.box( x0 + 0.12, sy + 0.02, cz + s * 0.035, 0.02, 0.015, 0.01, M.IRON, iron );

			}

			// the candle in its holder
			cyl( k, x0 + 0.1, sy + 0.012, sz1 - 0.12, 0.05, 0.01, M.IRON, col( '#4a4640' ), 12 );
			cyl( k, x0 + 0.1, sy + 0.022, sz1 - 0.12, 0.013, 0.09, M.LEATHER, col( '#c8bea4' ), 8 );

		}

		// the rag rug beside the bunk
		{

			const rx = x0 + kw + 0.4, cols = [ '#4a3a30', '#5a2a22', '#3a4038', '#6a5a44', '#4a3a30', '#3a3440', '#5a2a22' ];
			let z = kz0 + 0.15;
			for ( let i = 0; i < 14; i ++ ) {

				const d = 0.1 + Q() * 0.03;
				k.box( rx, FL + 0.004, z + d / 2, 0.56, 0.008, d - 0.004, M.LEATHER, tone( cols[ i % cols.length ], cols[ ( i + 3 ) % cols.length ], 0.2 ), { rot: [ 0, ( Q() - 0.5 ) * 0.02, 0 ] } );
				z += d;

			}

		}

		// --- the west window: a sill inside, a curtain drawn half across on a wire, a jar and a
		// candle end on the sill
		{

			const [ wa, wb, wy0, wy1 ] = WIN_S, x = x0;
			k.box( x + 0.07, wy0 - 0.025, ( wa + wb ) / 2, 0.14, 0.03, wb - wa + 0.2, M.BOARD, oldWood(), { axis: [ 0, 0, 1 ] } );
			tube( k, [ V( x + 0.03, wy1 + 0.08, wa - 0.18 ), V( x + 0.03, wy1 + 0.07, ( wa + wb ) / 2 ), V( x + 0.03, wy1 + 0.08, wb + 0.18 ) ], 0.002, M.IRON, iron, 3 );
			for ( const [ za, zb2 ] of [ [ wa - 0.16, wa + 0.12 ], [ wb - 0.02, wb + 0.16 ] ] ) {

				const g = new THREE.BoxGeometry( 0.01, wy1 - wy0 + 0.06, zb2 - za, 1, 1, 8 );
				const p = g.getAttribute( 'position' );
				for ( let i = 0; i < p.count; i ++ ) p.setX( i, p.getX( i ) + 0.012 * Math.sin( p.getZ( i ) * 70 ) );
				g.computeVertexNormals();
				g.translate( x + 0.045, ( wy0 + wy1 ) / 2 + 0.05, ( za + zb2 ) / 2 );
				k.add( g, M.LEATHER, col( '#6a3a2e' ) );

			}

			cyl( k, x + 0.08, wy0, ( wa + wb ) / 2 + 0.05, 0.03, 0.09, M.LEATHER, col( '#3a4034' ), 10 );
			cyl( k, x + 0.08, wy0, ( wa + wb ) / 2 - 0.1, 0.012, 0.05, M.LEATHER, col( '#c8bea4' ), 8 );

		}

		// the front window: a sill inside
		k.box( ( WIN_F[ 0 ] + WIN_F[ 1 ] ) / 2, WIN_F[ 2 ] - 0.025, z1 - 0.06, WIN_F[ 1 ] - WIN_F[ 0 ] + 0.2, 0.03, 0.12, M.BOARD, oldWood(), { axis: [ 1, 0, 0 ] } );

		// --- the chest against the west wall: painted once, the paint gone dark; iron bands, a hasp;
		// a folded blanket and his rucksack on it; a sack of meal against it
		{

			const cz0 = - 1.78, cz1 = - 0.78, cw = 0.5, ch = 0.55, cx = x0 + cw / 2 + 0.01;
			const paint = col( '#27302b' );
			k.box( cx, ch / 2, ( cz0 + cz1 ) / 2, cw, ch - 0.04, cz1 - cz0, M.BOARD, paint, { axis: [ 0, 0, 1 ] } );
			k.box( cx, ch - 0.01, ( cz0 + cz1 ) / 2, cw + 0.03, 0.04, cz1 - cz0 + 0.03, M.BOARD, paint.clone().multiplyScalar( 1.1 ), { axis: [ 0, 0, 1 ] } );
			for ( const z of [ cz0 + 0.12, cz1 - 0.12 ] ) k.box( cx + cw / 2 + 0.003, ch / 2, z, 0.006, ch - 0.02, 0.04, M.LEATHER, col( '#1c1a18' ) );
			k.box( cx + cw / 2 + 0.018, ch - 0.07, ( cz0 + cz1 ) / 2, 0.012, 0.1, 0.05, M.LEATHER, col( '#1c1a18' ) );
			for ( const [ dx, dz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) k.box( cx + dx * ( cw / 2 - 0.05 ), 0.03, ( cz0 + cz1 ) / 2 + dz * ( ( cz1 - cz0 ) / 2 - 0.05 ), 0.08, 0.06, 0.08, M.BOARD, paint.clone().multiplyScalar( 0.7 ) );
			// the blanket, the rucksack leaning on the wall
			k.box( cx, ch + 0.05, cz0 + 0.28, cw - 0.06, 0.07, 0.45, M.LEATHER, col( '#4c4a44' ), { rot: [ 0, 0.04, 0 ], round: 0.025 } );
			lump( k, x0 + 0.2, ch + 0.01, cz1 - 0.25, 0.17, 0.4, 0.22, M.LEATHER, col( '#4a1a16' ), 6, 0.1, 12 );
			k.box( x0 + 0.33, ch + 0.28, cz1 - 0.25, 0.08, 0.2, 0.3, M.LEATHER, col( '#3a1410' ), { rot: [ 0, 0, 0.25 ], round: 0.03 } );
			for ( const s of [ - 1, 1 ] ) k.box( x0 + 0.36, ch + 0.2, cz1 - 0.25 + s * 0.09, 0.02, 0.3, 0.035, M.LEATHER, col( '#222222' ), { rot: [ 0, 0, 0.15 ] } );
			block( cx, ch / 2, ( cz0 + cz1 ) / 2, cw, ch, cz1 - cz0 );
			furniture.push( [ cx, ( cz0 + cz1 ) / 2, cw / 2 + 0.03, ( cz1 - cz0 ) / 2 + 0.02 ] );
			// the sack of meal, slumped, its neck tied
			lump( k, x0 + 0.26, FL, - 0.42, 0.2, 0.42, 0.18, M.LEATHER, col( '#7a6c50' ), 8, 0.4, 12 );
			lump( k, x0 + 0.26, FL + 0.4, - 0.42, 0.06, 0.08, 0.05, M.LEATHER, col( '#6e6048' ), 9, 0, 8 );
			furniture.push( [ x0 + 0.26, - 0.42, 0.22, 0.2 ] );

		}

		// --- from the ceiling: a pole on cords over the stove with cheese cloths drying on it; a bunch
		// of herbs hung from a joist
		{

			const px = 2.3, py = CE - 0.21, za = - 1.62, zb2 = 0.1;
			beam( k, V( px, py, za ), V( px, py, zb2 ), 0.035, 0.035, M.LOG, paleWood() );
			for ( const z of [ za + 0.3, zb2 - 0.3 ] ) beam( k, V( px, py, z ), V( px, CE, z ), 0.006, 0.006, M.ROPE, col( '#6a5a44' ) );
			for ( const [ z, w, h ] of [ [ - 1.35, 0.42, 0.34 ], [ - 0.85, 0.4, 0.28 ], [ - 0.35, 0.45, 0.38 ] ] ) {

				for ( const s of [ - 1, 1 ] ) {

					// (sagging between the corners, the hem uneven, hanging a little out from the pole)
					const g = new THREE.BoxGeometry( 0.006, h, w, 1, 4, 6 );
					const p = g.getAttribute( 'position' );
					for ( let i = 0; i < p.count; i ++ ) {

						const v = 0.5 - p.getY( i ) / h, u = p.getZ( i ) / w * 2;
						p.setX( i, p.getX( i ) + s * 0.03 * v + 0.012 * Math.sin( p.getZ( i ) * 22 + s ) * v );
						if ( p.getY( i ) < 0 ) p.setY( i, p.getY( i ) - 0.03 * ( 1 - u * u ) + 0.02 * Math.sin( u * 5 + z * 9 ) );

					}

					g.computeVertexNormals();
					g.translate( px + s * 0.022, py - h / 2 + 0.01, z );
					k.add( g, M.LEATHER, tone( '#6a6456', '#7a7464', 0.15 ) );

				}

			}

			const hx = - 2.3, hz = 1.05 - 0.085;
			beam( k, V( hx, CE - 0.15, hz ), V( hx, CE - 0.3, hz ), 0.005, 0.005, M.ROPE, col( '#6a5a44' ) );
			const g = new THREE.ConeGeometry( 0.09, 0.34, 9, 3 );
			const p = g.getAttribute( 'position' );
			for ( let i = 0; i < p.count; i ++ ) p.setX( i, p.getX( i ) * ( 1 + 0.3 * Math.sin( i * 2.3 ) ) );
			g.computeVertexNormals();
			g.translate( hx, CE - 0.45, hz );
			k.add( g, M.LEATHER, col( '#4e4a2c' ) );

		}

		// where things are, for the collision and the story
		HUT.room = { x0, x1, z0, z1 };
		HUT.furniture = furniture;
		HUT.lamp = new THREE.Vector3( lampAt.x, TH + 0.13, lampAt.z );
		HUT.key = new THREE.Vector3( keyAt.x, TH + 0.012, keyAt.z );
		HUT.pitch = Math.tan( PITCH );

		// the storm lantern (a Feuerhand, its red gone rusty): the fount, the burner, the glass
		// globe glowing brightest round the flame, the guard wires, the air tubes up the sides to
		// the top and its cap, the bail fallen to one side
		{

			const lk = new Kit( ground ), b = V( lampAt.x, TH + 0.001, lampAt.z ), red = col( '#6a2216' ), dark = col( '#2e2a26' );
			lathe( lk, [ [ 0, 0 ], [ 0.07, 0 ], [ 0.079, 0.008 ], [ 0.082, 0.03 ], [ 0.074, 0.05 ], [ 0.05, 0.062 ], [ 0.03, 0.066 ], [ 0, 0.066 ] ], b.x, b.y, b.z, M.IRON, red, 20 );
			cyl( lk, b.x + 0.055, b.y + 0.045, b.z + 0.02, 0.011, 0.02, M.IRON, dark, 8 );
			cyl( lk, b.x, b.y + 0.062, b.z, 0.03, 0.022, M.BRONZE, col( '#7a5a2a' ), 12 );
			const kn = new THREE.CylinderGeometry( 0.009, 0.009, 0.05, 8 );
			kn.rotateX( Math.PI / 2 );
			kn.translate( b.x, b.y + 0.075, b.z + 0.035 );
			lk.add( kn, M.BRONZE, col( '#7a5a2a' ) );
			lathe( lk, [ [ 0.028, 0.08 ], [ 0.045, 0.095 ], [ 0.056, 0.113 ] ], b.x, b.y, b.z, M.GLOW, col( '#2c1607' ), 18 );
			lathe( lk, [ [ 0.056, 0.113 ], [ 0.06, 0.135 ], [ 0.057, 0.157 ] ], b.x, b.y, b.z, M.GLOW, col( '#4e2c0e' ), 18 );
			lathe( lk, [ [ 0.057, 0.157 ], [ 0.048, 0.178 ], [ 0.03, 0.196 ] ], b.x, b.y, b.z, M.GLOW, col( '#241206' ), 18 );
			for ( let i = 0; i < 4; i ++ ) {

				const a = i / 4 * Math.PI * 2 + Math.PI / 4;
				tube( lk, [ 0.068, 0.078, 0.081, 0.076, 0.062 ].map( ( r, j ) => V( b.x + Math.cos( a ) * r, b.y + 0.07 + j * 0.032, b.z + Math.sin( a ) * r ) ), 0.0022, M.IRON, dark, 4 );

			}

			for ( const s of [ - 1, 1 ] ) tube( lk, [ V( b.x + s * 0.08, b.y + 0.035, b.z ), V( b.x + s * 0.086, b.y + 0.07, b.z ), V( b.x + s * 0.082, b.y + 0.18, b.z ), V( b.x + s * 0.064, b.y + 0.21, b.z ) ], 0.0065, M.IRON, red, 6 );
			lathe( lk, [ [ 0, 0.196 ], [ 0.062, 0.2 ], [ 0.066, 0.214 ], [ 0.046, 0.234 ], [ 0.024, 0.26 ], [ 0.027, 0.267 ], [ 0, 0.27 ] ], b.x, b.y, b.z, M.IRON, red, 18 );
			const bail = new THREE.TorusGeometry( 0.08, 0.0028, 4, 16, Math.PI );
			bail.rotateX( 1.15 );
			bail.translate( b.x, b.y + 0.212, b.z );
			lk.add( bail, M.IRON, dark );
			parts.lamp = lk.build();

		}

		// the key: a big old iron key lying on the boards by the lantern - the bow, a collar, the
		// shank, the bit with its wards
		{

			const kk = new Kit( ground );
			ring( kk, V( - 0.062, 0.0065, 0 ), V( 0, 1, 0 ), 0.024, 0.0065 );
			const collar = new THREE.CylinderGeometry( 0.0095, 0.0095, 0.016, 10 );
			collar.rotateZ( Math.PI / 2 );
			collar.translate( - 0.033, 0.0095, 0 );
			kk.add( collar, M.IRON, col( '#3c3834' ) );
			const shank = new THREE.CylinderGeometry( 0.0065, 0.0065, 0.115, 8 );
			shank.rotateZ( Math.PI / 2 );
			shank.translate( 0.03, 0.0065, 0 );
			kk.add( shank, M.IRON, col( '#3c3834' ) );
			kk.box( 0.068, 0.0065, 0.02, 0.026, 0.012, 0.03, M.IRON, col( '#3c3834' ) );
			kk.box( 0.078, 0.0065, 0.04, 0.009, 0.012, 0.012, M.IRON, col( '#3c3834' ) );
			kk.box( 0.059, 0.0065, 0.04, 0.009, 0.012, 0.012, M.IRON, col( '#3c3834' ) );
			const m = new THREE.Matrix4().makeRotationY( 0.65 ).setPosition( keyAt.x, TH + 0.0005, keyAt.z );
			for ( const g of kk.parts ) g.applyMatrix4( m );
			parts.key = kk.build();

		}

		// --- the light and the dirt, baked into the colours. The lantern throws no shadows, so the
		// room's own are worked out here, from the flame (a few points across it, for soft edges)
		// past the boxes in occ: the floor round and under the table, the far sides of things. And
		// the smoke of years: darker up the walls and over the ceiling, blackest round the hearth; the
		// dark in the corners, at the foot of things, under the bunk and the benches.
		{

			const LP = HUT.lamp, taps = [ [ 0.035, 0, 0 ], [ - 0.035, 0, 0 ], [ 0, 0, 0.035 ], [ 0, 0, - 0.035 ], [ 0, 0.03, 0 ] ];
			const lit = ( px, py, pz ) => {

				let n = 0;
				for ( const [ ox, oy, oz ] of taps ) {

					const dx = LP.x + ox - px, dy = LP.y + oy - py, dz = LP.z + oz - pz;
					let hit = false;
					for ( let i = 0; i < occ.length && ! hit; i += 6 ) {

						let t0 = 0, t1 = 0.98;
						for ( let a = 0; a < 3; a ++ ) {

							const p = a === 0 ? px : a === 1 ? py : pz, d = a === 0 ? dx : a === 1 ? dy : dz;
							const lo = occ[ i + a ], hi = occ[ i + 3 + a ];
							if ( Math.abs( d ) < 1e-9 ) {

								if ( p < lo || p > hi ) {

									t0 = 2;
									break;

								}

								continue;

							}

							let u = ( lo - p ) / d, v = ( hi - p ) / d;
							if ( u > v ) [ u, v ] = [ v, u ];
							if ( u > t0 ) t0 = u;
							if ( v < t1 ) t1 = v;
							if ( t0 > t1 ) break;

						}

						if ( t0 <= t1 ) hit = true;

					}

					if ( ! hit ) n ++;

				}

				return n / taps.length;

			};

			const soot = ( x, y, z ) => {

				const dh = Math.hypot( x - HX, z - HZ );
				return ( 1 - 0.6 * ss( y, 0.6, EAVE ) ) * ( 1 - 0.5 * ( 1 - ss( dh, 0.5, 2.4 ) ) * ss( y, 0.2, 1.3 ) );

			};

			const corner = ( x, z ) => ( 0.6 + 0.4 * ss( Math.min( x - x0, x1 - x ), 0, 0.5 ) ) * ( 0.6 + 0.4 * ss( Math.min( z - z0, z1 - z ), 0, 0.5 ) );
			// under things standing on the floor
			const under = ( x, z ) => {

				let a = 1;
				for ( const [ cx, cz, hx, hz ] of furniture ) {

					const d = Math.max( Math.abs( x - cx ) - hx, Math.abs( z - cz ) - hz );
					a = Math.min( a, 0.4 + 0.6 * ss( d, - 0.06, 0.14 ) );

				}

				return a;

			};

			for ( let pi = 0; pi < k.parts.length; pi ++ ) {

				const g = k.parts[ pi ], mine = pi >= i0;
				const P = g.getAttribute( 'position' ), N = g.getAttribute( 'normal' ), C = g.getAttribute( 'color' ), Mt = g.getAttribute( 'aMat' );
				const mat = Mt.getX( 0 );
				if ( mat === M.VOID || mat === M.GLOW ) continue;
				// (the walls' logs: only their faces turned into the room, each log its own shade)
				const logK = 0.2 + 0.2 * Q(), warm = Q() - 0.5;
				for ( let i = 0; i < P.count; i ++ ) {

					let x = P.getX( i ), y = P.getY( i ), z = P.getZ( i );
					const nx = N.getX( i ), ny = N.getY( i ), nz = N.getZ( i );
					let f;
					if ( ! mine ) {

						// (a log's face runs on past the corner into the crossing, its ends out there too)
						const side = Math.abs( Math.abs( x ) - x1 ) < 0.035 && nx * Math.sign( x ) < - 0.6;
						const end = Math.abs( Math.abs( z ) - z1 ) < 0.035 && nz * Math.sign( z ) < - 0.6;
						if ( ! ( side || end ) || y < - 0.01 || y > EAVE + 0.02 ) continue;
						x = THREE.MathUtils.clamp( x, x0, x1 );
						z = THREE.MathUtils.clamp( z, z0, z1 );
						f = logK * soot( x, y, z ) * ( 0.75 + 0.25 * ss( y, 0, 0.6 ) );
						// (some logs redder, some gone grey)
						C.setXYZ( i, C.getX( i ) * ( 1 + 0.16 * warm ) * f, C.getY( i ) * f, C.getZ( i ) * ( 1 - 0.2 * warm ) * f );
						continue;

					} else {

						const fl = y < FL + 0.005 && ny > 0.9;
						f = soot( x, y, z ) * corner( x, z ) * ( fl ? under( x, z ) : 0.62 + 0.38 * ss( y, FL, 0.3 ) );
						// the lantern's light, where its rays are blocked
						const ld = ( LP.x - x ) * nx + ( LP.y - y ) * ny + ( LP.z - z ) * nz;
						if ( ld > 0 ) f *= 0.16 + 0.84 * lit( x + nx * 0.015, y + ny * 0.015, z + nz * 0.015 );
						else f *= 0.85;

					}

					C.setXYZ( i, C.getX( i ) * f, C.getY( i ) * f, C.getZ( i ) * f );

				}

			}

		}

		// (the outside's dice go on from where the old room left them - it threw them 295 times - so
		// the roof, the woodpile and the rest keep the look they had)
		seed = seedA + 295;

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
		// steps down off it, the whole of its front: treads of big flags, each on its course of
		// rubble, a hand's height apiece (the last one down is onto the trampled earth)
		{

			const z0 = L / 2 + PORCH + 0.07, TREAD = 0.3;
			const drop = fy - ground( 0, z0 + 0.45 );
			const n = Math.max( 1, Math.round( drop / 0.19 ) ), rise = drop / n;
			HUT.steps = { n, rise, tread: TREAD, z0, fy };
			for ( let i = 1; i < n; i ++ ) {

				const top = fy - i * rise, za = z0 + ( i - 1 ) * TREAD, zc = za + TREAD / 2;
				let x = - W / 2 - 0.15;
				const x1 = W / 2 + 0.15;
				while ( x < x1 - 0.05 ) {

					let len = 0.75 + R() * 0.65;
					if ( x1 - ( x + len ) < 0.4 ) len = x1 - x;
					const xc = x + len / 2;
					const gmin = Math.min( ground( x, za ), ground( x + len, za ), ground( x, za + TREAD ), ground( x + len, za + TREAD ) );
					if ( gmin < top - 0.06 ) {

						// the course under it, down into the ground
						k.box( xc, ( gmin - 0.12 + top - 0.06 ) / 2, zc - 0.01, len - 0.01, top - 0.06 - gmin + 0.12, TREAD - 0.02, M.RUBBLE, '#8a8479' );
						// the flag, its nose a little proud of the course
						const c = mixc( '#7d776e', R() < 0.5 ? '#6f675c' : '#857d70', R() ).multiplyScalar( 0.85 + 0.25 * R() );
						k.box( xc, top - 0.035, zc + 0.02, len - 0.035, 0.07, TREAD + 0.05, M.STONE, c, { rot: [ ( R() - 0.5 ) * 0.02, ( R() - 0.5 ) * 0.035, ( R() - 0.5 ) * 0.02 ], round: 0.015 } );

					}

					x += len;

				}

			}

		}
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
		// (the rims a hair inside the log's cut faces and short of its end caps, and the solid ends
		// short of the caps too: faces lying in one plane fought for the pixels, a flicker of dots)
		for ( const xs of [ - 1, 1 ] ) k.box( tp.x + xs * ( ri + ro ) / 2, axisY - 0.005, tp.z, ro - ri - 0.006, 0.01, tl - 0.008, M.LOG, col( '#6a5440' ), { axis: [ 0, 0, 1 ] } );
		for ( const zs of [ - 1, 1 ] ) {

			const e = new THREE.CircleGeometry( ro, 20, Math.PI, Math.PI );
			e.rotateX( 0 );
			e.translate( 0, 0, 0 );
			if ( zs < 0 ) e.rotateY( Math.PI );
			e.translate( tp.x, axisY, tp.z + zs * tl / 2 );
			k.add( e, M.END, col( '#7a6248' ), [ 0, 0, 1 ], [ tp.x, axisY, tp.z + zs * tl / 2 ] );
			// solid ends inside the hollow
			k.box( tp.x, axisY - ri / 2 - 0.004, tp.z + zs * ( tl / 2 - 0.07 ), ri * 1.6, ri, 0.12, M.LOG, col( '#1c1712' ), { axis: [ 0, 0, 1 ] } );

		}

		// the feed pipe on its post beside the far end, spouting in over the rim (off the line
		// of the door, so the view along the water is clear)
		const postZ = tp.z + tl / 2 - 0.35, postX = tp.x - ro - 0.28, pg = ground( postX, postZ );
		k.pole( new THREE.Vector3( postX, pg - 0.05, postZ ), new THREE.Vector3( postX, axisY + 0.75, postZ ), 0.08, M.LOG, col( '#5a4632' ), 9 );
		k.pole( new THREE.Vector3( postX + 0.05, axisY + 0.42, postZ ), new THREE.Vector3( tp.x - 0.05, axisY + 0.34, postZ - 0.25 ), 0.04, M.BARK, col( '#4d3e30' ), 4 );
		HUT.troughPipe = new THREE.Vector3( tp.x - 0.05, axisY + 0.34, postZ - 0.25 );
		for ( let i = 0; i < 6; i ++ ) {

			const zz = tp.z - tl / 2 + 0.3 + i * 0.4 + ( R() - 0.5 ) * 0.06, dx = ( R() - 0.5 ) * 0.08, c = logCol( 1, 0.8 ), ry = ( R() - 0.5 ) * 0.15, rz = ( R() - 0.5 ) * 0.03;
			cover.box( tp.x + dx, axisY + 0.02, zz, 0.85, 0.035, 0.22, M.BOARD, c, { rot: [ 0, ry, rz ], axis: [ 1, 0, 0 ] } );

		}

		parts.cover = cover.build();
		// the same boards wrenched off in the storm: flung down on the trodden earth on the far
		// side from the door, one propped against the log, nails bent out of them
		const off = new Kit( ground, k.ao );
		for ( let i = 0; i < 6; i ++ ) {

			const c = logCol( 1, 0.8 );
			if ( i === 0 ) {

				// propped against the trough's side, slanting
				off.box( tp.x + ro + 0.22, axisY - 0.2, tp.z - 0.5, 0.85, 0.035, 0.22, M.BOARD, c, { rot: [ 0, 0.15, 1.05 ], axis: [ 1, 0, 0 ] } );
				continue;

			}

			const x = tp.x + ro + 0.7 + R() * 0.9, z = tp.z - 1.1 + i * 0.45 + ( R() - 0.5 ) * 0.3;
			off.box( x, ground( x, z ) + 0.02 + ( i % 3 === 2 ? 0.035 : 0 ), z, 0.85, 0.035, 0.22, M.BOARD, c, { rot: [ ( R() - 0.5 ) * 0.08, ( R() - 0.5 ) * 1.4, ( R() - 0.5 ) * 0.06 ], axis: [ 1, 0, 0 ] } );
			off.box( x + 0.3, ground( x, z ) + 0.05, z, 0.006, 0.05, 0.006, M.IRON, '#3a342e' );

		}

		parts.coverOff = off.build();

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
