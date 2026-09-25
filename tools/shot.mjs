// Dev helper: renders the scene in headless Chrome (real GPU) and saves screenshots.
// usage: node tools/shot.mjs <outDir> name1 "query1" [name2 "query2" ...]
// env: SHOT_W, SHOT_H, SHOT_URL (default http://localhost:5199/)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const [ outDir, ...pairs ] = process.argv.slice( 2 );
const W = parseInt( process.env.SHOT_W || '1600' );
const H = parseInt( process.env.SHOT_H || '900' );
const base = process.env.SHOT_URL || 'http://localhost:5199/';
fs.mkdirSync( outDir, { recursive: true } );

const browser = await puppeteer.launch( {
	executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
	headless: true,
	args: [ '--ignore-gpu-blocklist', '--enable-gpu-rasterization', `--window-size=${W},${H}` ],
} );

for ( let i = 0; i < pairs.length; i += 2 ) {

	const name = pairs[ i ], query = pairs[ i + 1 ] || '';
	const page = await browser.newPage();
	await page.setViewport( { width: W, height: H, deviceScaleFactor: 1 } );
	const logs = [];
	page.on( 'console', ( m ) => logs.push( `[${m.type()}] ${m.text()}` ) );
	page.on( 'pageerror', ( e ) => logs.push( `[pageerror] ${e.message}` ) );
	const t0 = Date.now();
	await page.goto( base + '?' + query, { waitUntil: 'load' } );
	try {

		await page.waitForFunction( 'window.__shotReady === true || window.__shotError', { timeout: 180000, polling: 250 } );

	} catch ( e ) {

		logs.push( '[timeout] ' + e.message );

	}

	const err = await page.evaluate( () => window.__shotError );
	const stats = await page.evaluate( () => window.app && window.app.stats ? window.app.stats() : null );
	const file = path.join( outDir, name + '.png' );
	await page.screenshot( { path: file } );
	console.log( `${name}: ${( ( Date.now() - t0 ) / 1000 ).toFixed( 1 )}s -> ${file}${err ? ' ERROR: ' + err : ''}` );
	if ( stats ) console.log( '  stats:', JSON.stringify( stats ) );
	const interesting = logs.filter( ( l ) => ! l.includes( 'Download the React DevTools' ) );
	if ( interesting.length ) console.log( interesting.slice( 0, 40 ).join( '\n' ) );
	await page.close();

}

await browser.close();
