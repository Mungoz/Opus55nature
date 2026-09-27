import * as THREE from 'three';
import { GROUND, RECORDINGS, TEXTURES, TAKES, buildTexture } from './steps.js';

// how loud a recorded step peaks (each is brought to this as it loads)
const STEP_PEAK = 0.34;

// The horror edition's sounds, synthesised like the rest of the soundscape (nothing is
// sampled): a cowbell, footsteps on each kind of ground and their echo, gate and door
// creaks, paper, rain drumming on the shingles, drips, a drone, a loon answered by its own
// call reversed, oars and rowlocks, a boat knocking at the jetty, something heavy crashing
// away through the wood, wading, a heron's croak, finches bursting from a tree.

const _v = new THREE.Vector3();

export class StorySound {

	constructor( audio ) {

		this.a = audio;
		this.drone = 0; // 0..1: how present the drone is
		this.porch = 0; // 0..1: under the porch roof, in the rain
		this._drip = 3;
		this._built = false;

	}

	get ctx() { return this.a.ctx; }

	get on() { return this.a.enabled && !! this.a.ctx; }

	_build() {

		if ( this._built || ! this.on ) return;
		this._built = true;
		const ctx = this.ctx, A = this.a;
		// the drone: two low sines a fraction apart (they beat), a darker fifth below, and a
		// breath of filtered noise; all near the floor of hearing
		this.droneGain = ctx.createGain();
		this.droneGain.gain.value = 0;
		this.droneGain.connect( A.master );
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 240;
		lp.connect( this.droneGain );
		for ( const [ f, g ] of [ [ 55, 0.5 ], [ 55.35, 0.5 ], [ 36.7, 0.35 ], [ 110.4, 0.08 ] ] ) {

			const o = ctx.createOscillator();
			o.frequency.value = f;
			const og = ctx.createGain();
			og.gain.value = g;
			o.connect( og ).connect( lp );
			o.start();

		}

		const n = A._loop( 'bandpass', 180, 1.2 );
		n.g.disconnect();
		n.g.gain.value = 0.9;
		n.g.connect( this.droneGain );
		// rain drumming on the shingles overhead: a bed of tiny impacts on wood
		this.roofBuf = this._impacts( 3, 900, 0.004, [ 1400, 3400 ] );
		this.roof = ctx.createBufferSource();
		this.roof.buffer = this.roofBuf;
		this.roof.loop = true;
		const bp = ctx.createBiquadFilter();
		bp.type = 'peaking';
		bp.frequency.value = 700;
		bp.gain.value = 6;
		this.roofGain = ctx.createGain();
		this.roofGain.gain.value = 0;
		this.roof.connect( bp ).connect( this.roofGain ).connect( A.master );
		this.roof.start();
		// wind in the roof and the rain's roar under the eave are the soundscape's own
		// water running into the trough by the hut
		if ( this.spoutAt ) this.trickle( this.spoutAt );
		// the footsteps (steps.js): the recorded steps, loaded now; the textures laid over some of
		// them, made one a frame from here on - all long before the first step off the boat
		this.recs = {};
		this.tex = {};
		this._toMake = TEXTURES.flatMap( ( g ) => Array( TAKES ).fill( g ) );
		this._take = {};
		this._foot = 1;
		for ( const name of RECORDINGS ) {

			fetch( `./sounds/steps/${ name }.ogg` ).then( ( r ) => r.arrayBuffer() ).then( ( b ) => ctx.decodeAudioData( b ) ).then( ( buf ) => {

				// each brought to one peak
				const d = buf.getChannelData( 0 );
				let peak = 0;
				for ( let i = 0; i < d.length; i ++ ) peak = Math.max( peak, Math.abs( d[ i ] ) );
				for ( let c = 0; c < buf.numberOfChannels; c ++ ) {

					const ch = buf.getChannelData( c );
					for ( let i = 0; i < ch.length; i ++ ) ch[ i ] *= STEP_PEAK / Math.max( 1e-4, peak );

				}

				( this.recs[ name.split( '_' )[ 1 ] ] ??= [] ).push( buf );

			} ).catch( ( e ) => console.warn( 'footstep', name, e ) );

		}

	}

