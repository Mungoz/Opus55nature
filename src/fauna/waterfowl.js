import * as THREE from 'three';
import { creatureMaterial } from './creature.js';
import { swanGeometry, swanEyes, mallardGeometry, mallardEyes } from './swanModel.js';
import { RNG } from '../core/rng.js';
import { U } from '../core/uniforms.js';

// Swell on the lake: a few travelling waves, so birds near each other rise and fall
// together. Returns [ height, dh/dx, dh/dz ].
const WAVES = [ [ 0.9, 0.32, 1.9, 0.0 ], [ 1.7, - 0.55, 2.6, 1.3 ], [ 0.4, 1.3, 3.3, 2.1 ], [ - 1.2, 0.8, 2.2, 4.0 ] ];
function swell( x, z, t, amp ) {

	let h = 0, dx = 0, dz = 0;
	for ( const [ kx, kz, w, ph ] of WAVES ) {

		const a = amp / Math.hypot( kx, kz );
		const arg = kx * x + kz * z - w * t + ph;
		h += a * Math.sin( arg );
		dx += a * kx * Math.cos( arg );
		dz += a * kz * Math.cos( arg );

	}

	return [ h, dx, dz ];

}

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
		// buoyancy: the body is a damped spring riding the swell, so it lags and overshoots
		this.y = 0; this.vy = 0;
		this.pitch = 0; this.vp = 0;
		this.roll = 0; this.vr = 0;
		this.turn = 0;
		this.stroke = rng.next();

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

		// mallards: a party in front of the start, another in the west bay, a pair by the mouth
		for ( const [ x, z, n ] of [ [ 14, 436, 5 ], [ - 70, 425, 7 ], [ 52, 418, 2 ] ] ) {

			const lead = new Paddler( duck( drakeGeo ), x, z, 0.55, rng );
			this.birds.push( lead );
			for ( let i = 0; i < n - 1; i ++ ) {

				const off = new THREE.Vector3( rng.range( - 3, 3 ), 0, - 1.5 - i * 1.3 );
				this.birds.push( new Paddler( duck( i % 2 ? drakeGeo : henGeo ), x + off.x, z + off.z, 0.55, rng, lead, off ) );

			}

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
			const turnRate = THREE.MathUtils.clamp( dh, - 0.5 * dt, 0.5 * dt );
			b.heading += turnRate;
			b.turn += ( turnRate / Math.max( dt, 1e-4 ) - b.turn ) * Math.min( 1, dt * 3 );
			let spd = b.leader ? b.speed : ( b.pause > 0 ? 0.05 : b.speed );
			// paddling comes in strokes: the bird surges forward and settles back each one
			const big = b.mesh.scale.x > 1.1 || b.mesh.scale.x > 0.9 && b.speed < 0.5;
			const rate = big ? 0.9 : 1.8;
			b.stroke += dt * rate * ( 0.3 + Math.min( 1, spd / 0.4 ) );
			const surge = Math.sin( b.stroke * Math.PI * 2 );
			spd *= 1 + 0.35 * surge * Math.min( 1, spd / 0.2 );
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
			if ( b.dabble <= 0 && ! b.pause && b.mesh.scale.x < 1.1 && this.rng.next() < dt * 0.04 ) {

				b.dabble = this.rng.range( 2.2, 4.5 );
				b.dabbleLen = b.dabble;
				this.water.addRipple( b.pos.x + Math.sin( b.heading ) * 0.25, b.pos.z + Math.cos( b.heading ) * 0.25, 0.35 );

			}

			let pitch = 0;
			if ( b.dabble > 0 ) {

				b.dabble -= dt;
				const into = Math.min( 1, ( b.dabbleLen - b.dabble ) / 0.35 ), out = Math.min( 1, b.dabble / 0.3 );
				pitch = Math.sin( into * Math.PI * 0.5 ) * 1.55 * out;
				if ( b.dabble <= 0 ) this.water.addRipple( b.pos.x, b.pos.z, 0.3 );

			}

			// ride the swell: the targets come from the wave surface under the bird, the
			// body follows them on springs (heavier birds respond more slowly)
			const wind = U.uWind.value.z;
			const [ wh, wx, wz ] = swell( b.pos.x, b.pos.z, time, 0.008 + 0.02 * wind );
			const fx = Math.sin( b.heading ), fz = Math.cos( b.heading );
			const slopeFwd = wx * fx + wz * fz, slopeSide = wx * fz - wz * fx;
			const k = big ? 14 : 30, c = big ? 5 : 7;
			const spring = ( x, v, target ) => {

				v += ( ( target - x ) * k - v * c ) * dt;
				return [ x + v * dt, v ];

			};

			[ b.y, b.vy ] = spring( b.y, b.vy, wh + ( b.dabble > 0 ? - 0.03 : 0 ) + surge * 0.003 * Math.min( 1, spd / 0.2 ) );
			// nose dips a touch on each stroke; leans into turns
			[ b.pitch, b.vp ] = spring( b.pitch, b.vp, - Math.atan( slopeFwd ) + pitch - surge * 0.02 * Math.min( 1, spd / 0.2 ) );
			[ b.roll, b.vr ] = spring( b.roll, b.vr, Math.atan( slopeSide ) - b.turn * ( big ? 0.4 : 0.2 ) );
			// the tail wags while up-ended, and now and then a shake of the feathers
			let wag = 0;
			if ( pitch > 0.8 ) wag = Math.sin( time * 9 + b.phase ) * 0.06;
			const shake = Math.max( 0, Math.sin( time * 0.13 + b.phase * 3 ) - 0.985 ) * 40;
			wag += Math.sin( time * 38 ) * 0.05 * shake;
			b.mesh.position.set( b.pos.x, b.y - 0.02, b.pos.z );
			b.mesh.rotation.set( b.pitch, b.heading + wag * 0.5 + Math.sin( b.stroke * Math.PI * 2 ) * 0.015 * Math.min( 1, spd / 0.2 ), b.roll + wag, 'YXZ' );

			// wake: rings shed from the stern while moving
			b.wake -= dt;
			if ( b.wake <= 0 && spd > 0.12 ) {

				const s = b.mesh.scale.x;
				this.water.addRipple( b.pos.x - Math.sin( b.heading ) * 0.4 * s, b.pos.z - Math.cos( b.heading ) * 0.4 * s, 0.22 * s );
				b.wake = 0.55;

			}

			if ( pitch > 0.6 && this.rng.next() < dt * 1.2 ) this.water.addRipple( b.pos.x + Math.sin( b.heading ) * 0.3, b.pos.z + Math.cos( b.heading ) * 0.3, 0.3 );

		}

	}

	positions() {

		return this.birds.map( ( b ) => b.pos );

	}

}
