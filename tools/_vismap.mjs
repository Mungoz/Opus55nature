// Dev helper: draws the baked visibility mask (white = can be seen) with the start marked.
import puppeteer from 'puppeteer-core';
const out = process.argv[ 2 ];
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true } );
const page = await browser.newPage();
await page.setViewport( { width: 600, height: 600 } );
await page.goto( 'http://localhost:5199/index.html', { waitUntil: 'domcontentloaded' } );
await page.evaluate( async () => {
	const { canBeSeen } = await import( '/src/gen/visibility.js' );
	document.body.innerHTML = '';
	const c = document.createElement( 'canvas' ); c.width = 600; c.height = 600; c.style.cssText = 'position:fixed;left:0;top:0;z-index:9999'; document.body.appendChild( c );
	const g = c.getContext( '2d' );
	for ( let j = 0; j < 300; j ++ ) for ( let i = 0; i < 300; i ++ ) {
		const x = - 6000 + ( i + 0.5 ) * 40, z = - 6000 + ( j + 0.5 ) * 40;
		g.fillStyle = canBeSeen( x, z ) ? '#ddd' : '#223';
		g.fillRect( i * 2, j * 2, 2, 2 );
	}
	g.fillStyle = 'red'; g.fillRect( ( - 5 + 6000 ) / 20 - 3, ( 508 + 6000 ) / 20 - 3, 6, 6 );
	g.fillStyle = 'yellow'; g.fillRect( ( - 120 + 6000 ) / 20 - 3, ( - 3350 + 6000 ) / 20 - 3, 6, 6 );
} );
await page.screenshot( { path: out } );
await browser.close();
console.log( out );
