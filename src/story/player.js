import * as THREE from 'three';
import { Sculpt, noise3 } from '../fauna/sdf.js';
import { creatureMaterial } from '../fauna/creature.js';
import { HIDDEN } from './figure.js';

// You: never seen directly (you are the camera), only in water - in puddles, the tarn, the
// lake beside the boat. Someone from the village who has rowed over to fetch J. home: a waxed
// cotton jacket, a knitted cap, dark trousers, walking boots. Rigged like the figure, and posed
// from what the camera does: standing, walking in step with the view's bob, sitting and
// rowing in the boat.

const C = ( hex ) => new THREE.Color( hex );

function sculpt() {

	const S = new Sculpt();
	S.bone( 'root', [ 0, 0, 0 ] );
	S.bone( 'pelvis', [ 0, 0.95, 0 ], 'root' );
	S.bone( 'chest', [ 0, 1.28, 0 ], 'pelvis' );
	S.bone( 'neck', [ 0, 1.52, 0.01 ], 'chest' );
	S.bone( 'head', [ 0, 1.61, 0.02 ], 'neck' );
	for ( const [ s, n ] of [ [ - 1, 'L' ], [ 1, 'R' ] ] ) {

		S.bone( 'arm' + n, [ s * 0.2, 1.45, 0 ], 'chest' );
		S.bone( 'fore' + n, [ s * 0.23, 1.17, - 0.01 ], 'arm' + n );
		S.bone( 'hand' + n, [ s * 0.24, 0.92, 0.01 ], 'fore' + n );
		S.bone( 'thigh' + n, [ s * 0.1, 0.92, 0 ], 'pelvis' );
		S.bone( 'shin' + n, [ s * 0.1, 0.5, 0.01 ], 'thigh' + n );
		S.bone( 'foot' + n, [ s * 0.1, 0.08, 0 ], 'shin' + n );

	}

	const wax = ( x, y, z ) => C( '#58553d' ).multiplyScalar( 0.85 + 0.25 * noise3( x * 30, y * 30, z * 30 ) ).lerp( C( '#46432f' ), y < 0.95 ? 0.5 : 0 );
	const o = ( bone, color, k = 0.03, extra = {} ) => ( { bone, k, color, ...extra } );
	const skin = '#b39884', trousers = '#3e3f45', boots = '#4a3527', cap = '#6e3a30';
	for ( const [ s, n ] of [ [ - 1, 'L' ], [ 1, 'R' ] ] ) {

		const fx = s * 0.1;
		S.ellipsoid( [ fx, 0.05, 0.04 ], [ 0.052, 0.05, 0.13 ], o( 'foot' + n, boots, 0.02 ) );
		S.cone( [ fx, 0.06, - 0.01 ], [ fx, 0.2, - 0.005 ], 0.055, 0.052, o( 'shin' + n, boots, 0.02 ) );
		S.cone( [ fx, 0.18, 0 ], [ fx, 0.5, 0.008 ], 0.056, 0.062, o( 'shin' + n, trousers, 0.025 ) );
		S.cone( [ fx, 0.5, 0.008 ], [ fx, 0.93, 0 ], 0.064, 0.078, o( 'thigh' + n, trousers, 0.03 ) );

	}

	// the jacket to the hips, a collar, pockets; the hood rolled at the back of the neck
	S.cone( [ 0, 1.2, 0 ], [ 0, 0.8, - 0.005 ], 0.19, 0.205, o( 'pelvis', wax, 0.05, { sz: 0.72 } ) );
	S.ellipsoid( [ 0, 1.33, - 0.005 ], [ 0.205, 0.19, 0.14 ], o( 'chest', wax, 0.06 ) );
	S.ellipsoid( [ 0, 1.46, - 0.01 ], [ 0.215, 0.07, 0.12 ], o( 'chest', wax, 0.05 ) );
	S.cone( [ 0, 1.47, 0 ], [ 0, 1.57, 0.006 ], 0.085, 0.075, o( 'chest', wax, 0.015 ) );
	S.ellipsoid( [ 0, 1.54, - 0.075 ], [ 0.1, 0.045, 0.05 ], o( 'chest', wax, 0.02 ) );
	for ( const s of [ - 1, 1 ] ) S.ellipsoid( [ s * 0.1, 0.92, 0.15 ], [ 0.07, 0.06, 0.03 ], o( 'pelvis', wax, 0.02 ) );
	for ( const [ s, n ] of [ [ - 1, 'L' ], [ 1, 'R' ] ] ) {

		S.cone( [ s * 0.2, 1.44, 0 ], [ s * 0.23, 1.17, - 0.01 ], 0.062, 0.055, o( 'arm' + n, wax, 0.03 ) );
		S.cone( [ s * 0.23, 1.17, - 0.01 ], [ s * 0.24, 0.96, 0.01 ], 0.055, 0.048, o( 'fore' + n, wax, 0.025 ) );
		S.ellipsoid( [ s * 0.242, 0.89, 0.015 ], [ 0.03, 0.055, 0.04 ], o( 'hand' + n, skin, 0.015 ) );

	}

	// head, a knitted cap pulled down, a short beard
	S.cone( [ 0, 1.5, 0.005 ], [ 0, 1.6, 0.015 ], 0.05, 0.047, o( 'neck', skin, 0.03 ) );
	S.ellipsoid( [ 0, 1.69, 0.02 ], [ 0.078, 0.1, 0.092 ], o( 'head', skin, 0.03 ) );
	S.ellipsoid( [ 0, 1.625, 0.055 ], [ 0.062, 0.045, 0.055 ], o( 'head', C( '#5a4637' ), 0.025, { fuzz: 0.002, fuzzFreq: 120 } ) );
	S.ellipsoid( [ 0, 1.745, 0.005 ], [ 0.088, 0.075, 0.095 ], o( 'head', cap, 0.02, { fuzz: 0.0015, fuzzFreq: 140 } ) );
	S.ellipsoid( [ 0, 1.705, 0.005 ], [ 0.09, 0.018, 0.097 ], o( 'head', C( '#5c3029' ), 0.01 ) );
	return S;

}

