import * as THREE from 'three';
import { creatureMaterial, PartBuilder, MAT } from './creature.js';
import { RNG } from '../core/rng.js';

// Brown trout in the stream. Trout hold in "lies" - the deeper water on the outside of a
// bend, the tail of a pool - nose into the current, body swaying, fins working just
// enough to stay put. Every so often one rises to take something drifting past, or
// slides to a new spot; someone looming over the bank sends them darting for cover.

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// Brown trout (Salmo trutta), stream form: olive-bronze back, golden flanks with black
// and red spots in pale haloes, a creamy belly, spotted adipose and dorsal fins.
function brownTroutGeometry() {

	const b = new PartBuilder();
	const prof = [];
	for ( let i = 0; i <= 18; i ++ ) {

		const t = i / 18;
		const r = Math.sin( Math.PI * Math.pow( t, 0.78 ) ) * 0.05 * ( 1 - 0.3 * t );
		prof.push( new THREE.Vector2( Math.max( r, 0.002 ), t * 0.42 - 0.21 ) );

	}

	const body = new THREE.LatheGeometry( prof, 16 );
	body.rotateX( - Math.PI / 2 );
	body.scale( 0.75, 1.2, 1 );
	body.computeVertexNormals();
	const nb = body.toNonIndexed();
	const pos = nb.getAttribute( 'position' );
	const colors = [];
	const back = new THREE.Color( '#4a4a2a' ), flank = new THREE.Color( '#b3903e' ), belly = new THREE.Color( '#e3d6b4' );
	const black = new THREE.Color( '#1c1812' ), red = new THREE.Color( '#b33a1f' ), halo = new THREE.Color( '#e0cf9f' );
	const hash = ( i, j ) => {

		const x = Math.sin( i * 127.1 + j * 311.7 ) * 43758.5453;
		return x - Math.floor( x );

	};

	for ( let i = 0; i < pos.count; i ++ ) {

		const x = pos.getX( i ), y = pos.getY( i ) / 0.06, z = pos.getZ( i );
		const c = y > 0.35 ? back.clone().lerp( flank, ( 0.75 - y ) * 0.8 ) : ( y > - 0.35 ? flank.clone() : flank.clone().lerp( belly, Math.min( 1, ( - 0.35 - y ) * 2.5 ) ) );
		// spots on a jittered grid down the flanks and back
		if ( y > - 0.45 ) {

			const u = z * 70, v = y * 3.2 + ( x > 0 ? 0 : 17 );
			const gi = Math.floor( u ), gj = Math.floor( v );
			const cx = gi + 0.25 + 0.5 * hash( gi, gj ), cy = gj + 0.25 + 0.5 * hash( gj, gi );
			const d = Math.hypot( u - cx, v - cy );
			const isRed = hash( gi + 3, gj ) > 0.72 && y < 0.35;
			if ( d < 0.42 ) c.lerp( halo, 0.7 );
			if ( d < 0.26 ) c.copy( isRed ? red : black );

		}

		colors.push( c.r, c.g, c.b );

	}

	b.add( nb, '#ffffff', null, 0, MAT.SCALES );
	b.parts[ b.parts.length - 1 ].setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );
	// square tail, dorsal, adipose, pectoral and pelvic fins
	b.tris( [ [ 0, 0, - 0.18 ], [ 0, 0.055, - 0.28 ], [ 0, - 0.055, - 0.28 ] ], '#5a4a2a' );
	b.tris( [ [ 0, 0.045, 0.03 ], [ 0, 0.085, - 0.03 ], [ 0, 0.042, - 0.07 ] ], '#6a5a34' );
	b.tris( [ [ 0, 0.035, - 0.12 ], [ 0, 0.05, - 0.14 ], [ 0, 0.03, - 0.15 ] ], '#9a4a2a' );
	b.tris( [ [ 0.028, - 0.03, 0.09 ], [ 0.065, - 0.045, 0.045 ], [ 0.028, - 0.034, 0.045 ], [ - 0.028, - 0.03, 0.09 ], [ - 0.028, - 0.034, 0.045 ], [ - 0.065, - 0.045, 0.045 ] ], '#c29a5a' );
	b.tris( [ [ 0.02, - 0.045, - 0.04 ], [ 0.045, - 0.058, - 0.08 ], [ 0.02, - 0.047, - 0.08 ], [ - 0.02, - 0.045, - 0.04 ], [ - 0.02, - 0.047, - 0.08 ], [ - 0.045, - 0.058, - 0.08 ] ], '#c29a5a' );
	return b.build();

}

export class RiverFish {

