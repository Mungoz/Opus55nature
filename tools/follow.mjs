// Dev helper: photographs a followed creature (?follow=...) from several angles into one sheet.
// usage: node tools/follow.mjs <out.jpg> <target> [angles=0,1.57,3.14] [back] [h]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const [ out, target, angleArg = '0,1.57,3.14', back = '', h = '' ] = process.argv.slice( 2 );
const W = 640, H = 480;
const tmp = path.join( path.dirname( out ), '_follow' );
fs.rmSync( tmp, { recursive: true, force: true } );
fs.mkdirSync( tmp, { recursive: true } );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist', `--window-size=${W},${H}` ] } );
const page = await browser.newPage();
await page.setViewport( { width: W, height: H } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
await page.goto( `http://localhost:5199/?shot=30&speed=0&t=${process.env.FOLLOW_T || 10}&follow=${target}`, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true || window.__shotError', { timeout: 180000, polling: 250 } );
const angles = angleArg.split( ',' ).map( Number );
let i = 0;
for ( const a of angles ) {
	await page.evaluate( ( a, b, h ) => { app.options.angle = a; app.options.back = b || undefined; app.options.h = h === null ? undefined : h; }, a, back ? parseFloat( back ) : 0, h ? parseFloat( h ) : null );
	await new Promise( ( r ) => setTimeout( r, 900 ) );
	await page.screenshot( { path: path.join( tmp, `v${i ++}.png` ) } );
}
await browser.close();
const r = spawnSync( 'ffmpeg', [ '-y', '-loglevel', 'error', '-i', path.join( tmp, 'v%d.png' ), '-vf', `tile=${angles.length}x1`, '-frames:v', '1', out ] );
console.log( r.status === 0 ? out : 'ffmpeg failed ' + r.stderr );
