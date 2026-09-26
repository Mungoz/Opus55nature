import * as THREE from 'three';
import { creatureMaterial, PartBuilder, MAT } from './creature.js';
import { RNG } from '../core/rng.js';

// The small birds of the valley, after photographs:
//  - siskins and redpolls in flocks: they sit about in the treetops, drop into the meadow
//    to feed, and go up together in bounding flight - off to another tree, or away from you
//  - white wagtails running and stopping along the strand, pumping their long tails, flying
//    on a little way in deep undulations when you come too close
//  - dippers on the stones of the stream, bobbing, flying off low and straight over the water
// Each species is drawn as two instanced meshes shared by every bird: perched (wings folded)
// and flying (wings out, beating in the shader) - a bird is in one or the other.

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

const wrap = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );

// palettes: ( region, x, y, z ) -> colour; region is 'body' (by position) or a named part
const SPECIES = {
	siskin: {
		len: 0.12, tail: 0.045, plump: 1, flap: 18,
		body( x, y, z ) {

			// olive back, yellow breast and face, whitish streaked belly, black cap
			if ( y > 0.02 && z > 0.035 ) return '#1c1c14';
			let c = y > 0.004 ? new THREE.Color( '#6f7a30' ) : new THREE.Color( '#d8cf3c' ).lerp( new THREE.Color( '#e6e2c6' ), ss( 0.0, - 0.03, z ) );
			if ( y < 0 && Math.sin( z * 400 ) > 0.6 && Math.abs( x ) > 0.012 ) c = c.clone().multiplyScalar( 0.6 );
			return c;

		},
		head: '#d8cf3c', cap: '#1c1c14', wing: '#1f2018', bar: '#d6c42e', tailC: '#22221a', beak: '#c8b890',
	},
	redpoll: {
		len: 0.13, tail: 0.05, plump: 1, flap: 18,
		body( x, y, z ) {

			// streaked grey-brown above, a rosy breast, white streaked flanks
			let c = y > 0.004 ? new THREE.Color( '#8a7a66' ) : new THREE.Color( '#d27c7c' ).lerp( new THREE.Color( '#ece6de' ), ss( 0.005, - 0.03, z ) );
			if ( Math.sin( z * 380 + x * 90 ) > 0.55 ) c = c.clone().multiplyScalar( 0.72 );
			return c;

		},
		head: '#8a7c6a', cap: '#b82228', wing: '#3a3028', bar: '#e8e0d0', tailC: '#2e2620', beak: '#e0c040',
	},
	wagtail: {
		len: 0.18, tail: 0.09, plump: 0.85, flap: 14,
		body( x, y, z ) {

			// grey back, white below, a black bib
			if ( y < 0.012 && z > 0.02 && z < 0.045 && Math.abs( x ) < 0.02 ) return '#161616';
			return y > 0.004 ? '#8a8c8e' : '#f0efea';

		},
		head: '#f0efea', cap: '#161616', wing: '#3a3a3c', bar: '#f0efea', tailC: '#161616', beak: '#161616',
	},
	dipper: {
		len: 0.18, tail: 0.035, plump: 1.3, flap: 16,
		body( x, y, z ) {

			// dark chocolate, a bright white bib, a chestnut band below it
			if ( y < 0.02 && z > 0.02 ) return y > - 0.012 ? '#f2f0ea' : '#7a3e22';
			return y > 0.0 ? '#3a2e28' : '#2e2622';

		},
		head: '#5a3e2c', cap: '#5a3e2c', wing: '#2a2420', bar: '#2a2420', tailC: '#241e1a', beak: '#1a1614',
	},
};