	// a buffer of random impacts: n per second, each a decaying click of about len s, filtered
	_impacts( seconds, perSec, len, band ) {

		const ctx = this.ctx, sr = ctx.sampleRate, N = Math.floor( sr * seconds );
		const buf = ctx.createBuffer( 1, N, sr ), d = buf.getChannelData( 0 );
		const count = Math.floor( perSec * seconds );
		for ( let k = 0; k < count; k ++ ) {

			const t0 = Math.floor( Math.random() * N ), amp = Math.pow( Math.random(), 2.5 ) * 0.6;
			const f = band[ 0 ] + Math.random() * ( band[ 1 ] - band[ 0 ] ), L = Math.floor( len * sr * ( 0.5 + Math.random() ) );
			for ( let i = 0; i < L; i ++ ) {

				const j = ( t0 + i ) % N;
				d[ j ] += Math.sin( i / sr * f * Math.PI * 2 ) * amp * Math.exp( - i / ( L * 0.3 ) );

			}

		}

		return buf;

	}

	// a panner at p (a point or null for "in your head")
	_at( p, ref = 8 ) {

		const A = this.a;
		if ( ! p ) {

			const g = this.ctx.createGain();
			g.connect( A.master );
			return g;

		}

		const pn = A._panner( p );
		pn.refDistance = ref;
		return pn;

	}

	_noise( dest, t, dur, type, freq, q, gain, attack = 0.005 ) {

		const ctx = this.ctx;
		const s = ctx.createBufferSource();
		s.buffer = this.a.noise;
		const f = ctx.createBiquadFilter();
		f.type = type;
		f.frequency.setValueAtTime( freq, t );
		f.Q.value = q;
		const g = ctx.createGain();
		g.gain.setValueAtTime( 0.0001, t );
		g.gain.exponentialRampToValueAtTime( gain, t + attack );
		g.gain.exponentialRampToValueAtTime( 0.0001, t + dur );
		s.connect( f ).connect( g ).connect( dest );
		s.start( t, Math.random() * 3 );
		s.stop( t + dur + 0.05 );
		return f;

	}

	// ------------------------------------------------------------------ the cowbell
	// A hammered-iron Alpine cowbell: a clank of inharmonic partials that die at different
	// rates, the clapper's knock on top. strikes: how many (a cow grazing moves its head:
	// one, or a stumbling double).
	cowbell( p, strikes = 1, gain = 1 ) {

		if ( ! this.on ) return;
		// (it carries: a bell is made to be heard across a hillside)
		const ctx = this.ctx, dest = this._at( p, 30 );
		const wet = ctx.createGain();
		wet.gain.value = 0.9;
		dest.connect?.( wet );
		wet.connect( this.a.reverbSend );
		let t = this.a.now() + 0.03;
		const f0 = 610 + Math.random() * 30;
		for ( let s = 0; s < strikes; s ++ ) {

			const k = ( s ? 0.5 + Math.random() * 0.4 : 1 ) * gain;
			for ( const [ r, amp, dec ] of [ [ 1, 0.5, 0.9 ], [ 1.47, 0.32, 0.55 ], [ 2.09, 0.28, 0.4 ], [ 2.76, 0.2, 0.3 ], [ 3.55, 0.12, 0.2 ], [ 4.9, 0.08, 0.12 ] ] ) {

				const o = ctx.createOscillator();
				o.frequency.value = f0 * r * ( 1 + ( Math.random() - 0.5 ) * 0.006 );
				const g = ctx.createGain();
				g.gain.setValueAtTime( 0.0001, t );
				g.gain.exponentialRampToValueAtTime( amp * 0.5 * k, t + 0.004 );
				g.gain.exponentialRampToValueAtTime( 0.0001, t + dec * ( 0.8 + Math.random() * 0.4 ) );
				o.connect( g ).connect( dest );
				o.start( t );
				o.stop( t + dec + 0.1 );

			}

			// the clapper's knock: a tight burst of noise
			this._noise( dest, t, 0.05, 'bandpass', 2600, 1.5, 0.55 * k, 0.002 );
			t += 0.16 + Math.random() * 0.25;

		}

	}

