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
	// (after the storm the sky clears to a luminous afterglow, the cloud breaking up and going)
	clouds: [ [ 'jettyHead', 0.42 ], [ 'gate', 0.55 ], [ 'signpost', 0.8 ], [ 'bridge', 0.95 ], [ 'hut', 1.0 ], [ 'trough', 0.5 ], [ 'tarn', 0.3 ], [ 'strand', 0.2 ], [ 'boat', 0.18 ] ],
	wind: [ [ 'jettyHead', 0.8 ], [ 'gate', 1.15 ], [ 'signpost', 1.5 ], [ 'bridge', 1.8 ], [ 'hut', 2.0 ], [ 'trough', 0.35 ], [ 'tarn', 0.2 ], [ 'strand', 0.1 ], [ 'boat', 0.04 ] ],
	overcast: [ [ 'jettyHead', 0.05 ], [ 'gate', 0.25 ], [ 'signpost', 0.6 ], [ 'bridge', 0.85 ], [ 'hut', 1.0 ], [ 'trough', 0.25 ], [ 'tarn', 0.06 ], [ 'strand', 0.04 ] ],
	rain: [ [ 'signpost', 0 ], [ 'bridge', 0.06 ], [ 'troughView', 0.25 ], [ 'hut', 0.5 ], [ 'trough', 0 ] ],
	haze: [ [ 'jettyHead', 2.2 ], [ 'bridge', 3.5 ], [ 'hut', 4.5 ], [ 'trough', 3.2 ], [ 'strand', 2.6 ] ],
	mist: [ [ 'jettyHead', 0.0004 ], [ 'bridge', 0.0008 ], [ 'trough', 0.0016 ], [ 'tarn', 0.0022 ], [ 'wood', 0.0015 ], [ 'strand', 0.002 ], [ 'boat', 0.0024 ] ],
	base: [ [ 'jettyHead', 3000 ], [ 'signpost', 1400 ], [ 'hut', 700 ], [ 'trough', 900 ], [ 'strand', 2500 ] ],
	lowCloud: [ [ 'signpost', 0 ], [ 'hut', 0.004 ], [ 'trough', 0.003 ], [ 'strand', 0.0005 ] ],
	storm: [ [ 'hut', 0 ] ],
	// the grade (post.js): exposure key, contrast, cooled shadows, colour drained - the valley
	// losing its warmth as the evening goes
	// (as the light goes the eye adapts: the key rises again at dusk, so the wood and the shore
	// stay readable, if colourless)
	key: [ [ 'jettyHead', 1.05 ], [ 'gate', 1.0 ], [ 'bridge', 0.88 ], [ 'hut', 0.82 ], [ 'trough', 0.95 ], [ 'tarn', 1.0 ], [ 'strand', 1.0 ] ],
	lift: [ [ 'jettyHead', 0 ], [ 'hut', 0.08 ], [ 'trough', 0.18 ], [ 'tarn', 0.28 ], [ 'pool', 0.36 ], [ 'wood', 0.5 ], [ 'strand', 0.46 ], [ 'boat', 0.42 ] ],
	keyLow: [ [ 'jettyHead', 0.03 ], [ 'hut', 0.04 ], [ 'trough', 0.06 ], [ 'tarn', 0.08 ], [ 'pool', 0.1 ], [ 'wood', 0.12 ], [ 'strand', 0.12 ], [ 'boat', 0.11 ] ],
	contrast: [ [ 'jettyHead', 1.06 ], [ 'hut', 1.12 ], [ 'strand', 1.16 ] ],
	cool: [ [ 'jettyHead', 0.0 ], [ 'gate', 0.05 ], [ 'hut', 0.25 ], [ 'tarn', 0.45 ], [ 'strand', 0.5 ] ],
	desat: [ [ 'jettyHead', 0.0 ], [ 'gate', 0.02 ], [ 'hut', 0.14 ], [ 'tarn', 0.22 ], [ 'boat', 0.3 ] ],
	// the valley going quiet: songbirds, then wind, then the lake's lapping
	birds: [ [ 'jettyHead', 1 ], [ 'signpost', 0.8 ], [ 'hut', 0.3 ], [ 'trough', 0.35 ], [ 'tarn', 0.15 ], [ 'wood', 0.1 ], [ 'strand', 0 ] ],
	windMix: [ [ 'wood', 1 ], [ 'strand', 0.6 ], [ 'boatJ', 0.15 ], [ 'boat', 0.05 ] ],
	lapMix: [ [ 'strand', 1 ], [ 'boatJ', 0.6 ], [ 'boat', 0.15 ] ],
};

