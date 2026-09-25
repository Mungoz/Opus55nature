import * as THREE from 'three';
import { polygonize, fieldAO } from '../gen/isosurface.js';
import { noise3 } from '../fauna/sdf.js';
import { ATLAS, atlasRect } from '../gen/foliageAtlas.js';
import { KIND } from './treeGen.js';
import { RNG } from '../core/rng.js';

// Sculpted deadwood: stumps and fallen trunks as noisy distance fields, meshed
// with surface nets. Modelled on photos of old spruce and larch stumps (flared,
// fissured, buttress roots running into the soil, a weathered or splintered top)
// and of fallen trunks (peeling bark, snapped stubs, some with the root plate
// torn out of the ground). Each is built at two levels of detail, in workers.

const smin = ( a, b, k ) => {

	const h = Math.max( k - Math.abs( a - b ), 0 ) / k;
	return Math.min( a, b ) - h * h * k * 0.25;

};

const smax = ( a, b, k ) => - smin( - a, - b, k );

// capsule with radii r1 at a, r2 at b
function capsule( x, y, z, a, b, r1, r2 ) {

	const bx = b[ 0 ] - a[ 0 ], by = b[ 1 ] - a[ 1 ], bz = b[ 2 ] - a[ 2 ];
	const px = x - a[ 0 ], py = y - a[ 1 ], pz = z - a[ 2 ];
	const t = Math.max( 0, Math.min( 1, ( px * bx + py * by + pz * bz ) / ( bx * bx + by * by + bz * bz ) ) );
	return Math.hypot( px - bx * t, py - by * t, pz - bz * t ) - ( r1 + ( r2 - r1 ) * t );

}

// Mesh a field and compute the per-vertex data the tree material reads.
// info(x, y, z, nx, ny, nz) -> [ barkMask, region, ringR ]
function bake( sdf, min, max, h, kind, info ) {

	const { pos, nrm, idx } = polygonize( sdf, min, max, h );
	const nv = pos.length / 3;
	const bark = new Float32Array( nv * 2 ), inf = new Float32Array( nv * 3 );
	for ( let v = 0; v < nv; v ++ ) {

		const x = pos[ v * 3 ], y = pos[ v * 3 + 1 ], z = pos[ v * 3 + 2 ];
		const nx = nrm[ v * 3 ], ny = nrm[ v * 3 + 1 ], nz = nrm[ v * 3 + 2 ];
		const [ mask, region, ringR ] = info( x, y, z, nx, ny, nz );
		bark[ v * 2 ] = mask; bark[ v * 2 + 1 ] = region;
		inf[ v * 3 ] = kind;
		inf[ v * 3 + 1 ] = fieldAO( sdf, x, y, z, nx, ny, nz, Math.max( h * 1.5, 0.05 ) );
		inf[ v * 3 + 2 ] = ringR;

	}

	return { pos: new Float32Array( pos ), nrm, idx: new Uint32Array( idx ), bark, inf };

}

function toGeometry( p ) {

	const nv = p.pos.length / 3;
	const solid = atlasRect( ATLAS.solid );
	const uv = new Float32Array( nv * 2 );
	for ( let v = 0; v < nv; v ++ ) {

		uv[ v * 2 ] = ( solid.u0 + solid.u1 ) / 2;
		uv[ v * 2 + 1 ] = ( solid.v0 + solid.v1 ) / 2;

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.BufferAttribute( p.pos, 3 ) );
	g.setAttribute( 'normal', new THREE.BufferAttribute( p.nrm, 3 ) );
	g.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
	g.setAttribute( 'aBark', new THREE.BufferAttribute( p.bark, 2 ) );
	g.setAttribute( 'aInfo', new THREE.BufferAttribute( p.inf, 3 ) );
	g.setAttribute( 'aWind', new THREE.BufferAttribute( new Float32Array( nv * 2 ), 2 ) );
	g.setIndex( new THREE.BufferAttribute( p.idx, 1 ) );
	g.computeBoundingBox();
	g.computeBoundingSphere();
	return g;

}

// ---------------------------------------------------------------------------
// Stumps
// ---------------------------------------------------------------------------

