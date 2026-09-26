import * as THREE from 'three';
import { routePath, PLACES } from './layout.js';
import { Collision } from './collision.js';
import { BEATS, CLOCK, SKY } from './beats.js';
import { StoryProps } from './props/index.js';
import { READS } from './notes.js';
import { Figure } from './figure.js';
import { Sight } from './sight.js';
import { StorySound } from './sound.js';
import { PlayerBody } from './player.js';
import { BoatScene } from './boatscene.js';

const _v = new THREE.Vector3();
const _n = { dist: 0, d: 0, side: 0 };
const _frustum = new THREE.Frustum(), _m4 = new THREE.Matrix4(), _sph = new THREE.Sphere();
const lerp = THREE.MathUtils.lerp;

// The horror edition: everything that turns the valley into the walk. One value drives it:
// progress, the metres walked along the route (it only ever counts up, a stretch at a time).
// The clock, the weather, the birds' quiet and the beats all follow it.
export class Story {

	constructor( app ) {

		this.app = app;
		this.path = routePath();
		this.ground = app.storyGround;
		this.progress = 0;
		this.time = 0;
		this.flags = {};
		this.looked = 0; // how long the figure has been looked at (s), for the ending
		this.lookLimit = 32; // looked at longer than this, and the ending changes
		this.beats = BEATS.map( ( b ) => ( { ...b, state: 'waiting' } ) );
		this.encounters = [];
		this.interactables = [];
		this.focus = null; // the interactable being looked at
		this.reading = null;
		this.input = true; // the walker may move
		this.offPath = 0; // metres beyond the free band
		this.lost = 0; // seconds spent far from the path
		this._waits = [];
		this._untils = [];
		this.log = [];
		const params = new URLSearchParams( location.search );
		this.debug = params.has( 'debug' );
		this.jump = params.get( 'beat' );
		// ?autopilot: walk the route like a first-time player (for timing, and to test the script)
		this.autopilot = params.has( 'autopilot' ) ? { read: 6, look: 0 } : null;

	}

	async load() {

		const app = this.app;
		const td = app.terrainData;
		// walking, never flying; a heavier, slower stride than the nature build's
		const c = app.controls;
		c.walk = true;
		c.canFly = false;
		c.walkSpeed = 2.9;
		c.runSpeed = 4.5;
		c.stride = 0.74;
		c.eyeHeight = 1.66;
		// what you can't walk through
		this.collision = new Collision( td );
		this.collision.waterAt = ( x, z ) => this.waterAt( x, z );
		this.collision.addNature( app.forest, app.rocks );
		c.collide = ( pos, px, pz ) => {

			if ( this.noclip ) return;
			this.collision.resolve( pos, px, pz );

		};
		c.floorAt = ( x, z, g ) => this.collision.floorAt( x, z, g );
		// the weather is the director's
		app.weather.autoStrikes = false;
		app.timeSpeed = 0;
		this._riverGrid();
		// the jetty, the hut, the boats
		this.props = new StoryProps( this );
		this.props.build();
		// you, as the water shows you; the boat you row
		this.you = new PlayerBody( app );
		this.boatScene = new BoatScene( this );
		// it, and whether you can see it
		this.figure = new Figure( app );
		this.sight = new Sight( this );
		this.seenFor = 0;
		this.unseenFor = 1e3;
		// debug: ?fig=x,z,yawDeg,mode,pose[,tilt] stands it somewhere for a screenshot
		const fp = new URLSearchParams( location.search ).get( 'fig' );
		if ( fp ) {

			const [ x, z, yaw, mode = 'direct', pose = 'stand', tilt ] = fp.split( ',' );
			this.figure.place( + x, + z, + yaw * Math.PI / 180 );
			this.figure.pose = pose;
			if ( tilt !== undefined ) this.figure.tilt = + tilt;
			if ( pose === 'walk' ) this.figure.walkPhase = 1.2;
			this.figure.setMode( mode );

		}

		const P = this.props;
		this.addInteractable( { id: 'boatlog', x: P.logBox.x, y: P.logBox.y, z: P.logBox.z, prompt: 'open the box', use: ( S ) => S.ui.read( READS.boatlog ) } );
		this.addInteractable( { id: 'hutbook', x: P.bookTin.x, y: P.bookTin.y, z: P.bookTin.z, prompt: 'open the tin', use: ( S ) => S.ui.read( READS.hutbook, () => {

			S.flags.hutbookRead = true;
			S.flags.hutbookAt = S.time;

		} ) } );
		// sound: the story's own, and the footsteps (with their echo, later)
		this.sound = new StorySound( app.audio );
		app.audio.paper = () => this.sound.paper();
		app.moreBirds.onCroak = ( p ) => this.sound.croak( p.clone().setY( 1 ) );
		app.geese.auto = false;
		c.onStep = () => this._step();
		// a skimmed stone breaking the water
		app.onStoneSplash = ( p ) => this.onStone?.( p );

		const start = this.jump && this.path.ids[ this.jump ] !== undefined ? this.path.ids[ this.jump ] : 0;
		// the grade starts where it should be (no easing in from neutral)
		const g0 = this.skyAt( start );
		app.post.grade.set( g0.key, g0.contrast, g0.cool, g0.desat );
		// (screenshots place the camera themselves)
		this.setProgress( start, ! app.options.cam );

	}

