import * as THREE from 'three';
import { Kit, M, col, mixc } from './kit.js';
import { beam, lathe } from './jetty.js';

// The wayside shrine (a Marterl, a Bildstock), after photographs of the wooden ones of Tyrol,
// Bavaria and Lower Austria (mockups/refs/shrine: d7, d8, c4, c3; the silvered post d5; the
// kneeler e3): a squared larch post, grey with weather and split by drying checks, set in a
// heap of mossy stones; on it a corbel, and on that a little gabled box of boards open at the
// front - the niche - under a steep roof of small split shingles. The front gable board is sawn
// into an arch with a heart cut through it; a small cross stands on the ridge. In the niche,
// the vault painted blue with gilt stars, and a faded devotional picture (a Madonna in the
// clouds over a mountain meadow, a man kneeling to her, a memorial inscription under it, as
// the Marterl of c4 has); a shelf with candle glasses on it. At the foot, a jam jar of dried
// flowers tied with string, a spent grave light, a folded card under a stone; a photograph
// pinned to the post; a kneeling bench in front.
// Built in its own frame: origin at the foot of the post, +y up, +z the side facing the trail.

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
const V2 = ( x, y ) => new THREE.Vector2( x, y );
const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

function rand( seed ) {

	let s = seed >>> 0;
	return () => ( ( s = Math.imul( s ^ ( s >>> 15 ), 2246822507 ) + 0x6d2b79f5 | 0 ) >>> 0 ) / 4294967296;

}

// --- dimensions (metres)
const PW = 0.15; // the post's section
const Y0 = 1.6; // the underside of the niche's floor: the post's height to the box
const CORBEL = 0.08; // the corbel between the post and the box
const POST_TOP = Y0 - CORBEL;
const FT = 0.035; // the floor board
const YF = Y0 + FT; // the floor's top: the shelf the candles stand on
const HW = 0.215; // half the box's outer width
const WT = 0.024; // the boards of its walls
const ZB = - 0.115, ZF = 0.12; // the back of the back board, the front edges of the side walls
const EY = YF + 0.46; // the eave: the side walls' tops (at their outer faces)
const PITCH = 52 * Math.PI / 180, TANP = Math.tan( PITCH );
const AY = EY + HW * TANP; // the underside of the roof at the ridge
const OVH = 0.075, RZB = - 0.155, RZF = 0.285; // the roof's overhang at the sides; its back and front edges
const S = ( HW + OVH ) / Math.cos( PITCH ); // the roof's length down the slope, ridge to eave
const RT = 0.016; // the roof boards
const PY0 = YF + 0.05; // the painting's lower edge
const PX = 0.165; // its half width

// a point on the roof: s down the slope from the ridge, lifted off the underside of the boards
const slope = ( xs, s, lift ) => V( xs * ( s * Math.cos( PITCH ) + lift * Math.sin( PITCH ) ), AY - s * Math.sin( PITCH ) + lift * Math.cos( PITCH ), 0 );

// ambient occlusion: dark in the back of the niche, shaded under the roof, darker toward the ground
function shrineAO( ground ) {

	return ( x, y, z, ny ) => {

		let a = 1;
		if ( Math.abs( x ) < HW - 0.005 && y > YF - 0.005 && y < AY && z > ZB && z < ZF + 0.03 ) a = 0.62 + 0.33 * ss( ZB, ZF + 0.03, z );
		else if ( Math.abs( x ) < HW + OVH && y > Y0 - 0.12 && y < AY + 0.05 && z > RZB && z < RZF ) a = 0.82;
		if ( ny < - 0.5 && y > Y0 - 0.15 ) a *= 0.65;
		const g = ground( x, z );
		a *= 0.5 + 0.5 * THREE.MathUtils.smoothstep( y - g, - 0.05, 0.45 );
		return Math.min( 1, a );

	};

}

// per-vertex colours from a function of position (the kit keeps them when given colour null)
function tint( g, f ) {

	const p = g.getAttribute( 'position' ), c = new Float32Array( p.count * 3 ), t = new THREE.Color();
	for ( let i = 0; i < p.count; i ++ ) {

		f( p.getX( i ), p.getY( i ), p.getZ( i ), t );
		c[ i * 3 ] = t.r; c[ i * 3 + 1 ] = t.g; c[ i * 3 + 2 ] = t.b;

	}

	g.setAttribute( 'color', new THREE.BufferAttribute( c, 3 ) );
	return g;

}

// the post is a little out of true: swollen low down, its faces winding gently up its length.
// Things fixed to its faces (checks, a nail, the photograph) are bent the same way to stay on them.
function warpPost( g ) {

	const p = g.getAttribute( 'position' );
	for ( let i = 0; i < p.count; i ++ ) {

		const x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
		const sw = 1 + 0.03 * ( 1 - ss( 0, 0.8, y ) );
		p.setXYZ( i, x * sw + Math.sin( y * 1.9 + 0.4 ) * 0.004, y, z * sw + Math.sin( y * 1.3 + 1.7 ) * 0.003 );

	}

	g.computeVertexNormals();
	return g;

}

// a small lump (a bead, a wax drip, a flower head)
function blob( k, x, y, z, rx, ry, rz, mat, c, detail = 0 ) {

	const g = new THREE.IcosahedronGeometry( 1, detail );
	g.scale( rx, ry, rz );
	g.translate( x, y, z );
	k.add( g, mat, c, [ 0, 1, 0 ], [ x, y, z ] );

}

// a flat shape (x, y) extruded along z from z0, depth d
function slab( shape, z0, d, curveSegments = 8 ) {

	const g = new THREE.ExtrudeGeometry( shape, { depth: d, bevelEnabled: false, curveSegments } );
	g.translate( 0, 0, z0 );
	return g;

}

