import * as THREE from 'three';

// Fully procedural soundscape: nothing is sampled, everything is synthesised.
export class Soundscape {

	constructor() {

		this.ctx = null;
		this.enabled = false;
		this.volume = 0.8;
		this._birdTimer = 2;
		this._loonTimer = 20;
		this._owlTimer = 30;
		this._fwd = new THREE.Vector3();
		this._up = new THREE.Vector3();

	}

	start() {

		if ( this.ctx ) {

			this.ctx.resume();
			return;

		}

		const AC = window.AudioContext || window.webkitAudioContext;
		if ( ! AC ) return;
		const ctx = this.ctx = new AC();
		this.master = ctx.createGain();
		this.master.gain.value = this.volume;
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = - 18;
		comp.ratio.value = 3;
		this.master.connect( comp ).connect( ctx.destination );

		// valley reverb: generated impulse response with a long, dark tail
		this.reverb = ctx.createConvolver();
		this.reverb.buffer = this._impulse( 3.8, 2.6 );
		this.reverbSend = ctx.createGain();
		this.reverbSend.gain.value = 0.55;
		this.reverbSend.connect( this.reverb ).connect( this.master );

		this.noise = this._noiseBuffer( 4 );

		// wind body
		this.wind = this._loop( 'bandpass', 420, 0.6 );
		this.windHi = this._loop( 'bandpass', 1400, 0.9 );
		// leaves rustling in the canopy
		this.rustle = this._loop( 'highpass', 2600, 0.3 );
		// water lapping at the shore
		this.lap = this._loop( 'lowpass', 520, 1 );
		this.lapHi = this._loop( 'bandpass', 1800, 2 );
		// rain: a bright hiss of drops plus the low roar of a downpour
		this.rainHiss = this._loop( 'bandpass', 3200, 0.35 );
		this.rainRoar = this._loop( 'lowpass', 700, 0.6 );
		this.enabled = true;

	}

	setVolume( v ) {

		this.volume = v;
		if ( this.master ) this.master.gain.setTargetAtTime( v, this.ctx.currentTime, 0.1 );

	}

	_noiseBuffer( seconds ) {

		const ctx = this.ctx;
		const len = Math.floor( ctx.sampleRate * seconds );
		const buf = ctx.createBuffer( 1, len, ctx.sampleRate );
		const d = buf.getChannelData( 0 );
		// pinkish noise (Paul Kellet)
		let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
		for ( let i = 0; i < len; i ++ ) {

			const w = Math.random() * 2 - 1;
			b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
			b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = - 0.7616 * b5 - w * 0.016898;
			d[ i ] = ( b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362 ) * 0.11;
			b6 = w * 0.115926;

		}

		return buf;

	}

	_impulse( seconds, decay ) {

		const ctx = this.ctx;
		const len = Math.floor( ctx.sampleRate * seconds );
		const buf = ctx.createBuffer( 2, len, ctx.sampleRate );
		for ( let c = 0; c < 2; c ++ ) {

			const d = buf.getChannelData( c );
			let lp = 0;
			for ( let i = 0; i < len; i ++ ) {

				const t = i / len;
				// sparse early reflections off the valley walls, then a smooth tail
				const early = i < ctx.sampleRate * 0.3 && Math.random() < 0.002 ? ( Math.random() * 2 - 1 ) * 0.8 : 0;
				lp += ( ( Math.random() * 2 - 1 ) - lp ) * ( 0.25 - t * 0.2 );
				d[ i ] = ( lp * Math.pow( 1 - t, decay ) + early ) * 0.6;

			}

		}

		return buf;

	}

	_loop( type, freq, q ) {

		const ctx = this.ctx;
		const src = ctx.createBufferSource();
		src.buffer = this.noise;
		src.loop = true;
		src.playbackRate.value = 0.8 + Math.random() * 0.4;
		const f = ctx.createBiquadFilter();
		f.type = type;
		f.frequency.value = freq;
		f.Q.value = q;
		const g = ctx.createGain();
		g.gain.value = 0;
		src.connect( f ).connect( g ).connect( this.master );
		src.start( 0, Math.random() * 3 );
		return { src, f, g };

	}

