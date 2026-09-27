import * as THREE from 'three';
import { creatureMaterial, PartBuilder } from './creature.js';
import { RNG } from '../core/rng.js';

// Bird built along +z (forward), +x right wing, unit body length.
function birdGeometry( { body, belly, wing, span = 0.55, chord = 0.3, neck = 0, head = null, tail = 0.14 } ) {

	const b = new PartBuilder();
	const nose = [ 0, 0, 0.5 ], tl = [ 0, 0.02, - 0.35 ];
	const L = [ - 0.075, 0, 0.05 ], R = [ 0.075, 0, 0.05 ], T = [ 0, 0.065, 0.05 ], Bm = [ 0, - 0.06, 0.05 ];
	b.tris( [ nose, T, R, nose, R, Bm, nose, Bm, L, nose, L, T, tl, R, T, tl, T, L ], body );
	b.tris( [ tl, Bm, R, tl, L, Bm ], belly );
	// tail fan
	b.tris( [ [ 0, 0.02, - 0.28 ], [ tail, 0.02, - 0.5 ], [ - tail, 0.02, - 0.5 ] ], body );
	if ( neck > 0 ) {

		// long dark neck and head (geese)
		const n0 = [ 0, 0.02, 0.4 ], n1 = [ 0, 0.05, 0.4 + neck ];
		const w = 0.035;
		b.tris( [ [ - w, 0, 0.35 ], [ w, 0, 0.35 ], n1, [ 0, 0.05, 0.35 ], [ - w, 0, 0.35 ], n1, [ w, 0, 0.35 ], [ 0, 0.05, 0.35 ], n1 ], head ?? body );
		b.tris( [ n1, [ - 0.04, 0.02, n1[ 2 ] + 0.02 ], [ 0, 0.02, n1[ 2 ] + 0.13 ], n1, [ 0, 0.02, n1[ 2 ] + 0.13 ], [ 0.04, 0.02, n1[ 2 ] + 0.02 ] ], head ?? body );
		void n0;

	}

	// wings (two triangles each), aFlap grows toward the tip
	for ( const s of [ - 1, 1 ] ) {

		const rootF = [ 0.05 * s, 0.015, 0.16 ], rootB = [ 0.05 * s, 0.015, 0.16 - chord ];
		const mid = [ span * 0.55 * s, 0.03, 0.12 - chord * 0.35 ], tip = [ span * s, 0.0, - 0.05 - chord * 0.2 ];
		const trail = [ span * 0.6 * s, 0.02, 0.1 - chord * 1.05 ];
		b.tris( [ rootF, mid, rootB, rootB, mid, trail, mid, tip, trail ], wing, ( x ) => Math.min( 1, Math.abs( x ) / span ) * s );

	}

	return b.build();

}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _f = new THREE.Vector3();
const _up = new THREE.Vector3( 0, 1, 0 );
const _look = new THREE.Matrix4();
const _zero = new THREE.Vector3();
const _q2 = new THREE.Vector3();

function orient( pos, vel, bank, scale, out ) {

	_f.copy( vel ).normalize();
	_look.lookAt( _zero, _f, _up ); // -z toward vel
	_q.setFromRotationMatrix( _look );
	// our models face +z: flip, then bank about the forward axis
	_q.multiply( new THREE.Quaternion().setFromAxisAngle( _up, Math.PI ) );
	_q.multiply( new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 0, 1 ), bank ) );
	return out.compose( pos, _q, _s.set( scale, scale, scale ) );

}

// ---------------------------------------------------------------------------
// Starling murmuration (boids with a spatial hash)
// ---------------------------------------------------------------------------
export class Murmuration {