// Builds the shrine; ground( lx, lz ) is the terrain height in its frame. Returns
// { geometry, parts: { candles, flames, photo, card }, info }. parts.candles are the three
// glasses on the shelf; parts.flames (the flames and the glow of the glasses round them) is
// shown when they are lit; parts.photo and parts.card can be taken away. info (all in the
// shrine's frame): candles, photo, card - [ x, y, z ] of each; niche - the middle of the niche;
// collision - [ [ cx, cz, halfX, halfZ ], ... ] (the heap round the post, the kneeling bench).
export function buildShrine( ground ) {

	const R = rand( 1994 );
	const ao = shrineAO( ground );
	const k = new Kit( ground, ao );
	const parts = {}, info = {};
	// silvered larch; warmer brown where the roof keeps the rain off
	const silver = () => mixc( '#645f58', '#716a61', R() ).multiplyScalar( 0.9 + 0.15 * R() );
	const warm = () => mixc( '#5a4736', '#665240', R() ).multiplyScalar( 0.9 + 0.15 * R() );
	const g0 = ground( 0, 0 );

	// --- the post: squared larch with chamfered arrises, a little out of true, grey and split,
	// dark and green with damp where it goes into the stones, browner up under the box
	{

		// (each face in five strips, so the weather's streaks can run down it)
		const c = PW / 2, ch = 0.017, pts = [];
		const side = ( ax, ay, bx, by, n ) => {

			for ( let i = 0; i < n; i ++ ) pts.push( V2( ax + ( bx - ax ) * i / n, ay + ( by - ay ) * i / n ) );

		};

		side( - c + ch, - c, c - ch, - c, 5 ); side( c - ch, - c, c, - c + ch, 1 );
		side( c, - c + ch, c, c - ch, 5 ); side( c, c - ch, c - ch, c, 1 );
		side( c - ch, c, - c + ch, c, 5 ); side( - c + ch, c, - c, c - ch, 1 );
		side( - c, c - ch, - c, - c + ch, 5 ); side( - c, - c + ch, - c + ch, - c, 1 );
		const yb = g0 - 0.45;
		const g = new THREE.ExtrudeGeometry( new THREE.Shape( pts ), { depth: POST_TOP - yb, steps: 14, bevelEnabled: false } );
		g.rotateX( - Math.PI / 2 );
		g.translate( 0, yb, 0 );
		const base = col( '#615c55' ), damp = col( '#3a3b2c' ), under = col( '#58473a' ), bleach = col( '#79746b' ), t2 = new THREE.Color();
		tint( g, ( x, y, z, t ) => {

			// across each face: grey streaks where the rain runs, darker in the grain's hollows
			const u = Math.abs( z ) > c * 0.95 ? x + Math.sign( z ) * 0.31 : z + Math.sign( x ) * 0.73;
			const streak = Math.sin( u * 95 + Math.sin( y * 2.3 + u * 40 ) * 1.4 ) * 0.5 + Math.sin( u * 37 + 1.3 ) * 0.5;
			t.copy( base ).multiplyScalar( 0.86 + 0.12 * streak + 0.05 * Math.sin( y * 5.3 + u * 20 ) );
			// the weather side (the trail's) bleached paler
			t.lerp( bleach, 0.35 * ss( 0.02, 0.075, z ) * ( 0.6 + 0.4 * streak ) );
			t.lerp( damp, 1 - ss( g0 - 0.05, g0 + 0.5, y ) );
			t.lerp( t2.copy( under ), ss( 1.2, POST_TOP, y ) * 0.55 );

		} );
		warpPost( g );
		k.add( g, M.LOG, null, [ 0, 1, 0 ], [ 0, ( yb + POST_TOP ) / 2, 0 ] );

		// drying checks down the faces: long lens-shaped splits, dark in their depths
		const check = ( x0, y0, y1, w, face ) => {

			const pts = [];
			const n = 10;
			for ( let i = 0; i <= n; i ++ ) {

				const t = i / n, y = y0 + ( y1 - y0 ) * t;
				pts.push( V2( x0 + Math.sin( t * 5 + x0 * 90 ) * 0.004 + Math.sin( t * Math.PI ) * w * 0.5, y ) );

			}

			for ( let i = n - 1; i > 0; i -- ) {

				const t = i / n, y = y0 + ( y1 - y0 ) * t;
				pts.push( V2( x0 + Math.sin( t * 5 + x0 * 90 ) * 0.004 - Math.sin( t * Math.PI ) * w * 0.5, y ) );

			}

			const cg = slab( new THREE.Shape( pts ), PW / 2 - 0.0015, 0.003 );
			if ( face === 1 ) cg.rotateY( Math.PI / 2 );
			k.add( warpPost( cg ), M.VOID, '#000000' );

		};

		check( 0.022, g0 + 0.15, 1.12, 0.006, 0 );
		check( - 0.035, 0.7, 1.38, 0.004, 0 );
		check( - 0.01, g0 + 0.05, 0.95, 0.005, 1 );
		// an old nail higher up, a torn scrap of paper still under its head
		const nail = new THREE.BoxGeometry( 0.006, 0.006, 0.008 );
		nail.translate( - 0.04, 1.06, PW / 2 + 0.004 );
		k.add( warpPost( nail ), M.IRON, '#4a3a2e' );
		const scrap = new THREE.Shape( [ V2( - 0.052, 1.05 ), V2( - 0.022, 1.063 ), V2( - 0.03, 1.035 ), V2( - 0.045, 1.028 ) ] );
		k.add( warpPost( slab( scrap, PW / 2 + 0.0004, 0.0008 ) ), M.LEATHER, '#b9b2a0' );

	}

	// --- the corbel: a short beam across the post's head with its ends swept up, and two
	// braces from the post under it
	{

		const sh = new THREE.Shape();
		sh.moveTo( - 0.12, 0 );
		sh.lineTo( 0.12, 0 );
		sh.quadraticCurveTo( 0.2, 0.004, 0.235, 0.048 );
		sh.lineTo( 0.235, CORBEL );
		sh.lineTo( - 0.235, CORBEL );
		sh.lineTo( - 0.235, 0.048 );
		sh.quadraticCurveTo( - 0.2, 0.004, - 0.12, 0 );
		const g = slab( sh, - 0.07, 0.14, 6 );
		g.translate( 0, POST_TOP, 0 );
		k.add( g, M.LOG, silver().lerp( warm(), 0.45 ).multiplyScalar( 0.9 ), [ 1, 0, 0 ], [ 0, POST_TOP + CORBEL / 2, 0 ] );
		for ( const xs of [ - 1, 1 ] ) {

			beam( k, V( xs * 0.07, POST_TOP - 0.22, 0 ), V( xs * 0.155, POST_TOP + 0.012, 0 ), 0.045, 0.04, M.LOG, silver(), { up: V( 0, 0, 1 ), round: 0.008 } );
			// the peg through the brace's foot
			const pg = new THREE.CylinderGeometry( 0.007, 0.007, 0.05, 6 );
			pg.rotateX( Math.PI / 2 );
			pg.translate( xs * 0.085, POST_TOP - 0.18, 0 );
			k.add( pg, M.END, warm(), [ 0, 0, 1 ], [ xs * 0.085, POST_TOP - 0.18, 0 ] );

		}

	}

	// --- the box, of boards (each its own piece, each weathered its own shade: the kit's
	// one-piece board surface draws them dark). Its floor runs out in front of the walls as the
	// shelf.
	beam( k, V( - HW - 0.0175, Y0 + FT / 2, 0.035 ), V( HW + 0.0175, Y0 + FT / 2, 0.035 ), 0.31, FT, M.LOG, silver(), { round: 0.012 } );
	// the side walls, two upright boards each, their tops cut to the roof's slope
	for ( const xs of [ - 1, 1 ] ) {

		const zm = ( ZB + ZF ) / 2 + ( R() - 0.5 ) * 0.02;
		for ( const [ za, zb ] of [ [ ZB, zm - 0.0008 ], [ zm + 0.0008, ZF ] ] ) {

			const sh = new THREE.Shape( [ V2( HW - WT, YF - 0.002 ), V2( HW, YF - 0.002 ), V2( HW, EY ), V2( HW - WT, EY + WT * TANP ) ] );
			const g = slab( sh, za, zb - za );
			if ( xs < 0 ) {

				// mirrored to the left: turn its faces back outward
				g.scale( - 1, 1, 1 );
				const p = g.getAttribute( 'position' );
				for ( let i = 0; i < p.count; i += 3 ) {

					const ax = p.getX( i + 1 ), ay = p.getY( i + 1 ), az = p.getZ( i + 1 );
					p.setXYZ( i + 1, p.getX( i + 2 ), p.getY( i + 2 ), p.getZ( i + 2 ) );
					p.setXYZ( i + 2, ax, ay, az );

				}

				g.computeVertexNormals();

			}

			g.translate( xs * ( R() - 0.5 ) * 0.003, 0, 0 );
			k.add( g, M.LOG, xs < 0 ? silver() : silver().lerp( warm(), 0.35 ), [ 0, 1, 0 ], [ xs * ( HW - WT / 2 ), ( YF + EY ) / 2, ( za + zb ) / 2 ] );

		}

	}

	// the back: three upright boards between the walls, up into the gable, and two battens
	// nailed across them behind
	{

		const hw = HW - WT - 0.001, top = ( x ) => EY + ( HW - Math.abs( x ) ) * TANP - 0.002;
		const cuts = [ - hw, - 0.062 + ( R() - 0.5 ) * 0.02, 0.064 + ( R() - 0.5 ) * 0.02, hw ];
		for ( let i = 0; i < 3; i ++ ) {

			const x0 = cuts[ i ] + ( i ? 0.0006 : 0 ), x1 = cuts[ i + 1 ] - ( i < 2 ? 0.0006 : 0 );
			const pts = [ V2( x0, YF - 0.002 ), V2( x1, YF - 0.002 ), V2( x1, top( x1 ) ) ];
			if ( x0 < 0 && x1 > 0 ) pts.push( V2( 0, AY - 0.002 ) );
			pts.push( V2( x0, top( x0 ) ) );
			const zo = ( i === 1 ? - 0.0015 : 0 );
			k.add( slab( new THREE.Shape( pts ), ZB + zo, WT ), M.LOG, warm().lerp( silver(), 0.3 ), [ 0, 1, 0 ], [ ( x0 + x1 ) / 2, ( YF + AY ) / 2, ZB ] );

		}

		for ( const y of [ YF + 0.07, EY - 0.02 ] ) beam( k, V( - hw + 0.015, y, ZB - 0.0095 ), V( hw - 0.015, y, ZB - 0.0095 ), 0.016, 0.045, M.LOG, silver(), { round: 0.008 } );

	}

	// the vault painted blue, gone grey-green, with a scatter of gilt stars: on the insides of
	// the walls and under the roof
	{

		const blue = col( '#44536a' );
		for ( const xs of [ - 1, 1 ] ) {

			const x = xs * ( HW - WT - 0.0012 );
			k.box( x, ( YF + EY ) / 2 + 0.01, ( ZB + WT + ZF ) / 2, 0.002, EY - YF + 0.02, ZF - ZB - WT - 0.004, M.PAINT, blue, { axis: [ 0, 1, 0 ] } );
			// under the roof on this side: a painted strip up the slope
			const sIn = ( HW - WT ) / Math.cos( PITCH );
			const m = slope( xs, sIn / 2, - 0.0012 );
			k.box( m.x, m.y, ( ZB + WT + ZF ) / 2, sIn, 0.002, ZF - ZB - WT, M.PAINT, blue.clone().multiplyScalar( 0.85 ), { rot: [ 0, 0, - xs * PITCH ], axis: [ 0, 0, 1 ] } );
			for ( let i = 0; i < 5; i ++ ) {

				const y = YF + 0.12 + R() * ( EY - YF - 0.1 ), z = ZB + WT + 0.03 + R() * ( ZF - ZB - WT - 0.06 );
				k.box( xs * ( HW - WT - 0.0026 ), y, z, 0.0015, 0.011, 0.011, M.PAINT, '#a88a44', { rot: [ Math.PI / 4, 0, 0 ] } );

			}

		}

	}

	// the picture, painted on the back board: a Madonna in a blue mantle over a red dress,
	// haloed, standing on clouds over a mountain meadow; a man kneeling to her on the left, a
	// dark fir on the right; the inscription in a cartouche below. Faded, flaking, sooted over
	// the candles. (Painted as vertex colours on a fine grid, clipped to the gable.)
	{

		const NX = 30, NY = 50;
		const top = ( x ) => EY + ( HW - Math.abs( x ) ) * TANP - 0.042;
		const zp = ZB + WT + 0.0009;
		const c = new THREE.Color();
		const sky0 = col( '#8e9ca8' ), sky1 = col( '#1d2b50' ), glow = col( '#b8a676' );
		const mant = col( '#29396a' ), dress = col( '#8c2b21' ), flesh = col( '#c4a283' ), gilt = col( '#b0893a' );
		const rock = col( '#6c7585' ), snow = col( '#c9cbcc' ), meadow = col( '#46512a' ), fir = col( '#22301f' );
		const cloud = col( '#cfc8b6' ), coat = col( '#3a2c22' ), cream = col( '#cdbf9e' ), rim = col( '#86652e' );
		const fade = col( '#8a8479' ), bare = col( '#77716a' ), soot = col( '#231d18' );
		const paint = ( u, v, out ) => {

			// the sky, lighter toward the mountains and round the Madonna's head
			out.copy( sky0 ).lerp( sky1, ss( 0.1, 0.5, v ) );
			const hy = v - 0.382, hr = Math.hypot( u, hy );
			out.lerp( glow, 0.45 * ( 1 - ss( 0.05, 0.17, hr ) ) );
			// the mountains: two peaks with snow on them
			const mtn = 0.118 + 0.075 * Math.max( 0, 1 - Math.abs( u + 0.07 ) / 0.1 ) + 0.05 * Math.max( 0, 1 - Math.abs( u - 0.09 ) / 0.075 ) + 0.006 * Math.sin( u * 110 );
			if ( v < mtn ) out.copy( rock ).lerp( snow, ss( mtn - 0.035, mtn - 0.005, v ) * ss( 0.14, 0.17, mtn ) );
			// the meadow
			if ( v < 0.1 + 0.01 * Math.sin( u * 35 ) ) out.copy( meadow ).multiplyScalar( 0.85 + 0.3 * Math.sin( u * 70 + v * 50 ) ** 2 );
			// the fir on the right
			if ( v > 0.07 && v < 0.34 && Math.abs( u - 0.13 ) < ( 0.34 - v ) * 0.17 + 0.004 * Math.sin( v * 160 ) ) out.copy( fir );
			// rays from the halo, gilt, fading out
			const ang = Math.atan2( hy, u );
			if ( hr > 0.05 && hr < 0.1 && Math.abs( Math.sin( ang * 8 ) ) > 0.8 ) out.lerp( gilt, 0.55 * ( 1 - ss( 0.06, 0.1, hr ) ) );
			// the clouds she stands on
			if ( Math.hypot( u / 0.125, ( v - 0.19 ) / 0.045 ) + 0.16 * Math.sin( u * 80 + v * 30 ) < 1 ) out.copy( cloud ).multiplyScalar( 0.9 + 0.12 * Math.sin( u * 120 + v * 90 ) );
			// the crescent moon under her feet
			const cm = Math.hypot( u, ( v - 0.235 ) * 1.6 );
			if ( v < 0.212 && v > 0.19 && cm > 0.036 && cm < 0.052 && Math.abs( u ) < 0.05 ) out.copy( gilt );
			// her mantle, bell-shaped, falling from rounded shoulders; open down the front on the
			// red dress; her hands together at her breast
			if ( v > 0.205 && v < 0.36 ) {

				let w = 0.064 - ( v - 0.205 ) * 0.17;
				if ( v > 0.325 ) w = Math.sqrt( Math.max( 0, 1 - ( ( v - 0.325 ) / 0.035 ) ** 2 ) ) * 0.039;
				const open = 0.013 + ( 0.33 - v ) * 0.1;
				if ( Math.abs( u ) < w ) out.copy( Math.abs( u ) < open && v < 0.33 ? dress : mant ).multiplyScalar( 1 - 0.25 * ss( w * 0.6, w, Math.abs( u ) ) );

			}

			if ( Math.hypot( u, ( v - 0.307 ) * 0.8 ) < 0.011 ) out.copy( flesh );
			// the halo; the veil round the face
			if ( hr < 0.054 && hr > 0.042 ) out.copy( gilt );
			else if ( Math.hypot( u / 0.026, ( v - 0.379 ) / 0.033 ) < 1 ) out.copy( Math.hypot( u / 0.013, ( v - 0.376 ) / 0.018 ) < 1 ? flesh : mant );
			// the kneeling man, bottom left, his hands raised
			if ( u > - 0.132 && u < - 0.09 && v > 0.07 && v < 0.135 - ( u + 0.09 ) * 0.4 ) out.copy( coat );
			if ( Math.hypot( u + 0.1, v - 0.152 ) < 0.013 ) out.copy( flesh );
			// the cartouche with the inscription (its lettering laid on separately)
			if ( v < 0.07 && Math.abs( u ) < 0.152 ) out.copy( Math.abs( u ) > 0.14 || v < 0.009 || v > 0.061 ? rim : cream );

		};

		// the years on it: faded, blotchy, grimed at the edges, flaked to the grey board here and
		// there, sooted up from the candles
		const weather = ( u, v, out ) => {

			out.lerp( fade, 0.22 );
			out.multiplyScalar( 0.88 + 0.16 * R() );
			// grimed toward its edges, where no hand or rain has cleaned it
			const edge = Math.min( PX - Math.abs( u ), v, top( u ) - PY0 - v );
			out.multiplyScalar( 0.72 + 0.28 * ss( 0.0, 0.045, edge ) );
			if ( R() < 0.04 ) out.lerp( bare, 0.8 );
			const sootA = Math.exp( - ( ( u + 0.1 ) ** 2 ) / 0.0012 ) * ( 1 - ss( 0.02, 0.3, v ) ) + Math.exp( - ( ( u - 0.02 ) ** 2 ) / 0.0008 ) * ( 1 - ss( 0.03, 0.22, v ) ) * 0.6;
			out.lerp( soot, Math.min( 0.6, sootA * 0.55 ) );

		};

		const pos = [], cols = [], idx = [];
		for ( let i = 0; i <= NX; i ++ ) {

			const x = - PX + 2 * PX * i / NX;
			for ( let j = 0; j <= NY; j ++ ) {

				const y = PY0 + ( top( x ) - PY0 ) * j / NY;
				pos.push( x, y, zp );
				// the colour at a vertex is the average of the picture round it: soft edges, as
				// brushwork has, not steps
				const h = PX / NX * 0.7, sum = [ 0, 0, 0 ];
				for ( const [ du, dv ] of [ [ 0, 0 ], [ h, h * 0.6 ], [ - h, h * 0.6 ], [ h * 0.6, - h ], [ - h * 0.6, - h ], [ 0, h * 1.2 ], [ 0, - h * 1.2 ] ] ) {

					paint( x + du, y - PY0 + dv, c );
					sum[ 0 ] += c.r / 7; sum[ 1 ] += c.g / 7; sum[ 2 ] += c.b / 7;

				}

				c.setRGB( sum[ 0 ], sum[ 1 ], sum[ 2 ] );
				weather( x, y - PY0, c );
				cols.push( c.r, c.g, c.b );

			}

		}

		for ( let i = 0; i < NX; i ++ ) for ( let j = 0; j < NY; j ++ ) {

			const a = i * ( NY + 1 ) + j, b = ( i + 1 ) * ( NY + 1 ) + j;
			idx.push( a, b, b + 1, a, b + 1, a + 1 );

		}

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'color', new THREE.Float32BufferAttribute( cols, 3 ) );
		g.setIndex( idx );
		g.computeVertexNormals();
		k.add( g, M.PAINT, null, [ 0, 1, 0 ], [ 0, PY0, zp ] );

		// its frame: a narrow moulding, once gilt, gone brown
		const fr = col( '#6a4f2a' ), fw = 0.014, fd = 0.007, zf = zp + fd / 2;
		k.box( 0, PY0 - fw / 2, zf, 2 * PX + 2 * fw, fw, fd, M.PAINT, fr, { axis: [ 1, 0, 0 ] } );
		for ( const xs of [ - 1, 1 ] ) {

			const x = xs * ( PX + fw / 2 ), t = top( PX );
			k.box( x, ( PY0 - fw + t ) / 2, zf, fw, t - PY0 + fw, fd, M.PAINT, fr, { axis: [ 0, 1, 0 ] } );
			const lift = fw / 2 / Math.cos( PITCH );
			beam( k, V( xs * ( PX + fw ), top( PX + fw ) + lift, zf ), V( 0, top( 0 ) + lift, zf ), fw, fd, M.PAINT, fr, { up: V( 0, 0, 1 ) } );

		}

		// the inscription: three lines of dark lettering, words of different lengths
		const ink = col( '#2e2620' );
		for ( const [ v, half, hgt ] of [ [ 0.049, 0.07, 0.006 ], [ 0.033, 0.11, 0.0045 ], [ 0.019, 0.1, 0.0045 ] ] ) {

			let x = - half;
			while ( x < half ) {

				const w = Math.min( half - x, 0.012 + R() * 0.024 );
				if ( w > 0.006 ) k.box( x + w / 2, PY0 + v, zp + 0.0008, w, hgt, 0.001, M.PAINT, ink, { axis: [ 1, 0, 0 ] } );
				x += w + 0.007;

			}

		}

	}

	// --- the front gable board: sawn into an arch over the opening, a heart cut through it
	{

		const a = HW - WT, yA = EY - 0.045;
		const sh = new THREE.Shape();
		sh.moveTo( - HW, yA );
		sh.lineTo( - a, yA );
		sh.absellipse( 0, yA, a, 0.105, Math.PI, 0, true );
		sh.lineTo( HW, yA );
		sh.lineTo( HW, EY );
		sh.lineTo( 0, AY - 0.002 );
		sh.lineTo( - HW, EY );
		sh.lineTo( - HW, yA );
		const hy = EY + 0.155, s = 0.024;
		const h = new THREE.Path();
		h.moveTo( 0, hy - s );
		h.bezierCurveTo( s * 0.9, hy - s * 0.3, s * 1.15, hy + s * 0.55, s * 0.55, hy + s * 0.72 );
		h.bezierCurveTo( s * 0.25, hy + s * 0.82, s * 0.05, hy + s * 0.62, 0, hy + s * 0.36 );
		h.bezierCurveTo( - s * 0.05, hy + s * 0.62, - s * 0.25, hy + s * 0.82, - s * 0.55, hy + s * 0.72 );
		h.bezierCurveTo( - s * 1.15, hy + s * 0.55, - s * 0.9, hy - s * 0.3, 0, hy - s );
		sh.holes.push( h );
		k.add( slab( sh, ZF + 0.0005, 0.02, 14 ), M.LOG, silver(), [ 1, 0, 0 ], [ 0, EY + 0.1, ZF ] );

	}

	// --- the roof: a board each side, the shingles course by course from the eave, a ridge of
	// two boards, barge boards along the gables with a turned drop at the front, a cross
	{

		const zc = ( RZB + RZF ) / 2, zl = RZF - RZB;
		for ( const xs of [ - 1, 1 ] ) {

			const m = slope( xs, S / 2, RT / 2 );
			k.box( m.x, m.y, zc, S, RT, zl, M.LOG, warm().multiplyScalar( 0.85 ), { rot: [ 0, 0, - xs * PITCH ], axis: [ 0, 0, 1 ] } );

		}

		// split larch shingles, small for a small roof: each course a hand's breadth up the
		// last, each shingle lifted at its foot where it lies on the course below
		const t = 0.006, exposure = 0.062;
		const tones = [ '#857c70', '#8a8276', '#7c7468', '#8f867a', '#81776a', '#77706a' ];
		for ( const xs of [ - 1, 1 ] ) {

			const courses = Math.ceil( ( S + 0.01 ) / exposure ) + 1;
			for ( let cN = - 1; cN < courses; cN ++ ) {

				const u0 = Math.max( 0, cN ) * exposure;
				let z = RZB - 0.012 - R() * 0.02;
				while ( z < RZF + 0.005 ) {

					const w = 0.045 + R() * 0.035, len = 0.15 + R() * 0.04;
					if ( z + w > RZF + 0.022 ) break;
					const sLow = S + 0.012 - u0 + ( R() - 0.5 ) * 0.02 + ( cN < 0 ? 0.004 : 0 ), sHigh = Math.max( 0, sLow - len );
					const lenC = sLow - sHigh;
					if ( lenC < 0.02 ) break;
					const tilt = Math.atan( 2 * t / Math.max( lenC, 0.05 ) );
					const p = slope( xs, ( sLow + sHigh ) / 2, RT + ( cN < 0 ? t * 0.5 : 1.6 * t + cN * 0.0003 ) );
					const g = new THREE.BoxGeometry( lenC, t, w );
					const curl = R() < 0.1 ? 0.04 + R() * 0.05 : 0;
					k.put( g, p.x, p.y, z + w / 2, [ ( R() - 0.5 ) * 0.04, ( R() - 0.5 ) * 0.06, - xs * ( PITCH - ( cN < 0 ? 0 : tilt ) - curl ) + ( R() - 0.5 ) * 0.02, 'YXZ' ] );
					k.add( g, M.SHINGLE, col( tones[ Math.floor( R() * tones.length ) ], 0.62 + 0.25 * R() ), [ xs * Math.cos( PITCH ), - Math.sin( PITCH ), 0 ], [ p.x, p.y, z ] );
					z += w + 0.002 + R() * 0.006;

				}

			}

		}

		// the ridge: two boards over the top course, their upper edges meeting over the apex
		const rl = RT + 2.2 * t + 0.006; // the ridge boards' centre, off the roof's underside
		for ( const xs of [ - 1, 1 ] ) {

			const p = slope( xs, 0.035 - rl * TANP + 0.004, rl );
			k.box( p.x, p.y, zc, 0.07, 0.012, zl + 0.02, M.LOG, silver(), { rot: [ 0, 0, - xs * PITCH ], axis: [ 0, 0, 1 ] } );

		}

		// barge boards under the roof's ends, their feet cut on the slant
		for ( const zz of [ RZB + 0.009, RZF - 0.009 ] ) for ( const xs of [ - 1, 1 ] ) {

			const a = slope( xs, 0.0, - 0.022 ), b = slope( xs, S - 0.005, - 0.022 );
			a.z = b.z = zz;
			beam( k, a, b, 0.018, 0.048, M.LOG, silver(), { up: V( 0, 0, 1 ) } );

		}

		// a turned drop under the ridge at the front
		lathe( k, [ [ 0, - 0.075 ], [ 0.008, - 0.07 ], [ 0.014, - 0.055 ], [ 0.009, - 0.042 ], [ 0.013, - 0.03 ], [ 0.013, - 0.012 ], [ 0.016, 0.0 ], [ 0, 0.0 ] ].map( ( [ r, y ] ) => [ r, y ] ), V( 0, AY - 0.02, RZF - 0.009 ), M.LOG, silver(), 8 );
		// the cross on the ridge, over the front gable
		// (its foot a block notched over the ridge, the peak of the ridge boards' tops)
		const ry = AY + ( rl + 0.006 ) / Math.cos( PITCH );
		const cz = RZF - 0.045;
		k.box( 0, ry + 0.004, cz, 0.05, 0.04, 0.04, M.LOG, warm(), { axis: [ 0, 1, 0 ] } );
		k.box( 0, ry + 0.1, cz, 0.02, 0.17, 0.018, M.LOG, silver(), { axis: [ 0, 1, 0 ] } );
		k.box( 0, ry + 0.145, cz, 0.095, 0.018, 0.018, M.LOG, silver(), { axis: [ 1, 0, 0 ] } );

	}

	// --- a rosary hung on a nail on the right wall: wooden beads in a loop, a little cross
	{

		const nail = V( HW + 0.003, EY - 0.07, ZF - 0.03 );
		k.box( nail.x + 0.004, nail.y, nail.z, 0.012, 0.004, 0.004, M.IRON, '#3e3128' );
		const n = 26, beads = mixc( '#3a2b22', '#4a382a', 0.5 );
		for ( let i = 0; i < n; i ++ ) {

			const a = i / n * Math.PI * 2;
			// a teardrop loop hanging from the nail, lying against the wall
			const x = nail.x + 0.012 + 0.004 * Math.sin( a );
			const y = nail.y - 0.075 * ( 1 - Math.cos( a ) ) * 0.5 - 0.035 * Math.sin( a / 2 ) ** 6;
			const z = nail.z + 0.028 * Math.sin( a ) * ( 1 - 0.3 * Math.cos( a ) );
			blob( k, x, y, z, 0.0048, 0.0048, 0.0048, M.LEATHER, beads );

		}

		const bot = V( nail.x + 0.012, nail.y - 0.112, nail.z );
		beam( k, bot, bot.clone().add( V( 0, - 0.04, 0 ) ), 0.003, 0.003, M.ROPE, '#3a2b22' );
		k.box( bot.x, bot.y - 0.055, bot.z, 0.004, 0.036, 0.004, M.BRONZE, '#6e5a36' );
		k.box( bot.x, bot.y - 0.047, bot.z, 0.004, 0.004, 0.022, M.BRONZE, '#6e5a36' );

	}

	// --- on the shelf: wax run from candles long gone, a spent match
	blob( k, 0.1, YF + 0.0015, 0.135, 0.017, 0.0025, 0.011, M.LEATHER, '#a99d84', 1 );
	blob( k, - 0.055, YF + 0.0015, 0.15, 0.009, 0.002, 0.014, M.LEATHER, '#9c8f76', 1 );
	blob( k, 0.19, YF - 0.01, 0.1915, 0.0035, 0.014, 0.003, M.LEATHER, '#a99d84', 0 );
	k.box( 0.07, YF + 0.002, 0.16, 0.035, 0.0025, 0.0025, M.LEATHER, '#2a211a', { rot: [ 0, 0.5, 0 ] } );

	// --- the heap of stones round the foot of the post, moss on the stones that lie low
	{

		const stoneCol = () => mixc( '#6e6559', '#55504a', R() ).multiplyScalar( 0.85 + R() * 0.25 );
		const mossCol = () => mixc( '#2c3a12', '#435020', R() ).multiplyScalar( 0.85 + 0.25 * R() );
		// earth heaped under them, dark, showing between them
		k.stone( 0, g0 - 0.03, 0, 0.44, 0.11, 0.42, col( '#3a3127' ), 5 );
		k.parts[ k.parts.length - 1 ].getAttribute( 'aMat' ).array.fill( M.DIRT );
		// the heap's rise: each stone sits on the ones below and outside it
		const mound = ( d ) => 0.19 * Math.pow( Math.max( 0, 1 - d / 0.42 ), 1.1 );
		const put = ( x, z, rx, ry, rz, lift = 0, moss = 0.4 ) => {

			const y = ground( x, z ) + mound( Math.hypot( x, z ) ) + lift;
			const sd = R() * 90;
			k.stone( x, y, z, rx, ry, rz, stoneCol(), sd, [ ( R() - 0.5 ) * 0.25, 0, ( R() - 0.5 ) * 0.25 ] );
			if ( R() < moss ) {

				// a cushion of moss over its top: the same lump, flattened, in a plain soft surface
				// (the stones' lichen would only bleach it)
				k.stone( x + ( R() - 0.5 ) * rx * 0.3, y + ry * 0.9, z + ( R() - 0.5 ) * rz * 0.3, rx * ( 0.6 + R() * 0.25 ), ry * 0.3, rz * ( 0.6 + R() * 0.25 ), mossCol(), sd + 3 );
				k.parts[ k.parts.length - 1 ].getAttribute( 'aMat' ).array.fill( M.LEATHER );

			}

		};

		// three courses, from the foot of the heap up to the post: field stones the size of a
		// loaf, a fist, rounded; the lowest mossed over, the top ones clean. Smaller at the front,
		// where things are left.
		for ( const [ n, d0, d1, s0, s1, moss ] of [ [ 10, 0.33, 0.4, 0.09, 0.125, 0.55 ], [ 8, 0.2, 0.25, 0.085, 0.115, 0.4 ], [ 6, 0.09, 0.13, 0.07, 0.095, 0.15 ] ] ) {

			for ( let i = 0; i < n; i ++ ) {

				const a = ( i + R() * 0.6 ) / n * Math.PI * 2 + d0 * 7, front = Math.cos( a ) > 0.55 && d0 > 0.3;
				const d = d0 + R() * ( d1 - d0 ), sc = front ? 0.72 : 1, r = ( s0 + R() * ( s1 - s0 ) ) * sc;
				put( Math.sin( a ) * d, Math.cos( a ) * d, r * ( 0.9 + R() * 0.3 ), r * ( 0.62 + R() * 0.2 ), r * ( 0.85 + R() * 0.3 ), - 0.035, moss );

			}

		}

	}

	// --- a jam jar of dried flowers at the foot, front left, tied with string: everlastings,
	// yarrow, grass heads, faded to straw and mauve and rust
	{

		const F = V( - 0.3, 0, 0.47 );
		F.y = Math.min( ground( F.x - 0.04, F.z ), ground( F.x + 0.04, F.z ), ground( F.x, F.z - 0.04 ), ground( F.x, F.z + 0.04 ) ) - 0.005;
		lathe( k, [ [ 0, 0 ], [ 0.039, 0 ], [ 0.042, 0.006 ], [ 0.042, 0.098 ], [ 0.036, 0.106 ], [ 0.036, 0.116 ], [ 0.038, 0.119 ] ], F, M.LEATHER, col( '#8c998f' ), 16 );
		lathe( k, [ [ 0.035, 0.118 ], [ 0.034, 0.02 ] ], F, M.LEATHER, col( '#4c544d' ), 16 );
		const tie = F.clone().add( V( 0.003, 0.15, - 0.002 ) );
		const heads = [ '#7a4a2a', '#6e5260', '#a08850', '#8a5e5a', '#b0a890', '#5e4a34', '#94703e' ];
		// a lump drawn out along a direction (a seed head, a spike, a leaf)
		const spindle = ( p, dir, len, rx, rz, c ) => {

			const g = new THREE.IcosahedronGeometry( 1, 0 );
			g.scale( rx, len / 2, rz );
			g.applyQuaternion( new THREE.Quaternion().setFromUnitVectors( V( 0, 1, 0 ), dir.clone().normalize() ) );
			const m = p.clone().addScaledVector( dir.clone().normalize(), len / 2 );
			g.translate( m.x, m.y, m.z );
			k.add( g, M.LEATHER, c, dir.clone().normalize().toArray(), m.toArray() );

		};

		for ( let i = 0; i < 16; i ++ ) {

			// each stem from the jar's bottom through the knot, out and up, drooping at its head
			const a = i / 16 * Math.PI * 2 + R() * 0.4, r0 = 0.008 + R() * 0.016;
			const out = V( Math.cos( a ), 0, Math.sin( a ) );
			const foot = F.clone().add( V( out.x * r0, 0.025, out.z * r0 ) );
			const mid = tie.clone().addScaledVector( out, 0.005 );
			const spread = 0.035 + R() * 0.07, hgt = 0.1 + R() * 0.15;
			const bend = mid.clone().addScaledVector( out, spread * 0.55 ).add( V( 0, hgt * 0.7, 0 ) );
			const tip = mid.clone().addScaledVector( out, spread ).add( V( 0, hgt * ( 0.92 - spread * 1.5 ), 0 ) );
			const stem = mixc( '#5d5433', '#7a6a42', R() );
			beam( k, foot, mid, 0.004, 0.004, M.LOG, stem );
			beam( k, mid, bend, 0.0035, 0.0035, M.LOG, stem );
			beam( k, bend, tip, 0.003, 0.003, M.LOG, stem );
			const hc = col( heads[ Math.floor( R() * heads.length ) ] ).multiplyScalar( 0.85 + 0.3 * R() );
			const dir = tip.clone().sub( bend ).normalize();
			const kind = R();
			if ( kind < 0.35 ) {

				// an everlasting: a papery ball, a smaller one beside it
				blob( k, tip.x, tip.y + 0.006, tip.z, 0.013, 0.011, 0.013, M.LEATHER, hc );
				if ( R() < 0.6 ) blob( k, tip.x + out.x * 0.012, tip.y - 0.006, tip.z + out.z * 0.012, 0.008, 0.007, 0.008, M.LEATHER, hc.clone().multiplyScalar( 0.85 ) );

			} else if ( kind < 0.55 ) {

				// yarrow: a flat head of tiny flowers
				blob( k, tip.x, tip.y + 0.004, tip.z, 0.022, 0.007, 0.02, M.LEATHER, mixc( hc, '#b0a890', 0.5 ) );

			} else if ( kind < 0.8 ) {

				// a grass head: a slim plume carrying on from the stem
				spindle( tip, dir.clone().add( V( 0, 0.4, 0 ) ), 0.05 + R() * 0.03, 0.006, 0.004, mixc( '#a08850', '#8a7a58', R() ) );

			} else {

				// a spike of little flowers, knots along its top
				for ( let j = 0; j < 3; j ++ ) blob( k, tip.x + dir.x * j * 0.012, tip.y + 0.006 + j * 0.011, tip.z + dir.z * j * 0.012, 0.007 - j * 0.0012, 0.008, 0.007 - j * 0.0012, M.LEATHER, hc );

			}

			// now and then a dry leaf off the stem
			if ( R() < 0.35 ) spindle( bend, out.clone().add( V( 0, 0.5, 0 ) ), 0.04, 0.007, 0.0012, col( '#5b5230' ) );

		}

		const knot = new THREE.TorusGeometry( 0.011, 0.0024, 4, 10 );
		knot.rotateX( Math.PI / 2 );
		knot.translate( tie.x, tie.y, tie.z );
		k.add( knot, M.ROPE, col( '#8c7c5c' ), [ 1, 0, 0 ], tie.toArray() );
		// the string's two ends hanging from the knot
		for ( const [ dx, dz ] of [ [ 0.02, 0.01 ], [ 0.012, - 0.016 ] ] ) {

			const curve = new THREE.CatmullRomCurve3( [ tie.clone().add( V( 0.011, 0, 0 ) ), tie.clone().add( V( dx, - 0.028, dz ) ), tie.clone().add( V( dx * 1.1, - 0.055, dz * 1.3 ) ) ] );
			k.add( new THREE.TubeGeometry( curve, 5, 0.002, 4, false ), M.ROPE, col( '#8c7c5c' ), [ 0, 1, 0 ], tie.toArray() );

		}

	}

	// --- a spent grave light thrown down by the stones on the right, its red faded to pink
	{

		const p = V( 0.44, ground( 0.44, 0.2 ) + 0.03, 0.2 );
		const g = new THREE.LatheGeometry( [ [ 0, - 0.045 ], [ 0.028, - 0.045 ], [ 0.03, 0.0 ], [ 0.032, 0.04 ], [ 0.032, 0.045 ] ].map( ( [ r, y ] ) => V2( r, y ) ), 14 );
		const gi = new THREE.LatheGeometry( [ [ 0.029, 0.044 ], [ 0.027, - 0.038 ] ].map( ( [ r, y ] ) => V2( r, y ) ), 14 );
		for ( const q of [ g, gi ] ) {

			q.rotateZ( Math.PI / 2 - 0.1 );
			q.rotateY( 0.7 );
			q.translate( p.x, p.y, p.z );

		}

		k.add( g, M.LEATHER, col( '#9a5a50' ), [ 1, 0, 0 ], p.toArray() );
		k.add( gi, M.LEATHER, col( '#2e1c18' ), [ 1, 0, 0 ], p.toArray() );

	}

	// --- the kneeling bench: a plank on two board legs, grey, a little out of level
	{

		const kz = 0.86, gl = ground( - 0.24, kz ), gr = ground( 0.24, kz );
		const hL = gl + 0.2, hR = gr + 0.19;
		for ( const [ xs, gg, h ] of [ [ - 1, gl, hL ], [ 1, gr, hR ] ] ) k.box( xs * 0.24, ( gg - 0.1 + h - 0.022 ) / 2, kz, 0.04, h - 0.022 - gg + 0.1, 0.17, M.LOG, silver(), { axis: [ 0, 1, 0 ] } );
		const tilt = Math.atan2( hR - hL, 0.48 );
		beam( k, V( - 0.33, hL - 0.0035, kz + 0.008 ), V( 0.33, hR + 0.0035, kz - 0.008 ), 0.2, 0.042, M.LOG, silver(), { round: 0.014 } );
		// a batten under the plank between the legs
		k.box( 0, ( hL + hR ) / 2 - 0.045, kz - 0.06, 0.46, 0.04, 0.025, M.LOG, silver().multiplyScalar( 0.85 ), { rot: [ 0, 0, tilt ], axis: [ 1, 0, 0 ] } );

	}

	// --- the card, and the stone laid on it
	const CARD = V( 0.2, 0, 0.47 ), cardYaw = 0.45;
	{

		const gc = ground( CARD.x, CARD.z );
		CARD.y = gc;
		// the stone holds down its back corner, toward the post
		const lx = - 0.045, lz = - 0.035, cy = Math.cos( cardYaw ), sy = Math.sin( cardYaw );
		const sx = CARD.x + cy * lx + sy * lz, sz = CARD.z - sy * lx + cy * lz;
		k.stone( sx, ground( sx, sz ) + 0.008, sz, 0.075, 0.045, 0.058, mixc( '#8a857b', '#7a746a', 0.4 ), 17, [ 0.08, 0, - 0.05 ] );

	}

	// ======================================================================================
	// parts
	// ======================================================================================

	// --- the candle glasses on the shelf: a red grave light with its brass lid, a clear votive
	// glass with a white candle, an old green jam jar with a stub burnt low
	const ck = new Kit( ground, ao ), fk = new Kit( ground, ao );
	const flame = ( p, h, r ) => lathe( fk, [ [ 0, 0 ], [ r * 0.7, h * 0.12 ], [ r, h * 0.35 ], [ r * 0.8, h * 0.6 ], [ r * 0.35, h * 0.85 ], [ 0, h ] ], p, M.GLOW, col( '#ff9f45' ), 10 );
	// the glass lit from inside: a skin a hair outside it, brightest level with the flame
	const glowSkin = ( p, prof, hot, cool, yHot ) => {

		const g = new THREE.LatheGeometry( prof.map( ( [ r, y ] ) => V2( r, y ) ), 16 );
		g.translate( p.x, p.y, p.z );
		const a = col( hot ), b = col( cool );
		tint( g, ( x, y, z, t ) => t.copy( b ).lerp( a, 1 - ss( 0, 0.06, Math.abs( y - p.y - yHot ) ) ) );
		fk.add( g, M.GLOW, null, [ 0, 1, 0 ], p.toArray() );

	};

	const cA = V( - 0.1, YF, 0.058 ), cB = V( 0.018, YF, 0.1 ), cC = V( 0.118, YF, 0.052 );
	{

		// A: the grave light
		lathe( ck, [ [ 0, 0 ], [ 0.029, 0 ], [ 0.031, 0.004 ], [ 0.03, 0.05 ], [ 0.032, 0.08 ], [ 0.032, 0.088 ] ], cA, M.LEATHER, col( '#6a1510' ), 16 );
		lathe( ck, [ [ 0.0335, 0.085 ], [ 0.0335, 0.094 ], [ 0.029, 0.1 ], [ 0.014, 0.104 ], [ 0.012, 0.113 ], [ 0.0, 0.113 ] ], cA, M.BRONZE, col( '#8a7442' ), 16 );
		for ( let i = 0; i < 6; i ++ ) {

			const a = i / 6 * Math.PI * 2;
			ck.box( cA.x + Math.cos( a ) * 0.022, cA.y + 0.1005, cA.z + Math.sin( a ) * 0.022, 0.006, 0.003, 0.006, M.VOID, '#000000', { rot: [ 0, - a, 0.35 ] } );

		}

		glowSkin( cA, [ [ 0.0322, 0.004 ], [ 0.0312, 0.05 ], [ 0.0332, 0.08 ], [ 0.0332, 0.0865 ] ], '#4a0e05', '#1c0402', 0.05 );
		lathe( fk, [ [ 0.0122, 0.1045 ], [ 0.0122, 0.1133 ], [ 0.0, 0.1134 ] ], cA, M.GLOW, col( '#3a1406' ), 10 );

		// B: the votive glass, the candle nearly to its rim
		lathe( ck, [ [ 0, 0 ], [ 0.027, 0 ], [ 0.03, 0.006 ], [ 0.03, 0.062 ], [ 0.029, 0.064 ] ], cB, M.LEATHER, col( '#aab4ab' ), 16 );
		lathe( ck, [ [ 0.0275, 0.0635 ], [ 0.0265, 0.006 ] ], cB, M.LEATHER, col( '#6f776f' ), 16 );
		lathe( ck, [ [ 0.0266, 0.048 ], [ 0.0, 0.048 ] ], cB, M.LEATHER, col( '#e4ddcc' ), 16 );
		ck.box( cB.x, cB.y + 0.053, cB.z, 0.0016, 0.01, 0.0016, M.VOID, '#000000' );
		flame( V( cB.x, cB.y + 0.054, cB.z ), 0.032, 0.0062 );
		glowSkin( cB, [ [ 0.0302, 0.006 ], [ 0.0302, 0.062 ] ], '#2c1a06', '#0f0803', 0.05 );

		// C: the jam jar, the thread round its neck, a stub in the bottom
		lathe( ck, [ [ 0, 0 ], [ 0.024, 0 ], [ 0.026, 0.005 ], [ 0.026, 0.05 ], [ 0.022, 0.056 ], [ 0.022, 0.064 ], [ 0.0235, 0.066 ] ], cC, M.LEATHER, col( '#7d9181' ), 16 );
		lathe( ck, [ [ 0.021, 0.065 ], [ 0.023, 0.006 ] ], cC, M.LEATHER, col( '#3e4a40' ), 16 );
		const th = new THREE.TorusGeometry( 0.0226, 0.0016, 4, 16 );
		th.rotateX( Math.PI / 2 );
		th.translate( cC.x, cC.y + 0.06, cC.z );
		ck.add( th, M.LEATHER, col( '#7d9181' ) );
		lathe( ck, [ [ 0.02, 0.022 ], [ 0.0, 0.022 ] ], cC, M.LEATHER, col( '#d6ccb4' ), 16 );
		ck.box( cC.x, cC.y + 0.026, cC.z, 0.0016, 0.009, 0.0016, M.VOID, '#000000' );
		flame( V( cC.x, cC.y + 0.027, cC.z ), 0.03, 0.006 );
		glowSkin( cC, [ [ 0.0262, 0.005 ], [ 0.0262, 0.05 ], [ 0.0222, 0.056 ], [ 0.0222, 0.0645 ] ], '#2e2a0a', '#0e0e04', 0.04 );

	}

	parts.candles = ck.build();
	parts.flames = fk.build();
	info.candles = [ ( cA.x + cB.x + cC.x ) / 3, YF + 0.07, ( cA.z + cB.z + cC.z ) / 3 ];

	// --- the photograph pinned to the post under the niche: a 9 x 13 print, its white border
	// yellowed, a man's head and shoulders gone dark and blue in the damp; a brass drawing pin
	{

		const pk = new Kit( ground, ao );
		const P = V( 0.006, 1.27, PW / 2 + 0.0012 ), tilt = 0.075;
		const q = new THREE.Matrix4().makeRotationZ( tilt ).setPosition( P );
		const layer = ( x, y, w, h, z, c ) => {

			const g = new THREE.BoxGeometry( w, h, 0.0008 );
			g.translate( x, y, z );
			g.applyMatrix4( q );
			pk.add( warpPost( g ), M.LEATHER, col( c ), [ 1, 0, 0 ], P.toArray() );

		};

		layer( 0, 0, 0.09, 0.13, 0, '#cbc1a4' );
		layer( 0, 0.007, 0.078, 0.1, 0.0007, '#3e3d3a' );
		layer( 0, 0.0, 0.066, 0.03, 0.0012, '#29303a' ); // shoulders, a dark jacket
		layer( 0, 0.026, 0.024, 0.032, 0.0017, '#8e7d6a' ); // the face
		layer( 0, 0.045, 0.028, 0.012, 0.0022, '#2a241e' ); // hair
		layer( 0, - 0.037, 0.078, 0.016, 0.0012, '#4a4a3c' ); // behind him, grass
		// the drawing pin at the top
		const pin = new THREE.CylinderGeometry( 0.0058, 0.0062, 0.0022, 12 );
		pin.rotateX( Math.PI / 2 );
		pin.translate( 0, 0.055, 0.0022 );
		pin.applyMatrix4( q );
		pk.add( warpPost( pin ), M.BRONZE, col( '#a88a44' ), [ 0, 0, 1 ], P.toArray() );
		parts.photo = pk.build();
		info.photo = P.toArray();

	}

	// --- the card: folded once, damp, lying where the stone keeps it from the wind, the open
	// edge lifting a little; a word or two in blue-black ink across its front
	{

		const cardK = new Kit( ground, ao );
		const gx = ( ground( CARD.x + 0.05, CARD.z ) - ground( CARD.x - 0.05, CARD.z ) ) / 0.1;
		const gz = ( ground( CARD.x, CARD.z + 0.05 ) - ground( CARD.x, CARD.z - 0.05 ) ) / 0.1;
		const m = new THREE.Matrix4().makeRotationFromEuler( new THREE.Euler( Math.atan( gz ), cardYaw, - Math.atan( gx ), 'YXZ' ) ).setPosition( CARD.x, CARD.y + 0.009, CARD.z );
		const W = 0.105, D = 0.074; // across, and front to back (the fold along the left edge)
		const lower = new THREE.BoxGeometry( W, 0.0009, D );
		lower.applyMatrix4( m );
		cardK.add( lower, M.LEATHER, col( '#d8d0bc' ), [ 1, 0, 0 ], CARD.toArray() );
		// the upper leaf, hinged at the fold (x = -W/2), lifted at its open edge
		const up = new THREE.BoxGeometry( W, 0.0009, D );
		up.translate( W / 2, 0, 0 );
		up.rotateZ( 0.09 );
		up.translate( - W / 2, 0.0012, 0 );
		up.applyMatrix4( m );
		cardK.add( up, M.LEATHER, col( '#e2dac6' ), [ 1, 0, 0 ], CARD.toArray() );
		// the ink: short strokes along two lines on the front (laid on the lifted leaf)
		for ( const [ lz, x0, x1 ] of [ [ 0.022, - 0.012, 0.042 ], [ 0.008, 0.0, 0.036 ] ] ) {

			let x = x0;
			while ( x < x1 ) {

				const w = 0.006 + R() * 0.014;
				const s = new THREE.BoxGeometry( Math.min( w, x1 - x ), 0.0004, 0.0035 );
				s.translate( x + w / 2 + W / 2, 0.0007, lz );
				s.rotateZ( 0.09 );
				s.translate( - W / 2, 0.0012, 0 );
				s.applyMatrix4( m );
				cardK.add( s, M.LEATHER, col( '#1d2233' ), [ 1, 0, 0 ], CARD.toArray() );
				x += w + 0.004;

			}

		}

		parts.card = cardK.build();
		info.card = [ CARD.x, CARD.y + 0.01, CARD.z ];

	}

	// where the player can't walk: the post in its heap of stones, the kneeling bench
	info.collision = [ [ 0, 0, 0.46, 0.46 ], [ 0, 0.86, 0.34, 0.11 ] ];
	info.niche = [ 0, ( YF + EY ) / 2, 0 ];
	return { geometry: k.build(), parts, info };

}