	_panner( pos ) {

		const p = this.ctx.createPanner();
		p.panningModel = 'HRTF';
		p.distanceModel = 'inverse';
		p.refDistance = 12;
		p.rolloffFactor = 0.9;
		p.maxDistance = 3000;
		p.positionX.value = pos.x;
		p.positionY.value = pos.y;
		p.positionZ.value = pos.z;
		p.connect( this.master );
		const send = this.ctx.createGain();
		send.gain.value = 0.35;
		p.connect( send ).connect( this.reverbSend );
		return p;

	}

	// ---- one-shot voices ----
	_tone( dest, t, dur, f0, f1, gain, type = 'sine', vibrato = 0 ) {

		const ctx = this.ctx;
		const o = ctx.createOscillator();
		o.type = type;
		o.frequency.setValueAtTime( f0, t );
		o.frequency.exponentialRampToValueAtTime( Math.max( 20, f1 ), t + dur );
		const g = ctx.createGain();
		g.gain.setValueAtTime( 0.0001, t );
		g.gain.exponentialRampToValueAtTime( gain, t + Math.min( 0.03, dur * 0.3 ) );
		g.gain.exponentialRampToValueAtTime( 0.0001, t + dur );
		if ( vibrato ) {

			const l = ctx.createOscillator();
			l.frequency.value = 5.5;
			const lg = ctx.createGain();
			lg.gain.value = vibrato;
			l.connect( lg ).connect( o.frequency );
			l.start( t );
			l.stop( t + dur );

		}

		o.connect( g ).connect( dest );
		o.start( t );
		o.stop( t + dur + 0.05 );

	}

	birdSong( pos ) {

		if ( ! this.enabled ) return;
		const ctx = this.ctx;
		const dest = this._panner( pos );
		let t = ctx.currentTime + 0.05;
		const kind = Math.floor( Math.random() * 4 );
		if ( kind === 0 ) {

			// robin-like liquid warble
			const n = 5 + Math.floor( Math.random() * 6 );
			for ( let i = 0; i < n; i ++ ) {

				const f = 2200 + Math.random() * 2200;
				this._tone( dest, t, 0.09 + Math.random() * 0.1, f, f * ( 0.7 + Math.random() * 0.5 ), 0.12 );
				t += 0.12 + Math.random() * 0.12;

			}

		} else if ( kind === 1 ) {

			// tit: "tea-cher tea-cher"
			for ( let i = 0; i < 3; i ++ ) {

				this._tone( dest, t, 0.12, 5200, 4600, 0.1 );
				this._tone( dest, t + 0.16, 0.12, 3800, 3500, 0.1 );
				t += 0.38;

			}

		} else if ( kind === 2 ) {

			// descending trill (chaffinch-like)
			for ( let i = 0; i < 12; i ++ ) {

				const f = 5200 - i * 180;
				this._tone( dest, t, 0.05, f, f * 0.85, 0.08 );
				t += 0.06;

			}

			this._tone( dest, t + 0.05, 0.25, 3600, 2400, 0.1 );

		} else {

			// thin high contact calls
			for ( let i = 0; i < 2; i ++ ) {

				this._tone( dest, t, 0.07, 7200, 6400, 0.05 );
				t += 0.25;

			}

		}

	}

	loon( pos ) {

		if ( ! this.enabled ) return;
		const ctx = this.ctx;
		const dest = this._panner( pos );
		const t = ctx.currentTime + 0.05;
		// the tremolo wail: rising, holding, falling, with a quavering vibrato
		const o = ctx.createOscillator();
		o.type = 'sine';
		o.frequency.setValueAtTime( 520, t );
		o.frequency.linearRampToValueAtTime( 820, t + 0.9 );
		o.frequency.setValueAtTime( 820, t + 2.2 );
		o.frequency.linearRampToValueAtTime( 740, t + 3.1 );
		const h = ctx.createOscillator();
		h.type = 'triangle';
		h.frequency.setValueAtTime( 1040, t );
		h.frequency.linearRampToValueAtTime( 1640, t + 0.9 );
		h.frequency.setValueAtTime( 1640, t + 2.2 );
		h.frequency.linearRampToValueAtTime( 1480, t + 3.1 );
		const lfo = ctx.createOscillator();
		lfo.frequency.value = 6;
		const lg = ctx.createGain();
		lg.gain.value = 9;
		lfo.connect( lg ).connect( o.frequency );
		const g = ctx.createGain();
		g.gain.setValueAtTime( 0.0001, t );
		g.gain.exponentialRampToValueAtTime( 0.22, t + 0.4 );
		g.gain.setValueAtTime( 0.2, t + 2.6 );
		g.gain.exponentialRampToValueAtTime( 0.0001, t + 3.3 );
		const hg = ctx.createGain();
		hg.gain.value = 0.12;
		o.connect( g );
		h.connect( hg ).connect( g );
		g.connect( dest );
		const wet = ctx.createGain();
		wet.gain.value = 0.9;
		g.connect( wet ).connect( this.reverbSend );
		for ( const n of [ o, h, lfo ] ) {

			n.start( t );
			n.stop( t + 3.4 );

		}

	}

