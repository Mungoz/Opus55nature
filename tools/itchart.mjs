// The itch.io page art for the horror edition, rendered in the game itself: a scene staged by a
// script (a JSON list of evals, then a capture), the title set over it in the game's own type.
// usage: node tools/itchart.mjs <out.png> <width> <height> <scene.json> [title] [subtitle]
//   scene.json: { beat, steps: [ js, ... ] (S = app.story), wait: seconds, frames }
// Needs the dev server (npm run dev on :5199).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [ out, ws, hs, scenePath, title = '', subtitle = '' ] = process.argv.slice( 2 );
const W = + ws, H = + hs;
const scene = JSON.parse( fs.readFileSync( scenePath, 'utf8' ) );
const browser = await puppeteer.launch( { protocolTimeout: 600000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}` ] } );
const page = await browser.newPage();
await page.setViewport( { width: W, height: H } );
page.on( 'pageerror', ( e ) => console.log( 'pageerror ' + e.message ) );
await page.goto( `http://localhost:${process.env.PORT || 5199}/?quality=ultra&turbo=1&beat=${scene.beat || 'jetty'}`, { waitUntil: 'load' } );
await page.waitForFunction( () => document.body.classList.contains( 'ready' ), { timeout: 300000, polling: 300 } );
await page.click( '#enter' );
await page.waitForFunction( () => app.story && app.story.begun, { timeout: 120000, polling: 200 } );
// no interface over the picture
await page.addStyleTag( { content: '#story-ui, #hud, #hint, .hud, #loader { display: none !important; }' } );
for ( const js of scene.steps || [] ) {

	const r = await page.evaluate( `(() => { const S = app.story; ${js} })()` );
	if ( r !== undefined ) console.log( JSON.stringify( r ) );

}

await page.evaluate( ( sec ) => new Promise( ( res ) => { const t0 = app.story.time; const f = () => ( app.story.time - t0 > sec ? res() : requestAnimationFrame( f ) ); f(); } ), scene.wait ?? 4 );
const f0 = await page.evaluate( () => app.frame );
await page.waitForFunction( ( f ) => app.frame > f, { timeout: 60000, polling: 50 }, f0 + ( scene.frames ?? 30 ) );
const shot = await page.screenshot( { encoding: 'base64' } );
// the title, in the game's own type, over the picture
const png = await page.evaluate( async ( b64, W, H, title, subtitle, grade ) => {

	const img = new Image();
	img.src = 'data:image/png;base64,' + b64;
	await img.decode();
	const c = document.createElement( 'canvas' );
	c.width = W; c.height = H;
	const g = c.getContext( '2d' );
	g.drawImage( img, 0, 0 );
	if ( grade ) {

		// a darker vignette for a page background, so text over it reads
		const v = g.createRadialGradient( W / 2, H * 0.45, Math.min( W, H ) * 0.2, W / 2, H * 0.5, Math.max( W, H ) * 0.75 );
		v.addColorStop( 0, 'rgba(0,0,0,0)' );
		v.addColorStop( 1, `rgba(0,0,0,${grade})` );
		g.fillStyle = v;
		g.fillRect( 0, 0, W, H );

	}

	if ( title ) {

		await document.fonts.ready;
		const size = Math.round( H * 0.085 );
		g.font = `300 ${size}px "Cormorant Garamond", "Iowan Old Style", Georgia, serif`;
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		const spaced = title.toUpperCase().split( '' ).join( String.fromCharCode( 8202 ).repeat( 3 ) );
		const y = H * 0.16;
		// a soft dark bed behind the letters
		g.shadowColor = 'rgba(0,0,0,0.85)';
		g.shadowBlur = size * 0.6;
		g.fillStyle = 'rgba(242, 236, 224, 0.95)';
		g.fillText( spaced, W / 2, y );
		g.shadowBlur = 0;
		g.fillText( spaced, W / 2, y );
		if ( subtitle ) {

			g.font = `italic 300 ${Math.round( size * 0.36 )}px "Cormorant Garamond", Georgia, serif`;
			g.fillStyle = 'rgba(236, 228, 214, 0.8)';
			g.shadowColor = 'rgba(0,0,0,0.9)';
			g.shadowBlur = size * 0.3;
			g.fillText( subtitle, W / 2, y + size * 0.85 );

		}

	}

	return c.toDataURL( 'image/png' ).split( ',' )[ 1 ];

}, shot, W, H, title, subtitle, scene.grade ?? 0 );
fs.mkdirSync( out.replace( /[\\/][^\\/]*$/, '' ) || '.', { recursive: true } );
fs.writeFileSync( out, Buffer.from( png, 'base64' ) );
console.log( 'wrote', out );
await browser.close();
