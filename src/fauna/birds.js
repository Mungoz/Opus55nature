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

	update( dt, visible ) {

		this.mesh.visible = visible;
		if ( ! visible ) return;
		dt = Math.min( dt, 0.05 );
		this.time += dt;
		const t = this.time;
		const n = this.n, P = this.pos, Vv = this.vel;
		// wandering attractor over the lake
		this.attractor.set( Math.sin( t * 0.045 ) * 170 + Math.sin( t * 0.13 ) * 50, 125 + 35 * Math.sin( t * 0.09 ) + 15 * Math.sin( t * 0.31 ), 120 + Math.cos( t * 0.033 ) * 260 );
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
					if ( d2 < 1.6 ) {

						const inv = 1 / ( d2 + 0.05 );
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
			const hold = Math.max( 0, gd - 18 ) * 0.08;
			fx += gx / gd * hold; fy += gy / gd * hold; fz += gz / gd * hold;
			// pull toward the roaming centre (stronger when far)
			const tx = ax - px, ty = ay - py, tz = az - pz;
			const td = Math.sqrt( tx * tx + ty * ty + tz * tz ) + 1e-3;
			const pull = 0.15 + Math.min( td / 140, 2.5 );
			fx += tx / td * pull * 4; fy += ty / td * pull * 4; fz += tz / td * pull * 4;
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
		const count = rng.int( 7, 13 );
		// cross the valley roughly past the viewer
		const ang = rng.range( 0, Math.PI * 2 );
		const dir = new THREE.Vector3( Math.cos( ang ), 0, Math.sin( ang ) );
		const side = new THREE.Vector3( - dir.z, 0, dir.x );
		const pass = camera.position.clone().addScaledVector( side, rng.range( - 150, 150 ) );
		const start = pass.clone().addScaledVector( dir, - 1400 );
		start.y = Math.max( camera.position.y, 0 ) + rng.range( 90, 170 );
		this.flight = { count, dir, side, pos: start, speed: 17, dist: 0, honk: 0 };

	}

	update( dt, time, camera, visible ) {

		this.timer -= dt;
		if ( ! this.flight && this.timer <= 0 && visible ) {

			this._launch( camera );
			this.timer = this.rng.range( 70, 150 );

		}

		const f = this.flight;
		if ( ! f ) {

			this.mesh.count = 0;
			return;

		}

		f.pos.addScaledVector( f.dir, f.speed * dt );
		f.dist += f.speed * dt;
		const ground = this.terrain.heightAt( f.pos.x, f.pos.z );
		if ( f.pos.y < ground + 80 ) f.pos.y += ( ground + 80 - f.pos.y ) * dt * 0.5;
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
		this.mesh.instanceMatrix.needsUpdate = true;
		f.honk -= dt;
		if ( f.honk <= 0 ) {

			this.onHonk( f.pos, f.count );
			f.honk = this.rng.range( 0.4, 2.2 );

		}

		if ( f.dist > 2800 ) this.flight = null;

	}

}

// ---------------------------------------------------------------------------
// Golden eagles riding thermals above the ridges
// ---------------------------------------------------------------------------
export class Eagles {

	constructor( terrain ) {

		this.terrain = terrain;
		const geo = birdGeometry( { body: '#3a2a1c', belly: '#4a3522', wing: '#35271b', span: 1.2, chord: 0.42, tail: 0.18 } );
		this.material = creatureMaterial( { flapSpeed: 3, flapAmp: 0.35, glide: 1 } );
		this.birds = [
			{ c: new THREE.Vector3( - 650, 520, - 900 ), r: 130, w: 0.085, ph: 0 },
			{ c: new THREE.Vector3( 700, 430, - 300 ), r: 95, w: - 0.11, ph: 2 },
		];
		this.mesh = new THREE.InstancedMesh( geo, this.material, this.birds.length );
		this.mesh.frustumCulled = false;
		this.mesh.name = 'eagles';

	}

	update( dt, time, visible ) {

		this.mesh.visible = visible;
		if ( ! visible ) return;
		this.birds.forEach( ( b, i ) => {

			const a = time * b.w + b.ph;
			const drift = new THREE.Vector3( Math.sin( time * 0.011 + i ) * 150, Math.sin( time * 0.05 + i ) * 40, Math.cos( time * 0.009 + i ) * 150 );
			_p.set( b.c.x + Math.cos( a ) * b.r, b.c.y, b.c.z + Math.sin( a ) * b.r ).add( drift );
			const vel = _s.set( - Math.sin( a ) * b.w, 0.01, Math.cos( a ) * b.w ).normalize();
			orient( _p, vel, Math.sign( b.w ) * 0.35, 2.1, _m );
			this.mesh.setMatrixAt( i, _m );

		} );
		this.mesh.instanceMatrix.needsUpdate = true;

	}

}
