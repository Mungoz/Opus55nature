// Dev helper: median whole-frame GPU time over a set of views.
// usage: node tools/gpuframe.mjs [mobile] "<query1>" "<query2>" ...
import puppeteer from 'puppeteer-core';
const args = process.argv.slice( 2 );
const mobile = args[ 0 ] === 'mobile';
const queries = mobile ? args.slice( 1 ) : args;
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
for ( const q of queries ) {
	const page = await browser.newPage();
	if ( mobile ) {
		await page.setUserAgent( 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' );
		await page.setViewport( { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true } );
	} else await page.setViewport( { width: 1600, height: 900 } );
	await page.goto( 'http://localhost:5199/?' + q, { waitUntil: 'load' } );
	await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000 } );
	const ms = await page.evaluate( async () => {
		const r = app.renderer, gl = r.getContext(), ext = gl.getExtension( 'EXT_disjoint_timer_query_webgl2' );
		const qs = [];
		for ( let f = 0; f < 30; f ++ ) {
			app.update( 1 / 60 );
			const qq = gl.createQuery(); gl.beginQuery( ext.TIME_ELAPSED_EXT, qq ); app.render(); gl.endQuery( ext.TIME_ELAPSED_EXT ); qs.push( qq );
			await new Promise( ( res ) => requestAnimationFrame( res ) );
		}
		gl.finish(); await new Promise( ( res ) => setTimeout( res, 300 ) );
		const v = qs.map( ( x ) => gl.getQueryParameter( x, gl.QUERY_RESULT_AVAILABLE ) ? gl.getQueryParameter( x, gl.QUERY_RESULT ) / 1e6 : null ).filter( ( x ) => x !== null ).sort( ( a, b ) => a - b );
		return { med: +v[ Math.floor( v.length / 2 ) ].toFixed( 2 ), tris: r.info.render.triangles, calls: r.info.render.calls };
	} );
	console.log( q.slice( 0, 60 ).padEnd( 60 ), JSON.stringify( ms ) );
	await page.close();
}
await browser.close();