const _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class PlayerBody {

	constructor( app ) {

		this.app = app;
		const { mesh, bones } = sculpt().mesh( creatureMaterial(), 0.0105 );
		mesh.name = 'you';
		mesh.layers.set( HIDDEN );
		mesh.castShadow = false;
		this.mesh = mesh;
		this.bones = bones;
		this.rest = new Map();
		for ( const [ n, b ] of bones ) this.rest.set( n, b.quaternion.clone() );
		this.pose = 'follow'; // follow (the camera), sit, row, stand (placed), walk (placed)
		this.rowPhase = 0;
		this.walkPhase = 0;
		this.enabled = false;
		app.scene.add( mesh );

	}

	// join (or leave) every mirror's reflection-only list
	enable( on ) {

		this.enabled = on;
		this.mesh.visible = on;
		const a = this.app, m = this.mesh;
		for ( const w of [ a.water, ...a.streams.ponds, ...a.extraWaters ] ) {

			w.reflectOnly = w.reflectOnly.filter( ( o ) => o !== m );
			if ( on ) w.reflectOnly.push( m );

		}

		const S = a.streams;
		S.reflectOnly = ( S.reflectOnly || [] ).filter( ( o ) => o !== m );
		if ( on ) S.reflectOnly.push( m );

	}

	_bone( name, x, y, z ) {

		this.bones.get( name ).quaternion.copy( this.rest.get( name ) ).multiply( _q.setFromEuler( _e.set( x, y, z, 'YXZ' ) ) );

	}

	update( dt ) {

		if ( ! this.enabled ) return;
		const cam = this.app.camera, c = this.app.controls;
		const m = this.mesh;
		if ( this.pose === 'follow' ) {

			// under the camera, facing where it looks; the legs in step with the bob
			const speed = Math.hypot( c.velocity.x, c.velocity.z );
			m.position.set( cam.position.x, cam.position.y - c.eyeHeight - 0.02, cam.position.z );
			// (a little back from the eye, so the head sits where a head would)
			m.position.x += Math.sin( c.yaw ) * 0.08;
			m.position.z += Math.cos( c.yaw ) * 0.08;
			m.rotation.set( 0, c.yaw + Math.PI, 0 );
			const ph = c.bob, amp = Math.min( 1, speed / 2.5 );
			const sw = Math.sin( ph ) * 0.42 * amp;
			this._bone( 'thighL', sw, 0, 0 );
			this._bone( 'thighR', - sw, 0, 0 );
			this._bone( 'shinL', - Math.max( 0, Math.sin( ph + 1.3 ) ) * 0.6 * amp, 0, 0 );
			this._bone( 'shinR', - Math.max( 0, Math.sin( ph + 1.3 + Math.PI ) ) * 0.6 * amp, 0, 0 );
			this._bone( 'armL', - sw * 0.5, 0, 0.04 );
			this._bone( 'armR', sw * 0.5, 0, - 0.04 );
			this._bone( 'foreL', - 0.15 * amp, 0, 0 );
			this._bone( 'foreR', - 0.15 * amp, 0, 0 );
			// the head follows the view's pitch
			this._bone( 'head', - c.pitch * 0.6, 0, 0 );
			this._bone( 'neck', - c.pitch * 0.3, 0, 0 );

		} else if ( this.pose === 'sit' || this.pose === 'row' ) {

			// on a thwart: thighs forward, shins down; rowing, the body swings forward and back
			// with the stroke, the arms reaching then pulling in to the chest
			const r = this.pose === 'row' ? this.rowPhase : 0;
			const lean = this.pose === 'row' ? Math.sin( r ) * 0.32 : 0.05;
			this._bone( 'pelvis', lean, 0, 0 );
			this._bone( 'chest', lean * 0.3, 0, 0 );
			for ( const [ n, s ] of [ [ 'L', 1 ], [ 'R', - 1 ] ] ) {

				this._bone( 'thigh' + n, - 1.45, 0, s * 0.12 );
				this._bone( 'shin' + n, 1.3 + ( this.pose === 'row' ? Math.sin( r ) * 0.25 : 0 ), 0, 0 );
				this._bone( 'foot' + n, - 0.1, 0, 0 );
				if ( this.pose === 'row' ) {

					const reach = 0.5 + 0.5 * Math.sin( r );
					this._bone( 'arm' + n, - 0.4 - reach * 0.9, s * 0.1, s * - 0.25 );
					this._bone( 'fore' + n, - 1.2 + reach * 1.1, 0, 0 );

				} else {

					this._bone( 'arm' + n, - 0.35, 0, s * - 0.1 );
					this._bone( 'fore' + n, - 1.0, 0, 0 );

				}

			}

			this._bone( 'head', - c.pitch * 0.5, ( this.headYaw ?? 0 ), 0 );

		} else if ( this.pose === 'walk' ) {

			const ph = this.walkPhase, sw = Math.sin( ph ) * 0.4;
			this._bone( 'pelvis', 0, 0, 0 );
			this._bone( 'thighL', sw, 0, 0 );
			this._bone( 'thighR', - sw, 0, 0 );
			this._bone( 'shinL', - Math.max( 0, Math.sin( ph + 1.3 ) ) * 0.6, 0, 0 );
			this._bone( 'shinR', - Math.max( 0, Math.sin( ph + 1.3 + Math.PI ) ) * 0.6, 0, 0 );
			this._bone( 'armL', - sw * 0.5, 0, 0.04 );
			this._bone( 'armR', sw * 0.5, 0, - 0.04 );

		} else {

			for ( const n of [ 'thighL', 'thighR', 'shinL', 'shinR', 'armL', 'armR', 'foreL', 'foreR', 'pelvis', 'chest', 'head', 'neck' ] ) this._bone( n, 0, 0, 0 );

		}

		m.updateMatrixWorld( true );

	}

}