	constructor( count, terrain ) {

		this.n = count;
		this.terrain = terrain;
		this.pos = new Float32Array( count * 3 );
		this.vel = new Float32Array( count * 3 );
		this.bank = new Float32Array( count );
		const rng = new RNG( 42 );
		this.center = new THREE.Vector3( 0, 125, 300 );
		for ( let i = 0; i < count; i ++ ) {

			this.pos[ i * 3 ] = this.center.x + rng.range( - 25, 25 );
			this.pos[ i * 3 + 1 ] = this.center.y + rng.range( - 10, 10 );
			this.pos[ i * 3 + 2 ] = this.center.z + rng.range( - 25, 25 );
			this.vel[ i * 3 ] = rng.range( - 1, 1 ) * 10;
			this.vel[ i * 3 + 2 ] = rng.range( - 1, 1 ) * 10;

		}

		const geo = birdGeometry( { body: '#1c1a1c', belly: '#2a2624', wing: '#1f1d20', span: 0.62, chord: 0.28 } );
		this.material = creatureMaterial( { flapSpeed: 20, flapAmp: 0.75, minSize: 0.0045 } );
		this.mesh = new THREE.InstancedMesh( geo, this.material, count );
		this.mesh.frustumCulled = false;
		this.mesh.name = 'starlings';
		this.grid = new Map();
		this.attractor = new THREE.Vector3();
		this.predator = null;
		this.time = 0;
		this.rng = rng;
		// director: centre (Vector3) the flock wheels about; keepAway { p, r } it parts round;
		// floor: how low it will come over the ground or water; sway: how far its middle roams
		this.centre = null;
		this.keepAway = null;
		this.floor = 25;
		this.sway = new THREE.Vector3( 60, 18, 70 );
		// how hard the flock as a whole is steered to its roaming middle (a director's flock is
		// kept on a shorter rein, so it wheels where it is wanted)
		this.pull = 1;
		// (and how long, in seconds of its loop, a director's flock strings out, and how close
		// the birds will fly - squared distance)
		this.stretch = 0;
		this.space2 = 4;
		// whether it comes over on its own at dusk (an edition's director may take that over)
		this.auto = true;
		// per bird: 0 flying with the flock, 1 going down to roost, 2 down in the reeds
		this.state = new Uint8Array( count );
		this.roost = null;
		// (for sound: the flying birds' middle, and how hard they are turning, 0..1)
		this.mid = new THREE.Vector3();
		this.turning = 0;

	}

	// bring a murmuration in now, from far down the valley, to wheel about centre
	summon( centre, from ) {

		this.centre = centre.clone();
		this.phase = 'on';
		this.cycle = 1e9;
		this.roost = null;
		this.state.fill( 0 );
		this.mesh.visible = true;
		for ( let i = 0; i < this.n; i ++ ) {

			this.pos[ i * 3 ] = from.x + this.rng.range( - 30, 30 );
			this.pos[ i * 3 + 1 ] = from.y + this.rng.range( - 15, 15 );
			this.pos[ i * 3 + 2 ] = from.z + this.rng.range( - 30, 30 );
			this.vel[ i * 3 ] = ( centre.x - from.x ) * 0.01;
			this.vel[ i * 3 + 1 ] = 0;
			this.vel[ i * 3 + 2 ] = ( centre.z - from.z ) * 0.01;

		}

	}

	// send it away: off down the valley, or - given a reedbed { x, z, len, wid, yaw } - to roost.
	// Over the bed the flock pours down into it in a stream, the birds nearest it first, each to
	// its own stem, and is gone into the reeds.
	dismiss( exit = null, bed = null ) {

		this.phase = 'out';
		this.cycle = bed ? 1e9 : 30;
		this.exit = exit ?? new THREE.Vector3( this.rng.range( - 1, 1 ) * 1500, 320, 2400 );
		this.roost = null;
		if ( ! bed ) return;
		const T = new Float32Array( this.n * 3 ), ca = Math.cos( bed.yaw ?? 0 ), sa = Math.sin( bed.yaw ?? 0 );
		for ( let i = 0; i < this.n; i ++ ) {

			const a = this.rng.next() * Math.PI * 2, r = Math.sqrt( this.rng.next() ) * 0.85;
			const u = Math.cos( a ) * r * bed.len, v = Math.sin( a ) * r * bed.wid;
			T[ i * 3 ] = bed.x + ca * u + sa * v;
			T[ i * 3 + 1 ] = ( bed.y ?? 0 ) + this.rng.range( 0.9, 1.8 );
			T[ i * 3 + 2 ] = bed.z - sa * u + ca * v;

		}

		this.roost = { T, c: new THREE.Vector3( bed.x, ( bed.y ?? 0 ) + 1.5, bed.z ), rate: this.n / ( bed.pour ?? 14 ), order: null, next: 0, released: 0, landed: 0 };

	}

