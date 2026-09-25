import * as THREE from 'three';
import { creatureMaterial, furMaterial, furGeometry, addFur } from './creature.js';
import { buildMarmot, buildSquirrel } from './mammalModels.js';
import { buildDeer } from './deerModel.js';
import { RNG } from '../core/rng.js';

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
const wrapAngle = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );
const turnToward = ( h, target, maxStep ) => h + THREE.MathUtils.clamp( wrapAngle( target - h ), - maxStep, maxStep );
const damp = ( a, b, k, dt ) => a + ( b - a ) * Math.min( 1, dt * k );

// Clone a skinned model so every animal has its own skeleton.
function instance( proto ) {

	const mesh = new THREE.SkinnedMesh( proto.mesh.geometry, proto.mesh.material );
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.frustumCulled = false;
	const root = proto.mesh.children.find( ( c ) => c.isBone ).clone( true );
	mesh.add( root );
	const bones = new Map();
	root.traverse( ( b ) => {

		if ( b.isBone ) bones.set( b.name, b );

	} );
	mesh.updateMatrixWorld( true );
	const list = proto.mesh.skeleton.bones.map( ( b ) => bones.get( b.name ) );
	mesh.bind( new THREE.Skeleton( list ) );
	const rest = new Map();
	for ( const [ n, b ] of bones ) rest.set( n, b.position.clone() );
	const fur = proto.furGeo ? addFur( mesh, proto.furGeo, proto.furMat ) : null;
	return { mesh, bones, rest, fur, furFar: proto.furFar };

}

export class Mammals {

	constructor( terrain, forest, audio, quality = {} ) {

		this.terrain = terrain;
		this.audio = audio;
		this.rng = new RNG( 1717 );
		this.material = creatureMaterial();
		this.group = new THREE.Group();
		this.group.name = 'mammals';
		const rng = this.rng;

		const stagProto = buildDeer( true, this.material );
		const hindProto = buildDeer( false, this.material );
		const marmotProto = buildMarmot( this.material );
		const squirrelProto = buildSquirrel( this.material );
		// fur: shells drawn over the skin, only near the camera
		const shells = quality.fur ?? 12;
		// (hairs a centimetre or two long are sub-pixel beyond these distances at 55 degrees)
		for ( const [ p, far ] of [ [ stagProto, 28 ], [ hindProto, 28 ], [ marmotProto, 16 ], [ squirrelProto, 10 ] ] ) {

			if ( ! p.fur || ! shells ) continue;
			p.furGeo = furGeometry( p.mesh.geometry, shells );
			p.furMat = furMaterial( { density: p.fur.density, shells } );
			p.furFar = far;

		}

		// --- a small herd grazing the open lakeshore east of the start
		this.deer = [];
		const herd = this._findMeadow( 34, 488, 9 );
		for ( let i = 0; i < 5; i ++ ) {

			const d = instance( i === 0 ? stagProto : hindProto );
			d.stag = i === 0;
			d.mesh.scale.setScalar( d.stag ? 1.0 : 0.88 + rng.next() * 0.06 );
			d.pos = this._dryPoint( herd.x, herd.y, 3, 12 );
			d.heading = rng.next() * Math.PI * 2;
			d.state = 'graze';
			d.timer = rng.range( 2, 10 );
			d.phase = rng.next();
			d.speed = 0;
			d.target = d.pos.clone();
			d.home = new THREE.Vector2( herd.x, herd.y );
			d.neck = 1;
			d.head = 0.4;
			d.yaw = 0;
			d.earT = rng.next() * 5;
			d.roarTimer = rng.range( 15, 40 );
			d.mesh.name = d.stag ? 'stag' : 'hind';
			this.group.add( d.mesh );
			this.deer.push( d );

		}

		// --- a marmot colony on the turf just in front of the start
		this.marmots = [];
		for ( const [ x, z ] of [ [ 0, 495 ], [ 8, 497 ], [ 4, 490 ], [ - 3, 492 ] ] ) {

			const m = instance( marmotProto );
			m.burrow = V( x, 0, z );
			m.pos = m.burrow.clone().add( V( rng.range( - 3, 3 ), 0, rng.range( - 3, 3 ) ) );
			m.heading = rng.next() * Math.PI * 2;
			m.state = 'forage';
			m.timer = rng.range( 3, 8 );
			m.sit = 0;
			m.sink = 0;
			m.phase = rng.next() * 10;
			m.target = m.pos.clone();
			m.mesh.name = 'marmot';
			// a big old Alpine marmot is the size of a small dog
			m.mesh.scale.setScalar( rng.range( 1.1, 1.22 ) );
			this.group.add( m.mesh );
			this.marmots.push( m );

		}

		// --- red squirrels at the foot of the nearest conifers
		this.squirrels = [];
		const nearTrees = forest.trees
			.filter( ( t ) => t.variant < 6 && Math.hypot( t.x - 10, t.z - 560 ) < 140 && t !== forest.spawnVignette?.tree )
			.sort( ( a, b ) => Math.hypot( a.x - 10, a.z - 560 ) - Math.hypot( b.x - 10, b.z - 560 ) )
			.slice( 0, 2 );
		if ( forest.spawnVignette ) nearTrees.unshift( forest.spawnVignette.tree );
		for ( const t of nearTrees ) {

			const q = instance( squirrelProto );
			q.tree = t;
			q.perch = t === forest.spawnVignette?.tree ? forest.spawnVignette.perch : null;
			q.pos = q.perch ? V( q.perch.x + 1.2, 0, q.perch.z + 0.6 ) : V( t.x + 2, 0, t.z + 1 );
			q.heading = 0;
			q.state = 'forage';
			q.timer = 2;
			q.hop = 0;
			q.climb = 0;
			q.from = q.pos.clone();
			q.to = q.pos.clone();
			q.mesh.name = 'squirrel';
			this.group.add( q.mesh );
			this.squirrels.push( q );

		}

	}

