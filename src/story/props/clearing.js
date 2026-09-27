import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Kit, M, col, mixc } from './kit.js';
import { beam, bolt } from './jetty.js';

// The woodcutters' clearing in the Black Wood, and the footbridge over the gully beyond it.
// After photographs (mockups/refs/logging, mockups/refs/clearing, mockups/refs/gullybridge):
// spruce log piles (Holzpolter) beside forest roads in Tyrol and Saxony, the logs laid on two bearer logs and
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

	const segs = 22, rings = 5, pos = [], idx = [];
	pos.push( cx, ground( cx, cz ) + h + 0.03, cz );
	for ( let r = 1; r <= rings; r ++ ) for ( let i = 0; i < segs; i ++ ) {

		const a = i / segs * Math.PI * 2, f = r / rings;
		const wob = 1 + 0.2 * Math.sin( a * 3 + seed ) + 0.1 * Math.sin( a * 7 + seed * 2.3 ) + 0.04 * Math.sin( a * 13 + seed * 4 );
		const x = cx + Math.cos( a ) * rx * f * wob, z = cz + Math.sin( a ) * rz * f * wob;
		const lump = 0.9 + 0.2 * ( 0.5 + 0.5 * Math.sin( a * 4 + r * 1.3 + seed ) );
		pos.push( x, ground( x, z ) + ( r === rings ? - 0.03 : h * Math.pow( 1 - f * f, 1.5 ) * lump + 0.03 ), z );

	}

	for ( let i = 0; i < segs; i ++ ) idx.push( 0, 1 + ( i + 1 ) % segs, 1 + i );
	for ( let r = 0; r < rings - 1; r ++ ) for ( let i = 0; i < segs; i ++ ) {

		const a = 1 + r * segs + i, b = 1 + r * segs + ( i + 1 ) % segs, c = a + segs, d = b + segs;
		idx.push( a, b, c, b, d, c );

	}

	k.add( mesh( pos, idx ), M.END, col( color ) );

}

// ---------------------------------------------------------------------------
// noise; meshes coloured vertex by vertex
// ---------------------------------------------------------------------------

const hash2 = ( x, z ) => {

	const s = Math.sin( x * 127.1 + z * 311.7 ) * 43758.5453;
	return s - Math.floor( s );

};

// smooth value noise, -1..1
function vnoise( x, z ) {

	const xi = Math.floor( x ), zi = Math.floor( z ), xf = x - xi, zf = z - zi;
	const u = xf * xf * ( 3 - 2 * xf ), v = zf * zf * ( 3 - 2 * zf );
	const a = hash2( xi, zi ), b = hash2( xi + 1, zi ), c = hash2( xi, zi + 1 ), d = hash2( xi + 1, zi + 1 );
	return ( a + ( b - a ) * u + ( c - a ) * v + ( a - b - c + d ) * u * v ) * 2 - 1;

}

const fbm = ( x, z ) => vnoise( x, z ) * 0.55 + vnoise( x * 2.13 + 5.2, z * 2.13 - 1.7 ) * 0.3 + vnoise( x * 4.37 - 3.1, z * 4.37 + 7.7 ) * 0.15;

// turn each triangle of an index to face along want( centroid ) (a direction)
function orient( pos, idx, want ) {

	const a = V( 0, 0, 0 ), b = V( 0, 0, 0 ), c = V( 0, 0, 0 ), n = V( 0, 0, 0 ), m = V( 0, 0, 0 ), ctr = V( 0, 0, 0 );
	for ( let i = 0; i < idx.length; i += 3 ) {

		a.fromArray( pos, idx[ i ] * 3 ); b.fromArray( pos, idx[ i + 1 ] * 3 ); c.fromArray( pos, idx[ i + 2 ] * 3 );
		n.subVectors( b, a ).cross( m.subVectors( c, a ) );
		ctr.copy( a ).add( b ).add( c ).multiplyScalar( 1 / 3 );
		if ( n.dot( want( ctr ) ) < 0 ) {

			const t = idx[ i + 1 ];
			idx[ i + 1 ] = idx[ i + 2 ];
			idx[ i + 2 ] = t;

		}

	}

}

const UPWARD = () => V( 0, 1, 0 );

// a mesh with a colour at each vertex (the kit keeps them when it is given a null colour)
function cmesh( pos, idx, cols ) {

	const g = mesh( pos, idx );
	g.setAttribute( 'color', new THREE.Float32BufferAttribute( cols, 3 ) );
	return g;

}

// the ground's own skin over the working floor: a grid draped on the terrain a little above it,
// coloured by paint( x, z, cover ), sinking under the forest floor where cover( x, z ) falls to
// nothing so that its edge is the terrain's own ragged line
function drape( k, ground, { x0, x1, z0, z1, step, cover, paint, lift = 0.022 } ) {

	const nx = Math.round( ( x1 - x0 ) / step ), nz = Math.round( ( z1 - z0 ) / step ), W = nx + 1;
	const cv = new Float32Array( W * ( nz + 1 ) );
	for ( let j = 0; j <= nz; j ++ ) for ( let i = 0; i <= nx; i ++ ) cv[ j * W + i ] = cover( x0 + i * step, z0 + j * step );
	const id = new Int32Array( W * ( nz + 1 ) ).fill( - 1 ), pos = [], cols = [], idx = [];
	const vert = ( i, j ) => {

		const o = j * W + i;
		if ( id[ o ] < 0 ) {

			const x = x0 + i * step, z = z0 + j * step, c = cv[ o ];
			id[ o ] = pos.length / 3;
			pos.push( x, ground( x, z ) - 0.05 + ( lift + 0.05 ) * ss( 0, 0.2, c ), z );
			const p = paint( x, z, c );
			cols.push( p.r, p.g, p.b );

		}

		return id[ o ];

	};

	for ( let j = 0; j < nz; j ++ ) for ( let i = 0; i < nx; i ++ ) {

		if ( Math.max( cv[ j * W + i ], cv[ j * W + i + 1 ], cv[ ( j + 1 ) * W + i ], cv[ ( j + 1 ) * W + i + 1 ] ) <= 0 ) continue;
		const a = vert( i, j ), b = vert( i + 1, j ), c = vert( i, j + 1 ), d = vert( i + 1, j + 1 );
		if ( ( i + j ) & 1 ) idx.push( a, c, b, b, c, d ); else idx.push( a, c, d, a, d, b );

	}

	orient( pos, idx, UPWARD );
	const g = cmesh( pos, idx, cols ), nr = g.getAttribute( 'normal' );
	for ( let i = 0; i < nr.count; i ++ ) {

		const x = pos[ i * 3 ], z = pos[ i * 3 + 2 ];
		const nv = V( nr.getX( i ) + 0.16 * vnoise( x * 1.9 + 11, z * 1.9 ), nr.getY( i ), nr.getZ( i ) + 0.16 * vnoise( x * 1.9 - 4, z * 1.9 + 9 ) ).normalize();
		nr.setXYZ( i, nv.x, nv.y, nv.z );

	}

	k.add( g, M.END, null, [ 1, 0, 0 ] );

}

// a path's curve (xz points), sampled every `step`: its points, length and count
function trackCurve( pts, step ) {

	const curve = new THREE.CatmullRomCurve3( pts.map( ( [ x, z ] ) => V( x, 0, z ) ), false, 'centripetal' );
	const L = curve.getLength(), n = Math.max( 2, Math.round( L / step ) );
	return { S: curve.getSpacedPoints( n ), L, n };

}

// Tyre ruts along a path of a rear axle's middle: a rut under each wheel, `half` out either side
// (or one broad scrape down the middle, half 0: where logs were dragged). Each: the mud pushed up
// in a lip along both sides, the floor between wet and dark, printed across with the lugs'
// chevrons (tread); it rises out of the ground where the path begins and ends (fade: [ at the
// start, at the end ]). under( x, z ): the floor's colour there, for its edges. Returns the
// wheels' paths ( x, z ).
function tracks( k, ground, pts, { half = 0.82, w = 0.42, step = 0.09, tread = true, lift = 0, fade = [ true, true ], under, puddles = [], tone = () => 1 } ) {

	const { S, L, n } = trackCurve( pts, step );
	const U = [ - 0.81, - 0.64, - 0.46, - 0.23, 0, 0.23, 0.46, 0.64, 0.81 ].map( ( u ) => u * w );
	const H = half > 0 ? [ - 0.016, 0.052, 0.032, 0.028, 0.028, 0.028, 0.032, 0.052, - 0.016 ] : [ - 0.016, 0.042, 0.03, 0.028, 0.028, 0.028, 0.03, 0.042, - 0.016 ];
	const E = U.length - 1, LIP = [ 1, E - 1 ];
	const ridge = [ col( '#6a4d31' ), col( '#4d3826' ) ], wall = col( '#35271b' ), floor = col( '#221811' ), lugC = col( '#4a3624' );
	const wheels = [];
	const tmp = new THREE.Color();
	for ( const side of half > 0 ? [ - 1, 1 ] : [ 0 ] ) {

		const pos = [], cols = [], idx = [];
		for ( let i = 0; i <= n; i ++ ) {

			const p = S[ i ], t = S[ Math.min( n, i + 1 ) ].clone().sub( S[ Math.max( 0, i - 1 ) ] ).normalize();
			const nx = - t.z, nz = t.x, s = i / n * L;
			const f = ( fade[ 0 ] ? ss( 0, 1.1, s ) : 1 ) * ( fade[ 1 ] ? ss( 0, 1.1, L - s ) : 1 );
			const cx = p.x + nx * half * side, cz = p.z + nz * half * side;
			wheels.push( [ cx, cz ] );
			for ( let j = 0; j < U.length; j ++ ) {

				const x = cx + nx * U[ j ], z = cz + nz * U[ j ];
				let h = H[ j ];
				// (the lips: the mud squeezed out, in lumps, broken here and there)
				if ( LIP.includes( j ) ) h = Math.max( 0.03, h + 0.026 * vnoise( x * 3.3, z * 3.3 ) + 0.012 * vnoise( x * 11, z * 11 ) - 0.02 * Math.max( 0, vnoise( x * 0.9 + 4, z * 0.9 ) ) );
				// the lugs' prints: bars across the floor, raked back from its middle
				const lug = tread && j >= 2 && j <= E - 2 && ( ( s + Math.abs( U[ j ] ) * 1.1 ) / 0.26 ) % 1 < 0.42 ? 1 : 0;
				h += lug * 0.01;
				pos.push( x, ground( x, z ) + lift - 0.02 + ( h + 0.02 ) * f, z );
				if ( j === 0 || j === E ) tmp.copy( under( x, z ) );
				else if ( LIP.includes( j ) ) tmp.copy( ridge[ 0 ] ).lerp( ridge[ 1 ], 0.5 + 0.5 * vnoise( x * 3.1 + 2, z * 3.1 ) );
				else if ( j === 2 || j === E - 2 ) tmp.copy( lug ? lugC : wall );
				else tmp.copy( lug ? lugC : floor ).lerp( wall, 0.25 * Math.max( 0, vnoise( x * 2, z * 2 ) ) );
				tmp.multiplyScalar( ( 0.9 + 0.2 * hash2( i * 3 + j, side * 7 + 1 ) ) * ( j === 0 || j === E ? 1 : tone( x, z ) ) );
				if ( f < 1 && j > 0 && j < E ) tmp.lerp( under( x, z ), 1 - f );
				cols.push( tmp.r, tmp.g, tmp.b );

			}

		}

		const m = U.length;
		for ( let i = 0; i < n; i ++ ) for ( let j = 0; j < m - 1; j ++ ) {

			const a = i * m + j, b = a + 1, c = a + m, d = c + 1;
			idx.push( a, c, b, b, c, d );

		}

		orient( pos, idx, UPWARD );
		k.add( cmesh( pos, idx, cols ), M.END, null, [ 1, 0, 0 ] );

	}

	// standing water in the ruts' floors, here and there ( [ from, to ] in metres along): dark,
	// lying over the printed bars, tapering out at its ends
	for ( const [ s0, s1 ] of puddles ) for ( const side of half > 0 ? [ - 1, 1 ] : [ 0 ] ) {

		const i0 = Math.round( s0 / L * n ), i1 = Math.min( n, Math.round( s1 / L * n ) ), rows = [];
		for ( let i = i0; i <= i1; i ++ ) {

			const [ cx, cz ] = wheels[ ( side > 0 ? n + 1 : 0 ) + i ];
			const t = S[ Math.min( n, i + 1 ) ].clone().sub( S[ Math.max( 0, i - 1 ) ] ).normalize();
			const q = ( i - i0 ) / Math.max( 1, i1 - i0 ), wd = w * 0.34 * Math.pow( Math.sin( q * Math.PI ), 0.4 ) * ( 0.85 + 0.15 * vnoise( cx * 6, cz * 6 ) );
			const y = ground( cx, cz ) + lift + 0.043;
			rows.push( [ [ cx + t.z * wd, y, cz - t.x * wd ], [ cx - t.z * wd, y, cz + t.x * wd ] ] );

		}

		water( k, rows );

	}

	return wheels;

}

