// Dev helper: loads the scene headless and prints the result of an expression.
// usage: node tools/probe.mjs "<query>" "<js expression>"
import puppeteer from 'puppeteer-core';
const [ query, expr ] = process.argv.slice( 2 );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist', '--window-size=800,450' ], protocolTimeout: 600000 } );
const page = await browser.newPage();
await page.setViewport( { width: 800, height: 450 } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
await page.goto( ( process.env.SHOT_URL || 'http://localhost:5199/' ) + '?' + query, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true || window.__shotError', { timeout: 180000, polling: 250 } );
console.log( await page.evaluate( expr ) );
await browser.close();