	// a random point between r0 and r1 from (x, z) on dry ground (falls back to the centre)
	_dryPoint( x, z, r0, r1 ) {

		for ( let k = 0; k < 16; k ++ ) {

			const a = this.rng.next() * Math.PI * 2, r = this.rng.range( r0, r1 );
			const px = x + Math.cos( a ) * r, pz = z + Math.sin( a ) * r;
			if ( this.terrain.heightAt( px, pz ) > 1.3 ) return new THREE.Vector3( px, 0, pz );

		}

		return new THREE.Vector3( x, 0, z );

	}

	// the heading that climbs away from the water fastest
	_inland( p ) {

		const e = 3;
		const gx = this.terrain.heightAt( p.x + e, p.z ) - this.terrain.heightAt( p.x - e, p.z );
		const gz = this.terrain.heightAt( p.x, p.z + e ) - this.terrain.heightAt( p.x, p.z - e );
		return Math.atan2( gx, gz );

	}

	_findMeadow( x, z, r ) {

		let best = new THREE.Vector2( x, z ), score = - 1;
		const bio = [ 0, 0, 0, 0 ];
		for ( let i = 0; i < 80; i ++ ) {

			const a = i * 2.39996, d = Math.sqrt( i / 80 ) * r;
			const px = x + Math.cos( a ) * d, pz = z + Math.sin( a ) * d;
			this.terrain.biomeAt( px, pz, bio );
			const h = this.terrain.heightAt( px, pz );
			let dry = 0;
			for ( let k = 0; k < 8; k ++ ) dry += this.terrain.heightAt( px + Math.cos( k * 0.785 ) * 9, pz + Math.sin( k * 0.785 ) * 9 ) > 1.3 ? 1 : 0;
			const s = bio[ 0 ] * ( 1 - bio[ 1 ] ) * ( h > 2 ? 1 : 0 ) * dry / 8;
			if ( s > score ) {

				score = s;
				best = new THREE.Vector2( px, pz );

			}

		}

		return best;

	}

