import * as THREE from 'three';
import { Sculpt, noise3 } from './sdf.js';
import { creatureMaterial, PartBuilder, MAT } from './creature.js';
import { RNG } from '../core/rng.js';

// Three more birds of an alpine lake, each after reference photographs:
//  - grey heron: stalks the shallows, freezes, strikes; flies off with slow deep beats,
//    neck drawn in, legs trailing
//  - great crested grebe: rides low on the lake, dives and surfaces somewhere else
//  - alpine chough: a loose, noisy flock tumbling round the cliffs, playing the updraughts

const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
const wrap = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );
const turn = ( h, t, k ) => h + THREE.MathUtils.clamp( wrap( t - h ), - k, k );
const damp = ( a, b, k, dt ) => a + ( b - a ) * Math.min( 1, dt * k );

function eyes( material, r, pos, color = '#0b0806' ) {

	const g = new THREE.Group();
	for ( const sd of [ - 1, 1 ] ) {

		const b = new PartBuilder();
		b.add( new THREE.SphereGeometry( r, 10, 8 ), color, null, 0, MAT.BILL );
		const m = new THREE.Mesh( b.build(), material );
		m.position.set( sd * pos[ 0 ], pos[ 1 ], pos[ 2 ] );
		g.add( m );

	}

	return g;

}

// ---------------------------------------------------------------------------
// Grey heron (about 95 cm tall): pale grey back and wings, white neck and face with a
// broad black stripe from the eye to the plumes, black streaks down the fore-neck,
// black shoulder patches, dagger bill yellow-orange, long yellowish-brown legs.
// Standing pose; the neck S-curves forward, the head held level.
// ---------------------------------------------------------------------------
function heronGeometry() {

	const S = new Sculpt();
	S.bone( 'body', [ 0, 0.62, 0 ] );
	const grey = new THREE.Color( '#9aa0a3' ), white = new THREE.Color( '#e8e7e1' ), black = new THREE.Color( '#1b1b1d' ), darkGrey = new THREE.Color( '#6e7478' );
	const col = ( x, y, z ) => {

		const ax = Math.abs( x );
		// neck and face: white, a black stripe from the eye back over the crown
		if ( y > 0.74 ) {

			if ( y > 0.9 && z > 0.1 ) {

				const stripe = ss( 0.018, 0.024, ax ) * ss( 1.01, 0.98, y ) * ss( 0.26, 0.2, z );
				return white.clone().lerp( black, stripe );

			}

			// streaks down the front of the neck
			const front = ss( 0.0, 0.03, z - ( 0.14 + ( y - 0.75 ) * 0.4 ) );
			const streak = front * ss( 0.6, 0.9, Math.sin( y * 180 + Math.sin( x * 400 ) ) ) * ss( 0.012, 0.004, ax );
			return white.clone().lerp( black, streak * 0.8 ).lerp( grey, ss( 0.76, 0.74, y ) * 0.5 );

		}

		// the black patch at the bend of the wing, white breast plumes
		if ( z > 0.07 && y > 0.58 && ax > 0.07 && ax < 0.12 ) return black.clone();
		if ( z > 0.1 && y < 0.72 ) return white.clone().lerp( grey, 0.25 );
		// flight feathers along the lower wing edge are darker
		return grey.clone().lerp( darkGrey, ss( 0.56, 0.5, y ) * ss( 0.05, 0.12, ax ) ).multiplyScalar( 1 + noise3( x * 60, y * 60, z * 60 ) * 0.04 );

	};

	const P = ( k, extra = {} ) => ( { bone: 'body', color: col, k, mat: MAT.FEATHER, ...extra } );
	// slim body, folded wings making the back broad and flat
	S.ellipsoid( [ 0, 0.62, - 0.02 ], [ 0.1, 0.22, 0.1 ], P( 0.05 ), Sculpt.frame( [ 0, 0.35, - 1 ], [ 0, 1, 0 ] ) );
	for ( const sd of [ - 1, 1 ] ) S.ellipsoid( [ sd * 0.07, 0.635, - 0.08 ], [ 0.085, 0.24, 0.03 ], P( 0.02, { pat: [ 0, 0.4, 0 ] } ), Sculpt.frame( [ 0, 0.4, - 1 ], [ sd, 0.3, 0 ] ) );
	S.cone( [ 0, 0.57, - 0.2 ], [ 0, 0.5, - 0.32 ], 0.05, 0.02, P( 0.03 ) );
	// breast plumes hanging from the lower neck
	S.cone( [ 0, 0.74, 0.15 ], [ 0, 0.6, 0.17 ], 0.05, 0.03, P( 0.04 ) );
	// the neck: an S, thick at the base, slender to the head
	const neck = [ [ [ 0, 0.7, 0.12 ], 0.05 ], [ [ 0, 0.8, 0.17 ], 0.036 ], [ [ 0, 0.87, 0.14 ], 0.03 ], [ [ 0, 0.93, 0.16 ], 0.028 ] ];
	for ( let i = 0; i < neck.length - 1; i ++ ) S.cone( neck[ i ][ 0 ], neck[ i + 1 ][ 0 ], neck[ i ][ 1 ], neck[ i + 1 ][ 1 ], P( 0.03 ) );
	// head, flat-crowned, and the long plumes off the back of the crown
	S.ellipsoid( [ 0, 0.955, 0.195 ], [ 0.028, 0.03, 0.05 ], P( 0.02 ) );
	S.cone( [ 0, 0.975, 0.16 ], [ 0, 0.94, 0.04 ], 0.007, 0.002, { bone: 'body', color: '#1b1b1d', k: 0.005, mat: MAT.FEATHER } );
	// the dagger of a bill
	S.cone( [ 0, 0.952, 0.225 ], [ 0, 0.94, 0.355 ], 0.016, 0.003, { bone: 'body', color: ( x, y, z ) => ( z > 0.33 ? '#c9a042' : '#d6a54a' ), k: 0.008, mat: MAT.BILL } );
	// legs: long, yellowish-brown, thighs feathered grey
	for ( const sd of [ - 1, 1 ] ) {

		S.cone( [ sd * 0.04, 0.56, 0.0 ], [ sd * 0.045, 0.45, 0.01 ], 0.024, 0.012, P( 0.02 ) );
		S.cone( [ sd * 0.045, 0.46, 0.01 ], [ sd * 0.05, 0.03, 0.02 ], 0.009, 0.007, { bone: 'body', color: '#8a7a55', k: 0.006, mat: MAT.BILL } );
		for ( const a of [ - 0.5, 0, 0.5 ] ) S.cone( [ sd * 0.05, 0.02, 0.02 ], [ sd * 0.05 + Math.sin( a ) * 0.09, 0.008, 0.02 + Math.cos( a ) * 0.09 ], 0.005, 0.003, { bone: 'body', color: '#7a6a48', k: 0.004, mat: MAT.BILL } );

	}

	const g = S.build( 0.0085 );
	g.deleteAttribute( 'skinIndex' );
	g.deleteAttribute( 'skinWeight' );
	return g;

}

