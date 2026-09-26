// Dev helper: frames a small-bird group (flock i, or wagtail/dipper) from a distance, with time frozen.
import puppeteer from 'puppeteer-core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [ out, ...specs ] = process.argv.slice( 2 );
const tmp = path.join( path.dirname( out ), '_birds' ); fs.rmSync( tmp, { recursive: true, force: true } ); fs.mkdirSync( tmp, { recursive: true } );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
await page.setViewport( { width: 640, height: 420 } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
await page.goto( 'http://localhost:5199/?shot=30&speed=1&t=11&cam=0,30,1400,0,0', { waitUntil: 'load' } );
if ( process.env.NOGRASS ) await page.evaluate( () => { window.__noGrass = true; } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000 } );
let i = 0;
for ( const sp of specs ) {
	const [ kind, idx = '0', dist = '12', fov = '40', state = '' ] = sp.split( ':' );
	console.log( await page.evaluate( ( kind, idx, dist, fov, state ) => {
		const S = app.smallBirds, cam = app.camera;
		let target, up = 1.5;
		if ( kind === 'flock' ) {
			const F = S.flocks[ idx ];
			if ( state === 'ground' ) { F.patch = S._patch( F.tree ); F.birds.forEach( ( b ) => { const x = F.patch.x + ( Math.random() - 0.5 ) * 5, z = F.patch.z + ( Math.random() - 0.5 ) * 5; b.pos.set( x, S._perchH( x, z ), z ); } ); F.state = 'ground'; F.timer = 1e9; }
			const c = new cam.position.constructor(); F.birds.forEach( ( b ) => c.add( b.pos ) ); c.multiplyScalar( 1 / F.birds.length );
			target = c; up = state === 'ground' ? 1.2 : - 4;
		} else {
			const b = ( kind === 'wagtail' ? S.wagtails : S.dippers )[ idx ];
			b.state = 'stand'; b.timer = 1e9; target = b.pos.clone(); up = 0.9;
		}
		const a = 0.7;
		cam.position.set( target.x + Math.sin( a ) * dist, target.y + up, target.z + Math.cos( a ) * dist );
		const g = app.terrainData.heightAt( cam.position.x, cam.position.z );
		cam.position.y = Math.max( cam.position.y, g + 1.4 );
		cam.fov = fov; cam.updateProjectionMatrix();
		cam.lookAt( target ); cam.updateMatrixWorld();
		app.forest.update( cam );
		// run the birds a moment with the camera there, then freeze

		for ( let k = 0; k < 20; k ++ ) S.update( 1 / 30, cam );
		app.update = () => {};
		if ( window.__noGrass ) app.meadow.group.visible = false;
		app.render(); app.render();
		return kind + idx + ' at ' + target.toArray().map( ( v ) => v.toFixed( 1 ) ).join( ',' );
	}, kind, parseInt( idx ), parseFloat( dist ), parseFloat( fov ), state ) );
	await page.screenshot( { path: path.join( tmp, `v${i ++}.png` ) } );
}
await browser.close();
const cols = Math.min( 3, specs.length ), rows = Math.ceil( specs.length / cols );
for ( ; i < rows * cols; i ++ ) spawnSync( 'ffmpeg', [ '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=black:s=640x420', '-frames:v', '1', path.join( tmp, `v${i}.png` ) ] );
spawnSync( 'ffmpeg', [ '-y', '-loglevel', 'error', '-i', path.join( tmp, 'v%d.png' ), '-vf', `tile=${cols}x${rows}`, '-frames:v', '1', out ] );
console.log( out );
