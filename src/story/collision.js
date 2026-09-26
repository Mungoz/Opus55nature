import * as THREE from 'three';

// Walking into things. Obstacles are circles and capsules (a segment with a radius) filed in
// a grid of 4 m cells; the walker is a circle that slides along whatever it meets. Water
// deeper than the knee stops you, as do slopes steeper than ~32 degrees. Decks (the jetty,
// the bridge, the porch) are floors you walk on above the ground.
const CELL = 4;

export class Collision {

	constructor( terrain ) {

		this.terrain = terrain;
		this.grid = new Map();
		this.shapes = [];
		this.decks = [];
		this.radius = 0.3;
		this.maxSlope = Math.tan( 32 * Math.PI / 180 );
		// (x, z) -> water surface height there, or -Infinity (the lake is 0)
		this.waterAt = null;
		this.wade = 0.42; // deepest water you'll walk into (m)
		this._q = [];
		this._stamp = 0;

	}

	_key( i, j ) { return ( i + 4096 ) * 8192 + ( j + 4096 ); }

	_file( s, x0, z0, x1, z1 ) {

		s.id = this.shapes.length;
		this.shapes.push( s );
		for ( let i = Math.floor( x0 / CELL ); i <= Math.floor( x1 / CELL ); i ++ ) for ( let j = Math.floor( z0 / CELL ); j <= Math.floor( z1 / CELL ); j ++ ) {

			const k = this._key( i, j );
			let l = this.grid.get( k );
			if ( ! l ) this.grid.set( k, l = [] );
			l.push( s );

		}

		return s;

	}

	circle( x, z, r, tag = '' ) {

		return this._file( { t: 0, x, z, r, tag }, x - r, z - r, x + r, z + r );

	}

	// a capsule from (ax, az) to (bx, bz), r thick
	capsule( ax, az, bx, bz, r, tag = '' ) {

		return this._file( { t: 1, ax, az, bx, bz, r, tag }, Math.min( ax, bx ) - r, Math.min( az, bz ) - r, Math.max( ax, bx ) + r, Math.max( az, bz ) + r );

	}

	// a wall along a polyline
	polyline( pts, r, tag = '' ) {

		for ( let i = 0; i < pts.length - 1; i ++ ) this.capsule( pts[ i ][ 0 ], pts[ i ][ 1 ], pts[ i + 1 ][ 0 ], pts[ i + 1 ][ 1 ], r, tag );

	}

	// an oriented box (centre, half extents, yaw about +y), as its four walls
	box( x, z, hx, hz, yaw, tag = '' ) {

		const c = Math.cos( yaw ), s = Math.sin( yaw );
		const P = ( lx, lz ) => [ x + c * lx + s * lz, z - s * lx + c * lz ];
		const r = 0.05;
		const pts = [ P( - hx, - hz ), P( hx, - hz ), P( hx, hz ), P( - hx, hz ), P( - hx, - hz ) ];
		this.polyline( pts, r, tag );

	}

	// a walkable floor: an oriented rectangle at height y (or y( lx, lz ) for a sloped one)
	deck( x, z, hx, hz, yaw, y, tag = '' ) {

		this.decks.push( { x, z, hx, hz, yaw, c: Math.cos( yaw ), s: Math.sin( yaw ), y, tag } );

	}

	floorAt( x, z, ground ) {

		let f = ground;
		for ( const d of this.decks ) {

			const dx = x - d.x, dz = z - d.z;
			const lx = d.c * dx - d.s * dz, lz = d.s * dx + d.c * dz;
			if ( Math.abs( lx ) > d.hx || Math.abs( lz ) > d.hz ) continue;
			const y = typeof d.y === 'function' ? d.y( lx, lz ) : d.y;
			f = Math.max( f, y );

		}

		return f;

	}

	onDeck( x, z ) {

		for ( const d of this.decks ) {

			const dx = x - d.x, dz = z - d.z;
			if ( Math.abs( d.c * dx - d.s * dz ) <= d.hx && Math.abs( d.s * dx + d.c * dz ) <= d.hz ) return d;

		}

		return null;

	}

	remove( tag ) {

		for ( const l of this.grid.values() ) for ( let i = l.length - 1; i >= 0; i -- ) if ( l[ i ].tag === tag ) l.splice( i, 1 );
		this.decks = this.decks.filter( ( d ) => d.tag !== tag );

	}

	// could you stand here? (the ground itself: water and steepness)
	_standable( x, z, fromX, fromZ ) {

		if ( this.onDeck( x, z ) ) return true;
		const h = this.terrain.heightAt( x, z );
		const w = this.waterAt ? this.waterAt( x, z ) : 0;
		if ( w - h > this.wade ) return false;
		// uphill steeper than the limit (downhill is allowed: you can always walk back)
		const h0 = this.terrain.heightAt( fromX, fromZ );
		const run = Math.hypot( x - fromX, z - fromZ );
		if ( run > 1e-4 && ( h - h0 ) / run > this.maxSlope ) {

			// measure over a metre, so a bump in the heightmap does not stop you
			const ux = ( x - fromX ) / run, uz = ( z - fromZ ) / run;
			const g = ( this.terrain.heightAt( fromX + ux, fromZ + uz ) - h0 );
			if ( g > this.maxSlope ) return false;

		}

		return true;

	}

