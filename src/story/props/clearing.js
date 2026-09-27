import * as THREE from 'three';
import { Kit, M, col, mixc } from './kit.js';
import { beam, bolt } from './jetty.js';

// The woodcutters' clearing in the Black Wood, and the footbridge over the gully beyond it.
// After photographs (mockups/refs/clearing, mockups/refs/gullybridge): spruce log piles
// (Holzpolter) beside forest roads in Tyrol and Saxony, the logs laid on two bearer logs and
// piled in a low ridge, bark on, their sawn ends pale and sprayed with the forester's marks - a
// number, a stripe across the front, dots; a Finnish sawbuck of crossed poles; an orange bow
// saw; a chopping block with the axe standing in it among split billets; slab-roofed forest
// shelters; plank footbridges on two log stringers hewn flat on top, with a pole rail on squared
// posts (the Pohorje, the Pilis, the Allgau).
//
// Frames: each builder's origin is on the ground at its middle, y up; the clearing's +z side
// faces the trail; the bridge runs along z. ground( x, z ) is the terrain height in that frame.

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

function rand( seed ) {

	let s = seed >>> 0;
	return () => ( ( s = Math.imul( s ^ ( s >>> 15 ), 2246822507 ) + 0x6d2b79f5 | 0 ) >>> 0 ) / 4294967296;

}

// ---------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------

// two unit vectors across an axis: e1 level, e2 as near to up as it can be; e1 x e2 = ax
function across( ax ) {

	const ref = Math.abs( ax.y ) < 0.95 ? V( 0, 1, 0 ) : V( 1, 0, 0 );
	const e1 = new THREE.Vector3().crossVectors( ref, ax ).normalize();
	const e2 = new THREE.Vector3().crossVectors( ax, e1 ).normalize();
	return { e1, e2 };

}

