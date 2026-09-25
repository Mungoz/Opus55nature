// Dev helper: side-by-side magnified crops of two raw grabs (a | b | difference x8).
// usage: node tools/_crop.mjs a.bin b.bin x y w h scale out.png [W H]   (x, y from the top left)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const [ fa, fb, x0, y0, cw, ch, sc, out, W = 1280, H = 720 ] = process.argv.slice( 2 );
const a = fs.readFileSync( fa ), b = fs.readFileSync( fb );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true } );
const page = await browser.newPage();
const s = + sc, w = + cw, h = + ch;
await page.setViewport( { width: w * s * 3 + 20, height: h * s } );
await page.evaluate( ( A, B, x0, y0, w, h, s, W, H ) => {
	const c = document.createElement( 'canvas' ); c.width = w * s * 3 + 20; c.height = h * s; document.body.style.margin = 0; document.body.appendChild( c );
	const g = c.getContext( '2d' );
	const ua = Uint8Array.from( atob( A ), ( ch ) => ch.charCodeAt( 0 ) ), ub = Uint8Array.from( atob( B ), ( ch ) => ch.charCodeAt( 0 ) );
	for ( let y = 0; y < h; y ++ ) for ( let x = 0; x < w; x ++ ) {
		const i = ( ( H - 1 - ( y0 + y ) ) * W + x0 + x ) * 4;
		const pa = [ ua[ i ], ua[ i + 1 ], ua[ i + 2 ] ], pb = [ ub[ i ], ub[ i + 1 ], ub[ i + 2 ] ];
		const pd = pa.map( ( v, k ) => Math.min( 255, Math.abs( v - pb[ k ] ) * 8 ) );
		[ pa, pb, pd ].forEach( ( p, k ) => { g.fillStyle = `rgb(${p[ 0 ]},${p[ 1 ]},${p[ 2 ]})`; g.fillRect( k * ( w * s + 10 ) + x * s, y * s, s, s ); } );
	}
}, a.toString( 'base64' ), b.toString( 'base64' ), + x0, + y0, w, h, s, + W, + H );
await page.screenshot( { path: out } );
await browser.close();