	// the player pressed Begin
	async begin() {

		const ui = this.ui;
		// the story's clock starts now (the page has been running behind the loader)
		this.time = 0;
		this.begun = true;
		ui.lock();
		if ( this.jump ) {

			this.you.enable( true );
			ui.fade( 0, 1.2 );
			return;

		}

		await this.boatScene.rowIn();
		this.you.enable( true );

	}

	// a holding beat lets the way on open
	release( id ) {

		const b = this.beats.find( ( x ) => x.id === id );
		if ( b ) b.released = true;

	}

	ending() {

		return this.boatScene.ending();

	}

	// ---------------------------------------------------------------- water, for collision
	_riverGrid() {

		const R = this.app.terrainData.river;
		this._rg = new Map();
		const key = ( i, j ) => ( i + 4096 ) * 8192 + ( j + 4096 );
		this._rkey = key;
		R.forEach( ( s, idx ) => {

			if ( idx === R.length - 1 ) return;
			const x0 = Math.min( s.p.x, R[ idx + 1 ].p.x ) - s.width - 2, x1 = Math.max( s.p.x, R[ idx + 1 ].p.x ) + s.width + 2;
			const z0 = Math.min( s.p.y, R[ idx + 1 ].p.y ) - s.width - 2, z1 = Math.max( s.p.y, R[ idx + 1 ].p.y ) + s.width + 2;
			for ( let i = Math.floor( x0 / 8 ); i <= Math.floor( x1 / 8 ); i ++ ) for ( let j = Math.floor( z0 / 8 ); j <= Math.floor( z1 / 8 ); j ++ ) {

				const k = key( i, j );
				if ( ! this._rg.has( k ) ) this._rg.set( k, [] );
				this._rg.get( k ).push( idx );

			}

		} );

	}

	// the height of the water surface at (x, z): the stream's, a pond's, or the lake's (0)
	waterAt( x, z ) {

		const td = this.app.terrainData;
		let w = 0;
		for ( const p of td.ponds ) if ( ( x - p.c.x ) ** 2 + ( z - p.c.y ) ** 2 < ( p.r * 1.7 ) ** 2 ) w = Math.max( w, p.surf );
		const l = this._rg.get( this._rkey( Math.floor( x / 8 ), Math.floor( z / 8 ) ) );
		if ( l ) {

			const R = td.river;
			for ( const i of l ) {

				const a = R[ i ], b = R[ i + 1 ];
				const ex = b.p.x - a.p.x, ez = b.p.y - a.p.y, l2 = ex * ex + ez * ez || 1;
				const t = THREE.MathUtils.clamp( ( ( x - a.p.x ) * ex + ( z - a.p.y ) * ez ) / l2, 0, 1 );
				const d = Math.hypot( x - a.p.x - ex * t, z - a.p.y - ez * t );
				if ( d < lerp( a.width, b.width, t ) + 0.8 ) w = Math.max( w, lerp( a.surf, b.surf, t ) );

			}

		}

		return w;

	}