// Heron in flight: neck folded back so the head sits on the shoulders, legs trailing,
// long broad wings arched (their tips are flapped by the shader).
function heronFlightGeometry() {

	const b = new PartBuilder();
	const body = new THREE.SphereGeometry( 1, 14, 10 );
	body.scale( 0.1, 0.1, 0.3 );
	b.add( body, '#9aa0a3', null, 0, MAT.FEATHER );
	const head = new THREE.SphereGeometry( 1, 12, 8 );
	head.scale( 0.05, 0.055, 0.08 );
	b.add( head, '#e0dfd8', new THREE.Matrix4().makeTranslation( 0, 0.05, 0.28 ), 0, MAT.FEATHER );
	const bill = new THREE.ConeGeometry( 0.018, 0.14, 8 );
	bill.rotateX( Math.PI / 2 );
	b.add( bill, '#d6a54a', new THREE.Matrix4().makeTranslation( 0, 0.045, 0.41 ), 0, MAT.BILL );
	for ( const sd of [ - 1, 1 ] ) {

		const leg = new THREE.CylinderGeometry( 0.008, 0.006, 0.42, 6 );
		leg.rotateX( Math.PI / 2 );
		b.add( leg, '#8a7a55', new THREE.Matrix4().makeTranslation( sd * 0.03, - 0.02, - 0.5 ), 0, MAT.BILL );
		// broad arched wing: grey above, the flight feathers black
		const span = 0.9, chord = 0.36;
		const pts = [
			[ sd * 0.06, 0.02, 0.14 ], [ sd * span * 0.45, 0.07, 0.12 ], [ sd * 0.06, 0.02, 0.14 - chord ],
			[ sd * 0.06, 0.02, 0.14 - chord ], [ sd * span * 0.45, 0.07, 0.12 ], [ sd * span * 0.5, 0.06, 0.12 - chord ],
		];
		b.tris( pts, '#8f969a', ( x ) => Math.min( 1, Math.abs( x ) / span ) * sd, MAT.FEATHER );
		b.tris( [ [ sd * span * 0.45, 0.07, 0.12 ], [ sd * span, 0.0, 0.0 ], [ sd * span * 0.5, 0.06, 0.12 - chord ], [ sd * span, 0.0, 0.0 ], [ sd * span * 0.95, - 0.01, - 0.2 ], [ sd * span * 0.5, 0.06, 0.12 - chord ] ], '#2a2c2f', ( x ) => Math.min( 1, Math.abs( x ) / span ) * sd, MAT.FEATHER );

	}

	return b.build();

}

