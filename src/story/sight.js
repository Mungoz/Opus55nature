import * as THREE from 'three';

const _p = new THREE.Vector3(), _m = new THREE.Vector3(), _r = new THREE.Vector3(), _f = new THREE.Vector3();
const HEIGHTS = [ 1.72, 1.35, 0.95, 0.5 ]; // hat, chest, hips, knees

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

	// the terrain, trunks and walls between a and b?
	blocked( a, b, skip = 0.6 ) {

		const td = this.app.terrainData;
		const d = a.distanceTo( b );
		const n = Math.max( 2, Math.ceil( d / 1.5 ) );
		for ( let i = 1; i < n; i ++ ) {

			const t = i / n;
			if ( t * d < skip || ( 1 - t ) * d < skip ) continue;
			const x = a.x + ( b.x - a.x ) * t, y = a.y + ( b.y - a.y ) * t, z = a.z + ( b.z - a.z ) * t;
			if ( td.heightAt( x, z ) > y + 0.05 ) return true;
			// trunks and walls: anything in the collision grid below the line's height there
			if ( y < 12 && this.story.collision.blocked( x, z, 0.0 ) ) {

				// (logs and stumps are low: only trunks and walls stand in the way above knee height)
				if ( y - td.heightAt( x, z ) > 0.8 && this._tall( x, z ) ) return true;

			}

		}

		return false;

	}

	_tall( x, z ) {

		const C = this.story.collision;
		const l = C.grid.get( C._key( Math.floor( x / 4 ), Math.floor( z / 4 ) ) );
		if ( ! l ) return false;
		for ( const s of l ) {

			if ( s.tag === 'log' || s.tag === 'stump' || s.tag === 'rock' || s.off ) continue;
			let cx, cz;
			if ( s.t === 0 ) { cx = s.x; cz = s.z; } else {

				const ex = s.bx - s.ax, ez = s.bz - s.az, l2 = ex * ex + ez * ez || 1;
				const t = THREE.MathUtils.clamp( ( ( x - s.ax ) * ex + ( z - s.az ) * ez ) / l2, 0, 1 );
				cx = s.ax + ex * t; cz = s.az + ez * t;

			}

			if ( Math.hypot( x - cx, z - cz ) < s.r ) return true;

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
				_r.copy( eye ).lerp( _m, t );
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

	get seen() {

		return this.direct > 0 || this.reflect > 0;

	}

}
