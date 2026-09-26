// Dev helper: frames the nearest instance of each variant of a forest prop (log, stump, ...).
// usage: node tools/propshot.mjs <out.jpg> <prop> [variants=all] [dist=5] [angleDeg=0] [--near=x,z]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice( 2 );
const [ out, prop, vArg = '', distArg = '5', angArg = '0' ] = args.filter( ( a ) => ! a.startsWith( '--' ) );
const near = ( args.find( ( a ) => a.startsWith( '--near=' ) ) || '--near=-5,508' ).slice( 7 ).split( ',' ).map( Number );
const W = 640, H = 420, tmp = path.join( path.dirname( out ), '_props' );
fs.rmSync( tmp, { recursive: true, force: true } ); fs.mkdirSync( tmp, { recursive: true } );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
await page.setViewport( { width: W, height: H } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
await page.goto( `http://localhost:5199/?shot=30&speed=0&t=11&cam=${near[ 0 ]},10,${near[ 1 ]},0,0`, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000 } );
const nv = await page.evaluate( ( p ) => app.forest.props[ p ].variants.length, prop );
const vs = vArg ? vArg.split( ',' ).map( Number ) : [ ...Array( nv ).keys() ];
let i = 0;
for ( const v of vs ) {
	const info = await page.evaluate( ( p, v, nx, nz, dist, ang ) => {
		const set = app.forest.props[ p ];
		let best = null, bd = 1e9;
		for ( const it of set.items ) { if ( it.variant !== v ) continue; const d = Math.hypot( it.x - nx, it.z - nz ); if ( d < bd ) { bd = d; best = it; } }
		if ( ! best ) return 'none';
		const meta = set.variants[ v ];
		const r = best.rot + ang * Math.PI / 180, X = [ Math.cos( r ), - Math.sin( r ) ], Z = [ Math.sin( r ), Math.cos( r ) ];
		const back = dist * ( meta.halfLen ? Math.max( 1, meta.halfLen / 2.5 ) : 1 ) * best.s;
		const cx = best.x + ( Z[ 0 ] * 0.85 - X[ 0 ] * 0.5 ) * back, cz = best.z + ( Z[ 1 ] * 0.85 - X[ 1 ] * 0.5 ) * back;
		app.update = () => {};
		const cam = app.camera;
		cam.position.set( cx, Math.max( app.terrainData.heightAt( cx, cz ), 0 ) + 1.4 + back * 0.15, cz );
		cam.lookAt( best.x, best.y + ( meta.height || 0.5 ) * 0.5 * best.s, best.z );
		cam.updateMatrixWorld();
		app.forest.update( cam );
		app.render(); app.render();
		return v + ' ' + JSON.stringify( Object.fromEntries( Object.entries( meta ).filter( ( [ k, x ] ) => typeof x !== 'object' ) ) ) + ' d' + bd.toFixed( 0 );
	}, prop, v, near[ 0 ], near[ 1 ], parseFloat( distArg ), parseFloat( angArg ) );
	console.log( info );
	await new Promise( ( res ) => setTimeout( res, 300 ) );
	await page.screenshot( { path: path.join( tmp, `v${i ++}.png` ) } );
}
await browser.close();
const cols = Math.min( 4, vs.length ), rows = Math.ceil( vs.length / cols );
for ( ; i < rows * cols; i ++ ) spawnSync( 'ffmpeg', [ '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=black:s=${W}x${H}`, '-frames:v', '1', path.join( tmp, `v${i}.png` ) ] );
spawnSync( 'ffmpeg', [ '-y', '-loglevel', 'error', '-i', path.join( tmp, 'v%d.png' ), '-vf', `tile=${cols}x${rows}`, '-frames:v', '1', out ] );
console.log( out );
