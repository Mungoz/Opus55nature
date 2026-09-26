// Dev helper: a few frames of a storm, half a second apart, to check trees move together.
import puppeteer from 'puppeteer-core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [ out, query = 'shot=60&speed=1&t=13&weather=storm&cam=-80,4,560,250,6' ] = process.argv.slice( 2 );
const W = 800, H = 450, tmp = path.join( path.dirname( out ), '_storm' );
fs.rmSync( tmp, { recursive: true, force: true } ); fs.mkdirSync( tmp, { recursive: true } );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
await page.setViewport( { width: W, height: H } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
await page.goto( 'http://localhost:5199/?' + query, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000 } );
for ( let i = 0; i < 6; i ++ ) {
	await page.evaluate( () => { for ( let k = 0; k < 12; k ++ ) app.update( 1 / 24 ); app.render(); } );
	await page.screenshot( { path: path.join( tmp, `v${i}.png` ) } );
}
await browser.close();
spawnSync( 'ffmpeg', [ '-y', '-loglevel', 'error', '-i', path.join( tmp, 'v%d.png' ), '-vf', 'tile=3x2', '-frames:v', '1', out ] );
console.log( out );
