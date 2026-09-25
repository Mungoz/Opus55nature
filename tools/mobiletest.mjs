// Emulates a phone (touch, landscape) against the dev server and exercises the touch controls.
// usage: node tools/mobiletest.mjs <outDir> [url]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[ 2 ] || 'tools/out';
const url = process.argv[ 3 ] || 'http://localhost:5199/?quality=medium';
fs.mkdirSync( outDir, { recursive: true } );
const browser = await puppeteer.launch( {
	executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
	headless: true,
	args: [ '--ignore-gpu-blocklist' ],
} );
const page = await browser.newPage();
await page.setUserAgent( 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' );
await page.setViewport( { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true } );
const logs = [];
page.on( 'console', ( m ) => logs.push( `[${m.type()}] ${m.text()}` ) );
page.on( 'pageerror', ( e ) => logs.push( `[pageerror] ${e.message}` ) );
await page.goto( url, { waitUntil: 'load' } );
await page.waitForFunction( () => document.body.classList.contains( 'ready' ) || window.__shotError, { timeout: 180000 } );
await page.tap( '#enter' );
await new Promise( ( r ) => setTimeout( r, 2500 ) );
await page.screenshot( { path: path.join( outDir, 'm-1-entered.png' ) } );
const start = await page.evaluate( () => window.app.camera.position.toArray() );
// drag the left stick forward for 2 s
const cdp = await page.createCDPSession();
const touch = ( type, pts ) => cdp.send( 'Input.dispatchTouchEvent', { type, touchPoints: pts } );
await touch( 'touchStart', [ { x: 120, y: 300, id: 1 } ] );
for ( let i = 0; i < 10; i ++ ) {

	await touch( 'touchMove', [ { x: 120, y: 300 - i * 6, id: 1 } ] );
	await new Promise( ( r ) => setTimeout( r, 30 ) );

}

await page.screenshot( { path: path.join( outDir, 'm-2-stick.png' ) } );
await new Promise( ( r ) => setTimeout( r, 1800 ) );
await touch( 'touchEnd', [] );
const moved = await page.evaluate( () => window.app.camera.position.toArray() );
// swipe on the right to look
await touch( 'touchStart', [ { x: 650, y: 200, id: 2 } ] );
for ( let i = 0; i < 10; i ++ ) {

	await touch( 'touchMove', [ { x: 650 - i * 12, y: 200, id: 2 } ] );
	await new Promise( ( r ) => setTimeout( r, 20 ) );

}

await touch( 'touchEnd', [] );
await new Promise( ( r ) => setTimeout( r, 600 ) );
const yaw = await page.evaluate( () => window.app.controls.yaw );
// tap the rain button in the weather bar
await page.tap( '#weatherbar [data-w="rain"]' );
await new Promise( ( r ) => setTimeout( r, 4000 ) );
await page.screenshot( { path: path.join( outDir, 'm-3-rain.png' ) } );
console.log( 'start', start.map( Math.round ), 'after stick', moved.map( Math.round ), 'yaw', yaw.toFixed( 2 ) );
console.log( 'weather', await page.evaluate( () => window.app.weather.name ) );
console.log( logs.filter( ( l ) => ! l.includes( 'X3595' ) && ! l.includes( 'vite' ) ).slice( 0, 20 ).join( '\n' ) );
await browser.close();