	// debug framing for ?follow=... (and forced poses for screenshots)
	debugTarget( name ) {

		const at = ( a, y ) => a.mesh.position.clone().add( V( 0, y, 0 ) );
		// studio: ?follow=studio-stag|studio-hind|studio-marmot|studio-squirrel (side view)
		if ( name.startsWith( 'studio-' ) ) {

			// studio-<animal>[-<pose>]
			const [ k, pose ] = name.slice( 7 ).split( '-' );
			const a = k === 'stag' ? this.deer[ 0 ] : k === 'hind' ? this.deer[ 1 ] : k === 'marmot' ? this.marmots[ 0 ] : this.squirrels[ 0 ];
			a.forced = k === 'stag' || k === 'hind' ? ( pose || 'stagup' ) : ( k === 'marmot' ? ( pose || 'forage' ) : undefined );
			if ( k === 'squirrel' ) {

				a.state = pose === 'hop' ? 'hop' : 'forage';
				a.timer = 1e9;
				a.climb = 0;
				if ( pose === 'hop' ) { a.hop = ( a.hop + 0.01 ) % 1; a.from.copy( a.pos ); a.to.copy( a.pos ); }

			}
			const big = k === 'stag' || k === 'hind';
			return { p: at( a, big ? 0.95 : ( k === 'marmot' ? 0.14 : 0.1 ) ), h: 0.0, back: big ? 3.6 : ( k === 'marmot' ? 1.0 : 0.55 ), heading: a.heading };

		}
		if ( name === 'deer' ) return { p: at( this.deer[ 1 ], 0.9 ), h: 1.2, back: 3.8 };
		if ( name === 'stag' ) return { p: at( this.deer[ 0 ], 1.1 ), h: 1.4, back: 4.5 };
		if ( name === 'herd' ) return { p: at( this.deer[ 0 ], 0.8 ), h: 3, back: 18 };
		if ( name.startsWith( 'stag' ) ) {

			this.deer[ 0 ].forced = name;
			return { p: at( this.deer[ 0 ], 1.2 ), h: 1.0, back: 4.2 };

		}

		if ( name === 'marmot' ) return { p: at( this.marmots[ 0 ], 0.15 ), h: 0.45, back: 1.3 };
		if ( name === 'marmotup' ) {

			this.marmots[ 0 ].forced = 'sentinel';
			return { p: at( this.marmots[ 0 ], 0.2 ), h: 0.35, back: 1.2 };

		}

		if ( name === 'squirrel' ) return { p: at( this.squirrels[ 0 ], 0.1 ), h: 0.25, back: 0.7 };
		return null;

	}

	_ground( p ) {

		return this.terrain.heightAt( p.x, p.z );

	}

