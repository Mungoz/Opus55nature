import puppeteer from 'puppeteer-core';
const out = process.argv[ 2 ];
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
for ( const [ name, vp, ua ] of [
	[ 'desk', { width: 1600, height: 900 } ],
	[ 'deskN', { width: 1000, height: 700 } ],
	[ 'port', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, iphone ],
	[ 'land', { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true }, iphone ],
] ) {

	const page = await browser.newPage();
	if ( ua ) await page.setUserAgent( ua );
	await page.setViewport( vp );
	await page.goto( 'http://localhost:5199/?quality=medium', { waitUntil: 'load' } );
	await page.waitForFunction( () => document.body.classList.contains( 'ready' ), { timeout: 180000 } );
	if ( vp.hasTouch ) await page.tap( '#enter' ); else await page.click( '#enter' );
	await new Promise( ( r ) => setTimeout( r, 2500 ) );
	// drag the time slider to sunset
	const box = await ( await page.$( '#tb-slider' ) ).boundingBox();
	const x = box.x + box.width * ( 17.1 / 24 ), y = box.y + box.height / 2;
	if ( vp.hasTouch ) await page.touchscreen.tap( x, y ); else await page.mouse.click( x, y );
	await new Promise( ( r ) => setTimeout( r, 1500 ) );
	console.log( name, 'hours', ( await page.evaluate( () => window.app.hours ) ).toFixed( 2 ), 'slider', JSON.stringify( box ) );
	await page.screenshot( { path: `${out}/lay-${name}.png` } );
	await page.close();

}

await browser.close();
