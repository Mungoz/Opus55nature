import * as THREE from 'three';
import { polygonize, fieldAO } from '../gen/isosurface.js';
import { noise3 } from './sdf.js';
import { MAT } from './creature.js';

// Marmot burrows, after photographs of burrows in alpine turf: a low mound of bare
// spoil fanned out in front of a dark, slightly flattened hole that runs down into the
// slope, often under a flat rock slab. Local frame: the hole faces +z, ground at y = 0.
// The tunnel is real, so a marmot can run in and vanish down it.

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

		let d = smin( ellipsoid( x, y, z, [ 0, - 0.36, - 0.12 ], [ 1.05, 0.62, 1.15 ] ), ellipsoid( x, y, z, [ 0.05, - 0.13, 0.78 ], [ 0.95, 0.18, 0.85 ] ), 0.3 );
		// lumpy, with small stones kicked out in the spoil
		d += 0.035 * noise3( x * 5 + s, y * 5, z * 5 ) + 0.012 * noise3( x * 17, y * 17 + s, z * 17 );
		return d;

	};

	const rock = ( x, y, z ) => {

		if ( ! slab ) return 1e9;
		// a flat, tilted slab over the entrance
		const lx = x - 0.04, ly = y - 0.29 - 0.08 * ( z - 0.1 ), lz = z - 0.12;
		const qx = Math.abs( lx ) - 0.46, qy = Math.abs( ly ) - 0.05, qz = Math.abs( lz ) - 0.36;
		const box = Math.hypot( Math.max( qx, 0 ), Math.max( qy, 0 ), Math.max( qz, 0 ) ) + Math.min( Math.max( qx, qy, qz ), 0 ) - 0.04;
		return box + 0.02 * noise3( x * 9 + s, y * 9, z * 9 );

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
	const soil = new THREE.Color( '#86705a' ), grit = new THREE.Color( '#a69a86' ), damp = new THREE.Color( '#5a4636' ), stone = new THREE.Color( '#8c8a84' ), lichen = new THREE.Color( '#a3a46a' );
	for ( let v = 0; v < nv; v ++ ) {

		const x = pos[ v * 3 ], y = pos[ v * 3 + 1 ], z = pos[ v * 3 + 2 ];
		const ao = fieldAO( sdf, x, y, z, nrm[ v * 3 ], nrm[ v * 3 + 1 ], nrm[ v * 3 + 2 ], 0.05 );
		if ( rock( x, y, z ) < mound( x, y, z ) - 0.01 ) {

			c.copy( stone ).multiplyScalar( 0.85 + 0.25 * noise3( x * 20, y * 20, z * 20 + s ) );
			if ( noise3( x * 11 + s, y * 11, z * 11 ) > 0.35 && nrm[ v * 3 + 1 ] > 0.3 ) c.lerp( lichen, 0.6 );

		} else {

			const g = noise3( x * 13 + s, y * 13, z * 13 ) * 0.5 + 0.5;
			c.copy( soil ).lerp( grit, Math.max( 0, g - 0.45 ) * 1.4 );
			// darker, damp earth round the mouth; pale pebbles scattered in the spoil
			const toMouth = Math.hypot( x, y - 0.07, z - 0.45 );
			c.lerp( damp, Math.max( 0, 1 - toMouth / 0.45 ) * 0.7 );
			if ( noise3( x * 38, y * 38 + s, z * 38 ) > 0.62 ) c.lerp( grit, 0.8 );

		}

		// the tunnel falls into darkness
		const wall = tunnel( x, y, z ) > - 0.03 && tunnel( x, y, z ) < 0.05 ? 1 : 0;
		const inside = wall * Math.max( 0, 0.45 - z ) * 2.2;
		c.multiplyScalar( Math.sqrt( ao ) * Math.max( 0.05, 1 - Math.min( 1, inside ) ) );
		c.convertSRGBToLinear();
		col.set( [ c.r, c.g, c.b ], v * 3 );
		mat[ v ] = MAT.PLAIN;

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'normal', new THREE.BufferAttribute( nrm, 3 ) );
	g.setAttribute( 'color', new THREE.BufferAttribute( col, 3 ) );
	g.setAttribute( 'aFlap', new THREE.BufferAttribute( new Float32Array( nv ), 1 ) );
	g.setAttribute( 'aMat', new THREE.BufferAttribute( mat, 1 ) );
	g.setAttribute( 'aPat', new THREE.BufferAttribute( new Float32Array( nv * 3 ), 3 ) );
	g.setIndex( idx );
	g.computeBoundingSphere();
	return g;

}
