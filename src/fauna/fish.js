import * as THREE from 'three';
import { creatureMaterial, PartBuilder, MAT } from './creature.js';
import { RNG } from '../core/rng.js';

// Rainbow trout: lathe body along +z with tail and fins.
// Rainbow trout (or, with minnow = true, a silvery minnow).
export function troutGeometry( minnow = false ) {

	const b = new PartBuilder();
	const prof = [];
	for ( let i = 0; i <= 16; i ++ ) {

		const t = i / 16;
		const r = Math.sin( Math.PI * Math.pow( t, 0.8 ) ) * 0.055 * ( 1 - 0.35 * t );
		prof.push( new THREE.Vector2( Math.max( r, 0.002 ), t * 0.46 - 0.23 ) );

	}

	const body = new THREE.LatheGeometry( prof, 14 );
	body.rotateX( - Math.PI / 2 );
	body.scale( 0.8, 1.15, 1 );
	body.computeVertexNormals();
	// colour by height: olive back, pink lateral band, silver belly
	const nb = body.toNonIndexed();
	const pos = nb.getAttribute( 'position' );
	const colors = [];
	const back = new THREE.Color( minnow ? '#4a4f3c' : '#3b4a2c' ), band = new THREE.Color( minnow ? '#b9bcb4' : '#b86a6a' ), belly = new THREE.Color( minnow ? '#e6e6de' : '#d8d8cf' );
	for ( let i = 0; i < pos.count; i ++ ) {

		const y = pos.getY( i ) / 0.063;
		const c = y > 0.3 ? back.clone() : ( y > - 0.2 ? band.clone().lerp( back, ( y + 0.2 ) / 0.5 * 0.4 ) : belly.clone() );
		if ( ! minnow && y > 0 && Math.sin( pos.getZ( i ) * 180 ) * Math.sin( pos.getX( i ) * 150 ) > 0.85 ) c.multiplyScalar( 0.3 ); // spots
		c.convertSRGBToLinear();
		colors.push( c.r, c.g, c.b );

	}

	b.add( nb, '#ffffff', null, 0, MAT.SCALES );
	b.parts[ b.parts.length - 1 ].setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );
	// tail, dorsal and pectoral fins
	b.tris( [ [ 0, 0, - 0.2 ], [ 0, 0.06, - 0.31 ], [ 0, - 0.06, - 0.31 ] ], '#4a4f35' );
	b.tris( [ [ 0, 0.05, 0.02 ], [ 0, 0.09, - 0.04 ], [ 0, 0.045, - 0.07 ] ], '#4a4f35' );
	b.tris( [ [ 0.03, - 0.03, 0.1 ], [ 0.07, - 0.05, 0.05 ], [ 0.03, - 0.035, 0.05 ], [ - 0.03, - 0.03, 0.1 ], [ - 0.03, - 0.035, 0.05 ], [ - 0.07, - 0.05, 0.05 ] ], '#9a8a70' );
	return b.build();

}

// Trout leap clear of the water at intervals, with rings and a splash.
export class LeapingFish {

	constructor( terrain, water, particles, onSplash = () => {} ) {

		this.terrain = terrain;
		this.water = water;
		this.particles = particles;
		this.onSplash = onSplash;
		this.rng = new RNG( 314 );
		this.material = creatureMaterial( { wag: 0.025, wagSpeed: 22 } );
		this.mesh = new THREE.Mesh( troutGeometry(), this.material );
		this.mesh.visible = false;
		this.mesh.castShadow = true;
		this.mesh.name = 'trout';
		this.timer = 5;
		this.jump = null;
		this._fwd = new THREE.Vector3();

	}

	// director hook: a leap at a chosen spot
	forceJump( x, z, dir, v0 = 4.2, speed = 1.8, s = 1.35 ) {

		this.jump = { x, z, dir, v0, t: 0, T: 2 * v0 / 9.81, speed, s };
		this.water.addRipple( x, z, 0.9 );
		this.particles?.splash( new THREE.Vector3( x, 0, z ), 14, 1.4 );
		this.timer = 1e9;

	}

	_start( camera ) {

		camera.getWorldDirection( this._fwd );
		for ( let tries = 0; tries < 40; tries ++ ) {

			const d = this.rng.range( 18, 140 );
			const a = Math.atan2( this._fwd.x, this._fwd.z ) + this.rng.range( - 0.7, 0.7 );
			const x = camera.position.x + Math.sin( a ) * d, z = camera.position.z + Math.cos( a ) * d;
			if ( this.terrain.heightAt( x, z ) > - 2.5 ) continue;
			const dir = this.rng.next() * Math.PI * 2;
			const v0 = this.rng.range( 3.2, 4.6 );
			this.jump = { x, z, dir, v0, t: 0, T: 2 * v0 / 9.81, speed: this.rng.range( 1.2, 2.2 ), s: this.rng.range( 0.9, 1.5 ) };
			this.water.addRipple( x, z, 0.9 );
			this.particles?.splash( new THREE.Vector3( x, 0, z ), 14, 1.4 );
			this.onSplash( new THREE.Vector3( x, 0, z ), 0.6 );
			return;

		}

	}

	update( dt, camera, active ) {

		if ( ! this.jump ) {

			this.mesh.visible = false;
			this.timer -= dt;
			if ( this.timer <= 0 && active ) {

				this._start( camera );
				this.timer = this.rng.range( 6, 20 );

			}

			return;

		}

		const j = this.jump;
		j.t += dt;
		const t = j.t;
		const dx = Math.sin( j.dir ), dz = Math.cos( j.dir );
		const y = j.v0 * t - 4.905 * t * t;
		const vy = j.v0 - 9.81 * t;
		this.mesh.visible = true;
		this.mesh.position.set( j.x + dx * j.speed * t, y - 0.05, j.z + dz * j.speed * t );
		this.mesh.rotation.set( - Math.atan2( vy, j.speed ), j.dir, Math.sin( t * 30 ) * 0.25, 'YXZ' );
		this.mesh.scale.setScalar( j.s * ( 1 + Math.sin( t * 25 ) * 0.03 ) );
		if ( t >= j.T ) {

			const px = this.mesh.position.x, pz = this.mesh.position.z;
			this.water.addRipple( px, pz, 1.3 );
			this.water.addRipple( px, pz, 0.6, 0.35 );
			this.particles?.splash( new THREE.Vector3( px, 0, pz ), 26, 2.4 );
			this.onSplash( new THREE.Vector3( px, 0, pz ), 1 );
			this.jump = null;

		}

	}

}
