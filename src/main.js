import './style.css';
import { App } from './app.js';
import { initUI } from './ui.js';
import { Film } from './film.js';

const params = new URLSearchParams( location.search );
const num = ( k, d ) => ( params.has( k ) ? parseFloat( params.get( k ) ) : d );
const filmMode = params.has( 'film' );
const shotMode = params.has( 'shot' ) || filmMode;
if ( shotMode ) document.body.classList.add( 'shot' );

let stored = {};
try {

	stored = JSON.parse( localStorage.getItem( 'larchmere.settings.v1' ) ) || {};

} catch ( e ) { /* private mode */ }

const options = {
	preset: params.get( 'quality' ) || ( shotMode ? undefined : stored.quality ) || undefined,
	hours: params.has( 't' ) ? num( 't' ) : undefined,
	timeSpeed: params.has( 'speed' ) ? num( 'speed' ) : ( shotMode ? undefined : stored.speed ),
	cam: params.has( 'cam' ) ? params.get( 'cam' ).split( ',' ).map( Number ) : undefined,
	showcase: params.has( 'showcase' ),
	weather: params.get( 'weather' ) || ( shotMode ? undefined : stored.weather ),
	shot: shotMode,
	hide: params.get( 'hide' ) || '',
	follow: params.get( 'follow' ) || '',
	angle: params.has( 'angle' ) ? num( 'angle' ) * Math.PI / 180 : 0,
};

const bar = document.getElementById( 'load-bar' );
const label = document.getElementById( 'load-label' );
const enterBtn = document.getElementById( 'enter' );

function fail( msg ) {

	if ( label ) label.textContent = msg;
	window.__shotError = msg;

}

let app;
try {

	app = new App( document.getElementById( 'scene' ), options );
	window.app = app;

} catch ( e ) {

	console.error( e );
	fail( 'Your browser could not start WebGL 2. Try a recent Chrome, Edge or Firefox with hardware acceleration enabled.' );

}

if ( app ) app.load( ( f, text ) => {

	if ( bar ) bar.style.transform = `scaleX(${f})`;
	if ( label && text ) label.textContent = text;

} ).then( () => {

	if ( filmMode ) {

		// the recorder drives frames itself
		document.body.classList.add( 'entered' );
		window.film = new Film( app );
		window.renderTrailerAudio = async () => ( await import( './trailerAudio.js' ) ).renderTrailerAudio( window.film.shots.map( ( s ) => s.dur ) );
		window.__filmReady = true;
		return;

	}

	const ui = shotMode ? null : initUI( app );
	let last = performance.now();
	let shotFrames = 0;
	const loop = ( now ) => {

		const dt = Math.min( ( now - last ) / 1000, 0.1 );
		last = now;
		app.realDt = dt;
		app.update( shotMode ? 1 / 60 : dt );
		ui?.update( dt );
		app.render();
		if ( shotMode && ++ shotFrames === ( parseInt( params.get( 'shot' ) ) || 30 ) ) window.__shotReady = true;
		requestAnimationFrame( loop );

	};

	requestAnimationFrame( loop );

	if ( shotMode ) {

		document.body.classList.add( 'entered' );
		return;

	}

	document.body.classList.add( 'ready' );
	const enter = () => {

		if ( document.body.classList.contains( 'entered' ) ) return;
		document.body.classList.add( 'entered' );
		app.audio.start();
		app.audio.setVolume( ui.settings.volume );
		app.canvas.focus();

	};

	enterBtn.addEventListener( 'click', enter );
	window.addEventListener( 'keydown', ( e ) => {

		if ( e.code === 'Enter' ) enter();

	} );
	enterBtn.focus();

} ).catch( ( e ) => {

	console.error( e );
	fail( 'Something went wrong while building the valley: ' + e.message );

} );
