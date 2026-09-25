import { U } from './core/uniforms.js';
import { START_POSE } from './app.js';

const STORE = 'larchmere.settings.v1';

function load() {

	try {

		return JSON.parse( localStorage.getItem( STORE ) ) || {};

	} catch ( e ) {

		return {};

	}

}

function save( s ) {

	try {

		localStorage.setItem( STORE, JSON.stringify( s ) );

	} catch ( e ) { /* storage unavailable: settings simply won't persist */ }

}

export function fmtTime( h ) {

	const hh = Math.floor( h ), mm = Math.floor( ( h - hh ) * 60 );
	return `${String( hh ).padStart( 2, '0' )}:${String( mm ).padStart( 2, '0' )}`;

}

export function initUI( app ) {

	const $ = ( s ) => document.querySelector( s );
	const settings = { clouds: 0.34, wind: 1, volume: 0.8, sens: 1, aurora: true, invert: false, autores: true, dynweather: false, weather: 'clear', speed: app.timeSpeed, ...load() };
	const persist = () => save( { ...settings, quality: app.presetName } );

	// ---------- toast ----------
	let toastTimer = 0;
	const toast = ( msg ) => {

		const el = $( '#toast' );
		el.textContent = msg;
		el.classList.add( 'show' );
		clearTimeout( toastTimer );
		toastTimer = setTimeout( () => el.classList.remove( 'show' ), 2200 );

	};

	app.onToast = toast;

	// ---------- panels ----------
	const panels = { time: $( '#panel-time' ), settings: $( '#panel-settings' ), help: $( '#panel-help' ) };
	const toggle = ( name ) => {

		for ( const [ k, p ] of Object.entries( panels ) ) p.hidden = k === name ? ! p.hidden : true;
		for ( const b of document.querySelectorAll( '#toolbar button' ) ) if ( panels[ b.dataset.act ] ) b.classList.toggle( 'on', ! panels[ b.dataset.act ].hidden );

	};

	const closePanels = () => toggle( null );
	app.canvas.addEventListener( 'pointerdown', closePanels );

	// ---------- actions ----------
	const btn = ( act ) => document.querySelector( `#toolbar [data-act="${act}"]` );
	const actions = {
		time: () => toggle( 'time' ),
		settings: () => toggle( 'settings' ),
		help: () => toggle( 'help' ),
		tour: () => {

			if ( app.tour.active ) {

				app.tour.stop();
				// hand control back without a jump
				const e = app.camera.rotation.clone().reorder( 'YXZ' );
				app.controls.yaw = app.controls.targetYaw = e.y;
				app.controls.pitch = app.controls.targetPitch = e.x;
				app.controls.velocity.set( 0, 0, 0 );
				toast( 'Tour ended' );

			} else {

				app.tour.start();
				toast( 'Cinematic tour · press T to take the reins' );

			}

			btn( 'tour' ).classList.toggle( 'on', app.tour.active );

		},
		walk: () => {

			app.controls.walk = ! app.controls.walk;
			btn( 'walk' ).classList.toggle( 'on', app.controls.walk );
			toast( app.controls.walk ? 'Walking' : 'Flying' );

		},
		sound: () => {

			app.audio.start();
			const muted = app.audio.volume > 0 && ! app.audio._muted;
			app.audio._muted = muted;
			app.audio.setVolume( muted ? 0 : settings.volume );
			btn( 'sound' ).classList.toggle( 'muted', muted );
			toast( muted ? 'Sound off' : 'Sound on' );

		},
		fullscreen: () => {

			const d = document;
			if ( d.fullscreenElement || d.webkitFullscreenElement ) ( d.exitFullscreen || d.webkitExitFullscreen ).call( d );
			else {

				const el = d.documentElement;
				( el.requestFullscreen || el.webkitRequestFullscreen )?.call( el );

			}

		},
	};

	for ( const b of document.querySelectorAll( '#toolbar button' ) ) b.addEventListener( 'click', ( e ) => {

		e.stopPropagation();
		actions[ b.dataset.act ]?.();

	} );

	// ---------- time ----------
	const slider = $( '#time-slider' );
	const out = $( '#time-out' );
	let dragging = false;
	slider.addEventListener( 'input', () => {

		dragging = true;
		app.hours = parseFloat( slider.value );

	} );
	slider.addEventListener( 'change', () => ( dragging = false ) );
	for ( const b of document.querySelectorAll( '#time-presets button' ) ) b.addEventListener( 'click', () => {

		app.hours = parseFloat( b.dataset.t );
		toast( b.textContent );

	} );
	const speedBtns = document.querySelectorAll( '#time-speed button' );
	const setSpeed = ( s ) => {

		app.timeSpeed = s;
		settings.speed = s;
		for ( const b of speedBtns ) b.classList.toggle( 'on', parseFloat( b.dataset.s ) === s );
		persist();

	};

	for ( const b of speedBtns ) b.addEventListener( 'click', () => setSpeed( parseFloat( b.dataset.s ) ) );
	setSpeed( settings.speed );

	// ---------- weather ----------
	const wBtns = document.querySelectorAll( '#weather button' );
	const markWeather = () => {

		for ( const b of wBtns ) b.classList.toggle( 'on', b.dataset.w === app.weather.name );

	};

	for ( const b of wBtns ) b.addEventListener( 'click', () => {

		app.setWeather( b.dataset.w );
		settings.weather = b.dataset.w;
		markWeather();
		persist();
		toast( b.textContent );

	} );
	markWeather();
	setInterval( markWeather, 2000 );

	// ---------- settings ----------
	const qBtns = document.querySelectorAll( '#quality button' );
	const markQuality = () => {

		for ( const b of qBtns ) b.classList.toggle( 'on', b.dataset.q === app.presetName );

	};

	for ( const b of qBtns ) b.addEventListener( 'click', () => {

		app.setQuality( b.dataset.q );
		markQuality();
		persist();
		toast( `Quality · ${b.textContent}` );

	} );
	markQuality();

	const bindRange = ( id, key, apply ) => {

		const el = $( '#' + id );
		el.value = settings[ key ];
		apply( settings[ key ] );
		el.addEventListener( 'input', () => {

			settings[ key ] = parseFloat( el.value );
			apply( settings[ key ] );
			persist();

		} );

	};

	const bindCheck = ( id, key, apply ) => {

		const el = $( '#' + id );
		el.checked = settings[ key ];
		apply( settings[ key ] );
		el.addEventListener( 'change', () => {

			settings[ key ] = el.checked;
			apply( el.checked );
			persist();

		} );

	};

	bindRange( 'clouds', 'clouds', ( v ) => app.setClouds( v ) );
	bindRange( 'wind', 'wind', ( v ) => app.setWind( v ) );
	bindRange( 'volume', 'volume', ( v ) => {

		if ( ! app.audio._muted ) app.audio.setVolume( v );

	} );
	bindRange( 'sens', 'sens', ( v ) => ( app.controls.sensitivity = v ) );
	bindCheck( 'aurora', 'aurora', ( v ) => ( app.sky.auroraEnabled = v ) );
	bindCheck( 'dynweather', 'dynweather', ( v ) => ( app.weather.dynamic = v ) );
	bindCheck( 'invert', 'invert', ( v ) => ( app.controls.invertY = v ) );
	bindCheck( 'autores', 'autores', ( v ) => {

		app.autoResolution = v;
		if ( ! v && app.renderScale !== 1 ) {

			app.renderScale = 1;
			app.resize();

		}

	} );
	for ( const el of document.querySelectorAll( '.panel' ) ) el.addEventListener( 'pointerdown', ( e ) => e.stopPropagation() );

	// ---------- keyboard ----------
	window.addEventListener( 'keydown', ( e ) => {

		if ( e.target && ( e.target.tagName === 'INPUT' ) && e.target.type !== 'range' && e.target.type !== 'checkbox' ) return;
		if ( e.repeat ) return;
		switch ( e.code ) {

			case 'KeyT': actions.tour(); break;
			case 'KeyG': actions.walk(); break;
			case 'KeyM': actions.sound(); break;
			case 'KeyF': actions.fullscreen(); break;
			case 'KeyH': toggle( 'help' ); break;
			case 'KeyP': document.body.classList.toggle( 'photo' ); break;
			case 'KeyL': app.canvas.requestPointerLock?.(); break;
			case 'KeyR':
				app.tour.stop();
				app.controls.setPose( ...START_POSE );
				toast( 'Back to the meadow' );
				break;
			case 'Escape': closePanels(); break;

		}

	} );

	// hold [ or ] to scrub time
	const held = new Set();
	window.addEventListener( 'keydown', ( e ) => {

		if ( e.code === 'BracketLeft' || e.code === 'BracketRight' ) held.add( e.code );

	} );
	window.addEventListener( 'keyup', ( e ) => held.delete( e.code ) );

	// ---------- hint fades once people start moving ----------
	let hintGone = false;
	const hideHint = () => {

		if ( hintGone ) return;
		hintGone = true;
		setTimeout( () => $( '#hint' ).classList.add( 'gone' ), 6000 );

	};

	window.addEventListener( 'keydown', hideHint, { once: true } );
	app.canvas.addEventListener( 'pointerdown', hideHint, { once: true } );

	// ---------- per-frame ----------
	let lastClock = '';
	return {
		update( dt ) {

			if ( held.has( 'BracketLeft' ) ) app.hours = ( app.hours - dt * 1.2 + 24 ) % 24;
			if ( held.has( 'BracketRight' ) ) app.hours = ( app.hours + dt * 1.2 ) % 24;
			const c = fmtTime( app.hours );
			if ( c !== lastClock ) {

				lastClock = c;
				$( '#clock' ).textContent = c;
				out.textContent = c;

			}

			if ( ! dragging && ! panels.time.hidden ) slider.value = app.hours;

		},
		settings,
		restore() {

			void U;

		},
	};

}
