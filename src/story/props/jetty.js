import * as THREE from 'three';
import { Kit, M, col, mixc } from './kit.js';

// The jetty and the boats, after photographs of plank
// jetties on piles and of the flat-bottomed wooden rowing boats of the Oeschinensee
// (mockups/refs, sheet4). Frames: the jetty's origin is on its centreline where the shore
// meets the water, +z out over the lake, y = 0 at the water's surface. The boat's origin
// is the middle of its bottom, +z toward the bow.

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

// a box from a to b along its length, w wide and h high; `up` fixes its roll
function beam( k, a, b, w, h, mat, c, { up = V( 0, 1, 0 ), round = 0 } = {} ) {

	const d = new THREE.Vector3().subVectors( b, a ), len = d.length();
	const zAx = d.clone().normalize();
	let xAx = new THREE.Vector3().crossVectors( up, zAx );
	if ( xAx.lengthSq() < 1e-6 ) xAx = new THREE.Vector3( 1, 0, 0 ).cross( zAx ).lengthSq() > 1e-6 ? new THREE.Vector3( 1, 0, 0 ).cross( zAx ) : V( 0, 1, 0 );
	xAx.normalize();
	const yAx = new THREE.Vector3().crossVectors( zAx, xAx );
	const g = round > 0 ? new RoundedBox( w, h, len, round ) : new THREE.BoxGeometry( w, h, len );
	const mid = a.clone().add( b ).multiplyScalar( 0.5 );
	g.applyMatrix4( new THREE.Matrix4().makeBasis( xAx, yAx, zAx ).setPosition( mid ) );
	return k.add( g, mat, c, zAx.toArray(), mid.toArray() );

}

// a rounded box (bevelled edges) without the addon's cost: a box with its corners pulled in
function RoundedBox( w, h, d, r ) {

	const g = new THREE.BoxGeometry( w, h, d, 2, 2, 2 );
	const p = g.getAttribute( 'position' );
	const hw = w / 2, hh = h / 2, hd = d / 2;
	for ( let i = 0; i < p.count; i ++ ) {

		let x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
		// vertices on an edge move in along both faces
		const ex = Math.abs( Math.abs( x ) - hw ) < 1e-6, ey = Math.abs( Math.abs( y ) - hh ) < 1e-6, ez = Math.abs( Math.abs( z ) - hd ) < 1e-6;
		const n = ( ex ? 1 : 0 ) + ( ey ? 1 : 0 ) + ( ez ? 1 : 0 );
		if ( n >= 2 ) {

			if ( ex ) x -= Math.sign( x ) * r * 0.3;
			if ( ey ) y -= Math.sign( y ) * r * 0.3;
			if ( ez ) z -= Math.sign( z ) * r * 0.3;

		}

		p.setXYZ( i, x, y, z );

	}

	g.computeVertexNormals();
	return g;

}

// a rectangular section w x h swept along a polyline (rails, battens, stems)
function sweep( k, pts, w, h, mat, c, { up = V( 0, 1, 0 ), caps = true } = {} ) {

	const pos = [], idx = [];
	const n = pts.length;
	const frames = pts.map( ( p, i ) => {

		const t = pts[ Math.min( n - 1, i + 1 ) ].clone().sub( pts[ Math.max( 0, i - 1 ) ] ).normalize();
		let s = new THREE.Vector3().crossVectors( up, t );
		if ( s.lengthSq() < 1e-8 ) s = V( 1, 0, 0 );
		s.normalize();
		const u = new THREE.Vector3().crossVectors( t, s );
		return { s, u };

	} );
	const corner = [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ];
	// four faces, each its own strip so the edges stay sharp
	for ( let f = 0; f < 4; f ++ ) {

		const base = pos.length / 3;
		const [ a0, b0 ] = corner[ f ], [ a1, b1 ] = corner[ ( f + 1 ) % 4 ];
		for ( let i = 0; i < n; i ++ ) {

			const { s, u } = frames[ i ], p = pts[ i ];
			pos.push( ...p.clone().addScaledVector( s, a0 * w / 2 ).addScaledVector( u, b0 * h / 2 ).toArray() );
			pos.push( ...p.clone().addScaledVector( s, a1 * w / 2 ).addScaledVector( u, b1 * h / 2 ).toArray() );

		}

		for ( let i = 0; i < n - 1; i ++ ) {

			const a = base + i * 2;
			idx.push( a, a + 1, a + 2, a + 1, a + 3, a + 2 );

		}

	}

	if ( caps ) for ( const [ i, flip ] of [ [ 0, true ], [ n - 1, false ] ] ) {

		const base = pos.length / 3, { s, u } = frames[ i ];
		for ( const [ a, b ] of corner ) pos.push( ...pts[ i ].clone().addScaledVector( s, a * w / 2 ).addScaledVector( u, b * h / 2 ).toArray() );
		if ( flip ) idx.push( base, base + 2, base + 1, base, base + 3, base + 2 );
		else idx.push( base, base + 1, base + 2, base, base + 2, base + 3 );

	}

	const g = orient( geo( pos, idx ), pts );
	const mid = pts[ Math.floor( n / 2 ) ];
	return k.add( g, mat, c, pts[ n - 1 ].clone().sub( pts[ 0 ] ).normalize().toArray(), mid.toArray() );

}

function geo( pos, idx ) {

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	return g.toNonIndexed();

}

// make every face point away from the nearest point on a centreline (closed tubes)
function orient( g, line ) {

	const p = g.getAttribute( 'position' );
	const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
	for ( let i = 0; i < p.count; i += 3 ) {

		a.fromBufferAttribute( p, i ); b.fromBufferAttribute( p, i + 1 ); c.fromBufferAttribute( p, i + 2 );
		n.subVectors( b, a ).cross( m.subVectors( c, a ) );
		const cen = a.clone().add( b ).add( c ).divideScalar( 3 );
		let best = line[ 0 ], bd = Infinity;
		for ( let j = 0; j < line.length - 1; j ++ ) {

			const s = new THREE.Line3( line[ j ], line[ j + 1 ] ).closestPointToPoint( cen, true, new THREE.Vector3() );
			const d = s.distanceToSquared( cen );
			if ( d < bd ) { bd = d; best = s; }

		}

		if ( n.dot( cen.sub( best ) ) < 0 ) {

			p.setXYZ( i + 1, c.x, c.y, c.z );
			p.setXYZ( i + 2, b.x, b.y, b.z );

		}

	}

	g.computeVertexNormals();
	return g;

}

