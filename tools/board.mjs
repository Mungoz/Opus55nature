// Dev helper: loads the scene once and photographs several animals (studio views) into one sheet.
// usage: node tools/board.mjs <out.jpg> <animal[:pose][:angle][:back][:h][:bone]> ... [--cols=N]
//   angle is radians about the animal (0 = side on); back is the camera distance (m); h the height
// env: BOARD_W/BOARD_H (per view, default 640x480), BOARD_T (hour, default 10),
//      BOARD_HIDE (names to hide, default grass,reeds), BOARD_Q (extra query)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice( 2 );
const out = args[ 0 ];
const colsArg = args.find( ( a ) => a.startsWith( '--cols=' ) );
const specs = args.slice( 1 ).filter( ( a ) => ! a.startsWith( '--' ) );
const cols = colsArg ? parseInt( colsArg.slice( 7 ) ) : Math.min( specs.length, 3 );
const W = parseInt( process.env.BOARD_W || '640' ), H = parseInt( process.env.BOARD_H || '480' );
const tmp = path.join( path.dirname( out ), '_board' );
fs.rmSync( tmp, { recursive: true, force: true } );
fs.mkdirSync( tmp, { recursive: true } );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist', `--window-size=${W},${H}` ] } );
const page = await browser.newPage();
await page.setViewport( { width: W, height: H } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
page.on( 'console', ( m ) => m.type() === 'error' && console.log( '[console]', m.text().slice( 0, 300 ) ) );
const first = specs[ 0 ].split( ':' )[ 0 ];
await page.goto( `http://localhost:5199/?shot=30&speed=0&t=${process.env.BOARD_T || 10}&follow=studio-${first}&hide=${process.env.BOARD_HIDE ?? 'grass,reeds'}${process.env.BOARD_Q || ''}`, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true || window.__shotError', { timeout: 180000, polling: 250 } );
let i = 0;
for ( const s of specs ) {

	const [ animal, pose = '', angle = '0', back = '', h = '', bone = '' ] = s.split( ':' );
	await page.evaluate( ( n, a, b, h, bone ) => {

		app.options.follow = n; app.options.angle = a; app.options.bone = bone || undefined;
		app.options.back = b || undefined; app.options.h = h === null ? undefined : h;

	}, `studio-${animal}${pose ? '-' + pose : ''}`, parseFloat( angle ), back ? parseFloat( back ) : 0, h ? parseFloat( h ) : null, bone );
	await new Promise( ( r ) => setTimeout( r, 900 ) );
	await page.screenshot( { path: path.join( tmp, `v${i ++}.png` ) } );

}

await browser.close();
const rows = Math.ceil( specs.length / cols );
// pad the grid with black frames
for ( ; i < rows * cols; i ++ ) spawnSync( 'ffmpeg', [ '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=black:s=${W}x${H}`, '-frames:v', '1', path.join( tmp, `v${i}.png` ) ] );
const r = spawnSync( 'ffmpeg', [ '-y', '-loglevel', 'error', '-i', path.join( tmp, 'v%d.png' ), '-vf', `tile=${cols}x${rows}`, '-frames:v', '1', out ] );
console.log( r.status === 0 ? out : 'ffmpeg failed ' + r.stderr );