	// A director's flock sweeps fast, long loops about its centre; each bird follows the loop a
	// moment behind or ahead of the others, so the flock streams out along it in a ribbon that
	// folds and thickens on the turns, instead of balling up round a point.
	_loop( t, out ) {

		const W = this.sway, C = this.centre;
		return out.set( C.x + ( Math.sin( t * 0.21 ) * 0.8 + Math.sin( t * 0.53 ) * 0.2 ) * W.x, C.y + ( Math.sin( t * 0.31 ) * 0.7 + Math.sin( t * 0.71 ) * 0.3 ) * W.y, C.z + ( Math.sin( t * 0.15 + 1.3 ) * 0.85 + Math.sin( t * 0.43 ) * 0.15 ) * W.z );

	}

	// how many are still in the air
	get flying() {

		let k = 0;
		for ( let i = 0; i < this.n; i ++ ) if ( this.state[ i ] < 2 ) k ++;
		return k;

	}

	// Murmurations are an event: every few minutes of late afternoon or dusk a
	// flock sweeps in from down the valley, wheels over the lake, then leaves.
	schedule( dt, allowed ) {

		this.cycle = ( this.cycle ?? 40 ) - dt;
		this.phase = this.phase ?? 'off';
		if ( this.phase === 'off' ) {

			if ( allowed && this.cycle <= 0 ) {

				this.phase = 'on';
				this.cycle = this.rng.range( 90, 140 );
				// arrive from far down the valley
				const ox = this.rng.range( - 300, 300 ), oz = 1500;
				for ( let i = 0; i < this.n; i ++ ) {

					this.pos[ i * 3 ] = ox + this.rng.range( - 30, 30 );
					this.pos[ i * 3 + 1 ] = 160 + this.rng.range( - 15, 15 );
					this.pos[ i * 3 + 2 ] = oz + this.rng.range( - 30, 30 );
					this.vel[ i * 3 ] = 0;
					this.vel[ i * 3 + 1 ] = 0;
					this.vel[ i * 3 + 2 ] = - 14;

				}

			}

		} else if ( this.phase === 'on' ) {

			if ( this.cycle <= 0 || ! allowed ) {

				this.phase = 'out';
				this.cycle = 30;
				this.exit = new THREE.Vector3( this.rng.range( - 1, 1 ) * 1500, 320, 2400 );

			}

		} else if ( this.cycle <= 0 ) {

			this.phase = 'off';
			this.cycle = this.rng.range( 220, 420 );

		}

		return this.phase !== 'off';

	}