// a grid surface: P[i][j], with per-vertex centres; its faces turned to point along want(p)
function surface( P, C, want ) {

	const I = P.length, J = P[ 0 ].length, pos = [], cen = [], idx = [];
	for ( let i = 0; i < I; i ++ ) for ( let j = 0; j < J; j ++ ) {

		pos.push( P[ i ][ j ].x, P[ i ][ j ].y, P[ i ][ j ].z );
		cen.push( ...( C ? C[ i ][ j ] : [ 0, 0, 0 ] ) );

	}

	for ( let i = 0; i < I - 1; i ++ ) for ( let j = 0; j < J - 1; j ++ ) {

		const a = i * J + j, b = a + 1, c = a + J, d = c + 1;
		idx.push( a, c, b, b, c, d );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'aCenter', new THREE.Float32BufferAttribute( cen, 3 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	// flip the whole surface if it faces the wrong way on average
	const n = g.getAttribute( 'normal' );
	let s = 0;
	for ( let i = 0; i < n.count; i ++ ) s += n.getX( i ) * want[ i ].x + n.getY( i ) * want[ i ].y + n.getZ( i ) * want[ i ].z;
	if ( s < 0 ) {

		const ia = g.index.array;
		for ( let i = 0; i < ia.length; i += 3 ) [ ia[ i + 1 ], ia[ i + 2 ] ] = [ ia[ i + 2 ], ia[ i + 1 ] ];
		g.computeVertexNormals();

	}

	return g;

}

// a solid curved plank: outer grid P (i along, j across), outward normals N, thickness t.
// Adds outer face (kind mOut), inner face (mIn) and its four edges.
function slab( k, P, Nrm, t, C, mOut, cOut, mIn, cIn ) {

	const I = P.length, J = P[ 0 ].length;
	const Q = P.map( ( row, i ) => row.map( ( p, j ) => p.clone().addScaledVector( Nrm[ i ][ j ], - t ) ) );
	const flat = ( A ) => A.flat();
	k.add( surface( P, C, flat( Nrm ) ), mOut, cOut, [ 0, 0, 1 ] );
	k.add( surface( Q, C, flat( Nrm ).map( ( n ) => n.clone().negate() ) ), mIn, cIn, [ 0, 0, 1 ] );
	// edges: lower (j = 0), upper (j = J - 1), stern end (i = 0), bow end (i = I - 1)
	const edge = ( ptsA, ptsB, cA, wantDir ) => {

		const g = surface( [ ptsA, ptsB ].map( ( r ) => r ).reduce( ( acc, r, ri ) => ( acc.push( r ), acc ), [] ).length ? ptsA.map( ( p, i ) => [ p, ptsB[ i ] ] ) : [], cA, ptsA.flatMap( () => [ wantDir, wantDir ] ) );
		k.add( g, mOut, cOut, [ 0, 0, 1 ] );

	};

	const lowDir = ( i ) => P[ i ][ 0 ].clone().sub( P[ i ][ 1 ] ).normalize();
	edge( P.map( ( r ) => r[ 0 ] ), Q.map( ( r ) => r[ 0 ] ), C.map( ( r ) => [ r[ 0 ], r[ 0 ] ] ), lowDir( Math.floor( I / 2 ) ) );
	edge( P.map( ( r ) => r[ J - 1 ] ), Q.map( ( r ) => r[ J - 1 ] ), C.map( ( r ) => [ r[ J - 1 ], r[ J - 1 ] ] ), lowDir( Math.floor( I / 2 ) ).negate() );
	edge( P[ 0 ], Q[ 0 ], P[ 0 ].map( ( p, j ) => [ C[ 0 ][ j ], C[ 0 ][ j ] ] ), V( 0, 0, - 1 ) );
	edge( P[ I - 1 ], Q[ I - 1 ], P[ I - 1 ].map( ( p, j ) => [ C[ I - 1 ][ j ], C[ I - 1 ][ j ] ] ), V( 0, 0, 1 ) );

}

// a surface of revolution about the y axis: profile [ [ r, y ], ... ], at pos
function lathe( k, profile, pos, mat, c, segs = 16, inward = false ) {

	const g = new THREE.LatheGeometry( profile.map( ( [ r, y ] ) => new THREE.Vector2( r, y ) ), segs );
	if ( inward ) {

		const ia = g.index.array;
		for ( let i = 0; i < ia.length; i += 3 ) [ ia[ i + 1 ], ia[ i + 2 ] ] = [ ia[ i + 2 ], ia[ i + 1 ] ];
		g.computeVertexNormals();

	}

	g.translate( pos.x, pos.y, pos.z );
	return k.add( g, mat, c, [ 0, 1, 0 ], pos.toArray() );

}

function rope( k, pts, r = 0.012, c = '#6b5a45', tension = 0.5 ) {

	const curve = new THREE.CatmullRomCurve3( pts, false, 'catmullrom', tension );
	const g = new THREE.TubeGeometry( curve, Math.max( 12, pts.length * 10 ), r, 7, false );
	const mid = curve.getPoint( 0.5 );
	return k.add( g, M.ROPE, col( c ), curve.getTangent( 0.5 ).toArray(), mid.toArray() );

}

// a carriage bolt: a square washer and a domed head, facing n
function bolt( k, p, n, r = 0.013 ) {

	const q = new THREE.Quaternion().setFromUnitVectors( V( 0, 1, 0 ), n.clone().normalize() );
	const w = new THREE.BoxGeometry( r * 3.4, 0.005, r * 3.4 );
	w.applyQuaternion( q );
	w.translate( ...p.clone().addScaledVector( n, 0.0025 ).toArray() );
	k.add( w, M.IRON, col( '#3b3531' ) );
	const h = new THREE.SphereGeometry( r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2 );
	h.scale( 1, 0.55, 1 );
	h.applyQuaternion( q );
	h.translate( ...p.clone().addScaledVector( n, 0.005 ).toArray() );
	k.add( h, M.IRON, col( '#2f2a26' ) );

}

function ring( k, p, axis, r = 0.05, t = 0.009 ) {

	const g = new THREE.TorusGeometry( r, t, 6, 16 );
	g.applyQuaternion( new THREE.Quaternion().setFromUnitVectors( V( 0, 0, 1 ), axis.clone().normalize() ) );
	g.translate( p.x, p.y, p.z );
	k.add( g, M.IRON, col( '#34302b' ) );

}

// a flat coil of rope on a surface
function coil( k, c, turns = 4, r0 = 0.07, r1 = 0.2, rr = 0.013 ) {

	const pts = [];
	for ( let i = 0; i <= turns * 24; i ++ ) {

		const a = i / 24 * Math.PI * 2, r = r0 + ( r1 - r0 ) * i / ( turns * 24 );
		pts.push( V( c.x + Math.cos( a ) * r, c.y + rr + ( i % 24 < 12 ? 0.004 : 0 ), c.z + Math.sin( a ) * r ) );

	}

	rope( k, pts, rr );

}

// ---------------------------------------------------------------------------
// the boat: a long, narrow, flat-bottomed plank boat (like the Oeschinensee boats): the
// bottom of five planks with rocker, three lapped strakes a side flaring out, a raked
// pointed bow with a stem and an iron stem band, a square transom. Painted slate-black
// outside, faded grey-green inside, chipped to primer and bare wood; pale rub rails.
// ---------------------------------------------------------------------------
export const BOAT = { L: 5.1, draft: 0.08 };

function section( t ) {

	const bG = ( 0.43 + 0.19 * ss( 0, 0.36, t ) ) * ( 1 - Math.pow( Math.max( 0, ( t - 0.5 ) / 0.5 ), 1.5 ) );
	const bC = bG * ( 0.74 - 0.34 * ss( 0.55, 1, t ) );
	const yB = 0.05 * Math.pow( 1 - t, 3 ) + 0.42 * Math.pow( Math.max( 0, ( t - 0.55 ) / 0.45 ), 2.0 );
	const yG = 0.43 + 0.06 * Math.pow( 1 - t, 2 ) + 0.28 * Math.pow( t, 3 );
	return { bG, bC, yB, yG };

}

function sideX( s, y ) {

	return s.bC + ( s.bG - s.bC ) * THREE.MathUtils.clamp( ( y - s.yB ) / Math.max( 1e-3, s.yG - s.yB ), 0, 1 );

}

const T_END = 0.975; // the strakes end here, under the stem

export function buildBoat( { seed = 3, oars = true, gear = true } = {} ) {

	const R = rand( seed );
	const k = new Kit( () => - 10, ( x, y, z, ny ) => 0.8 + 0.2 * THREE.MathUtils.smoothstep( y, 0.05, 0.5 ) );
	const L = BOAT.L, N = 56;
	const zAt = ( t ) => t * L - L / 2;
	const outside = mixc( '#23272b', '#2c2a27', R() );
	const inside = mixc( '#5b635c', '#626456', R() );
	const rail = col( '#8d918e' );
	const wood = () => mixc( '#6f5a45', '#86705a', R() ).multiplyScalar( 0.9 + 0.2 * R() );
	const T = 0.018;

	// --- side strakes, each lapped over the one below and standing proud of it
	const F = [ 0, 0.4, 0.76, 1.0 ];
	for ( const xs of [ - 1, 1 ] ) for ( let s = 0; s < 3; s ++ ) {

		const P = [], Nn = [], C = [];
		for ( let i = 0; i <= N; i ++ ) {

			const t = i / N * T_END, q = section( t ), z = zAt( t );
			const dx = q.bG - q.bC, dy = q.yG - q.yB, dl = Math.hypot( dx, dy ) || 1;
			const nx = dy / dl, ny = - dx / dl;
			const f0 = F[ s ] - ( s > 0 ? 0.05 : 0 ), f1 = F[ s + 1 ] + ( s === 2 ? 0.0 : 0.0 );
			const off = s * T * 0.9;
			const row = [], nrow = [], crow = [];
			for ( let j = 0; j <= 3; j ++ ) {

				const f = f0 + ( f1 - f0 ) * j / 3;
				row.push( V( xs * ( q.bC + dx * f + nx * off ), q.yB + dy * f + ny * off, z ) );
				nrow.push( V( xs * nx, ny, 0 ).normalize() );
				crow.push( [ z, ( f - f0 ) * dl, ( f1 - f0 ) * dl ] );

			}

			P.push( row ); Nn.push( nrow ); C.push( crow );

		}

		slab( k, P, Nn, T, C, M.HULL, outside.clone().multiplyScalar( 0.94 + 0.12 * R() ), M.HULLIN, inside );

	}

	// --- the bottom: one slab, drawn as five planks
	{

		const P = [], Nn = [], C = [];
		for ( let i = 0; i <= N; i ++ ) {

			const t = i / N * T_END, q = section( t ), z = zAt( t ), q2 = section( Math.min( 1, t + 0.01 ) );
			const slope = ( q2.yB - q.yB ) / ( L * 0.01 );
			const nb = V( 0, - 1, slope ).normalize();
			const row = [], nrow = [], crow = [];
			for ( let j = 0; j <= 10; j ++ ) {

				const f = j / 10 * 2 - 1;
				row.push( V( f * ( q.bC + 0.004 ), q.yB, z ) );
				nrow.push( nb );
				crow.push( [ z, f, - 1 ] );

			}

			P.push( row ); Nn.push( nrow ); C.push( crow );

		}

		slab( k, P, Nn, 0.025, C, M.HULL, outside, M.HULLIN, inside.clone().multiplyScalar( 0.85 ) );

	}

	// --- transom: two planks, painted outside and in, with a cap along its top
	{

		const q = section( 0 ), z0 = zAt( 0 );
		const pts = [ V( - q.bG - 0.03, q.yG + 0.03 ), V( - q.bC - 0.02, q.yB - 0.02 ), V( q.bC + 0.02, q.yB - 0.02 ), V( q.bG + 0.03, q.yG + 0.03 ) ];
		const sh = new THREE.Shape( pts.map( ( v ) => new THREE.Vector2( v.x, v.y ) ) );
		const g = new THREE.ExtrudeGeometry( sh, { depth: 0.035, bevelEnabled: false } );
		g.translate( 0, 0, z0 - 0.038 );
		const p = g.getAttribute( 'position' ), cen = new Float32Array( p.count * 3 );
		for ( let i = 0; i < p.count; i ++ ) cen.set( [ p.getX( i ) * 3, ( p.getY( i ) - q.yB ) / ( q.yG - q.yB ) * 0.8 - 1, - 1 ], i * 3 );
		g.setAttribute( 'aCenter', new THREE.BufferAttribute( cen, 3 ) );
		k.add( g, M.HULL, outside, [ 1, 0, 0 ] );
		const gi = new THREE.ShapeGeometry( sh );
		gi.translate( 0, 0, z0 + 0.0005 );
		const pi = gi.getAttribute( 'position' ), ci = new Float32Array( pi.count * 3 );
		for ( let i = 0; i < pi.count; i ++ ) ci.set( [ pi.getX( i ) * 3, ( pi.getY( i ) - q.yB ) / ( q.yG - q.yB ) * 0.8 - 1, - 1 ], i * 3 );
		gi.setAttribute( 'aCenter', new THREE.BufferAttribute( ci, 3 ) );
		k.add( gi, M.HULLIN, inside, [ 1, 0, 0 ] );
		sweep( k, [ V( - q.bG - 0.035, q.yG + 0.045, z0 - 0.02 ), V( q.bG + 0.035, q.yG + 0.045, z0 - 0.02 ) ], 0.075, 0.025, M.PAINT, rail, { up: V( 0, 0, 1 ) } );
		// a brass drain plug low on the transom, a quarter knee inside each corner
		const plug = new THREE.CylinderGeometry( 0.018, 0.018, 0.012, 10 );
		plug.rotateX( Math.PI / 2 );
		plug.translate( 0.08, q.yB + 0.04, z0 - 0.044 );
		k.add( plug, M.BRONZE, col( '#8a6d3b' ) );

	}

	// --- stem with an iron band; the rails: an outwale (rubbing strip), an inwale, a cap
	{

		const stem = [];
		for ( let i = 0; i <= 8; i ++ ) {

			const u = i / 8, t = T_END + ( 1 - T_END ) * u * 0.5;
			const q0 = section( T_END );
			stem.push( V( 0, q0.yB - 0.02 + ( q0.yG + 0.1 - q0.yB ) * u, zAt( t ) + 0.03 + u * 0.1 ) );

		}

		sweep( k, stem, 0.075, 0.06, M.PAINT, outside, { up: V( 1, 0, 0 ) } );
		sweep( k, stem.map( ( p, i ) => p.clone().add( V( 0, 0, 0.032 ) ) ), 0.022, 0.006, M.IRON, col( '#3a3430' ), { up: V( 1, 0, 0 ) } );
		for ( const xs of [ - 1, 1 ] ) {

			const out = [], inw = [], cap = [];
			for ( let i = 0; i <= 30; i ++ ) {

				const t = i / 30 * ( T_END + 0.01 ), q = section( t );
				out.push( V( xs * ( q.bG + 0.026 ), q.yG - 0.02, zAt( t ) ) );
				inw.push( V( xs * ( q.bG - T - 0.018 ), q.yG - 0.028, zAt( t ) ) );
				cap.push( V( xs * ( q.bG - 0.004 ), q.yG + 0.012, zAt( t ) ) );

			}

			sweep( k, out, 0.032, 0.05, M.PAINT, rail, { up: V( 0, 1, 0 ) } );
			sweep( k, inw, 0.028, 0.04, M.PAINT, inside.clone().multiplyScalar( 1.1 ), { up: V( 0, 1, 0 ) } );
			sweep( k, cap, 0.085, 0.02, M.PAINT, rail.clone().multiplyScalar( 0.92 ), { up: V( 0, 1, 0 ) } );

		}

	}

	// --- ribs, floor timbers, risers, thwarts with knees, a small foredeck
	for ( let t = 0.07; t < 0.86; t += 0.08 ) {

		const q = section( t ), z = zAt( t );
		for ( const xs of [ - 1, 1 ] ) {

			const pts = [];
			for ( let j = 0; j <= 4; j ++ ) {

				const f = j / 4, y = q.yB + 0.03 + ( q.yG - 0.04 - q.yB - 0.03 ) * f;
				pts.push( V( xs * ( sideX( q, y ) - T * 2.4 - 0.012 ), y, z ) );

			}

			sweep( k, pts, 0.03, 0.045, M.HULLIN, inside, { up: V( 0, 0, 1 ) } );

		}

		beam( k, V( - q.bC + 0.02, q.yB + 0.042, z ), V( q.bC - 0.02, q.yB + 0.042, z ), 0.05, 0.034, M.HULLIN, inside );

	}

	const thwart = ( t, depth, drop, c ) => {

		const q = section( t ), y = q.yG - drop, half = sideX( q, y ) - T * 3.2;
		k.box( 0, y, zAt( t ), half * 2, 0.034, depth, M.BOARD, c, { axis: [ 1, 0, 0 ], round: 0.01 } );
		for ( const xs of [ - 1, 1 ] ) {

			// a knee from the thwart down the side, and the riser it rests on
			const sh = new THREE.Shape( [ new THREE.Vector2( 0, 0 ), new THREE.Vector2( 0.13, 0 ), new THREE.Vector2( 0, - 0.15 ) ] );
			const g = new THREE.ExtrudeGeometry( sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 } );
			g.translate( 0, 0, - 0.015 );
			if ( xs > 0 ) g.rotateY( Math.PI );
			g.translate( xs * ( half - 0.005 ), y - 0.017, zAt( t ) + depth * 0.25 );
			k.add( g, M.BOARD, c.clone().multiplyScalar( 0.9 ), [ 1, 0, 0 ] );

		}

	};

	for ( const xs of [ - 1, 1 ] ) {

		const pts = [];
		for ( let i = 0; i <= 16; i ++ ) {

			const t = 0.05 + i / 16 * 0.72, q = section( t ), y = q.yG - 0.17;
			pts.push( V( xs * ( sideX( q, y ) - T * 2.4 - 0.028 ), y, zAt( t ) ) );

		}

		sweep( k, pts, 0.028, 0.05, M.BOARD, wood(), { up: V( 0, 1, 0 ) } );

	}

	const tw = wood();
	thwart( 0.1, 0.42, 0.13, tw );
	thwart( 0.46, 0.25, 0.14, tw.clone().multiplyScalar( 1.05 ) );
	thwart( 0.72, 0.23, 0.15, tw.clone().multiplyScalar( 0.95 ) );
	{

		// the foredeck: a triangle of boards from the last thwart to the stem, with the bow ring
		const pts = [];
		for ( let i = 0; i <= 8; i ++ ) {

			const t = 0.86 + i / 8 * ( T_END - 0.86 ), q = section( t );
			pts.push( new THREE.Vector2( sideX( q, q.yG - 0.02 ) - 0.01, zAt( t ) ) );

		}

		const sh = new THREE.Shape( [ ...pts, ...pts.slice().reverse().map( ( v ) => new THREE.Vector2( - v.x, v.y ) ) ] );
		const g = new THREE.ExtrudeGeometry( sh, { depth: 0.022, bevelEnabled: false } );
		g.rotateX( Math.PI / 2 );
		const qa = section( 0.86 ), qb = section( T_END );
		g.translate( 0, 0, 0 );
		const p = g.getAttribute( 'position' );
		for ( let i = 0; i < p.count; i ++ ) {

			const z = p.getZ( i ), t = ( z + L / 2 ) / L;
			p.setY( i, p.getY( i ) + section( Math.min( T_END, t ) ).yG - 0.005 );

		}

		g.computeVertexNormals();
		k.add( g, M.BOARD, wood(), [ 0, 0, 1 ] );
		ring( k, V( 0, qb.yG + 0.035, zAt( T_END ) - 0.04 ), V( 0, 0, 1 ), 0.038, 0.007 );
		bolt( k, V( 0, qa.yG + 0.02, zAt( T_END ) - 0.12 ), V( 0, 1, 0 ), 0.018 );

	}

	// --- floorboards: two slatted panels on battens, clear of the bilge
	for ( const [ t0, t1 ] of [ [ 0.13, 0.41 ], [ 0.5, 0.7 ] ] ) {

		const z0 = zAt( t0 ), z1 = zAt( t1 ), y = 0.07;
		const w = Math.min( sideX( section( t0 ), y ), sideX( section( t1 ), y ) ) - 0.05;
		for ( const z of [ z0 + 0.06, ( z0 + z1 ) / 2, z1 - 0.06 ] ) k.box( 0, y - 0.03, z, w * 2, 0.025, 0.05, M.BOARD, wood().multiplyScalar( 0.8 ), { axis: [ 1, 0, 0 ] } );
		const n = Math.floor( w * 2 / 0.095 );
		for ( let i = 0; i < n; i ++ ) {

			const x = - w + 0.05 + i * ( w * 2 - 0.1 ) / ( n - 1 );
			k.box( x, y, ( z0 + z1 ) / 2, 0.07, 0.02, z1 - z0, M.BOARD, wood(), { axis: [ 0, 0, 1 ], round: 0.006 } );

		}

	}

	// --- rowlocks: an iron plate on the rail, a U-horn on its pin
	for ( const xs of [ - 1, 1 ] ) {

		const t = 0.53, q = section( t ), p = V( xs * ( q.bG - 0.004 ), q.yG + 0.023, zAt( t ) );
		k.box( p.x, p.y, p.z, 0.06, 0.008, 0.14, M.IRON, col( '#2f2b28' ) );
		const horn = new THREE.TorusGeometry( 0.04, 0.008, 6, 10, Math.PI );
		horn.rotateY( Math.PI / 2 );
		horn.translate( p.x, p.y + 0.085, p.z );
		k.add( horn, M.IRON, col( '#2f2b28' ) );
		beam( k, V( p.x, p.y - 0.02, p.z ), V( p.x, p.y + 0.047, p.z ), 0.014, 0.014, M.IRON, col( '#2f2b28' ) );

	}

	// --- oars, shipped: lying along the boat across the thwarts, blades forward
	if ( oars ) for ( const xs of [ - 1, 1 ] ) {

		const a = V( xs * 0.25, 0.47, zAt( 0.02 ) ), b = V( xs * 0.1, 0.4, zAt( 0.02 ) + 2.75 );
		oar( k, a, b, V( xs * 0.3, 1, 0 ).normalize() );

	}

	if ( gear ) {

		// a small grapnel on its chain in the bow, a bailing tin, a sack on the stern seat
		const g0 = V( 0.12, section( 0.8 ).yB + 0.06, zAt( 0.8 ) );
		grapnel( k, g0 );
		let p = g0.clone().add( V( 0, 0.02, - 0.1 ) );
		for ( let i = 0; i < 14; i ++ ) {

			const link = new THREE.TorusGeometry( 0.018, 0.005, 5, 10 );
			link.scale( 1, 1.45, 1 );
			if ( i % 2 ) link.rotateY( Math.PI / 2 );
			link.rotateX( Math.PI / 2 );
			link.translate( p.x, p.y, p.z );
			k.add( link, M.IRON, col( '#3a302a' ) );
			p = p.add( V( - 0.012 * Math.sin( i * 0.6 ), 0, - 0.045 ) );

		}

		lathe( k, [ [ 0.0, 0 ], [ 0.065, 0 ], [ 0.07, 0.14 ], [ 0.073, 0.145 ] ], V( - 0.22, 0.045, zAt( 0.2 ) ), M.IRON, col( '#57534b' ), 14 );
		lathe( k, [ [ 0.068, 0.143 ], [ 0.063, 0.02 ] ], V( - 0.22, 0.045, zAt( 0.2 ) ), M.IRON, col( '#3c3833' ), 14, true );
		const sack = new THREE.IcosahedronGeometry( 1, 2 );
		const sp = sack.getAttribute( 'position' );
		for ( let i = 0; i < sp.count; i ++ ) {

			const x = sp.getX( i ), y = sp.getY( i ), z = sp.getZ( i );
			const f = 1 + 0.12 * Math.sin( x * 5 + z * 3 ) + 0.08 * Math.sin( y * 7 );
			sp.setXYZ( i, x * 0.2 * f, ( y > 0 ? y * 0.07 : y * 0.03 ) * f, z * 0.15 * f );

		}

		sack.computeVertexNormals();
		const qs = section( 0.1 );
		sack.translate( 0.1, qs.yG - 0.1, zAt( 0.1 ) );
		k.add( sack, M.LEATHER, col( '#7d6d52' ) );

	}

	return k.build();

}

function oar( k, a, b, up ) {

	const dir = b.clone().sub( a ), len = dir.length();
	dir.normalize();
	const at = ( d ) => a.clone().addScaledVector( dir, d );
	const loom = mixc( '#8b7a62', '#77664f', 0.5 );
	// handle, loom, a leather sleeve where it works in the rowlock, then the blade
	k.pole( at( 0 ), at( 0.22 ), 0.016, M.LOG, loom.clone().multiplyScalar( 0.8 ), 1 );
	k.pole( at( 0.22 ), at( len - 0.62 ), 0.022, M.LOG, loom, 2 );
	k.pole( at( 0.78 ), at( 0.98 ), 0.026, M.LEATHER, col( '#4a3322' ), 3 );
	const sh = new THREE.Shape();
	sh.moveTo( - 0.02, 0 );
	sh.bezierCurveTo( - 0.03, 0.15, - 0.068, 0.3, - 0.068, 0.55 );
	sh.quadraticCurveTo( - 0.068, 0.64, 0, 0.64 );
	sh.quadraticCurveTo( 0.068, 0.64, 0.068, 0.55 );
	sh.bezierCurveTo( 0.068, 0.3, 0.03, 0.15, 0.02, 0 );
	const g = new THREE.ExtrudeGeometry( sh, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, curveSegments: 10 } );
	g.translate( 0, 0, - 0.004 );
	// blade frame: y along the oar, z across its face (the blade lies flat to `up`)
	const side = new THREE.Vector3().crossVectors( up, dir ).normalize();
	const nrm = new THREE.Vector3().crossVectors( dir, side );
	g.applyMatrix4( new THREE.Matrix4().makeBasis( side, dir, nrm ).setPosition( at( len - 0.64 ) ) );
	k.add( g, M.BOARD, loom.clone().multiplyScalar( 0.9 ), dir.toArray() );
	// a ridge down the back of the blade
	k.pole( at( len - 0.64 ), at( len - 0.1 ), 0.011, M.LOG, loom.clone().multiplyScalar( 0.9 ), 4 );

}

