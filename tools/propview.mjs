// Dev helper: puts a prop builder's output down in the valley and photographs it all round.
// Needs the dev server (npm run dev on :5199). The builder is called as fn( ground ) (see
// src/story/props/_preview.js).
// usage: node tools/propview.mjs <module, e.g. src/story/props/stand.js> <export fn> <out prefix>
//        [x=-130] [z=610] [yawDeg=0] [hour=15] [views]
//   views: "az:el:dist,..." in degrees and metres (0 az looks from the prop's +z side);
//          default: four quarters at 30 degrees up, then a close three-quarter view
// writes shots/props/<prefix>-<n>.png
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [ mod, fn, prefix, xs = '-130', zs = '610', yawS = '0', hour = '15', viewsS = '' ] = process.argv.slice( 2 );
if ( ! mod || ! fn || ! prefix ) { console.log( 'usage: node tools/propview.mjs <module> <fn> <prefix> [x] [z] [yawDeg] [hour] [views]' ); process.exit( 1 ); }
fs.mkdirSync( 'shots/props', { recursive: true } );
const W = 1280, H = 800;
const browser = await puppeteer.launch( { protocolTimeout: 600000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist', `--window-size=${W},${H}` ] } );
const page = await browser.newPage();
await page.setViewport( { width: W, height: H } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
page.on( 'console', ( m ) => { if ( m.type() === 'error' ) console.log( '[console]', m.text().slice( 0, 300 ) ); } );
await page.goto( `http://localhost:5199/?shot=20&speed=0&t=${hour}&weather=clear&quality=high`, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true || window.__shotError', { timeout: 240000, polling: 250 } );
const x = + xs, z = + zs, yaw = + yawS * Math.PI / 180;
const info = await page.evaluate( async ( mod, fn, x, z, yaw ) => {

	const P = await import( '/src/story/props/_preview.js?t=' + Date.now() );
	return P.preview( app, '/' + mod + '?t=' + Date.now(), fn, x, z, yaw );

}, mod, fn, x, z, yaw );
console.log( JSON.stringify( info ) );
const r = Math.max( 2, Math.hypot( ...info.size ) * 0.5 );
const views = viewsS ? viewsS.split( ',' ).map( ( v ) => v.split( ':' ).map( Number ) ) : [ [ 20, 25, r * 2.6 ], [ 110, 25, r * 2.6 ], [ 200, 25, r * 2.6 ], [ 290, 25, r * 2.6 ], [ 35, 12, r * 1.4 ] ];
let n = 0;
for ( const [ az, el, dist ] of views ) {

	await page.evaluate( ( c, az, el, dist, yaw ) => {

		const a = az * Math.PI / 180 + yaw, e = el * Math.PI / 180;
		const cam = app.camera;
		const px = c[ 0 ] + Math.sin( a ) * Math.cos( e ) * dist, pz = c[ 2 ] + Math.cos( a ) * Math.cos( e ) * dist;
		const py = Math.max( c[ 1 ] + Math.sin( e ) * dist, app.terrainData.heightAt( px, pz ) + 0.4 );
		// (the controls frozen, so nothing puts the eye back on its feet: the camera aimed directly)
		app.controls.update = () => {};
		cam.position.set( px, py, pz );
		cam.lookAt( c[ 0 ], c[ 1 ], c[ 2 ] );
		cam.updateMatrixWorld();

	}, info.centre, az, el, dist, yaw );
	const f0 = await page.evaluate( () => app.frame );
	await page.waitForFunction( ( f ) => app.frame > f, { timeout: 60000, polling: 50 }, f0 + 25 );
	const out = `shots/props/${prefix}-${n ++}.png`;
	await page.screenshot( { path: out } );
	console.log( 'shot', out );

}

await browser.close();