	update( dt, allowed ) {

		// all down in the reeds
		if ( this.phase === 'roosted' ) { this.mesh.visible = false; return; }
		// (a director's murmuration flies whatever the light)
		const visible = this.schedule( dt, ( allowed && this.auto ) || !! this.centre || !! this.roost );
		this.mesh.visible = visible;
		if ( ! visible ) return;
		dt = Math.min( dt, 0.05 );
		this.time += dt;
		const t = this.time;
		const n = this.n, P = this.pos, Vv = this.vel;
		// wandering attractor over the lake (or away, when leaving)
		if ( this.phase === 'out' ) {

			this.attractor.copy( this.exit );
			// over a roost it wheels above the bed a while before it goes down
			if ( this.roost ) this.attractor.add( _p.set( Math.sin( t * 0.21 ) * 24, Math.sin( t * 0.31 ) * 5, Math.cos( t * 0.17 ) * 18 ) );

		} else if ( this.centre ) this._loop( t, this.attractor );
		else this.attractor.set( Math.sin( t * 0.045 ) * 170 + Math.sin( t * 0.13 ) * 50, 125 + 35 * Math.sin( t * 0.09 ) + 15 * Math.sin( t * 0.31 ), 120 + Math.cos( t * 0.033 ) * 260 );
		// occasional falcon strike splits the flock
		// (not for a director's flock: its empty place is its falcon, and it flies too low to scatter)
		if ( ! this.predator && ! this.centre && ! this.roost && this.rng.next() < dt * 0.02 ) {

			const i = Math.floor( this.rng.next() * n );
			this.predator = { p: new THREE.Vector3( P[ i * 3 ] + 40, P[ i * 3 + 1 ] + 30, P[ i * 3 + 2 ] ), v: new THREE.Vector3( - 40, - 25, this.rng.range( - 10, 10 ) ), life: 3 };

		}

		if ( this.predator ) {

			this.predator.p.addScaledVector( this.predator.v, dt );
			this.predator.life -= dt;
			if ( this.predator.life <= 0 ) this.predator = null;

		}

		// spatial hash
		const cell = 8;
		const grid = this.grid;
		grid.clear();
		for ( let i = 0; i < n; i ++ ) {

			const k = ( Math.floor( P[ i * 3 ] / cell ) * 73856093 ) ^ ( Math.floor( P[ i * 3 + 1 ] / cell ) * 19349663 ) ^ ( Math.floor( P[ i * 3 + 2 ] / cell ) * 83492791 );
			let a = grid.get( k );
			if ( ! a ) grid.set( k, ( a = [] ) );
			a.push( i );

		}

		const ax = this.attractor.x, ay = this.attractor.y, az = this.attractor.z;
		// flock centroid keeps the murmuration one coherent body (those still with it)
		let mx = 0, my = 0, mz = 0, nf = 0;
		const St = this.state;
		for ( let i = 0; i < n; i ++ ) {

			if ( St[ i ] ) continue;
			mx += P[ i * 3 ]; my += P[ i * 3 + 1 ]; mz += P[ i * 3 + 2 ];
			nf ++;

		}

		mx /= Math.max( 1, nf ); my /= Math.max( 1, nf ); mz /= Math.max( 1, nf );
		this.mid.set( mx, my, mz );
		let bk = 0;
		for ( let i = 0; i < n; i += 7 ) bk += Math.abs( this.bank[ i ] );
		this.turning = Math.min( 1, bk / Math.ceil( n / 7 ) / 0.6 );
		const R = this.roost;
		if ( R ) {

			// over the bed: they start to go down, the nearest first
			if ( ! R.over && Math.hypot( mx - R.c.x, mz - R.c.z ) < 60 ) R.over = t;
			if ( ! R.order && R.over && t - R.over > ( R.wheel ?? 12 ) ) {

				R.order = [ ...Array( n ).keys() ].sort( ( a, b ) => ( ( P[ a * 3 ] - R.c.x ) ** 2 + ( P[ a * 3 + 2 ] - R.c.z ) ** 2 ) - ( ( P[ b * 3 ] - R.c.x ) ** 2 + ( P[ b * 3 + 2 ] - R.c.z ) ** 2 ) );

			}

			if ( R.order ) {

				R.next += R.rate * dt * ( 0.4 + Math.min( 1.6, R.released / n * 3 ) );
				while ( R.released < n && R.released < R.next ) St[ R.order[ R.released ++ ] ] = 1;

			}

		}
		// uniform steering of the flock's centre toward the attractor
		const gtx = ax - mx, gty = ay - my, gtz = az - mz;
		const gtd = Math.sqrt( gtx * gtx + gty * gty + gtz * gtz ) + 1e-3;
		const gpull = ( 1.5 + Math.min( gtd / 40, 6 ) ) * this.pull;
		const gux = gtx / gtd * gpull, guy = gty / gtd * gpull, guz = gtz / gtd * gpull;
		for ( let i = 0; i < n; i ++ ) {

			if ( St[ i ] === 2 ) continue;
			if ( St[ i ] === 1 ) {

				this._descend( i, dt );
				continue;

			}

			const px = P[ i * 3 ], py = P[ i * 3 + 1 ], pz = P[ i * 3 + 2 ];
			const cx = Math.floor( px / cell ), cy = Math.floor( py / cell ), cz = Math.floor( pz / cell );
			let sx = 0, sy = 0, sz = 0, alx = 0, aly = 0, alz = 0, chx = 0, chy = 0, chz = 0, cnt = 0;
			for ( let dz = - 1; dz <= 1; dz ++ ) for ( let dy = - 1; dy <= 1; dy ++ ) for ( let dx = - 1; dx <= 1; dx ++ ) {

				const list = grid.get( ( ( cx + dx ) * 73856093 ) ^ ( ( cy + dy ) * 19349663 ) ^ ( ( cz + dz ) * 83492791 ) );
				if ( ! list ) continue;
				for ( let q = 0; q < list.length && cnt < 14; q ++ ) {

					const j = list[ q ];
					if ( j === i ) continue;
					const ox = P[ j * 3 ] - px, oy = P[ j * 3 + 1 ] - py, oz = P[ j * 3 + 2 ] - pz;
					const d2 = ox * ox + oy * oy + oz * oz;
					if ( d2 > 64 ) continue;
					cnt ++;
					if ( d2 < this.space2 ) {

						const inv = 1.6 * this.space2 / 4 / ( d2 + 0.15 );
						sx -= ox * inv; sy -= oy * inv; sz -= oz * inv;

					}

					alx += Vv[ j * 3 ]; aly += Vv[ j * 3 + 1 ]; alz += Vv[ j * 3 + 2 ];
					chx += ox; chy += oy; chz += oz;

				}

			}

			let fx = 0, fy = 0, fz = 0;
			const vx = Vv[ i * 3 ], vy = Vv[ i * 3 + 1 ], vz = Vv[ i * 3 + 2 ];
			if ( cnt > 0 ) {

				fx += sx * 4 + ( alx / cnt - vx ) * 1.8 + chx / cnt * 1.8;
				fy += sy * 4 + ( aly / cnt - vy ) * 1.8 + chy / cnt * 1.8;
				fz += sz * 4 + ( alz / cnt - vz ) * 1.8 + chz / cnt * 1.8;

			}

			// hold together: steer toward the flock centroid
			const gx = mx - px, gy = my - py, gz = mz - pz;
			const gd = Math.sqrt( gx * gx + gy * gy + gz * gz ) + 1e-3;
			const ribbon = this.centre && this.phase === 'on' && this.stretch > 0;
			const hold = Math.max( 0, gd - ( ribbon ? 45 : 24 ) ) * 0.1;
			fx += gx / gd * hold; fy += gy / gd * hold; fz += gz / gd * hold;
			if ( ribbon ) {

				// each steered, as the whole flock is, from the flock's middle - but toward its own
				// moment of the loop, so the flock draws out along it (and is never crushed together)
				this._loop( t - ( ( i * 0.618034 ) % 1 ) * this.stretch, _q2 );
				const ox = _q2.x - mx, oy = _q2.y - my, oz = _q2.z - mz, od = Math.sqrt( ox * ox + oy * oy + oz * oz ) + 1e-3;
				const k = ( 1.5 + Math.min( od / 40, 6 ) ) * this.pull;
				fx += ox / od * k; fy += oy / od * k; fz += oz / od * k;

			} else {

				// the whole flock is steered toward the roaming centre as one body
				fx += gux; fy += guy; fz += guz;

			}
			// flee the falcon
			if ( this.predator ) {

				const ox = px - this.predator.p.x, oy = py - this.predator.p.y, oz = pz - this.predator.p.z;
				const d2 = ox * ox + oy * oy + oz * oz;
				if ( d2 < 900 ) {

					const k = 900 / ( d2 + 10 );
					fx += ox * k; fy += oy * k; fz += oz * k;

				}

			}

			// part round the director's empty point, as round a falcon
			if ( this.keepAway ) {

				const K = this.keepAway;
				// (a column: a standing shape of nothing, from the water up through the flock)
				const ox = px - K.p.x, oy = K.column ? 0 : py - K.p.y, oz = pz - K.p.z;
				const d2 = ox * ox + oy * oy + oz * oz, r2 = K.r * K.r;
				if ( d2 < r2 * 2.2 ) {

					const k = r2 * 1.6 / ( d2 + 4 );
					fx += ox * k; fy += oy * k; fz += oz * k;

				}

			}

			// keep off the ground
			const ground = Math.max( this.terrain.heightAt( px, pz ), 0 );
			if ( py < ground + this.floor ) fy += ( ground + this.floor - py ) * 2;

			let nvx = vx + fx * dt, nvy = vy + fy * dt * 0.8, nvz = vz + fz * dt;
			const sp = Math.sqrt( nvx * nvx + nvy * nvy + nvz * nvz ) + 1e-4;
			const clamped = Math.min( Math.max( sp, 9 ), 17 );
			nvx *= clamped / sp; nvy *= clamped / sp; nvz *= clamped / sp;
			// bank into turns
			const turn = ( vx * nvz - vz * nvx ) / ( sp * sp * dt + 1e-3 );
			this.bank[ i ] += ( THREE.MathUtils.clamp( - turn * 0.6, - 1.1, 1.1 ) - this.bank[ i ] ) * Math.min( 1, dt * 6 );
			Vv[ i * 3 ] = nvx; Vv[ i * 3 + 1 ] = nvy; Vv[ i * 3 + 2 ] = nvz;

		}

		for ( let i = 0; i < n; i ++ ) {

			if ( St[ i ] === 2 ) {

				_m.makeScale( 0, 0, 0 );
				this.mesh.setMatrixAt( i, _m );
				continue;

			}

			P[ i * 3 ] += Vv[ i * 3 ] * dt;
			P[ i * 3 + 1 ] += Vv[ i * 3 + 1 ] * dt;
			P[ i * 3 + 2 ] += Vv[ i * 3 + 2 ] * dt;
			// never into the ground or the water (those going down to roost excepted)
			if ( ! St[ i ] ) {

				const g = Math.max( this.terrain.heightAt( P[ i * 3 ], P[ i * 3 + 2 ] ), 0 ) + 2;
				if ( P[ i * 3 + 1 ] < g ) { P[ i * 3 + 1 ] = g; if ( Vv[ i * 3 + 1 ] < 0 ) Vv[ i * 3 + 1 ] *= - 0.3; }

			}

			_p.set( P[ i * 3 ], P[ i * 3 + 1 ], P[ i * 3 + 2 ] );
			orient( _p, _f.set( Vv[ i * 3 ], Vv[ i * 3 + 1 ], Vv[ i * 3 + 2 ] ), this.bank[ i ], 0.42, _m );
			this.mesh.setMatrixAt( i, _m );

		}

		this.mesh.instanceMatrix.needsUpdate = true;
		if ( R && R.landed >= n ) this.phase = 'roosted';

	}

