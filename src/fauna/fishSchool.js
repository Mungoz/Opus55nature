import * as THREE from 'three';
import { creatureMaterial } from './creature.js';
import { troutGeometry } from './fish.js';
import { RNG } from '../core/rng.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// Fish holding in the clear shallows: a shoal of minnows and a few trout
// cruising the drop-off. They keep to a depth band and scatter from a viewer
// who comes close to the water.
class Group {

	constructor( { count, scale, speed, depth, home, radius, rng, wag, wagSpeed, cohesion, terrain } ) {

		this.n = count;
		this.scale = scale;
		this.speed = speed;
		this.depth = depth;
		this.home = home;
		this.radius = radius;
		this.cohesion = cohesion;
		this.terrain = terrain;
		// search outward for water of the right depth to call home
		const want = ( depth[ 0 ] + depth[ 1 ] ) * 0.5;
		let best = null, bestErr = 1e9;
		for ( let r = 0; r < 160 && bestErr > 0.2; r += 4 ) {

			for ( let k = 0; k < 16; k ++ ) {

				const a = k / 16 * Math.PI * 2;
				const x = home.x + Math.cos( a ) * r, z = home.y + Math.sin( a ) * r;
				const err = Math.abs( - terrain.heightAt( x, z ) - want );
				if ( err < bestErr ) {

					bestErr = err;
					best = new THREE.Vector2( x, z );

				}

			}

		}

		this.home = home = best;
		this.pos = [];
		this.vel = [];
		for ( let i = 0; i < count; i ++ ) {

			const a = rng.next() * Math.PI * 2, r = rng.next() * ( cohesion > 1 ? 1.5 : radius * 0.4 );
			this.pos.push( new THREE.Vector3( home.x + Math.cos( a ) * r, - 0.5, home.y + Math.sin( a ) * r ) );
			this.vel.push( new THREE.Vector3( Math.cos( a ), 0, Math.sin( a ) ).multiplyScalar( speed ) );

		}

		this.material = creatureMaterial( { wag, wagSpeed } );
		this.mesh = new THREE.InstancedMesh( troutGeometry( count > 20 ), this.material, count );
		this.mesh.frustumCulled = false;
		this.wander = new THREE.Vector2( home.x, home.y );
		this.t = rng.next() * 100;

	}

