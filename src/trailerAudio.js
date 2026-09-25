import { Soundscape } from './audio.js';

// Offline soundtrack for the trailer: the game's own procedural soundscape,
// cued shot by shot, over a slow ambient pad whose chords change on the cuts.

const midi = ( n ) => 440 * Math.pow( 2, ( n - 69 ) / 12 );
// one chord per shot (MIDI notes), in D major
const CHORDS = [
	[ 38, 50, 57, 62, 66, 73 ], // Dmaj9
	[ 35, 47, 54, 62, 66, 69 ], // Bm9
	[ 31, 43, 50, 59, 62, 66 ], // Gmaj7
	[ 33, 45, 52, 57, 62, 64 ], // Asus
	[ 30, 42, 50, 57, 61, 66 ], // D/F#
	[ 28, 40, 47, 55, 62, 66 ], // Em9
	[ 31, 43, 50, 57, 62, 69 ], // Gmaj9 (sundown swell)
	[ 35, 47, 50, 54, 59, 62 ], // Bm7 (rain)
	[ 26, 38, 45, 52, 55, 59 ], // Em/D pedal (storm)
	[ 31, 43, 50, 54, 59, 66 ], // Gmaj7 (blue hour)
	[ 38, 50, 57, 61, 64, 69 ], // Dmaj9 (night, resolve)
];

function encodeWAV( buffer ) {

	const n = buffer.length, ch = buffer.numberOfChannels, sr = buffer.sampleRate;
	const data = new DataView( new ArrayBuffer( 44 + n * ch * 2 ) );
	const str = ( o, s ) => {

		for ( let i = 0; i < s.length; i ++ ) data.setUint8( o + i, s.charCodeAt( i ) );

	};

	str( 0, 'RIFF' );
	data.setUint32( 4, 36 + n * ch * 2, true );
	str( 8, 'WAVE' );
	str( 12, 'fmt ' );
	data.setUint32( 16, 16, true );
	data.setUint16( 20, 1, true );
	data.setUint16( 22, ch, true );
	data.setUint32( 24, sr, true );
	data.setUint32( 28, sr * ch * 2, true );
	data.setUint16( 32, ch * 2, true );
	data.setUint16( 34, 16, true );
	str( 36, 'data' );
	data.setUint32( 40, n * ch * 2, true );
	const chans = [];
	for ( let c = 0; c < ch; c ++ ) chans.push( buffer.getChannelData( c ) );
	let o = 44;
	for ( let i = 0; i < n; i ++ ) {

		for ( let c = 0; c < ch; c ++ ) {

			const v = Math.max( - 1, Math.min( 1, chans[ c ][ i ] ) );
			data.setInt16( o, v < 0 ? v * 0x8000 : v * 0x7fff, true );
			o += 2;

		}

	}

	return data.buffer;

}