	// a cow somewhere, moving: a few clanks over some seconds
	cowbellWalk( p, seconds = 6, gain = 1 ) {

		if ( ! this.on ) return;
		let t = 0;
		while ( t < seconds ) {

			const at = t;
			setTimeout( () => this.cowbell( p, Math.random() < 0.35 ? 2 : 1, gain * ( 0.6 + Math.random() * 0.4 ) ), at * 1000 );
			t += 0.7 + Math.random() * 1.6;

		}

	}

	// ------------------------------------------------------------------ steps
	// one footstep on the kind of ground underfoot (steps.js: grass, wet, earth, gravel, shingle,
	// wood, stone, mud): a recorded step with, for some grounds, a texture over it - never the
	// same take twice running, a little faster or slower, louder or softer, each foot a touch to
	// its own side; from p (an echo) if given
	step( surface, p = null, gain = 1, when = 0 ) {

		if ( ! this.on ) return;
		this._build();
		const G = GROUND[ surface ] ?? GROUND.grass;
		const recs = this.recs[ G.rec ];
		if ( ! recs?.length ) return; // (still loading)
		const ctx = this.ctx, t = this.a.now() + 0.01 + when;
		const out = ctx.createGain();
		out.gain.value = gain * ( G.vol ?? 1 ) * ( 0.82 + Math.random() * 0.3 );
		let dest;
		if ( p ) dest = this._at( p, 3 );
		else {

			dest = this._at( null );
			this._foot = - this._foot;
			if ( ctx.createStereoPanner ) {

				const pan = ctx.createStereoPanner();
				pan.pan.value = this._foot * 0.12;
				pan.connect( dest );
				dest = pan;

			}

		}

		out.connect( dest );
		const src = ctx.createBufferSource();
		src.buffer = this._pick( recs, G.rec );
		src.playbackRate.value = ( G.rate ?? 1 ) * ( 0.94 + Math.random() * 0.12 );
		src.connect( out );
		src.start( t );
		if ( G.tex ) {

			if ( ! this.tex[ G.tex ]?.length ) this._makeTex( G.tex );
			const tx = ctx.createBufferSource();
			tx.buffer = this._pick( this.tex[ G.tex ], G.tex );
			tx.playbackRate.value = 0.94 + Math.random() * 0.12;
			const tg = ctx.createGain();
			tg.gain.value = ( G.mix ?? 0.5 ) * STEP_PEAK;
			tx.connect( tg ).connect( out );
			tx.start( t );

		}

	}

	// a take from list, not the one used last time for key
	_pick( list, key ) {

		let k = Math.floor( Math.random() * list.length );
		if ( list.length > 1 && k === this._take[ key ] ) k = ( k + 1 ) % list.length;
		this._take[ key ] = k;
		return list[ k ];

	}

	_makeTex( g ) {

		const i = this._toMake.indexOf( g );
		if ( i >= 0 ) this._toMake.splice( i, 1 );
		( this.tex[ g ] ??= [] ).push( buildTexture( this.ctx, g ) );

	}

	// ------------------------------------------------------------------ wood and iron
	// a creak: wood rubbing wood (a door, a gate, a rowlock, the jetty), rising or falling
	creak( p, dur = 0.8, gain = 0.4, f0 = 180, f1 = 260 ) {

		if ( ! this.on ) return;
		const ctx = this.ctx, dest = this._at( p, 5 );
		const t = this.a.now() + 0.02;
		const o = ctx.createOscillator();
		o.type = 'sawtooth';
		o.frequency.setValueAtTime( f0, t );
		o.frequency.linearRampToValueAtTime( f1, t + dur * 0.7 );
		o.frequency.linearRampToValueAtTime( f1 * 0.9, t + dur );
		// stick-slip: the friction catches and lets go
		const lfo = ctx.createOscillator();
		lfo.frequency.value = 22 + Math.random() * 14;
		const lg = ctx.createGain();
		lg.gain.value = f0 * 0.12;
		lfo.connect( lg ).connect( o.frequency );
		const am = ctx.createGain();
		am.gain.value = 0.5;
		const amL = ctx.createOscillator();
		amL.frequency.value = 9 + Math.random() * 6;
		const amg = ctx.createGain();
		amg.gain.value = 0.5;
		amL.connect( amg ).connect( am.gain );
		const bp = ctx.createBiquadFilter();
		bp.type = 'bandpass';
		bp.frequency.value = 900;
		bp.Q.value = 3;
		const g = ctx.createGain();
		g.gain.setValueAtTime( 0.0001, t );
		g.gain.exponentialRampToValueAtTime( gain, t + 0.08 );
		g.gain.setValueAtTime( gain * 0.8, t + dur * 0.8 );
		g.gain.exponentialRampToValueAtTime( 0.0001, t + dur );
		o.connect( am ).connect( bp ).connect( g ).connect( dest );
		for ( const n of [ o, lfo, amL ] ) { n.start( t ); n.stop( t + dur + 0.05 ); }

	}