	// One bird going down to its stem: out of the flock it streams toward the bed, spiralling a
	// little as the stream funnels, slowing as it drops, and at the last it is in and gone.
	_descend( i, dt ) {

		const P = this.pos, Vv = this.vel, R = this.roost, T = R.T;
		const dx = T[ i * 3 ] - P[ i * 3 ], dy = T[ i * 3 + 1 ] - P[ i * 3 + 1 ], dz = T[ i * 3 + 2 ] - P[ i * 3 + 2 ];
		const dh = Math.hypot( dx, dz ), d = Math.hypot( dh, dy ) + 1e-4;
		if ( d < 1.4 ) {

			this.state[ i ] = 2;
			R.landed ++;
			return;

		}

		// fast and level toward the bed, then steeply down into it
		const sp = THREE.MathUtils.clamp( d * 1.1, 2.2, 16 );
		const steep = THREE.MathUtils.smoothstep( 30 - dh, 0, 30 );
		let vx = dx / d, vy = dy / d, vz = dz / d;
		vy = vy * ( 0.35 + 0.65 * steep ) - ( 1 - steep ) * 0.05;
		// the funnel's twist
		const tw = 0.35 * ( 1 - steep * 0.6 ) * THREE.MathUtils.smoothstep( d, 3, 12 );
		vx += - dz / ( dh + 1e-3 ) * tw;
		vz += dx / ( dh + 1e-3 ) * tw;
		const k = d < 5 ? 1 : Math.min( 1, dt * 3.5 );
		Vv[ i * 3 ] += ( vx * sp - Vv[ i * 3 ] ) * k;
		Vv[ i * 3 + 1 ] += ( vy * sp - Vv[ i * 3 + 1 ] ) * k;
		Vv[ i * 3 + 2 ] += ( vz * sp - Vv[ i * 3 + 2 ] ) * k;
		this.bank[ i ] *= 1 - Math.min( 1, dt * 3 );

	}