	// ---------------------------------------------------------------- scripting
	get cam() { return this.app.camera.position; }

	untilUnseen( sec ) { return this.until( () => this.unseenFor > sec ); }

	// wait until p (a point, radius r) is out of the view
	untilOffscreen( p, r = 1 ) { return this.until( () => this.offscreen( p, r ) ); }

	offscreen( p, r = 1 ) {

		const cam = this.app.camera;
		_frustum.setFromProjectionMatrix( _m4.multiplyMatrices( cam.projectionMatrix, cam.matrixWorldInverse ) );
		return ! _frustum.intersectsSphere( _sph.set( _v.set( p.x, p.y ?? this.app.terrainData.heightAt( p.x, p.z ) + 1, p.z ), r ) );

	}

	// a point on the path d metres back from where you have got to
	behind( d ) { return this.path.at( Math.max( 0, this.progress - d ) ); }

	ahead( d ) { return this.path.at( this.progress + d ); }

	// which way the lake is from p (a unit xz vector)
	waterSide( p ) {

		const td = this.app.terrainData;
		let bx = 0, bz = 0;
		for ( let k = 0; k < 16; k ++ ) {

			const a = k / 16 * Math.PI * 2, x = Math.cos( a ), z = Math.sin( a );
			for ( const r of [ 4, 10, 25 ] ) if ( td.heightAt( p.x + x * r, p.z + z * r ) < - 0.1 ) { bx += x / r; bz += z / r; }

		}

		const l = Math.hypot( bx, bz ) || 1;
		return { x: bx / l, z: bz / l };

	}

	// dry, open ground near p to stand on (edge: close to a tree, as at a wood's edge)
	findStand( p, r, { edge = false } = {} ) {

		const td = this.app.terrainData, trees = this.app.forest.trees;
		let best = null, bs = - Infinity;
		for ( let k = 0; k < 200; k ++ ) {

			const a = k * 2.39996, d = Math.sqrt( k / 200 ) * r;
			const x = p.x + Math.cos( a ) * d, z = p.z + Math.sin( a ) * d;
			if ( td.heightAt( x, z ) < 1.2 || this.collision.blocked( x, z, 0.6 ) ) continue;
			let near = 99;
			if ( edge ) for ( const t of trees ) if ( Math.abs( t.x - x ) < 8 && Math.abs( t.z - z ) < 8 ) near = Math.min( near, Math.hypot( t.x - x, t.z - z ) );
			const s = - d * 0.05 - ( edge ? Math.abs( near - 2.2 ) : 0 );
			if ( s > bs ) { bs = s; best = new THREE.Vector3( x, 0, z ); }

		}

		return best ?? p.clone();

	}

	// the drone swells while it is seen (to level, easing out over sec)
	drone( level, sec ) {

		this._drone = { level, until: this.time + sec };

	}

	hint() {}

	// a footstep: the ground underfoot decides its sound; later, an echo from behind
	_step() {

		if ( ! this.begun || ! this.sound ) return;
		const p = this.cam, td = this.app.terrainData;
		const x = p.x, z = p.z;
		let s = 'grass';
		const bio = this._bio || ( this._bio = [ 0, 0, 0, 0 ] );
		td.biomeAt( x, z, bio );
		const h = td.heightAt( x, z );
		if ( this.collision.onDeck( x, z ) ) s = 'wood';
		else if ( this.ground.trailDist( x, z ) < 0.45 ) s = 'gravel';
		else if ( bio[ 3 ] > 0.4 || h < 0.9 ) s = 'shingle';
		else if ( bio[ 1 ] > 0.5 ) s = 'earth';
		else if ( this.app.weather.wetness > 0.5 || this.waterAt( x, z ) > h - 0.3 ) s = 'wet';
		this.sound.step( s, null, 0.9 );
		if ( this.echo ) {

			// half a beat late, from a few steps behind
			const b = this.behind( 3 );
			this.sound.step( s === 'wood' ? 'wood' : 'shingle', new THREE.Vector3( b.x, td.heightAt( b.x, b.z ) + 0.1, b.z ), 0.75, 0.38 );

		}

	}

