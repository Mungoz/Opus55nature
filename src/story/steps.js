// Footsteps, made once at load: for each kind of ground, a handful of takes of one step (the heel
// coming down, the roll, the toe pushing off), each built from what that sound is made of rather
// than a filtered burst:
//   gravel   a few hundred small stones grinding, each its own tiny click, thickest as the
//            weight comes on; the grit hissing under them; the heel's thud
//   shingle  fewer, bigger stones knocking together (each rings in two partials), and sliding
//   grass    stems brushing the boot and springing back, a few dry ones snapping, the heel's
//            dull pad in the turf
//   earth    the forest floor: a soft thud, needles crackling, now and then a twig
//   wood     planks: a knock that rings in the board's own few modes, hollow over the water
//   stone    flags: a hard heel click and the grit scuffed under the sole
//   wet      soaked grass: heavier stems, the water squeezed out of the turf, drops
//   mud      the squelch as it takes the weight, and the suck of the heel coming out
// Played back a take at a time (never the same one twice running), a little faster or slower
// and louder or softer, the feet a touch to the left and to the right.

const DUR = 0.46;

// how loud each kind of ground is, on average over a take and as heard (the lowest octaves,
// felt more than heard and lost on small speakers, left out of the measure)
const LEVEL = { grass: 0.0085, wet: 0.0095, earth: 0.009, gravel: 0.0125, shingle: 0.0125, wood: 0.014, stone: 0.0105, mud: 0.012 };
const TAKES = 8;

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