	get centroid() {

		return this.attractor;

	}

}

// ---------------------------------------------------------------------------
// Migrating geese in V formation
// ---------------------------------------------------------------------------
export class GeeseFlight {

	constructor( terrain, onHonk = () => {} ) {

		this.terrain = terrain;
		this.onHonk = onHonk;
		this.max = 15;
		const geo = birdGeometry( { body: '#6b645a', belly: '#b9b1a3', wing: '#57514a', span: 0.95, chord: 0.36, neck: 0.42, head: '#161514', tail: 0.12 } );
		this.material = creatureMaterial( { flapSpeed: 5.2, flapAmp: 0.55 } );
		this.mesh = new THREE.InstancedMesh( geo, this.material, this.max );
		this.mesh.frustumCulled = false;
		this.mesh.name = 'geese';
		this.mesh.count = 0;
		this.rng = new RNG( 17 );
		this.timer = 12;
		this.flight = null;
		// passes on their own every so often (a director may take that over)
		this.auto = true;

	}

	// a skein now, crossing low in front of the viewer at height h above them
	pass( camera, h = 30, ahead = 60 ) {

		this._launch( camera );
		const f = this.flight;
		const fwd = new THREE.Vector3();
		camera.getWorldDirection( fwd );
		fwd.y = 0;
		fwd.normalize();
		const passP = camera.position.clone().addScaledVector( fwd, ahead );
		f.pos.copy( passP ).addScaledVector( f.dir, - 500 );
		f.pos.y = Math.max( camera.position.y, 0 ) + h;
		f.low = h;

	}