function mesh( pos, idx ) {

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

// the mantle through rings of points (each the same count, turning from e1 toward e2 round an
// axis that runs from the first ring to the last), facing outward
function tube( rings ) {

	const n = rings[ 0 ].length, pos = [], idx = [];
	for ( const r of rings ) for ( const p of r ) pos.push( p.x, p.y, p.z );
	for ( let i = 0; i < rings.length - 1; i ++ ) for ( let j = 0; j < n; j ++ ) {

		const a = i * n + j, b = i * n + ( j + 1 ) % n, c = a + n, d = b + n;
		idx.push( a, b, c, b, d, c );

	}

	return mesh( pos, idx );

}

// a flat cap over a ring: a fan from its middle, facing along the axis if `ahead`, back if not
function fan( ring, ahead ) {

	const c = ring.reduce( ( s, p ) => s.add( p ), V( 0, 0, 0 ) ).multiplyScalar( 1 / ring.length );
	const pos = [ c.x, c.y, c.z ], idx = [], n = ring.length;
	for ( const p of ring ) pos.push( p.x, p.y, p.z );
	for ( let j = 0; j < n; j ++ ) {

		const a = 1 + j, b = 1 + ( j + 1 ) % n;
		if ( ahead ) idx.push( 0, a, b ); else idx.push( 0, b, a );

	}

	return { g: mesh( pos, idx ), c };

}

// split a geometry's triangles in two by a test on each face ( normal, centroid )
function splitBy( geo, test ) {

	const g = geo.index ? geo.toNonIndexed() : geo;
	const p = g.getAttribute( 'position' ), nr = g.getAttribute( 'normal' );
	const out = [ [ [], [] ], [ [], [] ] ];
	const a = V( 0, 0, 0 ), b = V( 0, 0, 0 ), c = V( 0, 0, 0 ), n = V( 0, 0, 0 ), m = V( 0, 0, 0 );
	for ( let i = 0; i < p.count; i += 3 ) {

		a.fromBufferAttribute( p, i ); b.fromBufferAttribute( p, i + 1 ); c.fromBufferAttribute( p, i + 2 );
		n.subVectors( b, a ).cross( m.subVectors( c, a ) ).normalize();
		const o = out[ test( n, a.clone().add( b ).add( c ).multiplyScalar( 1 / 3 ) ) ? 0 : 1 ];
		for ( let j = 0; j < 3; j ++ ) {

			o[ 0 ].push( p.getX( i + j ), p.getY( i + j ), p.getZ( i + j ) );
			o[ 1 ].push( nr.getX( i + j ), nr.getY( i + j ), nr.getZ( i + j ) );

		}

	}

	return out.map( ( [ ps, ns ] ) => {

		if ( ! ps.length ) return null;
		const r = new THREE.BufferGeometry();
		r.setAttribute( 'position', new THREE.Float32BufferAttribute( ps, 3 ) );
		r.setAttribute( 'normal', new THREE.Float32BufferAttribute( ns, 3 ) );
		return r;

	} );

}

// a rod of elliptical section along a polyline (an axe helve, a saw's bow), capped at both ends;
// rx across (level at the start), ry up. The section is carried along without twisting.
function rod( k, pts, rx, ry, mat, color, seg = 7, taper = null ) {

	let { e1 } = across( pts[ 1 ].clone().sub( pts[ 0 ] ).normalize() );
	const rings = pts.map( ( p, i ) => {

		const t = pts[ Math.min( pts.length - 1, i + 1 ) ].clone().sub( pts[ Math.max( 0, i - 1 ) ] ).normalize();
		e1 = e1.clone().addScaledVector( t, - e1.dot( t ) ).normalize();
		const e2 = new THREE.Vector3().crossVectors( t, e1 );
		const s = taper ? taper( i / ( pts.length - 1 ) ) : 1;
		const ring = [];
		for ( let j = 0; j < seg; j ++ ) {

			const a = j / seg * Math.PI * 2;
			ring.push( p.clone().addScaledVector( e1, Math.cos( a ) * rx * s ).addScaledVector( e2, Math.sin( a ) * ry * s ) );

		}

		return ring;

	} );
	const ax = pts[ pts.length - 1 ].clone().sub( pts[ 0 ] ).normalize();
	const mid = pts[ Math.floor( pts.length / 2 ) ];
	k.add( tube( rings ), mat, color, ax.toArray(), mid.toArray() );
	k.add( fan( rings[ 0 ], false ).g, mat, color, ax.toArray(), pts[ 0 ].toArray() );
	k.add( fan( rings[ rings.length - 1 ], true ).g, mat, color, ax.toArray(), pts[ pts.length - 1 ].toArray() );

}

// A felled log, bark on: a to b, radius ra at a and rb at b, a little lumpy and swept. Its sawn
// ends show pale wood (the shader draws growth rings and checks round each end's centre) inside
// a thin dark rim of bark. `flat` hews it flat on top (a bridge's stringer), down to that
// fraction of the radius. Returns the axis and the ends ( centre, outward normal, radius ).
function log( k, a, b, ra, rb, bark, wood, R, { seg = 10, flat = 0, lump = 1, bend = true, barkMat = M.BARK } = {} ) {

	const d = b.clone().sub( a ), len = d.length(), ax = d.clone().normalize();
	const { e1, e2 } = across( ax );
	const nr = Math.max( 2, Math.round( len / 1.3 ) );
	const ph = R() * 9, ph2 = R() * 9, sweepBy = bend ? ( R() - 0.5 ) * 0.02 * len : 0;
	const sweepDir = e1.clone().multiplyScalar( Math.cos( ph ) ).addScaledVector( e2, Math.sin( ph ) * 0.5 );
	const rings = [];
	for ( let i = 0; i <= nr; i ++ ) {

		const t = i / nr, r0 = ra + ( rb - ra ) * t;
		const c = a.clone().addScaledVector( d, t ).addScaledVector( sweepDir, sweepBy * Math.sin( t * Math.PI ) );
		const ring = [];
		for ( let j = 0; j < seg; j ++ ) {

			const ang = j / seg * Math.PI * 2;
			const r = r0 * ( 1 + lump * ( 0.04 * Math.sin( ang * 3 + ph + t * 5 ) + 0.025 * Math.sin( ang * 2 - ph2 + t * 11 ) ) );
			const u = Math.cos( ang ) * r, v = Math.min( Math.sin( ang ) * r, flat > 0 ? r0 * flat : 1e9 );
			ring.push( c.clone().addScaledVector( e1, u ).addScaledVector( e2, v ) );

		}

		rings.push( ring );

	}

	k.add( tube( rings ), barkMat, bark, ax.toArray(), a.clone().lerp( b, 0.5 ).toArray() );
	const ends = [];
	for ( const [ i, ahead ] of [ [ 0, false ], [ nr, true ] ] ) {

		const rg = rings[ i ];
		const { g, c } = fan( rg, ahead );
		// the whole end in the bark's colour, and the wood a hair proud of it inside the bark
		k.add( g, barkMat, bark.clone().multiplyScalar( 0.55 ), ax.toArray(), c.toArray() );
		const inner = rg.map( ( p ) => c.clone().lerp( p, 0.9 ).addScaledVector( ax, ahead ? 0.003 : - 0.003 ) );
		k.add( fan( inner, ahead ).g, M.LOG, wood, ax.toArray(), c.toArray() );
		ends.push( { c: c.clone().addScaledVector( ax, ahead ? 0.003 : - 0.003 ), n: ax.clone().multiplyScalar( ahead ? 1 : - 1 ), r: i === 0 ? ra : rb } );

	}

	return { ax, ends };

}

// A slab: the first cut off a sawlog, a circular segment in section, bark on the round side and
// sawn flat on the other. Centred on its flat face at c; its length along `along`, the bark
// facing `out`. Returns its thickness.
function slab( k, c, w, len, along, out, bark, sawn ) {

	const Rs = w * 0.85, h = Rs - Math.sqrt( Rs * Rs - w * w / 4 );
	const sh = new THREE.Shape();
	sh.moveTo( - w / 2, 0 ); sh.lineTo( w / 2, 0 );
	const a0 = Math.asin( w / 2 / Rs );
	for ( let i = 1; i < 7; i ++ ) {

		const a = a0 - i / 7 * a0 * 2;
		sh.lineTo( Math.sin( a ) * Rs, Math.cos( a ) * Rs - ( Rs - h ) );

	}

	sh.lineTo( - w / 2, 0 );
	const g = new THREE.ExtrudeGeometry( sh, { depth: len, bevelEnabled: false } );
	g.translate( 0, 0, - len / 2 );
	// local x = out x along (so the frame stays right-handed), y = out, z = along
	const side = new THREE.Vector3().crossVectors( out, along ).normalize();
	g.applyMatrix4( new THREE.Matrix4().makeBasis( side, out, along ).setPosition( c ) );
	const [ flatFace, round ] = splitBy( g, ( n ) => n.dot( out ) < - 0.95 );
	if ( flatFace ) k.add( flatFace, M.LOG, sawn, along.toArray(), c.toArray() );
	if ( round ) k.add( round, M.BARK, bark, along.toArray(), c.toArray() );
	return h;

}

// forestry marking paint, sprayed: strokes [ u0, v0, u1, v1 ] in metres on a face centred at c,
// facing n; u runs to the right as you look at the face, v up
function spray( k, c, n, strokes, color, w = 0.02 ) {

	const up = Math.abs( n.y ) < 0.9 ? V( 0, 1, 0 ) : V( 0, 0, - 1 );
	const eu = new THREE.Vector3().crossVectors( up, n ).normalize(), ev = new THREE.Vector3().crossVectors( n, eu );
	for ( const [ u0, v0, u1, v1 ] of strokes ) {

		const a = c.clone().addScaledVector( eu, u0 ).addScaledVector( ev, v0 ).addScaledVector( n, 0.0025 );
		const b = c.clone().addScaledVector( eu, u1 ).addScaledVector( ev, v1 ).addScaledVector( n, 0.0025 );
		const dir = b.clone().sub( a );
		if ( dir.lengthSq() < 1e-8 ) dir.copy( eu );
		dir.normalize();
		beam( k, a.addScaledVector( dir, - w * 0.45 ), b.addScaledVector( dir, w * 0.45 ), w, 0.003, M.PAINT, color, { up: n } );

	}

}

// hand-sprayed digits, as strokes in a unit box (0..1 across, 0..1 up)
const GLYPH = {
	0: [ [ 0.15, 0, 0.85, 0 ], [ 0.85, 0, 0.9, 1 ], [ 0.9, 1, 0.1, 1 ], [ 0.1, 1, 0.15, 0 ] ],
	1: [ [ 0.55, 0, 0.6, 1 ], [ 0.6, 1, 0.25, 0.75 ] ],
	2: [ [ 0.05, 0.75, 0.35, 1 ], [ 0.35, 1, 0.85, 0.95 ], [ 0.85, 0.95, 0.9, 0.65 ], [ 0.9, 0.65, 0.05, 0 ], [ 0.05, 0, 0.95, 0.02 ] ],
	3: [ [ 0.05, 1, 0.9, 1 ], [ 0.9, 1, 0.35, 0.55 ], [ 0.35, 0.55, 0.9, 0.45 ], [ 0.9, 0.45, 0.8, 0.05 ], [ 0.8, 0.05, 0.05, 0.02 ] ],
	4: [ [ 0.7, 0, 0.72, 1 ], [ 0.72, 1, 0.02, 0.35 ], [ 0.02, 0.35, 0.98, 0.33 ] ],
	5: [ [ 0.92, 1, 0.12, 1 ], [ 0.12, 1, 0.08, 0.55 ], [ 0.08, 0.55, 0.8, 0.58 ], [ 0.8, 0.58, 0.9, 0.1 ], [ 0.9, 0.1, 0.02, 0.02 ] ],
	6: [ [ 0.8, 1, 0.12, 0.5 ], [ 0.12, 0.5, 0.1, 0.05 ], [ 0.1, 0.05, 0.88, 0.05 ], [ 0.88, 0.05, 0.86, 0.5 ], [ 0.86, 0.5, 0.12, 0.5 ] ],
	7: [ [ 0.02, 1, 0.98, 1 ], [ 0.98, 1, 0.35, 0 ] ],
	8: [ [ 0.12, 1, 0.88, 1 ], [ 0.88, 1, 0.85, 0.55 ], [ 0.85, 0.55, 0.12, 0.55 ], [ 0.12, 0.55, 0.12, 1 ], [ 0.06, 0.55, 0.06, 0 ], [ 0.06, 0, 0.94, 0 ], [ 0.94, 0, 0.9, 0.55 ] ],
	9: [ [ 0.9, 0.52, 0.1, 0.5 ], [ 0.1, 0.5, 0.12, 1 ], [ 0.12, 1, 0.9, 1 ], [ 0.9, 1, 0.88, 0 ], [ 0.88, 0, 0.2, 0.02 ] ],
};

function sprayText( k, c, n, text, h, color, R ) {

	const w = h * 0.62, adv = w * 1.3, strokes = [];
	const x0 = - ( text.length * adv - ( adv - w ) ) / 2, y0 = - h / 2;
	[ ...text ].forEach( ( ch, i ) => {

		const sl = ( R() - 0.5 ) * 0.12;
		for ( const [ a, b, cc, d ] of GLYPH[ ch ] || [] ) strokes.push( [ x0 + i * adv + ( a + b * sl ) * w, y0 + b * h, x0 + i * adv + ( cc + d * sl ) * w, y0 + d * h ] );

	} );
	spray( k, c, n, strokes, color, h * 0.15 );

}

// a low heap of sawdust or chips (or trodden bark and earth): highest in the middle, its ragged
// rim sunk into the ground so that the forest floor closes over its edge
function mound( k, ground, cx, cz, rx, rz, h, color, seed ) {

	const segs = 22, rings = 4, pos = [], idx = [];
	pos.push( cx, ground( cx, cz ) + h, cz );
	for ( let r = 1; r <= rings; r ++ ) for ( let i = 0; i < segs; i ++ ) {

		const a = i / segs * Math.PI * 2, f = r / rings;
		const wob = 1 + 0.25 * Math.sin( a * 3 + seed ) + 0.15 * Math.sin( a * 7 + seed * 2.3 ) + 0.08 * Math.sin( a * 13 + seed * 4 );
		const x = cx + Math.cos( a ) * rx * f * wob, z = cz + Math.sin( a ) * rz * f * wob;
		const lump = 0.75 + 0.5 * ( 0.5 + 0.5 * Math.sin( a * 5 + r * 2.1 + seed ) );
		pos.push( x, ground( x, z ) + ( r === rings ? - 0.03 : h * Math.pow( 1 - f * f, 1.5 ) * lump + 0.006 ), z );

	}

	for ( let i = 0; i < segs; i ++ ) idx.push( 0, 1 + ( i + 1 ) % segs, 1 + i );
	for ( let r = 0; r < rings - 1; r ++ ) for ( let i = 0; i < segs; i ++ ) {

		const a = 1 + r * segs + i, b = 1 + r * segs + ( i + 1 ) % segs, c = a + segs, d = b + segs;
		idx.push( a, b, c, b, d, c );

	}

	k.add( mesh( pos, idx ), M.LEATHER, col( color ) );

}

// ---------------------------------------------------------------------------
// the woodcutters' clearing
// ---------------------------------------------------------------------------

// the lean-to: its middle, its width (x) and depth (z), its eaves' heights front and back
const LX = 4.7, LZ = - 4.4, LW = 3.1, LD = 2.1, LHF = 2.15, LHB = 1.5;

// About 16 m by 12 m. Returns { geometry, parts: { notice, plank }, info: { notice: { centre,
// normal }, plank: centre, collision: [ [ cx, cz, halfX, halfZ ], ... ] } }.
export function buildClearing( ground ) {

	const R = rand( 1994 );
	// occlusion: darker near the ground, under the lean-to's roof, and down inside the piles
	const piles = [];
	const k = new Kit( ground, ( x, y, z, ny ) => {

		const g = ground( x, z );
		let a = ( ny < - 0.5 ? 0.6 : 1 ) * ( 0.5 + 0.5 * ss( - 0.05, 0.5, y - g ) );
		if ( Math.abs( x - LX ) < LW / 2 + 0.25 && Math.abs( z - LZ ) < LD / 2 + 0.2 && y < g + LHF ) a *= 0.7;
		for ( const p of piles ) if ( x > p[ 0 ] && x < p[ 1 ] && z > p[ 2 ] && z < p[ 3 ] && y < p[ 4 ] ) a *= 0.8;
		return a;

	} );
	const parts = {}, collision = [];
	let notice = null, plank = null;
	// places taken, kept clear of scattered things: [ x0, x1, z0, z1 ]
	const taken = [];
	const free = ( x, z, m = 0.1 ) => ! taken.some( ( t ) => x > t[ 0 ] - m && x < t[ 1 ] + m && z > t[ 2 ] - m && z < t[ 3 ] + m );
	const barkC = () => mixc( R() < 0.3 ? '#675b50' : '#6a5040', '#78604d', R() ).multiplyScalar( 0.85 + 0.25 * R() );
	const freshC = () => mixc( '#f3dcaa', '#e6c48e', R() ).multiplyScalar( 1.05 + 0.2 * R() );
	// a sawlog's end after some weeks: most still pale, some gone grey or yellow, a few stained
	let endPale = true;
	const endC = () => {

		const t = R();
		endPale = t < 0.6;
		return t < 0.6 ? freshC() : t < 0.8 ? mixc( '#d9c7a4', '#b8ab94', R() ) : t < 0.92 ? mixc( '#e8c47c', '#d8ae66', R() ) : mixc( '#c9a77c', '#9c7b58', R() );

	};
	const greyC = () => mixc( '#a39a88', '#8c8474', R() );
	// sawn faces and boards gone grey-brown in the weather
	const sawnC = () => mixc( '#8f7f68', '#7a6c5a', R() );
	const ORANGE = col( '#ff5418' ), PINK = col( '#f0306a' ), BLUE = col( '#2d62d8' ), WHITE = col( '#ecebe4' );

	// --- the ground is the forest floor's (the terrain's); only the sawdust heaped under the saw
	// cut is the clearing's own (the chips and bark lie where they fell, below)
	mound( k, ground, - 0.62, 0.57, 0.36, 0.3, 0.1, '#dcb97c', 2.2 );

	// --- the log piles (Holzpolter): sawlogs of 4-5 m piled on two bearer logs, each course
	// resting in the hollows of the one below, bark on; the ends toward the road sprayed with
	// the pile's number, a stripe across them all, and a dot or a stroke here and there
	const polter = ( { cx, cz, alongX, len, n0, rows, rMin, rMax, front, number, paint, paint2 } ) => {

		const P = ( s, u, y ) => alongX ? V( cx + s, y, cz + u ) : V( cx + u, y, cz + s );
		const G = ( s, u ) => alongX ? ground( cx + s, cz + u ) : ground( cx + u, cz + s );
		const radii = [];
		for ( let i = 0; i < n0; i ++ ) radii.push( rMin + ( rMax - rMin ) * R() );
		const W = radii.reduce( ( s, r ) => s + r * 2 + 0.02, 0 );
		// two bearers across the pile, laid level into the ground
		const st = [ - len / 2 + 0.8, len / 2 - 0.8 ], rb = 0.13;
		const tops = st.map( ( s ) => {

			const u0 = - W / 2 - 0.35, u1 = W / 2 + 0.35;
			let ya = G( s, u0 ), yb = G( s, u1 ), lift = - 1e9;
			for ( let t = 0; t <= 1.001; t += 0.125 ) lift = Math.max( lift, G( s, u0 + ( u1 - u0 ) * t ) - ( ya + ( yb - ya ) * t ) );
			ya += lift + rb * 0.45; yb += lift + rb * 0.45;
			log( k, P( s, u0, ya ), P( s + ( R() - 0.5 ) * 0.25, u1, yb ), rb, rb * 0.85, barkC().multiplyScalar( 0.8 ), freshC().multiplyScalar( 0.75 ), R );
			return ( u ) => ya + ( yb - ya ) * ( u - u0 ) / ( u1 - u0 ) + rb * 0.92;

		} );
		// pack the courses at each bearer: the bottom one side by side, then each log resting in
		// the hollow between two below it
		let row = [];
		{

			let u = - W / 2;
			for ( const r of radii ) {

				const l = { r, pos: [] };
				u += r + 0.01;
				for ( let j = 0; j < 2; j ++ ) {

					const uu = u + ( R() - 0.5 ) * 0.03;
					l.pos.push( [ uu, tops[ j ]( uu ) + r ] );

				}

				u += r + 0.01;
				row.push( l );

			}

		}

		const all = [ ...row ];
		for ( let c = 1; c < rows && row.length > 1; c ++ ) {

			const next = [];
			for ( let i = 0; i < row.length - 1; i ++ ) {

				const A = row[ i ], B = row[ i + 1 ];
				const r = Math.min( rMin + ( rMax - rMin ) * R() * 0.85, ( A.r + B.r ) * 0.75 );
				const l = { r, pos: [] };
				for ( let j = 0; j < 2; j ++ ) {

					const [ ua, ya ] = A.pos[ j ], [ ub, yb ] = B.pos[ j ];
					const da = A.r + r, db = B.r + r, dx = ub - ua, dy = yb - ya, d = Math.hypot( dx, dy );
					const q = ( da * da - db * db + d * d ) / ( 2 * d ), h = Math.sqrt( Math.max( 0, da * da - q * q ) );
					l.pos.push( [ ua + dx * q / d - dy * h / d, ya + dy * q / d + dx * h / d ] );

				}

				next.push( l );

			}

			// the top course is never complete
			if ( c === rows - 1 && next.length > 2 ) next.splice( R() < 0.5 ? 0 : next.length - 1, 1 );
			row = next;
			all.push( ...next );

		}

		const topY = Math.max( ...all.map( ( l ) => ( l.pos[ 0 ][ 1 ] + l.pos[ 1 ][ 1 ] ) / 2 + l.r ) );
		const ext = alongX ? [ cx - len / 2 - 0.25, cx + len / 2 + 0.25, cz - W / 2 - 0.35, cz + W / 2 + 0.35 ] : [ cx - W / 2 - 0.35, cx + W / 2 + 0.35, cz - len / 2 - 0.25, cz + len / 2 + 0.25 ];
		piles.push( [ ...ext, topY - 0.3 ] );
		taken.push( ext );
		collision.push( [ ( ext[ 0 ] + ext[ 1 ] ) / 2, ( ext[ 2 ] + ext[ 3 ] ) / 2, ( ext[ 1 ] - ext[ 0 ] ) / 2, ( ext[ 3 ] - ext[ 2 ] ) / 2 ] );
		// the logs: the front ends nearly in line, the back ones ragged; butts either way round
		const fronts = [];
		for ( const l of all ) {

			const [ [ u0, y0 ], [ u1, y1 ] ] = l.pos;
			const at = ( s ) => {

				const t = ( s - st[ 0 ] ) / ( st[ 1 ] - st[ 0 ] );
				return P( s, u0 + ( u1 - u0 ) * t, y0 + ( y1 - y0 ) * t );

			};

			const sf = front * ( len / 2 + ( R() - 0.5 ) * 0.14 ), sb = sf - front * ( len + ( R() - 0.3 ) * 0.35 );
			const butt = R() < 0.5 ? 1.1 : 0.9;
			const lg = log( k, at( sb ), at( sf ), l.r * ( 2 - butt ), l.r * butt, barkC(), endC(), R );
			fronts.push( { ...lg.ends[ 1 ], y: ( y0 + y1 ) / 2, pale: endPale } );

		}

		// the marks. A stripe across the whole front, low on the left to high on the right
		const n = fronts[ 0 ].n;
		const eu = new THREE.Vector3().crossVectors( V( 0, 1, 0 ), n ).normalize();
		const uOf = ( f ) => f.c.clone().sub( P( 0, 0, 0 ) ).dot( eu );
		const yb0 = tops[ 0 ]( 0 );
		const lu = - W * 0.35, lv = yb0 + 0.25, du = Math.cos( 0.5 ), dv = Math.sin( 0.5 );
		const offStripe = ( f ) => Math.abs( ( uOf( f ) - lu ) * dv - ( f.c.y - lv ) * du );
		for ( const f of fronts ) {

			const cu = uOf( f ), cv = f.c.y, rr = f.r * 0.82;
			const dist = ( cu - lu ) * dv - ( cv - lv ) * du;
			if ( Math.abs( dist ) > rr - 0.02 ) continue;
			const t = ( cu - lu ) * du + ( cv - lv ) * dv, half = Math.sqrt( rr * rr - dist * dist );
			const fu = lu + du * t - cu, fv = lv + dv * t - cv;
			spray( k, f.c, f.n, [ [ fu - du * half, fv - dv * half, fu + du * half, fv + dv * half ] ], paint, 0.045 );

		}

		// the number on a big end low down, clear of the stripe
		const big = fronts.filter( ( f ) => f.y < yb0 + 0.9 ).sort( ( a, b ) => b.r * ( b.pale ? 1.5 : 1 ) - a.r * ( a.pale ? 1.5 : 1 ) );
		const nf = big.find( ( f ) => offStripe( f ) > f.r * 0.75 ) || big[ 0 ];
		sprayText( k, nf.c, nf.n, number, nf.r * 0.62, paint, R );
		// sorting marks: a dot, a slash
		for ( const f of fronts ) {

			if ( f === nf || R() > 0.18 || offStripe( f ) < f.r ) continue;
			const c2 = R() < 0.65 ? paint : paint2;
			if ( R() < 0.5 ) spray( k, f.c, f.n, [ [ - 0.01, 0.01, 0.01, - 0.01 ] ], c2, 0.055 );
			else spray( k, f.c, f.n, [ [ - f.r * 0.45, - f.r * 0.3, f.r * 0.4, f.r * 0.35 ] ], c2, 0.03 );

		}

		// bark stripped off in the skidding, lying about the front, curled
		for ( let i = 0; i < 6; i ++ ) {

			const p = P( front * ( len / 2 + 0.25 + R() * 0.9 ), ( R() - 0.5 ) * W * 1.2, 0 );
			p.y = ground( p.x, p.z ) + 0.004;
			const a = R() * Math.PI, up = R() < 0.7;
			slab( k, p, 0.07 + R() * 0.06, 0.15 + R() * 0.25, V( Math.cos( a ), 0, Math.sin( a ) ), V( 0, up ? 1 : - 1, 0 ), barkC().multiplyScalar( 1.3 ), mixc( '#b4946e', '#9a7a5a', R() ) );

		}

	};

	polter( { cx: - 5.9, cz: - 2.35, alongX: false, len: 4.6, n0: 8, rows: 6, rMin: 0.11, rMax: 0.24, front: 1, number: '27', paint: ORANGE, paint2: BLUE } );
	polter( { cx: - 1.0, cz: - 4.75, alongX: true, len: 4.1, n0: 6, rows: 4, rMin: 0.11, rMax: 0.21, front: 1, number: '28', paint: ORANGE, paint2: WHITE } );
	// a low pile of thin tops for the pulp mill, 3 m long, marked in pink
	polter( { cx: 6.85, cz: 2.0, alongX: false, len: 3.0, n0: 6, rows: 3, rMin: 0.07, rMax: 0.11, front: 1, number: '9', paint: PINK, paint2: PINK } );

	// the other places, so that the scattered things keep off them
	const LEAN = [ LX - LW / 2 - 0.5, LX + LW / 2 + 0.5, LZ - LD / 2 - 0.3, LZ + LD / 2 + 0.6 ];
	const STACK = [ 3.0, 5.7, 0.25, 1.65 ], NOTICE = [ - 3.0, - 1.9, 4.7, 5.2 ], BUCK = [ - 2.6, 0.2, - 0.05, 1.15 ];
	const BRUSH = [ 6.4, 8.0, - 2.9, - 0.9 ], BLOCK = [ 1.3, 2.2, 1.1, 2.0 ], HEAP = [ 2.3, 3.5, 1.85, 2.85 ];
	taken.push( LEAN, STACK, NOTICE, BUCK, BRUSH, BLOCK, HEAP );

	// --- stumps of the felled spruce: root flares running out into the ground, the cut face
	// pale where it is fresh, grey where it is old; a ridge of torn fibres (the hinge) across it
	const stump = ( x, z, r, h, fresh = true, roots = 3, hinge = fresh ) => {

		const g0 = ground( x, z ), seg = 14, lobes = 4 + Math.floor( R() * 2 ), ph = R() * 6;
		const tn = V( ( R() - 0.5 ) * 0.1, 1, ( R() - 0.5 ) * 0.1 ).normalize();
		const topY = ( px, pz ) => g0 + h - ( tn.x * ( px - x ) + tn.z * ( pz - z ) ) / tn.y;
		const levels = [ - 0.22, 0, Math.min( 0.07, h * 0.3 ), Math.min( 0.18, h * 0.6 ), 1 ];
		const rings = levels.map( ( off, li ) => {

			const ring = [];
			for ( let j = 0; j < seg; j ++ ) {

				// (round an upward axis, turning from +z toward +x)
				const a = j / seg * Math.PI * 2;
				const flare = li === 4 ? 0 : 0.8 * Math.exp( - Math.max( 0, off ) / 0.1 );
				const lobe = Math.pow( 0.5 + 0.5 * Math.cos( lobes * a + ph ), 2 );
				const rr = r * ( 1 + flare * ( 0.25 + 0.75 * lobe ) ) * ( 1 + 0.03 * Math.sin( a * 5 + ph ) );
				const px = x + Math.sin( a ) * rr, pz = z + Math.cos( a ) * rr;
				const py = li === 4 ? topY( px, pz ) : li < 2 ? ground( px, pz ) + off : g0 + off;
				ring.push( V( px, py, pz ) );

			}

			return ring;

		} );
		const bc = fresh ? barkC() : barkC().multiplyScalar( 0.8 );
		k.add( tube( rings ), M.BARK, bc, [ 0, 1, 0 ], [ x, g0 + h / 2, z ] );
		const top = rings[ rings.length - 1 ];
		const { g, c } = fan( top, true );
		k.add( g, M.BARK, bc.clone().multiplyScalar( 0.55 ), tn.toArray(), c.toArray() );
		const inner = top.map( ( p ) => c.clone().lerp( p, 0.9 ).addScaledVector( tn, 0.003 ) );
		const face = fresh ? freshC().multiplyScalar( 0.95 ) : mixc( greyC(), '#58663a', 0.35 );
		k.add( fan( inner, true ).g, M.LOG, face, tn.toArray(), c.toArray() );
		if ( hinge ) {

			// the hinge: a low ridge of torn fibres across the cut, a little off the middle, a
			// splinter or two standing out of it
			const off = ( R() - 0.3 ) * r * 0.4, yaw = R() * Math.PI;
			const hx = x + Math.sin( yaw ) * off, hz = z + Math.cos( yaw ) * off;
			k.box( hx, topY( hx, hz ) + 0.006, hz, r * 1.3, 0.014, 0.03, M.LOG, face.clone().multiplyScalar( 0.85 ), { rot: [ 0, yaw, 0 ], axis: [ 0, 1, 0 ] } );
			for ( let i = 0; i < 2; i ++ ) {

				const t = ( R() - 0.5 ) * r * 1.0;
				const sx = hx + Math.cos( yaw ) * t, sz = hz - Math.sin( yaw ) * t, sh = 0.015 + R() * 0.02;
				k.box( sx, topY( sx, sz ) + 0.012 + sh / 2, sz, 0.008, sh, 0.012, M.LOG, face, { rot: [ ( R() - 0.5 ) * 0.8, yaw, ( R() - 0.5 ) * 0.8 ], axis: [ 0, 1, 0 ] } );

			}

		}

		// a root or two running off from the flares, humped, tapering, diving into the ground
		for ( let i = 0; i < roots; i ++ ) {

			const a = ( i + 0.5 ) / roots * Math.PI * 2 + ( R() - 0.5 ) * 0.5, l = 0.35 + R() * 0.4, pts = [];
			for ( let j = 0; j <= 5; j ++ ) {

				const t = j / 5, d = r * 0.9 + l * t, w = ( R() - 0.5 ) * 0.03;
				const px = x + Math.sin( a + w ) * d, pz = z + Math.cos( a + w ) * d;
				pts.push( V( px, ground( px, pz ) + r * 0.12 * Math.sin( Math.PI * Math.min( 1, t * 1.3 ) ) - t * t * r * 0.35, pz ) );

			}

			rod( k, pts, r * 0.28, r * 0.26, M.BARK, bc, 7, ( t ) => 1 - 0.75 * t );

		}

		collision.push( [ x, z, r * 1.1, r * 1.1 ] );
		taken.push( [ x - r * 1.2, x + r * 1.2, z - r * 1.2, z + r * 1.2 ] );
		return { topY };

	};

	for ( const [ x, z, r, h, fresh ] of [ [ - 3.4, 2.4, 0.27, 0.34, true ], [ 0.6, 3.9, 0.22, 0.28, true ], [ 3.2, 4.3, 0.31, 0.4, true ], [ - 7.3, 4.6, 0.24, 0.22, false ], [ 7.6, - 0.3, 0.29, 0.38, true ], [ 0.9, - 2.3, 0.2, 0.3, true ], [ - 3.7, - 0.4, 0.33, 0.45, false ], [ 6.3, 5.1, 0.19, 0.26, true ] ] ) stump( x, z, r, h, fresh, 2 + Math.floor( R() * 2 ) );

	// split billets: quarters and halves of 33 cm rounds, the bark on their backs; set down on
	// the ground (or `lift` above it), lying or stood on end
	const billet = ( x, z, lift, r, ang, stand, roll, yaw ) => {

		const len = 0.33;
		const sh = new THREE.Shape();
		sh.moveTo( 0, 0 ); sh.lineTo( r, 0 ); sh.absarc( 0, 0, r, 0, ang, false ); sh.lineTo( 0, 0 );
		const g = new THREE.ExtrudeGeometry( sh, { depth: len, bevelEnabled: false, curveSegments: 5 } );
		const m = new THREE.Matrix4().makeRotationY( yaw ).multiply( new THREE.Matrix4().makeRotationX( stand ? - Math.PI / 2 : 0 ) ).multiply( new THREE.Matrix4().makeRotationZ( roll ) ).multiply( new THREE.Matrix4().makeTranslation( - r * 0.3, - r * 0.3, - len / 2 ) );
		g.applyMatrix4( m );
		g.computeBoundingBox();
		const t = new THREE.Matrix4().makeTranslation( x, ground( x, z ) + lift - g.boundingBox.min.y - 0.01, z );
		g.applyMatrix4( t );
		const full = t.multiply( m );
		const pith = V( 0, 0, len / 2 ).applyMatrix4( full ), ax = V( 0, 0, 1 ).transformDirection( full );
		const [ barkSide, wood ] = splitBy( g, ( n, c ) => {

			const d = c.clone().sub( pith );
			d.addScaledVector( ax, - d.dot( ax ) );
			return Math.abs( n.dot( ax ) ) < 0.5 && d.length() > r * 0.8 && n.dot( d.normalize() ) > 0.5;

		} );
		if ( wood ) k.add( wood, M.LOG, freshC().multiplyScalar( 0.68 ), ax.toArray(), pith.toArray() );
		if ( barkSide ) k.add( barkSide, M.BARK, barkC(), ax.toArray(), pith.toArray() );

	};

	// --- the chopping block: a big stump, cut high, the axe standing in it; split billets thrown
	// down round it and a heap of them to one side, chips everywhere
	{

		const cx = 1.75, cz = 1.55;
		const s = stump( cx, cz, 0.34, 0.55, true, 3, false );
		// the axe: its bit sunk in the cut face, the helve rising away at 30 degrees
		const yaw = 2.4, rise = 0.52;
		const f = V( Math.sin( yaw ), 0, Math.cos( yaw ) );
		const hd = f.clone().multiplyScalar( Math.cos( rise ) ).add( V( 0, Math.sin( rise ), 0 ) );
		const bd = f.clone().multiplyScalar( Math.sin( rise ) ).add( V( 0, - Math.cos( rise ), 0 ) );
		const entry = V( cx + f.x * 0.06, 0, cz + f.z * 0.06 );
		entry.y = s.topY( entry.x, entry.z );
		const eye = entry.clone().addScaledVector( bd, - 0.14 );
		{

			// the head: poll, eye, and the bit flaring to its edge, thinning toward it
			const side = new THREE.Vector3().crossVectors( bd, hd ).normalize();
			const sh = new THREE.Shape();
			sh.moveTo( - 0.045, - 0.02 ); sh.lineTo( 0.03, - 0.028 ); sh.lineTo( 0.07, - 0.05 ); sh.quadraticCurveTo( 0.1, - 0.075, 0.175, - 0.07 );
			sh.lineTo( 0.18, 0.045 ); sh.quadraticCurveTo( 0.1, 0.045, 0.07, 0.028 ); sh.lineTo( 0.03, 0.028 ); sh.lineTo( - 0.045, 0.022 ); sh.lineTo( - 0.045, - 0.02 );
			const g = new THREE.ExtrudeGeometry( sh, { depth: 0.034, bevelEnabled: false, curveSegments: 4 } );
			g.translate( 0, 0, - 0.017 );
			const p = g.getAttribute( 'position' );
			for ( let i = 0; i < p.count; i ++ ) p.setZ( i, p.getZ( i ) * ( 1 - 0.8 * ss( 0.03, 0.18, p.getX( i ) ) ) );
			g.computeVertexNormals();
			// x along the bit, y along the helve, z across
			g.applyMatrix4( new THREE.Matrix4().makeBasis( bd, hd, side ).setPosition( eye ) );
			k.add( g, M.IRON, col( '#3b3834' ), bd.toArray(), eye.toArray() );

		}

		// the helve: ash, oval, swelling to a knob at its end
		const pts = [];
		for ( let i = 0; i <= 8; i ++ ) {

			const t = i / 8;
			pts.push( eye.clone().addScaledVector( hd, - 0.05 + t * 0.74 ).addScaledVector( bd, - Math.sin( t * Math.PI ) * 0.02 + t * t * 0.03 ) );

		}

		rod( k, pts, 0.017, 0.013, M.LOG, col( '#b39466' ), 8, ( t ) => t > 0.9 ? 1.35 : t < 0.1 ? 1.15 : 1 );
		// billets thrown down about it
		for ( let i = 0, n = 0; i < 30 && n < 10; i ++ ) {

			const a = R() * Math.PI * 2, d = 0.6 + R() * 0.9;
			const x = cx + Math.cos( a ) * d, z = cz + Math.sin( a ) * d;
			if ( ! free( x, z, 0.15 ) ) continue;
			n ++;
			billet( x, z, 0, 0.1 + R() * 0.05, Math.PI * ( R() < 0.6 ? 0.5 : 1 ), R() < 0.25, R() * 6, R() * 6 );

		}

		// the heap, split wood thrown together
		const hx = ( HEAP[ 0 ] + HEAP[ 1 ] ) / 2, hz = ( HEAP[ 2 ] + HEAP[ 3 ] ) / 2;
		for ( let i = 0; i < 28; i ++ ) {

			const a = R() * Math.PI * 2, d = Math.sqrt( R() ) * 0.55;
			const x = hx + Math.cos( a ) * d, z = hz + Math.sin( a ) * d * 0.8;
			billet( x, z, ( 0.55 - d ) * 0.5 * ( i / 28 ), 0.09 + R() * 0.05, Math.PI * ( R() < 0.6 ? 0.5 : 1 ), false, R() * 6, R() * 6 );

		}

		collision.push( [ hx, hz, 0.6, 0.5 ] );
		// chips, thickest nearest the block; a few of them bark
		for ( let i = 0; i < 80; i ++ ) {

			const a = R() * Math.PI * 2, d = 0.3 + Math.pow( R(), 1.8 ) * 1.4, x = cx + Math.cos( a ) * d, z = cz + Math.sin( a ) * d;
			if ( ! free( x, z, 0 ) && d > 0.6 ) continue;
			const c = R() < 0.15 ? barkC() : mixc( freshC(), '#a88a60', 0.25 + R() * 0.4 ).multiplyScalar( 0.62 );
			k.box( x, ground( x, z ) + 0.006, z, 0.02 + R() * 0.06, 0.008, 0.012 + R() * 0.03, M.LOG, c, { rot: [ ( R() - 0.5 ) * 0.4, R() * 6, ( R() - 0.5 ) * 0.4 ] } );

		}

	}

	// --- the sawbuck: two X frames of peeled poles, spiked where they cross, a rail along the
	// bottom and a brace; a log in the cradle and the bow saw standing in a cut half through it
	// (left in the middle of the job); the rounds already cut lying below in the sawdust
	{

		const sx = - 1.55, sz = 0.55;
		const peeled = () => mixc( '#a0805a', '#8a6a48', R() );
		const lo = - 0.05, hi = 1.02, zLo = 0.42, zHi = 0.34, tc = zLo / ( zLo + zHi );
		const frames = [ - 0.38, 0.38 ].map( ( dx, i ) => {

			const x = sx + dx, g = Math.min( ground( x, sz - 0.4 ), ground( x, sz + 0.4 ) );
			for ( const zs of [ - 1, 1 ] ) k.pole( V( x + zs * 0.03, g + lo, sz - zs * zLo ), V( x + zs * 0.03, g + hi, sz + zs * zHi ), 0.042, M.LOG, peeled(), i * 3 + zs );
			const cross = g + lo + ( hi - lo ) * tc;
			bolt( k, V( x + 0.075, cross, sz ), V( 1, 0, 0 ), 0.01 );
			return { x, g, cross };

		} );
		// the rail low down along one side, a brace from it up across
		k.pole( V( sx - 0.62, frames[ 0 ].g + 0.2, sz - 0.26 ), V( sx + 0.62, frames[ 1 ].g + 0.2, sz - 0.26 ), 0.035, M.LOG, peeled(), 7 );
		k.pole( V( frames[ 0 ].x, frames[ 0 ].g + 0.22, sz - 0.2 ), V( frames[ 1 ].x, frames[ 1 ].cross - 0.02, sz - 0.03 ), 0.032, M.LOG, peeled(), 8 );
		// the log: resting in both cradles, the long end run out past the right-hand frame
		const lr = 0.12;
		const sit = ( lr + 0.042 ) / Math.sin( Math.atan( zHi / ( ( hi - lo ) * ( 1 - tc ) ) ) );
		const y0 = frames[ 0 ].cross + sit, y1 = frames[ 1 ].cross + sit;
		const at = ( x ) => V( x, y0 + ( y1 - y0 ) * ( x - frames[ 0 ].x ) / ( frames[ 1 ].x - frames[ 0 ].x ), sz );
		const xa = sx - 0.95, xb = sx + 1.55;
		log( k, at( xa ), at( xb ), lr * 1.06, lr * 0.94, barkC(), freshC(), R, { lump: 0, bend: false } );
		// the cut: a dark kerf over the top of the log, the saw's blade down in it
		const kx = sx + 0.95, kc = at( kx ), kr = lr * ( 1.06 - 0.12 * ( kx - xa ) / ( xb - xa ) ) + 0.0015;
		for ( let i = 0; i < 6; i ++ ) {

			const a0 = - 1.2 + i / 6 * 2.4, a1 = - 1.2 + ( i + 1 ) / 6 * 2.4;
			const p0 = kc.clone().add( V( 0, Math.cos( a0 ) * kr, Math.sin( a0 ) * kr ) ), p1 = kc.clone().add( V( 0, Math.cos( a1 ) * kr, Math.sin( a1 ) * kr ) );
			beam( k, p0, p1, 0.005, 0.002, M.VOID, col( '#000000' ), { up: V( 0, Math.cos( ( a0 + a1 ) / 2 ), Math.sin( ( a0 + a1 ) / 2 ) ) } );

		}

		{

			// the saw's own frame: a along the blade (across the log), b up, leaning a little
			const tilt = 0.12;
			const A = V( 0, 0, 1 ), B = V( Math.sin( tilt ), Math.cos( tilt ), 0 );
			const base = V( kx, kc.y + lr - 0.045, sz );
			const S = ( a, b ) => base.clone().addScaledVector( A, a ).addScaledVector( B, b );
			// the blade, its teeth down in the wood
			beam( k, S( - 0.38, 0.012 ), S( 0.38, 0.012 ), 0.0015, 0.028, M.IRON, col( '#7d8387' ), { up: B } );
			// the bow: orange-painted steel tube, up from the lever at the heel, over, and down
			// to the pointed nose
			const bow = [ [ - 0.4, 0.0 ], [ - 0.415, 0.06 ], [ - 0.41, 0.13 ], [ - 0.37, 0.2 ], [ - 0.28, 0.245 ], [ - 0.1, 0.26 ], [ 0.08, 0.25 ], [ 0.24, 0.2 ], [ 0.34, 0.12 ], [ 0.39, 0.05 ], [ 0.405, 0.0 ] ];
			rod( k, bow.map( ( [ a, b ] ) => S( a, b + 0.012 ) ), 0.011, 0.013, M.PAINT, col( '#f0561c' ), 7 );
			// the tension lever along the heel, and the pins through the blade's ends
			beam( k, S( - 0.4, 0.0 ), S( - 0.43, 0.13 ), 0.022, 0.018, M.LEATHER, col( '#1f1c1a' ), { up: V( 1, 0, 0 ) } );
			for ( const a of [ - 0.385, 0.385 ] ) beam( k, S( a, 0.012 ).add( V( - 0.012, 0, 0 ) ), S( a, 0.012 ).add( V( 0.012, 0, 0 ) ), 0.006, 0.006, M.IRON, col( '#2a2826' ) );

		}

		// rounds already cut, lying in the sawdust below; one stood on end
		for ( let i = 0; i < 4; i ++ ) {

			const x = sx + 1.2 + R() * 0.7, z = sz + ( R() - 0.5 ) * 1.1, r = lr * ( 0.9 + R() * 0.1 ), g = ground( x, z );
			if ( i === 3 ) {

				log( k, V( x, g - 0.01, z ), V( x, g + 0.33, z ), r, r, barkC(), freshC(), R );
				continue;

			}

			const a = R() * Math.PI;
			log( k, V( x - Math.cos( a ) * 0.165, g + r * 0.95, z - Math.sin( a ) * 0.165 ), V( x + Math.cos( a ) * 0.165, g + r * 0.95, z + Math.sin( a ) * 0.165 ), r, r, barkC(), freshC(), R );

		}

		collision.push( [ sx + 0.3, sz, 1.35, 0.5 ] );

	}

	// --- the lean-to: four peeled posts dug in, a pole plate across the front and the back,
	// three rafters, and a roof of slabs laid bark up; slabs nailed across the back against the
	// weather. Inside, a bench of a half log on two rounds, a table of boards, and what the men
	// left on it.
	{

		const x0 = LX - LW / 2, x1 = LX + LW / 2, zF = LZ + LD / 2, zB = LZ - LD / 2;
		const gF = Math.max( ground( x0, zF ), ground( x1, zF ) ), gB = Math.max( ground( x0, zB ), ground( x1, zB ) );
		const yF = gF + LHF, yB = gB + LHB;
		const postC = () => mixc( '#8b7358', '#76614b', R() );
		for ( const [ x, z, top ] of [ [ x0, zF, yF ], [ x1, zF, yF ], [ x0, zB, yB ], [ x1, zB, yB ] ] ) {

			const g = ground( x, z );
			k.pole( V( x, g - 0.3, z ), V( x + ( R() - 0.5 ) * 0.04, top, z + ( R() - 0.5 ) * 0.04 ), 0.075, M.LOG, postC(), x * 3 + z );
			collision.push( [ x, z, 0.1, 0.1 ] );

		}

		const rp = 0.07, rr = 0.06;
		for ( const [ z, y ] of [ [ zF, yF ], [ zB, yB ] ] ) k.pole( V( x0 - 0.4, y + rp * 0.8, z ), V( x1 + 0.4, y + rp * 0.8, z + ( R() - 0.5 ) * 0.05 ), rp, M.BARK, barkC(), z );
		// rafters over the plates, running out past the front and the back
		const slope = ( yF - yB ) / ( zF - zB );
		const rafterY = ( z ) => yB + rp * 1.7 + rr + ( z - zB ) * slope;
		const zr0 = zB - 0.35, zr1 = zF + 0.5;
		for ( const x of [ x0 + 0.05, LX, x1 - 0.05 ] ) k.pole( V( x, rafterY( zr0 ), zr0 ), V( x + ( R() - 0.5 ) * 0.06, rafterY( zr1 ), zr1 ), rr, M.BARK, barkC(), x );
		// the roof slabs, side by side, overlapping a little
		{

			const p = Math.atan( slope ), len = ( zr1 - zr0 ) / Math.cos( p ) + 0.1;
			let x = x0 - 0.45;
			while ( x < x1 + 0.35 ) {

				const w = 0.2 + R() * 0.1, zc = ( zr0 + zr1 ) / 2 + ( R() - 0.5 ) * 0.1, yaw = ( R() - 0.5 ) * 0.03;
				const along = V( Math.sin( yaw ) * Math.cos( p ), Math.sin( p ), Math.cos( yaw ) * Math.cos( p ) ), out = V( 0, Math.cos( p ), - Math.sin( p ) );
				slab( k, V( x + w / 2, rafterY( zc ) + rr * 0.92, zc ), w, len + ( R() - 0.5 ) * 0.2, along, out, barkC().multiplyScalar( 0.85 ), sawnC() );
				x += w - 0.015;

			}

		}

		// the back: slabs across, nailed to the outside of the back posts, up to the hip
		for ( let i = 0; i < 4; i ++ ) slab( k, V( LX + ( R() - 0.5 ) * 0.1, gB + 0.15 + i * 0.22, zB - 0.08 ), 0.24, LW + 0.5 + ( R() - 0.5 ) * 0.2, V( 1, 0, 0 ), V( 0, 0, - 1 ), barkC(), sawnC().multiplyScalar( 0.8 ) );
		// the bench: a half log, flat side up, on two rounds
		const bz = zB + 0.42, gb = ground( LX, bz ), seatH = 0.34;
		for ( const dx of [ - 0.75, 0.75 ] ) log( k, V( LX + dx, ground( LX + dx, bz ) - 0.05, bz ), V( LX + dx, gb + seatH, bz ), 0.15, 0.15, barkC(), greyC(), R );
		{

			const w = 0.34, Rs = w * 0.85, h = Rs - Math.sqrt( Rs * Rs - w * w / 4 );
			slab( k, V( LX, gb + seatH + h - 0.005, bz ), w, 2.1, V( 1, 0, 0 ), V( 0, - 1, 0 ), barkC(), sawnC().multiplyScalar( 1.1 ) );

		}

		collision.push( [ LX, bz, 1.05, 0.2 ] );
		// the table: three boards on two battens, on four legs driven into the ground
		const tx = LX - 0.25, tz = LZ + 0.3, TH = 0.74, gt = ground( tx, tz );
		for ( const [ dx, dz ] of [ [ - 0.4, - 0.24 ], [ 0.4, - 0.24 ], [ - 0.4, 0.24 ], [ 0.4, 0.24 ] ] ) k.pole( V( tx + dx, ground( tx + dx, tz + dz ) - 0.2, tz + dz ), V( tx + dx, gt + TH - 0.05, tz + dz ), 0.035, M.LOG, postC(), dx * 7 + dz );
		for ( const dx of [ - 0.4, 0.4 ] ) k.box( tx + dx, gt + TH - 0.07, tz, 0.05, 0.05, 0.66, M.LOG, sawnC(), { axis: [ 0, 0, 1 ] } );
		for ( let i = 0; i < 3; i ++ ) k.box( tx + ( R() - 0.5 ) * 0.03, gt + TH - 0.025, tz - 0.21 + i * 0.21, 1.05, 0.035, 0.195, M.LOG, sawnC().multiplyScalar( 0.95 + 0.2 * R() ), { axis: [ 1, 0, 0 ], rot: [ 0, ( R() - 0.5 ) * 0.02, 0 ] } );
		collision.push( [ tx, tz, 0.55, 0.35 ] );
		const ty = gt + TH - 0.0075;
		// an orange forestry helmet, its mesh visor pushed up, the ear defenders out
		{

			const hx = tx - 0.2, hz = tz + 0.05;
			const shell = new THREE.SphereGeometry( 0.125, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2 );
			shell.scale( 1, 0.9, 1.15 );
			shell.translate( hx, ty + 0.05, hz );
			k.add( shell, M.LEATHER, col( '#e8651e' ), [ 0, 1, 0 ] );
			const rim = new THREE.CylinderGeometry( 0.132, 0.135, 0.05, 12 );
			rim.scale( 1, 1, 1.15 );
			rim.translate( hx, ty + 0.025, hz );
			k.add( rim, M.LEATHER, col( '#d85a18' ), [ 0, 1, 0 ] );
			for ( const s of [ - 1, 1 ] ) {

				const cup = new THREE.CylinderGeometry( 0.045, 0.045, 0.035, 10 );
				cup.rotateZ( Math.PI / 2 );
				cup.translate( hx + s * 0.15, ty + 0.05, hz + 0.01 );
				k.add( cup, M.LEATHER, col( '#2a2826' ), [ 1, 0, 0 ] );

			}

			k.box( hx, ty + 0.17, hz + 0.1, 0.24, 0.1, 0.008, M.IRON, col( '#3a3a38' ), { rot: [ - 0.9, 0, 0 ] } );

		}

		// a green thermos flask and its cup, an enamel mug
		{

			const fx = tx + 0.25, fz = tz - 0.12;
			const fl = new THREE.CylinderGeometry( 0.045, 0.045, 0.3, 12 );
			fl.translate( fx, ty + 0.15, fz );
			k.add( fl, M.IRON, col( '#46604a' ), [ 0, 1, 0 ] );
			const cap = new THREE.CylinderGeometry( 0.05, 0.047, 0.07, 12 );
			cap.translate( fx + 0.13, ty + 0.035, fz + 0.05 );
			k.add( cap, M.IRON, col( '#3a4c3c' ), [ 0, 1, 0 ] );
			const mug = new THREE.CylinderGeometry( 0.042, 0.04, 0.09, 12 );
			mug.translate( tx + 0.05, ty + 0.045, tz + 0.15 );
			k.add( mug, M.IRON, col( '#d9dcd6' ), [ 0, 1, 0 ] );
			const handle = new THREE.TorusGeometry( 0.025, 0.006, 5, 10, Math.PI );
			handle.rotateZ( - Math.PI / 2 );
			handle.translate( tx + 0.09, ty + 0.045, tz + 0.15 );
			k.add( handle, M.IRON, col( '#d9dcd6' ) );

		}

		// the fuel can under the bench: red for the petrol, black for the chain oil, one handle
		{

			const fx = LX + 0.35, fz = bz + 0.02, g = ground( fx, fz );
			k.box( fx, g + 0.14, fz, 0.2, 0.28, 0.13, M.LEATHER, col( '#b5281d' ), { round: 0.02 } );
			k.box( fx + 0.15, g + 0.12, fz, 0.1, 0.24, 0.13, M.LEATHER, col( '#23211f' ), { round: 0.02 } );
			k.box( fx + 0.05, g + 0.31, fz, 0.3, 0.025, 0.04, M.LEATHER, col( '#23211f' ) );
			for ( const dx of [ - 0.05, 0.16 ] ) {

				const c = new THREE.CylinderGeometry( 0.02, 0.02, 0.03, 8 );
				c.translate( fx + dx, g + 0.29, fz + 0.035 );
				k.add( c, M.LEATHER, col( dx < 0 ? '#e0b020' : '#23211f' ), [ 0, 1, 0 ] );

			}

		}

		// a cant hook leaning on the right front post: a pole with an iron hook swung out on it
		{

			const px = x1 - 0.12, pz = zF + 0.08, g = ground( px + 0.5, pz + 0.15 );
			const a = V( px + 0.5, g, pz + 0.18 ), b = V( px - 0.02, g + 1.25, pz + 0.02 );
			k.pole( a, b, 0.03, M.LOG, col( '#9a7c56' ), 4 );
			const dir = b.clone().sub( a ).normalize();
			const at = a.clone().addScaledVector( dir, 0.25 );
			beam( k, at.clone().addScaledVector( dir, - 0.06 ), at.clone().addScaledVector( dir, 0.06 ), 0.075, 0.075, M.IRON, col( '#34302c' ) );
			const hook = [];
			for ( let i = 0; i <= 6; i ++ ) {

				const t = i / 6, ang = t * 2.2;
				hook.push( at.clone().add( V( 0, 0, 0.04 ) ).addScaledVector( dir, Math.sin( ang ) * 0.2 ).add( V( 0, 0, ( 1 - Math.cos( ang ) ) * 0.16 ) ) );

			}

			rod( k, hook, 0.013, 0.013, M.IRON, col( '#34302c' ), 6, ( t ) => 1 - t * 0.6 );

		}

	}

	// --- the notice board by the trail: two squared posts, a panel of boards under a little
	// pent roof; an old notice gone grey on it, and the forestry notice (a part: it is read)
	{

		const bx = - 2.45, bz = 4.95, PW = 1.0, PH = 0.72;
		const g = Math.max( ground( bx - 0.45, bz ), ground( bx + 0.45, bz ) );
		const post = () => mixc( '#6c5a45', '#7c6a54', R() );
		const ry = g + 2.0;
		for ( const dx of [ - 0.45, 0.45 ] ) {

			const gg = ground( bx + dx, bz );
			k.box( bx + dx, ( gg - 0.4 + ry + 0.05 ) / 2, bz - 0.06, 0.1, ry + 0.05 - gg + 0.4, 0.1, M.LOG, post(), { axis: [ 0, 1, 0 ], round: 0.01 } );

		}

		const y0 = g + 1.05;
		for ( let i = 0; i < 4; i ++ ) k.box( bx, y0 + 0.09 + i * 0.18, bz, PW, 0.172, 0.022, M.LOG, mixc( '#7a6a58', '#8a7b68', R() ), { axis: [ 1, 0, 0 ] } );
		// a frame of battens round the panel
		for ( const dy of [ - 0.015, PH + 0.015 ] ) k.box( bx, y0 + dy, bz + 0.018, PW + 0.06, 0.035, 0.02, M.LOG, post(), { axis: [ 1, 0, 0 ] } );
		for ( const dx of [ - PW / 2 - 0.012, PW / 2 + 0.012 ] ) k.box( bx + dx, y0 + PH / 2, bz + 0.018, 0.035, PH + 0.065, 0.02, M.LOG, post(), { axis: [ 0, 1, 0 ] } );
		// the roof: boards sloping to the front, a strip of tar paper over them
		k.box( bx, ry + 0.07, bz + 0.03, PW + 0.35, 0.025, 0.42, M.LOG, post(), { rot: [ 0.35, 0, 0 ], axis: [ 1, 0, 0 ] } );
		k.box( bx, ry + 0.087, bz + 0.03, PW + 0.37, 0.006, 0.44, M.LEATHER, col( '#2b2a28' ), { rot: [ 0.35, 0, 0 ] } );
		// the old notice: sun-bleached, curling, a corner torn away; rusty pins
		k.box( bx + 0.27, y0 + 0.44, bz + 0.012, 0.21, 0.28, 0.002, M.LEATHER, col( '#b8b2a0' ), { rot: [ 0, 0, 0.05 ] } );
		k.box( bx + 0.33, y0 + 0.2, bz + 0.012, 0.09, 0.12, 0.002, M.LEATHER, col( '#a8a290' ), { rot: [ 0, 0, - 0.3 ] } );
		for ( const [ dx, dy ] of [ [ 0.18, 0.56 ], [ 0.37, 0.57 ] ] ) {

			const pin = new THREE.CylinderGeometry( 0.006, 0.006, 0.006, 6 );
			pin.rotateX( Math.PI / 2 );
			pin.translate( bx + dx, y0 + dy, bz + 0.016 );
			k.add( pin, M.IRON, col( '#5a3a24' ) );

		}

		// the forestry notice: a fresh sheet, four drawing pins
		{

			const n = new Kit( ground, k.ao.bind( k ) );
			const px = bx - 0.2, py = y0 + 0.4, pz = bz + 0.0125;
			n.box( px, py, pz, 0.3, 0.42, 0.002, M.LEATHER, col( '#f4f1e6' ), { rot: [ 0, 0, - 0.015 ] } );
			for ( const [ dx, dy ] of [ [ - 0.13, 0.19 ], [ 0.13, 0.19 ], [ - 0.13, - 0.19 ], [ 0.13, - 0.19 ] ] ) {

				const pin = new THREE.CylinderGeometry( 0.008, 0.008, 0.005, 8 );
				pin.rotateX( Math.PI / 2 );
				pin.translate( px + dx, py + dy, pz + 0.0035 );
				n.add( pin, M.LEATHER, col( dy > 0 ? '#c02a20' : '#2a50b0' ) );

			}

			parts.notice = n.build();
			notice = { centre: [ px, py, pz + 0.0011 ], normal: [ 0, 0, 1 ] };

		}

		collision.push( [ bx, bz - 0.04, 0.52, 0.1 ] );

	}

	// --- the plank stack: sawn spruce boards, 2.5 m, stacked to dry on three bearers with sticks
	// between the courses, a sheet of tar paper over the top held down with stones; one board
	// left lying on top (a part: it is taken)
	{

		const px = 4.35, pz = 0.95, PL = 2.5, T = 0.034;
		const bxs = [ px - 1.05, px, px + 1.05 ];
		// level on its bearers: squared timbers bedded in the ground, deeper where it falls away
		let top = - 1e9;
		for ( const x of bxs ) top = Math.max( top, ground( x, pz - 0.6 ), ground( x, pz + 0.6 ) );
		top += 0.09;
		for ( const x of bxs ) {

			const gmin = Math.min( ground( x, pz - 0.6 ), ground( x, pz + 0.6 ) ) - 0.06;
			k.box( x, ( gmin + top ) / 2, pz, 0.11, top - gmin, 1.3, M.LOG, greyC().multiplyScalar( 0.8 ), { axis: [ 0, 0, 1 ], round: 0.01 } );

		}

		const plankC = () => mixc( '#c6a97e', '#b39470', R() ).multiplyScalar( 0.88 + 0.15 * R() );
		let y = top;
		const layers = 6;
		for ( let L = 0; L < layers; L ++ ) {

			const ws = [ 0, 1, 2, 3 ].map( () => 0.2 + R() * 0.05 ), gap = 0.03;
			let z = pz - ( ws.reduce( ( s, w ) => s + w, 0 ) + gap * 3 ) / 2;
			for ( const w of ws ) {

				const c = L === layers - 1 ? plankC().multiplyScalar( 0.85 ) : plankC();
				k.box( px + ( R() - 0.5 ) * 0.06, y + T / 2, z + w / 2, PL + ( R() - 0.5 ) * 0.04, T, w, M.LOG, c, { axis: [ 1, 0, 0 ], rot: [ 0, ( R() - 0.5 ) * 0.01, 0 ] } );
				z += w + gap;

			}

			y += T;
			if ( L < layers - 1 ) {

				for ( const x of bxs ) k.box( x + ( R() - 0.5 ) * 0.06, y + 0.012, pz, 0.025, 0.024, 1.12, M.LOG, greyC(), { axis: [ 0, 0, 1 ] } );
				y += 0.024;

			}

		}

		// the tar paper: a sheet laid over, down the sides a little, rucked; both its faces
		{

			const sx0 = px - PL / 2 - 0.04, sx1 = px + PL / 2 + 0.04, drop = 0.16;
			const I = 18, J = 10, pos = [], idx = [], n = J + 1;
			const grid = [];
			for ( let i = 0; i <= I; i ++ ) for ( let j = 0; j <= J; j ++ ) {

				const x = sx0 + ( sx1 - sx0 ) * i / I, zz = pz + ( j / J * 2 - 1 ) * 0.62;
				const over = Math.min( 1, Math.max( 0, Math.abs( zz - pz ) - 0.5 ) / 0.12 );
				const yy = y + 0.004 + 0.006 * Math.sin( x * 7 + j ) * Math.sin( x * 3.1 ) - over * drop;
				const z = Math.abs( zz - pz ) > 0.5 ? pz + Math.sign( zz - pz ) * ( 0.512 + ( 1 - over ) * 0.02 ) : zz;
				grid.push( [ x, yy, z ] );

			}

			for ( const [ x, yy, z ] of grid ) pos.push( x, yy, z );
			for ( const [ x, yy, z ] of grid ) pos.push( x, yy - 0.003, z );
			const off = grid.length;
			for ( let i = 0; i < I; i ++ ) for ( let j = 0; j < J; j ++ ) {

				const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
				idx.push( a, b, c, b, d, c );
				idx.push( off + a, off + c, off + b, off + b, off + c, off + d );

			}

			k.add( mesh( pos, idx ), M.LEATHER, col( '#2c2b29' ), [ 1, 0, 0 ] );

		}

		// stones along it
		for ( const [ dx, dz, s ] of [ [ - 1.05, - 0.28, 0.13 ], [ - 0.35, 0.3, 0.11 ], [ 0.5, - 0.3, 0.12 ], [ 1.1, 0.25, 0.14 ] ] ) k.stone( px + dx, y + 0.004, pz + dz, s, s * 0.6, s * 0.9, mixc( '#6f6a61', '#57524b', R() ), R() * 40 );
		// the loose board, on top, a little askew
		{

			const b = new Kit( ground, k.ao.bind( k ) );
			const cx = px + 0.08, cy = y + 0.006 + T / 2, cz = pz - 0.02;
			b.box( cx, cy, cz, PL, T, 0.23, M.LOG, plankC().multiplyScalar( 1.02 ), { axis: [ 1, 0, 0 ], rot: [ 0, 0.05, 0 ] } );
			parts.plank = b.build();
			plank = [ cx, cy, cz ];

		}

		collision.push( [ px, pz, PL / 2 + 0.1, 0.62 ] );

	}

	// --- a brush pile of lopped branches at the edge, and a few lying about: crooked, tapering,
	// dead grey-brown, twigs standing off them
	{

		const dead = () => mixc( '#4f4236', '#665646', R() ).multiplyScalar( 0.85 + 0.25 * R() );
		const branch = ( p0, p1, r, c ) => {

			const d = p1.clone().sub( p0 ), pts = [], side = V( - d.z, 0, d.x ).normalize();
			const bow = ( R() - 0.5 ) * 0.12 * d.length(), ph = R() * 6;
			for ( let j = 0; j <= 4; j ++ ) {

				const t = j / 4;
				pts.push( p0.clone().addScaledVector( d, t ).addScaledVector( side, Math.sin( t * Math.PI ) * bow + Math.sin( t * 9 + ph ) * r * 0.8 ) );

			}

			rod( k, pts, r, r, M.BARK, c, 6, ( t ) => 1 - 0.65 * t );
			// twigs, in pairs, swept forward, the thicker the branch the more
			const n = Math.floor( d.length() * ( r > 0.02 ? 2.5 : 1.2 ) );
			for ( let j = 0; j < n; j ++ ) {

				const t = 0.2 + 0.75 * ( j + R() * 0.5 ) / n, q = p0.clone().addScaledVector( d, t ).addScaledVector( side, Math.sin( t * Math.PI ) * bow );
				const s = j % 2 ? 1 : - 1, l = ( 0.25 + R() * 0.35 ) * ( 1 - t * 0.5 );
				const dir = d.clone().normalize().multiplyScalar( 0.6 ).addScaledVector( side, s ).add( V( 0, ( R() - 0.3 ) * 0.8, 0 ) ).normalize();
				rod( k, [ q, q.clone().addScaledVector( dir, l * 0.5 ), q.clone().addScaledVector( dir, l ).add( V( 0, l * 0.1, 0 ) ) ], r * 0.35, r * 0.35, M.BARK, c, 4, ( u ) => 1 - 0.6 * u );

			}

		};

		const bx = ( BRUSH[ 0 ] + BRUSH[ 1 ] ) / 2, bz = ( BRUSH[ 2 ] + BRUSH[ 3 ] ) / 2;
		for ( let i = 0; i < 24; i ++ ) {

			const a = ( R() - 0.5 ) * 1.4 + ( i % 3 === 0 ? Math.PI / 2 : 0.3 ), l = 1.3 + R() * 1.5, r = 0.015 + R() * 0.02;
			const cx = bx + ( R() - 0.5 ) * 1.1, cz = bz + ( R() - 0.5 ) * 1.5;
			const h = Math.max( 0, 1 - Math.hypot( ( cx - bx ) / 0.8, ( cz - bz ) / 1.0 ) ) * 0.75 * ( 0.4 + 0.6 * i / 24 ) + 0.03;
			const p0 = V( cx - Math.cos( a ) * l / 2, 0, cz - Math.sin( a ) * l / 2 ), p1 = V( cx + Math.cos( a ) * l / 2, 0, cz + Math.sin( a ) * l / 2 );
			p0.y = ground( p0.x, p0.z ) + Math.max( 0.02, h - 0.25 * R() );
			p1.y = ground( p1.x, p1.z ) + Math.max( 0.02, h + 0.15 * R() );
			branch( p0, p1, r, dead() );

		}

		collision.push( [ bx, bz, 0.75, 0.9 ] );
		for ( let i = 0, n = 0; i < 40 && n < 6; i ++ ) {

			const x = ( R() - 0.5 ) * 14, z = ( R() - 0.5 ) * 9.5, a = R() * Math.PI, l = 0.7 + R() * 0.9;
			const x1 = x + Math.cos( a ) * l, z1 = z + Math.sin( a ) * l;
			if ( ! free( x, z, 0.2 ) || ! free( x1, z1, 0.2 ) || ! free( ( x + x1 ) / 2, ( z + z1 ) / 2, 0.2 ) ) continue;
			n ++;
			const p0 = V( x, 0, z ), p1 = V( x1, 0, z1 );
			p0.y = ground( p0.x, p0.z ) + 0.015; p1.y = ground( p1.x, p1.z ) + 0.03;
			branch( p0, p1, 0.01 + R() * 0.012, dead() );

		}

	}

	return { geometry: k.build(), parts, info: { notice, plank, collision } };

}

// ---------------------------------------------------------------------------
// the footbridge over the gully
// ---------------------------------------------------------------------------

// A footbridge of two log stringers across the gully, along z from -span/2 to +span/2, its deck
// 0.3 m above the ground at the ends. The middle planks are gone: parts.laid is them, laid
// back (new, pale) for when the gap is mended; broken halves of the old ones hang down between
// the stringers. Returns { geometry, parts: { laid }, info: { deckY, gap: [ z0, z1 ], ends,
// width, railX } }.
export function buildGullyBridge( ground, span = 7 ) {

	const R = rand( 4077 );
	const half = span / 2;
	const k = new Kit( ground, ( x, y, z, ny ) => ( ny < - 0.5 ? 0.55 : 1 ) * ( 0.55 + 0.45 * ss( - 0.05, 0.6, y - ground( x, z ) ) ) );
	const yA = ground( 0, - half ) + 0.3, yB = ground( 0, half ) + 0.3;
	const deckAt = ( z ) => yA + ( yB - yA ) * ( z + half ) / span;
	const deckY = deckAt( 0 );
	const DW = 1.4, SX = 0.5, T = 0.05, FLAT = 0.72, rS = 0.2;
	const logC = () => mixc( '#5c5a4e', '#4b4a40', R() ).multiplyScalar( 0.9 + 0.2 * R() );
	// the stringers, green with algae and moss on their shaded sides
	const mossC = () => mixc( logC(), '#43502f', 0.3 + 0.15 * R() );
	const endC = () => mixc( '#8a8272', '#9a917e', R() );
	const plankC = () => mixc( '#7c7466', '#948a7a', R() ).multiplyScalar( 0.88 + 0.22 * R() );
	const info = { deckY, width: DW };

	// --- the stringers: two spruce logs, peeled long ago and gone grey-green, hewn flat on top
	// to take the planks, bedded a little way into each bank
	const topAt = ( z ) => deckAt( z ) - T; // the stringers' flats
	const axisAt = ( z, r ) => topAt( z ) - r * FLAT;
	for ( const xs of [ - 1, 1 ] ) {

		const za = - half - 0.6, zb = half + 0.6, ra = rS * ( xs < 0 ? 1.05 : 0.95 ), rb = rS * ( xs < 0 ? 0.88 : 1.02 );
		log( k, V( xs * SX, axisAt( za, ra ), za ), V( xs * SX, axisAt( zb, rb ), zb ), ra, rb, mossC(), endC(), R, { seg: 12, flat: FLAT, bend: false, barkMat: M.LOG } );

	}

	// --- abutments: where the ground falls away into the gully, a dry-stone footing under a
	// sleeper log across, the stringers notched down on it; big stones about its foot, and a
	// flat stone for a step up at each end
	for ( const sgn of [ - 1, 1 ] ) {

		const zEnd = sgn * half, gEnd = ground( 0, zEnd );
		let zl = sgn * ( half - 1.0 );
		for ( let z = zEnd; Math.abs( z ) > 0.6; z -= sgn * 0.05 ) if ( Math.min( ground( - 0.6, z ), ground( 0.6, z ) ) < gEnd - 0.45 ) {

			zl = z;
			break;

		}

		const zs = zl + sgn * 0.45, rsl = 0.15;
		const sy = axisAt( zs, rS ) - rS - rsl + 0.04;
		log( k, V( - 1.0, sy, zs ), V( 1.0, sy + ( R() - 0.5 ) * 0.03, zs + ( R() - 0.5 ) * 0.08 ), rsl, rsl * 0.9, logC().multiplyScalar( 0.85 ), endC(), R, { barkMat: M.LOG, bend: false } );
		// the footing: from down the slope up under the sleeper, and back into the bank
		const za = zl - sgn * 0.35, zb = zl + sgn * 1.1, zc = ( za + zb ) / 2;
		let gmin = 1e9;
		for ( const x of [ - 0.9, 0, 0.9 ] ) for ( const z of [ za, zc, zb ] ) gmin = Math.min( gmin, ground( x, z ) );
		const top = sy - rsl * 0.6;
		k.box( 0, ( gmin - 0.4 + top ) / 2, zc, 2.0, top - gmin + 0.4, Math.abs( zb - za ), M.RUBBLE, '#858075', { rot: [ 0, ( R() - 0.5 ) * 0.05, 0 ] } );
		for ( let i = 0; i < 9; i ++ ) {

			const x = ( R() - 0.5 ) * 2.6, z = za - sgn * R() * 0.9, s = 0.2 + R() * 0.25;
			k.stone( x, ground( x, z ) - s * 0.25, z, s * 1.2, s * 0.8, s, mixc( '#8a857b', '#6c665c', R() ), R() * 40 );

		}

		const ze = zEnd + sgn * 0.35, ge = ground( 0, ze );
		k.box( ( R() - 0.5 ) * 0.1, ge + 0.05, ze, 0.9, 0.2, 0.42, M.STONE, mixc( '#8a857b', '#77716a', R() ), { rot: [ ( R() - 0.5 ) * 0.05, ( R() - 0.5 ) * 0.2, 0 ], round: 0.04 } );

	}

	// --- the deck: planks across, butted, each a little different; the middle ones gone
	const gc = ( R() - 0.5 ) * 0.3, gHalf = 0.6;
	const laid = new Kit( ground, k.ao.bind( k ) );
	let z0 = Infinity, z1 = - Infinity;
	const slope = Math.atan( ( yB - yA ) / span );
	const plank = ( kit, zc, w, c, { lift = 0, yaw = 0 } = {} ) => {

		const len = DW + ( R() - 0.5 ) * 0.08, cx = ( R() - 0.5 ) * 0.04;
		const g = new THREE.BoxGeometry( len, T, w - 0.012 );
		g.rotateX( - slope );
		g.rotateY( yaw );
		g.rotateZ( lift );
		g.translate( cx, deckAt( zc ) - T / 2 + ( R() - 0.5 ) * 0.006, zc );
		// (the deck shading wants each plank's centre and width)
		const p = g.getAttribute( 'position' ), cen = new Float32Array( p.count * 3 );
		for ( let i = 0; i < p.count; i ++ ) cen.set( [ cx, w, zc ], i * 3 );
		g.setAttribute( 'aCenter', new THREE.BufferAttribute( cen, 3 ) );
		kit.add( g, M.DECK, c, [ 1, 0, 0 ] );

	};

	{

		let z = - half;
		while ( z < half - 0.1 ) {

			const w = 0.2 + R() * 0.07, zc = z + w / 2;
			if ( Math.abs( zc - gc ) < gHalf ) {

				plank( laid, zc, w, mixc( '#c9ae86', '#b89c74', R() ), { yaw: ( R() - 0.5 ) * 0.02 } );
				z0 = Math.min( z0, z ); z1 = Math.max( z1, z + w );

			} else plank( k, zc, w, R() < 0.06 ? mixc( '#8a6c50', '#a0826a', R() ) : plankC(), { yaw: ( R() - 0.5 ) * 0.02, lift: R() < 0.08 ? ( R() - 0.5 ) * 0.03 : 0 } );
			z += w + 0.008 + R() * 0.008;

		}

	}

	info.gap = [ z0, z1 ];
	// rust stains where the nails were, on the stringers' flats in the gap
	for ( const xs of [ - 1, 1 ] ) for ( let z = z0 + 0.08 + R() * 0.1; z < z1 - 0.05; z += 0.3 + R() * 0.15 ) k.box( xs * SX + ( R() - 0.5 ) * 0.1, topAt( z ) + 0.001, z, 0.02, 0.002, 0.02, M.IRON, col( '#3a2618' ), { rot: [ 0, R(), 0 ] } );

	// --- the broken planks: rotted through at the stringers, the halves hanging by a nail or
	// two down into the gap, their ends splintered
	{

		// hinged at x (the inner edge of a stringer's flat, or down its inner side), swung down
		// toward the middle by ang
		const hang = ( zc, xs, ang, len, w, hx = xs * ( SX - rS * 0.62 ), drop = 0.006 ) => {

			const hy = topAt( zc ) - drop;
			const dir = V( - xs * Math.cos( ang ), - Math.sin( ang ), 0 ), nrm = V( - xs * Math.sin( ang ), Math.cos( ang ), 0 );
			const c = V( hx, hy, zc ).addScaledVector( dir, len / 2 ).addScaledVector( nrm, - T / 2 );
			const g = new THREE.BoxGeometry( len, T, w );
			g.rotateZ( xs < 0 ? - ang : ang );
			g.translate( c.x, c.y, c.z );
			k.add( g, M.LOG, plankC().multiplyScalar( 0.85 ), dir.toArray(), c.toArray() );
			const e = V( hx, hy, zc ).addScaledVector( dir, len ).addScaledVector( nrm, - T / 2 );
			for ( let i = 0; i < 4; i ++ ) {

				const a = e.clone().add( V( 0, 0, ( i / 3 - 0.5 ) * w * 0.8 ) ).addScaledVector( nrm, ( R() - 0.5 ) * T * 0.6 );
				const b = a.clone().addScaledVector( dir, 0.04 + R() * 0.08 ).add( V( ( R() - 0.5 ) * 0.02, ( R() - 0.5 ) * 0.02, ( R() - 0.5 ) * 0.02 ) );
				beam( k, a, b, 0.012 + R() * 0.012, 0.012, M.LOG, plankC().multiplyScalar( 1.1 ), { up: nrm } );

			}

		};

		hang( z0 + 0.12, - 1, 0.55, 0.34, 0.2 );
		hang( z0 + 0.12, 1, 0.75, 0.3, 0.19 );
		// one hanging straight down the inside of a stringer from a nail in its side
		hang( z1 - 0.13, 1, 1.45, 0.42, 0.22, SX - rS - 0.03, rS * FLAT + 0.02 );
		// and what fell: broken lengths of plank down on the floor of the gully, dark with wet
		let zb = 0, gb = Infinity;
		for ( let z = - half + 0.5; z < half - 0.5; z += 0.1 ) if ( ground( 0, z ) < gb ) { gb = ground( 0, z ); zb = z; }
		for ( const [ dx, dz, len, yaw ] of [ [ - 0.4, 0.25, 0.75, 0.5 ], [ 0.55, - 0.35, 0.55, - 0.9 ], [ 0.1, 0.55, 0.4, 1.9 ] ] ) {

			const x = dx, z = zb + dz, a = V( x - Math.cos( yaw ) * len / 2, 0, z + Math.sin( yaw ) * len / 2 ), b = V( x + Math.cos( yaw ) * len / 2, 0, z - Math.sin( yaw ) * len / 2 );
			a.y = ground( a.x, a.z ) + T / 2; b.y = ground( b.x, b.z ) + T / 2;
			beam( k, a, b, 0.2, T, M.LOG, plankC().multiplyScalar( 0.6 ), { round: 0.01 } );

		}

	}

	// --- the handrail on the +x side: squared posts bolted to the stringer's outer face, those
	// over the gully braced from a needle beam under the stringers; a peeled pole along the tops
	{

		const px = SX + rS + 0.06;
		const n = Math.max( 3, Math.round( span / 1.75 ) );
		const tops = [];
		for ( let i = 0; i <= n; i ++ ) {

			const z = - half + 0.25 + ( span - 0.5 ) * i / n;
			const gz = ground( px, z ), ax = axisAt( z, rS );
			const bottom = Math.max( gz - 0.35, ax - rS - 0.25 );
			const lean = Math.abs( z - gc ) < 0.7 ? 0.05 : ( R() - 0.5 ) * 0.02;
			const top = V( px + lean, deckAt( z ) + 1.0, z + ( R() - 0.5 ) * 0.02 );
			beam( k, V( px, bottom, z ), top, 0.1, 0.1, M.LOG, logC().multiplyScalar( 1.1 ), { up: V( 1, 0, 0 ), round: 0.012 } );
			bolt( k, V( px + 0.051, ax, z ), V( 1, 0, 0 ), 0.014 );
			tops.push( top );
			if ( gz < deckAt( z ) - 0.8 ) {

				const ny = ax - rS - 0.045;
				k.box( 0.25, ny, z + 0.1, 1.95, 0.09, 0.11, M.LOG, logC(), { axis: [ 1, 0, 0 ], round: 0.01 } );
				beam( k, V( 1.15, ny + 0.04, z + 0.1 ), V( px + 0.05, deckAt( z ) + 0.45, z + 0.02 ), 0.07, 0.07, M.LOG, logC(), { up: V( 0, 0, 1 ), round: 0.01 } );
				bolt( k, V( 1.15, ny, z + 0.156 ), V( 0, 0, 1 ), 0.012 );

			}

		}

		const a = tops[ 0 ].clone().add( V( 0.01, 0.06, - 0.25 ) ), b = tops[ tops.length - 1 ].clone().add( V( 0.01, 0.06, 0.25 ) );
		k.pole( a, b, 0.05, M.LOG, mixc( '#77705f', '#6a6454', R() ), 5 );
		info.railX = px;

	}

	info.ends = [ [ 0, yA, - half ], [ 0, yB, half ] ];
	return { geometry: k.build(), parts: { laid: laid.build() }, info };

}