// perched: body tilted up, wings folded along the flanks, legs to the ground (y = 0)
function perchedGeometry( sp ) {

	const b = new PartBuilder();
	const L = sp.len, k = L / 0.13, P = sp.plump;
	const tilt = new THREE.Matrix4().makeRotationX( - 0.45 );
	const body = new THREE.SphereGeometry( 1, 12, 9 );
	body.scale( 0.026 * k * P, 0.028 * k * P, 0.045 * k );
	body.applyMatrix4( tilt );
	body.translate( 0, 0.042 * k, 0 );
	b.add( body, ( x, y, z ) => sp.body( x, y - 0.042 * k, z ), null, 0, MAT.FEATHER );
	const head = new THREE.SphereGeometry( 0.018 * k * Math.sqrt( P ), 10, 8 );
	head.translate( 0, 0.072 * k, 0.03 * k );
	b.add( head, ( x, y, z ) => ( y > 0.078 * k && z > 0.024 * k ? sp.cap : sp.head ), null, 0, MAT.FEATHER );
	const beak = new THREE.ConeGeometry( 0.005 * k, 0.014 * k, 6 );
	beak.rotateX( Math.PI / 2 );
	beak.translate( 0, 0.07 * k, 0.052 * k );
	b.add( beak, sp.beak, null, 0, MAT.BILL );
	for ( const sd of [ - 1, 1 ] ) {

		// the folded wing, dark with a pale bar across it
		const w = new THREE.SphereGeometry( 1, 8, 6 );
		w.scale( 0.008 * k, 0.022 * k, 0.045 * k );
		w.applyMatrix4( tilt );
		w.translate( sd * 0.02 * k * P, 0.046 * k, - 0.008 * k );
		b.add( w, ( x, y, z ) => ( Math.abs( z + 0.005 * k ) < 0.004 * k ? sp.bar : sp.wing ), null, 0, MAT.FEATHER );
		// legs
		const leg = new THREE.CylinderGeometry( 0.0015 * k, 0.0015 * k, 0.022 * k, 4 );
		leg.translate( sd * 0.008 * k, 0.011 * k, 0.004 * k );
		b.add( leg, '#3a3028', null, 0, MAT.BILL );

	}

	// the tail, angled down behind
	const t = sp.tail;
	b.tris( [ [ 0, 0.03 * k, - 0.035 * k ], [ 0.012 * k, 0.03 * k - t * 0.45, - 0.035 * k - t ], [ - 0.012 * k, 0.03 * k - t * 0.45, - 0.035 * k - t ] ], sp.tailC, () => 0, MAT.FEATHER );
	return b.build();

}

// flying: level, wings out (the shader beats them about the body axis), tail spread
function flyingGeometry( sp ) {

	const b = new PartBuilder();
	const L = sp.len, k = L / 0.13, P = sp.plump;
	const body = new THREE.SphereGeometry( 1, 10, 8 );
	body.scale( 0.022 * k * P, 0.022 * k * P, 0.05 * k );
	b.add( body, ( x, y, z ) => sp.body( x, y, z ), null, 0, MAT.FEATHER );
	const head = new THREE.SphereGeometry( 0.016 * k, 8, 6 );
	head.translate( 0, 0.006 * k, 0.05 * k );
	b.add( head, ( x, y, z ) => ( y > 0.012 * k ? sp.cap : sp.head ), null, 0, MAT.FEATHER );
	const beak = new THREE.ConeGeometry( 0.004 * k, 0.012 * k, 5 );
	beak.rotateX( Math.PI / 2 );
	beak.translate( 0, 0.004 * k, 0.07 * k );
	b.add( beak, sp.beak, null, 0, MAT.BILL );
	const span = 0.11 * k, chord = 0.045 * k;
	for ( const sd of [ - 1, 1 ] ) {

		const f = ( x ) => Math.min( 1, Math.abs( x ) / span ) * sd;
		const rootF = [ sd * 0.012 * k, 0.004 * k, 0.02 * k ], rootB = [ sd * 0.012 * k, 0.004 * k, 0.02 * k - chord ];
		const tip = [ sd * span, 0, - 0.01 * k ], trail = [ sd * span * 0.6, 0, 0.02 * k - chord * 1.05 ];
		b.tris( [ rootF, tip, rootB, rootB, tip, trail ], ( x, y, z ) => ( Math.abs( z - ( 0.005 * k - chord * 0.35 ) ) < 0.004 * k && Math.abs( x ) > 0.02 * k ? sp.bar : sp.wing ), f, MAT.FEATHER );

	}

	const t = sp.tail;
	b.tris( [ [ 0, 0, - 0.04 * k ], [ 0.016 * k, 0, - 0.04 * k - t ], [ - 0.016 * k, 0, - 0.04 * k - t ] ], sp.tailC, () => 0, MAT.FEATHER );
	return b.build();

}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const HIDE = new THREE.Matrix4().makeScale( 0, 0, 0 );

class SpeciesMeshes {

