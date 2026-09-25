// Dev helper: renders shots with the simulation frozen and saves the raw pixels, so two builds
// can be compared exactly. usage: node tools/_grab.mjs <out.bin> "<query>" [mobile]
//   compare: node tools/_grab.mjs cmp a.bin b.bin
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [ out, query, mode ] = process.argv.slice( 2 );
if ( out === 'cmp' ) {

	const a = fs.readFileSync( query ), b = fs.readFileSync( mode );
	if ( a.length !== b.length ) throw new Error( 'size differs' );
	let n = 0, max = 0, sum = 0;
	for ( let i = 0; i < a.length; i ++ ) {

		const d = Math.abs( a[ i ] - b[ i ] );
		if ( d ) { n ++; sum += d; max = Math.max( max, d ); }

	}

	console.log( JSON.stringify( { differing: n, of: a.length, frac: +( n / a.length ).toFixed( 6 ), max, mean: n ? +( sum / n ).toFixed( 2 ) : 0 } ) );
	process.exit( 0 );

}

const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
if ( mode === 'mobile' ) {

	await page.setUserAgent( 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' );
	await page.setViewport( { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true } );

} else await page.setViewport( { width: 1280, height: 720 } );

page.on( 'console', ( m ) => { if ( /rror/.test( m.text() ) ) console.log( m.text().slice( 0, 400 ) ); } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
// the same random numbers every run, so two builds can be compared pixel for pixel
await page.evaluateOnNewDocument( () => {

	let a = 0x9e3779b9;
	Math.random = () => {

		a |= 0; a = a + 0x6D2B79F5 | 0;
		let t = Math.imul( a ^ a >>> 15, 1 | a );
		t = t + Math.imul( t ^ t >>> 7, 61 | t ) ^ t;
		return ( ( t ^ t >>> 14 ) >>> 0 ) / 4294967296;

	};
	// and stop the clock on exactly the ready frame (the loop keeps running after it)
	let ready = false;
	Object.defineProperty( window, '__shotReady', {
		configurable: true,
		get: () => ready,
		set: ( v ) => { ready = v; if ( v && window.app ) window.app.update = () => {}; },
	} );

} );
await page.goto( 'http://localhost:5199/?' + query, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true || window.__shotError', { timeout: 180000, polling: 250 } );
if ( process.env.GRAB_SETUP ) await page.evaluate( process.env.GRAB_SETUP );
const b64 = await page.evaluate( () => {

	// the scene before post (grain and eye adaptation change every frame), as 8-bit
	app.update = () => {};
	app.render(); app.render();
	const r = app.renderer, rt = app.post.sceneRT;
	const w = rt.width, h = rt.height;
	// the target is half float: read it as such (a Float32Array fails with INVALID_OPERATION
	// and leaves the buffer untouched), and fail loudly on any GL error
	const gl = r.getContext();
	gl.getError();
	const hf = new Uint16Array( w * h * 4 );
	r.readRenderTargetPixels( rt, 0, 0, w, h, hf );
	const err = gl.getError();
	if ( err ) throw new Error( 'readPixels GL error ' + err );
	const half = ( b ) => { const e = ( b >> 10 ) & 31, m = b & 1023, sg = b & 32768 ? - 1 : 1; return e === 0 ? sg * m * 2 ** - 24 : e === 31 ? NaN : sg * ( 1 + m / 1024 ) * 2 ** ( e - 15 ); };
	const px = new Uint8Array( w * h * 4 );
	let lit = 0;
	for ( let i = 0; i < hf.length; i ++ ) {
		const v = half( hf[ i ] );
		px[ i ] = Math.max( 0, Math.min( 255, Math.round( Math.pow( Math.max( v, 0 ) / ( 1 + v ), 1 / 2.2 ) * 255 ) ) );
		if ( px[ i ] > 2 ) lit ++;
	}
	if ( lit < hf.length * 0.1 ) throw new Error( 'the frame read back nearly black: ' + lit );
	let s = '';
	for ( let i = 0; i < px.length; i += 32768 ) s += String.fromCharCode.apply( null, px.subarray( i, i + 32768 ) );
	return btoa( s );

} );
fs.writeFileSync( out, Buffer.from( b64, 'base64' ) );
console.log( 'saved', out );
await browser.close();