	// ------------------------------------------------------------------ deer
	_updateDeer( d, dt, time, cam, dusk ) {

		const dx = cam.x - d.pos.x, dz = cam.z - d.pos.z;
		const dist = Math.hypot( dx, dz );
		const rng = this.rng;
		d.timer -= dt;
		if ( dist > 60 ) d.wary = false;
		if ( d.forced ) {

			const f = d.forced;
			if ( f === 'stagup' ) d.pose = true;
			d.state = f === 'stagup' ? 'alert' : f === 'stagroar' ? 'roar' : f === 'stagwalk' ? 'walk' : f === 'stagrun' ? 'flee' : 'graze';
			d.timer = 5;
			d.fleeDir = d.heading;
			d.target.set( d.pos.x + Math.sin( d.heading ) * 50, 0, d.pos.z + Math.cos( d.heading ) * 50 );

		} else if ( dist < 24 && d.state !== 'flee' ) {

			d.state = 'flee';
			d.timer = rng.range( 6, 9 );
			d.fleeDir = Math.atan2( - dx, - dz ) + rng.range( - 0.4, 0.4 );
			if ( d.stag ) this.audio?.bark?.( d.pos );

		} else if ( dist < 45 && ( d.state === 'graze' || d.state === 'walk' ) && ! d.wary ) {

			d.wary = true;

			d.state = 'alert';
			d.timer = rng.range( 3, 6 );

		}

		switch ( d.state ) {

			case 'graze':
				d.speed = damp( d.speed, 0, 3, dt );
				if ( d.timer <= 0 ) {

					d.state = 'walk';
					d.timer = rng.range( 3, 7 );
					d.target.copy( this._dryPoint( d.home.x, d.home.y, 4, 18 ) );

				}

				if ( d.stag && dusk > 0.1 ) {

					d.roarTimer -= dt;
					if ( d.roarTimer <= 0 ) {

						d.state = 'roar';
						d.timer = 3.2;
						d.roarTimer = rng.range( 25, 60 );
						this.audio?.roar?.( d.pos );

					}

				}

				break;
			case 'walk': {

				const tx = d.target.x - d.pos.x, tz = d.target.z - d.pos.z;
				d.heading = turnToward( d.heading, Math.atan2( tx, tz ), dt * 1.2 );
				d.speed = damp( d.speed, 1.1, 2, dt );
				if ( Math.hypot( tx, tz ) < 1 || d.timer <= 0 ) {

					d.state = 'graze';
					d.timer = rng.range( 6, 16 );

				}

				break;

			}

			case 'alert':
				d.speed = damp( d.speed, 0, 4, dt );
				if ( d.timer <= 0 ) {

					d.state = dist < 32 ? 'walk' : 'graze';
					d.timer = rng.range( 4, 8 );
					d.target.copy( this._dryPoint( d.pos.x - dx / dist * 12, d.pos.z - dz / dist * 12, 0, 6 ) );

				}

				break;
			case 'flee':
				d.heading = turnToward( d.heading, d.fleeDir, dt * 3 );
				d.speed = damp( d.speed, 8, 3, dt );
				if ( d.timer <= 0 ) {

					d.state = 'walk';
					d.timer = 3;
					d.home.set( d.pos.x, d.pos.z );
					d.target.copy( d.pos );

				}

				break;
			case 'roar':
				d.speed = 0;
				if ( d.timer <= 0 ) {

					d.state = 'graze';
					d.timer = rng.range( 5, 10 );

				}

				break;

		}

		const moving = ! d.forced || d.forced === 'stagwalk' || d.forced === 'stagrun';
		if ( moving && d.speed > 0.01 ) {

			// look a couple of metres ahead: if that is the strand or the lake, veer inland
			const ax = d.pos.x + Math.sin( d.heading ) * 2.5, az = d.pos.z + Math.cos( d.heading ) * 2.5;
			if ( this.terrain.heightAt( ax, az ) < 1.0 ) {

				const inland = this._inland( d.pos );
				d.heading = turnToward( d.heading, inland, dt * 3.5 );
				d.fleeDir = inland;
				if ( d.state === 'walk' ) d.target.copy( this._dryPoint( d.home.x, d.home.y, 2, 10 ) );

			}

			const nx = d.pos.x + Math.sin( d.heading ) * d.speed * dt, nz = d.pos.z + Math.cos( d.heading ) * d.speed * dt;
			if ( this.terrain.heightAt( nx, nz ) >= 0.8 || this.terrain.heightAt( nx, nz ) > this.terrain.heightAt( d.pos.x, d.pos.z ) ) {

				d.pos.x = nx;
				d.pos.z = nz;

			} else d.speed = damp( d.speed, 0, 6, dt );

		}

		const g = this._ground( d.pos );
		const s = d.mesh.scale.x;
		d.mesh.position.set( d.pos.x, g, d.pos.z );
		d.mesh.rotation.set( 0, d.heading, 0 );
		const B = d.bones;
		const slope = this.terrain.heightAt( d.pos.x + Math.sin( d.heading ), d.pos.z + Math.cos( d.heading ) ) - g;
		const body = B.get( 'body' );
		body.rotation.x = - Math.atan( slope ) * 0.6;

		// ---- gait ----
		const running = d.speed > 3;
		const stride = running ? 3.4 : 1.25; // metres per cycle
		d.phase = ( d.phase + d.speed * dt / ( stride * s ) + 1 ) % 1;
		const amp = running ? 1 : Math.min( 1, d.speed / 1.1 );
		for ( const [ side, sgn ] of [ [ 'L', 0 ], [ 'R', 0.5 ] ] ) {

			// lateral-sequence walk (LH, LF, RH, RF); bounding gallop pairs the legs
			const offF = running ? 0.1 + sgn * 0.24 : 0.25 + sgn;
			const offH = running ? 0.6 + sgn * 0.24 : sgn;
			for ( const [ front, off ] of [ [ true, offF ], [ false, offH ] ] ) {

				const ph = ( d.phase + off ) * Math.PI * 2;
				const swing = Math.sin( ph ); // +: leg forward
				const lift = Math.max( 0, Math.cos( ph ) ); // raised during the forward swing
				const a = running ? 0.75 : 0.32 * amp;
				if ( front ) {

					B.get( 'fS' + side ).rotation.x = - swing * a * 0.8;
					B.get( 'fE' + side ).rotation.x = - lift * a * 0.35;
					B.get( 'fK' + side ).rotation.x = lift * a * 2.0;
					B.get( 'fF' + side ).rotation.x = lift * a * 0.8;

				} else {

					B.get( 'hH' + side ).rotation.x = - swing * a * 0.7;
					B.get( 'hS' + side ).rotation.x = - lift * a * 0.5;
					B.get( 'hC' + side ).rotation.x = lift * a * 1.1;
					B.get( 'hF' + side ).rotation.x = lift * a * 0.6;

				}

			}

		}

		const bodyRest = d.rest.get( 'body' );
		body.position.y = bodyRest.y + ( running ? Math.abs( Math.sin( d.phase * Math.PI * 2 ) ) * 0.1 - 0.03 : Math.abs( Math.sin( d.phase * Math.PI * 4 ) ) * 0.012 * amp );
		body.rotation.x += running ? Math.sin( d.phase * Math.PI * 2 ) * 0.08 : 0;

		// ---- neck & head ----
		let neckT = 0, headT = 0, yawT = 0;
		if ( d.state === 'graze' ) {

			neckT = 1.25 + Math.sin( time * 0.7 + d.phase * 10 ) * 0.05;
			headT = 0.55;
			// the occasional glance up between mouthfuls
			if ( Math.sin( time * 0.21 + d.phase * 13 ) > 0.93 ) neckT = 0.25;

		} else if ( d.state === 'alert' ) {

			neckT = - 0.05;
			headT = 0.0;
			yawT = d.pose ? 0 : THREE.MathUtils.clamp( wrapAngle( Math.atan2( dx, dz ) - d.heading ), - 1.1, 1.1 );

		} else if ( d.state === 'roar' ) {

			neckT = 0.25;
			headT = - 1.0;

		} else if ( d.state === 'flee' ) {

			neckT = 0.1;
			headT = 0.1;

		} else if ( d.state === 'walk' ) {

			neckT = 0.35 + Math.sin( d.phase * Math.PI * 4 ) * 0.04;
			headT = 0.25;

		}

		d.neck = damp( d.neck, neckT, 2.5, dt );
		d.head = damp( d.head, headT, 3, dt );
		d.yaw = damp( d.yaw, yawT, 3, dt );
		B.get( 'neck1' ).rotation.set( d.neck * 0.65, d.yaw * 0.4, 0, 'YXZ' );
		B.get( 'neck2' ).rotation.set( d.neck * 0.35, d.yaw * 0.3, 0, 'YXZ' );
		B.get( 'head' ).rotation.set( d.head, d.yaw * 0.3, 0, 'YXZ' );
		// ears swivel and flick
		d.earT -= dt;
		const flick = d.earT < 0.15 ? Math.sin( d.earT / 0.15 * Math.PI ) * 0.5 : 0;
		if ( d.earT < 0 ) d.earT = rng.range( 1.5, 6 );
		const alertEars = d.state === 'alert' ? - 0.4 : 0;
		B.get( 'earL' ).rotation.set( alertEars, 0, flick );
		B.get( 'earR' ).rotation.set( alertEars, 0, - flick * 0.6 );
		B.get( 'tail' ).rotation.x = d.state === 'flee' ? - 0.9 : Math.sin( time * 3 + d.phase * 20 ) * 0.08;

	}

