import * as THREE from 'three';

// A slow, looping cinematic flight through hand-picked viewpoints.
const KEYS = [
	// [ position ], [ look-at ] - all within the valley and under the flying ceiling
	[ [ 30, 3.2, 560 ], [ - 20, 40, - 900 ] ],
	[ [ - 55, 2.2, 478 ], [ - 90, 4, - 520 ] ],
	[ [ - 150, 4, 300 ], [ - 90, 6, - 520 ] ],
	[ [ - 60, 8, - 150 ], [ - 120, 900, - 3350 ] ],
	[ [ 20, 18, - 520 ], [ - 120, 1100, - 3350 ] ],
	[ [ 120, 60, - 480 ], [ 0, 10, - 100 ] ],
	[ [ 190, 140, - 100 ], [ - 60, 60, 300 ] ],
	[ [ 160, 50, 300 ], [ 0, 4, - 200 ] ],
	[ [ 110, 6, 470 ], [ - 40, 30, - 700 ] ],
];

export class Tour {

	constructor( camera, terrain ) {

		this.camera = camera;
		this.terrain = terrain;
		const pts = KEYS.map( ( k ) => new THREE.Vector3( ...k[ 0 ] ) );
		const tgs = KEYS.map( ( k ) => new THREE.Vector3( ...k[ 1 ] ) );
		this.path = new THREE.CatmullRomCurve3( pts, true, 'centripetal', 0.5 );
		this.look = new THREE.CatmullRomCurve3( tgs, true, 'centripetal', 0.5 );
		this.duration = KEYS.length * 17;
		this.t = 0;
		this.active = false;
		this._p = new THREE.Vector3();
		this._l = new THREE.Vector3();
		this._m = new THREE.Matrix4();
		this._q = new THREE.Quaternion();

	}

	start() {

		this.active = true;
		this.t = 0;
		this._blend = 0;
		this._from = this.camera.quaternion.clone();
		this._fromP = this.camera.position.clone();

	}

	stop() {

		this.active = false;

	}

	update( dt ) {

		if ( ! this.active ) return;
		this.t = ( this.t + dt / this.duration ) % 1;
		// ease between keys so the camera lingers at each view
		const n = KEYS.length;
		const seg = this.t * n;
		const i = Math.floor( seg );
		const f = seg - i;
		const e = f * f * ( 3 - 2 * f );
		const u = ( i + THREE.MathUtils.lerp( f, e, 0.55 ) ) / n;
		this.path.getPointAt( u, this._p );
		this.look.getPointAt( u, this._l );
		const g = this.terrain.heightAt( this._p.x, this._p.z );
		this._p.y = Math.max( this._p.y, Math.max( g, 0 ) + 1.4 );
		this._m.lookAt( this._p, this._l, THREE.Object3D.DEFAULT_UP );
		this._q.setFromRotationMatrix( this._m );
		// glide in from wherever the viewer was
		this._blend = Math.min( 1, this._blend + dt / 3 );
		const b = this._blend * this._blend * ( 3 - 2 * this._blend );
		this.camera.position.lerpVectors( this._fromP, this._p, b );
		this.camera.quaternion.slerpQuaternions( this._from, this._q, b );

	}

}