// the weight on the foot over the step: the heel strike (sharp, dying over heel s), then the toe
// pushing off at toeAt (softer)
function weight( heel, toeAt, toe, toeK = 0.55 ) {

	return ( t ) => {

		const h = t < 0 ? 0 : ( 1 - Math.exp( - t / 0.004 ) ) * Math.exp( - t / heel );
		const u = t - toeAt;
		const o = u < 0 ? 0 : ( 1 - Math.exp( - u / 0.014 ) ) * Math.exp( - u / toe );
		return h + o * toeK;

	};

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
const at = ( t0, e ) => ( t ) => e( t - t0 );

// ------------------------------------------------------------------ the grounds
const MAKE = {

	gravel( d, sr ) {

		const toeAt = 0.15 + R() * 0.05, W = weight( 0.05 + R() * 0.02, toeAt, 0.045 );
		// the crunch: stones shifting under the load, many small, a few bigger and lower
		for ( const t of scatter( 380 + R() * 220, W ) ) {

			const big = Math.pow( R(), 3 );
			ping( d, sr, t, 0.15 + big * 1.6, 1700 + Math.pow( R(), 1.4 ) * 7500 - big * 900, 0.0005 + R() * 0.0016 + big * 0.002 );

		}

		// the grit and sand under them
		hiss( d, sr, W, 'bp', 3200, 0.6, 0.05 );
		// the heel's weight
		mode( d, sr, 0.002, 0.08, 75 + R() * 25, 0.025, 0.003 );
		hiss( d, sr, exp( 0.003, 0.03 ), 'lp', 260, 0.8, 0.5 );

	},

	shingle( d, sr ) {

		const toeAt = 0.16 + R() * 0.05, W = weight( 0.06, toeAt, 0.05, 0.7 );
		// stones knocking together as they give: each rings in two partials, a clack
		for ( const t of scatter( 34 + R() * 26, W ) ) {

			const f = 950 + Math.pow( R(), 1.3 ) * 3300, a = 0.25 + Math.pow( R(), 2 ) * 1.1, dec = 0.003 + R() * 0.008;
			ping( d, sr, t, a, f, dec );
			ping( d, sr, t, a * 0.5, f * ( 2.2 + R() * 0.7 ), dec * 0.6 );

		}

		// and the fine gravel between them sliding
		for ( const t of scatter( 120, W ) ) ping( d, sr, t, 0.12, 2500 + R() * 5000, 0.0006 );
		hiss( d, sr, W, 'bp', 1900, 0.9, 0.035 );
		mode( d, sr, 0.002, 0.07, 70 + R() * 20, 0.03, 0.003 );

	},

	grass( d, sr ) {

		const toeAt = 0.17 + R() * 0.05;
		// the stems brushing the boot, bending and springing back: a soft hiss that swells and
		// fades, and again smaller as the toe leaves
		const brush = ( t ) => exp( 0.022, 0.11 )( t ) + 0.55 * exp( 0.02, 0.08 )( t - toeAt );
		hiss( d, sr, brush, 'bp', 3600 + R() * 1400, 0.55, 0.11 );
		hiss( d, sr, brush, 'bp', 1500 + R() * 400, 0.7, 0.04 );
		// dry stems snapping, faintly
		for ( const t of scatter( 18 + R() * 20, brush ) ) ping( d, sr, t, Math.pow( R(), 2.5 ) * 0.6, 3000 + R() * 5000, 0.0004 + R() * 0.0006 );
		// the heel's dull pad in the turf
		hiss( d, sr, exp( 0.005, 0.04 ), 'lp', 380, 0.7, 0.45 );

	},

	wet( d, sr ) {

		const toeAt = 0.17 + R() * 0.05;
		// soaked stems: heavier, lower, the water squeezed out of the turf
		const brush = ( t ) => exp( 0.02, 0.1 )( t ) + 0.6 * exp( 0.02, 0.09 )( t - toeAt );
		hiss( d, sr, brush, 'bp', 2600 + R() * 800, 0.6, 0.085 );
		sweepFilter( d, sr, exp( 0.012, 0.09 ), 'bp', ( t ) => 1100 * Math.exp( - t * 9 ) + 280, 2.2, 0.14 );
		// drops, flicked off the grass and splashing
		for ( const t of scatter( 22 + R() * 18, brush ) ) ping( d, sr, t, Math.pow( R(), 2 ) * 0.5, 1800 + R() * 3200, 0.001 + R() * 0.002 );
		hiss( d, sr, exp( 0.005, 0.04 ), 'lp', 380, 0.7, 0.45 );

	},

	earth( d, sr ) {

		const toeAt = 0.16 + R() * 0.05, W = weight( 0.05, toeAt, 0.05, 0.5 );
		// soft ground taking the weight
		hiss( d, sr, exp( 0.006, 0.05 ), 'lp', 300, 0.8, 0.6 );
		hiss( d, sr, W, 'bp', 850, 0.8, 0.05 );
		// needles and dry leaves crackling
		for ( const t of scatter( 90 + R() * 70, W ) ) ping( d, sr, t, Math.pow( R(), 3.5 ) * 0.7, 2400 + R() * 4800, 0.0003 + R() * 0.0006 );
		// now and then a twig
		if ( R() < 0.16 ) {

			const t = 0.03 + R() * 0.12;
			for ( let i = 0; i < 3; i ++ ) ping( d, sr, t + i * ( 0.002 + R() * 0.004 ), 1.4 - i * 0.35, 1400 + R() * 2200, 0.003 + R() * 0.004 );
			hiss( d, sr, at( t, exp( 0.0005, 0.006 ) ), 'hp', 1800, 0.7, 0.35 );

		}

	},

	wood( d, sr ) {

		const toeAt = 0.15 + R() * 0.05;
		// a plank knocked: its few modes, the lowest the hollow under the deck
		const knock = ( t, a, f1 ) => {

			for ( const [ r, g, dec ] of [ [ 1, 0.55, 0.055 ], [ 2.32, 0.6, 0.038 ], [ 3.87, 0.55, 0.024 ], [ 6.05, 0.45, 0.014 ], [ 8.7, 0.32, 0.009 ], [ 12.4, 0.2, 0.006 ] ] ) mode( d, sr, t, a * g * 0.12, f1 * r * ( 1 + ( R() - 0.5 ) * 0.05 ), dec * ( 0.8 + R() * 0.4 ) );
			// the sole's contact: a dry tick
			hiss( d, sr, at( t, exp( 0.0005, 0.007 ) ), 'bp', 1900, 0.7, a * 1.3 );

		};

		const f1 = 92 + R() * 55;
		knock( 0, 1, f1 );
		knock( toeAt, 0.35 + R() * 0.15, f1 * ( 1.1 + R() * 0.25 ) );
		// grit on the boards under the sole
		hiss( d, sr, ( t ) => exp( 0.02, 0.06 )( t - 0.01 ) * 0.5 + exp( 0.02, 0.05 )( t - toeAt ), 'bp', 3200, 0.8, 0.03 );

	},

	stone( d, sr ) {

		const toeAt = 0.15 + R() * 0.05;
		// the heel's hard click on the flag, and the weight behind it
		for ( let i = 0; i < 5; i ++ ) ping( d, sr, 0.001 + R() * 0.004, 1.2 + R() * 0.8, 1600 + R() * 2800, 0.0015 + R() * 0.0025 );
		hiss( d, sr, exp( 0.0004, 0.006 ), 'hp', 1300, 0.7, 0.7 );
		mode( d, sr, 0.001, 0.035, 68 + R() * 15, 0.02, 0.002 );
		mode( d, sr, 0.001, 0.03, 420 + R() * 200, 0.008, 0.0008 );
		hiss( d, sr, exp( 0.003, 0.022 ), 'lp', 220, 0.8, 0.25 );
		// grit scuffed under the sole, and the toe
		hiss( d, sr, ( t ) => exp( 0.015, 0.05 )( t - 0.012 ) * 0.4 + exp( 0.02, 0.06 )( t - toeAt ), 'bp', 3600, 0.9, 0.045 );
		for ( let i = 0; i < 2; i ++ ) ping( d, sr, toeAt + R() * 0.004, 0.35, 2200 + R() * 2000, 0.0015 );

	},

	mud( d, sr ) {

		const toeAt = 0.2 + R() * 0.05;
		// the squelch as it takes the weight
		sweepFilter( d, sr, exp( 0.014, 0.12 ), 'bp', ( t ) => 1300 * Math.exp( - t * 12 ) + 260, 2.8, 0.3 );
		hiss( d, sr, exp( 0.006, 0.05 ), 'lp', 260, 0.8, 0.8 );
		// the suck of the heel coming out, and the drip after
		mode( d, sr, toeAt + 0.03, 0.05, 320 + R() * 120, 0.018, 0.004, 0.5 );
		sweepFilter( d, sr, at( toeAt + 0.02, exp( 0.004, 0.03 ) ), 'bp', ( t ) => 500 + t * 3000, 2, 0.25 );
		for ( const t of scatter( 10 + R() * 10, at( toeAt, exp( 0.01, 0.06 ) ) ) ) ping( d, sr, t, Math.pow( R(), 2 ) * 0.45, 1400 + R() * 2400, 0.0015 + R() * 0.002 );

	},

};

// every take of every ground, as AudioBuffers
// the grounds there are takes of
export const GROUNDS = Object.keys( MAKE );
export { TAKES };

// one take of one ground, as an AudioBuffer (a few milliseconds' work)
export function buildTake( ctx, name ) {

	const sr = ctx.sampleRate, n = Math.floor( DUR * sr );
	const d = new Float32Array( n );
	MAKE[ name ]( d, sr );
	// no rumble below the ground's own thud, no fizz above hearing's comfort
	filter( d, 'hp', 45, 0.7, sr );
	filter( d, 'lp', 12000, 0.7, sr );
	// the tail faded, and the take brought to its ground's level
	let e = 0;
	const heard = biquad( 'hp', 400, 0.5, sr );
	for ( let i = 0; i < n; i ++ ) {

		d[ i ] *= Math.min( 1, ( n - i ) / ( sr * 0.04 ) );
		const h = heard( d[ i ] );
		e += h * h;

	}

	const g = LEVEL[ name ] / Math.max( 1e-6, Math.sqrt( e / n ) );
	let peak = 0;
	for ( let i = 0; i < n; i ++ ) peak = Math.max( peak, Math.abs( d[ i ] * g ) );
	const k2 = g * Math.min( 1, 0.9 / Math.max( 1e-6, peak ) );
	const buf = ctx.createBuffer( 1, n, sr );
	const ch = buf.getChannelData( 0 );
	for ( let i = 0; i < n; i ++ ) ch[ i ] = d[ i ] * k2;
	return buf;

}

// every take of every ground at once (tools/stepsrender.mjs; the game makes them a frame at a time)
export function buildSteps( ctx ) {

	const out = {};
	for ( const name of GROUNDS ) out[ name ] = Array.from( { length: TAKES }, () => buildTake( ctx, name ) );
	return out;

}