	constructor( terrain, path ) {

		this.terrain = terrain;
		this.path = path;
		const rng = this.rng = new RNG( 404 );
		this.fish = [];
		// lies: the deepest water in each stretch, below the tumbling reach under the falls
		let last = - 1e9;
		for ( let i = 1; i < path.length - 1; i ++ ) {

			const pt = path[ i ];
			if ( pt.s < 70 || pt.s - last < 22 ) continue;
			const a = path[ i - 1 ], b = path[ i + 1 ];
			const d = b.p.clone().sub( a.p ).normalize();
			const n = new THREE.Vector2( - d.y, d.x );
			const bed = terrain.heightAt( pt.p.x, pt.p.y );
			const depth = pt.surf - bed;
			if ( depth < 0.3 ) continue;
			last = pt.s;
			const count = rng.int( 1, 3 );
			for ( let k = 0; k < count; k ++ ) {

				const off = rng.range( - 0.35, 0.35 ) * pt.w;
				const f = {
					lie: new THREE.Vector3( pt.p.x + n.x * off - d.x * k * 0.8, 0, pt.p.y + n.y * off - d.y * k * 0.8 ),
					up: Math.atan2( - d.x, - d.y ), // facing upstream
					surf: pt.surf,
					s: rng.range( 1.0, 1.5 ) * ( k ? 0.8 : 1 ),
					phase: rng.next() * 10,
					state: 'hold',
					timer: rng.range( 4, 20 ),
					off: new THREE.Vector3(),
					pos: new THREE.Vector3(),
					heading: 0,
					rise: 0,
				};
				f.pos.copy( f.lie );
				f.heading = f.up;
				this.fish.push( f );

			}

		}

		this.material = creatureMaterial( { wag: 0.02, wagSpeed: 11 } );
		this.mesh = new THREE.InstancedMesh( brownTroutGeometry(), this.material, Math.max( 1, this.fish.length ) );
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		this.mesh.name = 'river-trout';
		this.mesh.count = this.fish.length;
		this.group = this.mesh;

	}

	update( dt, time, camera ) {

		const cam = camera.position, rng = this.rng;
		for ( let i = 0; i < this.fish.length; i ++ ) {

			const f = this.fish[ i ];
			f.timer -= dt;
			const dx = cam.x - f.pos.x, dz = cam.z - f.pos.z;
			const near = Math.hypot( dx, dz ) < 5.5 && cam.y > f.surf - 0.5;
			if ( near && f.state !== 'dart' ) {

				// bolt up- or downstream, away from the shadow on the bank
				f.state = 'dart';
				f.timer = rng.range( 1.2, 2 );
				const away = Math.sign( Math.sin( f.up ) * - dx + Math.cos( f.up ) * - dz ) || 1;
				f.dartTo = f.lie.clone().add( new THREE.Vector3( Math.sin( f.up ), 0, Math.cos( f.up ) ).multiplyScalar( away * rng.range( 4, 7 ) ) );

			}

			let target = f.lie, speed = 0.6;
			switch ( f.state ) {

				case 'hold':
					if ( f.timer <= 0 ) {

						if ( rng.next() < 0.4 ) {

							f.state = 'rise';
							f.rise = 0;
							f.timer = 1.2;

						} else {

							// shift within the lie
							f.off.set( rng.range( - 0.5, 0.5 ), 0, rng.range( - 0.8, 0.8 ) );
							f.timer = rng.range( 5, 18 );

						}

					}

					target = _p.copy( f.lie ).add( f.off );
					break;
				case 'rise':
					// up to the surface to sip something drifting down, and back
					f.rise = Math.sin( Math.min( 1, ( 1.2 - f.timer ) / 1.2 ) * Math.PI );
					if ( f.timer <= 0 ) {

						f.state = 'hold';
						f.rise = 0;
						f.timer = rng.range( 6, 20 );

					}

					break;
				case 'dart':
					target = f.dartTo;
					speed = 5;
					if ( f.timer <= 0 && ! near ) {

						f.state = 'hold';
						f.timer = rng.range( 3, 8 );

					}

					break;

			}

			const tx = target.x - f.pos.x, tz = target.z - f.pos.z;
			const td = Math.hypot( tx, tz );
			const step = Math.min( td, speed * dt );
			if ( td > 1e-3 ) {

				f.pos.x += tx / td * step;
				f.pos.z += tz / td * step;

			}

			// face into the current except when bolting
			const want = f.state === 'dart' && td > 0.5 ? Math.atan2( tx, tz ) : f.up;
			let dh = want - f.heading;
			dh = Math.atan2( Math.sin( dh ), Math.cos( dh ) );
			f.heading += dh * Math.min( 1, dt * ( f.state === 'dart' ? 10 : 2 ) );
			const bed = this.terrain.heightAt( f.pos.x, f.pos.z );
			const low = Math.max( bed + 0.07 * f.s, f.surf - 0.5 );
			const y = THREE.MathUtils.lerp( low, f.surf - 0.05, f.rise * 0.9 );
			const sway = Math.sin( time * 1.3 + f.phase ) * 0.08 + Math.sin( time * 0.37 + f.phase * 2 ) * 0.05;
			_e.set( - f.rise * 0.5, f.heading + sway, Math.sin( time * 0.9 + f.phase ) * 0.05, 'YXZ' );
			_q.setFromEuler( _e );
			_m.compose( _s.set( f.pos.x, y, f.pos.z ), _q, _p.setScalar( f.s ) );
			this.mesh.setMatrixAt( i, _m );

		}

		this.mesh.instanceMatrix.needsUpdate = true;

	}

}