	// a gate: the creak of its hinge and the knock of the bar dropping home
	gate( p ) {

		this.creak( p, 1.3, 0.45, 150, 240 );
		setTimeout( () => this.knock( p, 0.6 ), 1350 );

	}

	// wood on wood: a boat against the jetty's posts, a gate closing
	knock( p, gain = 0.5 ) {

		if ( ! this.on ) return;
		const dest = this._at( p, 6 ), t = this.a.now() + 0.01;
		this.a._tone( dest, t, 0.14, 160 + Math.random() * 30, 120, 0.5 * gain );
		this.a._tone( dest, t, 0.06, 430, 380, 0.2 * gain );
		this._noise( dest, t, 0.05, 'bandpass', 700, 1.5, 0.2 * gain, 0.002 );

	}

	latch( p ) {

		if ( ! this.on ) return;
		const dest = this._at( p, 4 ), t = this.a.now() + 0.01;
		this.a._tone( dest, t, 0.05, 2400, 2100, 0.15 );
		this.a._tone( dest, t + 0.06, 0.08, 1700, 1500, 0.1 );

	}

	// a page turned, a sheet of paper handled
	paper() {

		if ( ! this.on ) return;
		const dest = this._at( null ), t = this.a.now() + 0.01;
		for ( let i = 0; i < 5; i ++ ) this._noise( dest, t + i * 0.035 + Math.random() * 0.02, 0.06, 'highpass', 2500 + Math.random() * 2500, 0.8, 0.05 + Math.random() * 0.04, 0.004 );

	}

	// a field telephone cranked: the crank's rattle, then static, and under the static a voice,
	// slow, a word at a time (a murmur of formants; what it says is only in the caption)
	radio( p, seconds = 9 ) {

		if ( ! this.on ) return;
		const ctx = this.ctx, dest = this._at( p, 3 ), t0 = this.a.now() + 0.02;
		for ( let i = 0; i < 7; i ++ ) this._noise( dest, t0 + i * 0.09, 0.05, 'bandpass', 1800 + Math.random() * 600, 3, 0.12, 0.003 );
		const t1 = t0 + 0.9;
		// the static
		const hiss = this._noise( dest, t1, seconds, 'bandpass', 2600, 0.5, 0.05, 0.4 );
		hiss.frequency.setValueAtTime( 2600, t1 );
		// the voice: bursts of a buzz through two moving formant filters, a syllable at a time
		for ( let k = 0; k < seconds * 1.6; k ++ ) {

			const t = t1 + 0.8 + k * 0.62 + Math.random() * 0.15;
			if ( t > t1 + seconds - 0.4 || Math.random() < 0.18 ) continue;
			const o = ctx.createOscillator();
			o.type = 'sawtooth';
			o.frequency.setValueAtTime( 88 + Math.random() * 10, t );
			o.frequency.linearRampToValueAtTime( 80, t + 0.3 );
			const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
			f1.type = f2.type = 'bandpass';
			f1.Q.value = 7; f2.Q.value = 9;
			const v = [ [ 700, 1200 ], [ 400, 2000 ], [ 300, 800 ], [ 550, 1700 ] ][ k % 4 ];
			f1.frequency.setValueAtTime( v[ 0 ], t );
			f2.frequency.setValueAtTime( v[ 1 ], t );
			f1.frequency.linearRampToValueAtTime( v[ 0 ] * 0.8, t + 0.3 );
			const g = ctx.createGain();
			g.gain.setValueAtTime( 0.0001, t );
			g.gain.exponentialRampToValueAtTime( 0.05, t + 0.05 );
			g.gain.exponentialRampToValueAtTime( 0.0001, t + 0.34 );
			const mix = ctx.createGain();
			o.connect( f1 ).connect( mix );
			o.connect( f2 ).connect( mix );
			mix.connect( g ).connect( dest );
			o.start( t );
			o.stop( t + 0.4 );

		}

	}