// still water: dark, a sheen of the sky on it at a low angle; over rows of [ left, right ]
// points ( x, y, z ), or a fan of rim points round a middle, flat at y = lvl
const WATER = '#1c2023';
function water( k, rows, lvl = 0 ) {

	const pos = [], idx = [];
	if ( typeof rows[ 0 ][ 0 ] === 'number' ) {

		let cx = 0, cz = 0;
		for ( const [ x, z ] of rows ) { cx += x / rows.length; cz += z / rows.length; }
		pos.push( cx, lvl, cz );
		for ( const [ x, z ] of rows ) pos.push( x, lvl, z );
		for ( let i = 0; i < rows.length; i ++ ) idx.push( 0, 1 + i, 1 + ( i + 1 ) % rows.length );

	} else {

		for ( const [ a, b ] of rows ) pos.push( ...a, ...b );
		for ( let i = 0; i < rows.length - 1; i ++ ) idx.push( i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2 );

	}

	orient( pos, idx, UPWARD );
	k.add( mesh( pos, idx ), M.LEATHER, col( WATER ), [ 1, 0, 0 ] );

}

// a pool standing in a hollow of trodden mud: its rim ragged, the water flat, the mud round it
// sloping down to the floor
function pool( k, ground, cx, cz, rx, rz, seed ) {

	const n = 18, rim = [];
	for ( let i = 0; i < n; i ++ ) {

		const a = i / n * Math.PI * 2, r = 1 + 0.16 * Math.sin( a * 3 + seed ) + 0.09 * Math.sin( a * 5 + seed * 2 );
		rim.push( [ cx + Math.cos( a ) * rx * r, cz + Math.sin( a ) * rz * r ] );

	}

	const lvl = Math.max( ...rim.map( ( [ x, z ] ) => ground( x, z ) ) ) + 0.03;
	water( k, rim, lvl );
	// the lip of mud round it
	const pos = [], cols = [], idx = [], wet = col( '#2a2018' ), mud = col( '#3f2f21' );
	for ( const [ x, z ] of rim ) {

		pos.push( x, lvl - 0.004, z );
		cols.push( wet.r, wet.g, wet.b );
		const ox = cx + ( x - cx ) * 1.45, oz = cz + ( z - cz ) * 1.45;
		pos.push( ox, ground( ox, oz ) - 0.02, oz );
		cols.push( mud.r, mud.g, mud.b );

	}

	for ( let i = 0; i < n; i ++ ) {

		const a = i * 2, b = ( ( i + 1 ) % n ) * 2;
		idx.push( a, a + 1, b, b, a + 1, b + 1 );

	}

	orient( pos, idx, UPWARD );
	k.add( cmesh( pos, idx, cols ), M.END, null, [ 1, 0, 0 ] );

}

// a spray of spruce twigs: a spine from p along dir, len long, its needles standing out either
// side in teeth raked forward (w across at the base, narrowing to the tip), the gaps between them
// open; turned to face up. The bark shader's furrows run across it (its grain is across) and read
// as the needles.
function frond( k, p, dir, len, w, color, tilt = 0 ) {

	const d = dir.clone().normalize();
	let side = new THREE.Vector3().crossVectors( V( 0, 1, 0 ), d );
	if ( side.lengthSq() < 1e-4 ) side = V( 1, 0, 0 );
	side.normalize().applyAxisAngle( d, tilt );
	const nrm = new THREE.Vector3().crossVectors( d, side ).normalize();
	if ( nrm.y < 0 ) nrm.negate();
	const J = 5, pos = [], idx = [];
	for ( let j = 0; j <= J; j ++ ) {

		const t = j / J, c = p.clone().addScaledVector( d, len * t ).addScaledVector( nrm, 0.01 * ( 1 - t ) - len * 0.1 * t * t );
		const hw = w * 0.5 * ( 1 - 0.7 * t ) * ( j === 0 ? 0.6 : 1 ), f = c.clone().addScaledVector( d, len * 0.13 ).addScaledVector( nrm, - 0.012 );
		pos.push( ...c.toArray(), ...f.clone().addScaledVector( side, hw ).toArray(), ...f.clone().addScaledVector( side, - hw ).toArray() );

	}

	for ( let j = 0; j < J; j ++ ) {

		const a = j * 3, b = a + 3;
		idx.push( a, a + 1, b, a, b, a + 2 );

	}

	orient( pos, idx, () => nrm );
	k.add( mesh( pos, idx ), M.BARK, color, side.toArray(), p.toArray() );

}

// a lopped spruce branch: a crooked grey stick, its twigs in flat sprays either side, shorter
// toward its tip, and one on out beyond it
function spruceBranch( k, R, p0, p1, r, barkCol, needleCol ) {

	const d = p1.clone().sub( p0 ), len = d.length(), dn = d.clone().normalize();
	const side = new THREE.Vector3().crossVectors( V( 0, 1, 0 ), dn ).normalize();
	const bow = ( R() - 0.5 ) * 0.1 * len;
	const at = ( t ) => p0.clone().addScaledVector( d, t ).addScaledVector( side, Math.sin( t * Math.PI ) * bow ).add( V( 0, Math.sin( t * Math.PI ) * 0.03 * len, 0 ) );
	rod( k, [ 0, 1 / 3, 2 / 3, 1 ].map( at ), r, r, M.BARK, barkCol, 5, ( t ) => 1 - 0.7 * t );
	const nf = 5 + Math.floor( len * 5 );
	for ( let j = 0; j < nf; j ++ ) {

		const t = 0.08 + 0.9 * ( j + 0.4 * R() ) / nf;
		const a = ( j % 2 ? 1 : - 1 ) * ( 0.45 + R() * 0.65 );
		const fd = dn.clone().applyAxisAngle( V( 0, 1, 0 ), a );
		fd.y += ( R() - 0.3 ) * 0.8;
		frond( k, at( t ), fd, ( 0.24 + 0.24 * R() ) * ( 1 - 0.4 * t ) * Math.min( 1, 0.5 + len / 2 ), 0.13 + 0.08 * R(), needleCol.clone().multiplyScalar( 0.8 + 0.35 * R() ), ( R() - 0.5 ) * 1.6 );

	}

	frond( k, p1.clone(), dn.clone().add( V( 0, 0.15, 0 ) ), 0.3 + 0.15 * R(), 0.15, needleCol, ( R() - 0.5 ) * 0.8 );

}

// ---------------------------------------------------------------------------
// the woodcutters' clearing
// ---------------------------------------------------------------------------

// the lean-to: its middle, its width (x) and depth (z), its eaves' heights front and back
const LX = 6.3, LZ = - 4.55, LW = 3.1, LD = 2.1, LHF = 2.15, LHB = 1.5;
// The trail cuts across the clearing's front-left corner (its samples in this frame run from
// ( 15, 23 ) by ( 0.6, 11.5 ) to ( -12, 2.5 )): a point on its line, and the normal into the
// clearing. Nothing stands within a metre and a half of it; the skid track comes in off it there.
const TRAIL = [ 0.6, 11.5, 0.584, - 0.812 ];
const trailD = ( x, z ) => ( x - TRAIL[ 0 ] ) * TRAIL[ 2 ] + ( z - TRAIL[ 1 ] ) * TRAIL[ 3 ];
// the tractor: its rear axle's middle, and its heading (0: facing the trail)
const TRX = 2.4, TRZ = - 3.2, TRYAW = 0.1;
// the tractor's ruts (paths of its rear axle's middle): in off the trail and round through the
// yard; then backed up to the edge of the wood where it stands; and an older track, out and
// back, driven over since. And the scrape where the stems were winched in behind it.
const PASSES = [
	{ pts: [ [ - 9.3, 5.3 ], [ - 6.2, 3.65 ], [ - 2.6, 1.95 ], [ 1.2, 1.35 ], [ 4.4, 0.9 ] ], lift: 0.006, step: 0.1, fade: [ true, false ], puddles: [ [ 2.2, 3.4 ], [ 5.6, 6.3 ] ] },
	{ pts: [ [ 4.4, 0.9 ], [ 3.6, - 0.45 ], [ 2.75, - 1.9 ], [ 2.4, - 3.2 ] ], lift: 0.012, step: 0.1, fade: [ false, false ] },
	{ pts: [ [ 2.6, - 2.2 ], [ 2.25, - 0.8 ], [ 0.9, 0.95 ], [ - 1.7, 2.4 ], [ - 4.7, 3.5 ], [ - 7.3, 4.7 ], [ - 9.7, 5.6 ] ], lift: 0, tread: false, step: 0.16, puddles: [ [ 7.6, 8.5 ] ] },
	{ pts: [ [ 2.35, - 4.3 ], [ 2.25, - 5.6 ], [ 2.05, - 7.0 ] ], half: 0, w: 0.62, lift: 0.003, tread: false, step: 0.14, fade: [ false, true ] },
];

