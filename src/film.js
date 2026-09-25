import * as THREE from 'three';
import { U } from './core/uniforms.js';

// Deterministic trailer director. Each call to next() advances the world by one
// frame at a fixed rate and places the camera for the current shot, so the
// recorder can capture a perfectly smooth sequence regardless of render speed.

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );
const ease = ( t ) => t * t * ( 3 - 2 * t );
const easeInOut = ( t ) => ( t < 0.5 ? 4 * t * t * t : 1 - Math.pow( - 2 * t + 2, 3 ) / 2 );
const lerp = ( a, b, t ) => a + ( b - a ) * t;
const lerpV = ( a, b, t ) => a.clone().lerp( b, t );

function shots( app ) {

	const td = app.terrainData;
	const ground = ( x, z ) => Math.max( td.heightAt( x, z ), 0 );
	const horn = V( - 120, 1350, - 3350 );

	return [
		{
			// 1. Golden hour: a slow push through the meadow toward the lake and the horn
			dur: 7.5, hours: 16.2, weather: 'clear', title: 'open',
			camera: ( u ) => {

				const z = lerp( 540, 516, easeInOut( u ) );
				const x = lerp( - 2, - 6, u );
				return { p: V( x, ground( x, z ) + 1.15 + u * 0.5, z ), t: V( - 40, 330 + u * 40, - 2800 ) };

			},
		},
		{
			// 2. Drone over the larch woods on the eastern flank
			dur: 5.5, hours: 16.3, weather: 'clear', caption: 'The larch woods',
			camera: ( u ) => {

				const k = easeInOut( u );
				const p = V( lerp( 420, 300, k ), 0, lerp( 150, - 260, k ) );
				p.y = Math.max( ground( p.x, p.z ) + 55, lerp( 150, 120, k ) );
				return { p, t: V( lerp( 60, - 40, k ), lerp( 40, 60, k ), lerp( - 400, - 900, k ) ) };

			},
		},
		{
			// 3. Mute swans: tracking alongside, just above the water
			dur: 5.5, hours: 16.55, weather: 'clear', caption: 'Mute swans',
			setup: () => ( { bird: app.waterfowl.birds[ 0 ] } ),
			camera: ( u, c ) => {

				const b = c.bird.pos, h = c.bird.heading;
				const side = h + Math.PI / 2 + lerp( 0.55, 0.15, ease( u ) );
				const r = lerp( 6.5, 5.2, u );
				return { p: V( b.x + Math.sin( side ) * r, 0.55, b.z + Math.cos( side ) * r ), t: V( b.x + Math.sin( h ) * 1.2, 0.55, b.z + Math.cos( h ) * 1.2 ) };

			},
		},
		{
			// 4. Red deer grazing at the forest edge; a slow lateral truck
			dur: 6, hours: 16.62, weather: 'clear', caption: 'Red deer in the rut',
			setup: () => {

				const stag = app.mammals.deer[ 0 ];
				const c = stag.pos.clone();
				const a = stag.heading + 1.9;
				return { stag, c, a };

			},
			camera: ( u, c ) => {

				const a = c.a + lerp( - 0.12, 0.12, easeInOut( u ) );
				const p = V( c.c.x + Math.sin( a ) * 10.5, 0, c.c.z + Math.cos( a ) * 10.5 );
				p.y = ground( p.x, p.z ) + 0.95;
				const s = c.stag.mesh.position;
				return { p, t: V( s.x, s.y + 1.05, s.z ) };

			},
		},
		{
			// 5. Alpine marmot on sentry duty
			dur: 4.5, hours: 16.4, weather: 'clear', caption: 'Alpine marmot',
			setup: () => {

				const m = app.mammals.marmots[ 0 ];
				m.forced = 'sentinel';
				// turn it to face into the low sun so the camera sees a lit face
				const sun = U.uTrueSunDir.value;
				m.heading = Math.atan2( sun.x, sun.z ) - 0.45;
				return { m };

			},
			camera: ( u, c ) => {

				const m = c.m.mesh.position, h = c.m.heading + 0.45;
				const r = lerp( 1.7, 1.3, easeInOut( u ) );
				return { p: V( m.x + Math.sin( h ) * r, m.y + 0.42, m.z + Math.cos( h ) * r ), t: V( m.x, m.y + 0.25, m.z ) };

			},
			teardown: ( c ) => {

				c.m.forced = undefined;

			},
		},
		{
			// 6. A trout breaks the surface
			dur: 4.2, hours: 16.5, weather: 'clear', caption: 'Rainbow trout',
			setup: () => {

				const p = V( - 30, 0.75, 455 ), fwd = V( - 0.15, 0, - 1 ).normalize();
				const spot = p.clone().addScaledVector( fwd, 8.5 );
				return { p, spot, fired: false };

			},
			camera: ( u, c, t ) => {

				if ( ! c.fired && t > 1.0 ) {

					c.fired = true;
					app.fish.forceJump( c.spot.x, c.spot.z, Math.PI * 0.5, 4.6, 1.6, 1.7 );

				}

				return { p: c.p.clone().add( V( u * 0.4, 0, 0 ) ), t: V( c.spot.x, 0.7, c.spot.z ) };

			},
			teardown: () => {

				app.fish.timer = 8;

			},
		},
		{
			// 7. Starlings wheeling against the low sun
			dur: 6.5, hours: 16.98, weather: 'clear', caption: 'Starlings at sundown',
			setup: () => ( { look: null } ),
			camera: ( u, c ) => {

				const P = app.starlings.pos, n = app.starlings.n;
				const m = V( 0, 0, 0 );
				for ( let i = 0; i < n; i ++ ) m.add( V( P[ i * 3 ], P[ i * 3 + 1 ], P[ i * 3 + 2 ] ) );
				m.multiplyScalar( 1 / n );
				c.look = c.look ? c.look.lerp( m, 0.08 ) : m;
				// camera sits between the flock and the horn, looking back toward the sun
				const p = V( c.look.x - 25, 0, c.look.z - 72 );
				p.y = Math.max( ground( p.x, p.z ) + 6, c.look.y - 22 ) + u * 4;
				return { p, t: c.look.clone() };

			},
		},
		{
			// 8. Autumn rain on the lake
			dur: 5.5, hours: 15.2, weather: 'rain', caption: 'Autumn rain',
			camera: ( u ) => {

				const x = lerp( - 62, - 50, easeInOut( u ) );
				return { p: V( x, 1.7, 474 ), t: V( x - 30, 6, 300 ) };

			},
		},
		{
			// 9. A thunderstorm rolls down the valley
			dur: 6, hours: 15.6, weather: 'storm', caption: 'Thunderstorm',
			setup: () => ( { strikes: [ 1.3, 3.6 ] } ),
			camera: ( u, c, t ) => {

				const p = V( lerp( - 5, - 2, u ), ground( - 4, 512 ) + 2.4, lerp( 512, 504, u ) );
				if ( c.strikes.length && t >= c.strikes[ 0 ] ) {

					c.strikes.shift();
					// straight up the lake toward the horn, a few km off
					const aim = Math.atan2( - 1, - 0.02 ) + ( c.strikes.length ? 0.12 : - 0.2 );
					app.weather.strike( app.camera, aim, 2200 + c.strikes.length * 900 );

				}

				return { p, t: V( - 60, 420, - 2600 ) };

			},
		},
		{
			// 10. Blue hour: the lake turns to glass
			dur: 5.5, hours: 17.5, weather: 'clear', caption: 'Blue hour',
			camera: ( u ) => {

				const z = lerp( 470, 452, easeInOut( u ) );
				return { p: V( - 38, 1.05, z ), t: V( - 90, 300, - 2800 ) };

			},
		},
		{
			// 11. Night: the northern lights over the ridge, then the title
			dur: 9, hours: 22.4, weather: 'clear', caption: 'Northern lights', title: 'end',
			camera: ( u ) => {

				const k = easeInOut( u );
				const yaw = lerp( - 2.25, - 2.0, k );
				const p = V( - 20, ground( - 20, 540 ) + 1.7, 540 );
				return { p, t: p.clone().add( V( Math.sin( yaw ) * 100, lerp( 20, 32, k ), Math.cos( yaw ) * 100 ) ) };

			},
		},
	];

}

