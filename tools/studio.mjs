// Dev helper: loads the scene once and photographs one animal from several angles and poses.
// usage: node tools/studio.mjs <animal> <outFile.jpg> [poses=a,b] [angles=0,0.8,...]
// env: STUDIO_W/H (per view, default 640x480), STUDIO_T (hour, default 13)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [ animal, outFile, poseArg = '', angleArg = '0,0.9,1.5708,2.4,3.1416' ] = process.argv.slice( 2 );
const poses = poseArg ? poseArg.split( ',' ) : [ '' ];
const angles = angleArg.split( ',' ).map( Number );
const W = parseInt( process.env.STUDIO_W || '640' ), H = parseInt( process.env.STUDIO_H || '480' );
const tmp = path.join( path.dirname( outFile ), '_studio' );
fs.mkdirSync( tmp, { recursive: true } );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist', `--window-size=${W},${H}` ] } );
const page = await browser.newPage();
await page.setViewport( { width: W, height: H } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
page.on( 'console', ( m ) => m.type() === 'error' && console.log( '[console]', m.text() ) );
await page.goto( `http://localhost:5199/?shot=30&speed=0&t=${process.env.STUDIO_T || 13}&follow=studio-${animal}`, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true || window.__shotError', { timeout: 180000, polling: 250 } );
const files = [];
for ( const pose of poses ) for ( const a of angles ) {

	await page.evaluate( ( n, a, b, h ) => { app.options.follow = n; app.options.angle = a; if ( b ) app.options.back = b; if ( h !== null ) app.options.h = h; }, `studio-${animal}${pose ? '-' + pose : ''}`, a, parseFloat( process.env.STUDIO_BACK || '0' ), process.env.STUDIO_H ? parseFloat( process.env.STUDIO_H ) : null );
	await new Promise( ( r ) => setTimeout( r, 700 ) );
	const f = path.join( tmp, `v${files.length}.png` );
	await page.screenshot( { path: f } );
	files.push( f );

}

await browser.close();
const r = spawnSync( 'ffmpeg', [ '-y', '-loglevel', 'error', '-i', path.join( tmp, 'v%d.png' ), '-vf', `tile=${angles.length}x${poses.length}`, '-frames:v', '1', outFile ] );
console.log( r.status === 0 ? outFile : 'ffmpeg failed ' + r.stderr );
