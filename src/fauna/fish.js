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

	// A leap: the trout drives up from below, breaks the surface at ~50 degrees,
	// flies a ballistic arc with its nose on the tangent, rolls and thrashes, and
	// re-enters head first. peak = apex height of the body centre above water.
	_launch( x, z, dir, peak, vh, s ) {

		const y0 = - 0.4;
		const vy = Math.sqrt( 2 * 9.81 * ( peak - y0 ) );
		this.jump = { x, z, dir, vy, vh, s, y0, t: 0, exited: false, entered: false, roll: this.rng.next() < 0.5 ? - 1 : 1 };
		// until the body is back down at its starting depth, plus a moment to vanish
		this.jump.T = 2 * vy / 9.81 + 0.1;

	}

	// director hook: a leap at a chosen spot
	forceJump( x, z, dir, peak = 0.45, vh = 2.6, s = 1.25 ) {

		this._launch( x, z, dir, peak, vh, s );
		this.timer = 1e9;

	}

	_start( camera ) {

		camera.getWorldDirection( this._fwd );
		for ( let tries = 0; tries < 40; tries ++ ) {

			const d = this.rng.range( 14, 75 );
			const a = Math.atan2( this._fwd.x, this._fwd.z ) + this.rng.range( - 0.7, 0.7 );
			const x = camera.position.x + Math.sin( a ) * d, z = camera.position.z + Math.cos( a ) * d;
			if ( this.terrain.heightAt( x, z ) > - 2.5 ) continue;
			this._launch( x, z, this.rng.next() * Math.PI * 2, this.rng.range( 0.3, 0.6 ), this.rng.range( 2.1, 3.0 ), this.rng.range( 0.95, 1.35 ) );
			return;

		}

	}

	update( dt, camera, active ) {

		if ( ! this.jump ) {

			this.mesh.visible = false;
			this.timer -= dt;
			if ( this.timer <= 0 && active ) {

				this._start( camera );
				this.timer = this.rng.range( 4, 12 );

			}

			return;

		}

		const j = this.jump;
		j.t += dt;
		const t = j.t;
		const dx = Math.sin( j.dir ), dz = Math.cos( j.dir );
		const y = j.y0 + j.vy * t - 4.905 * t * t;
		const vy = j.vy - 9.81 * t;
		const px = j.x + dx * j.vh * t, pz = j.z + dz * j.vh * t;
		this.mesh.visible = true;
		this.mesh.position.set( px, y, pz );
		const airborne = y > - 0.05;
		// roll builds toward the apex and unwinds for a head-first entry
		const air = j.exited && ! j.entered ? Math.min( 1, ( t - j.tExit ) / Math.max( j.airTime, 0.1 ) ) : 0;
		const roll = j.roll * Math.sin( air * Math.PI ) * 0.7;
		this.mesh.rotation.set( - Math.atan2( vy, j.vh ), j.dir, roll, 'YXZ' );
		this.mesh.scale.setScalar( j.s );
		// the body flexes hard in the air, a steady beat underwater
		this.material.uniforms.uWag.value = airborne ? 0.07 : 0.035;
		this.material.uniforms.uWagSpeed.value = airborne ? 34 : 24;
		const at = new THREE.Vector3( px, 0, pz );
		if ( ! j.exited && y > - 0.05 && vy > 0 ) {

			j.exited = true;
			j.tExit = t;
			j.airTime = 2 * vy / 9.81;
			this.water.addRipple( px, pz, 1.0 );
			this.particles?.splash( at, 30, 1.6, 1.3 );
			this.onSplash( at, 0.5 );

		}

		if ( airborne && air < 0.5 && this.particles ) {

			// water streams off the tail
			const tail = new THREE.Vector3( px - dx * 0.25 * j.s, y - 0.04, pz - dz * 0.25 * j.s );
			this.particles.drip( tail, new THREE.Vector3( dx * j.vh * 0.4, vy * 0.3, dz * j.vh * 0.4 ), 2 );

		}

		if ( j.exited && ! j.entered && y < - 0.02 && vy < 0 ) {

			j.entered = true;
			this.water.addRipple( px, pz, 1.4 );
			this.water.addRipple( px, pz, 0.7, 0.3 );
			this.particles?.splash( at, 46, 2.3, 1.6 );
			this.onSplash( at, 1 );

		}

		if ( t >= j.T ) {

			this.jump = null;
			this.mesh.visible = false;
			this.material.uniforms.uWag.value = 0.035;

		}

	}

}