export class Film {

	constructor( app ) {

		this.app = app;
		this.fps = 30;
		this.shots = shots( app );
		this.index = - 1;
		this.frame = 0;
		this.total = this.shots.reduce( ( s, sh ) => s + Math.round( sh.dur * this.fps ), 0 );
		this.el = {
			root: document.getElementById( 'film' ),
			title: document.getElementById( 'film-title' ),
			end: document.getElementById( 'film-end' ),
			caption: document.getElementById( 'film-caption' ),
			fade: document.getElementById( 'film-fade' ),
		};
		this.el.root.hidden = false;
		document.body.classList.add( 'filming' );
		app.autoResolution = false;
		app.audio.enabled = false;
		this._cam = { p: V( 0, 0, 0 ), t: V( 0, 0, - 1 ) };
		app.director = () => this._place();

	}

	_place() {

		const cam = this.app.camera;
		cam.position.copy( this._cam.p );
		cam.lookAt( this._cam.t );
		cam.updateMatrixWorld();

	}

	_begin( i ) {

		const app = this.app;
		if ( this.shot?.teardown ) this.shot.teardown( this.ctx );
		this.index = i;
		this.shot = this.shots[ i ];
		this.shotFrame = 0;
		this.shotFrames = Math.round( this.shot.dur * this.fps );
		app.hours = this.shot.hours;
		app.timeSpeed = 15;
		app.weather.dynamic = false;
		app.weather.snap( this.shot.weather );
		this.ctx = this.shot.setup ? this.shot.setup() : {};
		this.el.caption.textContent = this.shot.caption || '';
		// settle the world at the new place (adaptation, particles, streaming) off-camera
		const cam = this.shot.camera( 0, this.ctx, 0 );
		this._cam.p.copy( cam.p );
		this._cam.t.copy( cam.t );
		app.post._adaptFrames = 0;
		for ( let k = 0; k < 24; k ++ ) {

			app.update( 1 / this.fps );
			const c = this.shot.camera( 0, this.ctx, 0 );
			this._cam.p.copy( c.p );
			this._cam.t.copy( c.t );
			app.render();

		}

	}

