import * as THREE from 'three';
import { READS } from './notes.js';
import { FALL } from '../core/features.js';

// The script: the clock and the sky along the route, and the beats that play as you reach
// each place. Positions are the route's waypoint ids (layout.js). Figure sightings are F1-F7,
// the animal encounters E1-E15 (HORROR_PLAN.md, 5.1 and 5.3).

const V = ( x, y, z ) => new THREE.Vector3( x, y, z );

// the clock (hours) at each waypoint; between them it follows the walk
export const CLOCK = [
	[ 'jettyHead', 16.5 ], [ 'mouth', 16.53 ], [ 'ford', 16.58 ], [ 'gate', 16.66 ], [ 'pond', 16.7 ],
	[ 'marmots', 16.76 ], [ 'signpost', 16.8 ], [ 'bridge', 16.87 ], [ 'hut', 16.93 ],
	// (the storm runs the clock on while you shelter: see the storm beat)
	[ 'trough', 17.44 ], [ 'troughEnd', 17.46 ], [ 'tarn', 17.52 ], [ 'pool', 17.58 ], [ 'wood', 17.63 ], [ 'bear', 17.72 ],
	[ 'strand', 17.8 ], [ 'boatJ', 17.95 ], [ 'boat', 18.05 ],
];

// the weather at each waypoint (eased between; the storm beat overrides it at the hut)
export const SKY = {
	clouds: [ [ 'jettyHead', 0.42 ], [ 'gate', 0.55 ], [ 'signpost', 0.8 ], [ 'bridge', 0.95 ], [ 'hut', 1.0 ], [ 'trough', 0.55 ], [ 'tarn', 0.45 ], [ 'strand', 0.25 ], [ 'boat', 0.2 ] ],
	wind: [ [ 'jettyHead', 0.8 ], [ 'gate', 1.15 ], [ 'signpost', 1.5 ], [ 'bridge', 1.8 ], [ 'hut', 2.0 ], [ 'trough', 0.35 ], [ 'tarn', 0.2 ], [ 'strand', 0.1 ], [ 'boat', 0.04 ] ],
	overcast: [ [ 'jettyHead', 0.05 ], [ 'gate', 0.25 ], [ 'signpost', 0.6 ], [ 'bridge', 0.85 ], [ 'hut', 1.0 ], [ 'trough', 0.3 ], [ 'strand', 0.08 ] ],
	rain: [ [ 'signpost', 0 ], [ 'bridge', 0.06 ], [ 'troughView', 0.25 ], [ 'hut', 0.5 ], [ 'trough', 0 ] ],
	haze: [ [ 'jettyHead', 2.2 ], [ 'bridge', 3.5 ], [ 'hut', 4.5 ], [ 'trough', 3.2 ], [ 'strand', 2.6 ] ],
	mist: [ [ 'jettyHead', 0.0004 ], [ 'bridge', 0.0008 ], [ 'trough', 0.0016 ], [ 'tarn', 0.0022 ], [ 'wood', 0.0015 ], [ 'strand', 0.002 ], [ 'boat', 0.0024 ] ],
	base: [ [ 'jettyHead', 3000 ], [ 'signpost', 1400 ], [ 'hut', 700 ], [ 'trough', 900 ], [ 'strand', 2500 ] ],
	lowCloud: [ [ 'signpost', 0 ], [ 'hut', 0.004 ], [ 'trough', 0.003 ], [ 'strand', 0.0005 ] ],
	storm: [ [ 'hut', 0 ] ],
	// the grade (post.js): exposure key, contrast, cooled shadows, colour drained - the valley
	// losing its warmth as the evening goes
	key: [ [ 'jettyHead', 0.9 ], [ 'bridge', 0.82 ], [ 'hut', 0.74 ], [ 'trough', 0.72 ], [ 'strand', 0.68 ], [ 'boat', 0.64 ] ],
	contrast: [ [ 'jettyHead', 1.1 ], [ 'hut', 1.14 ], [ 'strand', 1.18 ] ],
	cool: [ [ 'jettyHead', 0.1 ], [ 'hut', 0.3 ], [ 'tarn', 0.5 ], [ 'strand', 0.55 ] ],
	desat: [ [ 'jettyHead', 0.04 ], [ 'hut', 0.16 ], [ 'tarn', 0.24 ], [ 'boat', 0.32 ] ],
	// the valley going quiet: songbirds, then wind, then the lake's lapping
	birds: [ [ 'jettyHead', 1 ], [ 'signpost', 0.8 ], [ 'hut', 0.3 ], [ 'trough', 0.35 ], [ 'tarn', 0.15 ], [ 'wood', 0.1 ], [ 'strand', 0 ] ],
	windMix: [ [ 'wood', 1 ], [ 'strand', 0.6 ], [ 'boatJ', 0.15 ], [ 'boat', 0.05 ] ],
	lapMix: [ [ 'strand', 1 ], [ 'boatJ', 0.6 ], [ 'boat', 0.15 ] ],
};