	wait( sec ) {

		return new Promise( ( res ) => this._waits.push( { t: this.time + sec, res } ) );

	}

	until( fn ) {

		return new Promise( ( res ) => this._untils.push( { fn, res } ) );

	}

	// call fn( dt ) every frame until it returns true
	every( fn ) {

		( this._every || ( this._every = [] ) ).push( fn );

	}

	// ---------------------------------------------------------------- progress
	setProgress( d, place = false ) {

		this.progress = d;
		this.app.hours = this.clockAt( d );
		// the beats before this point have happened
		for ( const b of this.beats ) {

			const at = this._beatAt( b );
			if ( at < d - 0.5 && b.state === 'waiting' ) {

				b.state = 'done';
				b.skip?.( this );

			}

		}

		if ( place ) {

			const s = this.path.at( d ), ahead = this.path.at( d + 6 );
			const y = this.collision.floorAt( s.x, s.z, this.app.terrainData.heightAt( s.x, s.z ) ) + 1.66;
			this.app.controls.setPose( s.x, y, s.z, Math.atan2( - ( ahead.x - s.x ), - ( ahead.z - s.z ) ) * 180 / Math.PI, - 4 );

		}

	}

	_beatAt( b ) {

		return typeof b.at === 'string' ? ( this.path.ids[ b.at ] ?? 0 ) + ( b.lead ?? 0 ) : b.at ?? 0;

	}

	// the clock for a point along the route
	clockAt( d ) {

		const K = CLOCK.map( ( [ id, h ] ) => [ this.path.ids[ id ] ?? 0, h ] );
		if ( d <= K[ 0 ][ 0 ] ) return K[ 0 ][ 1 ];
		for ( let i = 0; i < K.length - 1; i ++ ) if ( d <= K[ i + 1 ][ 0 ] ) return lerp( K[ i ][ 1 ], K[ i + 1 ][ 1 ], ( d - K[ i ][ 0 ] ) / Math.max( 1e-3, K[ i + 1 ][ 0 ] - K[ i ][ 0 ] ) );
		return K[ K.length - 1 ][ 1 ];

	}

	// the sky and weather for a point along the route: keyframes of each quantity
	skyAt( d, out = {} ) {

		for ( const [ key, keys ] of Object.entries( SKY ) ) {

			const K = keys.map( ( [ id, v ] ) => [ typeof id === 'string' ? ( this.path.ids[ id ] ?? 0 ) : id, v ] );
			let v = K[ K.length - 1 ][ 1 ];
			if ( d <= K[ 0 ][ 0 ] ) v = K[ 0 ][ 1 ];
			else for ( let i = 0; i < K.length - 1; i ++ ) if ( d <= K[ i + 1 ][ 0 ] ) {

				const t = ( d - K[ i ][ 0 ] ) / Math.max( 1e-3, K[ i + 1 ][ 0 ] - K[ i ][ 0 ] );
				v = lerp( K[ i ][ 1 ], K[ i + 1 ][ 1 ], t * t * ( 3 - 2 * t ) );
				break;

			}

			out[ key ] = v;

		}

		return out;

	}

