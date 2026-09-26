// The walk-through bot: plays the horror edition start to end with ?autopilot (walking the
// route, reading, sheltering, rowing away), N simulation steps a frame, and reports the time
// at each beat, the total, and any errors. Screenshots every so often into shots/bot/.
// usage: node tools/walkbot.mjs [turbo=4] [query]   (with the dev server up)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [ turbo = '4', query = '' ] = process.argv.slice( 2 );
fs.mkdirSync( 'shots/bot', { recursive: true } );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required' ] } );
const page = await browser.newPage();
await page.setViewport( { width: 1280, height: 720 } );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( 'pageerror ' + e.message ) );
page.on( 'console', ( m ) => { if ( m.type() === 'error' ) errors.push( m.text().slice( 0, 400 ) ); } );
await page.goto( `http://localhost:5199/?autopilot&debug&turbo=${turbo}&quality=low${query ? '&' + query : ''}`, { waitUntil: 'load' } );
await page.waitForFunction( () => document.body.classList.contains( 'ready' ) || window.__shotError, { timeout: 240000, polling: 300 } );
await page.click( '#enter' );
const t0 = Date.now();
let shot = 0, lastLog = 0;
while ( Date.now() - t0 < 30 * 60 * 1000 ) {

	await new Promise( ( r ) => setTimeout( r, 4000 ) );
	const s = await page.evaluate( () => ! window.app?.story ? { t: 0, d: 0, h: 0, log: [], pos: [], fps: 0, looked: 0, card: '' } : ( { t: app.story.time, d: app.story.progress, h: app.hours, ended: !! app.story.ended, card: document.querySelector( '#story-card' )?.textContent || '', log: app.story.log, pos: app.camera.position.toArray().map( ( v ) => +v.toFixed( 1 ) ), fps: Math.round( 1000 / app._ftAvg ), looked: app.story.looked } ) );
	if ( s.log.length > lastLog ) { for ( const l of s.log.slice( lastLog ) ) console.log( '  beat', JSON.stringify( l ) ); lastLog = s.log.length; }
	if ( s.t === 0 ) { console.log( 'page reloaded?' ); continue; }
	console.log( `t ${s.t.toFixed( 0 )}s  d ${s.d.toFixed( 0 )}  ${s.h.toFixed( 2 )}h  pos ${s.pos}  fps ${s.fps}  looked ${s.looked.toFixed( 1 )}` );
	if ( ( shot ++ ) % 3 === 0 ) await page.screenshot( { path: `shots/bot/${String( shot ).padStart( 3, '0' )}.jpg`, type: 'jpeg', quality: 70 } );
	if ( s.card.includes( 'Thank you' ) ) { console.log( 'THE END at game time', s.t.toFixed( 0 ), 's' ); break; }
	if ( errors.length ) { console.log( errors.slice( 0, 10 ).join( '\n' ) ); errors.length = 0; }

}

await page.screenshot( { path: 'shots/bot/end.jpg', type: 'jpeg', quality: 80 } );
await browser.close();
