import * as THREE from 'three';

const _p = new THREE.Vector3(), _m = new THREE.Vector3(), _r = new THREE.Vector3(), _f = new THREE.Vector3();
const HEIGHTS = [ 1.72, 1.35, 0.95, 0.5 ]; // hat, chest, hips, knees
// how tall each kind of obstacle stands (m); 0: see-through
const HEIGHT = { trough: 0, gully: 0, gullyrail: 0, gap: 0, deerfence: 0, tree: 40, rock: 0, log: 0.55, stump: 0.6, hut: 5.5, fence: 1.15, gate: 1.2, bridge: 0, jetty: 0, post: 1.2, signpost: 2.6, cross: 3, boatJ: 0.8, boatEnd: 0.9 };

// closest approach of segments p (a-b) and q (c-d) in the plane: [ t along p, distance ]
function segSeg( ax, az, bx, bz, cx, cz, dx, dz ) {

	const ux = bx - ax, uz = bz - az, vx = dx - cx, vz = dz - cz, wx = ax - cx, wz = az - cz;
	const A = ux * ux + uz * uz, B = ux * vx + uz * vz, Cc = vx * vx + vz * vz, D = ux * wx + uz * wz, E = vx * wx + vz * wz;
	const den = A * Cc - B * B;
	let s = den > 1e-9 ? THREE.MathUtils.clamp( ( B * E - Cc * D ) / den, 0, 1 ) : 0;
	let t = Cc > 1e-9 ? THREE.MathUtils.clamp( ( B * s + E ) / Cc, 0, 1 ) : 0;
	s = A > 1e-9 ? THREE.MathUtils.clamp( ( B * t - D ) / A, 0, 1 ) : 0;
	const px = ax + ux * s - ( cx + vx * t ), pz = az + uz * s - ( cz + vz * t );
	return [ s, Math.hypot( px, pz ) ];

}

// Can the player see the figure? Directly: on screen, big enough, with a clear line past the
// ground, trunks and walls. Reflected: its mirror image on screen, at a point that really is
// on that water, with clear lines from the eye to the water and from the water to the figure.
export class Sight {

	constructor( story ) {

		this.story = story;
		this.app = story.app;
		// results, updated by measure()
		this.direct = 0; // share of the figure's points seen directly
		this.reflect = 0; // share seen in a reflection
		this.water = null; // which water
		this.centre = 1; // how far from the middle of the view (0 = dead centre, 1 = edge)
		this.px = 0; // on-screen height (pixels)

	}

	// The terrain, trunks, walls and fences between a and b? The ground is sampled along the
	// line; obstacles (the collision shapes) are tested exactly against it, each standing up to
	// its own height (a fence hides only what is below its top rail).
	blocked( a, b, skip = 0.6 ) {

		const td = this.app.terrainData;
		const d = a.distanceTo( b );
		if ( d > 600 ) return true;
		const n = Math.max( 2, Math.ceil( d / 1.5 ) );
		for ( let i = 1; i < n; i ++ ) {

			const t = i / n;
			if ( t * d < skip || ( 1 - t ) * d < skip ) continue;
			const x = a.x + ( b.x - a.x ) * t, y = a.y + ( b.y - a.y ) * t, z = a.z + ( b.z - a.z ) * t;
			if ( td.heightAt( x, z ) > y + 0.05 ) return true;

		}

		return this._shapes( a, b, skip );

	}

	_shapes( a, b, skip ) {

		const C = this.story.collision, td = this.app.terrainData;
		const stamp = ++ C._stamp;
		const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot( dx, dz );
		const steps = Math.max( 1, Math.ceil( len / 2 ) );
		for ( let k = 0; k <= steps; k ++ ) {

			const cx = a.x + dx * k / steps, cz = a.z + dz * k / steps;
			for ( let i = Math.floor( cx / 4 ) - 1; i <= Math.floor( cx / 4 ) + 1; i ++ ) for ( let j = Math.floor( cz / 4 ) - 1; j <= Math.floor( cz / 4 ) + 1; j ++ ) {

				const l = C.grid.get( C._key( i, j ) );
				if ( ! l ) continue;
				for ( const sh of l ) {

					if ( sh.stamp === stamp || sh.off ) continue;
					sh.stamp = stamp;
					const H = HEIGHT[ sh.tag ] ?? 2;
					if ( H <= 0 ) continue;
					// the parameter along a-b (xz) of the closest approach to the shape
					let t, dist;
					if ( sh.t === 0 ) {

						t = len > 1e-6 ? THREE.MathUtils.clamp( ( ( sh.x - a.x ) * dx + ( sh.z - a.z ) * dz ) / ( len * len ), 0, 1 ) : 0;
						dist = Math.hypot( a.x + dx * t - sh.x, a.z + dz * t - sh.z );

					} else {

						[ t, dist ] = segSeg( a.x, a.z, b.x, b.z, sh.ax, sh.az, sh.bx, sh.bz );

					}

					if ( dist >= sh.r ) continue;
					if ( t * len < skip || ( 1 - t ) * len < skip ) continue;
					const x = a.x + dx * t, z = a.z + dz * t, y = a.y + ( b.y - a.y ) * t;
					const top = ( sh.tag === 'rock' ? sh.r * 1.3 : H ) + td.heightAt( x, z );
					if ( y < top ) return true;

				}

			}

		}

		return false;

	}