	_track( dt ) {

		const cam = this.app.camera.position;
		// the nearest point of the route, looking a little back and well ahead of progress
		// (a small window ahead, so a stretch of the path that doubles back close by is never
		// taken for the one you are on)
		this.path.nearest( cam.x, cam.z, Math.max( 0, this.progress - 40 ), this.progress + 9, _n );
		this.near = { dist: _n.dist, d: _n.d };
		// a beat that holds the way on (the storm) caps progress at its place until it is done
		let cap = this.progressCap ?? Infinity;
		for ( const b of this.beats ) if ( b.hold && b.state !== 'done' && ! b.released ) cap = Math.min( cap, this._beatAt( b ) + ( b.holdAt ?? 2.5 ) );
		this.cap = cap;
		if ( _n.dist < 18 && _n.d > this.progress ) this.progress = Math.min( _n.d, cap );
		// beyond the free band: denser going, and a stop
		const over = Math.max( 0, _n.dist - 25 );
		this.offPath = over;
		// (heavy rain out in the open slows you too)
		const inRain = this.app.weather.state.rain > 0.4 && ! this.props.underPorch( cam.x, cam.z );
		this.app.controls.moveScale = ( 1 - 0.55 * THREE.MathUtils.smoothstep( over, 0, 90 ) ) * ( inRain ? this.moveScaleRain ?? 1 : 1 );
		if ( over > 125 && ! this.noclip ) {

			// ease back: you can't go further out
			const back = this.path.at( _n.d );
			const dx = cam.x - back.x, dz = cam.z - back.z, l = Math.hypot( dx, dz );
			const lim = 150;
			if ( l > lim ) { cam.x = back.x + dx / l * lim; cam.z = back.z + dz / l * lim; }

		}

		this.lost = over > 12 ? this.lost + dt : Math.max( 0, this.lost - dt * 2 );

	}

	// The bot: walks toward a point a few metres ahead on the path at walking pace, stops to
	// read what there is to read (a few seconds a page), opens the gate, shelters from the
	// storm, and pushes off in the boat at the end. It glances at the figure when it is in
	// view, as a player would.
	_autopilot( dt ) {

		const A = this.autopilot, app = this.app, c = app.controls, keys = c.keys;
		keys.delete( 'KeyW' );
		if ( ! this.begun || ! this.input ) {

			if ( this.reading && ( A.page = ( A.page ?? 0 ) + dt ) > A.read ) { A.page = 0; this.ui.closeReading(); }
			return;

		}

		// read things once
		const it = this.interactables.find( ( o ) => o.enabled && ! o.used && Math.hypot( o.x - this.cam.x, o.z - this.cam.z ) < o.r * 0.95 );
		if ( it ) {

			c.targetYaw = Math.atan2( - ( it.x - this.cam.x ), - ( it.z - this.cam.z ) );
			c.targetPitch = Math.atan2( it.y - this.cam.y, Math.hypot( it.x - this.cam.x, it.z - this.cam.z ) );
			if ( this.focus === it ) {

				it.used = true;
				it.use( this );

			}

			return;

		}

		// the storm: get under the roof, and stay there, looking out
		if ( this.storming && this.props.underPorch( this.cam.x, this.cam.z ) ) {

			const f = this.props.hutFrame;
			const out = Math.atan2( - Math.sin( f.yaw ), - Math.cos( f.yaw ) ) + Math.sin( this.time * 0.2 ) * 0.5;
			c.targetYaw = c.yaw + Math.atan2( Math.sin( out - c.yaw ), Math.cos( out - c.yaw ) );
			return;

		}
		// back to the path if it has strayed, else a few metres on along it (never past a hold)
		const off = this.near?.dist ?? 0;
		let target = this.path.at( Math.min( off > 2.5 ? this.progress : this.progress + 4, ( this.cap ?? Infinity ) - 0.2 ) );
		if ( this.storming ) {

			const p = this.props.hutFrame.toWorld( - 0.3, 0, 5.3 );
			target = { x: p.x, z: p.z };

		}
		let yaw = Math.atan2( - ( target.x - this.cam.x ), - ( target.z - this.cam.z ) );
		// glance at it if it shows: stop, look for a couple of seconds, then walk on (once a
		// sighting)
		if ( this.figure.mode === 'direct' && this.sight.seen && A.glanced !== this.figure.pos.x ) { A.look = 2.5; A.glanced = this.figure.pos.x; }
		A.look -= dt;
		if ( A.look > 0 ) {

			c.targetYaw = c.yaw + Math.atan2( Math.sin( Math.atan2( - ( this.figure.pos.x - this.cam.x ), - ( this.figure.pos.z - this.cam.z ) ) - c.yaw ), Math.cos( Math.atan2( - ( this.figure.pos.x - this.cam.x ), - ( this.figure.pos.z - this.cam.z ) ) - c.yaw ) );
			return;

		}
		c.targetYaw = c.yaw + Math.atan2( Math.sin( yaw - c.yaw ), Math.cos( yaw - c.yaw ) );
		c.targetPitch = - 0.08;
		if ( Math.hypot( target.x - this.cam.x, target.z - this.cam.z ) > 0.3 ) keys.add( 'KeyW' );
		// stuck? back off and step aside, one way then the other
		keys.delete( 'KeyS' ); keys.delete( 'KeyA' ); keys.delete( 'KeyD' );
		A.stuck = Math.hypot( c.velocity.x, c.velocity.z ) < 0.3 && keys.has( 'KeyW' ) ? ( A.stuck ?? 0 ) + dt : Math.max( 0, ( A.stuck ?? 0 ) - dt * 0.5 );
		if ( A.stuck > 1.5 ) {

			A.unstick = 1.2;
			A.side = A.side === 'KeyA' ? 'KeyD' : 'KeyA';
			A.stuck = 0;

		}

		if ( ( A.unstick = ( A.unstick ?? 0 ) - dt ) > 0 ) {

			keys.delete( 'KeyW' );
			keys.add( A.unstick > 0.7 ? 'KeyS' : A.side );

		}

	}