	// --------------------------------------------------------------- marmots
	_updateMarmot( m, dt, time, cam ) {

		const dist = Math.hypot( cam.x - m.pos.x, cam.z - m.pos.z );
		const rng = this.rng;
		m.timer -= dt;
		if ( m.forced ) {

			m.state = m.forced;
			m.timer = 5;

		} else if ( m.state !== 'hide' && m.state !== 'dive' ) {

			if ( dist < 8 ) {

				m.state = 'dive';
				if ( ! m.warned ) this.audio?.whistle?.( m.pos );
				m.warned = true;

			} else if ( dist < 24 && m.state !== 'sentinel' && ! m.watched ) {

				m.state = 'sentinel';
				m.watched = true;
				m.timer = rng.range( 6, 12 );
				if ( dist < 16 ) this.audio?.whistle?.( m.pos );

			}

			if ( dist > 32 ) m.watched = false;

		}

		let speed = 0;
		let sitT = 0;
		switch ( m.state ) {

			case 'forage':
				if ( m.timer <= 0 ) {

					m.target.set( m.burrow.x + rng.range( - 3.5, 3.5 ), 0, m.burrow.z + rng.range( - 3.5, 3.5 ) );
					m.state = 'amble';
					m.timer = 4;

				}

				break;
			case 'amble': {

				const tx = m.target.x - m.pos.x, tz = m.target.z - m.pos.z;
				m.heading = turnToward( m.heading, Math.atan2( tx, tz ), dt * 4 );
				speed = 0.5;
				if ( Math.hypot( tx, tz ) < 0.3 || m.timer <= 0 ) {

					m.state = rng.next() < 0.5 ? 'sentinel' : 'forage';
					m.timer = m.state === 'sentinel' ? rng.range( 5, 12 ) : rng.range( 3, 9 );

				}

				break;

			}

			case 'sentinel':
				sitT = 1;
				if ( dist < 30 ) m.heading = turnToward( m.heading, Math.atan2( cam.x - m.pos.x, cam.z - m.pos.z ), dt * 3 );
				if ( m.timer <= 0 && dist > 13 ) {

					m.state = 'forage';
					m.timer = rng.range( 3, 8 );
					m.warned = false;

				}

				break;
			case 'dive': {

				const tx = m.burrow.x - m.pos.x, tz = m.burrow.z - m.pos.z;
				m.heading = turnToward( m.heading, Math.atan2( tx, tz ), dt * 8 );
				speed = 3.2;
				if ( Math.hypot( tx, tz ) < 0.4 ) {

					m.state = 'hide';
					m.timer = rng.range( 12, 25 );

				}

				break;

			}

			case 'hide':
				if ( m.timer <= 0 && dist > 20 ) {

					m.state = 'sentinel';
					m.timer = rng.range( 5, 10 );
					m.warned = false;

				}

				break;

		}

		m.pos.x += Math.sin( m.heading ) * speed * dt;
		m.pos.z += Math.cos( m.heading ) * speed * dt;
		m.sit = damp( m.sit, sitT, 5, dt );
		m.sink = damp( m.sink, m.state === 'hide' ? 1 : 0, 4, dt );
		const g = this._ground( m.pos );
		m.mesh.position.set( m.pos.x, g - m.sink * 0.45, m.pos.z );
		m.mesh.rotation.y = m.heading;
		m.mesh.visible = m.sink < 0.98;
		const B = m.bones;
		// sit up about the haunches, forepaws tucked to the chest, head level
		B.get( 'body' ).rotation.x = - m.sit * 0.8;
		B.get( 'chest' ).rotation.x = - m.sit * 0.55;
		const nod = m.state === 'forage' ? 0.4 + Math.sin( time * 6 + m.phase ) * 0.1 : 0;
		B.get( 'head' ).rotation.x = m.sit * 1.2 + nod;
		const gait = speed > 0 ? Math.sin( time * speed * 11 + m.phase ) : 0;
		B.get( 'body' ).position.y = m.rest.get( 'body' ).y + Math.abs( gait ) * 0.012 * speed;
		for ( const s of [ 'L', 'R' ] ) {

			const k = s === 'L' ? 1 : - 1;
			B.get( 'f' + s ).rotation.x = m.sit * 1.3 + gait * 0.7 * k;
			B.get( 'h' + s ).rotation.x = m.sit * 0.9 - gait * 0.6 * k;

		}

		B.get( 'tail' ).rotation.x = m.sit * 0.8 + Math.sin( time * 2 + m.phase ) * 0.05;

	}

