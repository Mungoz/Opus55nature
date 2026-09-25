import * as THREE from 'three';
import { WORLD } from './world.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

// Smoothed free-fly / walk camera. Mouse drag (or pointer lock) to look, WASD to move.
export class Controls {

	constructor( camera, dom, terrain ) {

		this.camera = camera;
		this.dom = dom;
		this.terrain = terrain;
		this.yaw = 0;
		this.pitch = 0;
		this.targetYaw = 0;
		this.targetPitch = 0;
		this.velocity = new THREE.Vector3();
		this.keys = new Set();
		this.enabled = true;
		this.walk = false;
		this.speed = 14;
		this.sensitivity = 1;
		this.invertY = false;
		this.bob = 0;
		this.dragging = false;
		this.dragMoved = 0;
		this.onClick = null;
		this.touchMove = new THREE.Vector2();
		this.touchVertical = 0;
		this.onStick = null; // ( active, baseX, baseY, dx, dy ) for the on-screen joystick
		this.eyeHeight = 1.7;

		this._bind();

	}

	setPose( x, y, z, yawDeg, pitchDeg ) {

		this.camera.position.set( x, y, z );
		this.yaw = this.targetYaw = yawDeg * Math.PI / 180;
		this.pitch = this.targetPitch = pitchDeg * Math.PI / 180;
		this._applyRotation();

	}