	// ---------------------------------------------------------------- frame
	update( dt ) {

		const app = this.app;
		this.time += dt;
		if ( this.autopilot ) this._autopilot( dt );
		if ( this.input && this.begun ) this._track( dt );
		// the clock eases toward the route's time for where you are, never racing
		const target = this.clockOverride ?? this.clockAt( this.progress );
		const rate = this.clockRate ?? 0.0045; // hours per second at most
		// (only ever forward: the evening doesn't come back)
		if ( target > app.hours ) app.hours += Math.min( target - app.hours, rate * dt );
		// the weather: keyframes along the route, unless a beat has taken it over
		const sky = this.skyAt( this.progress, this._sky || ( this._sky = {} ) );
		if ( this.skyOverride ) Object.assign( sky, this.skyOverride );
		const tg = app.weather.target === this._wt ? this._wt : ( app.weather.target = this._wt = { ...app.weather.target } );
		for ( const k of [ 'clouds', 'wind', 'rain', 'overcast', 'haze', 'mist', 'base', 'lowCloud', 'storm' ] ) if ( sky[ k ] !== undefined ) tg[ k ] = sky[ k ];
		// the grade eases after the sky
		const G = app.post.grade, gk = 1 - Math.exp( - dt / 3 );
		G.x += ( sky.key - G.x ) * gk;
		G.y += ( sky.contrast - G.y ) * gk;
		G.z += ( sky.cool - G.z ) * gk;
		G.w += ( sky.desat - G.w ) * gk;
		// beats (once the walk has begun)
		for ( const b of this.beats ) {

			if ( b.state !== 'waiting' || ! this.begun ) continue;
			if ( this.progress < this._beatAt( b ) ) continue;
			if ( b.when && ! b.when( this ) ) continue;
			b.state = 'running';
			this.log.push( [ b.id, Math.round( this.time ), Math.round( this.progress ) ] );
			Promise.resolve( b.run?.( this ) ).then( () => ( b.state = 'done' ), ( e ) => {

				console.error( 'beat', b.id, e );
				b.state = 'done';

			} );

		}

		if ( this._every ) for ( let i = this._every.length - 1; i >= 0; i -- ) if ( this._every[ i ]( dt ) ) this._every.splice( i, 1 );
		this.figure?.update( dt );
		this.you?.update( dt );
		// your boat goes from the jetty (it will be found on the west strand)
		if ( ! this.flags.boatGone && this.progress > this.path.ids.hut && this.offscreen( this.props.boat.mesh.position, 4 ) ) {

			this.flags.boatGone = true;
			this.props.boat.mesh.visible = this.props.boat.lid.visible = false;
			if ( this.props.boat.rope ) this.props.boat.rope.visible = false;

		}
		if ( this.figure ) {

			// how long it has been in (or out of) sight; the look counter for the ending
			this.sight.measure( this.figure );
			if ( this.sight.seen ) {

				this.seenFor += dt;
				this.unseenFor = 0;
				// (in the storm's gloom it only really shows in the lightning)
				const lit = this.storming ? Math.min( 1, 0.2 + this.app.weather.flash * 2 ) : 1;
				if ( this.sight.centre < 0.4 && this.sight.px > 6 ) this.looked += dt * lit;

			} else {

				this.unseenFor += dt;
				this.seenFor = 0;

			}

		}
		for ( let i = this._waits.length - 1; i >= 0; i -- ) if ( this.time >= this._waits[ i ].t ) this._waits.splice( i, 1 )[ 0 ].res();
		for ( let i = this._untils.length - 1; i >= 0; i -- ) if ( this._untils[ i ].fn( this ) ) this._untils.splice( i, 1 )[ 0 ].res();
		this._interact();
		this._ambience( dt, sky );

	}