	// ------------------------------------------------------------------ water
	// a drip off the eaves or the branches onto stone, leaf or puddle
	drip( p, gain = 0.3 ) {

		if ( ! this.on ) return;
		const dest = this._at( p, 3 ), t = this.a.now() + 0.01;
		const f = 900 + Math.random() * 1400;
		this.a._tone( dest, t, 0.05 + Math.random() * 0.04, f, f * 1.6, gain * 0.5 );
		this._noise( dest, t, 0.03, 'bandpass', 3500, 2, gain * 0.2, 0.001 );

	}

	// water running from a pipe into a trough: a steady trickle, its level burbling
	trickle( p, gain = 0.22 ) {

		const ctx = this.ctx, dest = this._at( p, 2.5 );
		const src = ctx.createBufferSource();
		src.buffer = this.a.noise;
		src.loop = true;
		const hp = ctx.createBiquadFilter();
		hp.type = 'highpass';
		hp.frequency.value = 900;
		const bp = ctx.createBiquadFilter();
		bp.type = 'bandpass';
		bp.frequency.value = 2400;
		bp.Q.value = 0.8;
		const g = ctx.createGain();
		g.gain.value = gain;
		for ( const [ fq, k ] of [ [ 5.3, 0.3 ], [ 1.7, 0.2 ] ] ) {

			const lfo = ctx.createOscillator();
			lfo.frequency.value = fq;
			const lg = ctx.createGain();
			lg.gain.value = gain * k;
			lfo.connect( lg ).connect( g.gain );
			lfo.start();

		}

		src.connect( hp ).connect( bp ).connect( g ).connect( dest );
		src.start();
		return g;

	}

	// wading: water pushed aside by a leg
	wade( p, gain = 0.6 ) {

		if ( ! this.on ) return;
		const dest = this._at( p, 10 ), t = this.a.now() + 0.01;
		const f = this._noise( dest, t, 0.35, 'bandpass', 1200, 0.8, 0.3 * gain, 0.03 );
		f.frequency.exponentialRampToValueAtTime( 500, t + 0.3 );
		this._noise( dest, t + 0.05, 0.2, 'lowpass', 400, 1, 0.2 * gain, 0.02 );

	}

	// an oar: the blade going in, the pull (a swirl of water), the rowlock turning
	oar( p, gain = 1 ) {

		if ( ! this.on ) return;
		const dest = this._at( p, 5 ), t = this.a.now() + 0.01;
		const f = this._noise( dest, t, 0.22, 'bandpass', 1500, 1, 0.25 * gain, 0.01 );
		f.frequency.exponentialRampToValueAtTime( 400, t + 0.2 );
		this.a._tone( dest, t + 0.03, 0.1, 300, 150, 0.1 * gain );
		const sw = this._noise( dest, t + 0.1, 0.9, 'lowpass', 600, 1.2, 0.12 * gain, 0.25 );
		sw.frequency.linearRampToValueAtTime( 300, t + 1 );
		setTimeout( () => this.creak( p, 0.35, 0.12 * gain, 380, 460 ), 150 );
		// the drips off the blade as it swings forward
		for ( let i = 0; i < 4; i ++ ) setTimeout( () => this.drip( p, 0.15 * gain ), 1100 + i * 90 + Math.random() * 80 );

	}