	_overlays( t, dur ) {

		const s = this.shot;
		const fadeIn = ( a, b ) => Math.min( 1, Math.max( 0, ( t - a ) / ( b - a ) ) );
		const fadeOut = ( a, b ) => 1 - fadeIn( a, b );
		// caption: lower left, in after a beat, out before the cut
		this.el.caption.style.opacity = s.caption && s.title !== 'end' ? Math.min( fadeIn( 0.5, 1.2 ), fadeOut( dur - 1.1, dur - 0.5 ) ) : ( s.title === 'end' ? Math.min( fadeIn( 0.5, 1.2 ), fadeOut( 3.0, 3.8 ) ) : 0 );
		this.el.title.style.opacity = s.title === 'open' ? Math.min( fadeIn( 1.2, 2.6 ), fadeOut( dur - 2.2, dur - 1.0 ) ) : 0;
		this.el.end.style.opacity = s.title === 'end' ? fadeIn( dur - 4.8, dur - 3.2 ) : 0;
		// fade up from black at the very start, down to black at the very end
		let black = 0;
		if ( this.index === 0 ) black = fadeOut( 0, 1.2 );
		if ( this.index === this.shots.length - 1 ) black = Math.max( black, fadeIn( dur - 1.0, dur - 0.1 ) );
		this.el.fade.style.opacity = black;

	}

	// Advance one frame; returns false when the film is over.
	next() {

		if ( this.index < 0 || this.shotFrame >= this.shotFrames ) {

			if ( this.index + 1 >= this.shots.length ) return false;
			this._begin( this.index + 1 );

		}

		const t = this.shotFrame / this.fps;
		const u = this.shotFrame / Math.max( 1, this.shotFrames - 1 );
		const c = this.shot.camera( u, this.ctx, t );
		this._cam.p.copy( c.p );
		this._cam.t.copy( c.t );
		this.app.update( 1 / this.fps );
		this.app.render();
		this._overlays( t, this.shot.dur );
		this.shotFrame ++;
		this.frame ++;
		return true;

	}

	// jump to a given shot and time (for previewing)
	seek( index, seconds ) {

		this._begin( index );
		const n = Math.round( seconds * this.fps );
		for ( let k = 0; k < n; k ++ ) this.next();

	}

}

export { U };