const STORM = { clouds: 1.0, wind: 2.1, rain: 1.0, overcast: 1.0, haze: 5.0, mist: 0.0012, base: 520, lowCloud: 0.006, storm: 1 };

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const wrap = ( a ) => Math.atan2( Math.sin( a ), Math.cos( a ) );
const dist2 = ( a, x, z ) => Math.hypot( a.x - x, a.z - z );

// the nearest of a list to p
function nearest( list, p, key = ( a ) => a.pos ) {

	let best = null, bd = Infinity;
	for ( const a of list ) {

		const q = key( a ), d = Math.hypot( q.x - p.x, q.z - p.z );
		if ( d < bd ) { bd = d; best = a; }

	}

	return best;

}

// move an animal somewhere else (only when it can't be seen)
function teleport( a, x, z, heading ) {

	a.pos.set( x, 0, z );
	if ( heading !== undefined ) a.heading = heading;
	a.speed = 0;
	a.target?.set( x, 0, z );

}

// ---------------------------------------------------------------------------
// Beats: { id, at: waypoint id, lead (m, + later / - earlier), when( S ), run( S ), skip( S ) }
// run is a script (async; S.wait, S.until); skip applies its end state when a debug jump
// starts past it.
// ---------------------------------------------------------------------------
export const BEATS = [

	// ----------------------------------------------------------------- the jetty
	{
		id: 'jetty', at: 'jettyHead',
		run: async ( S ) => {

			// J.'s berth: the line on the bollard cut clean. The boat log in its box.
			S.hint( 'boatlog', 25 );

		},
	},

	// E2: wagtails running the shingle ahead of you (their calls when they flit)
	{
		id: 'E2-wagtails', at: 'jettyLand',
		run: async ( S ) => {

			S.app.smallBirds.onEvent = ( kind, p ) => {

				if ( S.cam.distanceTo( p ) > 60 ) return;
				if ( kind === 'wagtail' ) S.sound.wagtail( p.clone() );
				else if ( kind === 'dipper' ) S.sound.dipper( p.clone() );

			};

		},
		skip: ( S ) => BEATS.find( ( b ) => b.id === 'E2-wagtails' ).run( S ),
	},

	// E4: the herd fords the stream ahead of you, the stag last; on the near bank the stag
	// roars and the hinds turn and stare back west, where something stands at the larch edge
	// (F1). They trot off east over the moraine.
	{
		id: 'E4-ford', at: 'mouth', lead: 6,
		run: async ( S ) => {

			const app = S.app, M = app.mammals, td = app.terrainData;
			const deer = M.deer;
			// the ford: a reach of the stream about 420 m down from the fall
			const R = td.river;
			let i = R.findIndex( ( s ) => s.s > 420 );
			const a = R[ i - 1 ], b = R[ i + 1 ], c = R[ i ];
			const tx = b.p.x - a.p.x, tz = b.p.y - a.p.y, tl = Math.hypot( tx, tz );
			const nx = tz / tl, nz = - tx / tl; // across the stream (toward +x, the path's side)
			const sgn = nx > 0 ? 1 : - 1;
			const W = V( c.p.x - nx * sgn * ( c.width + 5 ), 0, c.p.y - nz * sgn * ( c.width + 5 ) );
			const E = V( c.p.x + nx * sgn * ( c.width + 5 ), 0, c.p.y + nz * sgn * ( c.width + 5 ) );
			const mid = V( c.p.x, 0, c.p.y );
			// where they stand on the near side: well east of the path
			const pathHere = S.path.at( S.path.nearest( E.x, E.z ).d );
			const D = V( pathHere.x + 16 * sgn, 0, pathHere.z + 6 );
			const away = V( 140, 0, 592 );
			// F1: the figure at the larch edge across the meadow, where the deer look
			const F1 = S.findStand( V( - 12, 0, 566 ), 25, { edge: true } );
			// the herd is at the water's edge already (staged at load)
			const order = [ ...deer.filter( ( d ) => ! d.stag ), deer.find( ( d ) => d.stag ) ];
			order.forEach( ( d, k ) => {

				d.cmd = { do: 'stare', watch: F1.clone(), face: true };
				if ( dist2( d.pos, W.x, W.z ) > 12 ) teleport( d, W.x - 4 - k * 2.2, W.z + ( k - 2 ) * 2.5, Math.atan2( E.x - W.x, E.z - W.z ) );

			} );
			S.figure.place( F1.x, F1.z, Math.atan2( D.x - F1.x, D.z - F1.z ) );
			S.figure.setMode( 'direct' );
			S.figure.tilt = 0.42;
			// the herd lifts its heads and looks back west; then, one by one, into the water
			await S.until( () => S.progress > S.path.ids.mouth + 18 );
			const splash = S.every( ( dt ) => {

				for ( const d of deer ) {

					const w = S.waterAt( d.pos.x, d.pos.z ), g = td.heightAt( d.pos.x, d.pos.z );
					if ( w - g < 0.12 || d.speed < 0.2 ) continue;
					d._spl = ( d._spl ?? 0 ) - dt;
					if ( d._spl <= 0 ) {

						d._spl = 0.32 + Math.random() * 0.2;
						const p = V( d.pos.x + Math.sin( d.heading ) * 0.6, w, d.pos.z + Math.cos( d.heading ) * 0.6 );
						app.particles.splash( p, 5, 1.1 );
						if ( Math.random() < 0.6 ) S.sound.wade( p, 0.5 );

					}

				}

				return S.flags.fordDone;

			} );
			void splash;
			for ( const [ k, d ] of order.entries() ) {

				await S.wait( k === 0 ? 0.5 : 1.6 + Math.random() * 1.2 );
				d.cmd = { do: 'walk', to: mid.clone().add( V( ( Math.random() - 0.5 ) * 3, 0, ( Math.random() - 0.5 ) * 3 ) ), wade: true, speed: 1.15, then: 'walk', near: 1.5 };
				const leg2 = async () => {

					await S.until( () => d.cmd?.done );
					// the stag pauses mid-stream, head up, looking back
					if ( d.stag ) {

						d.cmd = { do: 'stare', watch: F1.clone(), face: false, wade: true };
						await S.wait( 3.2 );

					}

					d.cmd = { do: 'walk', to: E.clone().add( V( ( Math.random() - 0.5 ) * 4, 0, ( Math.random() - 0.5 ) * 4 ) ), wade: true, speed: 1.25, near: 1.6 };
					await S.until( () => d.cmd?.done );
					d.cmd = { do: 'walk', to: D.clone().add( V( ( Math.random() - 0.5 ) * 8, 0, ( Math.random() - 0.5 ) * 6 ) ), speed: 1.3, near: 1.5, then: 'stare' };
					await S.until( () => d.cmd?.done );
					d.cmd = { do: 'stare', watch: F1.clone(), face: true };

				};

				leg2();

			}

			// on the near bank: the stag roars, the hinds stare at the larch edge
			const stag = order[ order.length - 1 ];
			await S.until( () => stag.cmd?.do === 'stare' && stag.cmd.face );
			await S.wait( 1.5 );
			stag.cmd = { do: 'roar', then: 'stare', watch: F1.clone(), face: true };
			await S.until( () => stag.cmd.done || S.progress > S.path.ids.ford + 80 );
			stag.cmd = { do: 'stare', watch: F1.clone(), face: true };
			S.flags.fordDone = true;
			// they hold until you come close, or for half a minute
			const t0 = S.time;
			await S.until( () => S.time - t0 > 30 || deer.some( ( d ) => dist2( d.pos, S.cam.x, S.cam.z ) < 26 ) );
			for ( const [ k, d ] of order.entries() ) {

				await S.wait( 0.3 + k * 0.4 );
				d.cmd = { do: 'trot', to: away.clone().add( V( ( Math.random() - 0.5 ) * 12, 0, ( Math.random() - 0.5 ) * 12 ) ), speed: 3.2, near: 3, then: 'graze' };

			}

			await S.wait( 14 );
			for ( const d of deer ) { d.cmd = null; d.home.set( away.x, away.z ); d.state = 'graze'; d.timer = 20; }
			// F1 goes when you are not looking
			await S.untilUnseen( 1.5 );
			S.figure.setMode( 'hidden' );

		},
		skip: ( S ) => {

			for ( const d of S.app.mammals.deer ) { teleport( d, 140, 592 ); d.home.set( 140, 592 ); d.cmd = null; }

		},
	},

	// E6: the marmots' bank. A sentinel sits up and whistles, the others run for their holes,
	// it whistles again and dives; as you pass, one head comes up out of a burrow - watching
	// something behind you, back down the path.
	{
		id: 'E6-marmots', at: 'marmots', lead: - 48,
		run: async ( S ) => {

			const M = S.app.mammals, ms = M.marmots;
			const sentinel = nearest( ms, S.cam );
			sentinel.cmd = { do: 'sentinel', watch: S.cam };
			await S.wait( 1.1 );
			S.app.audio.whistle( sentinel.pos.clone().setY( 1 ) );
			await S.wait( 1.4 );
			for ( const m of ms ) if ( m !== sentinel ) { m.cmd = { do: 'dive' }; await S.wait( 0.15 + Math.random() * 0.3 ); }
			await S.until( () => dist2( sentinel.pos, S.cam.x, S.cam.z ) < 27 );
			S.app.audio.whistle( sentinel.pos.clone().setY( 1 ) );
			await S.wait( 0.9 );
			sentinel.cmd = { do: 'dive' };
			// past the bank: one looks out again, not at you
			await S.until( () => S.progress > S.path.ids.marmots + 10 );
			const peek = ms.find( ( m ) => m.state === 'hide' ) ?? sentinel;
			const back = S.behind( 45 );
			peek.cmd = { do: 'peek', watch: V( back.x, 0, back.z ) };
			await S.until( () => S.progress > S.path.ids.marmots + 70 );
			for ( const m of ms ) m.cmd = null;

		},
	},

	// the first thunder, very far off behind the peaks
	{
		id: 'thunder1', at: 'gate', lead: - 25,
		run: async ( S ) => {

			S.app.audio.thunder( V( 0, 0, - 3000 ), 5200, 0.55, 0.3 );

		},
	},

	// the gate in the pasture fence: you open it, it creaks; after you are through and have
	// walked on, it swings shut behind you and the latch drops
	{
		id: 'gate', at: 'gate', lead: - 30,
		run: async ( S ) => {

			const P = S.props, G = P.gate;
			const it = S.addInteractable( { id: 'gate', x: G.pos.x, y: G.pos.y, z: G.pos.z, r: 2.6, prompt: 'open the gate', use: async () => {

				it.enabled = false;
				S.sound.creak( G.pos, 1.5, 0.4, 140, 230 );
				await P.swingGate( true );

			} } );
			await S.until( () => S.progress > S.path.ids.gate + 30 && dist2( G.pos, S.cam.x, S.cam.z ) > 25 );
			await S.untilOffscreen( G.pos, 3 );
			await P.swingGate( false );
			S.sound.latch( G.pos );
			S.sound.knock( G.pos, 0.35 );
			S.ui.caption( '[ a gate latch, behind you ]', 3.5 );

		},
		skip: ( S ) => {},
	},

	// the signpost and the wayside cross: the walkers' register; finches burst from the tree by
	// the cross (E7); a cowbell, once, from up the valley
	{
		id: 'signpost', at: 'signpost', lead: - 30,
		run: async ( S ) => {

			const P = S.props;
			S.addInteractable( { id: 'register', x: P.register.x, y: P.register.y, z: P.register.z, r: 2.4, prompt: 'open the tin', use: ( S2 ) => S2.ui.read( READS.register, () => ( S.flags.registerRead = true ) ) } );
			await S.until( () => dist2( S.cam, 13, 755 ) < 14 );
			const F = S.app.smallBirds.flush( V( 13, 0, 756 ), S.cam );
			if ( F ) S.sound.flush( V( F.birds[ 0 ].pos.x, F.birds[ 0 ].pos.y, F.birds[ 0 ].pos.z ), F.birds.length );
			await S.until( () => S.progress > S.path.ids.signpost + 4 );
			await S.wait( 2 );
			S.sound.cowbell( V( - 150, 12, 790 ), 2, 0.8 );
			S.ui.caption( '[ a cowbell, far off ]', 4 );

		},
	},

	// F2 (and E8): on the footbridge, the pool's reflection shows someone standing on its bank
	// upstream; the bank is empty
	{
		id: 'F2-bridge', at: 'bridge', lead: 1,
		run: async ( S ) => {

			const td = S.app.terrainData, R = td.river;
			const on = S.props.bridge;
			// a place on the pool's north bank, 16 m upstream of the bridge
			let best = null;
			for ( const s of R ) if ( Math.abs( s.s - 146 ) < 3 ) best = s;
			const i = R.indexOf( best ), a = R[ i - 1 ], b = R[ i + 1 ];
			const tx = b.p.x - a.p.x, tz = b.p.y - a.p.y, l = Math.hypot( tx, tz );
			let nx = tz / l, nz = - tx / l;
			// the bank on the far side of the pool from where you stand on the bridge
			if ( ( nx * ( S.cam.x - best.p.x ) + nz * ( S.cam.z - best.p.y ) ) > 0 ) { nx = - nx; nz = - nz; }
			const px = best.p.x + nx * ( best.width + 1.2 ), pz = best.p.y + nz * ( best.width + 1.2 );
			S.figure.place( px, pz, Math.atan2( S.cam.x - px, S.cam.z - pz ) );
			S.figure.tilt = 0.5;
			S.figure.setMode( 'reflect' );
			// until you have seen it in the water, or walked on
			const t0 = S.time;
			await S.until( () => ( S.sight.reflect > 0 && S.seenFor > 1.3 ) || S.time - t0 > 25 || S.progress > S.path.ids.bridge + 22 );
			if ( S.sight.reflect > 0 ) S.drone( 0.6, 4 );
			await S.untilUnseen( 1.0 );
			S.figure.setMode( 'hidden' );
			void on;

		},
	},

	// the storm breaks as you come up to the hut
	{
		id: 'storm-breaks', at: 'troughView', lead: - 4,
		run: async ( S ) => {

			const app = S.app;
			S.skyOverride = { ...STORM, rain: 0.75 };
			// a close strike, off beyond the hut, the thunder right on it
			app.weather.strike( app.camera, Math.atan2( - 1, 0.2 ), 900 );
			S.moveScaleRain = 0.85;

		},
	},

	// the storm: shelter under the porch; the clock runs on under the cloud. In the lightning,
	// a figure at the far side of the pen, nearer at every flash (F3); the cowbell from the
	// empty pen. The hut book. It clears after the book is read, or three minutes.
	{
		id: 'storm', at: 'hut', lead: - 2, hold: true, holdAt: 2.5,
		run: async ( S ) => {

			const app = S.app, P = S.props, f = P.hutFrame;
			S.skyOverride = { ...STORM };
			S.hint( 'hutbook', 30 );
			const t0 = S.time, h0 = app.hours;
			S.clockOverride = h0;
			// the clock: 17:00 to 17:26 over the storm
			const clock = S.every( () => {

				if ( ! S.storming ) return true;
				S.clockOverride = THREE.MathUtils.lerp( h0, 17.43, Math.min( 1, ( S.time - t0 ) / 170 ) );
				S.clockRate = 0.02;
				return false;

			} );
			void clock;
			S.storming = true;
			// the figure beyond the pen fence, then nearer
			const spots = [ [ 9, - 16 ], [ 6.5, - 11.5 ], [ 4.2, - 7.2 ] ].map( ( [ lx, lz ] ) => f.toWorld( lx, 0, lz ) );
			const face = () => Math.atan2( S.cam.x - S.figure.pos.x, S.cam.z - S.figure.pos.z );
			let flash = 0;
			const strike = () => {

				// lightning behind the pen from where you stand, far enough that the thunder lags
				const aim = Math.atan2( spots[ 0 ].z - S.cam.z, spots[ 0 ].x - S.cam.x ) + ( Math.random() - 0.5 ) * 0.6;
				app.weather.strike( app.camera, aim, 1400 + Math.random() * 1200 );

			};

			await S.until( () => P.underPorch( S.cam.x, S.cam.z ) || S.time - t0 > 20 );
			await S.wait( 6 );
			// at least a minute of it; then it clears once the book has been read (and put back a
			// little while), or after three minutes
			const over = () => S.time - t0 > 180 || ( S.time - t0 > 65 && S.flags.hutbookRead && S.time - S.flags.hutbookAt > 9 );
			while ( ! over() ) {

				// move it only while no one is looking
				if ( flash < 3 && S.unseenFor > 0.4 ) {

					const p = spots[ flash ++ ];
					S.figure.place( p.x, p.z, 0 );
					S.figure.yaw = face();
					S.figure.tilt = 0.55;
					S.figure.setMode( 'direct' );

				}

				strike();
				if ( flash === 2 ) setTimeout( () => {

					S.sound.cowbell( f.toWorld( 7, 1, - 7 ), 2, 0.9 );
					S.ui.caption( '[ a cowbell, in the empty pen ]', 4 );

				}, 4000 );
				// the trough's boards go while no one sees: while the page of the book covers the
				// view, or while the trough is out of it
				if ( ! S.flags.troughOpen && ( S.reading || S.offscreen( P.troughPos, 2 ) ) ) {

					P.setTroughCover( false );
					S.flags.troughOpen = true;

				}

				await S.wait( 11 + Math.random() * 8 );

			}

			// a last strike: in its glare, it is gone (and the trough's boards, if they are not yet)
			strike();
			S.figure.setMode( 'hidden' );
			if ( ! S.flags.troughOpen ) { P.setTroughCover( false ); S.flags.troughOpen = true; }
			// it clears: the rain stops within a minute, the cloud lifts into mist
			S.storming = false;
			S.clockOverride = null;
			S.clockRate = null;
			S.skyOverride = { ...STORM, rain: 0, storm: 0, wind: 0.8, clouds: 0.8, overcast: 0.7, lowCloud: 0.004, mist: 0.0018 };
			S.release( 'storm' );
			await S.wait( 25 );
			S.skyOverride = null;

		},
		skip: ( S ) => {

			S.props.setTroughCover( false );
			S.flags.troughOpen = true;

		},
	},

	// F4: walking out past the trough, the door creaks behind you. Turn: the door stands open,
	// the doorway empty - and in the trough's still water, someone is standing in it.
	{
		id: 'F4-trough', at: 'troughEnd', lead: - 1.5,
		run: async ( S ) => {

			const P = S.props, f = P.hutFrame;
			await S.untilOffscreen( P.door, 2.5 );
			P.setDoor( true );
			const d = f.toWorld( - 0.8, 0.3, 4.4 );
			S.figure.place( d.x, d.z, f.yaw );
			S.figure.pos.y = f.y - 0.02;
			S.figure._apply();
			S.figure.tilt = 0.62;
			S.figure.setMode( 'reflect' );
			S.sound.creak( V( d.x, f.y + 1, d.z ), 2.2, 0.55, 120, 175 );
			S.ui.caption( '[ a door creaks open, behind you ]', 3.5 );
			const t0 = S.time;
			await S.until( () => ( S.sight.water === 'trough' && S.seenFor > 1.0 ) || S.time - t0 > 20 || dist2( d, S.cam.x, S.cam.z ) > 22 );
			if ( S.sight.water === 'trough' ) S.drone( 0.8, 5 );
			await S.untilUnseen( 0.8 );
			S.figure.setMode( 'hidden' );

		},
		skip: ( S ) => S.props.setDoor( true ),
	},

	// E9 and F5: the heron on the far shore of the tarn. In the water, someone is standing in
	// the tarn a few steps from you - not on the shore, in it. The heron stares at the empty
	// water, then lifts off, croaking. Rings spread from where the figure stands.
	{
		id: 'F5-tarn', at: 'tarn', lead: - 6,
		run: async ( S ) => {

			const app = S.app, td = app.terrainData, tarn = td.ponds[ 1 ];
			const heron = app.moreBirds.herons[ 1 ];
			// in the shallows, on the line from you to the heron, 6 m out
			const c = S.cam;
			const hx = heron.pos.x - c.x, hz = heron.pos.z - c.z, hl = Math.hypot( hx, hz );
			let fx = c.x + hx / hl * 6, fz = c.z + hz / hl * 6;
			for ( let r = 6; r < 12; r += 0.5 ) {

				fx = c.x + hx / hl * r; fz = c.z + hz / hl * r;
				if ( td.heightAt( fx, fz ) < tarn.surf - 0.25 ) break;

			}

			S.figure.place( fx, fz, Math.atan2( c.x - fx, c.z - fz ), td.heightAt( fx, fz ) - 0.02 );
			S.figure.tilt = 0.66;
			S.figure.setMode( 'reflect' );
			heron.cmd = { do: 'stare', watch: V( fx, 0, fz ), face: true };
			const t0 = S.time;
			await S.until( () => ( S.sight.reflect > 0 && S.seenFor > 1.8 ) || S.time - t0 > 28 || S.progress > S.path.ids.tarn + 25 );
			if ( S.sight.reflect > 0 ) S.drone( 0.9, 6 );
			await S.wait( 1.2 );
			heron.cmd = { do: 'fly', to: V( - 60, 0, 420 ), level: 0 };
			for ( let k = 0; k < 3; k ++ ) app.water.addRipple( fx, fz, 0.5, k * 0.6 );
			await S.untilUnseen( 0.8 );
			S.figure.setMode( 'hidden' );
			await S.wait( 30 );
			heron.cmd = null;

		},
	},

	// E10: at the plunge pool, the choughs stop wheeling and settle in a silent row along a
	// ledge beside the fall, all facing the same way. J.'s boots on the shingle.
	{
		id: 'E10-choughs', at: 'pool', lead: - 70,
		run: async ( S ) => {

			const C = S.app.moreBirds.chough, td = S.app.terrainData;
			const out = FALL.out, side = new THREE.Vector2( - out.y, out.x );
			const pool = td.ponds.find( ( p ) => p.plunge );
			const y = pool.surf + 21;
			const ledge = [];
			for ( const off of [ - 26, - 17 ] ) {

				// walk in from the valley toward the wall until the rock stands above the ledge
				const bx = FALL.base.x + side.x * off, bz = FALL.base.y + side.y * off;
				let px = bx + out.x * 30, pz = bz + out.y * 30;
				for ( let t = 30; t > - 30; t -= 0.25 ) {

					const x = bx + out.x * t, z = bz + out.y * t;
					if ( td.heightAt( x, z ) > y ) break;
					px = x; pz = z;

				}

				ledge.push( V( px, y + 0.05, pz ) );

			}

			C.roost = { a: ledge[ 0 ], b: ledge[ 1 ], n: C.n, face: Math.atan2( out.x, out.y ) };

		},
		skip: ( S ) => BEATS.find( ( b ) => b.id === 'E10-choughs' ).run( S ),
	},

	// E11: in the larch wood, three hinds standing among the trees, frozen, all staring back
	// down the path behind you. They don't run until you are very close.
	{
		id: 'E11-hinds', at: 'wood', lead: - 40,
		run: async ( S ) => {

			const hinds = S.app.mammals.deer.filter( ( d ) => ! d.stag ).slice( 0, 3 );
			const at = [ [ 34, - 9 ], [ 40, 8 ], [ 47, - 6 ] ];
			// staged ahead of you, out of sight
			for ( const [ k, d ] of hinds.entries() ) {

				const s = S.path.at( S.progress + at[ k ][ 0 ] );
				const x = s.x + s.tz * at[ k ][ 1 ], z = s.z - s.tx * at[ k ][ 1 ];
				await S.untilOffscreen( V( x, 0, z ), 3 );
				teleport( d, x, z, Math.atan2( - s.tx, - s.tz ) );
				d.cmd = { do: 'stare', watch: V( 0, 0, 0 ), face: true };

			}

			const watch = S.every( () => {

				const b = S.behind( 30 );
				for ( const d of hinds ) if ( d.cmd?.do === 'stare' ) d.cmd.watch.set( b.x, 0, b.z );
				return ! hinds.some( ( d ) => d.cmd?.do === 'stare' );

			} );
			void watch;
			await S.until( () => hinds.some( ( d ) => dist2( d.pos, S.cam.x, S.cam.z ) < 9 ) || S.progress > S.path.ids.wood + 70 );
			for ( const d of hinds ) {

				const ax = d.pos.x - S.cam.x, az = d.pos.z - S.cam.z, al = Math.hypot( ax, az ) || 1;
				d.cmd = { do: 'run', to: V( d.pos.x + ax / al * 60 + 20, 0, d.pos.z + az / al * 60 ), speed: 7, near: 4, then: 'graze' };
				if ( Math.random() < 0.5 ) S.app.audio.bark( d.pos.clone().setY( 1 ) );
				await S.wait( 0.25 );

			}

			await S.wait( 10 );
			for ( const d of hinds ) { d.cmd = null; d.home.set( d.pos.x, d.pos.z ); }

		},
	},

	// E12: a red squirrel scolding from a trunk, tail flicking, facing past you
	{
		id: 'E12-squirrel', at: 'wood', lead: - 20,
		run: async ( S ) => {

			const qs = S.app.mammals.squirrels;
			const q = nearest( qs, V( - 221, 0, 642 ), ( a ) => a.tree );
			await S.until( () => dist2( q.tree, S.cam.x, S.cam.z ) < 32 );
			q.cmd = { do: 'scold', watch: V( 0, 0, 0 ) };
			const upd = S.every( () => {

				if ( q.cmd ) {

					const b = S.behind( 25 );
					q.cmd.watch.set( b.x, 0, b.z );

				}

				return ! q.cmd;

			} );
			void upd;
			await S.until( () => dist2( q.tree, S.cam.x, S.cam.z ) < 6.5 || S.progress > S.path.ids.wood + 90 );
			q.cmd = null;
			q.state = 'climb';
			q.from.copy( q.pos );

		},
	},

	// E13: the bear at the lower edge of the wood rises on its hind legs to scent the air -
	// not at you, back up the path - then drops and crashes away downhill
	{
		id: 'E13-bear', at: 'bear', lead: - 60,
		run: async ( S ) => {

			const b = S.app.mammals.bears[ 0 ];
			// it's been rooting about here; if it has wandered, it is somewhere near
			if ( dist2( b.pos, - 206, 572 ) > 30 ) await S.untilOffscreen( b.pos, 3 ).then( () => teleport( b, - 207, 574 ) );
			b.cmd = { do: 'forage' };
			await S.until( () => dist2( b.pos, S.cam.x, S.cam.z ) < 40 );
			const up = S.behind( 20 );
			b.cmd = { do: 'rear', watch: V( up.x, 0, up.z ) };
			await S.wait( 1.5 );
			await S.until( () => S.seenFor > 3.5 || dist2( b.pos, S.cam.x, S.cam.z ) < 20 );
			await S.wait( 1.5 );
			b.cmd = { do: 'forage' };
			await S.wait( 0.9 );
			const to = V( - 150, 0, 540 );
			b.cmd = { do: 'run', to, speed: 4.2 };
			S.sound.crash( b.pos.clone().setY( 0.8 ), to.clone().sub( b.pos ).normalize(), 3.5 );

		},
	},

	// the west strand: the jetty's lantern is burning across the bay. Nobody lit it. The
	// starlings' last murmuration over the lake parts round an empty point, then pours into
	// the reeds (E14). From here on, your footsteps have an echo.
	{
		id: 'strand', at: 'strand', lead: - 45,
		run: async ( S ) => {

			const app = S.app;
			S.props.lightLamp( true );
			app.starlings.summon( V( - 150, 58, 330 ), V( - 700, 140, 900 ) );
			const K = { p: V( - 150, 55, 330 ), r: 16 };
			app.starlings.keepAway = K;
			const move = S.every( () => {

				K.p.set( - 150 + Math.sin( S.time * 0.11 ) * 25, 52 + Math.sin( S.time * 0.23 ) * 6, 330 + Math.cos( S.time * 0.09 ) * 20 );
				return ! app.starlings.keepAway;

			} );
			void move;
			await S.wait( 55 );
			app.starlings.dismiss( V( - 245, 2, 290 ) );
			await S.wait( 20 );
			app.starlings.keepAway = null;
			app.starlings.centre = null;

		},
		skip: ( S ) => S.props.lightLamp( true ),
	},

	{
		id: 'echo', at: 'strand', lead: 25,
		run: async ( S ) => {

			S.echo = true;
			S.ui.caption( '[ footsteps, behind you ]', 4 );

		},
		skip: ( S ) => ( S.echo = true ),
	},

	// F7: along the dark shore your reflection walks with you in the still water, and a second
	// one keeps pace a few steps behind it - still whenever you look, closer each time you look
	// away. A stone breaks it; when the rings settle it is closer.
	{
		id: 'F7-shore', at: 'strand', lead: 60,
		run: async ( S ) => {

			const F = S.figure;
			S.shadowing = { gap: 2.6 };
			F.tilt = 0.7;
			const follow = S.every( ( dt ) => {

				if ( ! S.shadowing ) return true;
				if ( S.unseenFor > 0.25 ) {

					// a few steps behind you along the shore, a little nearer the water
					const b = S.behind( S.shadowing.gap );
					const toWater = S.waterSide( b );
					const x = b.x + toWater.x * 0.8, z = b.z + toWater.z * 0.8;
					F.place( x, z, Math.atan2( S.cam.x - x, S.cam.z - z ) );
					if ( F.mode !== 'reflect' ) F.setMode( 'reflect' );

				}

				void dt;
				return false;

			} );
			void follow;
			S.onStone = ( p ) => {

				if ( ! S.shadowing || p.distanceTo( F.pos ) > 18 ) return;
				// when the rings settle, it is closer
				setTimeout( () => { if ( S.shadowing ) S.shadowing.gap = Math.max( 1.1, S.shadowing.gap - 0.9 ); }, 2500 );

			};

			await S.until( () => S.progress > S.path.ids.boat - 14 );
			S.shadowing = null;
			await S.untilUnseen( 0.5 );
			F.setMode( 'hidden' );

		},
	},

	// E15: geese going over low in the dark, calling; then nothing; the loon, and its call
	// answered by the same call played backwards
	{
		id: 'E15-geese', at: 'boatJ', lead: - 70,
		run: async ( S ) => {

			const app = S.app;
			app.geese.pass( app.camera, 34, 40 );
			await S.wait( 30 );
			const q = S.waterSide( S.cam );
			S.sound.loonAnswered( V( - 60, 1, 150 ), V( S.cam.x + q.x * 120, 1, S.cam.z + q.z * 120 ) );

		},
	},

	// the mallards on the dark water all turn and paddle away from an empty patch
	{
		id: 'E15-ducks', at: 'boatJ', lead: - 20,
		run: async ( S ) => {

			const W = S.app.waterfowl;
			const q = S.waterSide( S.cam );
			W.fear = { p: V( S.cam.x + q.x * 22, 0, S.cam.z + q.z * 22 ), r: 12 };
			for ( let k = 0; k < 4; k ++ ) S.app.water.addRipple( W.fear.p.x, W.fear.p.z, 0.4, k * 1.3 );
			await S.wait( 40 );
			W.fear = null;

		},
	},

	// the boat: its line cut, like J.'s. The ending (ending.js)
	{
		id: 'boat', at: 'boat', lead: - 8,
		run: async ( S ) => {

			// (at the end of the hull nearest the path)
			const b = S.props.boatEnd, m = b.mesh;
			m.updateMatrixWorld( true );
			const ends = [ 2.2, - 2.2 ].map( ( z ) => new THREE.Vector3( 0, 0.55, z ).applyMatrix4( m.matrixWorld ) );
			const e = ends.sort( ( a, c ) => a.distanceTo( S.cam ) - c.distanceTo( S.cam ) )[ 0 ];
			S.addInteractable( { id: 'boat', x: e.x, y: e.y, z: e.z, r: 3.4, prompt: 'push off', use: () => S.ending() } );

		},
		skip: ( S ) => BEATS.find( ( b ) => b.id === 'boat' ).run( S ),
	},

];
