import * as THREE from 'three';
import { Sculpt, noise3 } from '../fauna/sdf.js';
import { creatureMaterial } from '../fauna/creature.js';

// The figure: something that looks like a man in a herder's coat. After photographs of Alpine
// herders and of loden coats (shots/refs/herder): a long loden coat to mid-calf with a short
// shoulder cape and a stand collar, a wide felt hat, a long herder's stick; grey bare feet under
// the hem (J.'s boots are by the pool). Its head is tipped too far to one side, and nothing
// resolves under the brim.
// Rigged for a few slow movements: standing dead still, the head turning or tipping, a walk
// that is too even (no rise and fall, the stick planted every other step), turning to face you
// without a step, sitting.

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
const C = ( hex ) => new THREE.Color( hex );
const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

export const HIDDEN = 7; // a layer no camera draws: reflection-only things live here

function sculpt() {

	const S = new Sculpt();
	// the skeleton (rest pose: standing, arms down, the right hand on the stick)
	S.bone( 'root', [ 0, 0, 0 ] );
	S.bone( 'pelvis', [ 0, 0.96, 0 ], 'root' );
	S.bone( 'chest', [ 0, 1.3, 0 ], 'pelvis' );
	S.bone( 'neck', [ 0, 1.56, 0.005 ], 'chest' );
	S.bone( 'head', [ 0, 1.66, 0.01 ], 'neck' );
	for ( const [ s, n ] of [ [ - 1, 'L' ], [ 1, 'R' ] ] ) {

		S.bone( 'arm' + n, [ s * 0.205, 1.48, 0 ], 'chest' );
		S.bone( 'fore' + n, [ s * 0.235, 1.19, n === 'R' ? 0.02 : - 0.01 ], 'arm' + n );
		S.bone( 'hand' + n, n === 'R' ? [ 0.27, 0.98, 0.13 ] : [ - 0.25, 0.9, 0.005 ], 'fore' + n );
		S.bone( 'thigh' + n, [ s * 0.1, 0.93, 0 ], 'pelvis' );
		S.bone( 'shin' + n, [ s * 0.1, 0.51, 0.01 ], 'thigh' + n );
		S.bone( 'foot' + n, [ s * 0.1, 0.075, 0 ], 'shin' + n );

	}

	S.bone( 'stick', [ 0.27, 0.98, 0.13 ], 'handR' );

	// ---- colours (as a photograph shows them: the sculpt scales them down to albedo): loden
	// weathered to a dark grey-green, darker and muddy at the wet hem; grey skin
	const loden = ( x, y, z ) => {

		const n = noise3( x * 38, y * 38, z * 38 ) * 0.55 + noise3( x * 120, y * 120, z * 120 ) * 0.3 + noise3( x * 7, y * 3, z * 7 ) * 0.4;
		return C( '#595b51' ).multiplyScalar( 0.82 + 0.3 * n )
			// the hem: wet and muddy
			.lerp( C( '#4a3f33' ), ss( 0.62, 0.38, y ) * 0.75 )
			// faded where the rain and sun reach: the shoulders and the cape
			.lerp( C( '#6d6e63' ), ss( 1.34, 1.55, y ) * 0.4 );

	};

	const skin = '#716a64', feet = '#958d84', felt = '#46413c', band = '#2c2926', trousers = '#46484c', stick = '#86725e';
	const o = ( bone, color, k = 0.03, extra = {} ) => ( { bone, k, color, ...extra } );

	for ( const [ s, n ] of [ [ - 1, 'L' ], [ 1, 'R' ] ] ) {

		// bare feet: long, bony, the toes spread a little, grey with dirt
		const fx = s * 0.1;
		S.ellipsoid( [ fx, 0.036, 0.045 ], [ 0.048, 0.034, 0.118 ], o( 'foot' + n, feet, 0.015 ) );
		S.ellipsoid( [ fx, 0.05, - 0.035 ], [ 0.04, 0.045, 0.05 ], o( 'foot' + n, feet, 0.015 ) );
		for ( let t = 0; t < 5; t ++ ) {

			const tx = fx + s * ( - 0.03 + t * 0.016 ), tz = 0.155 - t * 0.008;
			S.ellipsoid( [ tx, 0.018, tz ], [ 0.009 - t * 0.0008, 0.011, 0.022 ], o( 'foot' + n, feet, 0.006 ) );

		}

		// the ankle bare, then the trousers, frayed and wet at the bottom
		S.cone( [ fx, 0.06, - 0.02 ], [ fx, 0.16, - 0.01 ], 0.036, 0.04, o( 'shin' + n, feet, 0.02 ) );
		S.cone( [ fx, 0.14, - 0.005 ], [ fx, 0.52, 0.005 ], 0.052, 0.058, o( 'shin' + n, trousers, 0.025, { fuzz: 0.003, fuzzFreq: 55 } ) );
		S.cone( [ fx, 0.52, 0.005 ], [ fx, 0.92, 0 ], 0.06, 0.072, o( 'thigh' + n, trousers, 0.03 ) );

	}

	// ---- the coat: the skirt flaring to mid-calf, a few deep folds hanging in it, the body, a
	// short shoulder cape to the elbow, a stand collar
	// the skirt: elliptical slices from the waist to mid-calf, wider than deep, flaring a
	// little and hanging slightly behind; deep folds down it, heavier at the back
	S.cone( [ 0, 1.1, - 0.01 ], [ 0, 0.37, - 0.026 ], 0.18, 0.275, o( 'pelvis', loden, 0.05, { fuzz: 0.003, fuzzFreq: 38, sz: 0.7 } ) );
	for ( let i = 0; i < 11; i ++ ) {

		const a2 = i / 11 * Math.PI * 2 + 0.25;
		const back = Math.cos( a2 ) < 0 ? 1.3 : 0.8;
		const e0 = [ Math.sin( a2 ) * 0.17, Math.cos( a2 ) * 0.125 ], e1 = [ Math.sin( a2 ) * 0.262, Math.cos( a2 ) * 0.188 ];
		S.cone( [ e0[ 0 ], 1.0, e0[ 1 ] - 0.015 ], [ e1[ 0 ], 0.345, e1[ 1 ] - 0.03 ], 0.009 * back, 0.024 * back, o( 'pelvis', loden, 0.035 ) );

	}

	// the opening down the front, a line of shadow
	S.cone( [ 0.012, 1.05, 0.148 ], [ 0.03, 0.34, 0.212 ], 0.007, 0.011, o( 'pelvis', loden, 0.008, { sub: true } ) );
	S.ellipsoid( [ 0, 1.14, - 0.005 ], [ 0.18, 0.15, 0.13 ], o( 'pelvis', loden, 0.06 ) );
	S.ellipsoid( [ 0, 1.34, - 0.008 ], [ 0.195, 0.18, 0.13 ], o( 'chest', loden, 0.06 ) );
	// the cape: sitting on the shoulders and hanging to the elbows, a little flared at its hem
	S.cone( [ 0, 1.585, - 0.01 ], [ 0, 1.2, - 0.016 ], 0.11, 0.275, o( 'chest', loden, 0.03, { fuzz: 0.003, fuzzFreq: 40, sz: 0.63 } ) );
	// the collar standing up round the neck
	S.cone( [ 0, 1.53, 0 ], [ 0, 1.665, 0.004 ], 0.096, 0.084, o( 'chest', loden, 0.015 ) );
	S.cone( [ 0, 1.57, 0.004 ], [ 0, 1.68, 0.006 ], 0.066, 0.064, o( 'neck', loden, 0.01, { sub: true } ) );

	// ---- arms: sleeves emerging from under the cape; the left hanging, the right on the stick
	for ( const [ s, n ] of [ [ - 1, 'L' ], [ 1, 'R' ] ] ) {

		S.cone( [ s * 0.205, 1.47, 0 ], [ s * 0.235, 1.19, n === 'R' ? 0.02 : - 0.01 ], 0.062, 0.054, o( 'arm' + n, loden, 0.03 ) );
		const wrist = n === 'R' ? [ 0.265, 1.0, 0.115 ] : [ - 0.25, 0.94, 0.0 ];
		S.cone( [ s * 0.235, 1.19, n === 'R' ? 0.02 : - 0.01 ], wrist, 0.054, 0.05, o( 'fore' + n, loden, 0.025 ) );
		// the cuff, turned back, darker
		S.cone( V( ...wrist ).lerp( V( s * 0.235, 1.19, 0 ), 0.12 ), wrist, 0.056, 0.053, o( 'fore' + n, C( '#44463e' ), 0.01 ) );

	}

	// hands: long, the fingers of the left hanging slack, the right closed round the stick
	S.ellipsoid( [ - 0.255, 0.885, 0.004 ], [ 0.026, 0.05, 0.04 ], o( 'handL', skin, 0.015 ) );
	for ( let f = 0; f < 4; f ++ ) S.cone( [ - 0.255 + ( f - 1.5 ) * 0.001, 0.845, 0.028 - f * 0.017 ], [ - 0.262 + ( f - 1.5 ) * 0.002, 0.765 + Math.abs( f - 1.5 ) * 0.012, 0.03 - f * 0.018 ], 0.0085, 0.006, o( 'handL', skin, 0.006 ) );
	S.cone( [ - 0.24, 0.87, 0.035 ], [ - 0.232, 0.83, 0.05 ], 0.009, 0.007, o( 'handL', skin, 0.006 ) );
	S.ellipsoid( [ 0.28, 0.965, 0.14 ], [ 0.032, 0.05, 0.038 ], o( 'handR', skin, 0.015 ) );
	for ( let f = 0; f < 4; f ++ ) S.ellipsoid( [ 0.296, 0.99 - f * 0.018, 0.162 ], [ 0.012, 0.009, 0.014 ], o( 'handR', skin, 0.006 ) );

	// ---- the stick: an old herder's stick of hazel, a knob at the top, iron-shod
	S.cone( [ 0.293, 1.36, 0.155 ], [ 0.333, - 0.03, 0.2 ], 0.019, 0.014, o( 'stick', stick, 0.004 ) );
	S.ellipsoid( [ 0.292, 1.375, 0.155 ], [ 0.026, 0.028, 0.026 ], o( 'stick', stick, 0.008 ) );
	S.cone( [ 0.331, 0.05, 0.198 ], [ 0.333, - 0.03, 0.2 ], 0.0155, 0.011, o( 'stick', C( '#57524c' ), 0.003 ) );

	// ---- neck and head (upright here: the head bone tips it). Grey, gaunt; no face to speak
	// of - a brow, the line of a jaw - and the brim over all of it
	S.cone( [ 0, 1.52, 0 ], [ 0.004, 1.645, 0.012 ], 0.052, 0.046, o( 'neck', skin, 0.03 ) );
	S.ellipsoid( [ 0.004, 1.745, 0.018 ], [ 0.079, 0.11, 0.094 ], o( 'head', skin, 0.03 ) );
	S.ellipsoid( [ 0.004, 1.678, 0.05 ], [ 0.058, 0.04, 0.06 ], o( 'head', skin, 0.03 ) );
	S.ellipsoid( [ 0.004, 1.775, 0.085 ], [ 0.07, 0.022, 0.03 ], o( 'head', skin, 0.02 ) );
	// the eye sockets: two shallow hollows, nothing in them
	for ( const s of [ - 1, 1 ] ) S.ellipsoid( [ 0.004 + s * 0.03, 1.748, 0.098 ], [ 0.02, 0.013, 0.014 ], o( 'head', skin, 0.012, { sub: true } ) );
	// lank hair down to the collar at the back and sides
	S.ellipsoid( [ 0.004, 1.74, - 0.012 ], [ 0.086, 0.1, 0.088 ], o( 'head', C( '#58524b' ), 0.02, { fuzz: 0.002, fuzzFreq: 90 } ) );
	S.ellipsoid( [ 0.004, 1.645, - 0.045 ], [ 0.07, 0.07, 0.04 ], o( 'head', C( '#524c46' ), 0.025 ) );

	// ---- the hat: a wide felt brim drooping front and back, a round crown pinched in front, a band
	const hy = 1.815;
	S.ellipsoid( [ 0.004, hy, 0.022 ], [ 0.235, 0.011, 0.23 ], o( 'head', felt, 0.012 ) );
	S.ellipsoid( [ 0.004, hy - 0.045, 0.2 ], [ 0.15, 0.013, 0.075 ], o( 'head', felt, 0.035 ) );
	S.ellipsoid( [ 0.004, hy - 0.03, - 0.17 ], [ 0.12, 0.013, 0.06 ], o( 'head', felt, 0.03 ) );
	S.ellipsoid( [ 0.004, hy + 0.058, 0.015 ], [ 0.094, 0.072, 0.1 ], o( 'head', felt, 0.02 ) );
	S.ellipsoid( [ 0.004, hy + 0.11, 0.08 ], [ 0.04, 0.03, 0.03 ], o( 'head', felt, 0.02, { sub: true } ) );
	S.cone( [ 0.004, hy + 0.012, 0.015 ], [ 0.004, hy + 0.04, 0.015 ], 0.1, 0.098, o( 'head', band, 0.006 ) );
	return S;

}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();

