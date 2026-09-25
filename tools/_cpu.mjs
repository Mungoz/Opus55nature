// Dev helper: CPU time per frame (update and render submission), with the biggest update costs.
// usage: node tools/_cpu.mjs "<query>" [mobile] [throttle]
import puppeteer from 'puppeteer-core';

const [ query = 'shot=30&speed=1&t=15.5', mode, throttle = '1' ] = process.argv.slice( 2 );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
if ( mode === 'mobile' ) {

	await page.setUserAgent( 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' );
	await page.setViewport( { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true } );

} else await page.setViewport( { width: 1600, height: 900 } );

page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
await page.goto( 'http://localhost:5199/?' + query, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000 } );
const cdp = await page.createCDPSession();
await cdp.send( 'Emulation.setCPUThrottlingRate', { rate: + throttle } );
const res = await page.evaluate( async () => {

	// time each member's update() the app calls, by wrapping every object with an update method
	const parts = {};
	for ( const k of Object.keys( app ) ) {

		const o = app[ k ];
		if ( ! o || typeof o !== 'object' || typeof o.update !== 'function' || o === app ) continue;
		const f = o.update;
		o.update = function ( ...a ) {

			const t = performance.now();
			const out = f.apply( this, a );
			parts[ k ] = ( parts[ k ] || 0 ) + performance.now() - t;
			return out;

		};

	}

	const N = 90;
	let up = 0, rd = 0;
	for ( let i = 0; i < 10; i ++ ) { app.update( 1 / 60 ); app.render(); }
	for ( const k in parts ) parts[ k ] = 0;
	for ( let i = 0; i < N; i ++ ) {

		const t0 = performance.now();
		app.update( 1 / 60 );
		const t1 = performance.now();
		app.render();
		const t2 = performance.now();
		up += t1 - t0; rd += t2 - t1;
		await new Promise( ( r ) => requestAnimationFrame( r ) );

	}

	const top = Object.entries( parts ).map( ( [ k, v ] ) => [ k, +( v / N ).toFixed( 3 ) ] ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 14 );
	return { update: +( up / N ).toFixed( 2 ), render: +( rd / N ).toFixed( 2 ), calls: app.renderer.info.render.calls, top };

} );
console.log( JSON.stringify( res ) );
await browser.close();
