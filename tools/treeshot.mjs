// Dev helper: frames the nearest tree of each named species (or variant index) to a point,
// one view each, in a single load. usage:
//   node tools/treeshot.mjs <out.jpg> <species|#variant>[:dist[:heightFrac[:angleDeg]]] ... [--near=x,z] [--cols=N]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice( 2 );
const out = args[ 0 ];
const opt = ( k, d ) => ( args.find( ( a ) => a.startsWith( `--${k}=` ) ) || `=${d}` ).split( '=' )[ 1 ];
const specs = args.slice( 1 ).filter( ( a ) => ! a.startsWith( '--' ) );
const [ nx, nz ] = opt( 'near', '-40,560' ).split( ',' ).map( Number );
const cols = parseInt( opt( 'cols', Math.min( 3, specs.length ) ) );
const W = 640, H = 480, tmp = path.join( path.dirname( out ), '_trees' );
fs.rmSync( tmp, { recursive: true, force: true } ); fs.mkdirSync( tmp, { recursive: true } );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist', `--window-size=${W},${H}` ] } );
const page = await browser.newPage();
await page.setViewport( { width: W, height: H } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
await page.goto( `http://localhost:5199/?shot=30&speed=0&t=${opt( 't', 11 )}&cam=${nx},10,${nz},0,0`, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000 } );
let i = 0;
for ( const s of specs ) {

	const [ sp, dist = '14', hf = '0.45', ang = '200' ] = s.split( ':' );
	const info = await page.evaluate( ( sp, nx, nz, dist, hf, ang ) => {

		const F = app.forest;
		const vs = sp.startsWith( '#' ) ? [ parseInt( sp.slice( 1 ) ) ] : F.speciesVariants[ sp ];
		let best = null, bd = Infinity;
		for ( const t of F.trees ) {

			if ( ! vs.includes( t.variant ) ) continue;
			const d = Math.hypot( t.x - nx, t.z - nz );
			if ( d < bd ) { bd = d; best = t; }

		}

		if ( ! best ) return 'none';
		const v = F.variants[ best.variant ];
		const H = ( v.height || 20 ) * best.s;
		const a = ang * Math.PI / 180;
		const cx = best.x + Math.sin( a ) * dist, cz = best.z + Math.cos( a ) * dist;
		const cy = Math.max( app.terrainData.heightAt( cx, cz ) + 1.6, best.y + H * hf * 0.5 );
		const ty = best.y + H * hf;
		app.update = () => {};
		app.camera.position.set( cx, cy, cz );
		app.camera.lookAt( best.x, ty, best.z );
		app.camera.updateMatrixWorld();
		app.forest.update( app.camera );
		app.render(); app.render();
		return sp + ' variant ' + best.variant + ' h ' + H.toFixed( 1 ) + ' at ' + best.x.toFixed( 0 ) + ',' + best.z.toFixed( 0 );

	}, sp, nx, nz, parseFloat( dist ), parseFloat( hf ), parseFloat( ang ) );
	console.log( info );
	await new Promise( ( r ) => setTimeout( r, 300 ) );
	await page.screenshot( { path: path.join( tmp, `v${i ++}.png` ) } );

}

await browser.close();
const rows = Math.ceil( specs.length / cols );
for ( ; i < rows * cols; i ++ ) spawnSync( 'ffmpeg', [ '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=black:s=${W}x${H}`, '-frames:v', '1', path.join( tmp, `v${i}.png` ) ] );
spawnSync( 'ffmpeg', [ '-y', '-loglevel', 'error', '-i', path.join( tmp, 'v%d.png' ), '-vf', `tile=${cols}x${rows}`, '-frames:v', '1', out ] );
console.log( out );