// A figure standing in the world: its mesh, its pose, and where it may be seen.
export class Figure {

	constructor( app ) {

		this.app = app;
		const S = sculpt();
		const material = creatureMaterial();
		const { mesh, bones } = S.mesh( material, 0.0095 );
		mesh.name = 'figure';
		this.mesh = mesh;
		this.bones = bones;
		this.rest = new Map();
		for ( const [ n, b ] of bones ) this.rest.set( n, b.quaternion.clone() );
		this.pos = new THREE.Vector3();
		this.yaw = 0;
		this.mode = 'hidden'; // hidden | direct | reflect
		this.pose = 'stand'; // stand | walk | sit
		this.tilt = 0.5; // the head tipped over (radians)
		this.headTurn = 0;
		this.walkPhase = 0;
		this.wind = 0;
		this.mesh.visible = false;
		this._waters = [];
		app.scene.add( mesh );

	}

	// every mirror that may show it: the lake, the ponds, the trough, the stream
	get waters() {

		const a = this.app;
		return [ a.water, ...a.streams.ponds, ...a.extraWaters ];

	}

	// direct: seen like anything else; reflect: only in the water's mirrors; hidden: nowhere
	setMode( mode ) {

		const m = this.mesh;
		if ( mode === this.mode ) return;
		for ( const w of this.waters ) w.reflectOnly = w.reflectOnly.filter( ( o ) => o !== m );
		const S = this.app.streams;
		S.reflectOnly = ( S.reflectOnly || [] ).filter( ( o ) => o !== m );
		this.mode = mode;
		m.visible = mode !== 'hidden';
		if ( mode === 'direct' ) {

			m.layers.set( 0 );
			m.castShadow = true;

		} else if ( mode === 'reflect' ) {

			m.layers.set( HIDDEN );
			m.castShadow = false;
			for ( const w of this.waters ) w.reflectOnly.push( m );
			S.reflectOnly.push( m );

		}

	}