	_launch( camera ) {

		const rng = this.rng;
		const count = rng.int( 9, 15 );
		// cross the sky in front of the viewer, a couple of hundred metres out
		const fwd = new THREE.Vector3();
		camera.getWorldDirection( fwd );
		fwd.y = 0;
		fwd.normalize();
		const across = new THREE.Vector3( - fwd.z, 0, fwd.x ).multiplyScalar( rng.next() < 0.5 ? 1 : - 1 );
		const dir = across.clone().applyAxisAngle( new THREE.Vector3( 0, 1, 0 ), rng.range( - 0.6, 0.6 ) );
		const side = new THREE.Vector3( - dir.z, 0, dir.x );
		const pass = camera.position.clone().addScaledVector( fwd, rng.range( 160, 320 ) );
		const start = pass.clone().addScaledVector( dir, - 900 );
		start.y = Math.max( camera.position.y, 0 ) + rng.range( 55, 100 );
		this.flight = { count, dir, side, pos: start, speed: 17, dist: 0, honk: 0 };

	}

	update( dt, time, camera, visible ) {

		this.timer -= dt;
		if ( ! this.flight && this.timer <= 0 && visible && this.auto ) {

			this._launch( camera );
			this.timer = this.rng.range( 25, 55 );

		}

		const f = this.flight;
		if ( ! f ) {

			this.mesh.count = 0;
			// nothing to draw (an empty InstancedMesh still costs a draw set-up in every pass)
			this.mesh.visible = false;
			return;

		}

		f.pos.addScaledVector( f.dir, f.speed * dt );
		f.dist += f.speed * dt;
		const ground = this.terrain.heightAt( f.pos.x, f.pos.z );
		const floor = f.low ? Math.min( 45, f.low ) : 45;
		if ( f.pos.y < ground + floor ) f.pos.y += ( ground + floor - f.pos.y ) * dt * 0.5;
		const vel = _f.copy( f.dir ).multiplyScalar( f.speed );
		for ( let i = 0; i < f.count; i ++ ) {

			const rank = Math.ceil( i / 2 );
			const s = i === 0 ? 0 : ( i % 2 ? 1 : - 1 );
			_p.copy( f.pos ).addScaledVector( f.dir, - rank * 2.4 ).addScaledVector( f.side, s * rank * 2.6 );
			_p.y += Math.sin( time * 1.3 + i * 1.7 ) * 0.35 + rank * 0.15;
			orient( _p, vel, Math.sin( time * 0.7 + i ) * 0.05, 1.05, _m );
			this.mesh.setMatrixAt( i, _m );

		}

		this.mesh.count = f.count;
		this.mesh.visible = true;
		this.mesh.instanceMatrix.needsUpdate = true;
		f.honk -= dt;
		if ( f.honk <= 0 ) {

			this.onHonk( f.pos, f.count );
			f.honk = this.rng.range( 0.4, 2.2 );

		}

		if ( f.dist > 1900 ) this.flight = null;

	}

}

