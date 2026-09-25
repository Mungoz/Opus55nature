// Drives the real (non-shot) experience in headless Chrome: loader -> enter -> UI.
// usage: node tools/uitest.mjs <outDir> [url]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[ 2 ] || 'tools/out';
const url = process.argv[ 3 ] || 'http://localhost:4173/';
fs.mkdirSync( outDir, { recursive: true } );
const browser = await puppeteer.launch( {
	executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
	headless: true,
	args: [ '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required' ],
} );
const page = await browser.newPage();
await page.setViewport( { width: 1280, height: 720 } );
const logs = [];
page.on( 'console', ( m ) => logs.push( `[${m.type()}] ${m.text()}` ) );
page.on( 'pageerror', ( e ) => logs.push( `[pageerror] ${e.message}` ) );
const t0 = Date.now();
await page.goto( url, { waitUntil: 'load' } );
await page.waitForFunction( () => document.body.classList.contains( 'ready' ) || window.__shotError, { timeout: 180000 } );
console.log( `ready after ${( ( Date.now() - t0 ) / 1000 ).toFixed( 1 )}s` );
await page.screenshot( { path: path.join( outDir, 'ui-1-loader.png' ) } );
await page.click( '#enter' );
await new Promise( ( r ) => setTimeout( r, 4000 ) );
await page.screenshot( { path: path.join( outDir, 'ui-2-entered.png' ) } );
// walk forward and look around a little
await page.keyboard.down( 'KeyW' );
await new Promise( ( r ) => setTimeout( r, 1500 ) );
await page.keyboard.up( 'KeyW' );
await page.mouse.move( 640, 360 );
await page.mouse.down();
await page.mouse.move( 520, 380, { steps: 12 } );
await page.mouse.up();
// skim a stone at the lake
await page.mouse.click( 640, 420 );
await new Promise( ( r ) => setTimeout( r, 1500 ) );
await page.click( '#toolbar [data-act="time"]' );
await new Promise( ( r ) => setTimeout( r, 600 ) );
await page.screenshot( { path: path.join( outDir, 'ui-3-time.png' ) } );
await page.click( '#toolbar [data-act="settings"]' );
await new Promise( ( r ) => setTimeout( r, 600 ) );
await page.screenshot( { path: path.join( outDir, 'ui-4-settings.png' ) } );
await page.keyboard.press( 'Escape' );
await page.keyboard.press( 'KeyH' );
await new Promise( ( r ) => setTimeout( r, 600 ) );
await page.screenshot( { path: path.join( outDir, 'ui-5-help.png' ) } );
await page.keyboard.press( 'KeyH' );
await page.keyboard.press( 'KeyT' );
await new Promise( ( r ) => setTimeout( r, 9000 ) );
await page.screenshot( { path: path.join( outDir, 'ui-6-tour.png' ) } );
const stats = await page.evaluate( () => window.app.stats() );
console.log( 'stats', JSON.stringify( stats ) );
console.log( logs.filter( ( l ) => ! l.includes( 'X3595' ) ).slice( 0, 30 ).join( '\n' ) );
await browser.close();
