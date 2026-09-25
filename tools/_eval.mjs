// Dev helper: evaluate an expression in the loaded app. usage: node tools/_eval.mjs "<query>" "<expr>" [mobile]
import puppeteer from 'puppeteer-core';
const [ query, expr, mode ] = process.argv.slice( 2 );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
if ( mode === 'mobile' ) {
	await page.setUserAgent( 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' );
	await page.setViewport( { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true } );
} else await page.setViewport( { width: 1280, height: 720 } );
page.on( 'console', ( m ) => { if ( /rror/.test( m.text() ) ) console.log( m.text().slice( 0, 400 ) ); } );
await page.goto( 'http://localhost:5199/?' + query, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true || window.__shotError', { timeout: 180000, polling: 250 } );
console.log( JSON.stringify( await page.evaluate( expr ) ) );
await browser.close();
