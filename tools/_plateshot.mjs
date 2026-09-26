// Dev helper: frames the root plates (log variants with a plate) face-on from the pit side.
import puppeteer from 'puppeteer-core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[ 2 ];
const tmp = path.join( path.dirname( out ), '_plates' ); fs.rmSync( tmp, { recursive: true, force: true } ); fs.mkdirSync( tmp, { recursive: true } );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
await page.setViewport( { width: 640, height: 420 } );
await page.goto( 'http://localhost:5199/?shot=30&speed=0&t=11', { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000 } );
let i = 0;
for ( const [ v, side ] of [ [ 0, - 1 ], [ 1, - 1 ], [ 0, 1 ], [ 7, 0 ] ] ) {
	await page.evaluate( ( v, side ) => {
		const set = app.forest.props.log, meta = set.variants[ v ];
		let best = null, bd = 1e9;
		for ( const it of set.items ) { if ( it.variant !== v ) continue; const d = Math.hypot( it.x + 5, it.z - 508 ); if ( d < bd ) { bd = d; best = it; } }
		const r = best.rot, X = [ Math.cos( r ), - Math.sin( r ) ], Z = [ Math.sin( r ), Math.cos( r ) ];
		const e = - meta.halfLen * best.s;
		const px = best.x + X[ 0 ] * e, pz = best.z + X[ 1 ] * e;
		let cx, cz;
		if ( side === 0 ) { cx = best.x + Z[ 0 ] * 6; cz = best.z + Z[ 1 ] * 6; }
		else { cx = px + X[ 0 ] * side * 4.5 + Z[ 0 ] * 1.5; cz = pz + X[ 1 ] * side * 4.5 + Z[ 1 ] * 1.5; }
		app.update = () => {};
		const cam = app.camera;
		cam.position.set( cx, app.terrainData.heightAt( cx, cz ) + 1.5, cz );
		if ( side === 0 ) cam.lookAt( best.x, best.y + 0.5, best.z ); else cam.lookAt( px, best.y + 0.9, pz );
		cam.updateMatrixWorld(); app.forest.update( cam ); app.render(); app.render();
	}, v, side );
	await page.screenshot( { path: path.join( tmp, `v${i ++}.png` ) } );
}
await browser.close();
spawnSync( 'ffmpeg', [ '-y', '-loglevel', 'error', '-i', path.join( tmp, 'v%d.png' ), '-vf', 'tile=2x2', '-frames:v', '1', out ] );
console.log( out );
