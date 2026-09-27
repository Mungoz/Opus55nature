// Dev helper: a magnified crop of a screenshot (for looking closely at a detail).
// usage: node tools/pngcrop.mjs in.png x y w h scale out.png   (x, y from the top left)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const [ inp, x, y, w, h, sc, out ] = process.argv.slice( 2 );
const s = + sc;
const data = 'data:image/png;base64,' + fs.readFileSync( inp ).toString( 'base64' );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true } );
const page = await browser.newPage();
await page.setViewport( { width: + w * s, height: + h * s } );
await page.setContent( `<body style="margin:0"><canvas id="c" width="${ w * s }" height="${ h * s }"></canvas></body>` );
await page.evaluate( async ( src, x, y, w, h, s ) => {

	const img = new Image();
	img.src = src;
	await img.decode();
	const g = document.getElementById( 'c' ).getContext( '2d' );
	g.imageSmoothingEnabled = false;
	g.drawImage( img, x, y, w, h, 0, 0, w * s, h * s );

}, data, + x, + y, + w, + h, s );
await page.screenshot( { path: out } );
await browser.close();
