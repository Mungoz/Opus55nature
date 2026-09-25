// Dev helper: where two raw grabs differ, as a coarse grid (rows top to bottom), and a PNG of the difference.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const [ fa, fb, w = 1280, h = 720, png ] = process.argv.slice( 2 );
const a = fs.readFileSync( fa ), b = fs.readFileSync( fb );
const W = + w, H = + h, GX = 16, GY = 9;
const grid = Array.from( { length: GY }, () => new Array( GX ).fill( 0 ) );
for ( let y = 0; y < H; y ++ ) for ( let x = 0; x < W; x ++ ) {
	const i = ( y * W + x ) * 4;
	const d = Math.abs( a[ i ] - b[ i ] ) + Math.abs( a[ i + 1 ] - b[ i + 1 ] ) + Math.abs( a[ i + 2 ] - b[ i + 2 ] );
	if ( d > 6 ) grid[ GY - 1 - Math.floor( y * GY / H ) ][ Math.floor( x * GX / W ) ] ++;
}
const cell = ( W / GX ) * ( H / GY );
for ( const r of grid ) console.log( r.map( ( v ) => String( Math.round( 100 * v / cell ) ).padStart( 3 ) ).join( ' ' ) );
if ( png ) {
	const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true } );
	const page = await browser.newPage();
	await page.setViewport( { width: W, height: H * 2 } );
	const data = await page.evaluate( ( A, B, W, H ) => {
		const c = document.createElement( 'canvas' ); c.width = W; c.height = H * 2; document.body.style.margin = 0; document.body.appendChild( c );
		const x = c.getContext( '2d' ), im = x.createImageData( W, H * 2 );
		const ua = Uint8Array.from( atob( A ), ( ch ) => ch.charCodeAt( 0 ) ), ub = Uint8Array.from( atob( B ), ( ch ) => ch.charCodeAt( 0 ) );
		for ( let y = 0; y < H; y ++ ) for ( let xx = 0; xx < W; xx ++ ) {
			const s = ( ( H - 1 - y ) * W + xx ) * 4, t = ( y * W + xx ) * 4, t2 = ( ( y + H ) * W + xx ) * 4;
			for ( let k = 0; k < 3; k ++ ) { im.data[ t + k ] = ua[ s + k ]; im.data[ t2 + k ] = Math.min( 255, Math.abs( ua[ s + k ] - ub[ s + k ] ) * 8 ); }
			im.data[ t + 3 ] = 255; im.data[ t2 + 3 ] = 255;
		}
		x.putImageData( im, 0, 0 );
	}, a.toString( 'base64' ), b.toString( 'base64' ), W, H );
	await page.screenshot( { path: png } );
	await browser.close();
}
