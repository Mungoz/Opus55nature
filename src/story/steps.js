// Footsteps. Each is a recorded step (public/sounds/steps, all CC0 - see CREDITS.txt there), for
// some grounds with a short texture made here laid quietly over it:
//   gravel   the trail (most of the walk): grass-and-grit steps (Fantozzi), a soft heel under them
//   grass    grass                      wood     planks (the jetty, the bridges, the boardwalk)
//   stone    concrete (the hut's flags)  earth    carpet, and needles crackling (forest floor)
//   shingle  grit steps, and stones knocking together (the strands)
//   wet      grass, and a few drops (the grass soaked after the storm)
//   mud      grass, slower, a little squelch (only right at the water's edge)
//   wade     in the water: no step, the water pushed aside (story/sound.js wade)
// (Tried and dropped: steps made from nothing - "tiny steps into squelching mud" - then a snow
// recording for the trail and a swept squelch for wet grass - "too loud and squelchy".)

// what each ground is made of: the recording, its speed, what lies under it (another recording,
// quieter), the texture over it (and how loud), and the whole step's level
export const GROUND = {
	gravel: { rec: 'sand', under: 'carpet', underMix: 0.35, vol: 0.75 },
	grass: { rec: 'grass', vol: 0.6 },
	wet: { rec: 'grass', rate: 0.95, tex: 'drips', mix: 0.22, vol: 0.62 },
	earth: { rec: 'carpet', tex: 'needles', mix: 0.28, vol: 0.55 },
	shingle: { rec: 'sand', rate: 0.9, tex: 'clack', mix: 0.4, vol: 0.7 },
	wood: { rec: 'wood', vol: 0.72 },
	stone: { rec: 'concrete', vol: 0.6 },
	mud: { rec: 'grass', rate: 0.85, tex: 'squelch', mix: 0.18, vol: 0.5 },
};
export const RECORDINGS = [ 'grass', 'wood', 'concrete', 'carpet' ].flatMap( ( k ) => [ 0, 1, 2, 3, 4 ].map( ( i ) => `footstep_${ k }_00${ i }` ) )
	.concat( [ 0, 1, 2, 3, 4, 5 ].map( ( i ) => `footstep_sand_00${ i }` ) );

const DUR = 0.2;
const TAKES = 6;

// ------------------------------------------------------------------ building blocks
function biquad( type, f, q, sr ) {

	const c = coeffs( type, f, q, sr );
	let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
	return ( x ) => {

		const y = c.B0 * x + c.B1 * x1 + c.B2 * x2 - c.A1 * y1 - c.A2 * y2;
		x2 = x1; x1 = x; y2 = y1; y1 = y;
		return y;

	};

}

function filter( d, type, f, q, sr ) {

	const b = biquad( type, f, q, sr );
	for ( let i = 0; i < d.length; i ++ ) d[ i ] = b( d[ i ] );

}

// noise shaped by env( t ), filtered, added into d
function hiss( d, sr, env, type, f, q, amp ) {

	const b = biquad( type, f, q, sr );
	for ( let i = 0; i < d.length; i ++ ) {

		const e = env( i / sr );
		d[ i ] += b( e > 1e-4 ? ( Math.random() * 2 - 1 ) * e : 0 ) * amp;

	}

}

// a filter's coefficients (for one that moves: sweepFilter)
function coeffs( type, f, q, sr ) {

	const w = 2 * Math.PI * Math.min( f, sr * 0.45 ) / sr, cs = Math.cos( w ), sn = Math.sin( w ), al = sn / ( 2 * q );
	let b0, b1, b2;
	if ( type === 'lp' ) { b0 = ( 1 - cs ) / 2; b1 = 1 - cs; b2 = b0; } else if ( type === 'hp' ) { b0 = ( 1 + cs ) / 2; b1 = - ( 1 + cs ); b2 = b0; } else { b0 = al; b1 = 0; b2 = - al; }
	const a0 = 1 + al;
	return { B0: b0 / a0, B1: b1 / a0, B2: b2 / a0, A1: - 2 * cs / a0, A2: ( 1 - al ) / a0 };

}