	_bind() {

		const d = this.dom;
		const look = ( dx, dy ) => {

			const s = 0.0022 * this.sensitivity;
			this.targetYaw -= dx * s;
			this.targetPitch -= dy * s * ( this.invertY ? - 1 : 1 );
			this.targetPitch = THREE.MathUtils.clamp( this.targetPitch, - 1.5, 1.5 );

		};

		d.addEventListener( 'contextmenu', ( e ) => e.preventDefault() );
		d.addEventListener( 'pointerdown', ( e ) => {

			if ( ! this.enabled || e.pointerType === 'touch' ) return;
			this.dragging = true;
			this.dragMoved = 0;
			this._lastX = e.clientX;
			this._lastY = e.clientY;
			d.setPointerCapture( e.pointerId );

		} );
		d.addEventListener( 'pointermove', ( e ) => {

			if ( ! this.enabled || e.pointerType === 'touch' ) return;
			if ( document.pointerLockElement === d ) {

				look( e.movementX, e.movementY );
				return;

			}

			if ( ! this.dragging ) return;
			const dx = e.clientX - this._lastX, dy = e.clientY - this._lastY;
			this._lastX = e.clientX;
			this._lastY = e.clientY;
			this.dragMoved += Math.abs( dx ) + Math.abs( dy );
			look( dx, dy );

		} );
		d.addEventListener( 'pointerup', ( e ) => {

			if ( e.pointerType === 'touch' ) return;
			if ( this.dragging && this.dragMoved < 4 && this.onClick ) this.onClick( e );
			else if ( document.pointerLockElement === d && this.onClick && e.button === 0 ) this.onClick( e );
			this.dragging = false;

		} );
		d.addEventListener( 'wheel', ( e ) => {

			if ( ! this.enabled ) return;
			e.preventDefault();
			this.speed = THREE.MathUtils.clamp( this.speed * Math.pow( 1.0015, - e.deltaY ), 2, 400 );

		}, { passive: false } );

		window.addEventListener( 'keydown', ( e ) => {

			if ( e.target && ( e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' ) ) return;
			this.keys.add( e.code );

		} );
		window.addEventListener( 'keyup', ( e ) => this.keys.delete( e.code ) );
		window.addEventListener( 'blur', () => this.keys.clear() );

		// touch: left half = move stick, right half = look
		this._touches = new Map();
		d.addEventListener( 'touchstart', ( e ) => {

			for ( const t of e.changedTouches ) {

				const side = t.clientX < window.innerWidth * 0.42 ? 'move' : 'look';
				if ( side === 'move' && [ ...this._touches.values() ].some( ( s ) => s.side === 'move' ) ) continue;
				this._touches.set( t.identifier, { side, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, t0: performance.now() } );
				if ( side === 'move' ) this.onStick?.( true, t.clientX, t.clientY, 0, 0 );

			}

			e.preventDefault();

		}, { passive: false } );
		d.addEventListener( 'touchmove', ( e ) => {

			for ( const t of e.changedTouches ) {

				const s = this._touches.get( t.identifier );
				if ( ! s ) continue;
				if ( s.side === 'look' ) look( ( t.clientX - s.x ) * 1.4, ( t.clientY - s.y ) * 1.4 );
				s.x = t.clientX;
				s.y = t.clientY;
				if ( s.side === 'move' ) {

					let dx = s.x - s.x0, dy = s.y - s.y0;
					const len = Math.hypot( dx, dy ), max = 52;
					if ( len > max ) {

						dx *= max / len;
						dy *= max / len;

					}

					this.touchMove.set( dx / max, dy / max );
					this.onStick?.( true, s.x0, s.y0, dx, dy );

				}

			}

			e.preventDefault();

		}, { passive: false } );
		const end = ( e ) => {

			for ( const t of e.changedTouches ) {

				const s = this._touches.get( t.identifier );
				if ( s && s.side === 'move' ) {

					this.touchMove.set( 0, 0 );
					this.onStick?.( false );

				}
				if ( s && s.side === 'look' && performance.now() - s.t0 < 250 && Math.hypot( t.clientX - s.x0, t.clientY - s.y0 ) < 10 && this.onClick ) this.onClick( { clientX: t.clientX, clientY: t.clientY } );
				this._touches.delete( t.identifier );

			}

		};

		d.addEventListener( 'touchend', end );
		d.addEventListener( 'touchcancel', end );

	}

	_applyRotation() {

		this.camera.rotation.set( this.pitch, this.yaw, 0, 'YXZ' );

	}

	update( dt ) {

		const k = this.keys;
		const cam = this.camera;

		// look smoothing
		const ls = 1 - Math.exp( - dt * 18 );
		this.yaw += ( this.targetYaw - this.yaw ) * ls;
		this.pitch += ( this.targetPitch - this.pitch ) * ls;
		if ( k.has( 'ArrowLeft' ) ) this.targetYaw += dt * 1.4;
		if ( k.has( 'ArrowRight' ) ) this.targetYaw -= dt * 1.4;

		if ( ! this.enabled ) {

			this._applyRotation();
			return;

		}

		_fwd.set( - Math.sin( this.yaw ), 0, - Math.cos( this.yaw ) );
		_right.set( Math.cos( this.yaw ), 0, - Math.sin( this.yaw ) );
		_move.set( 0, 0, 0 );
		let f = 0, s = 0, u = 0;
		if ( k.has( 'KeyW' ) || k.has( 'ArrowUp' ) || k.has( 'KeyZ' ) ) f += 1;
		if ( k.has( 'KeyS' ) || k.has( 'ArrowDown' ) ) f -= 1;
		if ( k.has( 'KeyD' ) ) s += 1;
		if ( k.has( 'KeyA' ) ) s -= 1;
		if ( k.has( 'Space' ) || k.has( 'KeyE' ) ) u += 1;
		if ( k.has( 'ControlLeft' ) || k.has( 'KeyC' ) || k.has( 'KeyQ' ) ) u -= 1;
		f -= this.touchMove.y;
		s += this.touchMove.x;
		u += this.touchVertical;

		if ( this.walk ) {

			_move.addScaledVector( _fwd, f ).addScaledVector( _right, s );

		} else {

			// fly along the view direction
			const cp = Math.cos( this.pitch ), sp = Math.sin( this.pitch );
			_move.set( - Math.sin( this.yaw ) * cp, sp, - Math.cos( this.yaw ) * cp ).multiplyScalar( f );
			_move.addScaledVector( _right, s );
			_move.y += u;

		}

		if ( _move.lengthSq() > 1 ) _move.normalize();
		const fast = k.has( 'ShiftLeft' ) || k.has( 'ShiftRight' );
		let speed = this.walk ? ( fast ? 9 : 3.2 ) : this.speed * ( fast ? 4 : 1 );
		const target = _move.multiplyScalar( speed );
		const a = 1 - Math.exp( - dt * ( this.walk ? 10 : 4 ) );
		this.velocity.lerp( target, a );
		cam.position.addScaledVector( this.velocity, dt );

		// keep inside the world
		const r = Math.hypot( cam.position.x, cam.position.z - WORLD.lakeCenter[ 1 ] );
		if ( r > WORLD.boundsRadius ) {

			const f2 = WORLD.boundsRadius / r;
			cam.position.x *= f2;
			cam.position.z = WORLD.lakeCenter[ 1 ] + ( cam.position.z - WORLD.lakeCenter[ 1 ] ) * f2;

		}

		const ground = this.terrain.heightAt( cam.position.x, cam.position.z );
		const floor = Math.max( ground, WORLD.waterLevel ) ;
		if ( this.walk ) {

			const moving = Math.hypot( this.velocity.x, this.velocity.z );
			this.bob += dt * moving * 2.2;
			const bobY = Math.sin( this.bob ) * 0.035 * Math.min( moving / 3, 1 );
			const want = Math.max( ground, WORLD.waterLevel - 0.4 ) + this.eyeHeight + bobY;
			cam.position.y += ( want - cam.position.y ) * ( 1 - Math.exp( - dt * 14 ) );

		} else {

			const minY = floor + ( ground > WORLD.waterLevel ? 1.0 : 0.6 );
			if ( cam.position.y < minY ) {

				cam.position.y = minY;
				if ( this.velocity.y < 0 ) this.velocity.y = 0;

			}

			cam.position.y = Math.min( cam.position.y, WORLD.maxAltitude + 900 );

		}

		this._applyRotation();

	}

}