function grapnel( k, p ) {

	const iron = col( '#3a302a' );
	beam( k, p, p.clone().add( V( 0, 0.02, - 0.2 ) ), 0.018, 0.018, M.IRON, iron );
	for ( let i = 0; i < 4; i ++ ) {

		const a = i / 4 * Math.PI * 2 + 0.4;
		const arm = new THREE.TorusGeometry( 0.06, 0.007, 5, 8, Math.PI * 0.6 );
		arm.rotateZ( - Math.PI * 0.3 );
		arm.rotateY( a );
		arm.translate( p.x + Math.cos( a ) * 0.02, p.y + 0.03, p.z + 0.05 );
		k.add( arm, M.IRON, iron );

	}

	ring( k, p.clone().add( V( 0, 0.02, - 0.22 ) ), V( 1, 0, 0 ), 0.022, 0.005 );

}

// The hull's outline at the waterline (for a depth-only lid that keeps the lake's surface
// out of the boat).
export function boatWaterline( draft = BOAT.draft ) {

	const pts = [];
	const L = BOAT.L;
	for ( let i = 0; i <= 40; i ++ ) {

		const t = i / 40 * T_END, q = section( t );
		if ( q.yB > draft + 0.005 ) break;
		pts.push( [ sideX( q, draft + 0.005 ) - 0.012, t * L - L / 2 ] );

	}

	const shape = new THREE.Shape( [ ...pts.map( ( [ x, z ] ) => new THREE.Vector2( x, z ) ), ...pts.slice().reverse().map( ( [ x, z ] ) => new THREE.Vector2( - x, z ) ) ] );
	const g = new THREE.ShapeGeometry( shape );
	g.rotateX( Math.PI / 2 );
	g.translate( 0, draft + 0.006, 0 );
	return g;

}

