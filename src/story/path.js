import * as THREE from 'three';

// The route as one continuous path, resampled every metre. Progress is distance along it.
// Stretches (named ranges) carry the story's beats; flags on the control points say where
// the path runs on a deck (jetty, bridge) rather than a trail pressed into the ground.
export class Path {

	// points: [ { x, z, deck?, id? } ]
	constructor( points, step = 1 ) {

		this.points = points;
		const curve = new THREE.CatmullRomCurve3( points.map( ( p ) => new THREE.Vector3( p.x, 0, p.z ) ), false, 'centripetal', 0.5 );
		const len = curve.getLength();
		const n = Math.max( 2, Math.round( len / step ) + 1 );
		const pts = curve.getSpacedPoints( n - 1 );
		// where each control point falls along the path (for named waypoints)
		this.ids = {};
		let j = 0;
		this.samples = pts.map( ( p, i ) => ( { x: p.x, z: p.z, d: 0, deck: false, i } ) );
		let d = 0;
		for ( let i = 1; i < n; i ++ ) {

			const a = this.samples[ i - 1 ], b = this.samples[ i ];
			d += Math.hypot( b.x - a.x, b.z - a.z );
			b.d = d;

		}

		this.length = d;
		for ( const p of points ) {

			// the nearest sample after the previous waypoint
			let best = j, bd = Infinity;
			for ( let i = j; i < n; i ++ ) {

				const s = this.samples[ i ], dd = ( s.x - p.x ) ** 2 + ( s.z - p.z ) ** 2;
				if ( dd < bd ) { bd = dd; best = i; }
				if ( dd > bd + 400 ) break;

			}

			j = best;
			p.d = this.samples[ best ].d;
			if ( p.id ) this.ids[ p.id ] = p.d;

		}

		// deck spans run between consecutive deck-flagged control points
		for ( let k = 0; k < points.length - 1; k ++ ) if ( points[ k ].deck && points[ k + 1 ].deck ) for ( const s of this.samples ) if ( s.d >= points[ k ].d && s.d <= points[ k + 1 ].d ) s.deck = true;
		// tangents
		for ( const s of this.samples ) {

			const a = this.samples[ Math.max( 0, s.i - 2 ) ], b = this.samples[ Math.min( n - 1, s.i + 2 ) ];
			const l = Math.hypot( b.x - a.x, b.z - a.z ) || 1;
			s.tx = ( b.x - a.x ) / l;
			s.tz = ( b.z - a.z ) / l;

		}

		// a coarse grid of sample indices, for nearest-point queries
		this.cell = 16;
		this.grid = new Map();
		for ( const s of this.samples ) {

			const k = this._key( Math.floor( s.x / this.cell ), Math.floor( s.z / this.cell ) );
			if ( ! this.grid.has( k ) ) this.grid.set( k, [] );
			this.grid.get( k ).push( s.i );

		}

	}

	_key( i, j ) { return ( i + 4096 ) * 8192 + ( j + 4096 ); }

	// the sample d metres along (clamped), interpolated
	at( d, out = { x: 0, z: 0, tx: 0, tz: 1, d: 0 } ) {

		const S = this.samples;
		d = THREE.MathUtils.clamp( d, 0, this.length );
		// samples are about a metre apart: start from the estimate and walk
		let i = Math.min( S.length - 2, Math.floor( d / this.length * ( S.length - 1 ) ) );
		while ( i > 0 && S[ i ].d > d ) i --;
		while ( i < S.length - 2 && S[ i + 1 ].d < d ) i ++;
		const a = S[ i ], b = S[ i + 1 ], k = ( d - a.d ) / Math.max( 1e-6, b.d - a.d );
		out.x = a.x + ( b.x - a.x ) * k;
		out.z = a.z + ( b.z - a.z ) * k;
		out.tx = a.tx + ( b.tx - a.tx ) * k;
		out.tz = a.tz + ( b.tz - a.tz ) * k;
		out.d = d;
		out.deck = a.deck && b.deck;
		return out;

	}

	// The nearest point on the path to (x, z), searching only between d0 and d1 (so a stretch
	// that doubles back near an earlier one is not mistaken for it). Returns { dist, d, side }.
	nearest( x, z, d0 = 0, d1 = Infinity, out = { dist: 0, d: 0, side: 0 } ) {

		const S = this.samples, c = this.cell;
		let best = Infinity, bi = - 1;
		// search rings of cells outward until a hit is found and the ring is beyond it
		const ci = Math.floor( x / c ), cj = Math.floor( z / c );
		for ( let r = 0; r < 64; r ++ ) {

			if ( bi >= 0 && ( r - 1 ) * c > Math.sqrt( best ) ) break;
			for ( let i = ci - r; i <= ci + r; i ++ ) for ( let j = cj - r; j <= cj + r; j ++ ) {

				if ( Math.max( Math.abs( i - ci ), Math.abs( j - cj ) ) !== r ) continue;
				const list = this.grid.get( this._key( i, j ) );
				if ( ! list ) continue;
				for ( const k of list ) {

					const s = S[ k ];
					if ( s.d < d0 || s.d > d1 ) continue;
					const dd = ( s.x - x ) ** 2 + ( s.z - z ) ** 2;
					if ( dd < best ) { best = dd; bi = k; }

				}

			}

		}

		if ( bi < 0 ) {

			// nothing in range nearby: the nearer end of the window
			const a = this.at( d0 ), b = this.at( Math.min( d1, this.length ) );
			const da = Math.hypot( a.x - x, a.z - z ), db = Math.hypot( b.x - x, b.z - z );
			out.dist = Math.min( da, db );
			out.d = da < db ? a.d : b.d;
			out.side = 0;
			return out;

		}

		// refine against the two segments either side of the nearest sample
		let bd = Math.sqrt( best ), bdd = S[ bi ].d, side = 0;
		for ( const k of [ bi - 1, bi ] ) {

			if ( k < 0 || k >= S.length - 1 ) continue;
			const a = S[ k ], b = S[ k + 1 ];
			const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
			const t = THREE.MathUtils.clamp( ( ( x - a.x ) * ex + ( z - a.z ) * ez ) / l2, 0, 1 );
			const px = a.x + ex * t, pz = a.z + ez * t;
			const dd = Math.hypot( x - px, z - pz );
			if ( dd <= bd ) {

				bd = dd;
				bdd = a.d + ( b.d - a.d ) * t;
				side = Math.sign( ex * ( z - a.z ) - ez * ( x - a.x ) );

			}

		}

		out.dist = bd;
		out.d = THREE.MathUtils.clamp( bdd, d0, d1 );
		out.side = side;
		return out;

	}

}
