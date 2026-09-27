import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Kit, M, col, mixc } from './kit.js';
import { sweep, lathe, rope } from './jetty.js';

// Two places in the spruce wood above the lake.
//
// The camp (after photographs of tents left out on the moors and in woods, mockups/refs/camp):
// a hiker's pitch a few days old and rained on. A two-man dome tent of the early nineties, a
// faded orange inner under a grey fly, has come down on one side: one of its two crossed poles
// has snapped, its broken end pokes up through the nylon; the other has sprung half out of its
// sleeve and stands over the heap in a bare arc (ref r1); the fly is twisted half off. Pegs
// pulled and lying about. The door is unzipped and a sleeping bag lies half out of it,
// empty. In front: a dead fire in a ring of stones, a gas stove with
// its pot knocked off, a mug with the spoon still in it; a big red rucksack slumped against a
// stump with its foam mat strapped under the lid; a torch in the moss, a map half unfolded, one
// boot. On a flat rock by the path, a small black camera; on the ground, an open notebook.
//
// The charcoal burner's clearing (after photographs of Kohlenmeiler in the Bavarian and
// Austrian museums and of the Harz Köte, mockups/refs/kiln): the kiln, a dome of billets stacked
// round a central shaft and covered with turf and then a skin of charcoal dust and earth, vent
// holes poked round its foot and near its crown; the ground black all round it; the burner's
// ladder leaning on it; rakes and a shovel; a heap of finished charcoal with two filled sacks;
// a stack of split billets waiting; and the burner's hut, a cone of poles shingled with bark
// slabs, a low door under a little porch roof, facing the kiln so he could watch it at night.
//
// Frames: origin at the prop's base, y up, +z toward the trail. ground( x, z ) is the terrain's
// height in that frame; everything is set down on it. Cloth is built two-sided (a second skin a
// few millimetres under, wound the other way), so it shows from below with a front-side material.
//
// buildCamp( ground ) -> { geometry, parts: { camera, notebook }, info: { camera, notebook,
//   collision: [ [ cx, cz, halfX, halfZ ], ... ] } }
// buildKiln( ground ) -> { geometry, parts: {}, info: { vents: [ [ x, y, z ], ... ] (each a few
//   cm out from its hole, 15 round the foot and 5 near the crown), top (the crown's stopped
//   shaft), door (the burner's hut's doorway, on the ground), collision } }

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
const lerp = ( a, b, t ) => a + ( b - a ) * t;
const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

function rand( seed ) {

	let s = seed >>> 0;
	return () => ( ( s = Math.imul( s ^ ( s >>> 15 ), 2246822507 ) + 0x6d2b79f5 | 0 ) >>> 0 ) / 4294967296;

}

// smooth value noise in -1..1
function hash2( x, z ) {

	const s = Math.sin( x * 127.1 + z * 311.7 ) * 43758.5453;
	return s - Math.floor( s );

}

function vnoise( x, z ) {

	const xi = Math.floor( x ), zi = Math.floor( z ), xf = x - xi, zf = z - zi;
	const u = xf * xf * ( 3 - 2 * xf ), v = zf * zf * ( 3 - 2 * zf );
	const a = hash2( xi, zi ), b = hash2( xi + 1, zi ), c = hash2( xi, zi + 1 ), d = hash2( xi + 1, zi + 1 );
	return ( a + ( b - a ) * u + ( c - a ) * v + ( a - b - c + d ) * u * v ) * 2 - 1;

}

// creases in slack cloth: sharp ridges running a few ways at once, 0..~1
const CREASES = [ 0, 1, 2, 3, 4 ].map( ( i ) => {

	const a = i * 2.39996 + 0.7;
	return [ Math.cos( a ), Math.sin( a ), 6 + i * 2.7, i * 1.7 ];

} );

function crease( x, z ) {

	let s = 0;
	for ( const [ dx, dz, f, ph ] of CREASES ) {

		const v = Math.sin( ( x * dx + z * dz ) * f + ph + 1.2 * vnoise( x * 2.2 + ph, z * 2.2 ) );
		s += Math.pow( 1 - Math.abs( v ), 3 ) * ( 0.45 + 0.55 * vnoise( x * 1.4 + ph * 3, z * 1.4 - ph ) );

	}

	return Math.max( 0, s / CREASES.length * 2.2 );

}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// Built in an object's own frame, then turned and set down in the prop's (its pieces are kept
// until then, and handed to the real kit in one go)
class Local extends Kit {

	constructor() {

		super( () => - 100, () => 1 );
		this.items = [];

	}

	add( geo, mat, color, axis = [ 1, 0, 0 ], center = [ 0, 0, 0 ] ) {

		this.items.push( { geo, mat, color, axis: V( ...axis ), center: V( ...center ) } );
		return this;

	}

	apply( m ) {

		for ( const it of this.items ) {

			it.geo.applyMatrix4( m );
			it.axis.transformDirection( m );
			it.center.applyMatrix4( m );

		}

		return this;

	}

	// turn it, then stand it on y = 0 by its lowest point (a little sunk, if asked)
	settle( rx, ry, rz, sink = 0 ) {

		this.apply( new THREE.Matrix4().makeRotationFromEuler( new THREE.Euler( rx, ry, rz, 'YXZ' ) ) );
		let lo = Infinity;
		for ( const it of this.items ) {

			it.geo.computeBoundingBox();
			lo = Math.min( lo, it.geo.boundingBox.min.y );

		}

		return this.apply( new THREE.Matrix4().makeTranslation( 0, - lo - sink, 0 ) );

	}

	into( k, m ) {

		this.apply( m );
		for ( const it of this.items ) k.add( it.geo, it.mat, it.color, it.axis.toArray(), it.center.toArray() );
		this.items = [];
		return k;

	}

}

// a frame lying on the ground at ( x, z ): its y along the ground's normal, its z turned to yaw
function onGround( ground, x, z, yaw = 0, lift = 0 ) {

	const e = 0.08;
	const n = V( ground( x - e, z ) - ground( x + e, z ), 2 * e, ground( x, z - e ) - ground( x, z + e ) ).normalize();
	const f = V( Math.sin( yaw ), 0, Math.cos( yaw ) );
	f.addScaledVector( n, - f.dot( n ) ).normalize();
	const r = new THREE.Vector3().crossVectors( n, f ).normalize();
	return new THREE.Matrix4().makeBasis( r, n, f ).setPosition( x, ground( x, z ) + lift, z );

}

// a soft lump: a sphere squared off toward a box (sq 0..1) to half-extents e, then reshaped by
// fn( q, sx, sy, sz ) (q in metres, s* the unit-cube coordinates), turned by rot and set at pos
function blob( k, e, sq, pos, rot, mat, color, fn = null, seg = [ 14, 10 ] ) {

	let g = new THREE.SphereGeometry( 1, seg[ 0 ], seg[ 1 ] );
	g.deleteAttribute( 'uv' );
	g.deleteAttribute( 'normal' );
	g = mergeVertices( g );
	const p = g.getAttribute( 'position' ), q = V( 0, 0, 0 );
	for ( let i = 0; i < p.count; i ++ ) {

		let x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
		const m = Math.max( Math.abs( x ), Math.abs( y ), Math.abs( z ) ) || 1;
		x = lerp( x, x / m, sq ); y = lerp( y, y / m, sq ); z = lerp( z, z / m, sq );
		q.set( x * e[ 0 ], y * e[ 1 ], z * e[ 2 ] );
		if ( fn ) fn( q, x, y, z );
		p.setXYZ( i, q.x, q.y, q.z );

	}

	g.computeVertexNormals();
	k.put( g, pos[ 0 ], pos[ 1 ], pos[ 2 ], rot );
	return k.add( g, mat, color, [ 1, 0, 0 ], pos );

}