function stumpBake( rng, opts = {} ) {

	const R = opts.R ?? rng.range( 0.24, 0.4 );
	const broken = opts.broken ?? rng.next() < 0.45;
	const H = opts.H ?? ( broken ? rng.range( 0.5, 1.2 ) : rng.range( 0.3, 0.65 ) );
	const nr = rng.int( 4, 6 );
	const ph = rng.next() * 6.283;
	const hollow = opts.hollow ?? rng.next() < 0.35;
	const tx = rng.range( - 0.12, 0.12 ), tz = rng.range( - 0.12, 0.12 );
	const th0 = rng.next() * 6.283;
	const seed = rng.next() * 100;
	// buttress roots leave along the lobes and dive into the soil
	const roots = [];
	for ( let k = 0; k < nr; k ++ ) {

		const a = ( 2 * Math.PI * k - ph ) / nr + rng.range( - 0.12, 0.12 );
		const L = R * rng.range( 1.6, 2.8 );
		const dx = Math.cos( a ), dz = Math.sin( a );
		const bend = rng.range( - 0.3, 0.3 );
		roots.push( {
			a: [ dx * R * 0.6, 0.1 + R * 0.3, dz * R * 0.6 ],
			m: [ dx * ( R + L * 0.35 ) - dz * bend * L * 0.2, - 0.02, dz * ( R + L * 0.35 ) + dx * bend * L * 0.2 ],
			b: [ dx * ( R + L * 0.8 ) - dz * bend * L * 0.4, - 0.25, dz * ( R + L * 0.8 ) + dx * bend * L * 0.4 ],
			r: R * rng.range( 0.3, 0.42 ),
		} );

	}

	const topAt = ( x, z ) => {

		if ( ! broken ) return H + tx * x + tz * z + 0.012 * noise3( x * 7 + seed, 0, z * 7 );
		// snapped: a tall splintered side, jagged all round
		const th = Math.atan2( z, x );
		const side = Math.pow( Math.max( 0, Math.cos( th - th0 ) ), 2 );
		const spl = Math.max( 0, noise3( x * 11 + seed, 1.7, z * 11 ) ) + 0.6 * Math.max( 0, noise3( x * 23, 5.1 + seed, z * 23 ) );
		return H * ( 0.75 + 0.6 * side ) + R * 0.9 * spl * ( 0.4 + side );

	};

	const trunk = ( x, y, z ) => {

		const yy = Math.max( y, 0 );
		const th = Math.atan2( z, x );
		const lobe = 0.5 + 0.5 * Math.cos( nr * th + ph + 0.5 * noise3( x * 2, y * 2 + seed, z * 2 ) );
		let r = R * ( 1 + 0.16 * Math.exp( - yy / 0.22 ) + 0.13 * Math.exp( - yy / 0.25 ) * lobe );
		r *= 1 + 0.07 * noise3( x * 3 + seed, y * 1.5, z * 3 );
		return ( Math.hypot( x, z ) - r ) * 0.8;

	};

	const fissure = ( x, y, z ) => 1 - Math.min( 1, Math.abs( noise3( x * 11 + seed, y * 2.2, z * 11 ) ) / 0.28 );
	const barkMask = ( x, y, z ) => {

		// bark falls away from the top first
		const loss = noise3( x * 4, y * 3 + seed, z * 4 ) + ( y - H * 0.7 ) * 0.8;
		return loss > 0.7 ? 0 : 1;

	};

	const sdf = ( x, y, z ) => {

		let d = trunk( x, y, z );
		for ( const rt of roots ) {

			d = smin( d, Math.min( capsule( x, y, z, rt.a, rt.m, rt.r, rt.r * 0.75 ), capsule( x, y, z, rt.m, rt.b, rt.r * 0.75, rt.r * 0.35 ) ) * 0.9, R * 0.45 );

		}

		// bark relief, and a step down where it has fallen away
		d += 0.016 * fissure( x, y, z ) + ( barkMask( x, y, z ) ? 0 : 0.012 );
		d = smax( d, ( y - topAt( x, z ) ) * 0.7, 0.03 );
		// a heart rotted out from the top
		if ( hollow ) d = smax( d, - Math.max( Math.hypot( x, z ) - R * 0.5 - 0.04 * noise3( x * 8, y * 4, z * 8 ), topAt( x, z ) - 0.28 - y ), 0.04 );
		d = Math.max( d, - ( y + 0.3 ) );
		return d;

	};

	const info = ( x, y, z, nx, ny, nz ) => {

		const top = topAt( x, z );
		const cut = y > top - 0.04 && ny > 0.35 && Math.hypot( x, z ) < R * 1.3 ? 1 : 0;
		return [ barkMask( x, y, z ), cut, Math.hypot( x, z ) / R ];

	};

	const reach = R * 3.9 + 0.1;
	const min = [ - reach, - 0.32, - reach ], max = [ reach, H * 1.4 + R + 0.1, reach ];
	return {
		hi: bake( sdf, min, max, 0.034, KIND.STUMP_WOOD, info ),
		lo: bake( sdf, min, max, 0.08, KIND.STUMP_WOOD, info ),
		meta: { height: broken ? H * 0.8 : H, radius: reach, species: 'stump' },
	};

}