	owl( pos ) {

		if ( ! this.enabled ) return;
		const dest = this._panner( pos );
		let t = this.ctx.currentTime + 0.05;
		for ( const [ dur, gap ] of [ [ 0.45, 0.35 ], [ 0.18, 0.12 ], [ 0.5, 0 ] ] ) {

			this._tone( dest, t, dur, 400, 360, 0.25, 'sine', 4 );
			t += dur + gap;

		}

	}

	honk( pos, count ) {

		if ( ! this.enabled ) return;
		const ctx = this.ctx;
		const dest = this._panner( pos );
		const n = 1 + Math.floor( Math.random() * Math.min( 3, count / 3 ) );
		for ( let i = 0; i < n; i ++ ) {

			const t = ctx.currentTime + 0.05 + i * ( 0.15 + Math.random() * 0.2 );
			const f = ctx.createBiquadFilter();
			f.type = 'bandpass';
			f.frequency.value = 900 + Math.random() * 300;
			f.Q.value = 3;
			f.connect( dest );
			this._tone( f, t, 0.18, 360 + Math.random() * 60, 300, 0.6, 'sawtooth' );

		}

	}

	splash( pos, size = 1 ) {

		if ( ! this.enabled ) return;
		const ctx = this.ctx;
		const dest = this._panner( pos );
		const t = ctx.currentTime + 0.02;
		const src = ctx.createBufferSource();
		src.buffer = this.noise;
		const f = ctx.createBiquadFilter();
		f.type = 'bandpass';
		f.Q.value = 1.2;
		f.frequency.setValueAtTime( 1800, t );
		f.frequency.exponentialRampToValueAtTime( 350, t + 0.35 );
		const g = ctx.createGain();
		g.gain.setValueAtTime( 0.0001, t );
		g.gain.exponentialRampToValueAtTime( 0.9 * size, t + 0.01 );
		g.gain.exponentialRampToValueAtTime( 0.0001, t + 0.45 );
		src.connect( f ).connect( g ).connect( dest );
		src.start( t, Math.random() * 2 );
		src.stop( t + 0.5 );
		// the hollow "plonk" of an air cavity closing
		this._tone( dest, t + 0.04, 0.14, 520 / Math.sqrt( size ), 180, 0.35 * size );

	}

	// Thunder arrives after the flash at the speed of sound: a crack, then a long rumble.
	thunder( pos, dist ) {

		if ( ! this.enabled ) return;
		const ctx = this.ctx;
		const delay = Math.min( dist / 343, 12 );
		const t = ctx.currentTime + delay;
		const near = Math.max( 0, 1 - dist / 4500 );
		const dest = ctx.createGain();
		dest.gain.value = 1;
		dest.connect( this.master );
		const wet = ctx.createGain();
		wet.gain.value = 0.9;
		dest.connect( wet ).connect( this.reverbSend );
		const src = ctx.createBufferSource();
		src.buffer = this.noise;
		src.playbackRate.value = 0.45;
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.setValueAtTime( 900 * ( 0.4 + near ), t );
		lp.frequency.exponentialRampToValueAtTime( 90, t + 5 );
		const g = ctx.createGain();
		const dur = 5 + Math.random() * 3;
		g.gain.setValueAtTime( 0.0001, t );
		g.gain.exponentialRampToValueAtTime( 1.4 * ( 0.35 + near ), t + 0.08 + ( 1 - near ) * 0.5 );
		// rolling, lumpy decay
		for ( let k = 1; k < 7; k ++ ) g.gain.exponentialRampToValueAtTime( ( 0.3 + Math.random() * 0.8 ) * ( 1 - k / 7 ) * ( 0.35 + near ) + 0.001, t + k * dur / 7 );
		g.gain.exponentialRampToValueAtTime( 0.0001, t + dur );
		src.connect( lp ).connect( g ).connect( dest );
		src.start( t, Math.random() * 2 );
		src.stop( t + dur + 0.1 );
		void pos;

	}

