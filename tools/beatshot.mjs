// Screenshots of the horror edition's beats, as a player would see them: jump to a beat, let
// the autopilot walk the story on for a while, then (optionally) take the camera and aim it,
// and save a screenshot. Several shots of one run are taken in sequence.
// usage: node tools/beatshot.mjs <beat> <out prefix> '<json steps>' [turbo=2]
//   steps: [ { run: seconds }, { eval: "js (S = app.story)" }, { shot: name, frames: n } ]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [ beat, prefix, stepsJson, turbo = '2', extra = '' ] = process.argv.slice( 2 );
const steps = JSON.parse( stepsJson.startsWith( '@' ) ? fs.readFileSync( stepsJson.slice( 1 ), 'utf8' ) : stepsJson );
fs.mkdirSync( 'shots/beats', { recursive: true } );
const browser = await puppeteer.launch( { protocolTimeout: 1200000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist', '--window-size=1600,900', '--autoplay-policy=no-user-gesture-required' ] } );
const page = await browser.newPage();
await page.setViewport( { width: 1600, height: 900 } );
page.on( 'pageerror', ( e ) => console.log( 'pageerror ' + e.message ) );
page.on( 'console', ( m ) => { if ( m.type() === 'error' || m.text().startsWith( '[b]' ) ) console.log( m.text().slice( 0, 500 ) ); } );
await page.goto( `http://localhost:${process.env.PORT || 5199}/?autopilot&turbo=${turbo}&quality=high&beat=${beat}${extra}`, { waitUntil: 'load' } );
await page.waitForFunction( () => document.body.classList.contains( 'ready' ), { timeout: 240000, polling: 300 } );
await page.click( '#enter' );
for ( const st of steps ) {

	if ( st.run ) {

		const t0 = await page.evaluate( () => app.story.time );
		await page.waitForFunction( ( t ) => app.story.time > t, { timeout: 600000, polling: 200 }, t0 + st.run );

	}

	if ( st.until ) await page.waitForFunction( st.until, { timeout: 600000, polling: 200 } );
	if ( st.eval ) {

		const r = await page.evaluate( `(() => { const S = app.story; ${st.eval} })()` );
		if ( r !== undefined ) console.log( JSON.stringify( r ) );

	}

	// (a data URL the page left in window.__rt, saved as a PNG: a render target read back)
	if ( st.saveData ) {

		const d = await page.evaluate( () => window.__rt );
		fs.writeFileSync( `shots/beats/${prefix}-${st.saveData}.png`, Buffer.from( d.split( ',' )[ 1 ], 'base64' ) );
		console.log( 'saved', `${prefix}-${st.saveData}` );

	}

	if ( st.shot ) {

		const f0 = await page.evaluate( () => app.frame );
		await page.waitForFunction( ( f ) => app.frame > f, { timeout: 60000, polling: 50 }, f0 + ( st.frames ?? 20 ) );
		await page.screenshot( { path: `shots/beats/${prefix}-${st.shot}.png` } );
		console.log( 'shot', `${prefix}-${st.shot}` );

	}

}

await browser.close();
