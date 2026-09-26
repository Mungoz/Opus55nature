import * as THREE from 'three';
import { routePath, PLACES } from './layout.js';
import { Collision } from './collision.js';
import { BEATS, CLOCK, SKY } from './beats.js';
import { StoryProps } from './props/index.js';
import { READS } from './notes.js';

const _v = new THREE.Vector3();
const _n = { dist: 0, d: 0, side: 0 };
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
		const P = this.props;
		this.addInteractable( { id: 'boatlog', x: P.logBox.x, y: P.logBox.y, z: P.logBox.z, prompt: 'open the box', use: ( S ) => S.ui.read( READS.boatlog ) } );
		this.addInteractable( { id: 'hutbook', x: P.bookTin.x, y: P.bookTin.y, z: P.bookTin.z, prompt: 'open the tin', use: ( S ) => S.ui.read( READS.hutbook, () => ( S.flags.hutbookRead = true ) ) } );

		const start = this.jump && this.path.ids[ this.jump ] !== undefined ? this.path.ids[ this.jump ] : 0;
		this.setProgress( start, true );

	}

	// the player pressed Begin
	async begin() {

		const ui = this.ui;
		this.begun = true;
		ui.lock();
		if ( this.jump ) {

			ui.fade( 0, 1.2 );
			return;

		}

		// (the row-in cutscene replaces this)
		ui.fade( 1, 0.01 );
		await this.wait( 0.6 );
		ui.fade( 0, 3 );

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
	wait( sec ) {

		return new Promise( ( res ) => this._waits.push( { t: this.time + sec, res } ) );

	}

	until( fn ) {

		return new Promise( ( res ) => this._untils.push( { fn, res } ) );

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
		this.path.nearest( cam.x, cam.z, Math.max( 0, this.progress - 40 ), this.progress + 45, _n );
		this.near = { dist: _n.dist, d: _n.d };
		if ( _n.dist < 18 && _n.d > this.progress ) this.progress = _n.d;
		// beyond the free band: denser going, and a stop
		const over = Math.max( 0, _n.dist - 25 );
		this.offPath = over;
		this.app.controls.moveScale = 1 - 0.55 * THREE.MathUtils.smoothstep( over, 0, 90 );
		if ( over > 125 && ! this.noclip ) {

			// ease back: you can't go further out
			const back = this.path.at( _n.d );
			const dx = cam.x - back.x, dz = cam.z - back.z, l = Math.hypot( dx, dz );
			const lim = 150;
			if ( l > lim ) { cam.x = back.x + dx / l * lim; cam.z = back.z + dz / l * lim; }

		}

		this.lost = over > 12 ? this.lost + dt : Math.max( 0, this.lost - dt * 2 );

	}

	// ---------------------------------------------------------------- frame
	update( dt ) {

		const app = this.app;
		this.time += dt;
		if ( this.input ) this._track( dt );
		// the clock eases toward the route's time for where you are, never racing
		const target = this.clockOverride ?? this.clockAt( this.progress );
		const rate = this.clockRate ?? 0.0045; // hours per second at most
		app.hours += THREE.MathUtils.clamp( target - app.hours, - rate * dt, rate * dt );
		// the weather: keyframes along the route, unless a beat has taken it over
		const sky = this.skyAt( this.progress, this._sky || ( this._sky = {} ) );
		if ( this.skyOverride ) Object.assign( sky, this.skyOverride );
		const tg = app.weather.target === this._wt ? this._wt : ( app.weather.target = this._wt = { ...app.weather.target } );
		for ( const k of [ 'clouds', 'wind', 'rain', 'overcast', 'haze', 'mist', 'base', 'lowCloud', 'storm' ] ) if ( sky[ k ] !== undefined ) tg[ k ] = sky[ k ];
		// beats
		for ( const b of this.beats ) {

			if ( b.state !== 'waiting' ) continue;
			if ( this.progress < this._beatAt( b ) ) continue;
			if ( b.when && ! b.when( this ) ) continue;
			b.state = 'running';
			this.log.push( [ b.id, Math.round( this.time ), Math.round( this.progress ) ] );
			Promise.resolve( b.run?.( this ) ).then( () => ( b.state = 'done' ), ( e ) => {

				console.error( 'beat', b.id, e );
				b.state = 'done';

			} );

		}

		for ( let i = this._waits.length - 1; i >= 0; i -- ) if ( this.time >= this._waits[ i ].t ) this._waits.splice( i, 1 )[ 0 ].res();
		for ( let i = this._untils.length - 1; i >= 0; i -- ) if ( this._untils[ i ].fn( this ) ) this._untils.splice( i, 1 )[ 0 ].res();
		this._interact();

	}

	// ---------------------------------------------------------------- things to read and use
	addInteractable( it ) {

		this.interactables.push( { r: 2.4, enabled: true, ...it } );

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