// About 17 m by 12 m. Returns { geometry, parts: { notice, plank }, info: { notice: { centre,
// normal }, plank: centre, collision: [ [ cx, cz, halfX, halfZ ], ... ] } }.
//
// After photographs of logging in the Alps and the Mittelgebirge (mockups/refs/logging): the
// spruce sawlogs piled beside the forest road on two bearers, their ends pale, sprayed with the
// pile's number and a stripe (Tyrol, Saxony); a small farm-forest landing where a tractor with a
// three-point winch skids the stems in, one still out in the trees on the rope; the ground
// between churned by its tyres into ruts with water standing in them, strewn with sawdust, chips
// and bark, the brash (the lopped branches, still green) heaped at the edges; a spruce the storm
// threw, its root plate stood up on edge (Windwurf).
export function buildClearing( ground ) {

	const R = rand( 1994 );
	// occlusion: darker near the ground, under the lean-to's roof, and down inside the piles
	const piles = [];
	const k = new Kit( ground, ( x, y, z, ny ) => {

		const g = ground( x, z );
		let a = ( ny < - 0.5 ? 0.6 : 1 ) * ( 0.62 + 0.38 * ss( - 0.05, 0.5, y - g ) );
		if ( Math.abs( x - LX ) < LW / 2 + 0.25 && Math.abs( z - LZ ) < LD / 2 + 0.2 && y < g + LHF ) a *= 0.7;
		for ( const p of piles ) if ( x > p[ 0 ] && x < p[ 1 ] && z > p[ 2 ] && z < p[ 3 ] && y < p[ 4 ] ) a *= 0.8;
		return a;

	} );
	// The working floor: its outline, ragged, kept back from the trail.
	const coverAt = ( x, z ) => {

		const q = Math.pow( Math.pow( Math.abs( x ) / 8.75, 4 ) + Math.pow( Math.abs( z ) / 6.2, 4 ), 0.25 ) + 0.08 * fbm( x * 0.45 + 3, z * 0.45 - 2 ) + 0.035 * vnoise( x * 2.2, z * 2.2 );
		return ( 1 - ss( 0.82, 1.0, q ) ) * ss( 1.0, 2.0, trailD( x, z ) + 0.35 * vnoise( x * 1.1, z * 1.1 ) );

	};

	// What lies on the floor is drawn in plain colours (the end-grain kind: no pattern of its
	// own, rough), its occlusion held down to about the forest floor's round it so that it does
	// not glow against it at dusk; the darkness in under things is in its colours (shade: [ x0,
	// x1, z0, z1, how much darker, how far it reaches ]).
	const shade = [];
	const shadeAt = ( x, z ) => {

		let a = 1;
		for ( const [ x0, x1, z0, z1, d, m ] of shade ) a = Math.min( a, 1 - d * ( 1 - ss( 0, m, Math.hypot( Math.max( x0 - x, 0, x - x1 ), Math.max( z0 - z, 0, z - z1 ) ) ) ) );
		return a;

	};

	const gk = new Kit( ground, ( x, y, z ) => 0.5 - 0.12 * ( 1 - ss( 0.2, 0.8, coverAt( x, z ) ) ) );
	const parts = {}, collision = [];
	let notice = null, plank = null;
	// places taken, kept clear of scattered things: [ x0, x1, z0, z1 ]
	const taken = [];
	const free = ( x, z, m = 0.1 ) => ! taken.some( ( t ) => x > t[ 0 ] - m && x < t[ 1 ] + m && z > t[ 2 ] - m && z < t[ 3 ] + m ) && trailD( x, z ) > 1.4;
	// the floor's marks: sawdust ( x, z, r, strength ), wet earth ( x, z, r ), heaps of sawdust and
	// chips, drawn at the end
	const dust = [], wetAt = [], heaps = [], chipsAt = [];
	// spruce bark, grey-brown, redder where it is fresh
	const barkC = () => mixc( R() < 0.35 ? '#686055' : '#6e5443', '#7c6452', R() ).multiplyScalar( 0.85 + 0.25 * R() );
	const freshC = () => mixc( '#edd6a8', '#e2c08b', R() ).multiplyScalar( 0.95 + 0.17 * R() );
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
		shade.push( [ ...ext, 0.4, 0.6 ] );
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

		// bark stripped off in the skidding, lying about the front, curled; sawdust where the
		// logs were cut to length before they were piled
		for ( let i = 0; i < 6; i ++ ) {

			const p = P( front * ( len / 2 + 0.25 + R() * 0.9 ), ( R() - 0.5 ) * W * 1.2, 0 );
			p.y = ground( p.x, p.z ) + 0.03;
			const a = R() * Math.PI, up = R() < 0.7;
			slab( k, p, 0.07 + R() * 0.06, 0.15 + R() * 0.25, V( Math.cos( a ), 0, Math.sin( a ) ), V( 0, up ? 1 : - 1, 0 ), barkC().multiplyScalar( 1.3 ), mixc( '#b4946e', '#9a7a5a', R() ) );

		}

		const fc = P( front * ( len / 2 + 0.7 ), 0, 0 );
		dust.push( [ fc.x, fc.z, W * 0.45, 0.55 ] );
		const fs = P( front * ( len / 2 + 0.45 ), W * ( R() - 0.5 ) * 0.6, 0 );
		heaps.push( [ fs.x, fs.z, 0.34, 0.28, 0.06, '#b99c6c', R() * 9 ] );

	};

	polter( { cx: - 5.0, cz: - 2.6, alongX: false, len: 4.4, n0: 8, rows: 6, rMin: 0.11, rMax: 0.25, front: 1, number: '27', paint: ORANGE, paint2: BLUE } );
	polter( { cx: - 0.9, cz: - 4.45, alongX: false, len: 3.4, n0: 6, rows: 4, rMin: 0.11, rMax: 0.21, front: 1, number: '28', paint: ORANGE, paint2: WHITE } );

	// the other places, so that the scattered things keep off them
	const LEAN = [ LX - LW / 2 - 0.5, LX + LW / 2 + 0.5, LZ - LD / 2 - 0.3, LZ + LD / 2 + 0.6 ];
	const STACK = [ 0.5, 3.3, 2.95, 4.45 ], NOTICE = [ - 3.0, - 1.9, 4.7, 5.2 ], BUCK = [ 4.85, 7.95, - 2.1, - 0.85 ];
	const BLOCK = [ 4.8, 5.8, 1.6, 2.6 ], HEAP = [ 6.0, 7.2, 2.7, 3.7 ], TRACT = [ 1.0, 3.8, - 4.75, 0.55 ], STEM = [ - 2.95, 1.35, - 2.0, - 0.6 ];
	const WIND = [ - 9.5, - 6.7, - 4.2, - 0.4 ];
	taken.push( LEAN, STACK, NOTICE, BUCK, BLOCK, HEAP, TRACT, STEM, WIND );
	shade.push( [ TRACT[ 0 ] + 0.3, TRACT[ 1 ] - 0.3, TRACT[ 2 ] + 0.4, TRACT[ 3 ] - 0.6, 0.45, 0.5 ] );
	shade.push( [ LX - LW / 2, LX + LW / 2, LZ - LD / 2, LZ + LD / 2, 0.35, 0.6 ] );
	shade.push( [ ...STACK, 0.35, 0.3 ] );

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
		// the sawdust of the felling cut, sprayed out round the foot
		if ( fresh ) dust.push( [ x + ( R() - 0.5 ) * r, z + ( R() - 0.5 ) * r, r * 3.2, 0.5 ] );
		return { topY };

	};

	for ( const [ x, z, r, h, fresh ] of [ [ - 3.7, 4.9, 0.25, 0.3, true ], [ 0.1, 5.55, 0.22, 0.24, false ], [ 4.4, 4.85, 0.3, 0.38, true ], [ 8.2, 4.3, 0.2, 0.28, true ], [ - 5.6, 1.5, 0.24, 0.22, false ], [ 4.0, - 6.0, 0.23, 0.3, false ], [ - 5.8, - 5.65, 0.27, 0.36, true ] ] ) stump( x, z, r, h, fresh, 2 + Math.floor( R() * 2 ) );

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
		const t = new THREE.Matrix4().makeTranslation( x, ground( x, z ) + lift - g.boundingBox.min.y + 0.012, z );
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

		const cx = 5.3, cz = 2.1;
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
		// chips, thickest nearest the block (strewn with the floor's, at the end)
		chipsAt.push( [ cx, cz, 1.6, 150 ] );
		dust.push( [ cx + 0.2, cz + 0.2, 1.3, 0.35 ] );
		shade.push( [ HEAP[ 0 ], HEAP[ 1 ], HEAP[ 2 ], HEAP[ 3 ], 0.2, 0.3 ] );

	}

	// --- the sawbuck: two X frames of peeled poles, spiked where they cross, a rail along the
	// bottom and a brace; a log in the cradle and the bow saw standing in a cut half through it
	// (left in the middle of the job); the rounds already cut lying below in the sawdust
	{

		const sx = 5.9, sz = - 1.5;
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
		// the sawdust heaped under the cut
		heaps.push( [ sx + 0.93, sz + 0.02, 0.4, 0.34, 0.1, '#c9a874', 2.2 ] );
		dust.push( [ sx + 0.9, sz, 1.1, 0.6 ] );

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

		const px = 1.9, pz = 3.7, PL = 2.5, T = 0.034;
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


	// --- the tractor: an old Steyr of the eighties, red, a white cab roof, a forestry winch on its
	// three-point hitch (a Slovenian one, green); backed up to the edge of the wood with its
	// blade down, the winch's rope run out behind it to a stem still lying in the trees. Its
	// frame (TF): x across, y up, z forward, from the ground under its rear axle's middle.
	{

		const WB = 2.3, RT = 0.82, FT = 0.74, RRw = 0.74, RWw = 0.42, FRw = 0.49, FWw = 0.28;
		const fwd = V( Math.sin( TRYAW ), 0, Math.cos( TRYAW ) ), rgt = V( Math.cos( TRYAW ), 0, - Math.sin( TRYAW ) );
		const flat = ( x, z ) => V( TRX, 0, TRZ ).addScaledVector( rgt, x ).addScaledVector( fwd, z );
		const gAt = ( x, z ) => {

			const p = flat( x, z );
			return ground( p.x, p.z );

		};

		// standing on its four wheels on the ground as it lies, sunk a little into it
		const hRL = gAt( - RT, 0 ), hRR = gAt( RT, 0 ), hFL = gAt( - FT, WB ), hFR = gAt( FT, WB );
		const hR = ( hRL + hRR ) / 2, hF = ( hFL + hFR ) / 2;
		const Zt = fwd.clone().multiplyScalar( WB ).add( V( 0, hF - hR, 0 ) ).normalize();
		let Xt = rgt.clone().multiplyScalar( 2 * RT ).add( V( 0, ( hRR + hFR - hRL - hFL ) / 2, 0 ) ).normalize();
		const Yt = new THREE.Vector3().crossVectors( Zt, Xt ).normalize();
		Xt = new THREE.Vector3().crossVectors( Yt, Zt );
		const MT = new THREE.Matrix4().makeBasis( Xt, Yt, Zt ).setPosition( flat( 0, 0 ).setY( hR - 0.03 ) );
		const T = ( x, y, z ) => V( x, y, z ).applyMatrix4( MT );
		const TD = ( x, y, z ) => V( x, y, z ).transformDirection( MT );
		const i0 = k.parts.length;
		const put = ( g, mat, c, axis = [ 0, 1, 0 ] ) => {

			g.computeBoundingBox();
			const ctr = g.boundingBox.getCenter( V( 0, 0, 0 ) ).applyMatrix4( MT );
			g.applyMatrix4( MT );
			k.add( g, mat, c, TD( ...axis ).toArray(), ctr.toArray() );

		};

		const tbox = ( x, y, z, sx, sy, sz, mat, c, round = 0 ) => {

			const g = round > 0 ? new RoundedBoxGeometry( sx, sy, sz, 1, Math.min( round, sx / 2.1, sy / 2.1, sz / 2.1 ) ) : new THREE.BoxGeometry( sx, sy, sz );
			g.translate( x, y, z );
			put( g, mat, c, sx >= sy && sx >= sz ? [ 1, 0, 0 ] : sy >= sz ? [ 0, 1, 0 ] : [ 0, 0, 1 ] );

		};

		const tbar = ( a, b, w, h, mat, c, up = [ 0, 1, 0 ] ) => beam( k, T( ...a ), T( ...b ), w, h, mat, c, { up: TD( ...up ) } );
		const tcyl = ( a, b, r0, r1, mat, c, seg = 12 ) => {

			const A = V( ...a ), B = V( ...b ), d = B.clone().sub( A );
			const g = new THREE.CylinderGeometry( r1, r0, d.length(), seg );
			g.applyQuaternion( new THREE.Quaternion().setFromUnitVectors( V( 0, 1, 0 ), d.clone().normalize() ) );
			g.translate( ( A.x + B.x ) / 2, ( A.y + B.y ) / 2, ( A.z + B.z ) / 2 );
			put( g, mat, c, d.normalize().toArray() );

		};

		const RED = col( '#a8281e' ), RIM = col( '#9c2a1f' ), DARK = col( '#2c2a27' ), BLACK = col( '#1a1918' ), TYRE = col( '#1d1c1a' );
		const ROOF = col( '#d9d6cc' ), GLASS = col( '#232c31' ), GREEN = col( '#4a6b38' ), GREEN2 = col( '#3d5a2f' ), STEEL = col( '#6f716f' ), CABLE = col( '#6b6a64' ), CHAIN = col( '#3b3834' );

		// --- the wheels: the tyres' section turned round the axle, lugs in a chevron across the
		// tread; the rims dished, the hub standing out of them
		const wheel = ( side, z, Rw, W, Rr, nl, lugW, lugH ) => {

			const cx = side * ( z > 1 ? FT : RT ), cy = Rw, cz = z;
			const prof = [ [ Rr, - W * 0.4 ], [ Rr + ( Rw - Rr ) * 0.55, - W * 0.5 ], [ Rw - 0.035, - W * 0.48 ], [ Rw - 0.005, - W * 0.38 ], [ Rw, 0 ], [ Rw - 0.005, W * 0.38 ], [ Rw - 0.035, W * 0.48 ], [ Rr + ( Rw - Rr ) * 0.55, W * 0.5 ], [ Rr, W * 0.4 ] ];
			const g = new THREE.LatheGeometry( prof.map( ( [ r, y ] ) => new THREE.Vector2( r, y ) ), 28 );
			g.rotateZ( Math.PI / 2 );
			g.translate( cx, cy, cz );
			put( g, M.LEATHER, TYRE, [ 1, 0, 0 ] );
			for ( let i = 0; i < nl; i ++ ) for ( const s of [ - 1, 1 ] ) {

				const a0 = ( i + ( s > 0 ? 0.5 : 0 ) ) / nl * Math.PI * 2, a1 = a0 + 0.2 * 0.74 / Rw, am = ( a0 + a1 ) / 2;
				const rr = Rw + lugH / 2 - 0.008;
				const pa = ( x, a, r ) => [ cx + x, cy + Math.cos( a ) * r, cz + Math.sin( a ) * r ];
				tbar( pa( s * 0.02, a0, rr ), pa( s * W * 0.47, a1, rr - 0.012 ), lugW, lugH, M.LEATHER, TYRE, [ 0, Math.cos( am ), Math.sin( am ) ] );

			}

			// the rim's dish, from its edge in the tyre's mouth to the hub (y out, turned to face
			// away from the tractor's middle)
			const dish = new THREE.LatheGeometry( [ [ Rr * 0.995, W * 0.42 ], [ Rr * 0.97, W * 0.12 ], [ Rr * 0.55, W * 0.07 ], [ 0.17, W * 0.14 ], [ 0.11, W * 0.2 ] ].map( ( [ r, y ] ) => new THREE.Vector2( r, y ) ), 22 );
			dish.rotateZ( side > 0 ? - Math.PI / 2 : Math.PI / 2 );
			dish.translate( cx, cy, cz );
			put( dish, M.LEATHER, RIM, [ 1, 0, 0 ] );
			tcyl( [ cx + side * W * 0.18, cy, cz ], [ cx + side * ( W * 0.18 + 0.1 ), cy, cz ], 0.12, 0.1, M.IRON, DARK, 10 );
			if ( z < 1 ) for ( let i = 0; i < 8; i ++ ) {

				const a = i / 8 * Math.PI * 2;
				tcyl( [ cx + side * W * 0.15, cy + Math.cos( a ) * 0.2, cz + Math.sin( a ) * 0.2 ], [ cx + side * ( W * 0.15 + 0.035 ), cy + Math.cos( a ) * 0.2, cz + Math.sin( a ) * 0.2 ], 0.022, 0.022, M.IRON, DARK, 6 );

			}

		};

		for ( const side of [ - 1, 1 ] ) {

			wheel( side, 0, RRw, RWw, 0.4, 19, 0.075, 0.05 );
			wheel( side, WB, FRw, FWw, 0.29, 15, 0.05, 0.035 );

		}

		// the axles, the gearbox and the engine, dark under the red tin
		tbar( [ - 0.68, RRw, 0 ], [ 0.68, RRw, 0 ], 0.17, 0.17, M.LEATHER, DARK );
		tbox( 0, 0.8, 0.35, 0.52, 0.56, 1.15, M.LEATHER, DARK, 0.04 );
		tbox( 0, 0.8, 1.9, 0.46, 0.5, 1.6, M.LEATHER, DARK, 0.04 );
		tbar( [ - 0.6, FRw, WB ], [ 0.6, FRw, WB ], 0.12, 0.12, M.LEATHER, DARK );
		tbox( 0, FRw, WB, 0.3, 0.28, 0.32, M.LEATHER, DARK, 0.03 );
		// the bonnet, louvred down its sides; the grille with its bars and the headlamps in it
		tbox( 0, 1.29, 1.97, 0.8, 0.52, 2.24, M.LEATHER, RED, 0.07 );
		for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 6; i ++ ) tbox( s * 0.401, 1.25, 2.28 + i * 0.1, 0.008, 0.26, 0.035, M.LEATHER, BLACK );
		tbox( 0, 1.2, 3.1, 0.66, 0.36, 0.02, M.LEATHER, BLACK );
		for ( let i = 0; i < 5; i ++ ) tbox( 0, 1.06 + i * 0.066, 3.113, 0.62, 0.016, 0.01, M.LEATHER, col( '#4a4845' ) );
		for ( const s of [ - 1, 1 ] ) {

			tbox( s * 0.25, 1.46, 3.1, 0.23, 0.11, 0.022, M.LEATHER, BLACK );
			tbox( s * 0.25, 1.46, 3.108, 0.19, 0.075, 0.016, M.LEATHER, col( '#cfcbb8' ) );

		}

		tbox( 0, 1.52, 3.1, 0.26, 0.032, 0.012, M.LEATHER, col( '#e2e0da' ) );
		// the white line down each side of the bonnet, and the maker's name on it
		for ( const s of [ - 1, 1 ] ) {

			tbox( s * 0.401, 1.42, 1.95, 0.006, 0.028, 2.0, M.LEATHER, col( '#dcd8cc' ) );
			tbox( s * 0.403, 1.35, 2.62, 0.006, 0.05, 0.3, M.LEATHER, col( '#dcd8cc' ) );

		}
		// the front weights on their carrier
		tbox( 0, 0.74, 3.22, 0.66, 0.18, 0.24, M.LEATHER, DARK );
		for ( let i = 0; i < 6; i ++ ) tbox( - 0.275 + i * 0.11, 0.86, 3.33, 0.1, 0.36, 0.3, M.LEATHER, col( '#2b2a28' ), 0.015 );
		// the mudguards over the wheels
		for ( const side of [ - 1, 1 ] ) {

			const rg = new THREE.CylinderGeometry( RRw + 0.1, RRw + 0.1, RWw + 0.14, 16, 1, true, 0.2, 2.85 );
			rg.rotateZ( Math.PI / 2 );
			rg.translate( side * RT, RRw, 0 );
			put( rg, M.LEATHER, RED, [ 1, 0, 0 ] );
			const fg = new THREE.CylinderGeometry( FRw + 0.08, FRw + 0.08, FWw + 0.1, 10, 1, true, 0.45, 2.1 );
			fg.rotateZ( Math.PI / 2 );
			fg.translate( side * FT, FRw, WB );
			put( fg, M.LEATHER, RED, [ 1, 0, 0 ] );
			// the fender's stay down to the axle
			tbar( [ side * FT, FRw + 0.08, WB - 0.1 ], [ side * FT * 0.9, FRw + FRw + 0.06, WB - 0.25 ], 0.03, 0.03, M.LEATHER, DARK, [ 0, 0, 1 ] );

		}

		// the cab: black posts, the glass, a white roof with work lamps; the door on the left
		const CF = 0.74, CB = - 0.62, CW = 0.77, CR = 2.38;
		for ( const s of [ - 1, 1 ] ) {

			tbar( [ s * CW, 1.02, CF ], [ s * ( CW - 0.02 ), CR, CF - 0.07 ], 0.06, 0.06, M.LEATHER, BLACK, [ 0, 0, 1 ] );
			tbar( [ s * CW, 1.5, CB ], [ s * ( CW - 0.02 ), CR, CB + 0.02 ], 0.06, 0.06, M.LEATHER, BLACK, [ 0, 0, 1 ] );
			tbar( [ s * CW, 1.5, - 0.05 ], [ s * ( CW - 0.01 ), CR, - 0.05 ], 0.05, 0.05, M.LEATHER, BLACK, [ 0, 0, 1 ] );
			// the side glass: the door's, and the quarter light over the wheel
			tbar( [ s * ( CW - 0.005 ), 1.12, 0.35 ], [ s * ( CW - 0.012 ), CR - 0.02, 0.33 ], 0.72, 0.014, M.LEATHER, GLASS, [ 1, 0, 0 ] );
			tbar( [ s * ( CW - 0.005 ), 1.64, - 0.34 ], [ s * ( CW - 0.012 ), CR - 0.02, - 0.34 ], 0.52, 0.014, M.LEATHER, GLASS, [ 1, 0, 0 ] );
			// the mirror on its arm
			tbar( [ s * CW, 2.08, CF - 0.05 ], [ s * ( CW + 0.26 ), 2.02, CF + 0.05 ], 0.025, 0.025, M.LEATHER, BLACK, [ 0, 1, 0 ] );
			tbox( s * ( CW + 0.29 ), 1.93, CF + 0.06, 0.04, 0.22, 0.15, M.LEATHER, BLACK );
			// work lamps on the roof, front and back
			for ( const zz of [ CF + 0.08, CB - 0.08 ] ) {

				tbox( s * 0.52, 2.46, zz, 0.13, 0.09, 0.07, M.LEATHER, BLACK );
				tbox( s * 0.52, 2.46, zz + Math.sign( zz ) * 0.036, 0.1, 0.065, 0.006, M.LEATHER, col( '#d8d4c2' ) );

			}

			// the steps up, and the grab handle
			if ( s < 0 ) {

				for ( const y of [ 0.56, 0.84 ] ) tbox( - 0.86, y, 0.4, 0.26, 0.03, 0.2, M.LEATHER, BLACK );
				tbar( [ - 0.98, 0.5, 0.4 ], [ - 0.95, 1.05, 0.4 ], 0.025, 0.04, M.LEATHER, BLACK, [ 0, 0, 1 ] );
				tbar( [ - 0.8, 1.35, CF - 0.04 ], [ - 0.8, 1.95, CF - 0.04 ], 0.022, 0.022, M.LEATHER, BLACK, [ 0, 0, 1 ] );
				tbox( - CW - 0.01, 1.5, 0.06, 0.02, 0.03, 0.1, M.LEATHER, BLACK );

			}

		}

		tbar( [ 0, 1.3, CF - 0.005 ], [ 0, CR - 0.02, CF - 0.07 ], 1.46, 0.014, M.LEATHER, GLASS, [ 0, 0, 1 ] );
		tbar( [ 0, 1.55, CB + 0.005 ], [ 0, CR - 0.02, CB + 0.02 ], 1.46, 0.014, M.LEATHER, GLASS, [ 0, 0, 1 ] );
		tbox( 0, 1.3, CB + 0.01, 1.5, 0.5, 0.03, M.LEATHER, RED );
		tbox( 0, CR + 0.07, 0.06, 1.7, 0.13, 1.58, M.LEATHER, ROOF, 0.04 );
		tcyl( [ 0.55, CR + 0.13, - 0.35 ], [ 0.55, CR + 0.26, - 0.35 ], 0.06, 0.05, M.LEATHER, col( '#d9731c' ), 10 );
		// the tank under the door, the exhaust up past the windscreen, the air cleaner's bowl
		tbox( - 0.5, 0.78, 0.62, 0.26, 0.36, 0.5, M.LEATHER, DARK, 0.03 );
		tcyl( [ 0.26, 1.5, 0.98 ], [ 0.26, 2.05, 0.98 ], 0.06, 0.06, M.IRON, col( '#2a2724' ), 10 );
		tcyl( [ 0.26, 2.05, 0.98 ], [ 0.26, 2.47, 0.98 ], 0.036, 0.036, M.IRON, col( '#2a2724' ), 8 );
		tcyl( [ 0.26, 2.47, 0.98 ], [ 0.26, 2.53, 0.94 ], 0.036, 0.036, M.IRON, col( '#231f1c' ), 8 );
		tcyl( [ - 0.25, 1.5, 1.28 ], [ - 0.25, 1.76, 1.28 ], 0.045, 0.045, M.LEATHER, BLACK, 10 );
		tcyl( [ - 0.25, 1.76, 1.28 ], [ - 0.25, 1.84, 1.28 ], 0.075, 0.07, M.LEATHER, BLACK, 10 );
		// the three-point linkage and the shaft to the winch, in its yellow guard
		for ( const s of [ - 1, 1 ] ) tbar( [ s * 0.3, 0.52, - 0.2 ], [ s * 0.44, 0.42, - 0.92 ], 0.06, 0.1, M.LEATHER, DARK );
		tbar( [ 0, 1.1, - 0.38 ], [ 0, 1.16, - 0.93 ], 0.06, 0.06, M.LEATHER, DARK );
		tcyl( [ 0, 0.62, - 0.3 ], [ 0, 0.58, - 0.8 ], 0.065, 0.065, M.LEATHER, col( '#caa21f' ), 10 );

		// --- the winch: a steel shield standing behind on the linkage, its blade dug into the
		// ground; the drum between it and the tractor, wound with rope; the rope over the pulley
		// at its top; chains with their hooks hung on its shoulders
		{

			const sh = new THREE.Shape();
			sh.moveTo( - 0.86, - 0.06 ); sh.lineTo( 0.86, - 0.06 ); sh.lineTo( 0.86, 0.36 ); sh.lineTo( 0.44, 1.5 );
			sh.lineTo( - 0.44, 1.5 ); sh.lineTo( - 0.86, 0.36 ); sh.lineTo( - 0.86, - 0.06 );
			const g = new THREE.ExtrudeGeometry( sh, { depth: 0.05, bevelEnabled: false } );
			g.rotateX( 0.06 );
			g.translate( 0, 0, - 1.2 );
			put( g, M.LEATHER, GREEN, [ 0, 1, 0 ] );
			for ( const s of [ - 1, 1 ] ) {

				tbar( [ s * 0.86, - 0.06, - 1.15 ], [ s * 0.86, 0.36, - 1.13 ], 0.07, 0.07, M.LEATHER, GREEN2, [ 0, 0, 1 ] );
				tbar( [ s * 0.86, 0.36, - 1.13 ], [ s * 0.44, 1.5, - 1.06 ], 0.07, 0.07, M.LEATHER, GREEN2, [ 0, 0, 1 ] );
				tbox( s * 0.46, 0.72, - 0.93, 0.025, 1.0, 0.38, M.LEATHER, GREEN );
				tcyl( [ s * 0.19, 0.52, - 0.88 ], [ s * 0.215, 0.52, - 0.88 ], 0.25, 0.25, M.LEATHER, GREEN2, 16 );

			}

			tbar( [ - 0.88, 0.0, - 1.21 ], [ 0.88, 0.0, - 1.21 ], 0.12, 0.14, M.IRON, STEEL, [ 0, 1, 0 ] );
			tcyl( [ - 0.19, 0.52, - 0.88 ], [ 0.19, 0.52, - 0.88 ], 0.2, 0.2, M.ROPE, CABLE, 16 );
			tbox( 0.35, 0.52, - 0.88, 0.14, 0.38, 0.36, M.LEATHER, GREEN );
			tbox( 0, 1.22, - 0.95, 0.94, 0.025, 0.42, M.LEATHER, GREEN2 );
			for ( const s of [ - 1, 1 ] ) tbox( s * 0.055, 1.56, - 1.12, 0.015, 0.2, 0.17, M.LEATHER, GREEN2 );
			tcyl( [ - 0.03, 1.58, - 1.13 ], [ 0.03, 1.58, - 1.13 ], 0.085, 0.085, M.IRON, STEEL, 12 );
			// the shield's back: stiffening ribs up it, a grille of bars over its upper part (to
			// catch a whipping rope), the maker's sticker, scuffed
			for ( const x of [ - 0.5, 0, 0.5 ] ) tbar( [ x, 0.05, - 1.215 ], [ x * 0.8, 0.95, - 1.16 ], 0.05, 0.035, M.LEATHER, GREEN2, [ 0, 0, 1 ] );
			for ( let i = 0; i < 5; i ++ ) {

				const x = - 0.36 + i * 0.18;
				tbar( [ x, 0.98, - 1.17 ], [ x * 0.9, 1.44, - 1.13 ], 0.018, 0.018, M.IRON, col( '#3f423c' ), [ 0, 0, 1 ] );

			}

			for ( const y of [ 1.0, 1.2, 1.4 ] ) tbar( [ - 0.4 + ( y - 1 ) * 0.1, y, - 1.175 + ( y - 1 ) * 0.09 ], [ 0.4 - ( y - 1 ) * 0.1, y, - 1.175 + ( y - 1 ) * 0.09 ], 0.018, 0.018, M.IRON, col( '#3f423c' ), [ 0, 0, 1 ] );
			tbar( [ - 0.2, 0.62, - 1.222 ], [ 0.2, 0.62, - 1.222 ], 0.14, 0.004, M.LEATHER, col( '#e3dccb' ), [ 0, 0, 1 ] );
			tbar( [ - 0.17, 0.66, - 1.225 ], [ 0.17, 0.66, - 1.225 ], 0.03, 0.003, M.LEATHER, col( '#3d6a33' ), [ 0, 0, 1 ] );
			// the chokers hung on its shoulders: chain looped down, the hook at its end
			for ( const s of [ - 1, 1 ] ) {

				const pts = [ [ s * 0.6, 1.05, - 1.24 ], [ s * 0.66, 0.72, - 1.27 ], [ s * 0.63, 0.44, - 1.28 ], [ s * 0.54, 0.36, - 1.28 ], [ s * 0.46, 0.55, - 1.27 ], [ s * 0.47, 0.8, - 1.26 ] ].map( ( p ) => T( ...p ) );
				rod( k, pts, 0.016, 0.016, M.IRON, CHAIN, 5 );
				rod( k, [ [ s * 0.47, 0.8, - 1.26 ], [ s * 0.47, 0.66, - 1.3 ], [ s * 0.5, 0.6, - 1.33 ], [ s * 0.53, 0.66, - 1.34 ] ].map( ( p ) => T( ...p ) ), 0.014, 0.014, M.IRON, CHAIN, 5, ( t ) => 1 - 0.5 * t );

			}
			// the pull cords from the winch's levers in at the cab's back window
			rod( k, [ [ 0.3, 1.24, - 1.0 ], [ 0.34, 1.28, - 0.85 ], [ 0.4, 1.5, - 0.66 ] ].map( ( p ) => T( ...p ) ), 0.005, 0.005, M.ROPE, col( '#c8b14a' ), 4 );

		}

		// mud: splashed up the wheels, the linkage and the tin, thickest low down
		{

			const inv = MT.clone().invert(), mud = col( '#4b3b2b' ), p = V( 0, 0, 0 );
			for ( const g of k.parts.slice( i0 ) ) {

				const pa = g.getAttribute( 'position' ), ca = g.getAttribute( 'color' );
				for ( let i = 0; i < pa.count; i ++ ) {

					p.fromBufferAttribute( pa, i );
					const ty = p.clone().applyMatrix4( inv ).y;
					const f = ( 1 - ss( 0.1, 1.05, ty ) ) * ( 0.35 + 0.3 * ( 0.5 + 0.5 * vnoise( p.x * 6, p.z * 6 + p.y * 6 ) ) );
					ca.setXYZ( i, ca.getX( i ) + ( mud.r - ca.getX( i ) ) * f, ca.getY( i ) + ( mud.g - ca.getY( i ) ) * f, ca.getZ( i ) + ( mud.b - ca.getZ( i ) ) * f );

				}

			}

		}

		// its footprint: the body and wheels, and the winch
		{

			const c = flat( 0, 1.15 );
			collision.push( [ c.x, c.z, 1.35, 2.42 ] );

		}

		// the stem it was pulling in: a spruce trunk, limbed, lying out in the trees behind with
		// the choker's chain round its butt, and the rope from the pulley run back to it, sagging
		// to the ground behind the blade
		{

			const sb = V( 2.05, 0, - 7.3 ), stp = V( 1.25, 0, - 15.5 );
			sb.y = ground( sb.x, sb.z ) + 0.2; stp.y = ground( stp.x, stp.z ) + 0.12;
			log( k, sb, stp, 0.25, 0.14, barkC(), freshC(), R );
			const ax = stp.clone().sub( sb ).normalize(), cc = sb.clone().addScaledVector( ax, 0.35 );
			const { e1, e2 } = across( ax );
			const loop = [];
			for ( let i = 0; i <= 12; i ++ ) {

				const a = i / 12 * Math.PI * 2;
				loop.push( cc.clone().addScaledVector( e1, Math.cos( a ) * 0.262 ).addScaledVector( e2, Math.sin( a ) * 0.262 ) );

			}

			rod( k, loop, 0.012, 0.012, M.IRON, CHAIN, 5 );
			const top = T( 0, 1.62, - 1.2 ), end = cc.clone().addScaledVector( e2, 0.27 );
			const pts = [ top, T( 0.02, 1.18, - 1.62 ), T( 0.03, 0.62, - 2.05 ) ];
			const g0 = pts[ 2 ].clone();
			for ( let i = 1; i <= 5; i ++ ) {

				const q = g0.clone().lerp( end, i / 6 );
				q.y = Math.max( ground( q.x, q.z ) + 0.012, g0.y + ( end.y - g0.y ) * i / 6 - 0.4 * Math.sin( i / 6 * Math.PI ) );
				pts.push( q );

			}

			pts.push( end );
			rod( k, pts, 0.009, 0.009, M.ROPE, CABLE, 5 );

		}

	}

	// --- where they were cutting the stems to length: a trunk lying on two skids, sawn through,
	// the short end rolled off a little; the sawdust heaped under the cut. Beside it on a stump
	// the chainsaw, the wedges, and the fuel can on the ground (petrol red, chain oil black)
	{

		const pole = ( a, b, r ) => k.pole( a, b, r, M.BARK, barkC(), a.x * 7 );
		const A = V( - 2.6, 0, - 1.0 ), B = V( 0.0, 0, - 1.5 ), C = V( 0.03, 0, - 1.506 ), D = V( 1.0, 0, - 1.68 );
		const skid = ( t ) => {

			const p = A.clone().lerp( B, t ), side = V( - ( B.z - A.z ), 0, B.x - A.x ).normalize();
			const a = p.clone().addScaledVector( side, - 0.5 ), b = p.clone().addScaledVector( side, 0.5 );
			a.y = ground( a.x, a.z ) + 0.035; b.y = ground( b.x, b.z ) + 0.035;
			pole( a, b, 0.05 );
			return Math.max( a.y, b.y ) + 0.05;

		};

		const y1 = skid( 0.2 ), y2 = skid( 0.78 );
		const rA = 0.22, rB = 0.19, yAt = ( t ) => y1 + ( y2 - y1 ) * ( t - 0.2 ) / 0.58;
		A.y = Math.max( yAt( 0 ) + rA, ground( A.x, A.z ) + rA * 0.95 ); B.y = yAt( 1 ) + rB;
		log( k, A, B, rA, rB, barkC(), freshC(), R );
		C.y = B.y - 0.02; D.y = Math.max( ground( D.x, D.z ) + 0.17, C.y - 0.1 );
		log( k, C, D, 0.188, 0.17, barkC(), freshC(), R );
		heaps.push( [ 0.03, - 1.58, 0.44, 0.36, 0.11, '#c8a877', 5.1 ] );
		dust.push( [ - 0.05, - 1.35, 1.5, 0.7 ] );
		collision.push( [ - 0.8, - 1.34, 1.95, 0.55 ] );
		// a sappie (the Tyrolean pick for turning logs) left stuck in the trunk's top
		{

			const p = A.clone().lerp( B, 0.42 ), top = p.clone().add( V( 0, rA * 0.97 - 0.035, 0 ) );
			const hd = V( - 0.3, 0.72, 0.62 ).normalize(), head = top.clone().add( V( 0.0, 0.14, 0.05 ) );
			rod( k, [ head.clone().addScaledVector( hd, 0.04 ), head.clone().addScaledVector( hd, 0.5 ).add( V( 0.01, 0, 0 ) ), head.clone().addScaledVector( hd, 0.95 ) ], 0.019, 0.017, M.LOG, col( '#a88a62' ), 6 );
			beam( k, head.clone().addScaledVector( hd, - 0.03 ), head.clone().addScaledVector( hd, 0.1 ), 0.05, 0.05, M.IRON, col( '#37332f' ) );
			rod( k, [ head.clone().addScaledVector( hd, - 0.02 ), head.clone().add( V( 0, - 0.04, - 0.07 ) ), head.clone().add( V( 0, - 0.11, - 0.1 ) ), top.clone().add( V( 0, - 0.02, - 0.08 ) ) ], 0.017, 0.015, M.IRON, col( '#3d3934' ), 5, ( t ) => 1 - 0.85 * t );

		}

		// the stump the saw was set down on
		const sx = - 2.75, sz = 0.55;
		const s = stump( sx, sz, 0.3, 0.42, true, 3, false );
		const top = s.topY( sx, sz ) + 0.012;
		chainsaw( k, V( sx - 0.02, top, sz + 0.03 ), 0.95 );
		// felling wedges, orange and yellow, on the cut beside it
		for ( const [ dx, dz, yaw, c ] of [ [ 0.12, - 0.15, 2.4, '#e46a1c' ], [ - 0.16, - 0.12, 0.3, '#e8b21f' ] ] ) {

			const w = new THREE.Shape();
			w.moveTo( 0, 0 ); w.lineTo( 0.2, 0 ); w.lineTo( 0, 0.03 ); w.lineTo( 0, 0 );
			const g = new THREE.ExtrudeGeometry( w, { depth: 0.065, bevelEnabled: false } );
			g.translate( - 0.1, 0, - 0.0325 );
			g.rotateY( yaw );
			g.translate( sx + dx, s.topY( sx + dx, sz + dz ) + 0.004, sz + dz );
			k.add( g, M.LEATHER, col( c ), [ Math.cos( yaw ), 0, - Math.sin( yaw ) ] );

		}

		combiCan( k, ground, - 2.0, 0.05, 0.5 );
		chipsAt.push( [ sx, sz, 0.9, 30 ] );
		dust.push( [ sx + 0.3, sz - 0.2, 1.2, 0.35 ] );

	}

	// --- the storm's work: a spruce thrown at the wood's edge, its root plate torn up and stood
	// on end, earth and stones still packed in its roots, the pit it came out of full of water;
	// the trunk lying away from it into the trees
	{

		const px = - 8.5, pz = - 2.3, F = V( 0.96, 0, 0.28 ).normalize();
		const N = F.clone().multiplyScalar( Math.cos( 0.3 ) ).add( V( 0, Math.sin( 0.3 ), 0 ) ).normalize();
		const Ux = V( F.z, 0, - F.x ), Vy = new THREE.Vector3().crossVectors( N, Ux ).normalize();
		const C = V( px, ground( px, pz ) + 1.02, pz );
		const rr = ( a ) => 1.28 * ( 1 + 0.13 * Math.sin( 3 * a + 1 ) + 0.07 * Math.sin( 5 * a + 2 ) + 0.04 * Math.sin( 9 * a ) );
		const at = ( a, rho, off ) => {

			const p = C.clone().addScaledVector( Ux, Math.cos( a ) * rr( a ) * rho ).addScaledVector( Vy, Math.sin( a ) * rr( a ) * rho ).addScaledVector( N, off );
			p.y = Math.max( p.y, ground( p.x, p.z ) - 0.12 );
			return p;

		};

		const segs = 30, ringsU = 7, ringsT = 3, pos = [], cols = [], idx = [];
		const clay = col( '#6f604b' ), dark = col( '#3f3327' ), stoneC = col( '#8b8577' ), moss = col( '#4a5a2c' ), litter = col( '#5b4631' ), tmp = new THREE.Color();
		// the underside, bulging, lumpy with earth: rings from the middle out
		const under = ( a, rho ) => 0.1 + 0.34 * ( 1 - rho * rho ) + 0.09 * vnoise( Math.cos( a ) * rho * 4 + 3, Math.sin( a ) * rho * 4 ) + 0.05 * vnoise( Math.cos( a ) * rho * 9 - 1, Math.sin( a ) * rho * 9 + 2 ) + 0.03 * vnoise( a * 7, rho * 9 );
		const ring = ( rho, off, colour ) => {

			const o = pos.length / 3;
			for ( let j = 0; j < segs; j ++ ) {

				const a = j / segs * Math.PI * 2;
				pos.push( ...at( a, rho, off( a, rho ) ).toArray() );
				const c = colour( a, rho );
				cols.push( c.r, c.g, c.b );

			}

			return o;

		};

		const band = ( o1, o2 ) => {

			for ( let j = 0; j < segs; j ++ ) {

				const a = o1 + j, b = o1 + ( j + 1 ) % segs, c = o2 + j, d = o2 + ( j + 1 ) % segs;
				idx.push( a, b, c, b, d, c );

			}

		};

		const earthC = ( a, rho ) => {

			const n = vnoise( Math.cos( a ) * rho * 5 + 1, Math.sin( a ) * rho * 5 - 2 );
			tmp.copy( clay ).lerp( dark, 0.35 + 0.35 * n + 0.3 * ( 1 - rho ) );
			if ( hash2( Math.round( a * 9 ), Math.round( rho * 11 ) ) > 0.86 ) tmp.lerp( stoneC, 0.6 );
			return tmp;

		};

		const topC = ( a, rho ) => tmp.copy( litter ).lerp( moss, 0.5 + 0.5 * vnoise( Math.cos( a ) * rho * 3, Math.sin( a ) * rho * 3 + 5 ) );
		const mid = pos.length / 3;
		pos.push( ...C.clone().addScaledVector( N, under( 0, 0 ) ).toArray() );
		cols.push( dark.r, dark.g, dark.b );
		const firstU = ring( 1 / ringsU, under, earthC );
		for ( let j = 0; j < segs; j ++ ) idx.push( mid, firstU + j, firstU + ( j + 1 ) % segs );
		let prev = firstU;
		for ( let i = 2; i <= ringsU; i ++ ) {

			const o = ring( i / ringsU, under, earthC );
			band( prev, o );
			prev = o;

		}

		// the rim, torn, down to the old forest floor on the plate's back
		const rim = ring( 1.03, () => - 0.05, () => tmp.copy( dark ).multiplyScalar( 0.9 ) );
		band( prev, rim );
		const back = ring( 1.0, () => - 0.24, topC );
		band( rim, back );
		prev = back;
		for ( let i = ringsT - 1; i >= 1; i -- ) {

			const o = ring( i / ringsT, ( a, rho ) => - 0.26 - 0.03 * vnoise( a * 3, rho * 5 ), topC );
			band( prev, o );
			prev = o;

		}

		const midB = pos.length / 3;
		pos.push( ...C.clone().addScaledVector( N, - 0.27 ).toArray() );
		cols.push( moss.r, moss.g, moss.b );
		for ( let j = 0; j < segs; j ++ ) idx.push( midB, prev + ( j + 1 ) % segs, prev + j );
		// (each face turned out from the plate's middle)
		orient( pos, idx, ( c ) => c.clone().sub( C ) );
		k.add( cmesh( pos, idx, cols ), M.LEATHER, null, Ux.toArray(), C.toArray() );
		// the roots: thick ones out from the middle over the face, torn off at the rim and
		// beyond; thin ones between
		const rootC = () => mixc( '#4d3a2a', '#5d4a38', R() );
		for ( let i = 0; i < 26; i ++ ) {

			const thick = i < 7, a = thick ? i / 7 * Math.PI * 2 + R() * 0.5 : R() * Math.PI * 2, pts = [];
			const r0 = thick ? 0.05 + R() * 0.1 : 0.15 + R() * 0.5, reach = thick ? 0.95 + R() * 0.3 : r0 + 0.3 + R() * 0.8;
			const bend = ( R() - 0.5 ) * 0.9, sink = R() < 0.5;
			for ( let j = 0; j <= 5; j ++ ) {

				const q = j / 5, rho = r0 + ( reach - r0 ) * q, aj = a + bend * q * q + Math.sin( j * 1.7 + i ) * 0.06;
				// (over the face a little proud of it, or half sunk in it; past the rim bent back)
				const off = rho <= 1 ? under( aj, rho ) + ( sink ? 0.0 : 0.03 ) : 0.1 - ( rho - 1 ) * 0.6;
				pts.push( at( aj, rho, off ) );

			}

			rod( k, pts, thick ? 0.075 : 0.022 + R() * 0.02, thick ? 0.062 : 0.02 + R() * 0.015, M.BARK, rootC(), 5, ( t ) => 1 - 0.8 * t );

		}

		// clods of earth held in the roots
		for ( let i = 0; i < 6; i ++ ) {

			const a = R() * Math.PI * 2, rho = 0.2 + R() * 0.7, p = at( a, rho, under( a, rho ) - 0.03 ), s = 0.08 + R() * 0.07;
			k.stone( p.x, p.y, p.z, s * 1.3, s * 0.9, s * 1.1, mixc( '#5f4f3c', '#4a3d2f', R() ), R() * 40 );

		}

		for ( let i = 0; i < 4; i ++ ) {

			const a = R() * Math.PI * 2, rho = 0.3 + R() * 0.5, p = at( a, rho, under( a, rho ) - 0.05 ), s = 0.07 + R() * 0.06;
			k.stone( p.x, p.y, p.z, s * 1.2, s * 0.9, s, mixc( '#8a8579', '#6e695f', R() ), R() * 40 );

		}

		// the trunk, from the back of the plate out into the trees, and a few dead lower
		// branches still on it, grey
		const base = C.clone().addScaledVector( N, - 0.3 ).addScaledVector( Vy, - 0.2 );
		const tip = base.clone().addScaledVector( F, - 9 );
		tip.y = ground( tip.x, tip.z ) + 0.3;
		log( k, base, tip, 0.3, 0.19, barkC(), freshC(), R );
		for ( let i = 0; i < 5; i ++ ) {

			const t = 0.2 + i * 0.14, p = base.clone().lerp( tip, t ), a = R() * Math.PI * 2;
			const d = V( Math.cos( a ), 0.6 + R() * 0.5, Math.sin( a ) ).normalize(), l = 0.5 + R() * 0.7;
			rod( k, [ p, p.clone().addScaledVector( d, l * 0.5 ), p.clone().addScaledVector( d, l ).add( V( 0, - 0.1, 0 ) ) ], 0.025, 0.025, M.BARK, mixc( '#6b665e', '#58534b', R() ), 4, ( u ) => 1 - 0.7 * u );

		}

		// the pit, where the plate stood: water standing in it, dark wet earth round it
		const pc = V( px, 0, pz ).addScaledVector( F, 0.95 );
		wetAt.push( [ pc.x, pc.z, 1.3 ] );
		pool( gk, ground, pc.x, pc.z, 0.45, 0.62, 3.1 );
		collision.push( [ px + 0.25, pz, 0.7, 1.45 ] );
		shade.push( [ px - 0.5, px + 1.4, pz - 1.4, pz + 1.4, 0.3, 0.8 ] );

	}

	// --- the brash: the lopped branches, their needles still green, heaped along the edges
	// where they were thrown, and a few lying about
	{

		const needle = ( fresh ) => fresh < 0.55 ? mixc( '#3d5634', '#4a6139', R() ) : fresh < 0.82 ? mixc( '#5f6334', '#6d6a3a', R() ) : mixc( '#86592f', '#74502d', R() );
		const heap = ( cx, cz, rx, rz, yaw, h, n ) => {

			const c = Math.cos( yaw ), s = Math.sin( yaw );
			const toW = ( u, v ) => [ cx + c * u - s * v, cz + s * u + c * v ];
			const hAt = ( x, z ) => {

				const u = c * ( x - cx ) + s * ( z - cz ), v = - s * ( x - cx ) + c * ( z - cz );
				return h * Math.max( 0, 1 - ( u / rx ) ** 2 - ( v / rz ) ** 2 );

			};

			const tone = R();
			// the core: the small stuff matted together, its top bristling
			{

				const segs = 22, rings = 5, pos = [], cols = [], idx = [];
				const cA = needle( tone * 0.6 + 0.2 ).multiplyScalar( 0.6 ), cB = mixc( '#5a4430', '#4a3a2a', R() ), cC = mixc( '#3a3a26', '#2f3524', R() );
				pos.push( cx, ground( cx, cz ) + h * 0.62, cz );
				cols.push( cA.r, cA.g, cA.b );
				for ( let r = 1; r <= rings; r ++ ) for ( let i = 0; i < segs; i ++ ) {

					const a = i / segs * Math.PI * 2, f = r / rings, wob = 1 + 0.18 * Math.sin( a * 3 + tone * 9 ) + 0.1 * Math.sin( a * 7 + r );
					const [ x, z ] = toW( Math.cos( a ) * rx * 0.85 * f * wob, Math.sin( a ) * rz * 0.85 * f * wob );
					const spike = r === rings ? 0 : 0.5 + 0.9 * hash2( i * 7 + r * 13, cx * 3 + cz );
					pos.push( x, ground( x, z ) + ( r === rings ? - 0.03 : h * 0.62 * Math.pow( 1 - f * f, 0.8 ) * spike + 0.02 ), z );
					const c = cA.clone().lerp( hash2( i * 3 + r, cz * 5 ) < 0.5 ? cB : cC, 0.3 + 0.5 * hash2( i + r * 31, cx ) ).multiplyScalar( 0.75 + 0.35 * ( 1 - f ) );
					cols.push( c.r, c.g, c.b );

				}

				for ( let i = 0; i < segs; i ++ ) idx.push( 0, 1 + ( i + 1 ) % segs, 1 + i );
				for ( let r = 0; r < rings - 1; r ++ ) for ( let i = 0; i < segs; i ++ ) {

					const a = 1 + r * segs + i, b = 1 + r * segs + ( i + 1 ) % segs;
					idx.push( a, b, a + segs, b, b + segs, a + segs );

				}

				orient( pos, idx, UPWARD );
				k.add( cmesh( pos, idx, cols ), M.BARK, null, [ c, 0, s ], [ cx, ground( cx, cz ), cz ] );

			}

			for ( let i = 0; i < n; i ++ ) {

				const layer = i / n, a = R() * Math.PI * 2, dd = Math.sqrt( R() ) * 0.72;
				const [ bx, bz ] = toW( Math.cos( a ) * dd * rx, Math.sin( a ) * dd * rz );
				const ang = yaw + ( R() - 0.5 ) * 1.1 + ( R() < 0.5 ? 0 : Math.PI );
				const len = 1.1 + R() * 1.3, dx = Math.cos( ang ) * len / 2, dz = Math.sin( ang ) * len / 2;
				const p0 = V( bx - dx, 0, bz - dz ), p1 = V( bx + dx, 0, bz + dz );
				p0.y = ground( p0.x, p0.z ) + 0.045 + hAt( p0.x, p0.z ) * ( 0.5 + 0.6 * layer );
				p1.y = ground( p1.x, p1.z ) + 0.09 + hAt( p1.x, p1.z ) * ( 0.5 + 0.6 * layer ) + R() * 0.15;
				spruceBranch( k, R, p0, p1, 0.018 + R() * 0.018, mixc( '#5b4d40', '#6e6254', R() ), needle( ( tone * 0.6 + R() * 0.4 ) ) );

			}

			const hx = Math.hypot( rx * c, rz * s ), hz = Math.hypot( rx * s, rz * c );
			shade.push( [ cx - hx, cx + hx, cz - hz, cz + hz, 0.25, 0.5 ] );
			taken.push( [ cx - hx, cx + hx, cz - hz, cz + hz ] );
			collision.push( [ cx, cz, hx * 0.75, hz * 0.75 ] );

		};

		heap( - 8.15, 1.55, 1.1, 0.55, Math.PI / 2 + 0.1, 0.5, 12 );
		heap( - 4.0, - 5.85, 1.05, 0.7, 0.3, 0.5, 9 );
		heap( 8.25, 0.55, 1.45, 0.6, Math.PI / 2 - 0.1, 0.6, 12 );
		// and a few thrown down about the floor
		for ( let i = 0, n = 0; i < 60 && n < 5; i ++ ) {

			const x = ( R() - 0.5 ) * 15, z = ( R() - 0.5 ) * 10.5, a = R() * Math.PI, l = 0.8 + R() * 0.9;
			const x1 = x + Math.cos( a ) * l, z1 = z + Math.sin( a ) * l;
			if ( ! free( x, z, 0.3 ) || ! free( x1, z1, 0.3 ) || ! free( ( x + x1 ) / 2, ( z + z1 ) / 2, 0.3 ) ) continue;
			n ++;
			const p0 = V( x, 0, z ), p1 = V( x1, 0, z1 );
			p0.y = ground( p0.x, p0.z ) + 0.045; p1.y = ground( p1.x, p1.z ) + 0.07;
			spruceBranch( k, R, p0, p1, 0.012 + R() * 0.008, mixc( '#5b4d40', '#6e6254', R() ), needle( R() ) );

		}

	}

	// --- the sign where the skid track leaves the trail: a red-bordered triangle on a stake,
	// facing those coming down the trail (Achtung - Forstarbeiten), a board under it
	{

		const bx = - 4.45, bz = 5.95, face = V( 0.81, 0, 0.58 ).normalize(), u = V( face.z, 0, - face.x );
		const g = ground( bx, bz );
		k.box( bx, g + 0.62, bz, 0.07, 1.64, 0.07, M.LOG, mixc( '#7c6a54', '#6c5a45', R() ), { axis: [ 0, 1, 0 ], rot: [ 0, Math.atan2( face.x, face.z ), 0 ] } );
		const basis = new THREE.Matrix4().makeBasis( u, V( 0, 1, 0 ), face );
		const onSign = ( geo, ox, oy, oz ) => {

			geo.applyMatrix4( new THREE.Matrix4().makeTranslation( ox, oy, oz ) );
			geo.applyMatrix4( basis );
			geo.translate( bx, g, bz );
			return geo;

		};

		const tri = new THREE.Shape();
		const S = 0.62, hgt = S * Math.sqrt( 3 ) / 2;
		tri.moveTo( - S / 2, 0 ); tri.lineTo( S / 2, 0 ); tri.lineTo( 0, hgt ); tri.lineTo( - S / 2, 0 );
		k.add( onSign( new THREE.ExtrudeGeometry( tri, { depth: 0.008, bevelEnabled: false } ), 0, 1.13, 0.04 ), M.LEATHER, col( '#e6e2d8' ), u.toArray() );
		const inner = new THREE.Shape();
		const S2 = S * 0.64, h2 = S2 * Math.sqrt( 3 ) / 2, oy = hgt / 3 - h2 / 3;
		inner.moveTo( - S2 / 2, oy ); inner.lineTo( S2 / 2, oy ); inner.lineTo( 0, oy + h2 ); inner.lineTo( - S2 / 2, oy );
		const border = new THREE.Shape();
		border.moveTo( - S / 2 + 0.02, 0.012 ); border.lineTo( S / 2 - 0.02, 0.012 ); border.lineTo( 0, hgt - 0.025 ); border.lineTo( - S / 2 + 0.02, 0.012 );
		border.holes.push( inner );
		k.add( onSign( new THREE.ExtrudeGeometry( border, { depth: 0.003, bevelEnabled: false } ), 0, 1.13, 0.048 ), M.LEATHER, col( '#c2261d' ), u.toArray() );
		// the exclamation mark
		k.add( onSign( new THREE.BoxGeometry( 0.03, 0.12, 0.004 ), 0, 1.13 + hgt * 0.43, 0.05 ), M.LEATHER, col( '#1c1b1a' ) );
		k.add( onSign( new THREE.BoxGeometry( 0.03, 0.03, 0.004 ), 0, 1.13 + hgt * 0.2, 0.05 ), M.LEATHER, col( '#1c1b1a' ) );
		// the board under it, lettered (too small to read from the trail)
		k.add( onSign( new THREE.BoxGeometry( 0.56, 0.17, 0.012 ), 0, 1.02, 0.04 ), M.LEATHER, col( '#e6e2d8' ) );
		for ( const [ w, y ] of [ [ 0.46, 1.055 ], [ 0.36, 1.0 ] ] ) k.add( onSign( new THREE.BoxGeometry( w, 0.028, 0.003 ), 0, y, 0.0475 ), M.LEATHER, col( '#2a2826' ) );
		collision.push( [ bx, bz, 0.08, 0.08 ] );

	}

	// --- the floor: the skin of trodden earth, needle litter and sawdust over the whole working
	// ground; the ruts; heaps of sawdust; chips, bark and twigs strewn over it
	{

		// the ruts first (their wheels' paths mark the floor under them)
		const wheels = [];
		for ( const p of PASSES ) {

			const { S, n } = trackCurve( p.pts, 0.25 );
			for ( let i = 0; i <= n; i ++ ) {

				const q = S[ i ], t = S[ Math.min( n, i + 1 ) ].clone().sub( S[ Math.max( 0, i - 1 ) ] ).normalize();
				const h = p.half ?? 0.82;
				if ( h > 0 ) for ( const s of [ - 1, 1 ] ) wheels.push( [ q.x - t.z * h * s, q.z + t.x * h * s ] );
				else wheels.push( [ q.x, q.z ] );

			}

		}

		const Pc = {
			litter: col( '#86603f' ), litter2: col( '#9a6d43' ), earth: col( '#654a32' ), earth2: col( '#7a5a3d' ),
			wet: col( '#2c2118' ), dust: col( '#e2c38e' ), dust2: col( '#b99a68' ), moss: col( '#4f5d2c' ), rim: col( '#2e2519' ),
			chip: col( '#c4a577' ), bark: col( '#4a3526' ),
		};
		const tmp = new THREE.Color(), out = new THREE.Color();
		const paint = ( x, z, cv = 1 ) => {

			const n1 = fbm( x * 0.55, z * 0.55 ), n2 = vnoise( x * 2.3 + 9, z * 2.3 - 4 ), n3 = vnoise( x * 5.1 - 2, z * 5.1 + 3 );
			out.copy( Pc.litter ).lerp( Pc.litter2, 0.5 + 0.5 * n1 ).multiplyScalar( 0.8 + 0.4 * ( 0.5 + 0.5 * n3 ) );
			// the yard, trodden to earth, and the ruts' margins
			let dr = 9;
			for ( const [ wx, wz ] of wheels ) {

				const d = ( x - wx ) ** 2 + ( z - wz ) ** 2;
				if ( d < dr ) dr = d;

			}

			const yq = Math.hypot( ( x - 0.4 ) / 5.6, ( z - 0.6 ) / 3.3 );
			const tr = Math.max( ( 1 - ss( 0.45, 1.1, yq + 0.25 * n2 ) ) * 0.75, 1 - ss( 0.35, 1.1, Math.sqrt( dr ) + 0.2 * n3 ) );
			out.lerp( tmp.copy( Pc.earth ).lerp( Pc.earth2, 0.5 + 0.5 * n2 ), tr * 0.9 );
			for ( const [ wx, wz, r ] of wetAt ) out.lerp( Pc.wet, ( 1 - ss( r * 0.45, r, Math.hypot( x - wx, z - wz ) + 0.2 * n2 ) ) * 0.85 );
			// sawdust where logs were cut, pale and fresh, browner where it has been trodden in
			let s = 0;
			for ( const [ sx, sz, r, st ] of dust ) s = Math.max( s, st * ( 1 - ss( r * 0.2, r, Math.hypot( x - sx, z - sz ) + 0.22 * r * n3 ) ) );
			out.lerp( tmp.copy( Pc.dust2 ).lerp( Pc.dust, 0.5 + 0.5 * n3 ), s );
			// flecks: bits of chip and bark, a darker hollow
			const f = hash2( Math.round( x * 3.6 ), Math.round( z * 3.6 ) );
			if ( f > 0.9 ) out.lerp( Pc.chip, 0.35 ); else if ( f < 0.1 ) out.lerp( Pc.bark, 0.5 );
			// toward the edge: moss creeping back in over the litter, darker
			out.lerp( tmp.copy( Pc.moss ).lerp( Pc.rim, 0.5 + 0.5 * n2 ), ( 1 - ss( 0.15, 0.9, cv ) ) * 0.9 );
			return out.multiplyScalar( shadeAt( x, z ) );

		};

		// (the mud dark and wet round the pools in the yard, below)
		wetAt.push( [ - 0.6, 1.25, 0.8 ], [ 3.3, - 0.95, 0.6 ] );
		drape( gk, ground, { x0: - 9, x1: 9, z0: - 6.5, z1: 6.5, step: 0.3, cover: coverAt, paint } );
		for ( const p of PASSES ) tracks( gk, ground, p.pts, { half: p.half ?? 0.82, w: p.w ?? 0.42, step: p.step ?? 0.09, tread: p.tread ?? true, lift: p.lift, fade: p.fade ?? [ true, true ], under: ( x, z ) => paint( x, z, coverAt( x, z ) ), puddles: p.puddles ?? [], tone: shadeAt } );
		for ( const [ x, z, rx, rz, h, c, seed ] of heaps ) mound( gk, ground, x, z, rx, rz, h, c, seed );
		pool( gk, ground, - 0.6, 1.25, 0.42, 0.26, 1.7 );
		pool( gk, ground, 3.3, - 0.95, 0.3, 0.22, 4.4 );

		// chips, bark and sawdust crumbs: small flakes lying flat on the floor, all one mesh
		const pos = [], cols = [], idx = [];
		const flake = ( x, z, len, wid, yaw, c, curl = 0 ) => {

			const y = ground( x, z ) + 0.038, ca = Math.cos( yaw ), sa = Math.sin( yaw ), o = pos.length / 3;
			const tx = ( R() - 0.5 ) * 0.4, tz = ( R() - 0.5 ) * 0.4;
			for ( let i = 0; i <= 2; i ++ ) for ( const v of [ - 1, 1 ] ) {

				const lx = ( i / 2 - 0.5 ) * len, lz = v * wid / 2 * ( i === 2 ? 0.6 : 1 );
				pos.push( x + ca * lx - sa * lz, y + lx * tx + lz * tz + curl * Math.abs( v ), z + sa * lx + ca * lz );
				cols.push( c.r, c.g, c.b );

			}

			for ( let i = 0; i < 2; i ++ ) idx.push( o + i * 2, o + i * 2 + 1, o + i * 2 + 2, o + i * 2 + 1, o + i * 2 + 3, o + i * 2 + 2 );

		};

		const nearRut = ( x, z ) => {

			for ( const [ wx, wz ] of wheels ) if ( ( x - wx ) ** 2 + ( z - wz ) ** 2 < 0.16 ) return true;
			return false;

		};

		const chipC = () => R() < 0.18 ? mixc( '#5d4636', '#6e5646', R() ) : mixc( '#d8bd8e', '#b89a70', R() ).multiplyScalar( 0.8 + 0.3 * R() );
		for ( const [ cx, cz, r, n ] of chipsAt ) for ( let i = 0, m = 0; i < n * 3 && m < n; i ++ ) {

			const a = R() * Math.PI * 2, d = 0.25 + Math.pow( R(), 1.6 ) * r, x = cx + Math.cos( a ) * d, z = cz + Math.sin( a ) * d;
			if ( ( ! free( x, z, 0 ) && d > 0.55 ) || nearRut( x, z ) ) continue;
			m ++;
			flake( x, z, 0.03 + R() * 0.07, 0.015 + R() * 0.03, R() * 6.3, chipC() );

		}

		// bark peeled in strips in the skidding, over the yard and along the ruts
		for ( let i = 0, m = 0; i < 600 && m < 110; i ++ ) {

			const x = ( R() - 0.5 ) * 15, z = ( R() - 0.5 ) * 10.5;
			if ( ! free( x, z, 0.05 ) || nearRut( x, z ) || coverAt( x, z ) < 0.5 ) continue;
			m ++;
			const inside = R() < 0.4;
			flake( x, z, 0.12 + R() * 0.3, 0.03 + R() * 0.04, R() * 6.3, inside ? mixc( '#9e6f48', '#8a5e3c', R() ) : mixc( '#5a4535', '#6b5747', R() ), 0.008 + R() * 0.012 );

		}

		// crumbs of sawdust and chips about the landing
		for ( let i = 0, m = 0; i < 600 && m < 160; i ++ ) {

			const x = ( R() - 0.5 ) * 15, z = ( R() - 0.5 ) * 10.5;
			if ( ! free( x, z, 0 ) || nearRut( x, z ) || coverAt( x, z ) < 0.7 ) continue;
			m ++;
			flake( x, z, 0.02 + R() * 0.04, 0.012 + R() * 0.02, R() * 6.3, chipC() );

		}

		orient( pos, idx, UPWARD );
		gk.add( cmesh( pos, idx, cols ), M.END, null, [ 1, 0, 0 ] );

		// twigs snapped off in the work, lying about
		for ( let i = 0, m = 0; i < 300 && m < 42; i ++ ) {

			const x = ( R() - 0.5 ) * 15, z = ( R() - 0.5 ) * 10.5, a = R() * Math.PI, l = 0.2 + R() * 0.45;
			const x1 = x + Math.cos( a ) * l, z1 = z + Math.sin( a ) * l;
			if ( ! free( x, z, 0.05 ) || ! free( x1, z1, 0.05 ) || nearRut( x, z ) || coverAt( x, z ) < 0.6 ) continue;
			m ++;
			const r = 0.006 + R() * 0.008, p0 = V( x, ground( x, z ) + 0.03 + r, z ), p1 = V( x1, ground( x1, z1 ) + 0.03 + r, z1 );
			rod( gk, [ p0, p0.clone().lerp( p1, 0.5 ).add( V( ( R() - 0.5 ) * 0.04, 0.01, ( R() - 0.5 ) * 0.04 ) ), p1 ], r, r, M.BARK, mixc( '#5a4a3c', '#716252', R() ), 4, ( t ) => 1 - 0.5 * t );

		}

	}

	k.parts.push( ...gk.parts );
	return { geometry: k.build(), parts, info: { notice, plank, collision } };

}