function sweepFilter( d, sr, env, type, f, q, amp ) {

	const s = { x1: 0, x2: 0, y1: 0, y2: 0 };
	let c = null;
	for ( let i = 0; i < d.length; i ++ ) {

		if ( i % 32 === 0 ) c = coeffs( type, f( i / sr ), q, sr );
		const e = env( i / sr );
		const x = e > 1e-4 ? ( Math.random() * 2 - 1 ) * e : 0;
		const y = c.B0 * x + c.B1 * s.x1 + c.B2 * s.x2 - c.A1 * s.y1 - c.A2 * s.y2;
		s.x2 = s.x1; s.x1 = x; s.y2 = s.y1; s.y1 = y;
		d[ i ] += y * amp;

	}

}

// a click that rings: a sliver of noise into a resonance at f dying over decay s (a stone
// knocked, a stem snapping, a drop)
function ping( d, sr, t, amp, f, decay ) {

	const i0 = Math.floor( t * sr );
	if ( i0 >= d.length || i0 < 0 ) return;
	const L = Math.min( d.length - i0, Math.ceil( decay * sr * 6 ) );
	const r = Math.exp( - 1 / ( decay * sr ) ), w = 2 * Math.PI * Math.min( f, sr * 0.45 ) / sr;
	const c = 2 * r * Math.cos( w ), rr = r * r, k = amp * ( 1 - r ) * 3;
	const exc = Math.max( 2, Math.floor( sr * 0.00035 ) );
	let y1 = 0, y2 = 0;
	for ( let i = 0; i < L; i ++ ) {

		const x = i < exc ? Math.random() * 2 - 1 : 0;
		const y = x + c * y1 - rr * y2;
		y2 = y1; y1 = y;
		d[ i0 + i ] += y * k;

	}

}

// a damped sine (a mode of a plank, a thud), with a soft start so it does not click
function mode( d, sr, t, amp, f, decay, attack = 0.0015, glide = 0 ) {

	const i0 = Math.floor( t * sr );
	if ( i0 >= d.length || i0 < 0 ) return;
	const L = Math.min( d.length - i0, Math.ceil( decay * sr * 6 ) );
	let ph = Math.random() * 0.3;
	for ( let i = 0; i < L; i ++ ) {

		const tt = i / sr;
		ph += 2 * Math.PI * f * ( 1 + glide * Math.min( 1, tt / ( decay * 2 ) ) ) / sr;
		d[ i0 + i ] += Math.sin( ph ) * amp * ( 1 - Math.exp( - tt / attack ) ) * Math.exp( - tt / decay );

	}

}

// times for n events, thickest where density( t ) is
function scatter( n, density, t1 = DUR * 0.85 ) {

	let peak = 0;
	for ( let t = 0; t < t1; t += 0.002 ) peak = Math.max( peak, density( t ) );
	const out = [];
	let guard = 0;
	while ( out.length < n && guard ++ < n * 60 ) {

		const t = Math.random() * t1;
		if ( Math.random() * peak < density( t ) ) out.push( t );

	}

	return out;

}

const R = Math.random;
const exp = ( a, d ) => ( t ) => t < 0 ? 0 : ( 1 - Math.exp( - t / a ) ) * Math.exp( - t / d );