	// ---- per-frame ----
	update( dt, camera, env ) {

		if ( ! this.enabled ) return;
		const ctx = this.ctx;
		const now = ctx.currentTime;
		const L = ctx.listener;
		camera.getWorldDirection( this._fwd );
		this._up.set( 0, 1, 0 ).applyQuaternion( camera.quaternion );
		const p = camera.position;
		if ( L.positionX ) {

			L.positionX.setTargetAtTime( p.x, now, 0.05 );
			L.positionY.setTargetAtTime( p.y, now, 0.05 );
			L.positionZ.setTargetAtTime( p.z, now, 0.05 );
			L.forwardX.setTargetAtTime( this._fwd.x, now, 0.05 );
			L.forwardY.setTargetAtTime( this._fwd.y, now, 0.05 );
			L.forwardZ.setTargetAtTime( this._fwd.z, now, 0.05 );
			L.upX.setTargetAtTime( this._up.x, now, 0.05 );
			L.upY.setTargetAtTime( this._up.y, now, 0.05 );
			L.upZ.setTargetAtTime( this._up.z, now, 0.05 );

		} else {

			L.setPosition( p.x, p.y, p.z );
			L.setOrientation( this._fwd.x, this._fwd.y, this._fwd.z, this._up.x, this._up.y, this._up.z );

		}

		const { gust, wind, forest, shore, altitude, night, dusk, rain = 0 } = env;
		const w = wind * ( 0.35 + 0.9 * gust ) * ( 1 + Math.min( altitude / 300, 1.5 ) );
		this.wind.g.gain.setTargetAtTime( 0.16 * w, now, 0.3 );
		this.wind.f.frequency.setTargetAtTime( 300 + 500 * gust, now, 0.4 );
		this.windHi.g.gain.setTargetAtTime( 0.03 * w * gust, now, 0.3 );
		this.rustle.g.gain.setTargetAtTime( 0.05 * forest * wind * ( 0.3 + gust ), now, 0.25 );
		const lapEnv = 0.5 + 0.5 * Math.sin( now * 1.3 + Math.sin( now * 0.37 ) * 3 );
		this.lap.g.gain.setTargetAtTime( 0.22 * shore * ( 0.35 + 0.65 * lapEnv * lapEnv ), now, 0.12 );
		this.lapHi.g.gain.setTargetAtTime( 0.02 * shore * lapEnv * lapEnv * lapEnv, now, 0.1 );
		this.rainHiss.g.gain.setTargetAtTime( 0.11 * rain * ( 0.8 + 0.2 * gust ), now, 0.5 );
		this.rainRoar.g.gain.setTargetAtTime( 0.14 * rain * rain, now, 0.6 );

		// songbirds by day, loons at dusk, owls at night
		this._birdTimer -= dt;
		if ( this._birdTimer <= 0 ) {

			this._birdTimer = 1.5 + Math.random() * 5;
			if ( night < 0.3 && rain < 0.3 && ( forest > 0.05 || Math.random() < 0.3 ) ) {

				const a = Math.random() * Math.PI * 2, d = 25 + Math.random() * 90;
				this.birdSong( new THREE.Vector3( p.x + Math.cos( a ) * d, p.y + 6 + Math.random() * 10, p.z + Math.sin( a ) * d ) );

			}

		}

		this._loonTimer -= dt;
		if ( this._loonTimer <= 0 ) {

			this._loonTimer = 25 + Math.random() * 45;
			if ( dusk > 0.2 || night > 0.3 ) this.loon( new THREE.Vector3( Math.random() * 400 - 200, 1, - 300 - Math.random() * 600 ) );

		}

		this._owlTimer -= dt;
		if ( this._owlTimer <= 0 ) {

			this._owlTimer = 20 + Math.random() * 40;
			if ( night > 0.6 ) {

				const a = Math.random() * Math.PI * 2;
				this.owl( new THREE.Vector3( p.x + Math.cos( a ) * 120, p.y + 15, p.z + Math.sin( a ) * 120 ) );

			}

		}

	}

}