	// ------------------------------------------------------------- squirrels
	_updateSquirrel( q, dt, time, cam ) {

		const rng = this.rng;
		const t = q.tree;
		const dist = Math.hypot( cam.x - q.pos.x, cam.z - q.pos.z );
		q.timer -= dt;
		if ( dist < ( q.perch ? 6 : 17 ) && q.state !== 'climb' && q.state !== 'up' ) {

			q.state = 'climb';
			q.onPerch = false;
			q.from.copy( q.pos );
			q.hop = 0;
			this.audio?.chatter?.( q.pos );

		}

		const trunkR = 0.3 * t.s + 0.06;
		switch ( q.state ) {

			case 'forage':
				if ( q.timer <= 0 ) {

					q.from.copy( q.pos );
					q.fromY = q.onPerch ? q.perch.top : this._ground( q.pos );
					q.toPerch = !! q.perch && ! q.onPerch && rng.next() < 0.45;
					if ( q.toPerch ) {

						q.to.set( q.perch.x, 0, q.perch.z );

					} else {

						const c = q.perch || t;
						const a = rng.next() * Math.PI * 2, r = q.perch ? rng.range( 0.8, 3.5 ) : rng.range( 1.2, 4.5 );
						q.to.set( c.x + Math.cos( a ) * r, 0, c.z + Math.sin( a ) * r );

					}

					q.toY = q.toPerch ? q.perch.top : this._ground( q.to );
					q.state = 'hop';
					q.hop = 0;

				}

				break;
			case 'hop': {

				const len = q.from.distanceTo( q.to );
				q.hop = Math.min( 1, q.hop + dt * 2.6 / Math.max( len, 0.3 ) );
				q.pos.lerpVectors( q.from, q.to, q.hop );
				q.heading = Math.atan2( q.to.x - q.from.x, q.to.z - q.from.z );
				if ( q.hop >= 1 ) {

					q.state = 'forage';
					q.onPerch = !! q.toPerch;
					q.timer = q.onPerch ? rng.range( 4, 10 ) : rng.range( 1, 5 );

				}

				break;

			}

			case 'climb': {

				const a = Math.atan2( q.pos.x - t.x, q.pos.z - t.z );
				const bx = t.x + Math.sin( a ) * trunkR, bz = t.z + Math.cos( a ) * trunkR;
				if ( Math.hypot( bx - q.pos.x, bz - q.pos.z ) > 0.1 && q.climb === 0 ) {

					q.heading = Math.atan2( bx - q.pos.x, bz - q.pos.z );
					q.pos.x += Math.sin( q.heading ) * 5 * dt;
					q.pos.z += Math.cos( q.heading ) * 5 * dt;

				} else {

					q.climb += dt * 2.2;
					if ( q.climb > 7 ) {

						q.state = 'up';
						q.timer = rng.range( 15, 30 );

					}

				}

				break;

			}

			case 'up':
				if ( q.timer <= 0 && dist > ( q.perch ? 9 : 20 ) ) {

					q.climb = Math.max( 0, q.climb - dt * 1.5 );
					if ( q.climb === 0 ) {

						q.state = 'forage';
						q.timer = 2;

					}

				}

				break;

		}

		const g = this._ground( q.pos );
		const B = q.bones;
		const hopPh = q.state === 'hop' ? ( q.hop * 3 ) % 1 : 0;
		const hopY = q.state === 'hop' ? Math.sin( hopPh * Math.PI ) * 0.1 : 0;
		if ( q.climb > 0 ) {

			const a = Math.atan2( q.pos.x - t.x, q.pos.z - t.z ) + q.climb * 0.25;
			q.mesh.position.set( t.x + Math.sin( a ) * trunkR, g + q.climb, t.z + Math.cos( a ) * trunkR );
			q.mesh.rotation.set( - Math.PI / 2, a + Math.PI, 0, 'YXZ' );
			B.get( 'chest' ).rotation.x = 0;

		} else {

			let y = q.onPerch ? q.perch.top : g;
			if ( q.state === 'hop' && q.fromY !== undefined ) y = THREE.MathUtils.lerp( q.fromY, q.toY, q.hop ) + Math.sin( q.hop * Math.PI ) * Math.abs( q.toY - q.fromY ) * 0.6;
			q.mesh.position.set( q.pos.x, y + hopY, q.pos.z );
			q.mesh.rotation.set( 0, q.heading, 0, 'YXZ' );
			// forage: sit up with paws to the mouth, nibbling
			const sit = q.state === 'forage' ? 1 : 0;
			// sits on its haunches: only the chest rears up
			B.get( 'body' ).rotation.x = 0;
			B.get( 'chest' ).rotation.x = - sit * 0.7;
			B.get( 'head' ).rotation.x = sit * 0.7 + Math.sin( time * 14 ) * 0.03 * sit;
			for ( const s of [ 'L', 'R' ] ) B.get( 'f' + s ).rotation.x = - sit * 1.3 + ( q.state === 'hop' ? Math.sin( hopPh * Math.PI * 2 ) * 0.8 : 0 );

		}

		// the tail flows and flicks
		B.get( 'tail1' ).rotation.x = q.state === 'hop' ? - 0.5 : Math.sin( time * 1.3 ) * 0.05;
		B.get( 'tail2' ).rotation.x = Math.sin( time * 2.1 + 1 ) * 0.1;
		B.get( 'tail3' ).rotation.x = Math.sin( time * 2.7 + 2 ) * 0.15 + ( Math.sin( time * 0.9 ) > 0.95 ? 0.4 : 0 );

	}

	// fur only where it can be seen
	lod( camera ) {

		const c = camera.position;
		for ( const a of [ ...this.deer, ...this.marmots, ...this.squirrels ] ) {

			if ( a.fur ) a.fur.visible = a.mesh.visible && a.mesh.position.distanceTo( c ) < a.furFar * ( 55 / camera.fov );

		}

	}

	update( dt, time, camera, dusk ) {

		const cam = camera.position;
		for ( const d of this.deer ) this._updateDeer( d, dt, time, cam, dusk );
		for ( const m of this.marmots ) this._updateMarmot( m, dt, time, cam );
		for ( const q of this.squirrels ) this._updateSquirrel( q, dt, time, cam );

	}

}