// ---------------------------------------------------------------------------
// Great crested grebe (autumn): dark grey-brown back, silky white neck and face, the
// crest and the chestnut-and-black tippets reduced, a dagger bill pink-horn, red eye.
// Rides low: only the back, neck and head above water.
// ---------------------------------------------------------------------------
function grebeGeometry() {

	const S = new Sculpt();
	S.bone( 'body', [ 0, 0.05, 0 ] );
	const back = new THREE.Color( '#4d463f' ), white = new THREE.Color( '#ecebe6' ), chest = new THREE.Color( '#a7784e' ), dark = new THREE.Color( '#26211d' );
	const col = ( x, y, z ) => {

		if ( y > 0.14 ) {

			// crown and crest dark; a chestnut and black tippet at the back of the jaw
			if ( y > 0.285 ) return dark.clone();
			const tippet = ss( 0.018, 0.028, Math.abs( x ) ) * ss( 0.22, 0.24, y ) * ss( 0.28, 0.26, y ) * ss( 0.15, 0.13, z );
			return white.clone().lerp( chest, tippet * 0.8 ).lerp( dark, ss( 0.255, 0.275, y ) * ss( 0.14, 0.12, z ) * 0.8 );

		}

		// dark back, white fore-neck and breast, warm flanks at the waterline
		const front = ss( 0.05, 0.11, z );
		return back.clone().lerp( white, front * ss( 0.04, 0.1, y ) ).lerp( chest, ss( 0.06, 0.02, y ) * ( 1 - front ) * 0.5 ).multiplyScalar( 1 + noise3( x * 70, y * 70, z * 70 ) * 0.05 );

	};

	const P = ( k, extra = {} ) => ( { bone: 'body', color: col, k, mat: MAT.FEATHER, ...extra } );
	S.ellipsoid( [ 0, 0.02, - 0.02 ], [ 0.085, 0.06, 0.17 ], P( 0.04, { pat: [ 0, 0.5, 0 ] } ) );
	S.ellipsoid( [ 0, 0.05, 0.08 ], [ 0.07, 0.065, 0.07 ], P( 0.04 ) );
	// the slim upright neck and head
	S.cone( [ 0, 0.07, 0.11 ], [ 0, 0.25, 0.14 ], 0.035, 0.022, P( 0.03 ) );
	S.ellipsoid( [ 0, 0.265, 0.155 ], [ 0.024, 0.026, 0.038 ], P( 0.015 ) );
	// short crest at the back of the crown
	S.ellipsoid( [ 0, 0.29, 0.13 ], [ 0.018, 0.016, 0.022 ], P( 0.01, { color: '#26211d' } ) );
	S.cone( [ 0, 0.262, 0.185 ], [ 0, 0.255, 0.245 ], 0.009, 0.002, { bone: 'body', color: '#c8958a', k: 0.004, mat: MAT.BILL } );
	const g = S.build( 0.005 );
	g.deleteAttribute( 'skinIndex' );
	g.deleteAttribute( 'skinWeight' );
	return g;

}

