// The script: the clock and the sky along the route, and the beats that play as you reach
// each place. Positions are the route's waypoint ids (layout.js).

// the clock (hours) at each waypoint; between them it follows the walk
export const CLOCK = [
	[ 'jettyHead', 16.5 ], [ 'mouth', 16.53 ], [ 'ford', 16.58 ], [ 'gate', 16.66 ], [ 'pond', 16.7 ],
	[ 'marmots', 16.76 ], [ 'signpost', 16.8 ], [ 'bridge', 16.87 ], [ 'hut', 16.93 ],
	// (the storm runs the clock on while you shelter: see the storm beat)
	[ 'trough', 17.46 ], [ 'tarn', 17.52 ], [ 'pool', 17.58 ], [ 'wood', 17.63 ], [ 'bear', 17.72 ],
	[ 'strand', 17.8 ], [ 'boatJ', 17.95 ], [ 'boat', 18.05 ],
];

// the weather at each waypoint (eased between; the storm beat overrides it at the hut)
export const SKY = {
	clouds: [ [ 'jettyHead', 0.42 ], [ 'gate', 0.55 ], [ 'signpost', 0.8 ], [ 'bridge', 0.95 ], [ 'hut', 1.0 ], [ 'trough', 0.55 ], [ 'tarn', 0.45 ], [ 'strand', 0.25 ], [ 'boat', 0.2 ] ],
	wind: [ [ 'jettyHead', 0.8 ], [ 'gate', 1.15 ], [ 'signpost', 1.5 ], [ 'bridge', 1.8 ], [ 'hut', 2.0 ], [ 'trough', 0.35 ], [ 'tarn', 0.2 ], [ 'strand', 0.1 ], [ 'boat', 0.04 ] ],
	overcast: [ [ 'jettyHead', 0.05 ], [ 'gate', 0.25 ], [ 'signpost', 0.6 ], [ 'bridge', 0.85 ], [ 'hut', 1.0 ], [ 'trough', 0.3 ], [ 'strand', 0.08 ] ],
	rain: [ [ 'signpost', 0 ], [ 'bridge', 0.06 ], [ 'hut', 0.3 ], [ 'trough', 0 ] ],
	haze: [ [ 'jettyHead', 2.2 ], [ 'bridge', 3.5 ], [ 'hut', 4.5 ], [ 'trough', 3.2 ], [ 'strand', 2.6 ] ],
	mist: [ [ 'jettyHead', 0.0004 ], [ 'bridge', 0.0008 ], [ 'trough', 0.0016 ], [ 'tarn', 0.0022 ], [ 'wood', 0.0015 ], [ 'strand', 0.002 ], [ 'boat', 0.0024 ] ],
	base: [ [ 'jettyHead', 3000 ], [ 'signpost', 1400 ], [ 'hut', 700 ], [ 'trough', 900 ], [ 'strand', 2500 ] ],
	lowCloud: [ [ 'signpost', 0 ], [ 'hut', 0.004 ], [ 'trough', 0.003 ], [ 'strand', 0.0005 ] ],
	storm: [ [ 'hut', 0 ] ],
};

// Beats: { id, at: waypoint id, lead (m, + later / - earlier), when( S ), run( S ), skip( S ) }
// run is a script (async; S.wait, S.until); skip applies its end state when a debug jump
// starts past it.
export const BEATS = [];
