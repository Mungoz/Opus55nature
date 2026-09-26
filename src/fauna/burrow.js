import * as THREE from 'three';
import { polygonize, fieldAO } from '../gen/isosurface.js';
import { noise3, toAlbedo } from './sdf.js';
import { MAT } from './creature.js';

// Marmot burrows, after photographs of burrows in alpine turf: a dark, slightly flattened
// hole running down into a low hummock, often under a few rounded, lichened stones; in
// front a fan of pale, pebbly spoil, worn bare and darker at the mouth, the turf growing
// over the edges of the mound. The terrain around is bare soil too (see terrain.js), and
// the mound's edge fades to that colour and sinks into the ground. Local frame: the hole
// faces +z, ground at y = 0. The tunnel is real, so a marmot can run in and vanish down it.

const smin = ( a, b, k ) => {

	const h = Math.max( k - Math.abs( a - b ), 0 ) / k;
	return Math.min( a, b ) - h * h * k * 0.25;

};

const smax = ( a, b, k ) => - smin( - a, - b, k );

function ellipsoid( x, y, z, c, r ) {

	const px = ( x - c[ 0 ] ) / r[ 0 ], py = ( y - c[ 1 ] ) / r[ 1 ], pz = ( z - c[ 2 ] ) / r[ 2 ];
	const k0 = Math.hypot( px, py, pz ), k1 = Math.hypot( px / r[ 0 ], py / r[ 1 ], pz / r[ 2 ] );
	return k1 > 1e-9 ? k0 * ( k0 - 1 ) / k1 : - Math.min( ...r );

}

function capsule( x, y, z, a, b, r ) {

	const bx = b[ 0 ] - a[ 0 ], by = b[ 1 ] - a[ 1 ], bz = b[ 2 ] - a[ 2 ];
	const px = x - a[ 0 ], py = y - a[ 1 ], pz = z - a[ 2 ];
	const t = Math.max( 0, Math.min( 1, ( px * bx + py * by + pz * bz ) / ( bx * bx + by * by + bz * bz ) ) );
	return Math.hypot( px - bx * t, py - by * t, pz - bz * t ) - r;

}

// the tunnel: in at the mouth, down and back into the slope
export const TUNNEL = { mouth: new THREE.Vector3( 0, 0.02, 0.62 ), entry: new THREE.Vector3( 0, 0.05, 0.3 ), deep: new THREE.Vector3( 0, - 0.32, - 0.55 ) };