	constructor( name, n ) {

		const sp = SPECIES[ name ];
		this.perchMat = creatureMaterial();
		this.flyMat = creatureMaterial( { flapSpeed: sp.flap, flapAmp: 0.85, glide: name === 'siskin' || name === 'redpoll' || name === 'wagtail' ? 0.45 : 0 } );
		this.perched = new THREE.InstancedMesh( perchedGeometry( sp ), this.perchMat, n );
		this.flying = new THREE.InstancedMesh( flyingGeometry( sp ), this.flyMat, n );
		for ( const m of [ this.perched, this.flying ] ) {

			m.frustumCulled = false;
			m.name = name;
			m.count = 0;
			m.visible = false;

		}

		this.n = 0;

	}

	begin() {

		this.n = 0;
		this.anyPerched = this.anyFlying = false;

	}

	put( p, heading, pitch, roll, scale, flying ) {

		const i = this.n ++;
		_e.set( pitch, heading, roll, 'YXZ' );
		_q.setFromEuler( _e );
		_m.compose( p, _q, _s.setScalar( scale ) );
		( flying ? this.flying : this.perched ).setMatrixAt( i, _m );
		( flying ? this.perched : this.flying ).setMatrixAt( i, HIDE );
		if ( flying ) this.anyFlying = true; else this.anyPerched = true;

	}

	end() {

		for ( const [ m, any ] of [ [ this.perched, this.anyPerched ], [ this.flying, this.anyFlying ] ] ) {

			m.count = this.n;
			m.visible = any;
			m.instanceMatrix.needsUpdate = true;

		}

	}

}

// a smooth hop through the air from a to b, arcing up by `lift`
const arc = ( a, b, u, lift, out ) => out.lerpVectors( a, b, u ).setY( THREE.MathUtils.lerp( a.y, b.y, u ) + Math.sin( Math.PI * u ) * lift );

export class SmallBirds {

	constructor( terrain, forest, river ) {

		this.terrain = terrain;
		this.rng = new RNG( 2718 );
		const rng = this.rng;
		this.group = new THREE.Group();
		this.group.name = 'small-birds';
		this.meshes = {};
		const count = { siskin: 0, redpoll: 0, wagtail: 0, dipper: 0 };

		// ---- finch flocks: each keeps to a few trees near the meadows and the start
		const trees = forest.trees.filter( ( t ) => t.y < 60 && t.y > 1.5 && Math.hypot( t.x + 5, t.z - 560 ) < 330 && forest.variants[ t.variant ].height * t.s > 6 );
		const homes = [];
		for ( let k = 0; k < 6000 && homes.length < 16; k ++ ) {

			const t = trees[ Math.floor( rng.next() * trees.length ) ];
			if ( ! t || homes.some( ( h ) => Math.hypot( h.x - t.x, h.z - t.z ) < 35 ) ) continue;
			homes.push( t );

		}

		const crown = ( t ) => {

			// a perch on the outside of the crown, in its upper half
			const v = forest.variants[ t.variant ], H = v.height * t.s, R = ( v.radius - 0.4 ) * t.s;
			// finches sit out on the twigs and tops, where they can be seen (and see)
			const broad = v.species === 'birch' || v.species === 'aspen' || v.species === 'rowan';
			const top = ! broad && rng.next() < 0.35;
			const f = top ? rng.range( 0.93, 0.99 ) : rng.range( broad ? 0.55 : 0.45, 0.9 ), a = rng.next() * Math.PI * 2;
			const r = top ? 0.1 : broad ? R * rng.range( 0.85, 1.0 ) * Math.sin( Math.PI * Math.min( 1, 0.25 + f * 0.8 ) ) : R * ( 1 - f ) * 1.12 + 0.2;
			return V( t.x + Math.cos( a ) * r, t.y + H * f, t.z + Math.sin( a ) * r );

		};

		this.crown = crown;
		this.flocks = homes.map( ( t, i ) => {

			const species = i % 3 === 2 ? 'redpoll' : 'siskin';
			const n = rng.int( 9, 22 );
			// the other trees it visits: its home and two neighbours
			const near = trees.filter( ( u ) => u !== t && Math.hypot( u.x - t.x, u.z - t.z ) < 60 ).slice( 0, 40 );
			const visits = [ t, near[ Math.floor( rng.next() * near.length ) ] ?? t, near[ Math.floor( rng.next() * near.length ) ] ?? t ];
			const birds = Array.from( { length: n }, () => {

				const p = crown( t );
				return { pos: p, from: p.clone(), to: p.clone(), u: 1, dur: 1, delay: 0, heading: rng.next() * Math.PI * 2, peck: 0, look: 0 };

			} );
			count[ species ] += n;
			return { species, birds, tree: t, visits, state: 'tree', timer: rng.range( 2, 12 ), patch: null };

		} );

		// ---- wagtails along the strand in front of the start
		this.wagtails = [];
		for ( let k = 0; k < 3000 && this.wagtails.length < 5; k ++ ) {

			const x = - 5 + rng.range( - 220, 220 ), z = rng.range( 380, 520 );
			const h = terrain.heightAt( x, z );
			if ( h < 0.12 || h > 0.6 ) continue;
			if ( this.wagtails.some( ( w ) => Math.hypot( w.pos.x - x, w.pos.z - z ) < 30 ) ) continue;
			this.wagtails.push( { pos: V( x, h, z ), heading: rng.next() * Math.PI * 2, state: 'stand', timer: rng.range( 1, 4 ), from: V(), to: V(), u: 1, dur: 1, pump: 0 } );

		}

		count.wagtail = this.wagtails.length;

		// ---- dippers on the stones of the stream
		this.dippers = [];
		const pts = ( river || [] ).filter( ( s, i ) => i % 3 === 0 );
		for ( const s0 of [ 0.2, 0.55 ] ) {

			const s = pts[ Math.floor( s0 * pts.length ) ];
			if ( ! s ) continue;
			this.dippers.push( { pos: V( s.p.x, s.surf + 0.08, s.p.y ), heading: 0, state: 'stand', timer: rng.range( 2, 6 ), from: V(), to: V(), u: 1, dur: 1, bob: 0, idx: Math.floor( s0 * pts.length ) } );

		}

		this.riverPts = pts;
		count.dipper = this.dippers.length;
		for ( const [ name, n ] of Object.entries( count ) ) {

			if ( ! n ) continue;
			this.meshes[ name ] = new SpeciesMeshes( name, n );
			this.group.add( this.meshes[ name ].perched, this.meshes[ name ].flying );

		}

		this.t = 0;

	}