// ---------------------------------------------------------------------------
// the jetty (after ref 27): square posts in pairs, double caps bolted either side of
// them, four stringers, fascia boards along both sides, plank deck across; braced bents;
// a T-head at the end with bollards, rubbing strakes, a fender, a ladder, a horn cleat, a
// hurricane lantern on a braced post; a stone abutment and the boat-log box at the land end
// ---------------------------------------------------------------------------
export const JETTY = { LEN: 18, W: 1.5, DECK: 0.62, HW: 3.6, HD: 2.8 };

// bed( x, z ): the terrain height in the jetty's frame (world y)
export function buildJetty( bed, { seed = 11, lamp = true, emptyBerth = true } = {} ) {

	const R = rand( seed );
	const { LEN, W, DECK, HW, HD } = JETTY;
	const k = new Kit( bed, ( x, y, z, ny ) => ( ny < - 0.5 ? 0.5 : 1 ) * ( y < DECK - 0.06 && Math.abs( x ) < HW / 2 && z > 0 ? 0.65 + 0.35 * THREE.MathUtils.smoothstep( y, - 0.2, DECK ) : 1 ) );
	const info = {};
	const top = DECK - 0.035; // under the planks
	// the land end: where the deck meets the strand (a stone abutment makes up the rest)
	let z0 = 0;
	while ( z0 > - 4 && bed( 0, z0 ) < top - 0.25 ) z0 -= 0.1;
	info.z0 = z0;
	const weathered = () => mixc( '#8a8378', '#a39b8e', R() ).multiplyScalar( 0.9 + 0.2 * R() );
	const postCol = () => mixc( '#6f675c', '#857c70', R() );
	const iron = col( '#34302b' );

	// --- the abutment: a rubble block up to the deck, flagstone steps down to the strand
	{

		const g = bed( 0, z0 - 0.4 );
		k.box( 0, ( g - 0.3 + top ) / 2, z0 - 0.35, W + 0.5, top - g + 0.3, 1.1, M.RUBBLE, '#8a8479' );
		for ( let i = 0; i < 2; i ++ ) {

			const z = z0 - 1.1 - i * 0.45, gy = bed( 0, z );
			const h = Math.max( 0.05, ( top - gy ) * ( 0.62 - i * 0.3 ) );
			k.box( ( R() - 0.5 ) * 0.1, gy + h / 2 - 0.02, z, W * 0.9 - i * 0.2, h, 0.5, M.FLAG, '#7c776e', { rot: [ 0, ( R() - 0.5 ) * 0.1, 0 ] } );

		}

		for ( let i = 0; i < 14; i ++ ) {

			const x = ( R() < 0.5 ? - 1 : 1 ) * ( W / 2 + 0.2 + R() * 0.6 ), z = z0 - 1.6 + R() * 2.4;
			k.stone( x, bed( x, z ), z, 0.15 + R() * 0.2, 0.1 + R() * 0.14, 0.14 + R() * 0.16, mixc( '#8c877d', '#6f695f', R() ), R() * 40 );

		}

	}

	// --- bents
	const bents = [];
	for ( let z = z0 + 1.1; z < LEN - HD - 0.6; z += 2.3 + R() * 0.15 ) bents.push( { z, head: false } );
	for ( const z of [ LEN - HD + 0.08, LEN - HD / 2, LEN - 0.08 ] ) bents.push( { z, head: true } );
	const px = W / 2 - 0.08, hx = HW / 2 - 0.08;
	const posts = [];
	for ( const { z, head } of bents ) {

		const xsList = head ? [ - hx, - px, px, hx ] : [ - px, px ];
		for ( const x0 of xsList ) {

			const x = x0 + ( R() - 0.5 ) * 0.03, b = bed( x, z );
			const corner = head && Math.abs( x0 ) === hx && Math.abs( z - ( LEN - 0.08 ) ) < 0.01 || head && Math.abs( x0 ) === hx && Math.abs( z - ( LEN - HD + 0.08 ) ) < 0.01;
			const t = corner ? DECK + 0.48 + R() * 0.06 : top;
			k.box( x, ( b - 0.35 + t ) / 2, z, 0.16, t - b + 0.35, 0.16, M.LOG, postCol(), { axis: [ 0, 1, 0 ], round: 0.018 } );
			posts.push( { x, z, b, corner, t } );
			if ( corner ) {

				// a bollard: chamfered top, a pale band where ropes have worn it, a ring
				const cap = new THREE.ConeGeometry( 0.115, 0.05, 4, 1 );
				cap.rotateY( Math.PI / 4 );
				cap.translate( x, t + 0.024, z );
				k.add( cap, M.LOG, postCol(), [ 0, 1, 0 ], [ x, t, z ] );
				ring( k, V( x + Math.sign( x ) * 0.09, DECK + 0.25, z ), V( 1, 0, 0 ), 0.045, 0.008 );
				bolt( k, V( x + Math.sign( x ) * 0.082, DECK + 0.25, z ), V( Math.sign( x ), 0, 0 ), 0.014 );

			}

		}

		// double caps across the bent, bolted through each post
		const cx = head ? hx + 0.1 : px + 0.1, cy = top - 0.14 - 0.09;
		for ( const zs of [ - 1, 1 ] ) {

			k.box( 0, cy, z + zs * 0.105, cx * 2, 0.18, 0.05, M.LOG, postCol(), { axis: [ 1, 0, 0 ], round: 0.01 } );
			for ( const x0 of xsList ) for ( const dy of [ - 0.045, 0.045 ] ) bolt( k, V( x0, cy + dy, z + zs * 0.132 ), V( 0, 0, zs ) );

		}

		// X braces on the lake side of the deeper bents
		const bl = bed( - px, z ), br = bed( px, z );
		if ( ! head && Math.min( bl, br ) < - 0.3 ) {

			const lo = ( b ) => Math.max( b, - 1.2 ) + 0.15;
			const a1 = V( - px, lo( bl ), z + 0.1 ), b1 = V( px, cy - 0.12, z + 0.1 );
			const a2 = V( px, lo( br ), z + 0.13 ), b2 = V( - px, cy - 0.12, z + 0.13 );
			beam( k, a1, b1, 0.03, 0.14, M.BOARD, weathered().multiplyScalar( 0.8 ), { up: V( 0, 0, 1 ) } );
			beam( k, a2, b2, 0.03, 0.14, M.BOARD, weathered().multiplyScalar( 0.8 ), { up: V( 0, 0, 1 ) } );
			for ( const p of [ a1, b1 ] ) bolt( k, p.clone().add( V( 0, 0, 0.018 ) ), V( 0, 0, 1 ) );
			for ( const p of [ a2, b2 ] ) bolt( k, p.clone().add( V( 0, 0, 0.018 ) ), V( 0, 0, 1 ) );

		}

	}

	// --- stringers, and the head's extra ones
	for ( const x of [ - 0.55, - 0.18, 0.18, 0.55 ] ) beam( k, V( x, top - 0.07, z0 - 0.05 ), V( x, top - 0.07, LEN + 0.02 ), 0.075, 0.14, M.LOG, postCol(), { round: 0.01 } );
	for ( const x of [ - 1.45, - 1.0, 1.0, 1.45 ] ) beam( k, V( x, top - 0.07, LEN - HD - 0.02 ), V( x, top - 0.07, LEN + 0.02 ), 0.075, 0.14, M.LOG, postCol(), { round: 0.01 } );

	// --- fascia boards: along both sides of the walk, round the head; a bolt at each post
	{

		const fy = top - 0.1, fz1 = LEN - HD - 0.02;
		for ( const xs of [ - 1, 1 ] ) {

			beam( k, V( xs * ( W / 2 + 0.018 ), fy, z0 - 0.05 ), V( xs * ( W / 2 + 0.018 ), fy, fz1 ), 0.035, 0.2, M.BOARD, weathered(), { round: 0.006 } );
			beam( k, V( xs * ( HW / 2 + 0.018 ), fy, LEN - HD - 0.04 ), V( xs * ( HW / 2 + 0.018 ), fy, LEN + 0.04 ), 0.035, 0.2, M.BOARD, weathered(), { round: 0.006 } );
			beam( k, V( xs * ( W / 2 ), fy, LEN - HD - 0.04 ), V( xs * ( HW / 2 + 0.035 ), fy, LEN - HD - 0.04 ), 0.035, 0.2, M.BOARD, weathered(), { up: V( 0, 1, 0 ), round: 0.006 } );

		}

		beam( k, V( - HW / 2 - 0.035, fy, LEN + 0.058 ), V( HW / 2 + 0.035, fy, LEN + 0.058 ), 0.035, 0.2, M.BOARD, weathered(), { round: 0.006 } );
		for ( const p of posts ) {

			const onWalkSide = Math.abs( Math.abs( p.x ) - px ) < 0.05 && p.z < LEN - HD;
			const onHeadSide = Math.abs( Math.abs( p.x ) - hx ) < 0.05;
			if ( onWalkSide || onHeadSide ) bolt( k, V( Math.sign( p.x ) * ( ( onHeadSide ? HW : W ) / 2 + 0.036 ), fy, p.z ), V( Math.sign( p.x ), 0, 0 ), 0.015 );

		}

	}

	// --- deck planks across the walk and the head; a few replaced, one missing, one sprung
	{

		const plank = ( z, w, halfLen, c, lift = 0, yaw = 0 ) => {

			const g = new THREE.BoxGeometry( halfLen * 2, 0.034, w );
			g.rotateY( yaw );
			g.rotateZ( lift );
			const cx = ( R() - 0.5 ) * 0.03;
			g.translate( cx, top + 0.017 + Math.abs( lift ) * halfLen * 0.6, z );
			const p = g.getAttribute( 'position' ), cen = new Float32Array( p.count * 3 );
			for ( let i = 0; i < p.count; i ++ ) cen.set( [ cx, w, z ], i * 3 );
			g.setAttribute( 'aCenter', new THREE.BufferAttribute( cen, 3 ) );
			k.add( g, M.DECK, c, [ 1, 0, 0 ] );

		};

		let z = z0 - 0.02, i = 0;
		while ( z < LEN + 0.06 ) {

			const w = 0.135 + R() * 0.03;
			const head = z > LEN - HD - 0.05;
			const replaced = R() < 0.07, missing = i === Math.round( ( LEN - HD - 3.2 - z0 ) / 0.15 );
			const c = replaced ? mixc( '#8a6f55', '#9b8066', R() ) : weathered();
			const sprung = R() < 0.04 ? ( R() - 0.5 ) * 0.03 : 0;
			if ( ! missing ) plank( z + w / 2, w, ( head ? HW : W ) / 2 + 0.05 + ( R() - 0.5 ) * 0.04, c, sprung, ( R() - 0.5 ) * 0.012 );
			z += w + 0.009 + R() * 0.007;
			i ++;

		}

	}

	// --- the head's fittings. Right side: the berth, with rubbing strakes and a fender;
	// a horn cleat. Left: a ladder down, J.'s empty berth.
	{

		for ( const dz of [ - HD + 0.5, - HD / 2, - 0.5 ] ) beam( k, V( HW / 2 + 0.055, DECK - 0.03, LEN + dz ), V( HW / 2 + 0.055, - 0.45, LEN + dz ), 0.1, 0.035, M.BOARD, weathered().multiplyScalar( 0.85 ), { up: V( 1, 0, 0 ) } );
		const fz = LEN - HD * 0.62;
		rope( k, [ V( HW / 2 + 0.02, DECK + 0.01, fz ), V( HW / 2 + 0.07, DECK - 0.05, fz ), V( HW / 2 + 0.1, DECK - 0.15, fz ) ], 0.009 );
		const fender = new THREE.CylinderGeometry( 0.075, 0.075, 0.34, 10, 3 );
		fender.translate( HW / 2 + 0.1, DECK - 0.35, fz );
		k.add( fender, M.ROPE, col( '#5f5040' ), [ 0, 1, 0 ], [ HW / 2 + 0.1, DECK - 0.35, fz ] );
		// horn cleat on the deck edge
		const cz = LEN - HD * 0.25, cxx = HW / 2 - 0.12;
		for ( const dz of [ - 0.1, 0.1 ] ) k.box( cxx, DECK + 0.025, cz + dz, 0.07, 0.05, 0.06, M.LOG, postCol(), { round: 0.01 } );
		k.box( cxx, DECK + 0.065, cz, 0.06, 0.035, 0.42, M.LOG, postCol(), { round: 0.012 } );
		for ( const dz of [ - 0.1, 0.1 ] ) bolt( k, V( cxx, DECK + 0.083, cz + dz ), V( 0, 1, 0 ), 0.01 );
		info.cleat = V( cxx, DECK + 0.07, cz );
		// ladder
		const lx = - HW / 2 + 0.5, lz = LEN + 0.1;
		for ( const dx of [ - 0.22, 0.22 ] ) beam( k, V( lx + dx, DECK + 0.4, lz - 0.02 ), V( lx + dx, bed( lx, lz + 0.2 ) - 0.1, lz + 0.18 ), 0.05, 0.07, M.LOG, postCol(), { up: V( 0, 0, 1 ), round: 0.01 } );
		for ( let y = DECK - 0.22; y > - 1.3; y -= 0.28 ) {

			const zz = lz - 0.02 + ( DECK + 0.4 - y ) / ( DECK + 1.5 ) * 0.2;
			k.pole( V( lx - 0.22, y, zz ), V( lx + 0.22, y, zz ), 0.018, M.LOG, postCol(), y * 10 );

		}

	}

	// --- the lamp post on the head's right front corner, its arm and brace, the lantern
	{

		const x = hx - 0.3, z = LEN - 0.08, t = DECK + 2.3;
		k.box( x, ( top - 0.1 + t ) / 2, z, 0.13, t - top + 0.1, 0.13, M.LOG, postCol(), { axis: [ 0, 1, 0 ], round: 0.015 } );
		for ( const dy of [ - 0.12, 0.08 ] ) bolt( k, V( x, top + dy - 0.05, z + 0.066 ), V( 0, 0, 1 ) );
		const cap = new THREE.ConeGeometry( 0.095, 0.05, 4, 1 );
		cap.rotateY( Math.PI / 4 );
		cap.translate( x, t + 0.024, z );
		k.add( cap, M.LOG, postCol(), [ 0, 1, 0 ], [ x, t, z ] );
		const ax = x - 0.6;
		beam( k, V( x - 0.06, t - 0.12, z ), V( ax, t - 0.12, z ), 0.07, 0.08, M.LOG, postCol(), { round: 0.01 } );
		beam( k, V( x - 0.06, t - 0.55, z ), V( x - 0.4, t - 0.16, z ), 0.05, 0.06, M.LOG, postCol(), { up: V( 0, 0, 1 ), round: 0.008 } );
		bolt( k, V( x - 0.25, t - 0.12, z + 0.036 ), V( 0, 0, 1 ) );
		// a hook, and the hurricane lantern hanging from it by its bail
		const hy = t - 0.17;
		beam( k, V( ax + 0.05, t - 0.16, z ), V( ax + 0.05, hy - 0.03, z ), 0.01, 0.01, M.IRON, iron );
		const bail = new THREE.TorusGeometry( 0.085, 0.004, 5, 16, Math.PI );
		bail.translate( ax + 0.05, hy - 0.12, z );
		k.add( bail, M.IRON, iron );
		const b0 = V( ax + 0.05, hy - 0.46, z );
		lathe( k, [ [ 0, 0 ], [ 0.07, 0 ], [ 0.078, 0.012 ], [ 0.078, 0.05 ], [ 0.06, 0.068 ], [ 0.03, 0.075 ] ], b0, M.IRON, col( '#6b2a1c' ), 18 );
		info.lamp = b0.clone().add( V( 0, 0.14, 0 ) );
		if ( lamp ) lathe( k, [ [ 0.028, 0.072 ], [ 0.052, 0.095 ], [ 0.062, 0.135 ], [ 0.055, 0.175 ], [ 0.03, 0.2 ] ], b0, M.GLOW, col( '#ffb35c' ), 18 );
		else lathe( k, [ [ 0.028, 0.072 ], [ 0.052, 0.095 ], [ 0.062, 0.135 ], [ 0.055, 0.175 ], [ 0.03, 0.2 ] ], b0, M.VOID, col( '#000000' ), 18 );
		for ( let i = 0; i < 4; i ++ ) {

			const a = i / 4 * Math.PI * 2 + 0.3, r = 0.072;
			const pts = [ V( Math.cos( a ) * 0.06, 0.075, Math.sin( a ) * 0.06 ), V( Math.cos( a ) * r, 0.135, Math.sin( a ) * r ), V( Math.cos( a ) * 0.058, 0.205, Math.sin( a ) * 0.058 ) ].map( ( p ) => p.add( b0 ) );
			sweep( k, pts, 0.005, 0.005, M.IRON, col( '#6b2a1c' ) );

		}

		lathe( k, [ [ 0.035, 0.2 ], [ 0.058, 0.205 ], [ 0.06, 0.225 ], [ 0.04, 0.245 ], [ 0.02, 0.27 ], [ 0, 0.275 ] ], b0, M.IRON, col( '#6b2a1c' ), 16 );
		for ( const xs of [ - 1, 1 ] ) beam( k, b0.clone().add( V( xs * 0.085, 0.24, 0 ) ), b0.clone().add( V( xs * 0.085, 0.34, 0 ) ), 0.006, 0.006, M.IRON, iron );

	}

	// --- things left on the head: a tin bucket with a rope on it, a coil of line by the
	// left bollard, a boat hook along the edge
	{

		const bp = V( hx - 0.55, top + 0.034, LEN - 0.45 );
		lathe( k, [ [ 0, 0 ], [ 0.11, 0 ], [ 0.135, 0.26 ], [ 0.14, 0.27 ] ], bp, M.IRON, col( '#6d6a62' ), 18 );
		lathe( k, [ [ 0.134, 0.268 ], [ 0.106, 0.012 ], [ 0, 0.012 ] ], bp, M.IRON, col( '#4d4a44' ), 18, true );
		const handle = new THREE.TorusGeometry( 0.135, 0.004, 5, 14, Math.PI );
		handle.rotateY( 0.4 );
		handle.rotateZ( - 1.2 );
		handle.translate( bp.x, bp.y + 0.27, bp.z );
		k.add( handle, M.IRON, iron );
		rope( k, [ bp.clone().add( V( - 0.1, 0.3, 0.05 ) ), bp.clone().add( V( - 0.25, 0.05, 0.1 ) ), bp.clone().add( V( - 0.45, 0.013, 0.02 ) ), bp.clone().add( V( - 0.6, 0.013, - 0.2 ) ) ], 0.009 );
		coil( k, V( - hx + 0.35, top + 0.034, LEN - 0.4 ), 4, 0.06, 0.19, 0.012 );
		const hkA = V( - HW / 2 + 0.2, top + 0.055, LEN - HD + 0.25 ), hkB = V( - HW / 2 + 0.25, top + 0.055, LEN - 0.35 );
		k.pole( hkA, hkB, 0.018, M.LOG, col( '#7b6b58' ), 5 );
		beam( k, hkB, hkB.clone().add( V( 0.01, 0, 0.14 ) ), 0.012, 0.012, M.IRON, iron );
		const hook = new THREE.TorusGeometry( 0.04, 0.007, 5, 10, Math.PI * 1.1 );
		hook.rotateX( - Math.PI / 2 );
		hook.translate( hkB.x + 0.04, hkB.y, hkB.z + 0.1 );
		k.add( hook, M.IRON, iron );

	}

	// --- J.'s berth: only a line left on the left bollard, its frayed end in the water
	if ( emptyBerth ) {

		const x = - hx - 0.09, z = LEN - HD + 0.08;
		rope( k, [ V( x, DECK + 0.25, z ), V( x - 0.15, DECK - 0.05, z + 0.1 ), V( x - 0.35, - 0.02, z + 0.25 ), V( x - 0.8, - 0.05, z + 0.1 ), V( x - 1.4, - 0.1, z - 0.3 ) ], 0.012 );

	}

	// --- the boat-log box on its post by the abutment: a slanted lid, a hasp
	{

		const x = - W / 2 - 0.55, z = z0 - 1.1, g = bed( x, z );
		k.box( x, ( g - 0.3 + g + 1.12 ) / 2, z, 0.1, 1.42, 0.1, M.LOG, postCol(), { axis: [ 0, 1, 0 ], round: 0.012 } );
		const by = g + 1.12;
		k.box( x, by + 0.12, z, 0.38, 0.24, 0.16, M.BOARD, weathered().multiplyScalar( 0.9 ), { axis: [ 1, 0, 0 ], round: 0.006 } );
		k.box( x, by + 0.27, z + 0.01, 0.43, 0.025, 0.24, M.BOARD, weathered().multiplyScalar( 0.8 ), { rot: [ 0.3, 0, 0 ], axis: [ 1, 0, 0 ] } );
		k.box( x, by + 0.16, z + 0.085, 0.03, 0.08, 0.008, M.IRON, iron );
		info.logBox = V( x, by + 0.15, z );

	}

	info.berth = V( HW / 2 + 0.12 + 0.62, 0, LEN - HD * 0.5 ); // your boat, alongside the head
	info.bollard = V( hx + 0.09, DECK + 0.25, LEN - 0.08 );
	info.head = V( 0, DECK, LEN - HD / 2 );
	return { geometry: k.build(), info };

}

// the mooring line from a boat's bow ring to a bollard
export function mooring( a, b ) {

	const k = new Kit( () => - 10, () => 1 );
	const mid = a.clone().lerp( b, 0.5 );
	mid.y = Math.min( a.y, b.y ) - 0.22;
	rope( k, [ a, a.clone().lerp( mid, 0.6 ), mid, b.clone().lerp( mid, 0.5 ), b ] );
	return k.build();

}