	place( x, z, yaw, y = null ) {

		this.pos.set( x, y ?? this.app.terrainData.heightAt( x, z ) - 0.03, z );
		this.yaw = yaw;
		this._apply();

	}

	faceToward( p ) {

		return Math.atan2( p.x - this.pos.x, p.z - this.pos.z );

	}

	_apply() {

		this.mesh.position.copy( this.pos );
		this.mesh.rotation.set( 0, this.yaw, 0 );
		this.mesh.updateMatrixWorld( true );

	}

	_bone( name, x, y, z ) {

		const b = this.bones.get( name );
		b.quaternion.copy( this.rest.get( name ) ).multiply( _q.setFromEuler( _e.set( x, y, z, 'YXZ' ) ) );

	}

	// the pose for this frame
	update( dt ) {

		if ( this.mode === 'hidden' ) return;
		const t = this.app.elapsed;
		this.wind += dt;
		// the head: tipped hard over to its left shoulder, turned as the story wants
		this._bone( 'head', 0.06, this.headTurn, - this.tilt );
		this._bone( 'neck', 0.05, this.headTurn * 0.3, - this.tilt * 0.25 );
		if ( this.pose === 'walk' ) {

			// too even: no rise and fall, the arms nearly still, the stick planted every
			// other step, the stride exact
			const ph = this.walkPhase;
			const sw = Math.sin( ph ) * 0.36;
			this._bone( 'thighL', sw, 0, 0 );
			this._bone( 'thighR', - sw, 0, 0 );
			this._bone( 'shinL', - Math.max( 0, Math.sin( ph + 1.3 ) ) * 0.5, 0, 0 );
			this._bone( 'shinR', - Math.max( 0, Math.sin( ph + 1.3 + Math.PI ) ) * 0.5, 0, 0 );
			this._bone( 'footL', Math.max( 0, - Math.sin( ph ) ) * 0.25, 0, 0 );
			this._bone( 'footR', Math.max( 0, Math.sin( ph ) ) * 0.25, 0, 0 );
			this._bone( 'armL', - sw * 0.12, 0, 0.03 );
			// the stick swings forward on one stride and is planted on the next
			const stickPh = ( ph / ( Math.PI * 2 ) ) % 2;
			this._bone( 'armR', stickPh < 1 ? - 0.18 * Math.sin( stickPh * Math.PI ) : 0.05 * Math.sin( ( stickPh - 1 ) * Math.PI ), 0, 0 );
			this._bone( 'pelvis', 0, Math.sin( ph ) * 0.04, 0 );

		} else if ( this.pose === 'sit' ) {

			this._bone( 'thighL', - 1.45, 0, 0.08 );
			this._bone( 'thighR', - 1.45, 0, - 0.08 );
			this._bone( 'shinL', 1.5, 0, 0 );
			this._bone( 'shinR', 1.5, 0, 0 );
			this._bone( 'footL', 0, 0, 0 );
			this._bone( 'footR', 0, 0, 0 );
			this._bone( 'armL', - 0.5, 0, 0.1 );
			this._bone( 'foreL', - 0.7, 0, 0 );
			this._bone( 'armR', - 0.35, 0, - 0.05 );
			this._bone( 'pelvis', 0, 0, 0 );

		} else {

			// standing dead still: only the coat stirs (and a breath too slow to be a breath)
			for ( const n of [ 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'armL', 'foreL', 'armR' ] ) this._bone( n, 0, 0, 0 );
			const gust = Math.sin( t * 0.9 ) * Math.sin( t * 0.37 + 1 ) * this.app.weather.state.wind;
			this._bone( 'pelvis', gust * 0.012, 0, gust * 0.01 );
			this._bone( 'chest', Math.sin( t * 0.4 ) * 0.006, 0, 0 );

		}

		this._apply();

	}

	// Walk along points (world, y ignored) at speed m/s; resolves on arrival.
	walk( points, speed = 1.05, story ) {

		this.pose = 'walk';
		const pts = points.map( ( p ) => new THREE.Vector3( p.x, 0, p.z ) );
		let i = 0;
		return new Promise( ( res ) => {

			const step = ( dt ) => {

				if ( i >= pts.length ) {

					this.pose = 'stand';
					res();
					return true;

				}

				const tgt = pts[ i ];
				_v.set( tgt.x - this.pos.x, 0, tgt.z - this.pos.z );
				const d = _v.length();
				const want = Math.atan2( _v.x, _v.z );
				let dy = want - this.yaw;
				dy = Math.atan2( Math.sin( dy ), Math.cos( dy ) );
				this.yaw += dy * Math.min( 1, dt * 3 );
				const move = Math.min( d, speed * dt );
				if ( d < 0.05 ) i ++;
				else {

					this.pos.x += _v.x / d * move;
					this.pos.z += _v.z / d * move;
					this.pos.y = this.app.terrainData.heightAt( this.pos.x, this.pos.z ) - 0.03;
					this.walkPhase += move / 0.78 * Math.PI;

				}

				return false;

			};

			story.every( step );

		} );

	}

}
