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
		this.material = creatureMaterial( { flapSpeed: 20, flapAmp: 0.75 } );
		this.mesh = new THREE.InstancedMesh( geo, this.material, count );
		this.mesh.frustumCulled = false;
		this.mesh.name = 'starlings';
		this.grid = new Map();
		this.attractor = new THREE.Vector3();
		this.predator = null;
		this.time = 0;
		this.rng = rng;

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

		const visible = this.schedule( dt, allowed );
		this.mesh.visible = visible;
		if ( ! visible ) return;
		dt = Math.min( dt, 0.05 );
		this.time += dt;
		const t = this.time;
		const n = this.n, P = this.pos, Vv = this.vel;
		// wandering attractor over the lake (or away, when leaving)
		if ( this.phase === 'out' ) this.attractor.copy( this.exit );
		else this.attractor.set( Math.sin( t * 0.045 ) * 170 + Math.sin( t * 0.13 ) * 50, 125 + 35 * Math.sin( t * 0.09 ) + 15 * Math.sin( t * 0.31 ), 120 + Math.cos( t * 0.033 ) * 260 );
		// occasional falcon strike splits the flock
		if ( ! this.predator && this.rng.next() < dt * 0.02 ) {

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
		// flock centroid keeps the murmuration one coherent body
		let mx = 0, my = 0, mz = 0;
		for ( let i = 0; i < n; i ++ ) {

			mx += P[ i * 3 ]; my += P[ i * 3 + 1 ]; mz += P[ i * 3 + 2 ];

		}

		mx /= n; my /= n; mz /= n;
		// uniform steering of the flock's centre toward the attractor
		const gtx = ax - mx, gty = ay - my, gtz = az - mz;
		const gtd = Math.sqrt( gtx * gtx + gty * gty + gtz * gtz ) + 1e-3;
		const gpull = 1.5 + Math.min( gtd / 40, 6 );
		const gux = gtx / gtd * gpull, guy = gty / gtd * gpull, guz = gtz / gtd * gpull;
		for ( let i = 0; i < n; i ++ ) {

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
					if ( d2 < 4 ) {

						const inv = 1.6 / ( d2 + 0.15 );
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
			const hold = Math.max( 0, gd - 24 ) * 0.1;
			fx += gx / gd * hold; fy += gy / gd * hold; fz += gz / gd * hold;
			// the whole flock is steered toward the roaming centre as one body
			fx += gux; fy += guy; fz += guz;
			// flee the falcon
			if ( this.predator ) {

				const ox = px - this.predator.p.x, oy = py - this.predator.p.y, oz = pz - this.predator.p.z;
				const d2 = ox * ox + oy * oy + oz * oz;
				if ( d2 < 900 ) {

					const k = 900 / ( d2 + 10 );
					fx += ox * k; fy += oy * k; fz += oz * k;

				}

			}

			// keep off the ground
			const ground = Math.max( this.terrain.heightAt( px, pz ), 0 );
			if ( py < ground + 25 ) fy += ( ground + 25 - py ) * 2;

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

			P[ i * 3 ] += Vv[ i * 3 ] * dt;
			P[ i * 3 + 1 ] += Vv[ i * 3 + 1 ] * dt;
			P[ i * 3 + 2 ] += Vv[ i * 3 + 2 ] * dt;
			_p.set( P[ i * 3 ], P[ i * 3 + 1 ], P[ i * 3 + 2 ] );
			orient( _p, _f.set( Vv[ i * 3 ], Vv[ i * 3 + 1 ], Vv[ i * 3 + 2 ] ), this.bank[ i ], 0.42, _m );
			this.mesh.setMatrixAt( i, _m );

		}

		this.mesh.instanceMatrix.needsUpdate = true;

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
		if ( ! this.flight && this.timer <= 0 && visible ) {

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
		if ( f.pos.y < ground + 45 ) f.pos.y += ( ground + 45 - f.pos.y ) * dt * 0.5;
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
