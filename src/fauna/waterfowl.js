import * as THREE from 'three';
import { creatureMaterial } from './creature.js';
import { swanGeometry, swanEyes, mallardGeometry, mallardEyes } from './swanModel.js';
import { RNG } from '../core/rng.js';

// A bird paddling about the lake, wandering between deep-water waypoints.
class Paddler {

	constructor( mesh, x, z, speed, rng, leader = null, offset = null ) {

		this.mesh = mesh;
		this.pos = new THREE.Vector3( x, 0, z );
		this.heading = rng.next() * Math.PI * 2;
		this.speed = speed;
		this.rng = rng;
		this.target = new THREE.Vector3( x, 0, z );
		this.leader = leader;
		this.offset = offset;
		this.wake = 0;
		this.dabble = 0;
		this.pause = 0;
		this.phase = rng.next() * 10;

	}

}

export class Waterfowl {

	constructor( terrain, water ) {

		this.terrain = terrain;
		this.water = water;
		this.rng = new RNG( 23 );
		this.material = creatureMaterial();
		this.group = new THREE.Group();
		this.group.name = 'waterfowl';
		const swanGeo = swanGeometry();
		const drakeGeo = mallardGeometry( true ), henGeo = mallardGeometry( false );
		this.birds = [];
		const mk = ( geo, s ) => {

			const m = new THREE.Mesh( geo, this.material );
			m.scale.setScalar( s );
			m.castShadow = true;
			this.group.add( m );
			return m;

		};

		const rng = this.rng;
		const swanMesh = ( s ) => {

			const m = mk( swanGeo, s );
			m.add( swanEyes( this.material ) );
			return m;

		};

		const swanA = new Paddler( swanMesh( 1.0 ), - 30, 395, 0.45, rng );
		const swanB = new Paddler( swanMesh( 0.93 ), - 34, 400, 0.45, rng, swanA, new THREE.Vector3( - 2.4, 0, - 2.2 ) );
		this.birds.push( swanA, swanB );
		const duck = ( g ) => {

			const m = mk( g, 1 );
			m.add( mallardEyes( this.material ) );
			return m;

		};

		const lead = new Paddler( duck( drakeGeo ), 40, 420, 0.55, rng );
		this.birds.push( lead );
		for ( let i = 0; i < 4; i ++ ) {

			const off = new THREE.Vector3( rng.range( - 3, 3 ), 0, - 1.5 - i * 1.3 );
			this.birds.push( new Paddler( duck( i % 2 ? drakeGeo : henGeo ), 40 + off.x, 420 + off.z, 0.55, rng, lead, off ) );

		}

	}

	_pickTarget( b ) {

		for ( let tries = 0; tries < 30; tries ++ ) {

			const x = b.pos.x + this.rng.range( - 70, 70 );
			const z = b.pos.z + this.rng.range( - 70, 70 );
			// keep to the bay in front of the start, where people will see them
			if ( z > 448 || z < 290 || Math.abs( x + 5 ) > 160 ) continue;
			if ( this.terrain.heightAt( x, z ) < - 1.2 ) {

				b.target.set( x, 0, z );
				return;

			}

		}

	}

	update( dt, time ) {

		for ( const b of this.birds ) {

			let desired;
			if ( b.leader ) {

				// follow the leader, holding a loose station behind it
				const c = Math.cos( b.leader.heading ), s = Math.sin( b.leader.heading );
				const tx = b.leader.pos.x + b.offset.x * c + b.offset.z * s;
				const tz = b.leader.pos.z - b.offset.x * s + b.offset.z * c;
				const dx = tx - b.pos.x, dz = tz - b.pos.z;
				const d = Math.hypot( dx, dz );
				desired = Math.atan2( dx, dz );
				b.speed = THREE.MathUtils.clamp( d * 0.35, 0, 0.9 );

			} else {

				if ( b.pos.distanceTo( b.target ) < 6 ) {

					this._pickTarget( b );
					b.pause = this.rng.next() < 0.4 ? this.rng.range( 3, 12 ) : 0;

				}

				desired = Math.atan2( b.target.x - b.pos.x, b.target.z - b.pos.z );
				if ( b.pause > 0 ) b.pause -= dt;

			}

			let dh = desired - b.heading;
			dh = Math.atan2( Math.sin( dh ), Math.cos( dh ) );
			b.heading += THREE.MathUtils.clamp( dh, - 0.5 * dt, 0.5 * dt );
			const spd = b.leader ? b.speed : ( b.pause > 0 ? 0.05 : b.speed );
			b.pos.x += Math.sin( b.heading ) * spd * dt;
			b.pos.z += Math.cos( b.heading ) * spd * dt;
			// never beach: turn back if the water gets shallow
			if ( this.terrain.heightAt( b.pos.x, b.pos.z ) > - 0.6 ) {

				b.pos.x -= Math.sin( b.heading ) * spd * dt * 2;
				b.pos.z -= Math.cos( b.heading ) * spd * dt * 2;
				b.heading += Math.PI * 0.5 * dt;
				if ( ! b.leader ) this._pickTarget( b );

			}

			// ducks up-end to feed now and then
			if ( b.dabble <= 0 && ! b.pause && b.mesh.scale.x < 1.1 && this.rng.next() < dt * 0.04 ) b.dabble = 2.5;
			let pitch = 0;
			if ( b.dabble > 0 ) {

				b.dabble -= dt;
				pitch = Math.sin( Math.min( 1, ( 2.5 - b.dabble ) / 0.4 ) * Math.PI * 0.5 ) * 1.25 * Math.min( 1, b.dabble / 0.3 );

			}

			const bob = Math.sin( time * 1.4 + b.phase ) * 0.012;
			b.mesh.position.set( b.pos.x, bob - 0.02, b.pos.z );
			b.mesh.rotation.set( pitch + Math.sin( time * 1.1 + b.phase ) * 0.03, b.heading, Math.sin( time * 0.9 + b.phase ) * 0.03, 'YXZ' );

			// wake: rings shed from the stern while moving
			b.wake -= dt;
			if ( b.wake <= 0 && spd > 0.12 ) {

				const s = b.mesh.scale.x;
				this.water.addRipple( b.pos.x - Math.sin( b.heading ) * 0.4 * s, b.pos.z - Math.cos( b.heading ) * 0.4 * s, 0.22 * s );
				b.wake = 0.55;

			}

			if ( pitch > 0.6 && this.rng.next() < dt * 2 ) this.water.addRipple( b.pos.x + Math.sin( b.heading ) * 0.3, b.pos.z + Math.cos( b.heading ) * 0.3, 0.3 );

		}

	}

	positions() {

		return this.birds.map( ( b ) => b.pos );

	}

}