// ---------------------------------------------------------------------------
// Alpine chough: glossy black, short yellow bill, red legs, long fingered wings and a
// longish rounded tail. Flight form.
// ---------------------------------------------------------------------------
function choughGeometry() {

	const b = new PartBuilder();
	const body = new THREE.SphereGeometry( 1, 12, 8 );
	body.scale( 0.055, 0.055, 0.14 );
	b.add( body, '#141416', null, 0, MAT.FEATHER );
	const head = new THREE.SphereGeometry( 0.042, 10, 8 );
	b.add( head, '#141416', new THREE.Matrix4().makeTranslation( 0, 0.015, 0.14 ), 0, MAT.FEATHER );
	const bill = new THREE.ConeGeometry( 0.011, 0.04, 6 );
	bill.rotateX( Math.PI / 2 );
	b.add( bill, '#e8c21c', new THREE.Matrix4().makeTranslation( 0, 0.008, 0.195 ), 0, MAT.BILL );
	// rounded tail
	b.tris( [ [ 0, 0.01, - 0.1 ], [ 0.06, 0.01, - 0.26 ], [ - 0.06, 0.01, - 0.26 ], [ 0.06, 0.01, - 0.26 ], [ 0, 0.01, - 0.28 ], [ - 0.06, 0.01, - 0.26 ] ], '#18181a', () => 0, MAT.FEATHER );
	for ( const sd of [ - 1, 1 ] ) {

		const span = 0.4, chord = 0.15;
		// inner wing, then fingered primaries
		b.tris( [ [ sd * 0.04, 0.01, 0.06 ], [ sd * span * 0.5, 0.02, 0.04 ], [ sd * 0.04, 0.01, 0.06 - chord ], [ sd * 0.04, 0.01, 0.06 - chord ], [ sd * span * 0.5, 0.02, 0.04 ], [ sd * span * 0.5, 0.02, 0.04 - chord * 1.1 ] ], '#161618', ( x ) => Math.min( 1, Math.abs( x ) / span ) * sd, MAT.FEATHER );
		for ( let f = 0; f < 5; f ++ ) {

			const z0 = 0.04 - f * chord * 0.22, a = 0.1 + f * 0.12;
			const x0 = sd * span * 0.5;
			b.tris( [ [ x0, 0.02, z0 ], [ x0 + sd * Math.cos( a ) * span * 0.55, 0.0, z0 - Math.sin( a ) * span * 0.2 ], [ x0, 0.02, z0 - chord * 0.24 ] ], '#141416', ( x ) => Math.min( 1, Math.abs( x ) / span ) * sd, MAT.FEATHER );

		}

	}

	return b.build();

}

// ---------------------------------------------------------------------------

export class MoreBirds {

	constructor( terrain, water ) {

		this.terrain = terrain;
		this.water = water;
		const rng = this.rng = new RNG( 818 );
		this.group = new THREE.Group();
		this.group.name = 'more-birds';
		this.material = creatureMaterial();

		// herons: standing in the shallows along the shore near the start
		const stand = heronGeometry(), fly = heronFlightGeometry();
		this.flyMat = creatureMaterial( { flapSpeed: 2.3, flapAmp: 0.55 } );
		this.herons = [];
		for ( const [ x, z ] of [ [ - 70, 452 ], [ 120, 400 ] ] ) {

			const spot = this._shallow( x, z, 0.12, 0.35 );
			const h = {
				home: spot.clone(), pos: spot.clone(), heading: rng.next() * Math.PI * 2,
				state: 'stalk', timer: rng.range( 3, 8 ), neck: 0, strike: 0,
				stand: new THREE.Mesh( stand, this.material ), fly: new THREE.Mesh( fly, this.flyMat ),
				vel: new THREE.Vector3(), flyT: 0,
			};
			h.stand.add( eyes( this.material, 0.006, [ 0.022, 0.962, 0.2 ], '#d8b030' ) );
			h.stand.castShadow = h.fly.castShadow = true;
			h.fly.visible = false;
			this.group.add( h.stand, h.fly );
			this.herons.push( h );

		}

		// grebes: out on the open water of the bay
		const grebe = grebeGeometry();
		this.grebes = [];
		for ( let i = 0; i < 3; i ++ ) {

			const spot = this._deep( - 40 + i * 70, 360 - i * 40, 2.5 );
			const g = {
				pos: spot.clone(), heading: rng.next() * Math.PI * 2, state: 'swim', timer: rng.range( 4, 12 ),
				target: spot.clone(), mesh: new THREE.Mesh( grebe, this.material ), dive: 0, phase: rng.next() * 10,
			};
			g.mesh.add( eyes( this.material, 0.004, [ 0.02, 0.27, 0.17 ], '#b01818' ) );
			g.mesh.castShadow = true;
			this.group.add( g.mesh );
			this.grebes.push( g );

		}

		// choughs: a flock round the crags above the western wood
		this.choughMat = creatureMaterial( { flapSpeed: 9, flapAmp: 0.7, glide: 0.6 } );
		const n = 14;
		this.chough = { n, mesh: new THREE.InstancedMesh( choughGeometry(), this.choughMat, n ), c: V( - 360, 170, 760 ), birds: [] };
		this.chough.mesh.frustumCulled = false;
		for ( let i = 0; i < n; i ++ ) this.chough.birds.push( { ph: rng.next() * 6.28, r: rng.range( 25, 70 ), w: rng.range( 0.25, 0.45 ) * ( rng.next() < 0.8 ? 1 : - 1 ), y: rng.range( - 15, 15 ), tumble: 0 } );
		this.group.add( this.chough.mesh );

	}

