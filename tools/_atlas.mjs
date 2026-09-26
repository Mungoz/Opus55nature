// Dev helper: saves the procedural foliage atlas as a PNG (on a mid-grey background).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const out = process.argv[ 2 ];
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
await page.goto( 'http://localhost:5199/?shot=5&speed=0', { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000 } );
const url = await page.evaluate( async () => {
	const { buildFoliageAtlas } = await import( '/src/gen/foliageAtlas.js' );
	const a = buildFoliageAtlas();
	// a DataTexture, rows flipped (v = 1 at the canvas top)
	const { width: w, height: h, data } = a.image;
	const img = new ImageData( w, h );
	for ( let y = 0; y < h; y ++ ) img.data.set( data.subarray( ( h - 1 - y ) * w * 4, ( h - y ) * w * 4 ), y * w * 4 );
	const c = document.createElement( 'canvas' ); c.width = w; c.height = h;
	const g = c.getContext( '2d' ); g.fillStyle = '#6a7a6a'; g.fillRect( 0, 0, w, h );
	const c2 = document.createElement( 'canvas' ); c2.width = w; c2.height = h; c2.getContext( '2d' ).putImageData( img, 0, 0 );
	g.drawImage( c2, 0, 0 );
	return c.toDataURL( 'image/png' );
} );
fs.writeFileSync( out, Buffer.from( url.split( ',' )[ 1 ], 'base64' ) );
console.log( out );
await browser.close();