	// ------------------------------------------------------------------ animals
	// a grey heron's alarm: a harsh, flat "fraank"
	croak( p ) {

		if ( ! this.on ) return;
		const ctx = this.ctx, dest = this._at( p, 20 );
		const t = this.a.now() + 0.02;
		for ( const [ dt0, dur ] of [ [ 0, 0.38 ] ] ) {

			const o = ctx.createOscillator();
			o.type = 'sawtooth';
			o.frequency.setValueAtTime( 260, t + dt0 );
			o.frequency.linearRampToValueAtTime( 210, t + dt0 + dur );
			const jit = ctx.createOscillator();
			jit.frequency.value = 47;
			const jg = ctx.createGain();
			jg.gain.value = 30;
			jit.connect( jg ).connect( o.frequency );
			const g = ctx.createGain();
			g.gain.setValueAtTime( 0.0001, t + dt0 );
			g.gain.exponentialRampToValueAtTime( 0.5, t + dt0 + 0.03 );
			g.gain.setValueAtTime( 0.4, t + dt0 + dur * 0.7 );
			g.gain.exponentialRampToValueAtTime( 0.0001, t + dt0 + dur );
			for ( const [ f, q, k ] of [ [ 900, 3, 1 ], [ 1800, 5, 0.5 ], [ 3000, 6, 0.2 ] ] ) {

				const bp = ctx.createBiquadFilter();
				bp.type = 'bandpass';
				bp.frequency.value = f;
				bp.Q.value = q;
				const fg = ctx.createGain();
				fg.gain.value = k;
				o.connect( bp ).connect( fg ).connect( g );

			}

			g.connect( dest );
			o.start( t + dt0 ); jit.start( t + dt0 );
			o.stop( t + dt0 + dur + 0.05 ); jit.stop( t + dt0 + dur + 0.05 );

		}

	}

	// finches bursting from a tree: the whirr of wings, thin calls
	flush( p, n = 20 ) {

		if ( ! this.on ) return;
		const dest = this._at( p, 10 ), t = this.a.now() + 0.01;
		for ( let i = 0; i < Math.min( 10, n / 2 ); i ++ ) this._noise( dest, t + Math.random() * 0.25, 0.3, 'bandpass', 1400 + Math.random() * 900, 1.2, 0.08, 0.02 );
		for ( let i = 0; i < 6; i ++ ) this.a._tone( dest, t + 0.1 + Math.random() * 0.8, 0.06, 4800 + Math.random() * 800, 4200, 0.05 );

	}

	// a wagtail's "chiz-zick"; a dipper's sharp "zit"
	wagtail( p ) {

		if ( ! this.on ) return;
		const dest = this._at( p, 8 ), t = this.a.now() + 0.01;
		this.a._tone( dest, t, 0.06, 6200, 5200, 0.07 );
		this.a._tone( dest, t + 0.09, 0.07, 5600, 4800, 0.06 );

	}

	dipper( p ) {

		if ( ! this.on ) return;
		const dest = this._at( p, 8 ), t = this.a.now() + 0.01;
		for ( let i = 0; i < 3; i ++ ) this.a._tone( dest, t + i * 0.12, 0.04, 5200, 4600, 0.08 );

	}

	// a bear rooting about: sniffing in the litter, a low grunt now and then
	snuffle( p, seconds = 3 ) {

		if ( ! this.on ) return;
		const dest = this._at( p, 12 ), t0 = this.a.now() + 0.02;
		for ( let t = 0; t < seconds; t += 0.25 + Math.random() * 0.35 ) {

			// quick sniffs: a breathy hiss in and out
			this._noise( dest, t0 + t, 0.09, 'bandpass', 1800 + Math.random() * 900, 1.4, 0.18, 0.02 );
			if ( Math.random() < 0.18 ) this.a._tone( dest, t0 + t + 0.05, 0.35, 95, 70, 0.22, 'sawtooth' );

		}

	}

	// a startled bear's woof: one explosive huff through the nose and mouth, and the clap of its jaws
	woof( p ) {

		if ( ! this.on ) return;
		const dest = this._at( p, 16 ), t = this.a.now() + 0.02;
		const f = this._noise( dest, t, 0.32, 'lowpass', 1400, 0.8, 0.9, 0.006 );
		f.frequency.exponentialRampToValueAtTime( 240, t + 0.3 );
		this.a._tone( dest, t, 0.28, 130, 62, 0.45, 'sawtooth' );
		for ( let i = 0; i < 2; i ++ ) this._noise( dest, t + 0.45 + i * 0.16, 0.025, 'bandpass', 1300, 2.5, 0.5, 0.002 );

	}