// ------------------------------------------------------------------ the textures
// (all within a fifth of a second, all starting at once)
const MAKE = {

	// the trail's small stones grinding and clicking as the weight comes on, and again smaller
	// as it rolls to the ball of the foot
	crunch( d, sr ) {

		const ball = 0.05 + R() * 0.03;
		const dens = ( t ) => Math.exp( - t / 0.03 ) + 0.45 * ( t > ball ? Math.exp( - ( t - ball ) / 0.025 ) : 0 );
		for ( const t of scatter( 160 + R() * 90, dens, 0.16 ) ) {

			const big = Math.pow( R(), 3 );
			ping( d, sr, t, 0.2 + big * 1.4, 2000 + Math.pow( R(), 1.3 ) * 6500 - big * 800, 0.0003 + R() * 0.0009 + big * 0.0012 );

		}

	},

	// stones on the lake shore knocking together
	clack( d, sr ) {

		const n = 3 + Math.floor( R() * 4 );
		for ( let i = 0; i < n; i ++ ) {

			const t = Math.pow( R(), 1.8 ) * 0.07, f = 1100 + Math.pow( R(), 1.3 ) * 2600, a = 0.4 + R() * 0.8, dec = 0.003 + R() * 0.006;
			ping( d, sr, t, a, f, dec );
			ping( d, sr, t, a * 0.45, f * ( 2.2 + R() * 0.7 ), dec * 0.6 );

		}

	},

	// drops flicked off soaked grass
	drips( d, sr ) {

		for ( const t of scatter( 5 + R() * 6, exp( 0.004, 0.04 ), 0.12 ) ) ping( d, sr, t, Math.pow( R(), 1.5 ) * 0.5, 1800 + R() * 2400, 0.0015 + R() * 0.002 );

	},

	// soaked turf: water squeezed out, drops flicked up
	splash( d, sr ) {

		sweepFilter( d, sr, exp( 0.002, 0.025 ), 'bp', ( t ) => 1400 * Math.exp( - t * 20 ) + 500, 1.6, 0.25 );
		for ( const t of scatter( 8 + R() * 8, exp( 0.004, 0.035 ), 0.12 ) ) ping( d, sr, t, Math.pow( R(), 1.5 ) * 0.5, 1600 + R() * 2600, 0.0015 + R() * 0.0025 );

	},

	// needles and dry leaves, and now and then a twig
	needles( d, sr ) {

		for ( const t of scatter( 30 + R() * 30, exp( 0.003, 0.04 ), 0.12 ) ) ping( d, sr, t, Math.pow( R(), 3 ) * 0.6, 2400 + R() * 4500, 0.0003 + R() * 0.0006 );
		if ( R() < 0.2 ) {

			const t = 0.01 + R() * 0.05;
			for ( let i = 0; i < 3; i ++ ) ping( d, sr, t + i * ( 0.002 + R() * 0.003 ), 1.3 - i * 0.35, 1400 + R() * 2200, 0.003 + R() * 0.004 );

		}

	},

	// the squelch as it takes the weight, and a little suck as it comes out
	squelch( d, sr ) {

		sweepFilter( d, sr, exp( 0.003, 0.035 ), 'bp', ( t ) => 1000 * Math.exp( - t * 22 ) + 260, 2.4, 0.45 );
		const t = 0.1 + R() * 0.03;
		mode( d, sr, t, 0.035, 360 + R() * 120, 0.012, 0.002, 0.5 );

	},

};

// one take of one texture, as an AudioBuffer (a millisecond or two's work), peaking at 1
export function buildTexture( ctx, name ) {

	const sr = ctx.sampleRate, n = Math.floor( DUR * sr );
	const d = new Float32Array( n );
	MAKE[ name ]( d, sr );
	filter( d, 'hp', 250, 0.7, sr );
	filter( d, 'lp', 11000, 0.7, sr );
	let peak = 0;
	for ( let i = 0; i < n; i ++ ) {

		d[ i ] *= Math.min( 1, ( n - i ) / ( sr * 0.02 ) );
		peak = Math.max( peak, Math.abs( d[ i ] ) );

	}

	const buf = ctx.createBuffer( 1, n, sr );
	const ch = buf.getChannelData( 0 );
	for ( let i = 0; i < n; i ++ ) ch[ i ] = d[ i ] / Math.max( 1e-6, peak );
	return buf;

}

export const TEXTURES = Object.keys( MAKE );
export { TAKES };

// every take of every texture (tools/stepsrender.mjs)
export function buildSteps( ctx ) {

	const out = {};
	for ( const name of TEXTURES ) out[ name ] = Array.from( { length: TAKES }, () => buildTexture( ctx, name ) );
	return out;

}