export async function renderTrailerAudio( durations ) {

	const sr = 48000;
	const total = durations.reduce( ( a, b ) => a + b, 0 );
	const ctx = new OfflineAudioContext( 2, Math.ceil( sr * total ), sr );
	const s = new Soundscape();
	s.start( ctx );
	s.master.gain.value = 0.9;
	const starts = [];
	durations.reduce( ( t, d ) => ( starts.push( t ), t + d ), 0 );

	// ---- ambient pad: detuned sines and triangles, heavily reverberated ----
	const pad = ctx.createGain();
	pad.gain.value = 0.0;
	const lp = ctx.createBiquadFilter();
	lp.type = 'lowpass';
	lp.frequency.value = 1500;
	lp.Q.value = 0.3;
	pad.connect( lp );
	lp.connect( s.master );
	const padWet = ctx.createGain();
	padWet.gain.value = 1.2;
	lp.connect( padWet ).connect( s.reverbSend );
	pad.gain.setValueAtTime( 0.0001, 0 );
	pad.gain.exponentialRampToValueAtTime( 0.11, 3.0 );
	pad.gain.setValueAtTime( 0.11, total - 4 );
	pad.gain.exponentialRampToValueAtTime( 0.0001, total - 0.1 );
	CHORDS.forEach( ( chord, i ) => {

		if ( i >= durations.length ) return;
		const t0 = Math.max( 0, starts[ i ] - 0.9 ), t1 = starts[ i ] + durations[ i ] + 0.9;
		chord.forEach( ( note, k ) => {

			for ( const [ type, det, amp ] of [ [ 'sine', - 4, 1 ], [ 'triangle', 5, 0.35 ] ] ) {

				const o = ctx.createOscillator();
				o.type = type;
				o.frequency.value = midi( note );
				o.detune.value = det + ( k % 2 ? 3 : - 3 );
				const g = ctx.createGain();
				const level = amp * ( k === 0 ? 0.9 : k > 4 ? 0.35 : 0.55 ) / chord.length;
				g.gain.setValueAtTime( 0.0001, t0 );
				g.gain.exponentialRampToValueAtTime( level, t0 + 1.6 );
				g.gain.setValueAtTime( level, t1 - 1.6 );
				g.gain.exponentialRampToValueAtTime( 0.0001, t1 );
				// slow shimmer on the upper voices
				if ( k > 3 ) {

					const lfo = ctx.createOscillator();
					lfo.frequency.value = 0.18 + k * 0.03;
					const lg = ctx.createGain();
					lg.gain.value = level * 0.4;
					lfo.connect( lg ).connect( g.gain );
					lfo.start( t0 );
					lfo.stop( t1 );

				}

				o.connect( g ).connect( pad );
				o.start( t0 );
				o.stop( t1 + 0.1 );

			}

		} );

	} );

	// ---- ambience loops: levels set per shot, switched with the cut ----
	const set = ( loop, t, v ) => loop.g.gain.setTargetAtTime( v, t, 0.04 );
	const LEVELS = [
		// wind, windHi, lap, rustle, rainHiss, rainRoar
		[ 0.05, 0.005, 0.12, 0.012, 0, 0 ],
		[ 0.14, 0.03, 0, 0.0, 0, 0 ],
		[ 0.04, 0.0, 0.22, 0.0, 0, 0 ],
		[ 0.06, 0.008, 0.0, 0.02, 0, 0 ],
		[ 0.05, 0.006, 0.0, 0.01, 0, 0 ],
		[ 0.03, 0.0, 0.2, 0.0, 0, 0 ],
		[ 0.09, 0.02, 0.0, 0.0, 0, 0 ],
		[ 0.08, 0.015, 0.12, 0.02, 0.09, 0.07 ],
		[ 0.2, 0.05, 0.1, 0.05, 0.12, 0.14 ],
		[ 0.02, 0.0, 0.1, 0.0, 0, 0 ],
		[ 0.03, 0.0, 0.05, 0.0, 0, 0 ],
	];
	durations.forEach( ( d, i ) => {

		const t = starts[ i ], L = LEVELS[ i ] || LEVELS[ 0 ];
		set( s.wind, t, L[ 0 ] );
		set( s.windHi, t, L[ 1 ] );
		set( s.lap, t, L[ 2 ] );
		set( s.lapHi, t, L[ 2 ] * 0.1 );
		set( s.rustle, t, L[ 3 ] );
		set( s.rainHiss, t, L[ 4 ] );
		set( s.rainRoar, t, L[ 5 ] );

	} );

	for ( const loop of [ s.wind, s.windHi, s.lap, s.lapHi, s.rustle, s.rainHiss, s.rainRoar ] ) set( loop, total - 1.2, 0 );

	// ---- one-shot cues ----
	const at = ( shot, t, fn ) => {

		s.t0 = starts[ shot ] + t;
		fn();

	};

	const P = ( x, y, z ) => ( { x, y, z } );
	at( 0, 1.4, () => s.birdSong( P( - 20, 8, - 25 ) ) );
	at( 0, 3.9, () => s.birdSong( P( 25, 10, - 18 ) ) );
	at( 2, 1.6, () => s.birdSong( P( - 30, 6, - 40 ) ) );
	at( 3, 1.2, () => s.roar( P( 0, 1, - 12 ) ) );
	at( 4, 0.7, () => s.whistle( P( 0, 0, - 3 ) ) );
	at( 4, 2.8, () => s.whistle( P( 18, 0, - 10 ) ) );
	at( 5, 1.0, () => s.splash( P( 0, 0, - 8 ), 0.6 ) );
	at( 5, 1.95, () => s.splash( P( 0, 0, - 8 ), 1.2 ) );
	at( 8, 1.3, () => s.thunder( P( 0, 200, - 400 ), 600, 0.32, 0.5 ) );
	at( 8, 3.6, () => s.thunder( P( 200, 200, - 600 ), 1400, 0.3, 0.9 ) );
	at( 9, 0.5, () => s.loon( P( - 60, 1, - 150 ) ) );
	at( 10, 2.2, () => s.owl( P( 40, 12, - 60 ) ) );

	// the rush of the starling flock passing overhead
	{

		const t = starts[ 6 ] + 0.8;
		const src = ctx.createBufferSource();
		src.buffer = s.noise;
		src.loop = true;
		const bp = ctx.createBiquadFilter();
		bp.type = 'bandpass';
		bp.frequency.setValueAtTime( 700, t );
		bp.frequency.linearRampToValueAtTime( 1300, t + 2.2 );
		bp.frequency.linearRampToValueAtTime( 600, t + 4.5 );
		bp.Q.value = 0.8;
		const g = ctx.createGain();
		g.gain.setValueAtTime( 0.0001, t );
		g.gain.exponentialRampToValueAtTime( 0.28, t + 2.0 );
		g.gain.exponentialRampToValueAtTime( 0.0001, t + 4.8 );
		src.connect( bp ).connect( g ).connect( s.master );
		src.start( t );
		src.stop( t + 5 );

	}

	const buffer = await ctx.startRendering();
	const wav = new Uint8Array( encodeWAV( buffer ) );
	// base64 in chunks (large arrays overflow String.fromCharCode.apply)
	let bin = '';
	for ( let i = 0; i < wav.length; i += 0x8000 ) bin += String.fromCharCode.apply( null, wav.subarray( i, i + 0x8000 ) );
	return btoa( bin );

}
