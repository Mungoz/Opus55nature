// Dev helper: a phone-emulated screenshot (844x390 @3x) of a URL. usage: node tools/_mshot.mjs <url> <out.png>
import puppeteer from 'puppeteer-core';
const [ url, out ] = process.argv.slice( 2 );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
await page.setUserAgent( 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' );
await page.setViewport( { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true } );
page.on( 'console', ( m ) => { if ( /rror|warn/i.test( m.type() ) ) console.log( '[' + m.type() + ']', m.text().slice( 0, 300 ) ); } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
await page.goto( url, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true || window.__shotError', { timeout: 180000, polling: 250 } );
console.log( 'error:', await page.evaluate( () => window.__shotError || null ) );
await page.screenshot( { path: out } );
await browser.close();
