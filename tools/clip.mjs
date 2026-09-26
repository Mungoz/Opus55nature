// Dev helper: a strip of frames of a studio animal in motion (for checking animation).
// usage: node tools/clip.mjs <out.jpg> <animal[-pose]> [frames=8] [step=0.15 s] [angle] [back]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const [ out, target, nArg = '8', stepArg = '0.15', angle = '0', back = '' ] = process.argv.slice( 2 );
const W = 480, H = 360, n = parseInt( nArg ), step = parseFloat( stepArg );
const tmp = path.join( path.dirname( out ), '_clip' );
fs.rmSync( tmp, { recursive: true, force: true } ); fs.mkdirSync( tmp, { recursive: true } );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
await page.setViewport( { width: W, height: H } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
await page.goto( `http://localhost:5199/?shot=30&speed=1&t=10&follow=${target.startsWith( "heron" ) ? target : "studio-" + target}&hide=grass,reeds`, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000 } );
await page.evaluate( ( a, b ) => { app.options.angle = a; if ( b ) app.options.back = b; }, parseFloat( angle ), back ? parseFloat( back ) : 0 );
for ( let i = 0; i < n; i ++ ) {
	await page.evaluate( ( s ) => { for ( let k = 0; k < Math.round( s * 60 ); k ++ ) app.update( 1 / 60 ); app.render(); }, step );
	await page.screenshot( { path: path.join( tmp, `v${i}.png` ) } );
}
await browser.close();
const cols = Math.min( 4, n ), rows = Math.ceil( n / cols );
spawnSync( 'ffmpeg', [ '-y', '-loglevel', 'error', '-i', path.join( tmp, 'v%d.png' ), '-vf', `tile=${cols}x${rows}`, '-frames:v', '1', out ] );
console.log( out );