	_onScreen( p, out ) {

		_p.copy( p ).project( this.app.camera );
		out.x = _p.x; out.y = _p.y;
		return _p.z < 1 && _p.z > - 1 && Math.abs( _p.x ) < 1.02 && Math.abs( _p.y ) < 1.02;

	}

	// the waters that could show a figure standing at pos: [ { level, contains( x, z ) } ]
	_waters( pos ) {

		const app = this.app, td = app.terrainData, out = [];
		// the lake: its surface is 0, and any ground below that is lake
		out.push( { name: 'lake', level: 0, contains: ( x, z ) => td.heightAt( x, z ) < - 0.03 && ! this._inPond( x, z ) } );
		td.ponds.forEach( ( p, i ) => {

			if ( Math.hypot( pos.x - p.c.x, pos.z - p.c.y ) > p.r * 5 + 60 ) return;
			out.push( { name: 'pond' + i, level: p.surf, contains: ( x, z ) => Math.hypot( x - p.c.x, z - p.c.y ) < p.r * 1.8 && td.heightAt( x, z ) < p.surf - 0.02 } );

		} );
		const P = this.story.props;
		if ( P?.troughWater && Math.hypot( pos.x - P.troughPos.x, pos.z - P.troughPos.z ) < 40 ) {

			const f = P.hutFrame, tp = P.troughLocal;
			out.push( { name: 'trough', level: P.troughPos.y, contains: ( x, z ) => {

				const [ lx, lz ] = f.toLocal( x, z );
				return Math.abs( lx - tp.x ) < 0.26 && Math.abs( lz - tp.z ) < 1.2 && P.troughWaterOn;

			} } );

		}

		// the puddle with the mirror (the one nearest you)
		const PM = this.story.puddles;
		if ( PM?.current && PM.water.mesh.visible ) out.push( { name: 'puddle', level: PM.current.level, contains: ( x, z ) => PM.contains( x, z ) } );
		// the stream: its mirror is level with the water nearest the camera
		const S = this.story;
		out.push( { name: 'stream', level: null, contains: ( x, z ) => {

			const w = S.waterAt( x, z );
			return w > 0.03 && td.heightAt( x, z ) < w - 0.04 && ! this._inPond( x, z );

		} } );
		return out;

	}

	_inPond( x, z ) {

		for ( const p of this.app.terrainData.ponds ) if ( Math.hypot( x - p.c.x, z - p.c.y ) < p.r * 1.8 && this.app.terrainData.heightAt( x, z ) < p.surf - 0.02 ) return true;
		return false;

	}

	// measure how the figure can be seen this frame
	measure( fig ) {

		this.direct = this.reflect = 0;
		this.water = null;
		this.centre = 1;
		this.px = 0;
		if ( fig.mode === 'hidden' ) return this;
		const cam = this.app.camera, eye = cam.position;
		cam.getWorldDirection( _f );
		const base = fig.pos, s = { x: 0, y: 0 };
		const H = this.app.renderer.domElement.height;
		// directly
		if ( fig.mode === 'direct' ) {

			let seen = 0, top = null, bot = null;
			for ( const h of HEIGHTS ) {

				_m.set( base.x, base.y + h, base.z );
				if ( ! this._onScreen( _m, s ) ) continue;
				if ( h === HEIGHTS[ 0 ] ) top = s.y;
				if ( h === HEIGHTS[ HEIGHTS.length - 1 ] ) bot = s.y;
				if ( this.blocked( eye, _m ) ) continue;
				seen ++;
				this.centre = Math.min( this.centre, Math.hypot( s.x, s.y ) );

			}

			this.direct = seen / HEIGHTS.length;
			if ( top !== null && bot !== null ) this.px = ( top - bot ) * 0.5 * H * 1.3;

		}

		// in the water (it shows in reflections whether it is 'direct' or 'reflect')
		const waters = this._waters( base );
		for ( const w of waters ) {

			let level = w.level;
			if ( level === null ) {

				level = this.story.waterAt( base.x, base.z );
				if ( level <= 0.03 ) {

					// the stream near the figure: its level between it and the eye
					const mx = ( base.x + eye.x ) / 2, mz = ( base.z + eye.z ) / 2;
					level = this.story.waterAt( mx, mz );
					if ( level <= 0.03 ) continue;

				}

			}

			if ( eye.y < level + 0.05 ) continue;
			let seen = 0, top = null, bot = null;
			for ( const h of HEIGHTS ) {

				const y = base.y + h;
				if ( y < level ) continue;
				_m.set( base.x, 2 * level - y, base.z );
				if ( ! this._onScreen( _m, s ) ) continue;
				// where the light leaves the water toward the eye
				const t = ( eye.y - level ) / ( eye.y - _m.y );
				if ( ! ( t > 0 && t < 1 ) ) continue;
				_r.copy( eye ).lerp( _m, t );
				if ( _r.distanceToSquared( eye ) > 250 * 250 ) continue;
				if ( ! w.contains( _r.x, _r.z ) ) continue;
				if ( h === HEIGHTS[ 0 ] ) top = s.y;
				if ( h === HEIGHTS[ HEIGHTS.length - 1 ] ) bot = s.y;
				_r.y = level + 0.02;
				if ( this.blocked( eye, _r, 0.3 ) ) continue;
				_p.set( base.x, y, base.z );
				if ( this.blocked( _r, _p, 0.3 ) ) continue;
				seen ++;
				this.centre = Math.min( this.centre, Math.hypot( s.x, s.y ) );

			}

			const share = seen / HEIGHTS.length;
			if ( share > this.reflect ) {

				this.reflect = share;
				this.water = w.name;
				if ( top !== null && bot !== null ) this.px = Math.max( this.px, ( bot - top ) * 0.5 * H * 1.3 );

			}

		}

		return this;

	}