// ---------------------------------------------------------------------------
// Fallen trunks, lying along +x
// ---------------------------------------------------------------------------

function logBake( rng, opts = {} ) {

	const L = opts.L ?? rng.range( 4.5, 9 );
	const R0 = opts.R ?? rng.range( 0.2, 0.34 );
	const bend = rng.range( - 0.25, 0.25 );
	const seed = rng.next() * 100;
	const plate = opts.plate ?? rng.next() < 0.35;
	const endKind = [ plate ? 'plate' : ( rng.next() < 0.5 ? 'sawn' : 'broken' ), rng.next() < 0.4 ? 'sawn' : 'broken' ];
	const endTilt = [ rng.range( - 0.2, 0.2 ), rng.range( - 0.25, 0.25 ) ];
	const Rat = ( t ) => R0 * ( 1.08 - 0.38 * t );
	const cyAt = ( t ) => Rat( t ) * 0.8;
	const czAt = ( t ) => bend * Math.sin( Math.PI * t );

	// snapped-off branch stubs, a few short broken spikes of wood
	const stubs = [];
	const ns = rng.int( 2, 5 );
	for ( let k = 0; k < ns; k ++ ) {

		const t = rng.range( 0.3, 0.92 );
		const a = rng.range( - 0.2, Math.PI + 0.2 ); // mostly the upper half
		const x = ( t - 0.5 ) * L, r = Rat( t );
		const dir = [ rng.range( 0.1, 0.5 ), Math.sin( a ), Math.cos( a ) ];
		const dl = Math.hypot( ...dir );
		const len = r + rng.range( 0.08, 0.3 );
		const sr = r * rng.range( 0.16, 0.26 );
		const o = [ x, cyAt( t ), czAt( t ) ];
		stubs.push( { a: o, b: [ o[ 0 ] + dir[ 0 ] / dl * len, o[ 1 ] + dir[ 1 ] / dl * len, o[ 2 ] + dir[ 2 ] / dl * len ], r: sr } );

	}

	// the root plate of a wind-thrown tree: a wall of soil and roots standing on edge
	const Rp = R0 * rng.range( 3.2, 4.2 );
	const pc = [ - L / 2 - 0.12, Rp * 0.55, 0 ];
	const plateRoots = [];
	if ( plate ) {

		for ( let k = 0; k < 16; k ++ ) {

			const a = k / 16 * Math.PI * 2 + rng.range( - 0.15, 0.15 );
			const len = Rp * rng.range( 0.95, 1.35 );
			const ca = Math.cos( a ), sa = Math.sin( a );
			plateRoots.push( {
				a: [ pc[ 0 ], pc[ 1 ] + sa * Rp * 0.5, pc[ 2 ] + ca * Rp * 0.5 ],
				b: [ pc[ 0 ] - rng.range( 0.05, 0.5 ), pc[ 1 ] + sa * len, pc[ 2 ] + ca * len ],
				r: rng.range( 0.035, 0.075 ),
			} );

		}

	}

	const fissure = ( x, y, z ) => 1 - Math.min( 1, Math.abs( noise3( x * 2.4 + seed, y * 12, z * 12 ) ) / 0.3 );
	const barkMask = ( x, y, z ) => noise3( x * 0.9 + seed, y * 3.2, z * 3.2 ) + 0.15 * noise3( x * 4, y * 9, z * 9 ) > 0.5 ? 0 : 1;
	const endJag = ( i, y, z ) => {

		if ( endKind[ i ] === 'sawn' ) return endTilt[ i ] * z + 0.01 * noise3( y * 9, z * 9, seed );
		// splintered: long slivers of wood torn out along the grain
		return 0.35 * Math.max( 0, noise3( y * 13 + i * 7, z * 13, seed ) ) + 0.18 * Math.abs( noise3( y * 5, z * 5 + i * 3, seed ) );

	};

	const trunk = ( x, y, z ) => {

		const t = Math.max( 0, Math.min( 1, ( x + L / 2 ) / L ) );
		const r = Rat( t ) * ( 1 + 0.05 * noise3( x * 1.3 + seed, y * 2, z * 2 ) );
		let d = ( Math.hypot( y - cyAt( t ), z - czAt( t ) ) - r ) * 0.85;
		d += 0.014 * fissure( x, y, z ) + ( barkMask( x, y, z ) ? 0 : 0.01 );
		// the two ends
		if ( endKind[ 0 ] !== 'plate' ) d = Math.max( d, ( - ( x + L / 2 ) - endJag( 0, y, z ) ) * 0.8 );
		d = Math.max( d, ( x - L / 2 - endJag( 1, y, z ) ) * 0.8 );
		return d;

	};

	const plateField = ( x, y, z ) => {

		const lx = ( x - pc[ 0 ] ) / 0.32, ly = ( y - pc[ 1 ] ) / Rp, lz = ( z - pc[ 2 ] ) / ( Rp * 1.08 );
		const k = Math.hypot( lx, ly, lz );
		// lumpy clods of earth
		let d = ( k - 1 ) * Math.min( 0.32, Rp ) + 0.09 * noise3( x * 3.5 + seed, y * 3.5, z * 3.5 ) + 0.04 * noise3( x * 9, y * 9, z * 9 + seed );
		for ( const rt of plateRoots ) d = smin( d, capsule( x, y, z, rt.a, rt.b, rt.r, rt.r * 0.3 ), 0.06 );
		return d;

	};

	const sdf = ( x, y, z ) => {

		let d = trunk( x, y, z );
		for ( const s of stubs ) {

			let ds = capsule( x, y, z, s.a, s.b, s.r * 1.2, s.r * 0.8 );
			// broken off, not rounded
			const bx = s.b[ 0 ] - s.a[ 0 ], by = s.b[ 1 ] - s.a[ 1 ], bz = s.b[ 2 ] - s.a[ 2 ];
			const bl = Math.hypot( bx, by, bz );
			ds = Math.max( ds, ( ( x - s.b[ 0 ] ) * bx + ( y - s.b[ 1 ] ) * by + ( z - s.b[ 2 ] ) * bz ) / bl - 0.03 * Math.max( 0, noise3( x * 30, y * 30, z * 30 ) ) );
			d = smin( d, ds, 0.05 );

		}

		// the plate only matters near it
		if ( plate && Math.hypot( ( x - pc[ 0 ] ) * 2, y - pc[ 1 ], z - pc[ 2 ] ) < Rp * 1.6 + 0.4 + d ) d = smin( d, plateField( x, y, z ), 0.18 );
		// settled into the ground
		d = Math.max( d, - ( y + ( plate && x < - L / 2 + 0.6 ? 0.6 : 0.1 ) ) );
		return d;

	};

	const info = ( x, y, z, nx, ny, nz ) => {

		if ( plate && x < pc[ 0 ] + 1.2 && plateField( x, y, z ) < trunk( x, y, z ) - 0.02 ) return [ 0, 2, 0 ];
		const t = Math.max( 0, Math.min( 1, ( x + L / 2 ) / L ) );
		const ringR = Math.hypot( y - cyAt( t ), z - czAt( t ) ) / Rat( t );
		const end = ( x < - L / 2 + 0.4 && nx < - 0.55 && endKind[ 0 ] !== 'plate' ) || ( x > L / 2 - 0.4 && nx > 0.55 );
		return [ barkMask( x, y, z ), end ? 1 : 0, ringR ];

	};

	const x0 = plate ? pc[ 0 ] - 0.9 : - L / 2 - 0.45;
	const ext = plate ? Rp * 1.45 : R0 + 0.45;
	const min = [ x0, - 0.65, - Math.max( ext, R0 + Math.abs( bend ) + 0.45 ) ];
	const max = [ L / 2 + 0.5, plate ? pc[ 1 ] + Rp * 1.4 : R0 * 2.4 + 0.45, Math.max( ext, R0 + Math.abs( bend ) + 0.45 ) ];
	return {
		hi: bake( sdf, min, max, 0.045, KIND.LOG_WOOD, info ),
		lo: bake( sdf, min, max, 0.1, KIND.LOG_WOOD, info ),
		meta: { height: R0 * 2, radius: L / 2 + ( plate ? Rp : 0.5 ), halfLen: L / 2, plate, species: 'log' },
	};

}