export function burrowGeometry( seed, slab ) {

	const s = seed * 13.7;
	const mound = ( x, y, z ) => {

		// a low hummock behind the hole and a flatter fan of spoil in front, sinking into the
		// ground at its ragged edge
		let d = smin( ellipsoid( x, y, z, [ 0, - 0.42, - 0.15 ], [ 1.1, 0.64, 1.2 ] ), ellipsoid( x, y, z, [ 0.05, - 0.2, 0.8 ], [ 1.0, 0.22, 0.95 ] ), 0.35 );
		d += 0.05 * noise3( x * 3 + s, y * 3, z * 3 ) + 0.03 * noise3( x * 7 + s, y * 7, z * 7 ) + 0.01 * noise3( x * 19, y * 19 + s, z * 19 );
		return d;

	};

	// rounded stones: one lying over the entrance (where there is one), others beside it
	const stones = [];
	const R = ( k ) => noise3( s + k * 3.1, k * 1.7, s * 0.3 ) * 0.5 + 0.5;
	if ( slab ) stones.push( { c: [ 0.03, 0.3, 0.1 ], r: [ 0.5, 0.17, 0.38 ], tilt: 0.12 } );
	stones.push( { c: [ - 0.42 - 0.1 * R( 1 ), 0.1, 0.35 ], r: [ 0.2 + 0.08 * R( 2 ), 0.15, 0.2 ], tilt: - 0.2 } );
	if ( R( 3 ) > 0.4 ) stones.push( { c: [ 0.45 + 0.1 * R( 4 ), 0.06, 0.42 ], r: [ 0.16, 0.12, 0.18 ], tilt: 0.3 } );
	const rock = ( x, y, z ) => {

		let d = 1e9;
		for ( const st of stones ) {

			const yy = y - st.tilt * ( x - st.c[ 0 ] );
			d = Math.min( d, ellipsoid( x, yy, z, st.c, st.r ) );

		}

		// weathered, not smooth: broad lumps and fine pitting
		return d + 0.03 * noise3( x * 6 + s, y * 6, z * 6 ) + 0.008 * noise3( x * 25, y * 25, z * 25 + s );

	};

	const tunnel = ( x, y, z ) => {

		// slightly flattened, as they are
		const yy = ( y - 0.07 ) * 1.25 + 0.07;
		return Math.min( capsule( x, yy, z, [ 0, 0.07, 0.62 ], [ 0, 0.02, 0.2 ], 0.155 ), capsule( x, yy, z, [ 0, 0.02, 0.2 ], [ 0, - 0.4, - 0.75 ], 0.15 ) );

	};

	const sdf = ( x, y, z ) => {

		let d = smin( mound( x, y, z ), rock( x, y, z ), 0.04 );
		d = smax( d, - tunnel( x, y, z ), 0.05 );
		return Math.max( d, - ( y + 0.14 ) );

	};

	const { pos, nrm, idx } = polygonize( sdf, [ - 1.35, - 0.16, - 1.4 ], [ 1.35, 0.5, 1.8 ], 0.035 );
	const nv = pos.length / 3;
	const col = new Float32Array( nv * 3 ), mat = new Float32Array( nv );
	const c = new THREE.Color();
	// the spoil pale and gritty, like the terrain's bare soil round it (its edge takes that
	// colour exactly), darker and worn at the mouth
	const soil = new THREE.Color( '#76634f' ), edgeSoil = new THREE.Color( '#6f5b47' ), grit = new THREE.Color( '#a89b88' ), damp = new THREE.Color( '#4e3e30' ), stone = new THREE.Color( '#8f8d86' ), lichen = new THREE.Color( '#a8a56e' ), lichen2 = new THREE.Color( '#c9c7b8' );
	for ( let v = 0; v < nv; v ++ ) {

		const x = pos[ v * 3 ], y = pos[ v * 3 + 1 ], z = pos[ v * 3 + 2 ];
		// (the flattened ellipsoids' distance estimate is too short for field AO on the spoil;
		// only the stones and the tunnel take it)
		const onRock = rock( x, y, z ) < mound( x, y, z ) - 0.01;
		let ao = onRock || tunnel( x, y, z ) < 0.08 ? fieldAO( sdf, x, y, z, nrm[ v * 3 ], nrm[ v * 3 + 1 ], nrm[ v * 3 + 2 ], 0.05 ) : 1;
		// a little shade where the spoil meets a stone
		if ( ! onRock ) ao *= 0.75 + 0.25 * Math.min( 1, rock( x, y, z ) / 0.12 );
		if ( onRock ) {

			c.copy( stone ).multiplyScalar( 0.8 + 0.3 * noise3( x * 20, y * 20, z * 20 + s ) );
			// crusts of yellow-green and pale grey lichen on the tops
			if ( noise3( x * 11 + s, y * 11, z * 11 ) > 0.3 && nrm[ v * 3 + 1 ] > 0.2 ) c.lerp( lichen, 0.55 );
			else if ( noise3( x * 17, y * 17 + s, z * 17 ) > 0.45 ) c.lerp( lichen2, 0.45 );
			// earthy where it sits in the spoil
			c.lerp( damp, Math.max( 0, 1 - ( y + 0.02 ) / 0.1 ) * 0.5 );

		} else {

			const g = noise3( x * 13 + s, y * 13, z * 13 ) * 0.5 + 0.5;
			c.copy( soil ).lerp( grit, Math.max( 0, g - 0.45 ) * 1.4 );
			// darker, damp earth round the mouth; pale pebbles scattered in the spoil
			const toMouth = Math.hypot( x, y - 0.07, z - 0.45 );
			c.lerp( damp, Math.max( 0, 1 - toMouth / 0.5 ) * 0.75 );
			if ( noise3( x * 38, y * 38 + s, z * 38 ) > 0.55 ) c.lerp( grit, 0.8 );
			// fading to the terrain's soil at the rim, where it meets the ground
			c.lerp( edgeSoil, Math.max( 0, 1 - ( y + 0.12 ) / 0.1 ) );

		}

		// the tunnel falls into darkness
		const wall = tunnel( x, y, z ) > - 0.03 && tunnel( x, y, z ) < 0.05 ? 1 : 0;
		const inside = wall * Math.max( 0, 0.45 - z ) * 2.2;
		c.multiplyScalar( Math.sqrt( ao ) * Math.max( 0.05, 1 - Math.min( 1, inside ) ) );
		toAlbedo( c.r, c.g, c.b, col, v * 3 );
		mat[ v ] = MAT.PLAIN;

	}

	// tufts of turf growing over the edges of the mound (not on the fan in front)
	const P = Array.from( pos ), N = Array.from( nrm ), Cc = Array.from( col ), M = Array.from( mat ), I = Array.from( idx );
	const gc = new THREE.Color(), up = new THREE.Vector3();
	let seedK = seed * 97.1;
	const rnd = () => ( seedK = ( seedK * 16807 + 11 ) % 2147483647 ) / 2147483647;
	for ( let t = 0; t < 70; t ++ ) {

		const a = rnd() * Math.PI * 2, r = 0.45 + rnd() * 0.75;
		const tx = Math.cos( a ) * r, tz = Math.sin( a ) * r - 0.15;
		if ( tz > 0.25 && Math.abs( tx ) < 0.55 ) continue; // the worn fan and the mouth
		// find the surface of the mound here
		let ty = 0.5;
		while ( ty > - 0.14 && sdf( tx, ty, tz ) > 0 ) ty -= 0.01;
		if ( ty <= - 0.13 || rock( tx, ty, tz ) < 0.03 || tunnel( tx, ty, tz ) < 0.06 ) continue;
		const blades = 4 + Math.floor( rnd() * 5 );
		for ( let b = 0; b < blades; b ++ ) {

			const ba = rnd() * Math.PI * 2, lean = 0.2 + rnd() * 0.5, len = 0.07 + rnd() * 0.12, w = 0.006 + rnd() * 0.005;
			const bx = tx + Math.cos( ba ) * 0.02, bz = tz + Math.sin( ba ) * 0.02;
			const dx = Math.cos( ba ) * lean * len, dz = Math.sin( ba ) * lean * len;
			const sx = - Math.sin( ba ) * w, sz = Math.cos( ba ) * w;
			const base = P.length / 3;
			P.push( bx - sx, ty - 0.01, bz - sz, bx + sx, ty - 0.01, bz + sz, bx + dx, ty + len, bz + dz );
			up.set( dx, 0.2, dz ).normalize();
			for ( let k = 0; k < 3; k ++ ) N.push( up.x, up.y, up.z );
			gc.set( rnd() < 0.3 ? '#9a8a52' : '#6b7a3a' ).multiplyScalar( 0.8 + rnd() * 0.3 );
			const t3 = [ 0, 0, 0 ];
			toAlbedo( gc.r, gc.g, gc.b, t3, 0 );
			Cc.push( t3[ 0 ] * 0.6, t3[ 1 ] * 0.6, t3[ 2 ] * 0.6, t3[ 0 ] * 0.6, t3[ 1 ] * 0.6, t3[ 2 ] * 0.6, t3[ 0 ], t3[ 1 ], t3[ 2 ] );
			M.push( MAT.PLAIN, MAT.PLAIN, MAT.PLAIN );
			I.push( base, base + 1, base + 2 );

		}

	}

	const nv2 = P.length / 3;
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( P, 3 ) );
	g.setAttribute( 'normal', new THREE.Float32BufferAttribute( N, 3 ) );
	g.setAttribute( 'color', new THREE.Float32BufferAttribute( Cc, 3 ) );
	g.setAttribute( 'aFlap', new THREE.BufferAttribute( new Float32Array( nv2 ), 1 ) );
	g.setAttribute( 'aMat', new THREE.Float32BufferAttribute( M, 1 ) );
	g.setAttribute( 'aPat', new THREE.BufferAttribute( new Float32Array( nv2 * 3 ), 3 ) );
	g.setIndex( I );
	g.computeBoundingSphere();
	return g;

}