	// How much of a figure standing at pos would an eye at eye see mirrored in water at level
	// (contains( x, z ): is that point on this water)? The same test as measure(), for any eye
	// and without the view (for choosing where to stand it).
	reflectable( eye, pos, level, contains ) {

		let seen = 0;
		const m = new THREE.Vector3(), r = new THREE.Vector3(), p = new THREE.Vector3();
		for ( const h of HEIGHTS ) {

			const y = pos.y + h;
			if ( y < level ) continue;
			m.set( pos.x, 2 * level - y, pos.z );
			const t = ( eye.y - level ) / ( eye.y - m.y );
			if ( ! ( t > 0 && t < 1 ) ) continue;
			r.copy( eye ).lerp( m, t );
			if ( r.distanceToSquared( eye ) > 250 * 250 ) continue;
			if ( ! contains( r.x, r.z ) ) continue;
			r.y = level + 0.02;
			if ( this.blocked( eye, r, 0.3 ) ) continue;
			p.set( pos.x, y, pos.z );
			if ( this.blocked( r, p, 0.3 ) ) continue;
			seen ++;

		}

		return seen / HEIGHTS.length;

	}

	// What shows behind a figure at pos seen in water at level from eye: follow the mirrored
	// ray on past its head and chest to what it meets - the ground or a spruce (dark: a dark
	// coat is lost against it), a larch, birch or aspen crown (light), or nothing, sky and mist
	// (light). Returns the share of those two points seen against something light.
	backdrop( eye, pos, level ) {

		const F = this.app.forest, td = this.app.terrainData;
		const light = this._light || ( this._light = new Set( [ ...F.speciesVariants.larch, ...F.speciesVariants.birch, ...F.speciesVariants.aspen ] ) );
		const e = new THREE.Vector3( eye.x, 2 * level - eye.y, eye.z ), p = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Vector3();
		let good = 0;
		for ( const h of [ 1.62, 1.3 ] ) {

			p.set( pos.x, pos.y + h, pos.z );
			d.subVectors( p, e ).normalize();
			let res = 1;
			for ( let t = 1; t < 400; t += t < 40 ? 1.5 : 6 ) {

				q.copy( p ).addScaledVector( d, t );
				if ( q.y > level + 90 ) break;
				if ( td.heightAt( q.x, q.z ) > q.y ) { res = 0; break; }
				// a crown here?
				let hit = null;
				for ( const tr of this._treesNear( q.x, q.z ) ) {

					const v = F.variants[ tr.variant ], H = v.height * tr.s, R = ( v.radius ?? 2 ) * tr.s * 0.55;
					if ( Math.hypot( tr.x - q.x, tr.z - q.z ) < R && q.y > tr.y + H * 0.25 && q.y < tr.y + H ) { hit = tr; break; }

				}

				// (after sunset the sky is the only light thing; gold crowns count for a little)
				if ( hit ) { res = light.has( hit.variant ) ? ( this.app.sky.sunElevation > 1 ? 1 : 0.35 ) : 0; break; }

			}

			good += res;

		}

		return good / 2;

	}

	_treesNear( x, z ) {

		if ( ! this._tg ) {

			this._tg = new Map();
			for ( const t of this.app.forest.trees ) {

				const k = Math.floor( t.x / 8 ) * 100003 + Math.floor( t.z / 8 );
				if ( ! this._tg.has( k ) ) this._tg.set( k, [] );
				this._tg.get( k ).push( t );

			}

		}

		const out = [];
		for ( let i = - 1; i <= 1; i ++ ) for ( let j = - 1; j <= 1; j ++ ) {

			const l = this._tg.get( ( Math.floor( x / 8 ) + i ) * 100003 + Math.floor( z / 8 ) + j );
			if ( l ) out.push( ...l );

		}

		return out;

	}

	get seen() {

		return this.direct > 0 || this.reflect > 0;

	}

}