// a chainsaw of the eighties, orange and grey, set down at base (the middle of its underside)
// facing yaw (its bar's way): the housing, the top cover, the rear handle and the bar looped
// over it, the hand guard, the guide bar and its chain on the right
function chainsaw( k, base, yaw ) {

	const MS = new THREE.Matrix4().makeRotationY( yaw - Math.PI / 2 ).setPosition( base );
	// (its frame: x toward the bar's tip, y up, z to its left)
	const S = ( x, y, z ) => V( x, y, z ).applyMatrix4( MS );
	const SD = ( x, y, z ) => V( x, y, z ).transformDirection( MS );
	const box = ( x, y, z, sx, sy, sz, mat, c, round = 0 ) => {

		const g = round > 0 ? new RoundedBoxGeometry( sx, sy, sz, 1, round ) : new THREE.BoxGeometry( sx, sy, sz );
		g.translate( x, y, z );
		g.applyMatrix4( MS );
		k.add( g, mat, col( c ), SD( 1, 0, 0 ).toArray(), S( x, y, z ).toArray() );

	};

	box( - 0.01, 0.065, 0, 0.3, 0.13, 0.19, M.LEATHER, '#e0601c', 0.025 );
	box( 0, 0.155, 0.005, 0.25, 0.07, 0.17, M.LEATHER, '#cfcbc0', 0.025 );
	box( 0.125, 0.065, - 0.11, 0.15, 0.09, 0.035, M.LEATHER, '#272523', 0.01 );
	box( 0.14, 0.06, 0.06, 0.04, 0.06, 0.07, M.IRON, '#8b8d8c' );
	// the guide bar: steel, its chain standing proud round its edge; its nose rounded
	box( 0.39, 0.055, - 0.115, 0.46, 0.064, 0.007, M.IRON, '#9a9c9c' );
	box( 0.39, 0.055, - 0.115, 0.47, 0.078, 0.0045, M.IRON, '#2d2b29' );
	const nose = new THREE.CylinderGeometry( 0.037, 0.037, 0.0045, 10 );
	nose.rotateX( Math.PI / 2 );
	nose.translate( 0.625, 0.055, - 0.115 );
	nose.applyMatrix4( MS );
	k.add( nose, M.IRON, col( '#2d2b29' ), SD( 0, 0, 1 ).toArray() );
	// the handles
	rod( k, [ [ - 0.13, 0.16, 0 ], [ - 0.24, 0.17, 0 ], [ - 0.33, 0.14, 0 ], [ - 0.36, 0.08, 0 ], [ - 0.32, 0.03, 0 ], [ - 0.2, 0.03, 0 ] ].map( ( p ) => S( ...p ) ), 0.016, 0.02, M.LEATHER, col( '#272523' ), 6 );
	rod( k, [ [ 0.03, 0.02, 0.105 ], [ 0.03, 0.2, 0.11 ], [ 0.04, 0.27, 0.06 ], [ 0.05, 0.27, - 0.04 ], [ 0.06, 0.18, - 0.1 ], [ 0.06, 0.1, - 0.1 ] ].map( ( p ) => S( ...p ) ), 0.012, 0.012, M.LEATHER, col( '#1f1e1c' ), 6 );
	beam( k, S( 0.1, 0.17, 0 ), S( 0.135, 0.3, 0 ), 0.14, 0.008, M.LEATHER, col( '#1f1e1c' ), { up: SD( 1, 0, 0 ) } );
	box( - 0.03, 0.16, 0.1, 0.05, 0.025, 0.02, M.LEATHER, '#1f1e1c' );

}

// a fuel can for the saw, two in one: the bigger red side for the petrol, the black for the chain
// oil, one handle over both; standing at ( x, z ) turned by yaw
function combiCan( k, ground, x, z, yaw ) {

	const c = Math.cos( yaw ), s = Math.sin( yaw ), g = ground( x, z ) + 0.012;
	const at = ( dx, dz ) => [ x + c * dx + s * dz, z - s * dx + c * dz ];
	const box = ( dx, dy, dz, sx, sy, sz, color ) => {

		const [ px, pz ] = at( dx, dz );
		k.box( px, g + dy, pz, sx, sy, sz, M.LEATHER, col( color ), { rot: [ 0, yaw, 0 ] } );

	};

	box( 0, 0.14, 0, 0.2, 0.28, 0.13, '#b5281d' );
	box( 0.15, 0.12, 0, 0.1, 0.24, 0.13, '#23211f' );
	box( 0.05, 0.31, 0, 0.3, 0.025, 0.04, '#23211f' );
	for ( const dx of [ - 0.05, 0.16 ] ) box( dx, 0.29, 0.035, 0.035, 0.03, 0.035, dx < 0 ? '#e0b020' : '#23211f' );

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