// ---------------------------------------------------------------------------
// Baking: { type: 'stump' | 'log', seed, opts } -> meshes at two levels of detail
// ---------------------------------------------------------------------------

export function bakeDeadwood( spec ) {

	const rng = new RNG( spec.seed );
	return spec.type === 'stump' ? stumpBake( rng, spec.opts ) : logBake( rng, spec.opts );

}

export const DEADWOOD = [
	{ type: 'log', seed: 31, opts: { plate: true } },
	{ type: 'log', seed: 32, opts: { plate: true, R: 0.3 } },
	{ type: 'log', seed: 33, opts: { plate: false } },
	{ type: 'log', seed: 34, opts: { plate: false } },
	{ type: 'stump', seed: 41, opts: { broken: false } },
	{ type: 'stump', seed: 42, opts: { broken: true } },
	{ type: 'stump', seed: 43, opts: { broken: true } },
	// the one beside the start, where the squirrel feeds
	{ type: 'stump', seed: 44, opts: { R: 0.38, H: 0.5, broken: false, hollow: false } },
];

const finish = ( r ) => ( { geometry: toGeometry( r.hi ), lo: toGeometry( r.lo ), ...r.meta } );

// Sculpt all the deadwood across a few workers while the rest of the world loads.
// Resolves to { stumps: [...], logs: [...] } in DEADWOOD order.
export function buildDeadwood( specs = DEADWOOD ) {

	const split = ( list ) => ( { logs: list.filter( ( d ) => d.species === 'log' ), stumps: list.filter( ( d ) => d.species === 'stump' ) } );
	let workers;
	try {

		const n = Math.max( 1, Math.min( 4, ( navigator.hardwareConcurrency || 4 ) - 1, specs.length ) );
		workers = Array.from( { length: n }, () => new Worker( new URL( './deadwood.worker.js', import.meta.url ), { type: 'module' } ) );

	} catch ( e ) {

		return Promise.resolve( split( specs.map( ( sp ) => finish( bakeDeadwood( sp ) ) ) ) );

	}

	// heaviest first, dealt round-robin
	const order = specs.map( ( sp, i ) => i ).sort( ( i, j ) => ( specs[ j ].type === 'log' ) - ( specs[ i ].type === 'log' ) );
	const jobs = workers.map( () => [] );
	order.forEach( ( i, k ) => jobs[ k % workers.length ].push( i ) );
	const results = new Array( specs.length );
	return Promise.all( workers.map( ( w, k ) => new Promise( ( resolve ) => {

		w.onmessage = ( e ) => {

			e.data.forEach( ( r, q ) => ( results[ jobs[ k ][ q ] ] = finish( r ) ) );
			w.terminate();
			resolve();

		};

		w.onerror = () => {

			// fall back to baking here
			for ( const i of jobs[ k ] ) results[ i ] = finish( bakeDeadwood( specs[ i ] ) );
			w.terminate();
			resolve();

		};

		w.postMessage( jobs[ k ].map( ( i ) => specs[ i ] ) );

	} ) ) ).then( () => split( results ) );

}