	// the sound of the valley following the story: hushed birds (and none near the figure),
	// the wind and the lake falling away, the drone, rain on the porch roof
	_ambience( dt, sky ) {

		const app = this.app, A = app.audio, X = A.mix;
		X.birds += ( sky.birds - X.birds ) * Math.min( 1, dt * 0.5 );
		X.wind += ( sky.windMix - X.wind ) * Math.min( 1, dt * 0.3 );
		X.lap += ( sky.lapMix - X.lap ) * Math.min( 1, dt * 0.3 );
		const F = this.figure;
		A.quiet = F && F.mode !== 'hidden' ? { p: F.pos, r: 70 } : null;
		let drone = 0;
		if ( this._drone && this.time < this._drone.until ) drone = this._drone.level;
		if ( F && F.mode !== 'hidden' && this.sight.seen ) drone = Math.max( drone, 0.5 + 0.5 * Math.min( 1, this.sight.px / 80 ) );
		this.sound.drone += ( drone - this.sound.drone ) * Math.min( 1, dt * ( drone > this.sound.drone ? 1.5 : 0.35 ) );
		this.sound.porch = this.props.underPorch( this.cam.x, this.cam.z ) ? 1 : 0;
		this.sound.update( dt, { rain: app.weather.state.rain, wetness: app.weather.wetness, camera: app.camera } );
		// lost for a minute and a half: the cowbell rings from the direction of the path
		if ( this.lost > 90 && ( this._lostBell = ( this._lostBell ?? 0 ) - dt ) <= 0 ) {

			this._lostBell = 25;
			const s = this.path.at( this.near?.d ?? this.progress );
			this.sound.cowbell( new THREE.Vector3( s.x, app.terrainData.heightAt( s.x, s.z ) + 1, s.z ), 2, 0.8 );

		}

	}

	// ---------------------------------------------------------------- things to read and use
	addInteractable( it ) {

		const o = { r: 2.4, enabled: true, ...it };
		this.interactables.push( o );
		return o;

	}

	_interact() {

		const cam = this.app.camera;
		cam.getWorldDirection( _v );
		let best = null, bs = 0;
		for ( const it of this.interactables ) {

			if ( ! it.enabled ) continue;
			const dx = it.x - cam.position.x, dy = it.y - cam.position.y, dz = it.z - cam.position.z;
			const d = Math.hypot( dx, dy, dz );
			if ( d > it.r ) continue;
			const cos = ( dx * _v.x + dy * _v.y + dz * _v.z ) / d;
			const s = cos - d * 0.02;
			if ( cos > 0.93 && s > bs ) { bs = s; best = it; }

		}

		this.focus = best;

	}

	use() {

		if ( this.reading ) return this.ui?.closeReading();
		if ( this.focus && this.input ) this.focus.use( this );

	}

	// labelled points for the plan map (tools/planmap.mjs)
	debugMarks() {

		const out = [];
		for ( const [ id, d ] of Object.entries( this.path.ids ) ) {

			const s = this.path.at( d );
			out.push( { label: id, x: s.x, z: s.z, color: '#ff5' } );

		}

		for ( const [ k, p ] of Object.entries( PLACES ) ) if ( p.x !== undefined ) out.push( { label: k, x: p.x, z: p.z, color: '#f8a', r: 3 } );
		return out;

	}

	get blockers() {

		return { debugShapes: () => this.collision?.debugShapes() ?? [] };

	}

}
