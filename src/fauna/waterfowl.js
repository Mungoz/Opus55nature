import * as THREE from 'three';
import { creatureMaterial, PartBuilder } from './creature.js';
import { RNG } from '../core/rng.js';

const M = ( fn ) => fn( new THREE.Matrix4() );

function swanGeometry() {

	const b = new PartBuilder();
	// body: an ellipsoid with a raised, tapering stern
	const body = new THREE.SphereGeometry( 1, 20, 14 );
	const p = body.getAttribute( 'position' );
	for ( let i = 0; i < p.count; i ++ ) {

		let x = p.getX( i ), y = p.getY( i ), z = p.getZ( i );
		x *= 0.34; y *= 0.25; z *= 0.66;
		if ( z < - 0.25 ) y += ( - z - 0.25 ) * 0.55; // stern sweeps upward
		if ( y > 0.05 && Math.abs( z ) < 0.4 ) y += 0.05 * ( 1 - Math.abs( z ) / 0.4 ); // folded wings arch
		if ( y < - 0.12 ) y = - 0.12 + ( y + 0.12 ) * 0.4;
		p.setXYZ( i, x, y + 0.12, z );

	}

	body.computeVertexNormals();
	b.add( body, '#e9e7e1' );
	// S-curved neck
	const curve = new THREE.CatmullRomCurve3( [
		new THREE.Vector3( 0, 0.2, 0.44 ), new THREE.Vector3( 0, 0.46, 0.56 ), new THREE.Vector3( 0, 0.72, 0.46 ), new THREE.Vector3( 0, 0.9, 0.5 ),
	] );
	b.add( new THREE.TubeGeometry( curve, 16, 0.052, 8 ), '#ebe9e3' );
	b.add( new THREE.SphereGeometry( 1, 12, 10 ), '#ecebe6', M( ( m ) => m.makeScale( 0.065, 0.065, 0.11 ).setPosition( 0, 0.92, 0.55 ) ) );
	// orange bill with black knob
	b.add( new THREE.ConeGeometry( 0.032, 0.13, 8 ), '#d5611c', M( ( m ) => m.makeRotationX( Math.PI / 2 + 0.35 ).setPosition( 0, 0.895, 0.66 ) ) );
	b.add( new THREE.SphereGeometry( 0.03, 8, 6 ), '#111111', M( ( m ) => m.makeTranslation( 0, 0.935, 0.615 ) ) );
	for ( const s of [ - 1, 1 ] ) b.add( new THREE.SphereGeometry( 0.012, 6, 4 ), '#050505', M( ( m ) => m.makeTranslation( 0.05 * s, 0.93, 0.59 ) ) );
	return b.build();

}

function mallardGeometry( drake ) {

	const b = new PartBuilder();
	const body = new THREE.SphereGeometry( 1, 16, 12 );
	const p = body.getAttribute( 'position' );
	for ( let i = 0; i < p.count; i ++ ) {

		let x = p.getX( i ) * 0.15, y = p.getY( i ) * 0.11, z = p.getZ( i ) * 0.27;
		if ( z < - 0.12 ) y += ( - z - 0.12 ) * 0.5;
		if ( y < - 0.05 ) y = - 0.05 + ( y + 0.05 ) * 0.4;
		p.setXYZ( i, x, y + 0.05, z );

	}

	body.computeVertexNormals();
	b.add( body, drake ? '#8f8d86' : '#7a5b3c' );
	// chest
	b.add( new THREE.SphereGeometry( 1, 10, 8 ), drake ? '#5a3322' : '#6e5034', M( ( m ) => m.makeScale( 0.12, 0.1, 0.1 ).setPosition( 0, 0.07, 0.17 ) ) );
	// head & neck
	b.add( new THREE.SphereGeometry( 1, 10, 8 ), drake ? '#12402a' : '#6a4e33', M( ( m ) => m.makeScale( 0.065, 0.07, 0.085 ).setPosition( 0, 0.2, 0.22 ) ) );
	if ( drake ) b.add( new THREE.CylinderGeometry( 0.05, 0.05, 0.012, 10 ), '#f0f0f0', M( ( m ) => m.makeTranslation( 0, 0.14, 0.215 ) ) );
	b.add( new THREE.BoxGeometry( 0.045, 0.014, 0.075 ), drake ? '#c9b43a' : '#c07a2a', M( ( m ) => m.makeTranslation( 0, 0.19, 0.3 ) ) );
	b.add( new THREE.ConeGeometry( 0.05, 0.08, 6 ), drake ? '#1a1a1a' : '#5d432a', M( ( m ) => m.makeRotationX( - Math.PI / 2 - 0.5 ).setPosition( 0, 0.11, - 0.3 ) ) );
	return b.build();

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
		const swanA = new Paddler( mk( swanGeo, 1.35 ), - 40, 260, 0.45, rng );
		const swanB = new Paddler( mk( swanGeo, 1.25 ), - 44, 265, 0.45, rng, swanA, new THREE.Vector3( - 2.4, 0, - 2.2 ) );
		this.birds.push( swanA, swanB );
		const lead = new Paddler( mk( drakeGeo, 1 ), 90, 330, 0.55, rng );
		this.birds.push( lead );
		for ( let i = 0; i < 4; i ++ ) {

			const off = new THREE.Vector3( rng.range( - 3, 3 ), 0, - 1.5 - i * 1.3 );
			this.birds.push( new Paddler( mk( i % 2 ? drakeGeo : henGeo, 1 ), 90 + off.x, 330 + off.z, 0.55, rng, lead, off ) );

		}

	}

	_pickTarget( b ) {

		for ( let tries = 0; tries < 30; tries ++ ) {

			const x = b.pos.x + this.rng.range( - 160, 160 );
			const z = b.pos.z + this.rng.range( - 160, 160 );
			// stay within the southern half of the lake where people will watch them
			if ( z > 420 || z < - 700 ) continue;
			if ( this.terrain.heightAt( x, z ) < - 1.8 ) {

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
