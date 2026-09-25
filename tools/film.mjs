// Records the trailer frame-by-frame (deterministic) and encodes it with ffmpeg.
// usage:
//   node tools/film.mjs preview <outDir>            one still per shot (mid-shot)
//   node tools/film.mjs record  <outDir> [out.mp4]   full render + encode
// env: FILM_URL (default dev server), FILM_W / FILM_H (default 1920x1080)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [ mode = 'preview', outDir = 'tools/out/film', outFile = 'larchmere-trailer.mp4' ] = process.argv.slice( 2 );
const W = parseInt( process.env.FILM_W || '1920' ), H = parseInt( process.env.FILM_H || '1080' );
const url = ( process.env.FILM_URL || 'http://localhost:5199/' ) + '?film&quality=ultra';
fs.mkdirSync( outDir, { recursive: true } );

const browser = await puppeteer.launch( {
	executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
	headless: true,
	args: [ '--ignore-gpu-blocklist', `--window-size=${W},${H}` ],
	protocolTimeout: 600000,
} );
const page = await browser.newPage();
await page.setViewport( { width: W, height: H, deviceScaleFactor: 1 } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
page.on( 'console', ( m ) => {

	if ( m.type() === 'error' && ! m.text().includes( '404' ) ) console.log( '[console]', m.text() );

} );
await page.goto( url, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__filmReady === true || window.__shotError', { timeout: 240000, polling: 250 } );
const info = await page.evaluate( () => ( { total: window.film.total, shots: window.film.shots.map( ( s ) => s.dur ) } ) );
console.log( `film: ${info.shots.length} shots, ${info.total} frames (${( info.total / 30 ).toFixed( 1 )} s)` );

if ( mode === 'preview' ) {

	const only = process.env.SHOT ? process.env.SHOT.split( ',' ).map( Number ) : null;
	for ( let i = 0; i < info.shots.length; i ++ ) {

		if ( only && ! only.includes( i ) ) continue;
		const times = ( process.env.AT || String( info.shots[ i ] * 0.5 ) ).split( ',' ).map( Number );
		for ( const at of times ) {

			await page.evaluate( ( i, at ) => window.film.seek( i, at ), i, Math.min( at, info.shots[ i ] - 0.1 ) );
			const f = path.join( outDir, times.length > 1 ? `shot-${String( i ).padStart( 2, '0' )}-${at}.jpg` : `shot-${String( i ).padStart( 2, '0' )}.jpg` );
			await page.screenshot( { path: f, type: 'jpeg', quality: 90 } );
			console.log( 'preview', f );

		}

	}

} else if ( mode === 'audio' ) {

	const b64 = await page.evaluate( () => window.renderTrailerAudio() );
	const f = path.join( outDir, 'trailer.wav' );
	fs.writeFileSync( f, Buffer.from( b64, 'base64' ) );
	console.log( 'wrote', f );

} else {

	// soundtrack first (fast), then the frames
	const b64 = await page.evaluate( () => window.renderTrailerAudio() );
	const wavFile = path.join( outDir, 'trailer.wav' );
	fs.writeFileSync( wavFile, Buffer.from( b64, 'base64' ) );
	process.env.AUDIO = wavFile;
	console.log( 'soundtrack rendered' );
	const frames = path.join( outDir, 'frames' );
	fs.rmSync( frames, { recursive: true, force: true } );
	fs.mkdirSync( frames, { recursive: true } );
	const t0 = Date.now();
	let n = 0;
	while ( await page.evaluate( () => window.film.next() ) ) {

		await page.screenshot( { path: path.join( frames, `f${String( n ).padStart( 5, '0' )}.jpg` ), type: 'jpeg', quality: 96, optimizeForSpeed: true } );
		n ++;
		if ( n % 60 === 0 ) console.log( `frame ${n}/${info.total}  ${( ( Date.now() - t0 ) / 1000 ).toFixed( 0 )}s` );

	}

	console.log( `captured ${n} frames in ${( ( Date.now() - t0 ) / 1000 ).toFixed( 0 )}s; encoding...` );
	const args = [ '-y', '-framerate', '30', '-i', path.join( frames, 'f%05d.jpg' ) ];
	const audio = process.env.AUDIO;
	if ( audio && fs.existsSync( audio ) ) args.push( '-i', audio );
	args.push( '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-vf', 'format=yuv420p' );
	if ( audio && fs.existsSync( audio ) ) args.push( '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest' );
	args.push( outFile );
	const r = spawnSync( 'ffmpeg', args, { stdio: 'inherit' } );
	console.log( r.status === 0 ? `wrote ${outFile}` : 'ffmpeg failed' );

}

await browser.close();