// (and darker: the grade's key drops, the colour drains)
const STORM = { clouds: 1.0, wind: 2.1, rain: 1.0, overcast: 1.0, haze: 5.0, mist: 0.0012, base: 520, lowCloud: 0.006, storm: 1, key: 0.7, desat: 0.28, cool: 0.45 };

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
			const ids = S.path.ids;
			const F1 = S.sightSpot( V( 30, 0, 556 ), 50, [ ids.ford + 12, ids.ford, ids.ford + 30 ], 50, 80 );
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

	// F2 and E8: on the footbridge a dipper whirrs off from the stone under it, low up the
	// pool; following it, you look up the pool's still water - and in it, at the pool's head,
	// someone is standing in the stream. At the head of the pool the water is empty.
	{
		id: 'F2-pool', at: 'bridge', lead: - 1,
		run: async ( S ) => {

			const app = S.app, td = app.terrainData, R = td.river;
			const pl = app.layout.BRIDGE_POOL;
			// the head of the pool, where the riffle runs in, in a hand's depth of water; on the line
			// from the bridge to the falls, so that it stands in the falls' white reflection
			const i = R.findIndex( ( q ) => q.s >= pl.s0 + 7 );
			const h = R[ i ];
			const a = R[ i - 1 ], c = R[ i + 1 ];
			const tx = c.p.x - a.p.x, tz = c.p.y - a.p.y, l = Math.hypot( tx, tz );
			const br = S.props.bridgeFrame, fall = app.streams.poolPos;
			const fx = fall.x - br.x, fz = fall.z - br.z, fl = Math.hypot( fx, fz );
			// where that line crosses the stream here
			const cross = ( ( h.p.x - br.x ) * - tz + ( h.p.y - br.z ) * tx ) / ( fx * - tz + fz * tx );
			let px = br.x + fx * cross, pz = br.z + fz * cross;
			const off = Math.hypot( px - h.p.x, pz - h.p.y );
			if ( ! isFinite( cross ) || off > h.width * 0.8 ) { px = h.p.x + tz / l * 1.2; pz = h.p.y - tx / l * 1.2; }
			void fl;
			const bed = td.heightAt( px, pz );
			S.figure.place( px, pz, Math.atan2( S.cam.x - px, S.cam.z - pz ), Math.max( bed, h.surf - 0.35 ) - 0.02 );
			S.figure.tilt = 0.5;
			S.figure.setMode( 'reflect' );
			// the dipper goes, low over the water, up to the head of the pool
			const D = app.smallBirds.dippers;
			const dip = D.length ? D.reduce( ( p, q ) => ( p.pos.distanceTo( S.cam ) < q.pos.distanceTo( S.cam ) ? p : q ) ) : null;
			if ( dip ) {

				dip.flyTo = V( h.p.x - tz / l * 0.8, h.surf + 0.08, h.p.y + tx / l * 0.8 );
				S.sound.dipper( dip.pos.clone() );

			}

			const face = S.every( () => {

				if ( S.figure.mode === 'hidden' ) return true;
				if ( S.unseenFor > 0.3 ) S.figure.yaw = Math.atan2( S.cam.x - S.figure.pos.x, S.cam.z - S.figure.pos.z );
				return false;

			} );
			void face;
			const t0 = S.time;
			await S.until( () => ( S.sight.reflect > 0 && S.seenFor > 1.5 ) || S.time - t0 > 30 || S.progress > S.path.ids.bridge + 16 );
			if ( S.sight.reflect > 0 ) S.drone( 0.6, 4 );
			await S.untilUnseen( 0.8 );
			S.figure.setMode( 'hidden' );

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
			// out in the rain beyond the yard, on the way you came: at the edge of the light, then
			// nearer at each flash, the last just past the trough's end
			const spots = [ [ 5, 31 ], [ - 4.5, 21.5 ], [ 0.6, 14.2 ] ].map( ( [ lx, lz ] ) => f.toWorld( lx, 0, lz ) );
			const face = () => Math.atan2( S.cam.x - S.figure.pos.x, S.cam.z - S.figure.pos.z );
			let flash = 0;
			const strike = () => {

				// lightning out beyond it from where you stand, far enough that the thunder lags
				const aim = Math.atan2( spots[ 0 ].z - S.cam.z, spots[ 0 ].x - S.cam.x ) + ( Math.random() - 0.5 ) * 0.9;
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
			// the ground as the storm leaves it: soaked, the puddles full
			S.app.weather.wetness = 1;
			S.app.weather.puddle = 1;

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
			// Out in the tarn, knee deep, a stone's throw from you - not on the shore, in it: where
			// from the east shore its reflection lies against the reflected snow of the horn,
			// down the valley past the trees (layout.SIGHTS keeps them out of the way)
			const c = S.cam;
			const [ fx, fz ] = S.app.layout.SIGHTS.tarn.fig;
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
		id: 'E11-hinds', at: 'pool', lead: 10,
		run: async ( S ) => {

			const hinds = S.app.mammals.deer.filter( ( d ) => ! d.stag ).slice( 0, 3 );
			const at = [ [ - 8, - 9 ], [ - 2, 8 ], [ 5, - 6 ] ];
			const base = S.path.ids.wood;
			// staged ahead in the wood while you are still at the pool, each as soon as its place
			// is hidden from you
			const staged = new Set();
			await S.until( () => {

				for ( const [ k, d ] of hinds.entries() ) {

					if ( staged.has( k ) ) continue;
					const s = S.path.at( base + at[ k ][ 0 ] );
					const x = s.x + s.tz * at[ k ][ 1 ], z = s.z - s.tx * at[ k ][ 1 ];
					if ( ! S.hidden( V( x, S.app.terrainData.heightAt( x, z ), z ), 3 ) ) continue;
					if ( ! S.hidden( d.mesh.position, 3 ) ) continue;
					teleport( d, x, z, Math.atan2( - s.tx, - s.tz ) );
					d.cmd = { do: 'stare', watch: V( 0, 0, 0 ), face: true };
					staged.add( k );

				}

				return staged.size === hinds.length || S.progress > base - 15;

			} );

			const watch = S.every( () => {

				const b = S.behind( 30 );
				for ( const d of hinds ) if ( d.cmd?.do === 'stare' ) d.cmd.watch.set( b.x, 0, b.z );
				return ! hinds.some( ( d ) => d.cmd?.do === 'stare' );

			} );
			void watch;
			await S.until( () => hinds.some( ( d ) => d.cmd && dist2( d.pos, S.cam.x, S.cam.z ) < 9 ) || S.progress > S.path.ids.wood + 70 );
			for ( const d of hinds ) {

				if ( ! d.cmd ) continue;
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
			// (it is on the trunk facing the path, a man's height up: in view as you come)
			await S.until( () => dist2( q.tree, S.cam.x, S.cam.z ) < 22 );
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

	// E14: the starlings' last murmuration. As you come down out of the wood to the strand the
	// flock comes in over the lake from the south, low, and wheels over the water ahead of you -
	// dark against the pale mist on the far shore, roaring as it turns together. There is a
	// place in the air over the water it will not fly through: it streams round it, again and
	// again, as round a falcon, but nothing is there. Then it pours down into the reedbed ahead
	// and the reeds chatter with it - until you come near, when they stop, all at once.
	{
		id: 'E14-starlings', at: 'strand', lead: - 110,
		run: async ( S ) => {

			const app = S.app, M = app.starlings, bed = app.layout.REEDBEDS[ 0 ];
			// in from down the lake, to wheel low over the water off the shore ahead - where the
			// view down the shoreline from the path is open all the way along (tools/out/q_flockview.js)
			M.floor = 7;
			M.sway.set( 14, 5, 42 );
			M.pull = 2.4;
			M.stretch = 6;
			M.space2 = 7;
			M.summon( V( - 205, 12, 262 ), V( 120, 60, - 120 ) );
			// the empty place, a little off the middle of where it wheels: a column standing up out
			// of the water that the flock parts round and closes behind, every pass
			M.keepAway = { p: V( - 206, 11, 268 ), r: 7, column: true };
			const t0 = S.time;
			let told = false;
			const roar = S.every( () => {

				const flying = M.flying / M.n;
				const near = M.mid.distanceTo( S.cam );
				if ( ! told && near < 260 && flying > 0.9 ) {

					told = true;
					S.ui.caption( '[ a rushing of wings, over the water ]', 4 );

				}

				S.sound.flock( M.mid, flying < 0.02 ? 0 : ( 0.45 + 0.8 * M.turning ) * Math.sqrt( flying ) );
				return flying < 0.02;

			} );
			void roar;
			// it wheels until you are well along the strand, then goes down into the reeds ahead
			await S.until( () => S.progress > S.path.ids.strand + 45 || S.time - t0 > 130 );
			M.keepAway = null;
			M.dismiss( V( bed.x, 20, bed.z ), bed );
			await S.until( () => M.roost?.landed > 30 || M.phase === 'roosted' );
			S.sound.roost( V( bed.x, 0.5, bed.z ), bed.len * 0.6 );
			await S.until( () => M.phase === 'roosted' );
			M.centre = null;
			M.pull = 1;
			M.stretch = 0;
			M.space2 = 4;
			// and when you come close, silence
			await S.until( () => Math.hypot( S.cam.x - bed.x, S.cam.z - bed.z ) < 44 );
			S.sound.roost( null );
			S.ui.caption( '[ the reeds fall silent ]', 3.5 );

		},
		skip: ( S ) => {

			S.app.starlings.phase = 'roosted';

		},
	},

	// the west strand: the jetty's lantern is burning across the bay. Nobody lit it. From here
	// on, your footsteps have an echo.
	{
		id: 'strand', at: 'strand', lead: - 45,
		run: async ( S ) => {

			S.props.lightLamp( true );

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

	// F7: out along the old boardwalk over the shallows, a hand's breadth over the water.
	// Someone is wading after you, a few steps behind, just off the boards on the lake side:
	// in the still water you see its reflection, against the pale mist mirrored there, and the
	// rings spreading from where it walks - and on the water itself, nothing. Still whenever
	// you look, a little closer each time you look away. A stone breaks it; when the rings
	// settle it is closer. (The strip between the boards and the bank mirrors only the dark
	// bank; the lake side mirrors the mist - tools/out/q_shoredist.js)
	{
		id: 'F7-shore', at: 'strand', lead: 62,
		run: async ( S ) => {

			const F = S.figure, td = S.app.terrainData, water = S.app.water;
			S.shadowing = { gap: 16 };
			F.tilt = 0.7;
			F.pose = 'stand';
			// beside a point of the boardwalk, off its lake side, standing on the bed
			const wadeBeside = ( b ) => {

				const nx = b.tz, nz = - b.tx;
				const side = td.heightAt( b.x + nx * 4, b.z + nz * 4 ) < td.heightAt( b.x - nx * 4, b.z - nz * 4 ) ? 1 : - 1;
				const x = b.x + nx * side * 0.9, z = b.z + nz * side * 0.9;
				// (thigh-deep, as if on something under the water: enough of it above the surface
				// for its mirror image to be a person)
				return { x, z, y: Math.max( td.heightAt( x, z ), - 0.62 ) };

			};

			let last = null, rip = 0, told = false;
			const follow = S.every( ( dt ) => {

				if ( ! S.shadowing ) return true;
				if ( S.unseenFor > 0.25 ) {

					const p = wadeBeside( S.behind( S.shadowing.gap ) );
					F.place( p.x, p.z, Math.atan2( S.cam.x - p.x, S.cam.z - p.z ), p.y );
					if ( F.mode !== 'reflect' ) F.setMode( 'reflect' );
					// wading: rings from where it walks, and the sound of it, never quite in step
					if ( last && Math.hypot( p.x - last.x, p.z - last.z ) > 0.7 ) {

						water.addRipple( p.x, p.z, 0.35 );
						S.sound.wade( V( p.x, 0, p.z ), 0.22 );
						if ( ! told ) {

							told = true;
							S.ui.caption( '[ wading, behind you ]', 3.5 );

						}

						last = p;

					}

					last ??= p;

				}

				// and standing, the water laps round it now and then
				rip -= dt;
				if ( rip <= 0 && F.mode === 'reflect' ) {

					rip = 2.5 + Math.random() * 3;
					water.addRipple( F.pos.x, F.pos.z, 0.12 );

				}

				return false;

			} );
			void follow;
			// each time it has been seen and you look away, it comes on a little
			let seen = 0;
			const closer = S.every( () => {

				if ( ! S.shadowing ) return true;
				if ( S.sight.reflect > 0 && S.seenFor > 0.6 ) seen = 1;
				else if ( seen && S.unseenFor > 1.5 ) {

					seen = 0;
					S.shadowing.gap = Math.max( 5, S.shadowing.gap - 2.5 );

				}

				return false;

			} );
			void closer;
			S.onStone = ( p ) => {

				if ( ! S.shadowing || p.distanceTo( F.pos ) > 18 ) return;
				// when the rings settle, it is closer
				setTimeout( () => { if ( S.shadowing ) S.shadowing.gap = Math.max( 4, S.shadowing.gap - 4 ); }, 2500 );

			};

			// into the reeds, where it is lost among the stems
			await S.until( () => S.progress > S.path.ids.boatJ + 12 );
			S.shadowing = null;
			await S.untilUnseen( 0.5 );
			F.setMode( 'hidden' );

		},
	},

	// E15: geese going over low in the dark, calling; then nothing; the loon, and its call
	// answered by the same call played backwards
	{
		id: 'E15-geese', at: 'boat', lead: - 36,
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

	// F6: out of the reeds at the landing, the water opens east to the island, the lantern
	// burning beyond it. On the island's far point, against the mist, someone standing, doubled
	// in the still water - a small upright shape, the only one out there. Look away, and the
	// point is empty. It is the way the boat will go. (Seen directly, like F1: at 170 m the
	// reflection alone is a few pixels; the upright silhouette and its mirror image together
	// read.)
	{
		id: 'F6-island', at: 'boat', lead: - 18,
		run: async ( S ) => {

			const td = S.app.terrainData, P = S.app.layout.PLACES.islandPoint;
			// the island's tip - the end of it furthest round to the right as seen from the
			// landing (toward the lantern), low by the water: there the open misty water is behind
			// it, and behind its mirror image, not the island's own dark slope
			const land = V( - 248, 0, 224 );
			const vx = P.x - land.x, vz = P.z - land.z, vl = Math.hypot( vx, vz );
			let best = null, bd = - Infinity;
			for ( let dx = - 90; dx <= 90; dx += 0.5 ) for ( let dz = - 90; dz <= 90; dz += 0.5 ) {

				const x = P.x + dx, z = P.z + dz, h = td.heightAt( x, z );
				if ( h < 0.05 || h > 0.9 ) continue;
				// how far round to the right of the line to the island, as an angle
				const ox = x - land.x, oz = z - land.z;
				const lat = ( vx * oz - vz * ox ) / ( vl * Math.hypot( ox, oz ) );
				if ( lat > bd ) { bd = lat; best = [ x, z ]; }

			}

			if ( ! best ) return;
			// standing at the very tip, at the water's edge, so nothing of the island is behind it
			const [ fx, fz ] = best;
			const F = S.figure;
			F.place( fx, fz, Math.atan2( land.x - fx, land.z - fz ), Math.max( td.heightAt( fx, fz ), 0 ) );
			F.tilt = 0.6;
			F.pose = 'stand';
			F.setMode( 'direct' );
			const t0 = S.time;
			await S.until( () => ( S.sight.direct > 0 && S.seenFor > 2.2 ) || S.ended || S.time - t0 > 90 );
			if ( S.sight.direct > 0 && ! S.ended ) S.drone( 0.7, 5 );
			await S.until( () => S.unseenFor > 1.2 || S.ended );
			if ( ! S.ended ) F.setMode( 'hidden' );

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