	// something heavy going away fast through the wood: snapping sticks, thrashing
	// undergrowth, the thud of its weight, all receding
	crash( p, dir, seconds = 3 ) {

		if ( ! this.on ) return;
		const n = Math.floor( seconds * 9 );
		for ( let i = 0; i < n; i ++ ) {

			const u = i / n;
			const q = p.clone().addScaledVector( dir, u * seconds * 5 );
			const t0 = u * seconds + Math.random() * 0.1;
			setTimeout( () => {

				const dest = this._at( q, 12 ), t = this.a.now() + 0.01, k = 1 - u * 0.7;
				if ( Math.random() < 0.55 ) this._noise( dest, t, 0.02, 'highpass', 2200, 1, 0.35 * k, 0.001 );
				this._noise( dest, t, 0.25, 'bandpass', 1800, 0.6, 0.12 * k, 0.03 );
				if ( i % 3 === 0 ) this.a._tone( dest, t, 0.12, 80, 55, 0.4 * k );

			}, t0 * 1000 );

		}

	}

	// the loon's wail, and then - from the same place - the same wail played backwards
	async loonAnswered( p, q ) {

		if ( ! this.on ) return;
		this.a.loon( p );
		const buf = await this._loonBuffer();
		setTimeout( () => {

			if ( ! this.on ) return;
			const src = this.ctx.createBufferSource();
			src.buffer = buf;
			const dest = this._at( q, 12 );
			src.connect( dest );
			const wet = this.ctx.createGain();
			wet.gain.value = 1.1;
			src.connect( wet ).connect( this.a.reverbSend );
			src.start( this.a.now() + 0.05 );

		}, 5200 );

	}

	async _loonBuffer() {

		if ( this._revLoon ) return this._revLoon;
		const sr = this.ctx.sampleRate;
		const off = new OfflineAudioContext( 1, Math.floor( sr * 3.6 ), sr );
		const tmp = Object.create( Object.getPrototypeOf( this.a ) );
		Object.assign( tmp, { ctx: off, enabled: true, t0: 0, master: off.destination, reverbSend: off.createGain() } );
		tmp._panner = () => off.destination;
		tmp.now = () => off.currentTime;
		tmp.loon( null );
		const buf = await off.startRendering();
		const d = buf.getChannelData( 0 );
		d.reverse();
		this._revLoon = buf;
		return buf;

	}

	// ------------------------------------------------------------------ starlings
	// A murmuration's roar: the wings of hundreds of birds, a rushing like surf breaking that
	// swells as the whole flock turns at once, with the flutter of the wingbeats in it. Set
	// every frame with the flock's middle and a level (0 silences it).
	flock( p, level ) {

		if ( ! this.on ) return;
		const ctx = this.ctx, A = this.a, t = ctx.currentTime;
		if ( ! this._flock ) {

			if ( level <= 0 ) return;
			const pn = A._panner( p );
			pn.refDistance = 35;
			pn.rolloffFactor = 1.2;
			const g = ctx.createGain();
			g.gain.value = 0;
			g.connect( pn );
			const srcs = [];
			for ( const [ type, fq, q, k ] of [ [ 'bandpass', 650, 0.6, 1 ], [ 'bandpass', 1900, 0.9, 0.5 ], [ 'highpass', 4200, 0.7, 0.12 ] ] ) {

				const src = ctx.createBufferSource();
				src.buffer = A.noise;
				src.loop = true;
				src.playbackRate.value = 0.85 + Math.random() * 0.3;
				const bq = ctx.createBiquadFilter();
				bq.type = type;
				bq.frequency.value = fq;
				bq.Q.value = q;
				// the flutter: many wingbeats, never quite together
				const fl = ctx.createGain();
				fl.gain.value = k * 0.75;
				for ( const hz of [ 11.3, 14.9 ] ) {

					const o = ctx.createOscillator();
					o.frequency.value = hz + Math.random();
					const og = ctx.createGain();
					og.gain.value = k * 0.14;
					o.connect( og ).connect( fl.gain );
					o.start();
					srcs.push( o );

				}

				src.connect( bq ).connect( fl ).connect( g );
				src.start( 0, Math.random() * 3 );
				srcs.push( src );

			}

			this._flock = { pn, g, srcs };

		}

		const F = this._flock;
		F.pn.positionX.setTargetAtTime( p.x, t, 0.15 );
		F.pn.positionY.setTargetAtTime( p.y, t, 0.15 );
		F.pn.positionZ.setTargetAtTime( p.z, t, 0.15 );
		F.g.gain.setTargetAtTime( Math.max( 0, level ) * 0.9, t, 0.35 );
		if ( level <= 0 ) {

			// let it die away, then free it
			const dead = F;
			this._flock = null;
			setTimeout( () => { for ( const n of dead.srcs ) try { n.stop(); } catch ( e ) { void e; } }, 3000 );

		}

	}