	update( dt, camera ) {

		this.t += dt;
		const P = this.pos, V = this.vel;
		// the group's goal drifts around its home water
		this.wander.set( this.home.x + Math.sin( this.t * 0.07 ) * this.radius * 0.6, this.home.y + Math.cos( this.t * 0.053 ) * this.radius * 0.6 );
		const cam = camera.position;
		const nearWater = cam.y < 6;
		let mx = 0, mz = 0;
		for ( const p of P ) {

			mx += p.x;
			mz += p.z;

		}

		mx /= this.n;
		mz /= this.n;
		for ( let i = 0; i < this.n; i ++ ) {

			const p = P[ i ], v = V[ i ];
			let fx = 0, fz = 0;
			let cx = 0, cz = 0, ax = 0, az = 0, cnt = 0;
			for ( let j = 0; j < this.n; j ++ ) {

				if ( j === i ) continue;
				const dx = P[ j ].x - p.x, dz = P[ j ].z - p.z;
				const d2 = dx * dx + dz * dz;
				if ( d2 > 9 ) continue;
				const sep = this.scale * this.scale * 4.0;
				if ( d2 < sep ) {

					fx -= dx / ( d2 + 0.01 ) * 0.25;
					fz -= dz / ( d2 + 0.01 ) * 0.25;

				}

				cx += dx; cz += dz; ax += V[ j ].x; az += V[ j ].z; cnt ++;

			}

			if ( cnt ) {

				fx += cx / cnt * this.cohesion + ( ax / cnt - v.x ) * 1.2;
				fz += cz / cnt * this.cohesion + ( az / cnt - v.z ) * 1.2;

			}

			fx += ( this.wander.x - p.x ) * 0.05;
			fz += ( this.wander.y - p.z ) * 0.05;
			if ( this.cohesion > 1 ) {

				// a shoal moves as one body
				fx += ( mx - p.x ) * 0.3;
				fz += ( mz - p.z ) * 0.3;

			}
			// stay in the depth band: probe ahead and turn away from the shallows or the deep
			const lx = p.x + v.x * 0.8, lz = p.z + v.z * 0.8;
			const depth = - this.terrain.heightAt( lx, lz );
			if ( depth < this.depth[ 0 ] || depth > this.depth[ 1 ] ) {

				const gx = this.terrain.heightAt( p.x + 0.5, p.z ) - this.terrain.heightAt( p.x - 0.5, p.z );
				const gz = this.terrain.heightAt( p.x, p.z + 0.5 ) - this.terrain.heightAt( p.x, p.z - 0.5 );
				const s = depth < this.depth[ 0 ] ? - 6 : 6;
				fx += gx * s;
				fz += gz * s;

			}

			// bolt from a person at the water's edge
			const ex = p.x - cam.x, ez = p.z - cam.z;
			const ed2 = ex * ex + ez * ez;
			let flee = 0;
			if ( nearWater && ed2 < 64 ) {

				flee = 1 - ed2 / 64;
				fx += ex / Math.sqrt( ed2 + 0.01 ) * flee * 18;
				fz += ez / Math.sqrt( ed2 + 0.01 ) * flee * 18;

			}

			v.x += fx * dt;
			v.z += fz * dt;
			const sp = Math.hypot( v.x, v.z ) + 1e-4;
			const target = this.speed * ( 1 + flee * 3 ) * ( 0.7 + 0.3 * Math.sin( this.t * 1.7 + i ) );
			const k = Math.min( Math.max( sp, target * 0.4 ), target * 1.6 ) / sp;
			v.x *= k;
			v.z *= k;
			p.x += v.x * dt;
			p.z += v.z * dt;
			let bed = this.terrain.heightAt( p.x, p.z );
			if ( bed > - 0.08 ) {

				// stranded: slip back toward home water
				p.x += ( this.home.x - p.x ) * 0.2;
				p.z += ( this.home.y - p.z ) * 0.2;
				bed = this.terrain.heightAt( p.x, p.z );

			}
			// small fish hang just under the surface film; trout cruise mid-water
			const yTarget = Math.max( bed + 0.12, Math.min( - 0.1, this.scale < 0.5 ? - 0.18 : bed * 0.45 ) );
			p.y += ( yTarget - p.y ) * Math.min( 1, dt * 2 );
			_e.set( 0, Math.atan2( v.x, v.z ), 0 );
			_q.setFromEuler( _e );
			_m.compose( _p.copy( p ), _q, _s.setScalar( this.scale ) );
			this.mesh.setMatrixAt( i, _m );

		}

		this.mesh.instanceMatrix.needsUpdate = true;

	}

}

export class Shallows {

	constructor( terrain ) {

		const rng = new RNG( 404 );
		this.group = new THREE.Group();
		this.group.name = 'fish';
		this.groups = [
			new Group( { count: 42, scale: 0.4, speed: 0.5, depth: [ 0.3, 1.4 ], home: new THREE.Vector2( - 30, 468 ), radius: 22, rng, wag: 0.012, wagSpeed: 16, cohesion: 3.5, terrain } ),
			new Group( { count: 36, scale: 0.36, speed: 0.45, depth: [ 0.3, 1.4 ], home: new THREE.Vector2( 60, 450 ), radius: 20, rng, wag: 0.012, wagSpeed: 16, cohesion: 3.5, terrain } ),
			new Group( { count: 5, scale: 1.1, speed: 0.35, depth: [ 0.8, 2.6 ], home: new THREE.Vector2( 0, 430 ), radius: 60, rng, wag: 0.02, wagSpeed: 6, cohesion: 0.05, terrain } ),
		];
		for ( const g of this.groups ) this.group.add( g.mesh );

	}

	update( dt, camera ) {

		// only simulate when someone could see them
		const c = camera.position;
		if ( Math.hypot( c.x - 0, c.z - 450 ) > 350 ) return;
		for ( const g of this.groups ) g.update( dt, camera );

	}

}
