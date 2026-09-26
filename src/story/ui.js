import './story.css';
import { fmtTime } from './time.js';

const STORE = 'larchmere.horror.settings.v1';

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

	} catch ( e ) { /* storage unavailable */ }

}

const el = ( tag, attrs = {}, parent = null ) => {

	const e = document.createElement( tag );
	for ( const [ k, v ] of Object.entries( attrs ) ) {

		if ( k === 'text' ) e.textContent = v;
		else if ( k === 'html' ) e.innerHTML = v;
		else e.setAttribute( k, v );

	}

	if ( parent ) parent.appendChild( e );
	return e;

};

// The horror edition's interface: fades, captions, the reading page, the pause menu.
export function initStoryUI( app ) {

	const S = app.story;
	document.body.classList.add( 'horror' );
	const settings = { volume: 0.85, sens: 1, invert: false, captions: true, ...load() };
	const persist = () => save( { ...settings, quality: app.presetName } );
	if ( settings.quality && settings.quality !== app.presetName ) app.setQuality( settings.quality );

	const root = el( 'div', { id: 'story-ui' }, document.body );
	const fadeEl = el( 'div', { id: 'story-fade' }, root );
	const card = el( 'div', { id: 'story-card' }, root );
	const caption = el( 'div', { id: 'story-caption' }, root );
	const prompt = el( 'div', { id: 'story-prompt' }, root );
	el( 'i', {}, prompt );
	const promptLabel = el( 'span', {}, prompt );
	const page = el( 'div', { id: 'story-page' }, root );
	const menu = el( 'div', { id: 'story-menu' }, root );
	const debug = S.debug ? el( 'div', { id: 'story-debug' }, root ) : null;

	// ---------- pause menu ----------
	const touch = window.matchMedia?.( '(pointer: coarse)' ).matches;
	menu.innerHTML = `<div class="box">
		<h2>Larchmere</h2>
		<label class="row"><span>Volume</span><input type="range" min="0" max="1" step="0.01" data-k="volume" /></label>
		<label class="row"><span>Look sensitivity</span><input type="range" min="0.3" max="2.5" step="0.05" data-k="sens" /></label>
		<label class="row"><span>Invert vertical look</span><input type="checkbox" data-k="invert" /></label>
		<label class="row"><span>Captions</span><input type="checkbox" data-k="captions" /></label>
		<div class="row"><span>Quality</span><div class="chips">${[ 'low', 'medium', 'high', 'ultra' ].map( ( q ) => `<button data-q="${q}">${q[ 0 ].toUpperCase() + q.slice( 1 )}</button>` ).join( '' )}</div></div>
		<button class="btn" data-act="fullscreen">Fullscreen</button>
		<button class="btn main" data-act="resume">Continue</button>
		<div class="keys">${touch ? 'Left thumb to walk · right thumb to look · tap to read' : 'Mouse to look · W A S D to walk · Shift to hurry · E to read · click the water to skim a stone'}</div>
	</div>`;
	for ( const inp of menu.querySelectorAll( 'input[type=range]' ) ) {

		inp.value = settings[ inp.dataset.k ];
		inp.addEventListener( 'input', () => { settings[ inp.dataset.k ] = parseFloat( inp.value ); apply(); persist(); } );

	}

	for ( const inp of menu.querySelectorAll( 'input[type=checkbox]' ) ) {

		inp.checked = settings[ inp.dataset.k ];
		inp.addEventListener( 'change', () => { settings[ inp.dataset.k ] = inp.checked; apply(); persist(); } );

	}

	const markQ = () => { for ( const b of menu.querySelectorAll( '[data-q]' ) ) b.classList.toggle( 'on', b.dataset.q === app.presetName ); };
	for ( const b of menu.querySelectorAll( '[data-q]' ) ) b.addEventListener( 'click', () => { app.setQuality( b.dataset.q ); markQ(); persist(); } );
	markQ();
	const apply = () => {

		if ( ! app.audio._muted ) app.audio.setVolume( settings.volume );
		app.controls.sensitivity = settings.sens;
		app.controls.invertY = settings.invert;
		if ( ! settings.captions ) caption.classList.remove( 'show' );

	};

	apply();

	let paused = false;
	const setPaused = ( p ) => {

		paused = p;
		menu.classList.toggle( 'show', p );
		app.paused = p;
		if ( p ) app.audio.ctx?.suspend?.();
		else app.audio.ctx?.resume?.();

	};

	const lock = () => {

		if ( touch ) return;
		app.canvas.requestPointerLock?.()?.catch?.( () => {} );

	};

	menu.querySelector( '[data-act="resume"]' ).addEventListener( 'click', () => { setPaused( false ); lock(); } );
	menu.querySelector( '[data-act="fullscreen"]' ).addEventListener( 'click', () => {

		const d = document;
		if ( d.fullscreenElement || d.webkitFullscreenElement ) ( d.exitFullscreen || d.webkitExitFullscreen ).call( d );
		else ( d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen )?.call( d.documentElement );

	} );
	document.addEventListener( 'pointerlockchange', () => {

		const locked = document.pointerLockElement === app.canvas;
		document.body.classList.toggle( 'locked', locked );
		// losing the lock (Esc) pauses the walk, once it has begun
		if ( ! locked && S.begun && ! S.ended && ! page.classList.contains( 'show' ) ) setPaused( true );

	} );
	// a click on the scene takes the mouse (and, once it has it, reads or skims a stone)
	app.canvas.addEventListener( 'pointerdown', ( e ) => {

		if ( e.pointerType === 'touch' || document.pointerLockElement === app.canvas || ! S.begun ) return;
		if ( ! paused ) lock();

	} );
	app.controls.onClick = ( e ) => {

		if ( paused || ! S.begun ) return;
		if ( S.reading ) return api.closeReading();
		if ( S.focus && S.input ) return S.use();
		if ( document.pointerLockElement === app.canvas || e.pointerType === undefined ) app.throwStone( e );

	};

	window.addEventListener( 'keydown', ( e ) => {

		if ( e.repeat ) return;
		if ( e.code === 'KeyE' || e.code === 'Enter' && S.begun ) {

			if ( S.begun && ! paused ) S.use();

		} else if ( e.code === 'Escape' ) {

			if ( S.reading ) api.closeReading();
			else if ( touch && S.begun ) setPaused( ! paused );

		} else if ( e.code === 'KeyM' ) {

			app.audio._muted = ! app.audio._muted;
			app.audio.setVolume( app.audio._muted ? 0 : settings.volume );

		} else if ( e.code === 'KeyF' ) menu.querySelector( '[data-act="fullscreen"]' ).click();

	} );
	// E is "read" here, never "rise"
	app.controls.keys.delete( 'KeyE' );

	// ---------- the API the story drives ----------
	let capTimer = 0;
	const api = {
		settings,
		lock,
		get paused() { return paused; },
		fade( to, seconds = 1.5 ) {

			fadeEl.style.transition = `opacity ${seconds}s ease`;
			fadeEl.style.opacity = to;
			return S.wait( seconds );

		},
		card( title, sub = '', seconds = 5 ) {

			card.innerHTML = `${title ? `<h1>${title}</h1>` : ''}${sub ? `<p>${sub}</p>` : ''}`;
			card.classList.add( 'show' );
			return S.wait( seconds ).then( () => { card.classList.remove( 'show' ); return S.wait( 2.2 ); } );

		},
		// a caption for a sound: [ a cowbell, somewhere above ]
		caption( text, seconds = 4 ) {

			if ( ! settings.captions ) return;
			caption.textContent = text;
			caption.classList.add( 'show' );
			capTimer = seconds;

		},
		// pages: [ { head, entries: [ { text, hand, faint, scrawl } ] } ]
		read( doc, onClose ) {

			S.reading = { doc, index: 0, onClose };
			S.input = false;
			api._page();
			page.classList.add( 'show' );
			app.audio.paper?.();

		},
		_page() {

			const { doc, index } = S.reading;
			const p = doc.pages[ index ];
			const more = index < doc.pages.length - 1;
			page.innerHTML = `<div class="paper"><div class="head">${p.head || doc.title || ''}</div>${p.entries.map( ( e ) => `<p class="entry ${e.hand || 'hand1'} ${e.faint ? 'faint' : ''} ${e.scrawl ? 'scrawl' : ''}">${e.text}</p>` ).join( '' )}<div class="foot">${more ? ( touch ? 'tap to turn the page' : 'E · turn the page' ) : ( touch ? 'tap to put it back' : 'E · put it back' )}</div></div>`;

		},
		closeReading() {

			const r = S.reading;
			if ( ! r ) return;
			if ( r.index < r.doc.pages.length - 1 ) {

				r.index ++;
				api._page();
				app.audio.paper?.();
				return;

			}

			page.classList.remove( 'show' );
			S.reading = null;
			S.input = true;
			r.onClose?.();

		},
		update( dt ) {

			if ( capTimer > 0 && ( capTimer -= dt ) <= 0 ) caption.classList.remove( 'show' );
			const f = S.focus;
			prompt.classList.toggle( 'show', !! f && S.input && ! paused );
			if ( f ) promptLabel.textContent = touch ? '' : ( f.prompt || 'read' );
			if ( debug ) debug.textContent = `${fmtTime( app.hours )}  d ${S.progress.toFixed( 0 )}/${S.path.length.toFixed( 0 )}  off ${( S.near?.dist ?? 0 ).toFixed( 1 )}  t ${S.time.toFixed( 0 )}s\n${S.log.slice( - 4 ).map( ( l ) => l.join( ' ' ) ).join( '\n' )}\n${app.camera.position.toArray().map( ( v ) => v.toFixed( 1 ) ).join( ', ' )}  fps ${Math.round( 1000 / app._ftAvg )}`;

		},
	};

	S.ui = api;
	return api;

}