// a sheet of cloth from a grid of points P[ i ][ j ]: both its faces (the underside darker and a
// few millimetres under), colours per point; skip( i, j ) leaves a cell out (a doorway)
function sheet( k, P, top, under, { skip = null, t = 0.004, mat = M.LEATHER } = {} ) {

	const I = P.length, J = P[ 0 ].length;
	const pos = [], ca = [], cb = [], idx = [];
	for ( let i = 0; i < I; i ++ ) for ( let j = 0; j < J; j ++ ) {

		pos.push( P[ i ][ j ].x, P[ i ][ j ].y, P[ i ][ j ].z );
		const c = top( i, j ), d = under( i, j );
		ca.push( c.r, c.g, c.b );
		cb.push( d.r, d.g, d.b );

	}

	for ( let i = 0; i < I - 1; i ++ ) for ( let j = 0; j < J - 1; j ++ ) {

		if ( skip && skip( i, j ) ) continue;
		const a = i * J + j, b = a + 1, c = a + J, d = c + 1;
		idx.push( a, b, c, b, d, c );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'color', new THREE.Float32BufferAttribute( ca, 3 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	// face it up on the whole
	const n = g.getAttribute( 'normal' );
	let sy = 0;
	for ( let i = 0; i < n.count; i ++ ) sy += n.getY( i );
	if ( sy < 0 ) {

		for ( let i = 0; i < idx.length; i += 3 ) [ idx[ i + 1 ], idx[ i + 2 ] ] = [ idx[ i + 2 ], idx[ i + 1 ] ];
		g.setIndex( idx );
		g.computeVertexNormals();

	}

	// the underside: the same grid, a little under, wound the other way
	const nn = g.getAttribute( 'normal' ), pb = [];
	for ( let i = 0; i < nn.count; i ++ ) pb.push( pos[ i * 3 ] - nn.getX( i ) * t, pos[ i * 3 + 1 ] - nn.getY( i ) * t, pos[ i * 3 + 2 ] - nn.getZ( i ) * t );
	const ib = g.index.array.slice();
	for ( let i = 0; i < ib.length; i += 3 ) [ ib[ i + 1 ], ib[ i + 2 ] ] = [ ib[ i + 2 ], ib[ i + 1 ] ];
	const h = new THREE.BufferGeometry();
	h.setAttribute( 'position', new THREE.Float32BufferAttribute( pb, 3 ) );
	h.setAttribute( 'color', new THREE.Float32BufferAttribute( cb, 3 ) );
	h.setIndex( Array.from( ib ) );
	h.computeVertexNormals();
	k.add( g, mat, null );
	k.add( h, mat, null );

}

// a soft tube lying along the ground through pts ([ x, z ] in the prop frame), its section an
// ellipse w( t ) wide and h( t ) high (t 0..1 along it), closed at both ends
function sausage( k, ground, pts, w, h, mat, color, segs = 10 ) {

	const curve = new THREE.CatmullRomCurve3( pts.map( ( [ x, z ] ) => V( x, 0, z ) ) );
	const N = pts.length * 7, pos = [], idx = [];
	for ( let i = 0; i <= N; i ++ ) {

		const t = i / N, p = curve.getPoint( t ), d = curve.getTangent( t );
		const side = V( d.z, 0, - d.x ).normalize(), g = ground( p.x, p.z );
		const ww = w( t ), hh = h( t );
		for ( let j = 0; j < segs; j ++ ) {

			const a = j / segs * Math.PI * 2;
			const cx = Math.cos( a ) * ww / 2, cy = ( Math.sin( a ) * 0.5 + 0.5 ) * hh;
			pos.push( p.x + side.x * cx, g + cy + 0.012, p.z + side.z * cx );

		}

	}

	for ( let i = 0; i < N; i ++ ) for ( let j = 0; j < segs; j ++ ) {

		const a = i * segs + j, b = i * segs + ( j + 1 ) % segs, c = a + segs, d = b + segs;
		idx.push( a, c, b, b, c, d );

	}

	// the ends: a fan to the middle of each
	for ( const [ i, flip ] of [ [ 0, true ], [ N, false ] ] ) {

		let cx = 0, cy = 0, cz = 0;
		for ( let j = 0; j < segs; j ++ ) {

			cx += pos[ ( i * segs + j ) * 3 ]; cy += pos[ ( i * segs + j ) * 3 + 1 ]; cz += pos[ ( i * segs + j ) * 3 + 2 ];

		}

		const c = pos.length / 3;
		pos.push( cx / segs, cy / segs, cz / segs );
		for ( let j = 0; j < segs; j ++ ) {

			const a = i * segs + j, b = i * segs + ( j + 1 ) % segs;
			if ( flip ) idx.push( c, a, b ); else idx.push( c, b, a );

		}

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	// (faces outward, whichever way the path runs)
	const n = g.getAttribute( 'normal' );
	let s = 0;
	for ( let i = 0; i < ( N + 1 ) * segs; i ++ ) s += n.getY( i ) * Math.sin( ( i % segs ) / segs * Math.PI * 2 );
	if ( s < 0 ) {

		const ia = g.index.array;
		for ( let i = 0; i < ia.length; i += 3 ) [ ia[ i + 1 ], ia[ i + 2 ] ] = [ ia[ i + 2 ], ia[ i + 1 ] ];
		g.computeVertexNormals();

	}

	return k.add( g, mat, color );

}

// a patch of ground following the terrain: polar rings round ( cx, cz ) (from r0 out, if given),
// radius r( a ) at angle a, lifted by lift( x, z, f ); colour c( x, z, f ) and occlusion m( f ) by
// f = 0 middle .. 1 rim. (Not the dirt shader: its pebbles show as white flecks on dark ground.)
function patch( k, ground, cx, cz, r, lift, c, m, { rings = 6, segs = 36, mat = M.LEATHER, r0 = 0 } = {} ) {

	const pos = [], cols = [], fs = [], idx = [];
	for ( let i = 0; i <= rings; i ++ ) for ( let j = 0; j < segs; j ++ ) {

		const a = j / segs * Math.PI * 2, f = i / rings;
		const rr = r0 > 0 ? lerp( r0, r( a ), f ) : r( a ) * Math.max( f, 0.02 );
		const x = cx + Math.cos( a ) * rr, z = cz + Math.sin( a ) * rr;
		pos.push( x, ground( x, z ) + lift( x, z, f ), z );
		const cc = c( x, z, f );
		cols.push( cc.r, cc.g, cc.b );
		fs.push( f );

	}

	for ( let i = 0; i < rings; i ++ ) for ( let j = 0; j < segs; j ++ ) {

		const a = i * segs + j, b = i * segs + ( j + 1 ) % segs, cc = a + segs, d = b + segs;
		idx.push( a, cc, b, b, cc, d );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'color', new THREE.Float32BufferAttribute( cols, 3 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	if ( g.getAttribute( 'normal' ).getY( 0 ) < 0 ) {

		const ia = g.index.array;
		for ( let i = 0; i < ia.length; i += 3 ) [ ia[ i + 1 ], ia[ i + 2 ] ] = [ ia[ i + 2 ], ia[ i + 1 ] ];
		g.computeVertexNormals();

	}

	g.setAttribute( 'fmask', new THREE.Float32BufferAttribute( fs, 1 ) );
	const ni = g.toNonIndexed();
	const fm = ni.getAttribute( 'fmask' ).array.slice();
	k.add( ni, mat, null );
	const last = k.parts[ k.parts.length - 1 ];
	const ao = last.getAttribute( 'aAO' );
	for ( let i = 0; i < ao.count; i ++ ) ao.setX( i, m( fm[ i ] ) );
	return last;

}

// an irregular flat stone, its top face level at y = top
function flatStone( k, x, z, rx, rz, top, depth, color, R, yaw = 0 ) {

	const pts = [];
	const nv = 9;
	for ( let j = 0; j < nv; j ++ ) {

		const a = j / nv * Math.PI * 2 + ( R() - 0.5 ) * 0.4, rr = 0.8 + R() * 0.3;
		pts.push( new THREE.Vector2( Math.cos( a ) * rr * rx, Math.sin( a ) * rr * rz ) );

	}

	const bev = 0.035;
	const g = new THREE.ExtrudeGeometry( new THREE.Shape( pts ), { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: 0.045, bevelSegments: 2 } );
	g.rotateX( - Math.PI / 2 );
	g.rotateY( yaw );
	g.translate( x, top - depth - bev, z );
	return k.add( g, M.STONE, color, [ 1, 0, 0 ], [ x, top, z ] );

}

// a split billet: a half or a quarter round (or a small whole one), len long along +z, centred
function billet( k, r, len, kind, turn, pos, rot, color ) {

	const pts = [];
	if ( kind === 2 ) {

		for ( let i = 0; i < 7; i ++ ) pts.push( new THREE.Vector2( Math.cos( i / 7 * Math.PI * 2 ) * r, Math.sin( i / 7 * Math.PI * 2 ) * r ) );

	} else {

		const span = kind === 0 ? Math.PI : Math.PI / 2, n = kind === 0 ? 5 : 3;
		pts.push( new THREE.Vector2( 0, 0 ) );
		for ( let i = 0; i <= n; i ++ ) {

			const a = turn + i / n * span;
			pts.push( new THREE.Vector2( Math.cos( a ) * r, Math.sin( a ) * r ) );

		}

	}

	const g = new THREE.ExtrudeGeometry( new THREE.Shape( pts ), { depth: len, bevelEnabled: false } );
	g.translate( 0, 0, - len / 2 );
	k.put( g, pos[ 0 ], pos[ 1 ], pos[ 2 ], rot );
	const ax = V( 0, 0, 1 ).applyEuler( new THREE.Euler( rot?.[ 0 ] || 0, rot?.[ 1 ] || 0, rot?.[ 2 ] || 0, rot?.[ 3 ] || 'XYZ' ) );
	return k.add( g, M.LOG, color, ax.toArray(), pos );

}

const tube = ( k, pts, r, mat, color, radial = 6, tension = 0.5 ) => {

	const curve = new THREE.CatmullRomCurve3( pts, false, 'catmullrom', tension );
	const g = new THREE.TubeGeometry( curve, Math.min( 60, Math.max( pts.length * 3, Math.ceil( curve.getLength() / 0.05 ) ) ), r, radial, false );
	return k.add( g, mat, color, curve.getTangent( 0.5 ).toArray(), curve.getPoint( 0.5 ).toArray() );

};

const cyl = ( k, x, y, z, r0, r1, h, mat, color, seg = 12, rot = null ) => {

	const g = new THREE.CylinderGeometry( r1, r0, h, seg );
	g.translate( 0, h / 2, 0 );
	k.put( g, x, y, z, rot );
	return k.add( g, mat, color, [ 0, 1, 0 ], [ x, y, z ] );

};

// ambient occlusion for small things near the ground: less dark than the default, which is
// made for walls
const lowAO = ( ground ) => ( x, y, z, ny ) => ( ny < - 0.5 ? 0.65 : 1 ) * ( 0.62 + 0.38 * ss( - 0.02, 0.45, y - ground( x, z ) ) );

// ===========================================================================
// the camp
// ===========================================================================

// The tent, in its own frame: origin at the middle of its floor, +u along it, +w out of its
// door. T: where it stands in the prop's frame and how it is turned.
function buildTent( k, ground, T ) {

	const cy = Math.cos( T.yaw ), sy = Math.sin( T.yaw );
	const W = ( u, w ) => [ T.x + cy * u + sy * w, T.z - sy * u + cy * w ];
	const toTent = ( x, z ) => {

		const dx = x - T.x, dz = z - T.z;
		return [ cy * dx - sy * dz, sy * dx + cy * dz ];

	};

	const Pt = ( u, h, w ) => {

		const [ x, z ] = W( u, w );
		return V( x, ground( x, z ) + h, z );

	};

	const A = 1.05, B = 0.68;
	// the floor's corners: back-left, back-right, front-right, front-left - that one's peg out,
	// the corner dragged in as the tent went over
	const Cn = [ [ - A, - B ], [ A, - B ], [ A, B ], [ - A + 0.2, B - 0.13 ] ];
	const floor = ( s, t ) => {

		let u = lerp( lerp( Cn[ 0 ][ 0 ], Cn[ 1 ][ 0 ], s ), lerp( Cn[ 3 ][ 0 ], Cn[ 2 ][ 0 ], s ), t );
		let w = lerp( lerp( Cn[ 0 ][ 1 ], Cn[ 1 ][ 1 ], s ), lerp( Cn[ 3 ][ 1 ], Cn[ 2 ][ 1 ], s ), t );
		// the walls pulled in a little between the corners
		u -= 0.05 * Math.sin( Math.PI * t ) * ( 2 * s - 1 );
		w -= 0.04 * Math.sin( Math.PI * s ) * ( 2 * t - 1 );
		return [ u, w ];

	};

	// --- the poles, in the tent's frame ( u, height, w ). B, one diagonal, has snapped: its back
	// half still stands, crooked, from the back-left corner toward the door, and holds up the
	// one peak left, its broken end through the nylon; its front half lies flat inside. A, the
	// other, is whole but has sprung half out of its sleeve: lying low along the back, then out
	// in the air over the right end in a bare arc, its tip in the moss (as in ref r1).
	// in: where it runs in its sleeve (the cloth lies on it); out: the rest is bare
	const poles = [
		{ pts: [ [ - 1.05, 0, - 0.68 ], [ - 0.8, 0.26, - 0.36 ], [ - 0.52, 0.43, - 0.02 ], [ - 0.36, 0.5, 0.2 ], [ - 0.3, 0.62, 0.3 ] ], tip: 0.13, broken: true },
		{ pts: [ [ 1.02, 0, 0.66 ], [ 0.8, 0.07, 0.44 ], [ 0.56, 0.1, 0.24 ], [ 0.4, 0.13, 0.1 ] ], tip: 0.06, broken: true },
		{ pts: [ [ - 0.85, 0.02, 0.52 ], [ - 0.95, 0.1, 0.0 ], [ - 0.55, 0.16, - 0.52 ], [ 0.1, 0.2, - 0.6 ], [ 0.62, 0.3, - 0.42 ], [ 1.0, 0.56, - 0.12 ], [ 1.3, 0.62, 0.25 ], [ 1.58, 0.36, 0.62 ], [ 1.72, 0.0, 0.85 ] ], out: 0.52 },
	].map( ( p ) => ( { ...p, pts: p.pts.map( ( [ u, h, w ] ) => Pt( u, h, w ) ) } ) );

	// the poles: grey alloy, shock-corded, a ferrule at each joint; each broken end splintered
	const sup = [];
	const alloy = col( '#80847f' );
	for ( const p of poles ) {

		const curve = new THREE.CatmullRomCurve3( p.pts );
		const len = curve.getLength();
		tube( k, p.pts, 0.0055, M.LEATHER, alloy, 5 );
		for ( let d = 0.46; d < len - 0.05; d += 0.46 ) {

			const c = curve.getPointAt( d / len ), tn = curve.getTangentAt( d / len );
			tube( k, [ c.clone().addScaledVector( tn, - 0.03 ), c.clone().addScaledVector( tn, 0.03 ) ], 0.0068, M.LEATHER, alloy.clone().multiplyScalar( 0.85 ), 6 );

		}

		const end = p.out ? len * p.out : len - p.tip;
		for ( let d = 0; d < end; d += 0.04 ) sup.push( curve.getPointAt( d / len ) );
		if ( p.broken ) {

			// splinters of the broken tube, and the elastic cord hanging out of it
			const e = curve.getPointAt( 1 ), tn = curve.getTangentAt( 1 );
			for ( const a of [ 0.4, 2.5, 4.4 ] ) {

				const s = V( Math.cos( a ), 0.3, Math.sin( a ) ).multiplyScalar( 0.012 );
				tube( k, [ e.clone(), e.clone().addScaledVector( tn, 0.02 ).add( s ) ], 0.0018, M.LEATHER, alloy, 3 );

			}

			tube( k, [ e.clone(), e.clone().addScaledVector( tn, 0.025 ).add( V( 0, - 0.02, 0.01 ) ), e.clone().add( V( 0.02, - 0.07, 0.03 ) ) ], 0.0015, M.LEATHER, col( '#2a2a2c' ), 3 );

		}

	}

	// and what is still inside holds the cloth up here and there: a stuff sack, a boot's partner,
	// the rolled clothes at the head end
	for ( const [ u, w, h, r ] of [ [ 0.42, - 0.12, 0.2, 0.14 ], [ 0.72, 0.1, 0.13, 0.1 ], [ - 0.72, - 0.3, 0.16, 0.12 ] ] ) {

		for ( let a = 0; a < 6.28; a += 0.9 ) sup.push( Pt( u + Math.cos( a ) * r, h * 0.8, w + Math.sin( a ) * r * 0.8 ) );
		sup.push( Pt( u, h, w ) );

	}

	// the cloth hangs from the poles: from each point it falls away more steeply the further it
	// is from it (a sag, not a tent's taut wall)
	const drape = ( x, z ) => {

		let h = - Infinity;
		for ( const p of sup ) {

			const d = Math.hypot( x - p.x, z - p.z );
			const y = p.y - d * ( 0.35 + 1.25 * d );
			if ( y > h ) h = y;

		}

		return h;

	};

	// the fly: twisted round off the front-left, still over the back and the right. Its own
	// rectangle in the tent's frame, turned a little
	const FLY = { u: 0.45, w: - 0.52, a: 0.3, hu: 1.05, hw: 0.72 };
	const flyLocal = ( u, w ) => {

		const du = u - FLY.u, dw = w - FLY.w, c = Math.cos( FLY.a ), s = Math.sin( FLY.a );
		return [ c * du - s * dw, s * du + c * dw ];

	};

	const underFly = ( u, w ) => {

		const [ a, b ] = flyLocal( u, w );
		return ss( 0.05, - 0.15, Math.max( Math.abs( a ) - FLY.hu, Math.abs( b ) - FLY.hw ) );

	};

	// the door: a D on the front wall, unzipped, its flap fallen out onto the ground
	const DOOR = [ 0.22, 0.53 ], SILL = 0.955;
	const doorTop = ( s ) => 0.69 + 0.15 * Math.pow( ( s - ( DOOR[ 0 ] + DOOR[ 1 ] ) / 2 ) / ( ( DOOR[ 1 ] - DOOR[ 0 ] ) / 2 ), 2 );
	const inDoor = ( s, t ) => s > DOOR[ 0 ] && s < DOOR[ 1 ] && t < SILL && t > doorTop( s );
	// the nearest point on the door's edge (the grid's cells are cut out whole, so the points
	// round the hole are drawn onto its curve, or its edge would go in steps)
	const doorEdge = ( s, t ) => {

		const d2 = ( a, b ) => ( ( a - s ) * 2 * A ) ** 2 + ( ( b - t ) * 2 * B ) ** 2;
		const cands = [ [ DOOR[ 0 ], Math.min( SILL, Math.max( doorTop( DOOR[ 0 ] ), t ) ) ], [ DOOR[ 1 ], Math.min( SILL, Math.max( doorTop( DOOR[ 1 ] ), t ) ) ], [ Math.min( DOOR[ 1 ], Math.max( DOOR[ 0 ], s ) ), SILL ] ];
		for ( let q = 0; q <= 24; q ++ ) {

			const sq = lerp( DOOR[ 0 ], DOOR[ 1 ], q / 24 );
			cands.push( [ sq, doorTop( sq ) ] );

		}

		let best = cands[ 0 ];
		for ( const c of cands ) if ( d2( c[ 0 ], c[ 1 ] ) < d2( best[ 0 ], best[ 1 ] ) ) best = c;
		return best;

	};

	// --- the inner tent: where its cloth lies, at ( s, t ) over the floor
	const innerAt = ( s, t ) => {

		const [ u, w ] = floor( s, t ), [ x, z ] = W( u, w );
		const g = ground( x, z );
		const e = Math.min( Math.min( s, 1 - s ) * 2 * A, Math.min( t, 1 - t ) * 2 * B );
		let y = drape( x, z ) + 0.012;
		y = g + Math.max( 0, y - g ) * Math.pow( Math.min( 1, e / 0.32 ), 0.5 );
		const dome = 1.05 * Math.sqrt( Math.max( 0, 1 - Math.pow( Math.abs( 2 * s - 1 ), 4 ) - Math.pow( Math.abs( 2 * t - 1 ), 4 ) ) );
		const slack = Math.min( 1, Math.max( 0, 1 - ( y - g ) / Math.max( 0.1, dome ) ) );
		// creases everywhere, and the walls bunched up in folds along the hem
		const hem = 1 - Math.min( 1, e / 0.4 );
		y += ( crease( x, z ) * ( 0.015 + 0.08 * slack ) + crease( x * 2.1 + 5, z * 2.1 ) * ( 0.025 + 0.05 * hem ) ) * Math.min( 1, e / 0.06 ) * ( 1 - 0.75 * underFly( u, w ) );
		y = Math.max( y, g + 0.02 );
		return { p: V( x, y, z ), h: y - g, slack };

	};

	// a grid of it, the door's cells left out
	const NI = 42, NJ = 29;
	const cut = ( i, j ) => i >= 0 && j >= 0 && i < NI && j < NJ && inDoor( ( i + 0.5 ) / NI, ( j + 0.5 ) / NJ );
	const P = [], H = [], S = [];
	for ( let i = 0; i <= NI; i ++ ) {

		P.push( [] ); H.push( [] ); S.push( [] );
		for ( let j = 0; j <= NJ; j ++ ) {

			let s = i / NI, t = j / NJ;
			const around = [ cut( i - 1, j - 1 ), cut( i, j - 1 ), cut( i - 1, j ), cut( i, j ) ];
			if ( around.some( ( c ) => c ) && ! around.every( ( c ) => c ) ) [ s, t ] = doorEdge( s, t );
			const c = innerAt( s, t );
			P[ i ].push( c.p );
			H[ i ].push( c.h );
			S[ i ].push( c.slack );

		}

	}

	// the zip round the door, dark, and its pull hanging at the bottom corner
	{

		const pts = [];
		const n = 26;
		for ( let q = 0; q <= n; q ++ ) {

			const f = q / n;
			let s, t;
			if ( f < 0.12 ) [ s, t ] = [ DOOR[ 0 ], lerp( SILL, doorTop( DOOR[ 0 ] ), f / 0.12 ) ];
			else if ( f > 0.88 ) [ s, t ] = [ DOOR[ 1 ], lerp( doorTop( DOOR[ 1 ] ), SILL, ( f - 0.88 ) / 0.12 ) ];
			else {

				s = lerp( DOOR[ 0 ], DOOR[ 1 ], ( f - 0.12 ) / 0.76 );
				t = doorTop( s );

			}

			pts.push( innerAt( s, t ).p.add( V( 0, 0.004, 0 ) ) );

		}

		tube( k, pts, 0.006, M.LEATHER, col( '#1d1b19' ), 4 );
		const pull = innerAt( DOOR[ 1 ], SILL ).p;
		k.box( pull.x, pull.y + 0.01, pull.z + 0.01, 0.01, 0.004, 0.035, M.IRON, '#8a8a86', { rot: [ 0.6, 0.3, 0 ] } );

	}

	const orange = mixc( '#c0632f', '#a8704e', 0.35 );
	const mud = col( '#4a3b2b' );
	const tentCol = ( base, h, x, z, slack, wet ) => {

		// sun-faded on top, darker where it is wet in the sags, mud splashed up from the ground
		const c = base.clone().multiplyScalar( 0.88 + 0.2 * vnoise( x * 3.1, z * 3.1 ) );
		c.lerp( col( '#d8b89a' ), 0.12 * ss( 0.3, 0.8, h ) );
		c.multiplyScalar( 1 - 0.25 * wet * slack );
		c.lerp( mud, 0.55 * ( 1 - ss( 0.02, 0.12, h ) ) * ( 0.6 + 0.4 * vnoise( x * 9, z * 9 ) ) );
		return c;

	};

	sheet( k, P, ( i, j ) => {

		const p = P[ i ][ j ], s = i / NI, t = j / NJ;
		const c = tentCol( orange, H[ i ][ j ], p.x, p.z, S[ i ][ j ], 1 );
		// the zip round the door, dark
		const nearDoor = s > DOOR[ 0 ] - 0.03 && s < DOOR[ 1 ] + 0.03 && t > doorTop( s ) - 0.04 && t < SILL + 0.02 && ! inDoor( s, t );
		return nearDoor ? c.multiplyScalar( 0.45 ) : c;

	}, ( i, j ) => orange.clone().multiplyScalar( 0.32 ), { skip: ( i, j ) => inDoor( ( i + 0.5 ) / NI, ( j + 0.5 ) / NJ ) } );

	// the groundsheet under it all, a bathtub floor of dark grey-blue: what shows through the door
	{

		const G = [];
		for ( let i = 0; i <= 12; i ++ ) {

			G.push( [] );
			for ( let j = 0; j <= 8; j ++ ) {

				const [ u, w ] = floor( 0.02 + i / 12 * 0.96, 0.02 + j / 8 * 0.96 ), [ x, z ] = W( u, w );
				G[ i ].push( V( x, ground( x, z ) + 0.009, z ) );

			}

		}

		sheet( k, G, () => col( '#1f2224' ), () => col( '#1a1c1e' ), { t: 0.002 } );

	}

	// the door flap: lying out on the ground from the sill, crumpled
	{

		const F = [], NF = 8, NQ = 7;
		const out = V( sy, 0, cy );
		for ( let i = 0; i <= NF; i ++ ) {

			F.push( [] );
			for ( let q = 0; q <= NQ; q ++ ) {

				const f = q / NQ;
				const s = ( DOOR[ 0 ] + DOOR[ 1 ] ) / 2 + ( i / NF - 0.5 ) * ( DOOR[ 1 ] - DOOR[ 0 ] ) * ( 1 - 0.55 * Math.pow( f, 2.5 ) );
				const [ u, w ] = floor( s, SILL );
				const [ x0, z0 ] = W( u, w );
				// it falls forward and a little to the right, clear of the sleeping bag
				const x = x0 + out.x * f * 0.5 + cy * f * f * 0.16, z = z0 + out.z * f * 0.5 - sy * f * f * 0.16;
				const g = ground( x, z );
				const y = g + 0.022 + crease( x * 1.3, z * 1.3 ) * 0.035 + Math.pow( 1 - f, 3 ) * 0.07;
				F[ i ].push( V( x, y, z ) );

			}

		}

		sheet( k, F, ( i, q ) => tentCol( orange, 0.02, F[ i ][ q ].x, F[ i ][ q ].z, 0.5, 1 ).multiplyScalar( 0.95 ), () => orange.clone().multiplyScalar( 0.35 ) );

	}

	// --- the fly: over the back and the right, its hem on the ground there, its twisted edge
	// lying across the top
	const flyCol = mixc( '#6b6f6a', '#5d6660', 0.4 );
	const FP = [];
	{

		const NU = 32, NW = 23;
		for ( let i = 0; i <= NU; i ++ ) {

			FP.push( [] );
			for ( let j = 0; j <= NW; j ++ ) {

				const a = ( i / NU * 2 - 1 ) * FLY.hu, b = ( j / NW * 2 - 1 ) * FLY.hw;
				const c = Math.cos( - FLY.a ), s = Math.sin( - FLY.a );
				let u = FLY.u + c * a - s * b, w = FLY.w + s * a + c * b;
				// the hem drawn in where the fly is pulled
				u -= 0.12 * ss( 0.6, 1, j / NW ) * ( i / NU );
				const [ x, z ] = W( u, w ), g = ground( x, z );
				let y = drape( x, z ) + 0.055;
				const edge = Math.min( i, NU - i, j, NW - j ) / 4;
				y += ( crease( x + 3.1, z - 1.7 ) * 0.065 + crease( x * 2.3 - 2, z * 2.3 ) * 0.025 ) * ( 0.4 + 0.6 * ss( 0, 1, edge ) );
				y = Math.max( y, g + 0.024 + 0.03 * crease( x * 1.6, z * 1.6 ) );
				FP[ i ].push( V( x, y, z ) );

			}

		}

		sheet( k, FP, ( i, j ) => {

			const p = FP[ i ][ j ], h = p.y - ground( p.x, p.z );
			const c = flyCol.clone().multiplyScalar( 0.9 + 0.18 * vnoise( p.x * 2.3, p.z * 2.3 ) );
			c.lerp( mud, 0.5 * ( 1 - ss( 0.03, 0.14, h ) ) );
			// its hem taped dark
			if ( i === 0 || j === 0 || i === FP.length - 1 || j === FP[ 0 ].length - 1 ) c.multiplyScalar( 0.6 );
			return c;

		}, () => flyCol.clone().multiplyScalar( 0.4 ), { t: 0.004 } );

	}

	// guy lines: one still pegged and nearly taut from the back of the fly; one slack across the
	// ground, its peg pulled; the pegs of the fallen corners lying about
	const peg = ( x, z, yaw, stand ) => {

		const g = ground( x, z );
		if ( stand ) {

			const a = V( x, g - 0.12, z ), b = V( x + 0.01, g + 0.035, z - 0.01 );
			sweep( k, [ a, b, b.clone().add( V( Math.sin( yaw ) * 0.025, - 0.012, Math.cos( yaw ) * 0.025 ) ) ], 0.0045, 0.0045, M.IRON, col( '#8c8a84' ) );
			return b;

		}

		const d = V( Math.sin( yaw ), 0, Math.cos( yaw ) );
		const a = V( x, g + 0.006, z ), b = a.clone().addScaledVector( d, 0.17 );
		b.y = ground( b.x, b.z ) + 0.006;
		sweep( k, [ a, b, b.clone().add( V( - d.z * 0.02, 0.01, d.x * 0.02 ) ) ], 0.0045, 0.0045, M.IRON, col( '#8c8a84' ) );
		return a;

	};

	const cord = '#b8733a';
	{

		const hem = FP[ FP.length - 1 ][ 2 ];
		const [ x, z ] = W( 1.75, - 1.1 );
		const top = peg( x, z, 1.2, true );
		rope( k, [ hem.clone(), hem.clone().lerp( top, 0.5 ).add( V( 0, - 0.03, 0 ) ), top ], 0.0022, cord );
		const hem2 = FP[ 12 ][ 0 ];
		const [ x2, z2 ] = W( 0.2, - 1.55 );
		const p2 = peg( x2, z2, 2.6, false );
		const m = hem2.clone().lerp( p2, 0.5 );
		rope( k, [ hem2.clone(), V( m.x + 0.08, ground( m.x + 0.08, m.z ) + 0.006, m.z ), p2 ], 0.0022, cord );
		// the front-left corner's peg, pulled, and the one at the front of the fallen side
		const [ x3, z3 ] = W( - 1.2, 1.0 );
		peg( x3, z3, 0.7, false );
		const [ x4, z4 ] = W( - 1.5, 0.15 );
		peg( x4, z4, 2.0, false );
		const [ x5, z5 ] = W( 1.14, 0.78 );
		peg( x5, z5, 0.3, true );

	}

	// --- a sleeping bag, dark green, half out of the door as if pulled
	{

		const pts = [ [ - 0.2, 0.06 ], [ - 0.36, 0.36 ], [ - 0.47, 0.66 ], [ - 0.56, 0.98 ], [ - 0.74, 1.22 ], [ - 0.8, 1.34 ] ].map( ( [ u, w ] ) => W( u, w ) );
		// flat and rucked: a sleeping bag with no one in it
		sausage( k, ground, pts, ( t ) => 0.3 * ( 0.72 + 0.28 * Math.sin( Math.min( 1, t * 1.1 ) * Math.PI * 0.9 + 0.2 ) ) * ( 1 + 0.08 * Math.sin( t * 47 ) ), ( t ) => ( 0.06 + 0.025 * Math.pow( Math.sin( t * 31 ), 2 ) ) * Math.pow( Math.sin( Math.PI * Math.min( 1, t * 1.02 ) ), 0.35 ) + 0.015, M.LEATHER, col( '#2f3b30' ), 10 );
		// the hood's open mouth at the outer end, its lining orange
		const [ x, z ] = pts[ pts.length - 1 ];
		const [ xp, zp ] = pts[ pts.length - 2 ];
		const m = onGround( ground, lerp( x, xp, 0.35 ), lerp( z, zp, 0.35 ), Math.atan2( x - xp, z - zp ), 0.07 );
		const L = new Local();
		blob( L, [ 0.1, 0.045, 0.035 ], 0.2, [ 0, 0, 0.02 ], [ 0.35, 0, 0 ], M.LEATHER, col( '#9a4a22' ) );
		blob( L, [ 0.075, 0.03, 0.03 ], 0.2, [ 0, 0.003, 0.035 ], [ 0.35, 0, 0 ], M.LEATHER, col( '#140f0c' ) );
		L.into( k, m );

	}

	return { toTent, W };

}

// the rucksack: a top-loader of the time, red with a navy lid and pockets, a black base, a
// yellow foam mat rolled and strapped under the lid. Built standing on its base, back panel
// at z = 0, then slumped back against whatever is behind it.
function buildPack( L ) {

	const red = col( '#8e2c25' ), navy = col( '#26304a' ), black = col( '#1c1d20' ), strap = col( '#232427' );
	// the bag: bulging low where the weight is, slumping forward and to one side at the top
	blob( L, [ 0.175, 0.3, 0.13 ], 0.6, [ 0, 0.31, 0.135 ], null, M.LEATHER, red, ( q, x, y ) => {

		q.x *= 1 + 0.1 * ( 1 - y ) * 0.5;
		q.z *= 1 + 0.12 * ( 1 - y ) * 0.5;
		q.z += 0.03 * Math.max( 0, y );
		q.x += 0.012 * Math.max( 0, y ) * Math.max( 0, y );
		// a crease across it where it folds
		q.z -= 0.012 * Math.exp( - Math.pow( ( y - 0.15 ) * 5, 2 ) ) * Math.max( 0, Math.sign( q.z ) );

	}, [ 18, 14 ] );
	blob( L, [ 0.18, 0.045, 0.14 ], 0.75, [ 0, 0.04, 0.135 ], null, M.LEATHER, black );
	// side pockets and the front pocket, with a zip across it
	for ( const xs of [ - 1, 1 ] ) blob( L, [ 0.04, 0.1, 0.075 ], 0.55, [ xs * 0.2, 0.25, 0.15 ], [ 0, 0, xs * 0.06 ], M.LEATHER, navy );
	blob( L, [ 0.125, 0.11, 0.035 ], 0.6, [ 0, 0.3, 0.275 ], [ - 0.08, 0, 0 ], M.LEATHER, red.clone().multiplyScalar( 0.85 ) );
	L.box( 0, 0.39, 0.304, 0.2, 0.006, 0.006, M.IRON, '#1b1b1b', { rot: [ - 0.08, 0, 0 ] } );
	// compression straps round the sides, each with its buckle
	for ( const xs of [ - 1, 1 ] ) for ( const y of [ 0.17, 0.44 ] ) {

		L.box( xs * 0.188, y, 0.14, 0.012, 0.024, 0.25, M.LEATHER, strap, { rot: [ 0, 0, xs * 0.05 ] } );
		L.box( xs * 0.194, y, 0.23, 0.014, 0.03, 0.03, M.LEATHER, col( '#111' ) );

	}

	// the foam mat under the lid, strapped on
	{

		const g = new THREE.CylinderGeometry( 0.07, 0.07, 0.6, 16, 1 );
		g.rotateZ( Math.PI / 2 );
		g.translate( 0.015, 0.655, 0.13 );
		L.add( g, M.LEATHER, col( '#b8963a' ), [ 1, 0, 0 ] );
		// the roll's spiral at each end, and the edge of its outer turn
		for ( const xs of [ - 1, 1 ] ) for ( const r of [ 0.05, 0.028 ] ) {

			const t = new THREE.TorusGeometry( r, 0.0035, 4, 18 );
			t.rotateY( Math.PI / 2 );
			t.translate( 0.015 + xs * 0.3, 0.655, 0.13 );
			L.add( t, M.LEATHER, col( '#7d6426' ) );

		}

		L.box( 0.015, 0.655 + 0.05, 0.13 + 0.05, 0.6, 0.006, 0.012, M.LEATHER, col( '#9a7c30' ), { rot: [ - 0.8, 0, 0 ] } );
		for ( const xs of [ - 1, 1 ] ) {

			const t = new THREE.TorusGeometry( 0.074, 0.006, 4, 18 );
			t.rotateY( Math.PI / 2 );
			t.translate( xs * 0.2, 0.655, 0.13 );
			L.add( t, M.LEATHER, strap );

		}

	}

	// the lid: fat with things, flopped forward over the mat; two straps down the front
	blob( L, [ 0.19, 0.055, 0.16 ], 0.55, [ 0, 0.745, 0.15 ], [ 0.2, 0.04, 0.05 ], M.LEATHER, navy, ( q, x, y, z ) => {

		q.y -= 0.02 * Math.max( 0, z ) * Math.max( 0, z );

	} );
	for ( const xs of [ - 1, 1 ] ) {

		sweep( L, [ V( xs * 0.08, 0.76, 0.3 ), V( xs * 0.085, 0.66, 0.225 ), V( xs * 0.085, 0.52, 0.29 ), V( xs * 0.085, 0.43, 0.305 ) ], 0.022, 0.004, M.LEATHER, strap, { up: V( 0, 0, 1 ) } );
		L.box( xs * 0.085, 0.53, 0.3, 0.032, 0.036, 0.012, M.LEATHER, col( '#111' ), { rot: [ - 0.1, 0, 0 ] } );

	}

	L.add( ( () => {

		const t = new THREE.TorusGeometry( 0.025, 0.005, 4, 10, Math.PI );
		t.translate( 0, 0.8, 0.03 );
		return t;

	} )(), M.LEATHER, strap );
	// the harness on the back: padded shoulder straps, the hip belt's wings, a strap end trailing
	for ( const xs of [ - 1, 1 ] ) {

		sweep( L, [ V( xs * 0.07, 0.66, 0.01 ), V( xs * 0.09, 0.55, - 0.035 ), V( xs * 0.11, 0.36, - 0.04 ), V( xs * 0.14, 0.2, - 0.02 ), V( xs * 0.17, 0.12, 0.02 ) ], 0.068, 0.022, M.LEATHER, col( '#2c2e33' ), { up: V( 0, 0, - 1 ) } );
		blob( L, [ 0.05, 0.055, 0.11 ], 0.6, [ xs * 0.205, 0.1, 0.05 ], [ 0, xs * 0.35, 0 ], M.LEATHER, black );

	}

	sweep( L, [ V( 0.25, 0.1, 0.13 ), V( 0.28, 0.06, 0.2 ), V( 0.27, 0.01, 0.3 ), V( 0.23, 0.004, 0.38 ) ], 0.025, 0.004, M.LEATHER, strap, { up: V( 1, 0, 0 ) } );

}

// one boot, lying on its side, the laces undone
function buildBoot( L ) {

	const leather = col( '#4d3726' ), rubber = col( '#1d1a17' );
	blob( L, [ 0.05, 0.017, 0.148 ], 0.78, [ 0, 0.017, 0.12 ], null, M.LEATHER, rubber );
	blob( L, [ 0.047, 0.046, 0.11 ], 0.42, [ 0, 0.058, 0.155 ], null, M.LEATHER, leather, ( q, x, y, z ) => {

		q.y -= 0.02 * Math.max( 0, z ) * Math.max( 0, y );

	} );
	blob( L, [ 0.046, 0.07, 0.062 ], 0.45, [ 0, 0.085, 0.03 ], null, M.LEATHER, leather.clone().multiplyScalar( 0.95 ) );
	blob( L, [ 0.043, 0.065, 0.05 ], 0.5, [ 0, 0.16, 0.04 ], [ - 0.12, 0, 0 ], M.LEATHER, leather.clone().multiplyScalar( 0.9 ) );
	// the padded collar, the tongue lolling out
	{

		const t = new THREE.TorusGeometry( 0.038, 0.012, 5, 14 );
		t.rotateX( Math.PI / 2 );
		t.scale( 1.05, 1, 1.25 );
		t.translate( 0, 0.225, 0.045 );
		L.add( t, M.LEATHER, col( '#2a1e16' ) );

	}

	blob( L, [ 0.025, 0.055, 0.009 ], 0.3, [ 0, 0.2, 0.1 ], [ - 0.55, 0, 0 ], M.LEATHER, leather.clone().multiplyScalar( 1.1 ) );
	// the laces: a few crossings low down, then loose, trailing
	for ( let i = 0; i < 3; i ++ ) {

		const z = 0.17 - i * 0.025, y = 0.1 + i * 0.02;
		tube( L, [ V( - 0.035, y, z ), V( 0, y + 0.012, z - 0.01 ), V( 0.035, y, z - 0.02 ) ], 0.003, M.ROPE, col( '#8a3a2a' ), 4 );

	}

	tube( L, [ V( - 0.035, 0.16, 0.1 ), V( - 0.06, 0.12, 0.14 ), V( - 0.09, 0.03, 0.2 ), V( - 0.13, 0.0, 0.27 ) ], 0.003, M.ROPE, col( '#8a3a2a' ), 4 );
	tube( L, [ V( 0.035, 0.16, 0.1 ), V( 0.05, 0.2, 0.15 ), V( 0.07, 0.13, 0.22 ) ], 0.003, M.ROPE, col( '#8a3a2a' ), 4 );

}

export function buildCamp( ground ) {

	const k = new Kit( ground, lowAO( ground ) );
	const R = rand( 1994 );
	const parts = {}, info = { collision: [] };
	const stoneCol = () => mixc( '#625e57', R() < 0.5 ? '#524e48' : '#6c665d', R() ).multiplyScalar( 0.85 + 0.25 * R() );

	// --- the tent
	const T = { x: - 1.05, z: - 0.85, yaw: 0.2 };
	const tent = buildTent( k, ground, T );
	info.collision.push( [ T.x, T.z, 1.15, 0.8 ] );

	// --- the fire: a ring of stones, sooty on their inner faces; a bed of ash and charcoal;
	// sticks burnt through in the middle, their ends left outside; a few dead branches by it
	const F = { x: 0.85, z: 0.55 };
	{

		const n = 11;
		for ( let i = 0; i < n; i ++ ) {

			const a = i / n * Math.PI * 2 + ( R() - 0.5 ) * 0.25, r = 0.44 + ( R() - 0.5 ) * 0.06;
			const x = F.x + Math.cos( a ) * r, z = F.z + Math.sin( a ) * r;
			k.stone( x, ground( x, z ), z, 0.1 + R() * 0.06, 0.08 + R() * 0.05, 0.09 + R() * 0.05, stoneCol().lerp( col( '#221f1c' ), 0.45 + R() * 0.25 ), R() * 40, [ 0, a, 0 ] );

		}

		patch( k, ground, F.x, F.z, ( a ) => 0.4 + 0.03 * Math.sin( a * 4 ), ( x, z, f ) => 0.03 + 0.035 * ( 1 - f * f ), ( x, z, f ) => {

			const ash = ss( 0.1, 0.5, vnoise( x * 11, z * 11 ) * 0.7 + ( 1 - f ) * 0.5 );
			return mixc( '#1b1917', '#5f5b56', ash * 0.8 ).multiplyScalar( 0.85 + 0.3 * Math.max( 0, vnoise( x * 23, z * 23 ) ) );

		}, () => 0.85, { rings: 4, segs: 20, mat: M.LEATHER } );
		const gF = ground( F.x, F.z );
		for ( let i = 0; i < 6; i ++ ) {

			const a = i / 6 * Math.PI * 2 + R() * 0.5, r0 = 0.05 + R() * 0.08, r1 = 0.55 + R() * 0.25;
			const inner = V( F.x + Math.cos( a ) * r0, gF + 0.05 + R() * 0.04, F.z + Math.sin( a ) * r0 );
			const mid = V( F.x + Math.cos( a ) * 0.36, 0, F.z + Math.sin( a ) * 0.36 );
			mid.y = ground( mid.x, mid.z ) + 0.1;
			const outer = V( F.x + Math.cos( a + 0.1 ) * r1, 0, F.z + Math.sin( a + 0.1 ) * r1 );
			outer.y = ground( outer.x, outer.z ) + 0.03;
			const r = 0.022 + R() * 0.015;
			k.pole( inner, mid, r * 0.8, M.LOG, col( '#171514' ), i );
			if ( i % 2 === 0 ) k.pole( mid, outer, r, M.BARK, mixc( '#4b3b2e', '#2a221c', R() * 0.5 ), i + 7 );

		}

		for ( let i = 0; i < 14; i ++ ) {

			const a = R() * Math.PI * 2, r = R() * 0.3, x = F.x + Math.cos( a ) * r, z = F.z + Math.sin( a ) * r;
			k.box( x, ground( x, z ) + 0.05 * ( 1 - r / 0.38 ) + 0.012, z, 0.02 + R() * 0.04, 0.015 + R() * 0.02, 0.02 + R() * 0.03, M.LOG, col( '#161412' ), { rot: [ R(), R() * 3, R() ] } );

		}

		// dead spruce branches gathered for it, never burnt
		for ( let i = 0; i < 4; i ++ ) {

			const x0 = 1.55 + R() * 0.3, z0 = - 0.15 + i * 0.12, yaw = 0.3 + ( R() - 0.5 ) * 0.5, len = 0.9 + R() * 0.5;
			const a = V( x0, 0, z0 ), b = V( x0 + Math.sin( yaw ) * len, 0, z0 + Math.cos( yaw ) * len );
			a.y = ground( a.x, a.z ) + 0.025 + i * 0.012; b.y = ground( b.x, b.z ) + 0.015 + i * 0.01;
			k.pole( a, b, 0.018 - i * 0.002, M.BARK, mixc( '#5a4a3a', '#3c3128', R() ), i * 3 );
			for ( let j = 0; j < 3; j ++ ) {

				const t = 0.3 + j * 0.22, p = a.clone().lerp( b, t ), sd = j % 2 ? 1 : - 1;
				const q = p.clone().add( V( Math.cos( yaw ) * 0.18 * sd, 0.02, - Math.sin( yaw ) * 0.18 * sd ) ).addScaledVector( b.clone().sub( a ).normalize(), 0.12 );
				k.pole( p, q, 0.006, M.BARK, col( '#4a3c30' ), j );

			}

		}

		info.collision.push( [ F.x, F.z, 0.5, 0.5 ] );

	}

	// --- the stump, and the rucksack slumped back against it
	const Sx = 2.15, Sz = - 1.25;
	{

		const g = ground( Sx, Sz );
		// sawn level long ago, the cut grey and checked; roots spread into the moss
		const s = new THREE.CylinderGeometry( 0.26, 0.31, 0.58, 14, 2 );
		const sp = s.getAttribute( 'position' );
		for ( let i = 0; i < sp.count; i ++ ) {

			const a = Math.atan2( sp.getZ( i ), sp.getX( i ) ), f = 1 + 0.06 * Math.sin( a * 5 + 1 ) + 0.04 * Math.sin( a * 3 );
			sp.setX( i, sp.getX( i ) * f );
			sp.setZ( i, sp.getZ( i ) * f );

		}

		s.computeVertexNormals();
		s.translate( Sx, g + 0.17, Sz );
		k.add( s, M.BARK, col( '#4f4035' ), [ 0, 1, 0 ], [ Sx, g + 0.46, Sz ] );
		for ( let i = 0; i < 5; i ++ ) {

			const a = i / 5 * Math.PI * 2 + 0.4, x1 = Sx + Math.cos( a ) * 0.62, z1 = Sz + Math.sin( a ) * 0.62;
			k.pole( V( Sx + Math.cos( a ) * 0.2, g + 0.14, Sz + Math.sin( a ) * 0.2 ), V( x1, ground( x1, z1 ) - 0.04, z1 ), 0.07, M.BARK, col( '#4a3c31' ), i );

		}

		// the pack, facing the fire
		const yaw = Math.atan2( F.x - Sx, F.z - Sz ) + 0.25;
		const bx = Sx + Math.sin( yaw ) * 0.42, bz = Sz + Math.cos( yaw ) * 0.42;
		const L = new Local();
		buildPack( L );
		L.apply( new THREE.Matrix4().makeRotationFromEuler( new THREE.Euler( - 0.3, 0, 0.1 ) ) );
		L.into( k, new THREE.Matrix4().makeRotationY( yaw ).setPosition( bx, ground( bx, bz ) - 0.015, bz ) );
		info.collision.push( [ Sx + Math.sin( yaw ) * 0.15, Sz + Math.cos( yaw ) * 0.15, 0.45, 0.45 ] );

	}

	// --- the stove, standing; its pot knocked off onto its side, dented, the lid rolled away;
	// the enamel mug with the spoon still in it
	{

		const L = new Local();
		// a blue Camping Gaz cartridge, the burner clamped on top: its valve, its three wire
		// pot supports
		lathe( L, [ [ 0, 0 ], [ 0.044, 0 ], [ 0.047, 0.004 ], [ 0.047, 0.078 ], [ 0.042, 0.09 ], [ 0.028, 0.098 ], [ 0.0, 0.1 ] ], V( 0, 0, 0 ), M.LEATHER, col( '#2f5f96' ), 16 );
		lathe( L, [ [ 0.0475, 0.0 ], [ 0.0475, 0.006 ] ], V( 0, 0, 0 ), M.IRON, col( '#8a8a86' ), 16 );
		cyl( L, 0, 0.085, 0, 0.046, 0.046, 0.026, M.IRON, col( '#6f706c' ), 14 );
		cyl( L, 0, 0.111, 0, 0.011, 0.011, 0.04, M.IRON, col( '#8c8c88' ), 8 );
		cyl( L, 0, 0.148, 0, 0.022, 0.025, 0.013, M.IRON, col( '#2b2a28' ), 12 );
		L.box( 0.058, 0.097, 0, 0.02, 0.012, 0.012, M.IRON, '#5a5a57' );
		cyl( L, 0.072, 0.09, 0, 0.011, 0.011, 0.014, M.LEATHER, col( '#1a1a1a' ), 8, [ 0, 0, Math.PI / 2 ] );
		for ( let i = 0; i < 3; i ++ ) {

			const a = i / 3 * Math.PI * 2 + 0.3, c = Math.cos( a ), s = Math.sin( a );
			sweep( L, [ V( c * 0.014, 0.13, s * 0.014 ), V( c * 0.06, 0.15, s * 0.06 ), V( c * 0.075, 0.168, s * 0.075 ) ], 0.004, 0.004, M.IRON, col( '#4d4c49' ) );

		}

		L.settle( 0, 0, 0, 0.005 ).into( k, onGround( ground, 0.1, 0.05, 0.4 ) );
		// the billy: aluminium, blackened underneath, a dent in its side, its wire handle
		const P = new Local();
		const pot = new THREE.LatheGeometry( [ [ 0, 0 ], [ 0.066, 0 ], [ 0.07, 0.004 ], [ 0.07, 0.088 ], [ 0.073, 0.092 ] ].map( ( [ r, y ] ) => new THREE.Vector2( r, y ) ), 18 );
		const pp = pot.getAttribute( 'position' );
		for ( let i = 0; i < pp.count; i ++ ) {

			const x = pp.getX( i ), y = pp.getY( i ), z = pp.getZ( i ), a = Math.atan2( z, x );
			const dent = 0.016 * Math.exp( - Math.pow( ( a - 0.9 ) * 2.2, 2 ) ) * Math.exp( - Math.pow( ( y - 0.05 ) * 30, 2 ) );
			const r = Math.hypot( x, z );
			if ( r > 0.03 ) {

				pp.setX( i, x * ( 1 - dent / r ) );
				pp.setZ( i, z * ( 1 - dent / r ) );

			}

		}

		pot.computeVertexNormals();
		P.add( pot, M.IRON, col( '#8e8d88' ), [ 0, 1, 0 ] );
		lathe( P, [ [ 0.069, 0.09 ], [ 0.067, 0.005 ], [ 0, 0.005 ] ], V( 0, 0, 0 ), M.IRON, col( '#4a4844' ), 18 );
		const soot = new THREE.CircleGeometry( 0.066, 16 );
		soot.rotateX( Math.PI / 2 );
		soot.translate( 0, - 0.001, 0 );
		P.add( soot, M.IRON, col( '#1e1c1a' ) );
		const bail = new THREE.TorusGeometry( 0.072, 0.0022, 4, 16, Math.PI );
		bail.rotateX( 0.6 );
		bail.translate( 0, 0.085, 0 );
		P.add( bail, M.IRON, col( '#6a6964' ) );
		P.settle( Math.PI / 2, 1.1, 0, 0.004 ).into( k, onGround( ground, 0.24, 0.3, 0.9 ) );
		const Lid = new Local();
		lathe( Lid, [ [ 0, 0.012 ], [ 0.06, 0.006 ], [ 0.073, 0.0 ], [ 0.074, 0.006 ] ], V( 0, 0, 0 ), M.IRON, col( '#8a8984' ), 16, true );
		cyl( Lid, 0, 0.012, 0, 0.012, 0.01, 0.01, M.IRON, col( '#6a6964' ), 8 );
		Lid.settle( 0.12, 0, 0.05, 0.002 ).into( k, onGround( ground, 0.52, - 0.08, 0 ) );
		// the mug
		const Mg = new Local();
		lathe( Mg, [ [ 0, 0 ], [ 0.039, 0 ], [ 0.041, 0.004 ], [ 0.042, 0.08 ], [ 0.044, 0.084 ] ], V( 0, 0, 0 ), M.LEATHER, col( '#d4cfbf' ), 16 );
		lathe( Mg, [ [ 0.041, 0.082 ], [ 0.039, 0.006 ], [ 0, 0.006 ] ], V( 0, 0, 0 ), M.LEATHER, col( '#bdb7a6' ), 16 );
		const rim = new THREE.TorusGeometry( 0.043, 0.0028, 4, 18 );
		rim.rotateX( Math.PI / 2 );
		rim.translate( 0, 0.084, 0 );
		Mg.add( rim, M.LEATHER, col( '#23385e' ) );
		const hd = new THREE.TorusGeometry( 0.022, 0.0045, 5, 10, Math.PI * 1.2 );
		hd.rotateZ( - Math.PI * 0.6 );
		hd.translate( 0.044, 0.045, 0 );
		Mg.add( hd, M.LEATHER, col( '#d4cfbf' ) );
		// chips in the enamel, the black iron under it
		for ( const [ a, y ] of [ [ 2.1, 0.03 ], [ 4.0, 0.07 ], [ 5.2, 0.015 ] ] ) {

			const c = new THREE.CircleGeometry( 0.005, 6 );
			c.rotateY( Math.PI / 2 - a );
			c.translate( Math.cos( a ) * 0.0425, y, Math.sin( a ) * 0.0425 );
			Mg.add( c, M.LEATHER, col( '#1d1d20' ) );

		}

		// the spoon, leaning in it
		Mg.box( 0.012, 0.1, 0.005, 0.009, 0.13, 0.0025, M.IRON, '#8b8a85', { rot: [ 0, 0.3, - 0.3 ] } );
		Mg.settle( 0, 0, 0 ).into( k, onGround( ground, - 0.12, 0.38, 0.6 ) );

	}

	// --- the torch, lying in the moss where it was dropped: yellow plastic, a black head, dead
	{

		const L = new Local();
		cyl( L, 0, 0, 0, 0.018, 0.018, 0.14, M.LEATHER, col( '#c49b2a' ), 12, [ Math.PI / 2, 0, 0 ] );
		cyl( L, 0, 0, 0.14, 0.02, 0.027, 0.045, M.LEATHER, col( '#1c1c1c' ), 14, [ Math.PI / 2, 0, 0 ] );
		const lens = new THREE.CircleGeometry( 0.023, 14 );
		lens.translate( 0, 0, 0.1855 );
		L.add( lens, M.BRONZE, col( '#3a3e42' ) );
		L.box( 0, 0.02, 0.09, 0.012, 0.006, 0.02, M.LEATHER, '#1c1c1c' );
		cyl( L, 0, 0, - 0.012, 0.019, 0.019, 0.014, M.LEATHER, col( '#1c1c1c' ), 12, [ Math.PI / 2, 0, 0 ] );
		L.settle( 0, 0, 0.3 ).into( k, onGround( ground, - 2.35, 0.55, 2.3 ) );

	}

	// --- the map: a walking map, its red cover, half unfolded, lying wet near the pack
	{

		const L = new Local();
		const pts = [ V( 0, 0, 0 ) ];
		const ang = [ 0, 0.22, - 0.2, 0.08, - 0.03 ];
		for ( const a of ang ) pts.push( pts[ pts.length - 1 ].clone().add( V( Math.cos( a ) * 0.12, Math.sin( a ) * 0.12, 0 ) ) );
		for ( let i = 0; i < pts.length - 1; i ++ ) {

			const a = pts[ i ], b = pts[ i + 1 ], m = a.clone().lerp( b, 0.5 );
			const c = i === 0 ? col( '#8a2d27' ) : mixc( '#98937f', '#8a8f74', R() );
			L.box( m.x, m.y + 0.0015, m.z, 0.12, 0.002, 0.23 + ( R() - 0.5 ) * 0.004, M.LEATHER, c, { rot: [ 0, 0, Math.atan2( b.y - a.y, b.x - a.x ) ] } );
			if ( i > 0 ) {

				// a lake, a road, a path: coloured marks on the printed panels
				const up = V( - Math.sin( ang[ i ] ), Math.cos( ang[ i ] ), 0 );
				const q = m.clone().addScaledVector( up, 0.0032 );
				if ( i === 2 ) L.box( q.x, q.y, q.z - 0.03, 0.05, 0.001, 0.07, M.LEATHER, '#5a7d9a', { rot: [ 0, 0, ang[ i ] ] } );
				L.box( q.x, q.y, q.z + 0.04, 0.12, 0.001, 0.003, M.LEATHER, '#a83a2a', { rot: [ 0, 0.3 * ( i - 2 ), ang[ i ] ] } );

			}

		}

		L.box( 0.06, 0.0045, - 0.02, 0.08, 0.001, 0.05, M.LEATHER, '#c8c2b0' );
		// (lifted a little: it is 60 cm long, and the ground is not flat under it)
		L.settle( 0, 0, 0 ).into( k, onGround( ground, 1.25, - 0.45, 1.9, 0.018 ) );

	}

	// --- one boot, on its side by the tent
	{

		const L = new Local();
		buildBoot( L );
		L.settle( 0.1, 0, 1.45, 0.005 ).into( k, onGround( ground, - 2.45, - 0.35, 2.6 ) );

	}

	// --- the flat rock by the path, and on it the camera
	const rock = { x: 1.95, z: 1.35 };
	{

		let gmax = - Infinity;
		for ( let a = 0; a < 6.28; a += 0.5 ) gmax = Math.max( gmax, ground( rock.x + Math.cos( a ) * 0.3, rock.z + Math.sin( a ) * 0.25 ) );
		const top = gmax + 0.17;
		flatStone( k, rock.x, rock.z, 0.3, 0.24, top, 0.3, mixc( '#6c675f', '#58544d', 0.4 ), R, 0.3 );
		for ( let i = 0; i < 3; i ++ ) {

			const a = i * 2.1 + 0.5, x = rock.x + Math.cos( a ) * 0.45, z = rock.z + Math.sin( a ) * 0.38;
			k.stone( x, ground( x, z ), z, 0.1 + R() * 0.07, 0.06 + R() * 0.05, 0.08 + R() * 0.06, stoneCol(), R() * 40 );

		}

		info.collision.push( [ rock.x, rock.z, 0.42, 0.35 ] );
		// a compact of the time, 12 x 7 x 5 cm, black plastic, lying on its back: the lens up,
		// the flash window and the viewfinder along its top edge, its wrist strap over the edge
		const L = new Local();
		L.box( 0, 0.035, 0, 0.12, 0.068, 0.042, M.LEATHER, '#161618', { round: 0.012 } );
		L.box( 0.042, 0.03, 0.026, 0.03, 0.058, 0.014, M.LEATHER, '#1d1d20', { round: 0.006 } );
		cyl( L, - 0.012, 0.032, 0.021, 0.024, 0.024, 0.012, M.LEATHER, col( '#1b1b1d' ), 18, [ Math.PI / 2, 0, 0 ] );
		cyl( L, - 0.012, 0.032, 0.033, 0.019, 0.019, 0.01, M.IRON, col( '#4c4c4e' ), 16, [ Math.PI / 2, 0, 0 ] );
		const glass = new THREE.CircleGeometry( 0.013, 16 );
		glass.translate( - 0.012, 0.032, 0.0435 );
		L.add( glass, M.BRONZE, col( '#141a26' ) );
		L.box( 0.03, 0.058, 0.0215, 0.028, 0.012, 0.002, M.LEATHER, '#9e9e98' );
		L.box( - 0.04, 0.058, 0.0215, 0.013, 0.01, 0.002, M.LEATHER, '#0a0a0c' );
		L.box( 0.006, 0.058, 0.0215, 0.006, 0.006, 0.002, M.LEATHER, '#3a2a28' );
		cyl( L, 0.035, 0.068, 0.0, 0.006, 0.006, 0.004, M.IRON, col( '#6c6c6a' ), 10 );
		L.box( - 0.064, 0.05, 0, 0.008, 0.012, 0.008, M.IRON, '#3a3a3a' );
		tube( L, [ V( - 0.068, 0.05, 0 ), V( - 0.095, 0.045, - 0.012 ), V( - 0.13, 0.03, - 0.018 ), V( - 0.16, 0.0, - 0.018 ), V( - 0.17, - 0.03, - 0.018 ) ], 0.0025, M.ROPE, col( '#1a1a1a' ), 4 );
		L.settle( - Math.PI / 2 + 0.06, 0, 0.04 );
		// back on the stone's face: what lies under y = 0 is only the strap over its edge
		const ck = new Kit( ground, lowAO( ground ) );
		const cx = rock.x - 0.02, cz = rock.z + 0.02, yaw = - 0.5;
		L.into( ck, new THREE.Matrix4().makeRotationY( yaw ).setPosition( cx, top, cz ) );
		parts.camera = ck.build();
		info.camera = [ cx, top + 0.022, cz ];

	}

	// --- the notebook: pocket-sized, black oilcloth covers, open face up on the moss; the
	// pages cockled and swollen with the wet, fanned at their edges; lines of pencil; the
	// elastic band lying loose across it; the pencil beside it
	{

		const nb = { x: - 0.45, z: 1.25 };
		const L = new Local();
		const PW = 0.098, PL = 0.14;
		// the pages' top: rising from the gutter, cockled
		const top = ( x, z ) => {

			const d = Math.abs( x );
			return 0.004 + 0.011 * Math.exp( - d * 55 ) + 0.006 * ss( 0.0, 0.06, d ) + 0.0022 * Math.sin( x * 140 + z * 60 ) * Math.sin( z * 90 - x * 30 ) + 0.004 * ss( 0.07, 0.1, d );

		};

		for ( const xs of [ - 1, 1 ] ) {

			L.box( xs * 0.052, 0.0012, 0, 0.104, 0.0024, 0.148, M.LEATHER, '#141416', { round: 0.001 } );
			const g = new THREE.BoxGeometry( PW, 0.01, PL, 10, 1, 8 );
			const p = g.getAttribute( 'position' ), cols = [];
			for ( let i = 0; i < p.count; i ++ ) {

				const x = p.getX( i ) + xs * ( PW / 2 + 0.001 ), z = p.getZ( i );
				const y = p.getY( i ) > 0 ? top( x, z ) : 0.0026;
				p.setXYZ( i, x, y, z );
				// damp: tide marks of brown on the cream
				const c = mixc( '#cdc4a8', '#a38d66', ss( 0.1, 0.7, vnoise( x * 40 + 3, z * 40 ) ) * 0.75 );
				cols.push( c.r, c.g, c.b );

			}

			g.setAttribute( 'color', new THREE.Float32BufferAttribute( cols, 3 ) );
			g.computeVertexNormals();
			L.add( g, M.LEATHER, null, [ 0, 0, 1 ] );
			// the writing: pencil lines across the page, word by word, the last line short
			const RR = rand( xs > 0 ? 7 : 3 );
			const lines = xs < 0 ? 12 : 7;
			for ( let l = 0; l < lines; l ++ ) {

				const z = - PL / 2 + 0.014 + l * 0.0095;
				let x = xs * ( PW / 2 + 0.001 ) - PW / 2 + 0.01 + RR() * 0.004;
				const end = xs * ( PW / 2 + 0.001 ) + PW / 2 - 0.008 - ( l === lines - 1 ? 0.05 : RR() * 0.015 );
				while ( x < end - 0.006 ) {

					const w = Math.min( end - x, 0.006 + RR() * 0.018 );
					const cx = x + w / 2;
					L.box( cx, top( cx, z ) + 0.0004, z, w, 0.0006, 0.0018, M.LEATHER, '#3b3f48', { rot: [ 0, ( RR() - 0.5 ) * 0.04, 0 ] } );
					x += w + 0.003 + RR() * 0.002;

				}

			}

		}

		rope( L, [ V( 0.092, 0.003, - 0.076 ), V( 0.07, top( 0.07, - 0.03 ) + 0.002, - 0.03 ), V( 0.04, top( 0.04, 0.03 ) + 0.002, 0.03 ), V( 0.03, 0.004, 0.08 ), V( 0.045, 0.0015, 0.1 ) ], 0.0018, '#101012' );
		cyl( L, 0.14, 0.0035, 0.01, 0.0035, 0.0035, 0.13, M.LEATHER, col( '#2f4a36' ), 6, [ Math.PI / 2, 0.25, 0, 'YXZ' ] );
		const nk = new Kit( ground, lowAO( ground ) );
		L.into( nk, onGround( ground, nb.x, nb.z, 0.35, 0.012 ) );
		parts.notebook = nk.build();
		info.notebook = [ nb.x, ground( nb.x, nb.z ) + 0.02, nb.z ];

	}

	return { geometry: k.build(), parts, info };

}

// ===========================================================================
// the charcoal burner's clearing
// ===========================================================================

const KR = 2.5, KH = 2.2;
// the kiln's profile: 1 at its crown, 0 at its foot; steep at the foot, broad over the top
const kprof = ( r ) => Math.pow( Math.max( 0, 1 - Math.pow( Math.min( 1, r / KR ), 2.4 ) ), 0.62 );
// and the radius where it stands at a given fraction of its height
const kAt = ( p ) => KR * Math.pow( 1 - Math.pow( p, 1 / 0.62 ), 1 / 2.4 );
// the smallest turn between two angles
const adiff = ( a, b ) => Math.abs( ( ( a - b ) % ( Math.PI * 2 ) + Math.PI * 3 ) % ( Math.PI * 2 ) - Math.PI );

// the burner's hut, in its own frame: a cone of poles shingled with bark slabs in courses,
// crossed pole ends at its top, a low door under a little lean-to porch (after the Harz Köte,
// ref kiln/h2). lg( x, z ): the ground in this frame (world heights); the door toward +z.
function buildBurnerHut( L, lg, R ) {

	const RB = 1.32, HH = 2.5;
	const g0 = lg( 0, 0 ), apexY = g0 + HH;
	const base = ( a ) => lg( Math.cos( a ) * RB, Math.sin( a ) * RB );
	const at = ( a, h ) => V( Math.cos( a ) * RB * ( 1 - h ), lerp( base( a ), apexY, h ), Math.sin( a ) * RB * ( 1 - h ) );
	const SL = Math.hypot( RB, HH );
	const DOOR = Math.PI / 2, DOOR_W = 0.36, DOOR_H = 1.22;
	const barks = [ '#4e4236', '#564739', '#5d4e40', '#4a3e33', '#5a524a', '#524538' ];
	// inside: dark, seen through the door
	{

		const c = new THREE.ConeGeometry( RB * 0.94, HH * 0.94, 16, 1, true );
		const ia = c.index.array;
		for ( let i = 0; i < ia.length; i += 3 ) [ ia[ i + 1 ], ia[ i + 2 ] ] = [ ia[ i + 2 ], ia[ i + 1 ] ];
		c.computeVertexNormals();
		c.translate( 0, g0 + HH * 0.47, 0 );
		L.add( c, M.VOID, col( '#000000' ) );
		const f = new THREE.CircleGeometry( RB * 0.95, 16 );
		f.rotateX( - Math.PI / 2 );
		f.translate( 0, g0 + 0.03, 0 );
		L.add( f, M.VOID, col( '#000000' ) );

	}

	// the bark slabs, course by course from the ground up, each course lapping the one below,
	// each slab curled a little, its lower end standing off the course under it
	const EXPO = 0.36 / SL, LEN = 0.5;
	for ( let c = 0; c * EXPO < 0.9; c ++ ) {

		const h0 = c * EXPO - ( c === 0 ? 0.03 : 0 );
		const len = LEN + ( c === 0 ? 0.06 : 0 );
		const hm = h0 + len / SL / 2, rm = RB * ( 1 - hm );
		const n = Math.max( 5, Math.round( Math.PI * 2 * rm / 0.21 ) );
		const off = R() * Math.PI * 2;
		for ( let i = 0; i < n; i ++ ) {

			const a = off + ( i + ( R() - 0.5 ) * 0.25 ) / n * Math.PI * 2;
			// the door: no slabs across it below the lintel
			if ( h0 * HH < DOOR_H && adiff( a, DOOR ) < ( DOOR_W + 0.1 ) / Math.max( 0.3, rm ) ) continue;
			const w = Math.PI * 2 * rm / n * 1.3 * ( 0.9 + R() * 0.2 ), l = len * ( 0.92 + R() * 0.16 );
			const p0 = at( a, h0 ), p1 = at( a, h0 + l / SL );
			const ax = p1.clone().sub( p0 ).normalize(), t = V( - Math.sin( a ), 0, Math.cos( a ) );
			const nn = new THREE.Vector3().crossVectors( ax, t ).normalize();
			const g = new THREE.BoxGeometry( w, 0.022, l, 2, 1, 1 );
			const gp = g.getAttribute( 'position' );
			for ( let j = 0; j < gp.count; j ++ ) {

				const x = gp.getX( j ), z = gp.getZ( j );
				// curled, and narrower toward the top as the cone closes
				gp.setXYZ( j, x * ( 1 - 0.18 * ( z / l + 0.5 ) ), gp.getY( j ) - 2.2 * x * x, z );

			}

			g.computeVertexNormals();
			g.rotateX( 0.06 + R() * 0.03 );
			g.rotateZ( ( R() - 0.5 ) * 0.06 );
			const m = p0.clone().lerp( p1, 0.5 ).addScaledVector( nn, 0.03 + ( c % 2 ) * 0.008 );
			g.applyMatrix4( new THREE.Matrix4().makeBasis( t, nn, ax ).setPosition( m ) );
			L.add( g, M.BARK, col( barks[ Math.floor( R() * barks.length ) ], 0.85 + 0.2 * R() ), ax.toArray(), m.toArray() );

		}

	}

	// the poles' crossed ends standing out of the top
	const apex = V( 0, apexY, 0 );
	for ( let i = 0; i < 7; i ++ ) {

		const a = i / 7 * Math.PI * 2 + 0.3, b = at( a, 0 ), d = apex.clone().sub( b ).normalize();
		L.pole( at( a, 0.8 ).addScaledVector( V( Math.cos( a ), 0, Math.sin( a ) ), 0.02 ), apex.clone().addScaledVector( d, 0.45 + R() * 0.25 ).add( V( ( R() - 0.5 ) * 0.06, 0, ( R() - 0.5 ) * 0.06 ) ), 0.045, M.LOG, mixc( '#554a3f', '#665a4e', R() ), i );

	}

	// the door frame: two split posts and a lintel; a sill log
	const post = mixc( '#4a3f35', '#574b40', 0.5 );
	const doorAt = ( side, y ) => {

		const hh = ( y - g0 ) / HH, r = RB * ( 1 - hh ) + 0.02;
		const a = DOOR + side * DOOR_W / r;
		return V( Math.cos( a ) * r, y, Math.sin( a ) * r );

	};

	for ( const s of [ - 1, 1 ] ) L.pole( doorAt( s, g0 - 0.05 ), doorAt( s * 0.92, g0 + DOOR_H + 0.08 ), 0.055, M.LOG, post, s * 3 );
	L.pole( doorAt( - 1.25, g0 + DOOR_H + 0.02 ), doorAt( 1.25, g0 + DOOR_H + 0.02 ), 0.06, M.LOG, post, 5 );
	L.pole( doorAt( - 1.1, g0 + 0.04 ), doorAt( 1.1, g0 + 0.04 ), 0.05, M.LOG, post, 6 );
	// the porch: two posts, bearers, a roof of boards sloping off the cone over the door
	{

		const zf = RB + 0.5, zb = RB * 0.5, yb = g0 + 1.62, yf = g0 + 1.3;
		for ( const x of [ - 0.42, 0.42 ] ) {

			L.pole( V( x, lg( x, zf ) - 0.1, zf ), V( x, yf - 0.02, zf ), 0.05, M.LOG, post, x * 7 );
			L.pole( V( x, yb - 0.04, zb ), V( x, yf - 0.04, zf + 0.1 ), 0.042, M.LOG, post, x * 9 );

		}

		for ( let x = - 0.5; x < 0.5; x += 0.155 ) {

			const c = mixc( '#7a7064', '#8c8276', R() ).multiplyScalar( 0.85 + 0.25 * R() );
			const a = V( x + 0.08, yb + 0.02, zb - 0.05 ), b = V( x + 0.08 + ( R() - 0.5 ) * 0.03, yf + 0.02, zf + 0.18 );
			const len = b.clone().sub( a ).length();
			// (split boards, grey as the shingles on the herder's hut; the board shader's seams
			// follow height, which on a roof this flat bands it dark, so they are drawn as shingles)
			L.box( ( a.x + b.x ) / 2, ( a.y + b.y ) / 2, ( a.z + b.z ) / 2, 0.15, 0.022, len, M.SHINGLE, c, { rot: [ Math.atan2( a.y - b.y, b.z - a.z ), 0, 0 ], axis: b.clone().sub( a ).normalize().toArray() } );

		}

	}

	// stones round its foot holding the lowest course down
	for ( let i = 0; i < 13; i ++ ) {

		const a = i / 13 * Math.PI * 2 + R() * 0.3;
		if ( adiff( a, DOOR ) < 0.45 ) continue;
		const x = Math.cos( a ) * ( RB + 0.12 ), z = Math.sin( a ) * ( RB + 0.12 );
		L.stone( x, lg( x, z ), z, 0.14 + R() * 0.08, 0.1 + R() * 0.06, 0.12 + R() * 0.07, mixc( '#524e48', '#433f3a', R() ), R() * 40 );

	}

	// a split-log bench beside the door, a rake leaning on the hut
	{

		const x0 = 1.05, z0 = RB + 0.15, yaw = - 0.6;
		const dx = Math.cos( yaw ) * 0.5, dz = - Math.sin( yaw ) * 0.5, gy = lg( x0, z0 );
		for ( const s of [ - 1, 1 ] ) L.pole( V( x0 + s * dx, lg( x0 + s * dx, z0 + s * dz ) - 0.05, z0 + s * dz ), V( x0 + s * dx, gy + 0.36, z0 + s * dz ), 0.1, M.BARK, col( '#56473a' ), s );
		const g = new THREE.CylinderGeometry( 0.13, 0.13, 1.35, 10, 1, false, 0, Math.PI );
		g.rotateZ( - Math.PI / 2 );
		g.rotateY( yaw );
		g.translate( x0, gy + 0.46, z0 );
		L.add( g, M.LOG, col( '#54493e' ), [ Math.cos( yaw ), 0, - Math.sin( yaw ) ], [ x0, gy + 0.46, z0 ] );
		L.box( x0, gy + 0.46, z0, 1.35, 0.01, 0.26, M.LOG, col( '#5e5245' ), { rot: [ 0, yaw, 0 ], axis: [ Math.cos( yaw ), 0, - Math.sin( yaw ) ] } );
		const a = DOOR - 1.0, r0 = RB + 0.62;
		const foot = V( Math.cos( a ) * r0, 0, Math.sin( a ) * r0 );
		foot.y = lg( foot.x, foot.z ) - 0.02;
		const top = at( a, 0.72 ).addScaledVector( V( Math.cos( a ), 0.3, Math.sin( a ) ), 0.12 );
		rake( L, foot, top, R );

	}

	return { RB, door: at( DOOR, 0 ).add( V( 0, 0, 0.1 ) ) };

}

// a charcoal rake: a long ash handle, a head of iron tines on a wooden bar, from the handle's
// end a to the head at b
function rake( k, a, b, R ) {

	const d = b.clone().sub( a ).normalize();
	k.pole( a, b, 0.017, M.LOG, mixc( '#7d6a55', '#8c7a63', R() ), R() * 9 );
	const side = new THREE.Vector3().crossVectors( d, V( 0, 1, 0 ) );
	if ( side.lengthSq() < 1e-4 ) side.set( 1, 0, 0 );
	side.normalize();
	const face = new THREE.Vector3().crossVectors( side, d ).normalize();
	sweep( k, [ b.clone().addScaledVector( side, - 0.24 ), b.clone().addScaledVector( side, 0.24 ) ], 0.045, 0.04, M.LOG, col( '#5e4e3e' ), { up: d } );
	for ( let i = 0; i < 9; i ++ ) {

		const p = b.clone().addScaledVector( side, - 0.2 + i * 0.05 );
		sweep( k, [ p.clone().addScaledVector( face, 0.01 ), p.clone().addScaledVector( face, 0.09 ).addScaledVector( d, 0.05 ), p.clone().addScaledVector( face, 0.12 ).addScaledVector( d, 0.12 ) ], 0.008, 0.008, M.IRON, col( '#3b3632' ) );

	}

}

export function buildKiln( ground ) {

	const k = new Kit( ground, lowAO( ground ) );
	const R = rand( 1848 );
	const info = { vents: [], collision: [] };
	const gc = ground( 0, 0 );
	// the dome: the terrain at its foot, level at its crown, clods and hollows in its skin
	const lump = ( x, z ) => 0.06 * vnoise( x * 1.1 + 3, z * 1.1 ) + 0.035 * vnoise( x * 3.3, z * 3.3 ) + 0.015 * vnoise( x * 8.1 + 4, z * 8.1 );
	const domeY = ( x, z ) => {

		const r = Math.hypot( x, z ), p = kprof( r ), g = ground( x, z );
		return g + ( gc - g ) * p + KH * p + lump( x, z ) * ss( 0, 0.15, p );

	};

	const domeN = ( x, z ) => {

		const e = 0.03;
		return V( domeY( x - e, z ) - domeY( x + e, z ), 2 * e, domeY( x, z - e ) - domeY( x, z + e ) ).normalize();

	};

	// the ladder's line, and the vents, which keep clear of it
	const LA = 2.3;
	const vents = [];
	for ( let i = 0; i < 15; i ++ ) vents.push( [ LA + 0.35 + i / 15 * ( Math.PI * 2 - 0.7 ) + ( R() - 0.5 ) * 0.12, kAt( 0.17 + R() * 0.07 ) ] );
	for ( let i = 0; i < 5; i ++ ) vents.push( [ LA + 0.9 + i / 5 * ( Math.PI * 2 - 1.5 ) + ( R() - 0.5 ) * 0.3, kAt( 0.8 + R() * 0.06 ) ] );
	const ventPts = vents.map( ( [ a, r ] ) => {

		const x = Math.cos( a ) * r, z = Math.sin( a ) * r;
		return { p: V( x, domeY( x, z ), z ), n: domeN( x, z ) };

	} );

	// --- the dome: rings from the crown's opening down to the foot, and a lip into the ground
	{

		const NR = 26, NS = 64, pos = [], cols = [], idx = [];
		for ( let i = 0; i <= NR + 1; i ++ ) for ( let j = 0; j < NS; j ++ ) {

			const a = j / NS * Math.PI * 2;
			const r = i > NR ? KR + 0.07 : 0.13 + ( KR - 0.13 ) * Math.sin( Math.PI / 2 * i / NR );
			const x = Math.cos( a ) * r, z = Math.sin( a ) * r;
			const y = i > NR ? ground( x, z ) - 0.08 : domeY( x, z );
			pos.push( x, y, z );
			// the skin: charcoal dust and earth, blacker and fresher toward the crown, browner
			// soil at the foot; scorched round every vent, a yellow-brown tar stain above it
			const p = kprof( r );
			const c = mixc( '#29241f', '#3b3129', ss( - 0.3, 0.5, vnoise( x * 1.7, z * 1.7 ) ) );
			c.lerp( col( '#1a1816' ), ss( 0.55, 1, p ) * 0.8 );
			c.lerp( col( '#43372b' ), ( 1 - ss( 0.02, 0.2, p ) ) * 0.6 );
			for ( const v of ventPts ) {

				const d = Math.hypot( x - v.p.x, y - v.p.y, z - v.p.z );
				c.lerp( col( '#0f0e0d' ), ( 1 - ss( 0.05, 0.22, d ) ) * 0.8 );
				const above = y - v.p.y, side = Math.hypot( x - v.p.x, z - v.p.z ), wd = 0.12 + above * 0.2;
				if ( above > 0 && above < 0.35 && side < wd ) c.lerp( col( '#5a4a28' ), 0.35 * ( 1 - above / 0.35 ) * ( 1 - side / wd ) );

			}

			// turf showing through where the dust has slid off: patches low down, few higher up
			// (painted: the dirt shader's pebbles turn to white flecks on anything this dark)
			const tn = vnoise( x * 1.9 + 7, z * 1.9 ) + 0.4 * vnoise( x * 5, z * 5 );
			const turf = ss( lerp( 0.0, 0.75, ss( 0.08, 0.4, p ) ), lerp( 0.4, 1.1, ss( 0.08, 0.4, p ) ), tn );
			c.lerp( mixc( '#34421e', '#453e27', ss( - 0.3, 0.4, vnoise( x * 4 + 2, z * 4 ) ) ), turf * 0.85 );
			// grey ash where the skin has dried
			c.lerp( col( '#4b4741' ), 0.4 * ss( 0.45, 0.8, vnoise( x * 2.4 - 5, z * 2.4 + 1 ) ) * ( 1 - turf ) );
			c.multiplyScalar( 0.85 + 0.3 * Math.max( 0, vnoise( x * 9, z * 9 ) ) );
			cols.push( c.r, c.g, c.b );

		}

		for ( let i = 0; i <= NR; i ++ ) for ( let j = 0; j < NS; j ++ ) {

			const a = i * NS + j, b = i * NS + ( j + 1 ) % NS, c = a + NS, d = b + NS;
			idx.push( a, b, c, b, d, c );

		}

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'color', new THREE.Float32BufferAttribute( cols, 3 ) );
		g.setIndex( idx );
		g.computeVertexNormals();
		if ( g.getAttribute( 'normal' ).getY( NS * 3 ) < 0 ) {

			const ia = g.index.array;
			for ( let i = 0; i < ia.length; i += 3 ) [ ia[ i + 1 ], ia[ i + 2 ] ] = [ ia[ i + 2 ], ia[ i + 1 ] ];
			g.computeVertexNormals();

		}

		k.add( g, M.LEATHER, null );

	}

	// the crown: the filling shaft, stopped with a sod set down askew, a dark gap at one side
	{

		const y = domeY( 0.13, 0 );
		const hole = new THREE.CircleGeometry( 0.15, 12 );
		hole.rotateX( - Math.PI / 2 );
		hole.translate( 0, y - 0.05, 0 );
		k.add( hole, M.VOID, col( '#000000' ) );
		blob( k, [ 0.16, 0.04, 0.13 ], 0.5, [ 0.05, y - 0.005, 0.035 ], [ 0.08, 0.4, - 0.1 ], M.LEATHER, col( '#343823' ) );
		info.top = [ - 0.07, y + 0.02, - 0.08 ];

	}

	// --- the vents: small round holes poked through the skin, a lip of earth round each
	for ( const { p, n } of ventPts ) {

		const q = new THREE.Quaternion().setFromUnitVectors( V( 0, 0, 1 ), n );
		const h = new THREE.CircleGeometry( 0.04, 8 );
		h.applyQuaternion( q );
		h.translate( p.x + n.x * 0.006, p.y + n.y * 0.006, p.z + n.z * 0.006 );
		k.add( h, M.VOID, col( '#000000' ) );
		const t = new THREE.TorusGeometry( 0.055, 0.017, 4, 10 );
		t.applyQuaternion( q );
		t.translate( p.x, p.y, p.z );
		k.add( t, M.LEATHER, col( '#171513' ) );
		info.vents.push( [ p.x + n.x * 0.05, p.y + n.y * 0.05, p.z + n.z * 0.05 ] );

	}

	// --- turf sods at the foot where the dust is thin, and billet ends showing under the cover
	for ( let i = 0; i < 16; i ++ ) {

		const a = R() * Math.PI * 2, r = kAt( 0.08 + R() * 0.2 );
		if ( adiff( a, LA ) < 0.3 ) continue;
		const x = Math.cos( a ) * r, z = Math.sin( a ) * r, n = domeN( x, z );
		const out = V( Math.cos( a ), 0, Math.sin( a ) );
		const dn = out.clone().addScaledVector( n, - out.dot( n ) ).normalize();
		const s = new THREE.Vector3().crossVectors( n, dn ).normalize();
		const g = new THREE.BoxGeometry( 0.34 + R() * 0.1, 0.06, 0.26 + R() * 0.08, 2, 1, 2 );
		const gp = g.getAttribute( 'position' );
		for ( let j = 0; j < gp.count; j ++ ) gp.setY( j, gp.getY( j ) - 1.2 * ( gp.getX( j ) ** 2 + gp.getZ( j ) ** 2 ) + ( R() - 0.5 ) * 0.02 );
		g.computeVertexNormals();
		g.applyMatrix4( new THREE.Matrix4().makeBasis( s, n, dn ).setPosition( x + n.x * 0.015, domeY( x, z ) + n.y * 0.015, z + n.z * 0.015 ) );
		k.add( g, M.LEATHER, mixc( '#2b3120', '#3d3625', R() ) );

	}

	for ( let i = 0; i < 12; i ++ ) {

		const a = R() * Math.PI * 2;
		if ( adiff( a, LA ) < 0.3 ) continue;
		const r = KR - 0.08, x = Math.cos( a ) * r, z = Math.sin( a ) * r;
		billet( k, 0.05 + R() * 0.03, 0.34, Math.floor( R() * 3 ), R() * 6, [ x, ground( x, z ) + 0.07 + R() * 0.12, z ], [ 0, Math.atan2( Math.cos( a ), Math.sin( a ) ) + ( R() - 0.5 ) * 0.3, R() * 3, 'YXZ' ], mixc( '#3a2f25', '#6a5540', R() ) );

	}

	// --- the black ground round it: the burnt floor of the kiln stead, ash and fines, the
	// forest floor coming back at the edge; a tongue of it out to the charcoal heap
	const HEAP = { x: 4.35, z: 2.25 };
	{

		const ha = Math.atan2( HEAP.z, HEAP.x );
		patch( k, ground, 0, 0, ( a ) => {

			const d = adiff( a, ha );
			return 4.5 + 0.45 * Math.sin( a * 3 + 1 ) + 0.3 * Math.sin( a * 7 ) + 1.6 * Math.exp( - d * d * 5 );

		}, ( x, z, f ) => 0.035 - 0.027 * f, ( x, z, f ) => {

			const c = mixc( '#1b1917', '#2a2521', ss( - 0.4, 0.6, vnoise( x * 1.3, z * 1.3 ) ) );
			c.lerp( col( '#4c4843' ), 0.55 * ss( 0.35, 0.8, vnoise( x * 2.7 + 3, z * 2.7 ) ) * ( 1 - f ) );
			c.lerp( col( '#3b3026' ), ss( 0.5, 1, f ) * 0.7 );
			// the forest floor's moss and needles creeping back in at the edge
			c.lerp( mixc( '#3a3a24', '#4d3f2a', ss( - 0.3, 0.3, vnoise( x * 3, z * 3 ) ) ), ss( 0.72, 1, f + 0.25 * vnoise( x * 2.2, z * 2.2 ) ) * 0.8 );
			c.multiplyScalar( 0.85 + 0.3 * Math.max( 0, vnoise( x * 11, z * 11 ) ) );
			return c;

		}, () => 0.85, { rings: 7, segs: 64, r0: KR - 0.06, mat: M.LEATHER } );
		for ( let i = 0; i < 40; i ++ ) {

			const a = R() * Math.PI * 2, r = KR + 0.2 + R() * 1.9, x = Math.cos( a ) * r, z = Math.sin( a ) * r;
			k.box( x, ground( x, z ) + 0.04, z, 0.02 + R() * 0.05, 0.015 + R() * 0.02, 0.02 + R() * 0.04, M.LOG, col( '#161513' ), { rot: [ R() * 0.5, R() * 3, R() * 0.5 ] } );

		}

		info.collision.push( [ 0, 0, KR - 0.05, KR - 0.05 ] );

	}

	// --- the ladder: two rails and rungs, resting on the dome where it touches, its top out
	// over the crown
	{

		const rf = KR + 0.95, fx = Math.cos( LA ) * rf, fz = Math.sin( LA ) * rf, fy = ground( fx, fz );
		// the line from its foot that just touches the dome
		let best = - Infinity, rt = 1;
		for ( let r = 0.3; r < KR; r += 0.02 ) {

			const s = ( domeY( Math.cos( LA ) * r, Math.sin( LA ) * r ) + 0.05 - fy ) / ( rf - r );
			if ( s > best ) {

				best = s;
				rt = r;

			}

		}

		const foot = V( fx, fy - 0.05, fz ), touch = V( Math.cos( LA ) * rt, domeY( Math.cos( LA ) * rt, Math.sin( LA ) * rt ) + 0.05, Math.sin( LA ) * rt );
		const d = touch.clone().sub( foot ).normalize(), top = foot.clone().addScaledVector( d, 3.6 );
		const side = V( - Math.sin( LA ), 0, Math.cos( LA ) );
		const rail = mixc( '#6e5b47', '#7d6a55', 0.5 );
		for ( const s of [ - 1, 1 ] ) k.pole( foot.clone().addScaledVector( side, s * 0.23 ), top.clone().addScaledVector( side, s * 0.2 ), 0.035, M.LOG, rail, s * 2 );
		for ( let t = 0.3; t < 3.5; t += 0.31 ) {

			const p = foot.clone().addScaledVector( d, t ), w = 0.23 - 0.03 * t / 3.6 + 0.04;
			k.pole( p.clone().addScaledVector( side, - w ), p.clone().addScaledVector( side, w ), 0.02, M.LOG, rail.clone().multiplyScalar( 0.9 + 0.2 * R() ), t * 5 );

		}

	}

	// --- tools: a shovel stuck in the ground, a rake stood on its handle, a long poker lying
	{

		const sx = - 3.35, sz = 1.85, g = ground( sx, sz ), tilt = 0.32, yaw = 0.6;
		const up = V( Math.sin( tilt ) * Math.sin( yaw ), Math.cos( tilt ), Math.sin( tilt ) * Math.cos( yaw ) );
		const across = V( Math.cos( yaw ), 0, - Math.sin( yaw ) );
		const bladeTop = V( sx, g + 0.1, sz );
		// the blade, half in the earth, dished
		const b = new THREE.BoxGeometry( 0.22, 0.3, 0.005, 2, 2, 1 );
		const bp = b.getAttribute( 'position' );
		for ( let i = 0; i < bp.count; i ++ ) bp.setZ( i, bp.getZ( i ) + 0.04 * bp.getX( i ) * bp.getX( i ) / 0.0121 );
		b.computeVertexNormals();
		b.translate( 0, - 0.15, 0 );
		b.applyMatrix4( new THREE.Matrix4().makeBasis( across, up, new THREE.Vector3().crossVectors( across, up ) ).setPosition( bladeTop ) );
		k.add( b, M.IRON, col( '#433e39' ) );
		const hTop = bladeTop.clone().addScaledVector( up, 1.05 );
		k.pole( bladeTop.clone().addScaledVector( up, - 0.02 ), hTop, 0.018, M.LOG, col( '#7a6450' ), 3 );
		k.pole( bladeTop.clone().addScaledVector( up, - 0.03 ), bladeTop.clone().addScaledVector( up, 0.12 ), 0.024, M.IRON, col( '#3a3632' ), 4 );
		const grip = new THREE.TorusGeometry( 0.06, 0.012, 5, 10, Math.PI );
		grip.rotateY( yaw );
		grip.translate( hTop.x, hTop.y, hTop.z );
		k.add( grip, M.LOG, col( '#6a5645' ) );
		// the rake, stood on its handle end by the woodstack, tines to the sky
		const rx = 3.25, rz = - 2.05;
		rake( k, V( rx, ground( rx, rz ) - 0.15, rz ), V( rx + 0.25, ground( rx, rz ) + 2.15, rz - 0.12 ), R );
		// the long poker for the vents, lying where it was dropped
		const a = V( - 1.6, 0, 3.35 ), c = V( 1.2, 0, 3.7 );
		a.y = ground( a.x, a.z ) + 0.03;
		c.y = ground( c.x, c.z ) + 0.025;
		k.pole( a, c, 0.022, M.LOG, col( '#6c5a48' ), 8 );
		// a wooden bucket of water for flare-ups
		const bx = - 2.95, bz = 0.95, bg = ground( bx, bz );
		lathe( k, [ [ 0, 0 ], [ 0.14, 0 ], [ 0.162, 0.32 ] ], V( bx, bg - 0.01, bz ), M.BOARD, col( '#5f4d3b' ), 16 );
		lathe( k, [ [ 0.155, 0.31 ], [ 0.137, 0.02 ] ], V( bx, bg - 0.01, bz ), M.BOARD, col( '#3a2f25' ), 16 );
		for ( const y of [ 0.06, 0.26 ] ) {

			const t = new THREE.TorusGeometry( 0.143 + y * 0.07, 0.006, 4, 18 );
			t.rotateX( Math.PI / 2 );
			t.translate( bx, bg + y, bz );
			k.add( t, M.IRON, col( '#2f2b28' ) );

		}

		const w = new THREE.CircleGeometry( 0.15, 16 );
		w.rotateX( - Math.PI / 2 );
		w.translate( bx, bg + 0.25, bz );
		k.add( w, M.BRONZE, col( '#101416' ) );

	}

	// --- the heap of finished charcoal, two filled sacks by it, a basket
	{

		const hr = ( a ) => 0.95 + 0.12 * Math.sin( a * 3 + 2 ) + 0.06 * Math.sin( a * 7 );
		const hh = ( f ) => 0.55 * Math.pow( Math.max( 0, 1 - f * f ), 1.2 );
		patch( k, ground, HEAP.x, HEAP.z, hr, ( x, z, f ) => 0.03 + hh( f ) + 0.03 * vnoise( x * 9, z * 9 ) * ( 1 - f ), ( x, z ) => col( '#151413' ).multiplyScalar( 0.8 + 0.4 * Math.max( 0, vnoise( x * 13, z * 13 ) ) ), () => 0.7, { rings: 6, segs: 28, mat: M.LEATHER } );
		for ( let i = 0; i < 70; i ++ ) {

			const a = R() * Math.PI * 2, f = Math.sqrt( R() ) * 0.95, x = HEAP.x + Math.cos( a ) * hr( a ) * f, z = HEAP.z + Math.sin( a ) * hr( a ) * f;
			const s = 0.04 + R() * 0.08;
			k.box( x, ground( x, z ) + 0.03 + hh( f ) + s * 0.2, z, s * ( 1 + R() ), s * 0.7, s, M.LOG, mixc( '#141416', '#26252a', R() ), { rot: [ R() * 1.5, R() * 3, R() * 1.5 ] } );

		}

		for ( const [ x, z, yaw, lean ] of [ [ 5.45, 1.35, 0.4, 0.1 ], [ 5.2, 3.05, 1.2, - 0.15 ] ] ) {

			const L = new Local();
			blob( L, [ 0.21, 0.3, 0.16 ], 0.45, [ 0, 0.3, 0 ], null, M.LEATHER, mixc( '#6e5a40', '#5a4a36', R() ), ( q, sx, sy ) => {

				q.x *= 1 + 0.25 * ( 1 - sy ) * 0.5 - 0.2 * Math.max( 0, sy ) ** 3;
				q.z *= 1 + 0.25 * ( 1 - sy ) * 0.5 - 0.2 * Math.max( 0, sy ) ** 3;
				q.x += 0.01 * Math.sin( sy * 9 + sx * 3 );

			} );
			blob( L, [ 0.06, 0.07, 0.05 ], 0.3, [ 0.01, 0.64, 0 ], [ 0, 0, 0.2 ], M.LEATHER, col( '#5f4d37' ) );
			const t = new THREE.TorusGeometry( 0.045, 0.007, 4, 10 );
			t.rotateX( Math.PI / 2 );
			t.translate( 0.0, 0.6, 0 );
			L.add( t, M.ROPE, col( '#6b5a45' ) );
			L.settle( lean, yaw, 0.05 ).into( k, onGround( ground, x, z, 0, - 0.03 ) );

		}

		const bx = 3.55, bz = 3.35, bg = ground( bx, bz );
		lathe( k, [ [ 0, 0.02 ], [ 0.19, 0 ], [ 0.27, 0.32 ], [ 0.285, 0.34 ] ], V( bx, bg - 0.01, bz ), M.ROPE, col( '#6a5438' ), 18 );
		lathe( k, [ [ 0.275, 0.335 ], [ 0.2, 0.03 ] ], V( bx, bg - 0.01, bz ), M.ROPE, col( '#4a3b28' ), 18 );
		for ( let i = 0; i < 14; i ++ ) {

			const a = R() * 6.28, r = R() * 0.2;
			k.box( bx + Math.cos( a ) * r, bg + 0.3 + R() * 0.03, bz + Math.sin( a ) * r, 0.06 + R() * 0.04, 0.04, 0.05, M.LOG, col( '#151417' ), { rot: [ R(), R() * 3, R() ] } );

		}

		info.collision.push( [ HEAP.x, HEAP.z, 1.0, 1.0 ] );

	}

	// --- the stack of split billets waiting for the next burn, between stakes, on two sleepers
	{

		const SX = 5.0, SZ = - 3.4, yaw = 0.3;
		const c = Math.cos( yaw ), s = Math.sin( yaw );
		const lg = ( x, z ) => ground( SX + c * x + s * z, SZ - s * x + c * z );
		const L = new Local();
		for ( const z of [ - 0.3, 0.3 ] ) L.pole( V( - 1.35, lg( - 1.35, z ) + 0.05, z ), V( 1.35, lg( 1.35, z ) + 0.05, z ), 0.06, M.BARK, col( '#4f4135' ), z * 9 );
		for ( const x of [ - 1.38, 1.38 ] ) for ( const z of [ - 0.38, 0.38 ] ) L.pole( V( x, lg( x, z ) - 0.2, z ), V( x + ( R() - 0.5 ) * 0.06, lg( x, z ) + 1.3, z + ( R() - 0.5 ) * 0.06 ), 0.045, M.BARK, col( '#56483b' ), x + z );
		for ( let x = - 1.27; x < 1.28; x += 0.135 ) {

			const topH = 1.02 + 0.12 * Math.sin( x * 2.3 ) + ( R() - 0.5 ) * 0.1;
			const gb = Math.max( lg( x, - 0.3 ), lg( x, 0.3 ) ) + 0.14;
			for ( let y = 0; y < topH; y += 0.125 ) {

				const r = 0.058 + R() * 0.025;
				const tone = mixc( '#8a6e50', '#a88c69', R() ).multiplyScalar( 0.75 + 0.3 * R() );
				billet( L, r, 1.0 + ( R() - 0.5 ) * 0.12, R() < 0.15 ? 2 : Math.floor( R() * 2 ), R() * 6.28, [ x + ( R() - 0.5 ) * 0.03, gb + y + ( R() - 0.5 ) * 0.02, ( R() - 0.5 ) * 0.06 ], [ ( R() - 0.5 ) * 0.04, ( R() - 0.5 ) * 0.05, 0 ], tone );

			}

		}

		// a few thrown down off the end, ready to carry
		for ( let i = 0; i < 7; i ++ ) {

			const x = - 1.9 - R() * 0.9, z = 0.3 + R() * 1.0;
			billet( L, 0.06 + R() * 0.02, 1.0, Math.floor( R() * 2 ), R() * 6, [ x, lg( x, z ) + 0.06, z ], [ 0, R() * 3, 0, 'YXZ' ], mixc( '#8a6e50', '#a88c69', R() ) );

		}

		L.into( k, new THREE.Matrix4().makeRotationY( yaw ).setPosition( SX, 0, SZ ) );
		info.collision.push( [ SX, SZ, 1.45, 0.85 ] );

	}

	// --- the burner's hut, facing the kiln
	{

		const HX = - 5.5, HZ = - 3.3, yaw = Math.atan2( - HX, - HZ );
		const c = Math.cos( yaw ), s = Math.sin( yaw );
		const lg = ( x, z ) => ground( HX + c * x + s * z, HZ - s * x + c * z );
		const L = new Local();
		const hut = buildBurnerHut( L, lg, R );
		const m = new THREE.Matrix4().makeRotationY( yaw ).setPosition( HX, 0, HZ );
		L.into( k, m );
		info.collision.push( [ HX, HZ, hut.RB + 0.15, hut.RB + 0.15 ] );
		const door = hut.door.applyMatrix4( m );
		info.door = [ door.x, door.y, door.z ];

	}

	return { geometry: k.build(), parts: {}, info };

}