	// a point near (x, z) with water depth in [d0, d1]
	_shallow( x, z, d0, d1 ) {

		for ( let r = 0; r < 150; r += 2 ) for ( let k = 0; k < 24; k ++ ) {

			const a = k / 24 * Math.PI * 2;
			const px = x + Math.cos( a ) * r, pz = z + Math.sin( a ) * r;
			const d = - this.terrain.heightAt( px, pz );
			if ( d > d0 && d < d1 ) return V( px, 0, pz );

		}

		return V( x, 0, z );

	}

	_deep( x, z, d0 ) {

		for ( let r = 0; r < 200; r += 3 ) for ( let k = 0; k < 24; k ++ ) {

			const a = k / 24 * Math.PI * 2;
			const px = x + Math.cos( a ) * r, pz = z + Math.sin( a ) * r;
			if ( - this.terrain.heightAt( px, pz ) > d0 ) return V( px, 0, pz );

		}

		return V( x, 0, z );

	}

	update( dt, time, camera ) {

		const rng = this.rng, cam = camera.position;

		// ---- herons ----
		for ( const h of this.herons ) {

			const dist = Math.hypot( cam.x - h.pos.x, cam.z - h.pos.z );
			h.timer -= dt;
			if ( dist < 22 && h.state !== 'fly' && h.state !== 'land' ) {

				// takes off with a croak, flies along the shore and settles further on
				h.state = 'fly';
				h.flyT = 0;
				const away = Math.atan2( h.pos.x - cam.x, h.pos.z - cam.z ) + rng.range( - 0.6, 0.6 );
				h.dest = this._shallow( h.pos.x + Math.sin( away ) * rng.range( 90, 160 ), h.pos.z + Math.cos( away ) * rng.range( 90, 160 ), 0.12, 0.35 );
				h.start = h.pos.clone();

			}

			switch ( h.state ) {

				case 'stalk':
					// slow deliberate steps, then a long freeze
					if ( h.timer <= 0 ) {

						h.state = rng.next() < 0.5 ? 'freeze' : 'step';
						h.timer = h.state === 'freeze' ? rng.range( 4, 10 ) : rng.range( 1.5, 3 );
						h.target = this._shallow( h.home.x + rng.range( - 6, 6 ), h.home.z + rng.range( - 6, 6 ), 0.12, 0.35 );

					}

					break;
				case 'step': {

					const tx = h.target.x - h.pos.x, tz = h.target.z - h.pos.z;
					h.heading = turn( h.heading, Math.atan2( tx, tz ), dt * 1.2 );
					const d = Math.hypot( tx, tz );
					if ( d > 0.1 ) {

						h.pos.x += tx / d * Math.min( d, 0.25 * dt );
						h.pos.z += tz / d * Math.min( d, 0.25 * dt );

					}

					if ( h.timer <= 0 ) {

						h.state = 'freeze';
						h.timer = rng.range( 4, 12 );

					}

					break;

				}

				case 'freeze':
					h.neck = damp( h.neck, 0.6, 1.5, dt );
					if ( h.timer <= 0 ) {

						if ( rng.next() < 0.35 ) {

							// the strike: the neck shoots out and down into the water
							h.state = 'strike';
							h.timer = 0.9;
							this.water.addRipple( h.pos.x + Math.sin( h.heading ) * 0.45, h.pos.z + Math.cos( h.heading ) * 0.45, 0.45, 0.2 );

						} else {

							h.state = 'stalk';
							h.timer = rng.range( 1, 3 );

						}

					}

					break;
				case 'strike':
					h.strike = Math.sin( Math.min( 1, ( 0.9 - h.timer ) / 0.9 ) * Math.PI );
					if ( h.timer <= 0 ) {

						h.strike = 0;
						h.state = 'stalk';
						h.timer = rng.range( 3, 6 );

					}

					break;
				case 'fly': {

					h.flyT += dt;
					const total = h.start.distanceTo( h.dest ) / 6;
					const u = Math.min( 1, h.flyT / total );
					const p = h.start.clone().lerp( h.dest, u );
					const alt = Math.sin( u * Math.PI ) * 14 + 0.9;
					h.fly.position.set( p.x, alt, p.z );
					const dir = h.dest.clone().sub( h.start ).setY( Math.cos( u * Math.PI ) * 2 ).normalize();
					h.fly.lookAt( h.fly.position.clone().add( dir ) );
					h.fly.scale.setScalar( 1 );
					h.pos.copy( p );
					if ( u >= 1 ) {

						h.state = 'freeze';
						h.timer = rng.range( 6, 12 );
						h.home.copy( h.dest );
						h.pos.copy( h.dest );
						h.heading = Math.atan2( dir.x, dir.z );
						this.water.addRipple( h.pos.x, h.pos.z, 0.3 );

					}

					break;

				}

			}

			const flying = h.state === 'fly';
			h.stand.visible = ! flying;
			h.fly.visible = flying;
			if ( ! flying ) {

				h.stand.position.set( h.pos.x, - 0.28 - h.strike * 0.12, h.pos.z );
				h.stand.rotation.set( h.strike * 0.9 + h.neck * 0.05, h.heading, 0, 'YXZ' );

			}

		}

		// ---- grebes ----
		for ( const g of this.grebes ) {

			g.timer -= dt;
			if ( g.state === 'swim' ) {

				const tx = g.target.x - g.pos.x, tz = g.target.z - g.pos.z;
				g.heading = turn( g.heading, Math.atan2( tx, tz ), dt * 0.8 );
				g.pos.x += Math.sin( g.heading ) * 0.35 * dt;
				g.pos.z += Math.cos( g.heading ) * 0.35 * dt;
				if ( Math.hypot( tx, tz ) < 3 ) g.target.copy( this._deep( g.pos.x + rng.range( - 40, 40 ), g.pos.z + rng.range( - 40, 40 ), 2 ) );
				if ( g.timer <= 0 ) {

					// a smooth forward roll under, and gone
					g.state = 'dive';
					g.dive = 0;
					g.timer = rng.range( 12, 30 );
					this.water.addRipple( g.pos.x, g.pos.z, 0.35 );

				}

			} else {

				g.dive = Math.min( 1, g.dive + dt * 2.5 );
				// swim on underwater and come up somewhere else
				g.pos.x += Math.sin( g.heading ) * 1.2 * dt;
				g.pos.z += Math.cos( g.heading ) * 1.2 * dt;
				if ( - this.terrain.heightAt( g.pos.x, g.pos.z ) < 1.5 ) g.heading += Math.PI * dt;
				if ( g.timer <= 0 ) {

					g.state = 'swim';
					g.timer = rng.range( 15, 40 );
					this.water.addRipple( g.pos.x, g.pos.z, 0.3 );

				}

			}

			const under = g.state === 'dive' ? g.dive : 0;
			g.mesh.visible = under < 0.99;
			const bob = Math.sin( time * 1.3 + g.phase ) * 0.006;
			g.mesh.position.set( g.pos.x, bob - 0.02 - under * 0.4, g.pos.z );
			g.mesh.rotation.set( under * 1.2, g.heading, 0, 'YXZ' );

		}

		// ---- choughs: loose circles round the crags, with sudden dives and tumbles ----
		const C = this.chough, m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3( 1.25, 1.25, 1.25 );
		C.birds.forEach( ( b, i ) => {

			const a = time * b.w + b.ph;
			const lift = Math.sin( time * 0.3 + b.ph * 2 ) * 20 + b.y;
			if ( b.tumble <= 0 && rng.next() < dt * 0.05 ) b.tumble = 1.4;
			b.tumble = Math.max( 0, b.tumble - dt );
			const drop = b.tumble > 0 ? Math.sin( ( 1.4 - b.tumble ) / 1.4 * Math.PI ) * 18 : 0;
			const p = new THREE.Vector3( C.c.x + Math.cos( a ) * b.r + Math.sin( time * 0.07 + i ) * 30, C.c.y + lift - drop, C.c.z + Math.sin( a ) * b.r );
			const heading = Math.atan2( - Math.sin( a ) * Math.sign( b.w ), Math.cos( a ) * Math.sign( b.w ) );
			e.set( b.tumble > 0 ? 0.6 : - 0.05, heading, - Math.sign( b.w ) * 0.5 + ( b.tumble > 0 ? Math.sin( b.tumble * 9 ) * 1.2 : 0 ), 'YXZ' );
			q.setFromEuler( e );
			m.compose( p, q, s );
			C.mesh.setMatrixAt( i, m );

		} );
		C.mesh.instanceMatrix.needsUpdate = true;

	}

}