	// The roost: hundreds of starlings settling in the reeds - a restless din of clicks,
	// whistles, wheezes and squeaks from all over the bed. roost( p ) starts it; roost( null )
	// stops it dead, all at once.
	roost( p, spread = 14 ) {

		// (a handful of voices spread over the bed, each a place in it, and every call goes
		// out from one of them)
		if ( this._roost ) for ( const d of this._roost.dests ) d.disconnect();
		this._roost = null;
		this._chat = 0;
		if ( ! p || ! this.on ) return;
		const dests = [];
		for ( let k = 0; k < 7; k ++ ) dests.push( this._at( new THREE.Vector3( p.x + ( Math.random() * 2 - 1 ) * spread, p.y + 1, p.z + ( Math.random() * 2 - 1 ) * spread * 0.6 ), 10 ) );
		this._roost = { p: p.clone(), spread, dests, level: 0 };

	}

	_chatter( dt ) {

		const R = this._roost;
		if ( ! R ) return;
		// the din builds as they come down
		R.level = Math.min( 1, R.level + dt / 8 );
		this._chat -= dt;
		while ( this._chat <= 0 ) {

			this._chat += ( 0.018 + Math.random() * 0.06 ) / ( 0.3 + R.level );
			const dest = R.dests[ Math.floor( Math.random() * R.dests.length ) ], t = this.a.now() + 0.01 + Math.random() * 0.03, g = 0.03 * ( 0.5 + Math.random() ) * R.level;
			const k = Math.random();
			if ( k < 0.3 ) {

				// a falling whistle
				const f0 = 2600 + Math.random() * 1800;
				this.a._tone( dest, t, 0.12 + Math.random() * 0.2, f0, f0 * ( 0.55 + Math.random() * 0.25 ), g );

			} else if ( k < 0.55 ) {

				// a clicking rattle
				const nk = 3 + Math.floor( Math.random() * 5 );
				for ( let j = 0; j < nk; j ++ ) this._noise( dest, t + j * 0.028, 0.012, 'bandpass', 3200 + Math.random() * 1500, 2, g * 2.2, 0.001 );

			} else if ( k < 0.75 ) {

				// a wheeze
				this._noise( dest, t, 0.18 + Math.random() * 0.15, 'bandpass', 4200 + Math.random() * 1600, 4, g * 1.4, 0.03 );

			} else {

				// a rising squeak, a chirp
				const f0 = 1900 + Math.random() * 1400;
				this.a._tone( dest, t, 0.05 + Math.random() * 0.06, f0, f0 * 1.5, g * 0.9, 'triangle' );

			}

		}

	}

	// ------------------------------------------------------------------ per frame
	update( dt, env ) {

		if ( ! this.on ) return;
		this._build();
		// (a footstep take a frame, until there are all of them)
		if ( this._toMake.length ) this._makeTex( this._toMake[ 0 ] );
		const now = this.ctx.currentTime;
		this.droneGain.gain.setTargetAtTime( 0.1 * this.drone, now, 0.8 );
		this.roofGain.gain.setTargetAtTime( 0.5 * this.porch * env.rain, now, 0.4 );
		this._chatter( Math.min( dt, 0.1 ) );
		// drips after the rain, off the eaves and the trees
		const wet = env.wetness * ( 1 - env.rain );
		if ( wet > 0.1 ) {

			this._drip -= dt;
			if ( this._drip <= 0 ) {

				this._drip = 0.3 + Math.random() * ( this.porch > 0.5 ? 0.7 : 2.5 ) / wet;
				const p = env.camera.position;
				const a = Math.random() * Math.PI * 2, d = 1.5 + Math.random() * 6;
				this.drip( _v.set( p.x + Math.cos( a ) * d, p.y - 1.4, p.z + Math.sin( a ) * d ), 0.2 + Math.random() * 0.2 );

			}

		}

	}

}
