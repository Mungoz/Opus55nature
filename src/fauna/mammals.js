import * as THREE from 'three';
import { creatureMaterial, furMaterial, furGeometry, addFur } from './creature.js';
import { buildMarmot, buildSquirrel, buildHare, buildBear } from './mammalModels.js';
import { buildDeer } from './deerModel.js';
import { burrowGeometry, TUNNEL } from './burrow.js';
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
	// A sphere that holds the animal in any pose: the bones only bob and bend about the body, so
	// twice the rest-pose radius is ample. With it, animals out of a pass's view (the main
	// camera, the mirrors, the sun's shadow camera) are skipped there. The shadow pass
	// updates the skeleton itself, so an unseen animal's shadow still moves.
	const geo = proto.mesh.geometry;
	if ( ! geo.boundingSphere ) geo.computeBoundingSphere();
	mesh.boundingSphere = geo.boundingSphere.clone();
	mesh.boundingSphere.radius = mesh.boundingSphere.radius * 2 + 0.25;
	mesh.frustumCulled = true;
	if ( fur ) {

		fur.boundingSphere = mesh.boundingSphere;
		fur.frustumCulled = true;

	}

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
		const hareProto = buildHare( this.material );
		const bearProto = buildBear( this.material );
		// fur: shells drawn over the skin, only near the camera
		const shells = quality.fur ?? 12;
		// (hairs a centimetre or two long are sub-pixel beyond these distances at 55 degrees)
		for ( const [ p, far ] of [ [ stagProto, 28 ], [ hindProto, 28 ], [ marmotProto, 16 ], [ squirrelProto, 10 ], [ hareProto, 16 ], [ bearProto, 45 ] ] ) {

			if ( ! p.fur || ! shells ) continue;
			const n = Math.round( shells * ( p.fur.shells ?? 1 ) );
			p.furGeo = furGeometry( p.mesh.geometry, n );
			p.furMat = furMaterial( { density: p.fur.density, shells: n } );
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

		// --- a marmot colony on the turf just in front of the start: burrows (mounds of
		// spoil with a real tunnel), and the marmots that live in them
		this.burrows = [];
		const burrowGeos = [ burrowGeometry( 1, true ), burrowGeometry( 2, false ), burrowGeometry( 3, true ), burrowGeometry( 4, false ) ];
		[ [ 1, 494.5 ], [ 10, 497 ], [ 6, 488.5 ], [ - 4, 490 ] ].forEach( ( [ x, z ], i ) => {

			// the holes face roughly toward the start, so people see into them
			const h = Math.atan2( - 5 - x, 508 - z ) + ( i % 2 ? 0.55 : - 0.45 );
			const y = this.terrain.heightAt( x, z );
			const mesh = new THREE.Mesh( burrowGeos[ i ], this.material );
			mesh.position.set( x, y, z );
			mesh.rotation.y = h;
			mesh.castShadow = mesh.receiveShadow = true;
			mesh.name = 'burrow';
			this.group.add( mesh );
			mesh.updateMatrixWorld();
			const w = ( p ) => p.clone().applyMatrix4( mesh.matrixWorld );
			this.burrows.push( { pos: V( x, y, z ), heading: h, mouth: w( TUNNEL.mouth ), entry: w( TUNNEL.entry ), deep: w( TUNNEL.deep ) } );

		} );

		this.marmots = [];
		for ( let i = 0; i < 7; i ++ ) {

			const m = instance( marmotProto );
			m.home = this.burrows[ i % this.burrows.length ];
			m.burrow = m.home.mouth;
			m.pos = m.burrow.clone().add( V( rng.range( - 3, 3 ), 0, rng.range( - 3, 3 ) ) );
			m.heading = rng.next() * Math.PI * 2;
			m.state = 'forage';
			m.timer = rng.range( 3, 8 );
			m.sit = 0;
			m.tun = 0;
			m.pitch = 0;
			m.phase = rng.next() * 10;
			m.target = m.pos.clone();
			m.mesh.name = 'marmot';
			// a big old Alpine marmot is the size of a small dog
			m.mesh.scale.setScalar( i >= 5 ? rng.range( 0.75, 0.85 ) : rng.range( 1.08, 1.22 ) );
			this.group.add( m.mesh );
			this.marmots.push( m );

		}

		// --- red squirrels at the foot of the nearest conifers
		this.squirrels = [];
		const cands = forest.trees
			.filter( ( t ) => t.variant < 6 && t !== forest.spawnVignette?.tree && Math.hypot( t.x + 5, t.z - 508 ) > 25 && Math.hypot( t.x + 5, t.z - 508 ) < 170 )
			.sort( ( a, b ) => Math.hypot( a.x + 5, a.z - 508 ) - Math.hypot( b.x + 5, b.z - 508 ) );
		const nearTrees = [];
		for ( const t of cands ) {

			if ( nearTrees.length >= 6 ) break;
			if ( nearTrees.every( ( o ) => Math.hypot( o.x - t.x, o.z - t.z ) > 28 ) ) nearTrees.push( t );

		}
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


		// --- mountain hares in the meadows round the start
		this.hares = [];
		for ( const [ x, z ] of [ [ 26, 543 ], [ - 34, 552 ], [ 58, 528 ] ] ) {

			const h = instance( hareProto );
			h.pos = this._dryPoint( x, z, 0, 6 );
			h.home = h.pos.clone();
			h.heading = rng.next() * Math.PI * 2;
			h.state = 'feed';
			h.timer = rng.range( 2, 8 );
			h.hop = 0;
			h.sit = 0;
			h.pitch = 0;
			h.phase = rng.next() * 10;
			h.target = h.pos.clone();
			h.mesh.name = 'hare';
			this.group.add( h.mesh );
			this.hares.push( h );

		}

		// --- a brown bear working along the wood edge, across the meadow from the start
		this.bears = [];
		{

			const b = instance( bearProto );
			b.home = new THREE.Vector2( - 115, 625 );
			b.route = [ [ - 112, 622 ], [ - 74, 552 ], [ - 58, 518 ], [ - 88, 505 ], [ - 96, 575 ], [ - 132, 590 ] ].map( ( [ x, z ] ) => new THREE.Vector2( x, z ) );
			b.leg = 1;
			b.pos = this._dryPoint( - 88, 560, 0, 10 );
			b.heading = rng.next() * Math.PI * 2;
			b.state = 'walk';
			b.timer = rng.range( 30, 60 );
			b.target = this._dryPoint( b.route[ 1 ].x, b.route[ 1 ].y, 0, 5 );
			b.speed = 0;
			b.phase = 0;
			b.neck = 0.3;
			b.headP = 0.2;
			b.yaw = 0;
			b.mesh.name = 'bear';
			this.group.add( b.mesh );
			this.bears.push( b );

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
			const a = k === 'stag' ? this.deer[ 0 ] : k === 'hind' ? this.deer[ 1 ] : k === 'marmot' ? this.marmots[ 0 ] : k === 'hare' ? this.hares[ 0 ] : k === 'bear' ? this.bears[ 0 ] : this.squirrels[ 0 ];
			if ( k === 'hare' ) { a.forced = pose || 'feed'; return { p: at( a, 0.14 ), h: 0.0, back: 0.9, heading: a.heading, animal: a }; }
			if ( k === 'bear' ) { a.forced = pose || 'look'; return { p: at( a, 0.7 ), h: 0.0, back: 4.2, heading: a.heading, animal: a }; }
			a.forced = k === 'stag' || k === 'hind' ? ( pose || 'stagup' ) : ( k === 'marmot' ? ( pose || 'forage' ) : undefined );
			if ( k === 'squirrel' ) {

				a.state = pose === 'hop' ? 'hop' : 'forage';
				a.timer = 1e9;
				a.climb = 0;
				if ( pose === 'hop' ) { a.hop = ( a.hop + 0.01 ) % 1; a.from.copy( a.pos ); a.to.copy( a.pos ); }

			}
			const big = k === 'stag' || k === 'hind';
			return { p: at( a, big ? 0.95 : ( k === 'marmot' ? 0.14 : 0.1 ) ), h: 0.0, back: big ? 3.6 : ( k === 'marmot' ? 1.0 : 0.55 ), heading: a.heading, animal: a };

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
		const home = m.home;
		m.timer -= dt;
		if ( m.forced ) {

			m.state = m.forced;
			m.timer = 5;

		} else if ( m.state !== 'hide' && m.state !== 'dive' && m.state !== 'enter' && m.state !== 'emerge' ) {

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
		let pitchT = 0;
		let yOff = 0;
		switch ( m.state ) {

			case 'forage':
				if ( m.timer <= 0 ) {

					// graze out from the burrow, never far from it
					const a = rng.next() * Math.PI * 2, r = rng.range( 1.2, 4.5 );
					m.target.set( home.mouth.x + Math.cos( a ) * r, 0, home.mouth.z + Math.sin( a ) * r );
					m.state = 'amble';
					m.timer = 5;

				}

				break;
			case 'amble': {

				const tx = m.target.x - m.pos.x, tz = m.target.z - m.pos.z;
				m.heading = turnToward( m.heading, Math.atan2( tx, tz ), dt * 4 );
				speed = 0.5;
				if ( Math.hypot( tx, tz ) < 0.3 || m.timer <= 0 ) {

					m.state = rng.next() < 0.45 ? 'sentinel' : 'forage';
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

				// scuttle to the mouth of the burrow...
				const tx = home.mouth.x - m.pos.x, tz = home.mouth.z - m.pos.z;
				m.heading = turnToward( m.heading, Math.atan2( tx, tz ), dt * 9 );
				speed = Math.min( 3.2, Math.hypot( tx, tz ) * 4 + 0.6 );
				if ( Math.hypot( tx, tz ) < 0.12 ) {

					m.state = 'enter';
					m.tun = 0;

				}

				break;

			}

			case 'enter':
			case 'emerge': {

				// ...and head first down the tunnel (or back up it, looking out)
				const into = m.state === 'enter';
				m.tun = Math.min( 1, m.tun + dt * ( into ? 1.8 : 0.6 ) );
				const u = into ? m.tun : 1 - m.tun;
				const p = u < 0.4 ? home.mouth.clone().lerp( home.entry, u / 0.4 ) : home.entry.clone().lerp( home.deep, ( u - 0.4 ) / 0.6 );
				m.pos.set( p.x, 0, p.z );
				yOff = p.y - this._ground( p );
				m.heading = home.heading + ( into ? Math.PI : 0 );
				pitchT = u > 0.3 ? ( into ? 0.5 : - 0.45 ) : 0;
				speed = 0.0001;
				if ( m.tun >= 1 ) {

					if ( into ) {

						m.state = 'hide';
						m.timer = rng.range( 12, 25 );

					} else {

						m.state = 'sentinel';
						m.timer = rng.range( 6, 12 );
						m.warned = false;

					}

				}

				break;

			}

			case 'hide':
				if ( m.timer <= 0 && dist > 20 ) {

					m.state = 'emerge';
					m.tun = 0;

				}

				break;

		}

		if ( m.state !== 'enter' && m.state !== 'emerge' ) {

			m.pos.x += Math.sin( m.heading ) * speed * dt;
			m.pos.z += Math.cos( m.heading ) * speed * dt;

		}

		m.sit = damp( m.sit, sitT, 5, dt );
		m.pitch = damp( m.pitch, pitchT, 8, dt );
		const g = this._ground( m.pos );
		m.mesh.position.set( m.pos.x, g + yOff, m.pos.z );
		m.mesh.rotation.set( m.pitch, m.heading, 0, 'YXZ' );
		m.mesh.visible = m.state !== 'hide';
		const B = m.bones;
		// sit up about the haunches, forepaws tucked to the chest, head level
		B.get( 'body' ).rotation.x = - m.sit * 0.8;
		B.get( 'chest' ).rotation.x = - m.sit * 0.55;
		const nod = m.state === 'forage' ? 0.4 + Math.sin( time * 6 + m.phase ) * 0.1 : 0;
		B.get( 'head' ).rotation.x = m.sit * 1.2 + nod;
		const moving = speed > 0 || m.state === 'enter' || m.state === 'emerge';
		const gs = m.state === 'enter' ? 3 : m.state === 'emerge' ? 1.2 : speed;
		const gait = moving ? Math.sin( time * gs * 11 + m.phase ) : 0;
		B.get( 'body' ).position.y = m.rest.get( 'body' ).y + Math.abs( gait ) * 0.012 * Math.min( gs, 3 );
		for ( const s of [ 'L', 'R' ] ) {

			const k = s === 'L' ? 1 : - 1;
			B.get( 'f' + s ).rotation.x = m.sit * 1.3 + gait * 0.7 * k;
			B.get( 'h' + s ).rotation.x = m.sit * 0.9 - gait * 0.6 * k;

		}

		// the tail flicks up as it runs
		B.get( 'tail' ).rotation.x = m.sit * 0.8 + Math.sin( time * 2 + m.phase ) * 0.05 - ( m.state === 'dive' || m.state === 'enter' ? 0.5 : 0 );

	}

	// ----------------------------------------------------------------- hares
	_updateHare( h, dt, time, cam ) {

		const rng = this.rng;
		const dx = cam.x - h.pos.x, dz = cam.z - h.pos.z;
		const dist = Math.hypot( dx, dz );
		h.timer -= dt;
		if ( h.forced ) {

			h.state = h.forced;
			h.timer = 5;

		} else if ( dist < 13 && h.state !== 'flee' ) {

			h.state = 'flee';
			h.timer = rng.range( 3, 5 );
			h.fleeDir = Math.atan2( - dx, - dz ) + rng.range( - 0.5, 0.5 );
			h.zig = 0;

		} else if ( dist < 28 && h.state === 'feed' ) {

			h.state = 'alert';
			h.timer = rng.range( 3, 6 );

		}

		let speed = 0, sitT = 0, headT = 0.1, earT = 0;
		switch ( h.state ) {

			case 'feed':
				headT = 0.55 + Math.sin( time * 7 + h.phase ) * 0.04;
				earT = - 0.5;
				if ( h.timer <= 0 ) {

					h.state = rng.next() < 0.6 ? 'hop' : 'alert';
					h.timer = rng.range( 2, 5 );
					h.target.copy( this._dryPoint( h.home.x, h.home.z, 1, 7 ) );

				}

				break;
			case 'alert':
				sitT = 1;
				headT = - 0.15;
				if ( dist < 40 ) h.heading = turnToward( h.heading, Math.atan2( dx, dz ) + Math.PI * 0.5, dt * 1.5 );
				if ( h.timer <= 0 && dist > 22 ) {

					h.state = 'feed';
					h.timer = rng.range( 4, 12 );

				}

				break;
			case 'hop': {

				const tx = h.target.x - h.pos.x, tz = h.target.z - h.pos.z;
				h.heading = turnToward( h.heading, Math.atan2( tx, tz ), dt * 5 );
				speed = 1.4;
				if ( Math.hypot( tx, tz ) < 0.3 || h.timer <= 0 ) {

					h.state = 'feed';
					h.timer = rng.range( 4, 12 );

				}

				break;

			}

			case 'flee':
				// bounding away, jinking now and then
				h.zig -= dt;
				if ( h.zig <= 0 ) {

					h.fleeDir += rng.range( - 0.8, 0.8 );
					h.zig = rng.range( 0.5, 1.1 );

				}

				h.heading = turnToward( h.heading, h.fleeDir, dt * 6 );
				speed = 7;
				earT = - 0.9;
				if ( h.timer <= 0 ) {

					h.state = 'alert';
					h.timer = rng.range( 4, 8 );
					h.home.copy( this._dryPoint( h.pos.x, h.pos.z, 0, 3 ) );

				}

				break;

		}

		// never into the water
		const nx = h.pos.x + Math.sin( h.heading ) * speed * dt, nz = h.pos.z + Math.cos( h.heading ) * speed * dt;
		if ( this.terrain.heightAt( nx, nz ) > 0.9 ) {

			h.pos.x = nx;
			h.pos.z = nz;

		} else {

			h.fleeDir = this._inland( h.pos );
			h.heading = turnToward( h.heading, h.fleeDir, dt * 8 );

		}

		// the gait: bounds, hind feet landing ahead of the forefeet
		const moving = speed > 0;
		if ( moving ) h.hop = ( h.hop + dt * ( speed > 3 ? 3.2 : 2.6 ) ) % 1;
		else h.hop = 0;
		const p = h.hop;
		const air = moving ? Math.max( 0, Math.sin( p * Math.PI * 2 ) ) : 0;
		const lift = air * ( speed > 3 ? 0.18 : 0.07 );
		h.sit = damp( h.sit, sitT, 5, dt );
		const pitch = moving ? Math.cos( p * Math.PI * 2 ) * ( speed > 3 ? 0.35 : 0.2 ) : 0;
		h.pitch = damp( h.pitch, pitch, 12, dt );
		const g = this._ground( h.pos );
		h.mesh.position.set( h.pos.x, g + lift, h.pos.z );
		h.mesh.rotation.set( h.pitch - h.sit * 0.35, h.heading, 0, 'YXZ' );
		const B = h.bones;
		B.get( 'chest' ).rotation.x = - h.sit * 0.35;
		B.get( 'head' ).rotation.x = damp( B.get( 'head' ).rotation.x, headT + h.sit * 0.5, 6, dt );
		for ( const [ s, sd ] of [ [ 'L', 1 ], [ 'R', - 1 ] ] ) {

			B.get( 'ear' + s ).rotation.x = damp( B.get( 'ear' + s ).rotation.x, earT, 6, dt );
			B.get( 'ear' + s ).rotation.z = Math.sin( time * 0.7 + h.phase + sd ) * 0.08;
			// forelegs reach on landing, hind legs thrust on take-off
			B.get( 'f' + s ).rotation.x = moving ? - Math.sin( p * Math.PI * 2 + 0.6 ) * 0.9 : h.sit * 0.2;
			B.get( 'h' + s ).rotation.x = moving ? Math.sin( p * Math.PI * 2 - 0.4 ) * 0.9 : 0;

		}

		B.get( 'tail' ).rotation.x = moving ? - 0.4 : 0;

	}

	// ------------------------------------------------------------------ bears
	// the next stop on the bear's round
	_bearNext( b ) {

		b.leg = ( b.leg + 1 ) % b.route.length;
		const p = b.route[ b.leg ];
		return this._dryPoint( p.x, p.y, 0, 5 );

	}

	_updateBear( b, dt, time, cam ) {

		const rng = this.rng;
		const dx = cam.x - b.pos.x, dz = cam.z - b.pos.z;
		const dist = Math.hypot( dx, dz );
		b.timer -= dt;
		if ( b.forced ) {

			b.state = b.forced;
			b.timer = 5;

		} else if ( dist < 35 && b.state !== 'leave' ) {

			// a bear that notices you simply walks off
			b.state = 'leave';
			b.timer = rng.range( 10, 16 );
			b.target.copy( this._dryPoint( b.pos.x - dx / dist * 60, b.pos.z - dz / dist * 60, 0, 15 ) );

		}

		let speedT = 0, neckT = 0.35, headT = 0.25, yawT = 0;
		switch ( b.state ) {

			case 'walk':
			case 'leave': {

				const tx = b.target.x - b.pos.x, tz = b.target.z - b.pos.z;
				b.heading = turnToward( b.heading, Math.atan2( tx, tz ), dt * 0.8 );
				speedT = b.state === 'leave' ? 1.5 : 0.95;
				// the head swings low from side to side as it walks
				neckT = 0.5;
				yawT = Math.sin( b.phase * Math.PI * 2 ) * 0.15;
				if ( Math.hypot( tx, tz ) < 2 || b.timer <= 0 ) {

					if ( b.state === 'leave' && dist < 60 ) {

						b.target.copy( this._dryPoint( b.pos.x - dx / dist * 50, b.pos.z - dz / dist * 50, 0, 10 ) );
						b.timer = 10;

					} else {

						b.state = rng.next() < 0.6 ? 'forage' : 'look';
						b.timer = rng.range( 5, 12 );

					}

				}

				break;

			}

			case 'forage':
				// nose down, turning over the turf
				neckT = 1.0;
				headT = 0.6 + Math.sin( time * 2.3 ) * 0.1;
				yawT = Math.sin( time * 0.6 ) * 0.25;
				if ( b.timer <= 0 ) {

					b.state = rng.next() < 0.3 ? 'look' : 'walk';
					b.timer = rng.range( 40, 80 );
					b.target.copy( this._bearNext( b ) );

				}

				break;
			case 'look':
				// head up, scenting the air
				neckT = - 0.05;
				headT = - 0.25 + Math.sin( time * 3.1 ) * 0.04;
				yawT = Math.sin( time * 0.4 ) * 0.5;
				if ( b.timer <= 0 ) {

					b.state = 'walk';
					b.timer = rng.range( 40, 80 );
					b.target.copy( this._bearNext( b ) );

				}

				break;

		}

		b.speed = damp( b.speed, speedT, 2, dt );
		const nx = b.pos.x + Math.sin( b.heading ) * b.speed * dt, nz = b.pos.z + Math.cos( b.heading ) * b.speed * dt;
		if ( this.terrain.heightAt( nx, nz ) > 1.0 ) {

			b.pos.x = nx;
			b.pos.z = nz;

		} else b.heading = turnToward( b.heading, this._inland( b.pos ), dt * 2 );

		const g = this._ground( b.pos );
		b.mesh.position.set( b.pos.x, g, b.pos.z );
		const slope = this.terrain.heightAt( b.pos.x + Math.sin( b.heading ) * 0.8, b.pos.z + Math.cos( b.heading ) * 0.8 ) - g;
		b.mesh.rotation.set( 0, b.heading, 0 );
		const B = b.bones;
		B.get( 'body' ).rotation.x = - Math.atan( slope / 0.8 ) * 0.7;
		// a pacing walk: the legs on each side move nearly together, the whole body rolls
		const stride = 1.6;
		b.phase = ( b.phase + b.speed * dt / stride ) % 1;
		const amp = Math.min( 1, b.speed / 0.95 );
		for ( const [ side, off ] of [ [ 'L', 0 ], [ 'R', 0.5 ] ] ) {

			for ( const [ front, o ] of [ [ true, off + 0.12 ], [ false, off ] ] ) {

				const ph = ( b.phase + o ) * Math.PI * 2;
				const swing = Math.sin( ph ), lift = Math.max( 0, Math.cos( ph ) );
				if ( front ) {

					B.get( 'fS' + side ).rotation.x = - swing * 0.35 * amp;
					B.get( 'fE' + side ).rotation.x = lift * 0.5 * amp;
					B.get( 'fF' + side ).rotation.x = - lift * 0.4 * amp;

				} else {

					B.get( 'hH' + side ).rotation.x = - swing * 0.3 * amp;
					B.get( 'hK' + side ).rotation.x = - lift * 0.45 * amp;
					B.get( 'hF' + side ).rotation.x = lift * 0.4 * amp;

				}

			}

		}

		B.get( 'body' ).rotation.z = Math.sin( b.phase * Math.PI * 2 ) * 0.05 * amp;
		B.get( 'body' ).position.y = b.rest.get( 'body' ).y + Math.abs( Math.sin( b.phase * Math.PI * 2 ) ) * 0.025 * amp;
		b.neck = damp( b.neck, neckT, 2, dt );
		b.headP = damp( b.headP, headT, 2.5, dt );
		b.yaw = damp( b.yaw, yawT, 2, dt );
		B.get( 'neck' ).rotation.set( b.neck * 0.6, b.yaw * 0.5, 0, 'YXZ' );
		B.get( 'head' ).rotation.set( b.headP, b.yaw * 0.5, 0, 'YXZ' );

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
			// forage: it sits bolt upright on its haunches, nibbling what it holds to its mouth,
			// the long hind feet flat on the ground and the tail laid up along its back
			q.sit = damp( q.sit ?? 0, q.state === 'forage' ? 1 : 0, 8, dt );
			const sit = q.sit;
			q.mesh.position.set( q.pos.x, y + hopY + sit * 0.028, q.pos.z );
			q.mesh.rotation.set( 0, q.heading, 0, 'YXZ' );
			B.get( 'body' ).rotation.x = - sit * 0.98;
			B.get( 'chest' ).rotation.x = - sit * 0.18;
			B.get( 'head' ).rotation.x = sit * 1.02 + Math.sin( time * 14 ) * 0.03 * sit;
			for ( const s of [ 'L', 'R' ] ) {

				B.get( 'f' + s ).rotation.x = - sit * 0.75 + ( q.state === 'hop' ? Math.sin( hopPh * Math.PI * 2 ) * 0.8 : 0 );
				B.get( 'h' + s ).rotation.x = sit * 0.82;

			}

		}

		// the tail flows and flicks (laid up along the back while it sits)
		B.get( 'tail1' ).rotation.x = q.state === 'hop' ? - 0.5 : ( q.sit ?? 0 ) * 1.35 + Math.sin( time * 1.3 ) * 0.05;
		B.get( 'tail2' ).rotation.x = Math.sin( time * 2.1 + 1 ) * 0.1;
		B.get( 'tail3' ).rotation.x = Math.sin( time * 2.7 + 2 ) * 0.15 + ( Math.sin( time * 0.9 ) > 0.95 ? 0.4 : 0 );

	}

	// fur only where it can be seen
	lod( camera ) {

		const c = camera.position;
		for ( const a of [ ...this.deer, ...this.marmots, ...this.squirrels, ...this.hares, ...this.bears ] ) {

			if ( a.fur ) a.fur.visible = a.mesh.visible && a.mesh.position.distanceTo( c ) < a.furFar * ( 55 / camera.fov );

		}

	}

	update( dt, time, camera, dusk ) {

		const all = this._all || ( this._all = [ ...this.deer, ...this.marmots, ...this.squirrels, ...this.hares, ...this.bears ] );
		// take out last frame's breath before the poses are set again
		for ( const a of all ) if ( a.breathOff ) a.bones.get( 'chest' ).rotation.x -= a.breathOff;
		const cam = camera.position;
		for ( const d of this.deer ) this._updateDeer( d, dt, time, cam, dusk );
		for ( const m of this.marmots ) this._updateMarmot( m, dt, time, cam );
		for ( const q of this.squirrels ) this._updateSquirrel( q, dt, time, cam );
		for ( const h of this.hares ) this._updateHare( h, dt, time, cam );
		for ( const b of this.bears ) this._updateBear( b, dt, time, cam );
		this._alive( all, dt );

	}

	// Nothing alive is ever quite still: the chest rises and falls (small animals quickly,
	// the bear slowly), and the eyes blink every few seconds.
	_alive( all, dt ) {

		const rates = { stag: 1.4, hind: 1.6, marmot: 2.4, squirrel: 4.4, hare: 3.6, bear: 1.0 };
		for ( const a of all ) {

			const ch = a.bones.get( 'chest' );
			if ( ch ) {

				a.breathPh = ( a.breathPh ?? this.rng.next() * 6.28 ) + dt * ( rates[ a.mesh.name ] ?? 2 );
				const big = a.mesh.name === 'bear' || a.mesh.name === 'stag' || a.mesh.name === 'hind';
				a.breathOff = Math.sin( a.breathPh ) * ( big ? 0.008 : 0.014 );
				ch.rotation.x += a.breathOff;

			}

			if ( ! a.eyes ) {

				a.eyes = [];
				a.mesh.traverse( ( o ) => { if ( o.userData.eye ) a.eyes.push( o ); } );
				a.blink = 1 + this.rng.next() * 4;

			}

			a.blink -= dt;
			const shut = a.blink > 0 && a.blink < 0.12;
			for ( const e of a.eyes ) e.scale.y = shut ? 0.12 : 1;
			if ( a.blink <= 0 ) a.blink = 2 + this.rng.next() * 5;

		}

	}

}