	_ground( x, z ) {

		return this.terrain.heightAt( x, z );

	}

	// where a finch feeds: on the stones of the strand, or out in the meadow clinging to the
	// seed heads above the grass
	_perchH( x, z ) {

		const g = this._ground( x, z );
		return g > 0.9 ? g + 0.62 + this.rng.range( 0, 0.2 ) : Math.max( g, 0.02 );

	}

	// a patch of meadow near the tree to feed in
	_patch( t ) {

		const rng = this.rng;
		for ( let k = 0; k < 20; k ++ ) {

			const a = rng.next() * Math.PI * 2, r = rng.range( 6, 18 );
			const x = t.x + Math.cos( a ) * r, z = t.z + Math.sin( a ) * r;
			if ( this._ground( x, z ) > 0.8 ) return V( x, 0, z );

		}

		return V( t.x + 5, 0, t.z );

	}

	_flyFlock( F, targets, dur ) {

		const rng = this.rng;
		F.birds.forEach( ( b, i ) => {

			b.from.copy( b.pos );
			b.to.copy( targets( i ) );
			b.u = 0;
			b.delay = rng.range( 0, 0.6 );
			b.dur = dur * rng.range( 0.85, 1.2 );

		} );
		F.state = 'fly';

	}

	update( dt, camera ) {

		const rng = this.rng, cam = camera.position;
		this.t += dt;
		const t = this.t;
		for ( const m of Object.values( this.meshes ) ) m.begin();

		// ---- finch flocks
		for ( const F of this.flocks ) {

			const M = this.meshes[ F.species ];
			const far = Math.hypot( cam.x - F.tree.x, cam.z - F.tree.z ) > 280;
			F.timer -= dt;
			if ( ! far ) {

				if ( F.state === 'tree' && F.timer <= 0 ) {

					// down into the meadow to feed
					F.patch = this._patch( F.tree );
					this._flyFlock( F, () => {

						const x = F.patch.x + rng.range( - 3, 3 ), z = F.patch.z + rng.range( - 3, 3 );
						return V( x, this._perchH( x, z ), z );

					}, 2.2 );
					F.next = 'ground';

				} else if ( F.state === 'ground' ) {

					const close = Math.hypot( cam.x - F.patch.x, cam.z - F.patch.z ) < 7;
					if ( close || F.timer <= 0 ) {

						// up into a tree - away from you, if that is why
						F.tree = F.visits[ Math.floor( rng.next() * F.visits.length ) ];
						this._flyFlock( F, () => this.crown( F.tree ), close ? 1.6 : 2.4 );
						F.next = 'tree';

					}

				} else if ( F.state === 'tree' && Math.hypot( cam.x - F.tree.x, cam.z - F.tree.z ) < 6 ) {

					F.tree = F.visits.find( ( u ) => u !== F.tree ) ?? F.tree;
					this._flyFlock( F, () => this.crown( F.tree ), 2.4 );
					F.next = 'tree';

				}

			}

			let arrived = F.state === 'fly';
			for ( const b of F.birds ) {

				let flying = false;
				if ( F.state === 'fly' && b.u < 1 ) {

					if ( b.delay > 0 ) b.delay -= dt;
					else b.u = Math.min( 1, b.u + dt / b.dur );
					if ( b.u < 1 ) arrived = false;
					if ( b.delay <= 0 && b.u < 1 ) {

						// bounding flight: a few beats up, a closed-wing dip
						const prev = b.pos.clone();
						arc( b.from, b.to, b.u, Math.max( 1.5, b.from.distanceTo( b.to ) * 0.15 ), b.pos );
						b.pos.y += Math.sin( b.u * 18 ) * 0.25 * Math.sin( Math.PI * b.u );
						const dx = b.pos.x - prev.x, dz = b.pos.z - prev.z;
						if ( dx * dx + dz * dz > 1e-8 ) b.heading = Math.atan2( dx, dz );
						b.pitch = - Math.atan2( b.pos.y - prev.y, Math.hypot( dx, dz ) + 1e-4 ) * 0.6;
						flying = true;

					}

				} else if ( F.state === 'ground' ) {

					// feeding: pecking, looking up, now and then a quick hop
					b.peck = Math.max( 0, b.peck - dt );
					if ( b.peck <= 0 && rng.next() < dt * 1.2 ) {

						b.hop = 0;
						b.hopFrom = b.pos.clone();
						const a = b.heading + rng.range( - 1.2, 1.2 ), d = rng.range( 0.1, 0.35 );
						const x = b.pos.x + Math.sin( a ) * d, z = b.pos.z + Math.cos( a ) * d;
						b.hopTo = V( x, this._perchH( x, z ), z );
						b.heading = a;
						b.peck = rng.range( 0.4, 1.5 );

					}

					if ( b.hopTo ) {

						b.hop = Math.min( 1, b.hop + dt / 0.18 );
						arc( b.hopFrom, b.hopTo, b.hop, 0.06, b.pos );
						if ( b.hop >= 1 ) b.hopTo = null;

					}

				}

				if ( far ) continue;
				const peckPitch = F.state === 'ground' && ! b.hopTo ? Math.max( 0, Math.sin( t * 9 + b.from.x * 7 ) ) * 0.6 : 0;
				const s = SPECIES[ F.species ];
				M.put( b.pos, b.heading, flying ? b.pitch ?? 0 : peckPitch, flying ? Math.sin( t * 3 + b.from.z ) * 0.2 : 0, 1, flying );
				void s;

			}

			if ( arrived ) {

				F.state = F.next;
				F.timer = F.state === 'ground' ? rng.range( 6, 16 ) : rng.range( 5, 18 );
				// on arriving in a tree, face out of it
				if ( F.state === 'tree' ) for ( const b of F.birds ) b.heading = Math.atan2( b.pos.x - F.tree.x, b.pos.z - F.tree.z ) + rng.range( - 0.8, 0.8 );

			}

			if ( F.state === 'tree' && ! far ) {

				// now and then one flits to another perch in the same tree
				if ( rng.next() < dt * 0.4 ) {

					const b = F.birds[ Math.floor( rng.next() * F.birds.length ) ];
					b.pos.copy( this.crown( F.tree ) );

				}

			}

		}

		// ---- wagtails: run, stop and pump the tail, fly on low when you come close
		const W = this.meshes.wagtail;
		for ( const w of this.wagtails ) {

			w.timer -= dt;
			const d = Math.hypot( cam.x - w.pos.x, cam.z - w.pos.z );
			if ( d > 260 ) continue;
			let flying = false;
			if ( w.state === 'stand' ) {

				w.pump = Math.sin( t * 9 ) * Math.max( 0, Math.sin( t * 1.3 + w.pos.x ) );
				if ( d < 5 || w.timer <= 0 ) {

					const fly = d < 5 || rng.next() < 0.25;
					const a = d < 5 ? Math.atan2( w.pos.x - cam.x, w.pos.z - cam.z ) + rng.range( - 0.6, 0.6 ) : w.heading + rng.range( - 1.5, 1.5 );
					const dist = fly ? rng.range( 10, 25 ) : rng.range( 1, 4 );
					let x = w.pos.x + Math.sin( a ) * dist, z = w.pos.z + Math.cos( a ) * dist;
					if ( this._ground( x, z ) < 0.05 || this._ground( x, z ) > 1.2 ) { x = w.pos.x - Math.sin( a ) * dist; z = w.pos.z - Math.cos( a ) * dist; }
					w.from.copy( w.pos );
					w.to.set( x, Math.max( 0.05, this._ground( x, z ) ), z );
					w.u = 0;
					w.dur = fly ? dist / 7 : dist / 1.6;
					w.state = fly ? 'fly' : 'run';
					w.heading = Math.atan2( x - w.pos.x, z - w.pos.z );

				}

			} else {

				w.u = Math.min( 1, w.u + dt / w.dur );
				if ( w.state === 'fly' ) {

					// deep undulations
					arc( w.from, w.to, w.u, 1.2, w.pos );
					w.pos.y += Math.sin( w.u * Math.PI * 5 ) * 0.25 * Math.sin( Math.PI * w.u );
					flying = true;

				} else {

					w.pos.lerpVectors( w.from, w.to, w.u );
					w.pos.y = Math.max( 0.05, this._ground( w.pos.x, w.pos.z ) ) + Math.abs( Math.sin( w.u * 40 ) ) * 0.008;

				}

				if ( w.u >= 1 ) {

					w.state = 'stand';
					w.timer = rng.range( 0.8, 4 );

				}

			}

			W.put( w.pos, w.heading, flying ? 0 : w.state === 'stand' ? w.pump * 0.12 : 0.05, 0, 1, flying );

		}

		// ---- dippers: bob on a stone mid-stream, fly low and straight to the next
		const D = this.meshes.dipper;
		for ( const p of this.dippers ) {

			p.timer -= dt;
			const d = Math.hypot( cam.x - p.pos.x, cam.z - p.pos.z );
			if ( d > 260 ) continue;
			let flying = false;
			if ( p.state === 'stand' ) {

				// the dip: a quick bob of the whole body, in bursts
				p.bob = Math.max( 0, Math.sin( t * 11 ) ) * ( Math.sin( t * 0.9 + p.idx ) > 0 ? 1 : 0 );
				if ( d < 7 || p.timer <= 0 ) {

					const pts = this.riverPts;
					const step = ( rng.next() < 0.5 ? - 1 : 1 ) * rng.int( 2, 5 );
					p.idx = Math.max( 0, Math.min( pts.length - 1, p.idx + step ) );
					const s = pts[ p.idx ];
					p.from.copy( p.pos );
					p.to.set( s.p.x + rng.range( - 1, 1 ), s.surf + 0.08, s.p.y + rng.range( - 1, 1 ) );
					p.u = 0;
					p.dur = p.from.distanceTo( p.to ) / 8 + 0.3;
					p.state = 'fly';
					p.heading = Math.atan2( p.to.x - p.pos.x, p.to.z - p.pos.z );

				}

			} else {

				p.u = Math.min( 1, p.u + dt / p.dur );
				arc( p.from, p.to, p.u, 0.25, p.pos );
				flying = true;
				if ( p.u >= 1 ) {

					p.state = 'stand';
					p.timer = rng.range( 3, 10 );

				}

			}

			_p.copy( p.pos );
			if ( ! flying ) _p.y -= p.bob * 0.015;
			D.put( _p, p.heading, flying ? 0 : p.bob * 0.15, 0, 1, flying );

		}

		for ( const m of Object.values( this.meshes ) ) m.end();

	}

}