	// Move from (px, pz) to pos (mutated): slide along the ground limits, then push out of
	// every obstacle nearby.
	resolve( pos, px, pz ) {

		// the ground: try the whole step, then each axis alone
		if ( ! this._standable( pos.x, pos.z, px, pz ) ) {

			if ( this._standable( pos.x, pz, px, pz ) ) pos.z = pz;
			else if ( this._standable( px, pos.z, px, pz ) ) pos.x = px;
			else { pos.x = px; pos.z = pz; }

		}

		const R = this.radius;
		for ( let it = 0; it < 3; it ++ ) {

			let moved = false;
			const stamp = ++ this._stamp;
			for ( let i = Math.floor( ( pos.x - R ) / CELL ); i <= Math.floor( ( pos.x + R ) / CELL ); i ++ ) for ( let j = Math.floor( ( pos.z - R ) / CELL ); j <= Math.floor( ( pos.z + R ) / CELL ); j ++ ) {

				const l = this.grid.get( this._key( i, j ) );
				if ( ! l ) continue;
				for ( const s of l ) {

					if ( s.stamp === stamp || s.off ) continue;
					s.stamp = stamp;
					let cx, cz;
					if ( s.t === 0 ) { cx = s.x; cz = s.z; } else {

						const ex = s.bx - s.ax, ez = s.bz - s.az, l2 = ex * ex + ez * ez || 1;
						const t = THREE.MathUtils.clamp( ( ( pos.x - s.ax ) * ex + ( pos.z - s.az ) * ez ) / l2, 0, 1 );
						cx = s.ax + ex * t; cz = s.az + ez * t;

					}

					const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot( dx, dz ), min = s.r + R;
					if ( d >= min ) continue;
					if ( d < 1e-5 ) { pos.x += min; continue; }
					pos.x = cx + dx / d * min;
					pos.z = cz + dz / d * min;
					moved = true;

				}

			}

			if ( ! moved ) break;

		}

		// never pushed into water or up a cliff by an obstacle
		if ( ! this._standable( pos.x, pos.z, px, pz ) ) { pos.x = px; pos.z = pz; }

	}

	// is (x, z) inside any obstacle? (for placing things)
	blocked( x, z, r = 0 ) {

		const l = this.grid.get( this._key( Math.floor( x / CELL ), Math.floor( z / CELL ) ) );
		if ( ! l ) return false;
		for ( const s of l ) {

			let cx, cz;
			if ( s.t === 0 ) { cx = s.x; cz = s.z; } else {

				const ex = s.bx - s.ax, ez = s.bz - s.az, l2 = ex * ex + ez * ez || 1;
				const t = THREE.MathUtils.clamp( ( ( x - s.ax ) * ex + ( z - s.az ) * ez ) / l2, 0, 1 );
				cx = s.ax + ex * t; cz = s.az + ez * t;

			}

			if ( Math.hypot( x - cx, z - cz ) < s.r + r ) return true;

		}

		return false;

	}

	// the valley's own obstacles: tree trunks, boulders, fallen logs, stumps
	addNature( forest, rocks ) {

		for ( const t of forest.trees ) {

			const v = forest.variants[ t.variant ];
			const r = ( v.trunk ?? 0.25 ) * t.s;
			if ( r > 0.04 ) this.circle( t.x, t.z, r + 0.03, 'tree' );

		}

		for ( const r of rocks.list ) this.circle( r.x, r.z, r.s * 0.72, 'rock' );
		const logs = forest.props.log, stumps = forest.props.stump;
		for ( const it of logs.items ) {

			const v = logs.variants[ it.variant ];
			const hl = v.halfLen * it.s, ax = Math.cos( it.rot ), az = - Math.sin( it.rot );
			const r = Math.max( 0.12, ( v.height ?? 0.4 ) * 0.5 * it.s );
			// a log you can step over is no obstacle
			if ( r * 2 < 0.36 ) continue;
			this.capsule( it.x - ax * hl, it.z - az * hl, it.x + ax * hl, it.z + az * hl, r, 'log' );

		}

		for ( const it of stumps.items ) this.circle( it.x, it.z, Math.min( 0.55, ( stumps.variants[ it.variant ].radius ?? 0.6 ) * 0.45 ) * it.s, 'stump' );

	}

	// debug: the shapes near (x, z) for the plan map
	debugShapes( x0 = - Infinity, z0 = - Infinity, x1 = Infinity, z1 = Infinity ) {

		const out = [];
		for ( const s of this.shapes ) {

			if ( s.t === 0 ) { if ( s.x > x0 && s.x < x1 && s.z > z0 && s.z < z1 && s.tag !== 'tree' && s.tag !== 'rock' ) out.push( { x: s.x, z: s.z, r: s.r, color: 'rgba(255,60,60,0.9)' } ); } else if ( s.tag !== 'log' ) out.push( { a: [ s.ax, s.az ], b: [ s.bx, s.bz ], color: s.tag === 'fence' ? 'rgba(255,200,40,0.95)' : 'rgba(255,60,60,0.95)' } );

		}

		return out;

	}

}