// ---------------------------------------------------------------------------
// Golden eagles riding thermals above the ridges
// ---------------------------------------------------------------------------
export class Eagles {

	constructor( terrain ) {

		this.terrain = terrain;
		// golden eagles high over the ridges; common buzzards (brown, pale-barred beneath, a
		// shorter tail) circling over the meadows; a pair of ravens along the cliffs,
		// wedge-tailed, flying together and now and then tumbling
		const kinds = [
			{ name: 'eagles', geo: { body: '#3a2a1c', belly: '#4a3522', wing: '#35271b', span: 1.2, chord: 0.42, tail: 0.18 }, flap: [ 3, 0.35, 1 ], scale: 2.1, birds: [
				{ c: new THREE.Vector3( - 380, 470, - 500 ), r: 130, w: 0.085, ph: 0, drift: 110 },
				{ c: new THREE.Vector3( 360, 420, - 150 ), r: 95, w: - 0.11, ph: 2, drift: 110 },
			] },
			{ name: 'buzzards', geo: { body: '#5a4230', belly: '#b8a488', wing: '#4e3a2a', span: 1.05, chord: 0.46, tail: 0.2 }, flap: [ 3.6, 0.4, 0.85 ], scale: 1.25, birds: [
				{ c: new THREE.Vector3( 40, 150, 560 ), r: 55, w: 0.16, ph: 1, drift: 60 },
				{ c: new THREE.Vector3( - 150, 175, 320 ), r: 70, w: - 0.13, ph: 3, drift: 70 },
				{ c: new THREE.Vector3( 140, 190, 180 ), r: 60, w: 0.15, ph: 5, drift: 60 },
			] },
			{ name: 'ravens', geo: { body: '#101012', belly: '#18181a', wing: '#0e0e10', span: 1.0, chord: 0.36, tail: 0.16 }, flap: [ 4.5, 0.5, 0.55 ], scale: 1.15, pair: true, birds: [
				{ c: new THREE.Vector3( - 230, 140, 700 ), r: 80, w: 0.12, ph: 0, drift: 90 },
				{ c: new THREE.Vector3( - 230, 140, 700 ), r: 80, w: 0.12, ph: 0.12, drift: 90, follow: true },
			] },
		];
		this.kinds = kinds.map( ( k ) => {

			const mesh = new THREE.InstancedMesh( birdGeometry( k.geo ), creatureMaterial( { flapSpeed: k.flap[ 0 ], flapAmp: k.flap[ 1 ], glide: k.flap[ 2 ] } ), k.birds.length );
			mesh.frustumCulled = false;
			mesh.name = k.name;
			return { ...k, mesh };

		} );
		this.mesh = new THREE.Group();
		this.mesh.name = 'soaring';
		for ( const k of this.kinds ) this.mesh.add( k.mesh );

	}

	update( dt, time, visible ) {

		this.mesh.visible = visible;
		if ( ! visible ) return;
		for ( const k of this.kinds ) {

			k.birds.forEach( ( b, i ) => {

				const a = time * b.w + b.ph;
				const j = b.follow ? 0 : i;
				const drift = new THREE.Vector3( Math.sin( time * 0.011 + j ) * b.drift, Math.sin( time * 0.05 + j ) * 25, Math.cos( time * 0.009 + j ) * b.drift );
				_p.set( b.c.x + Math.cos( a ) * b.r, b.c.y, b.c.z + Math.sin( a ) * b.r ).add( drift );
				// ravens: now and then one rolls right over, the way they play in the wind
				let roll = Math.sign( b.w ) * 0.35;
				if ( k.pair ) {

					_p.y += b.follow ? 3 + Math.sin( time * 0.7 ) * 2 : 0;
					const tumble = Math.max( 0, Math.sin( time * 0.21 + i * 2 ) - 0.97 ) / 0.03;
					roll += tumble * Math.PI * 2 * ( ( time * 0.21 / ( Math.PI * 2 ) ) % 1 );

				}

				const vel = _s.set( - Math.sin( a ) * b.w, 0.01, Math.cos( a ) * b.w ).normalize();
				orient( _p, vel, roll, k.scale, _m );
				k.mesh.setMatrixAt( i, _m );

			} );
			k.mesh.instanceMatrix.needsUpdate = true;

		}

	}

}
