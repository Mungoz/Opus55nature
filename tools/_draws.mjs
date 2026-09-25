// Dev helper: draw calls per pass and per object (name path), and whether each casts shadows.
import puppeteer from 'puppeteer-core';
const [ query = 'shot=30&speed=0.0001&t=15.5' ] = process.argv.slice( 2 );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
await page.setUserAgent( 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' );
await page.setViewport( { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true } );
await page.goto( 'http://localhost:5199/?' + query, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000 } );
const res = await page.evaluate( () => {
	const r = app.renderer;
	app.update = () => {};
	let pass = 'main';
	const wrap = ( obj, fn, label ) => { const orig = obj[ fn ]; obj[ fn ] = function ( ...a ) { const p = pass; pass = label; const o = orig.apply( this, a ); pass = p; return o; }; };
	wrap( app.water, 'renderMirror', 'lake' );
	for ( const p of app.streams.ponds ) wrap( p, 'renderMirror', 'pond' );
	wrap( app.streams, 'renderReflection', 'stream' );
	wrap( r.shadowMap, 'render', 'shadow' );
	const origR = r.render.bind( r );
	r.render = function ( s, c ) { const p = pass; if ( c === app.camera ) pass = c.layers.mask === 8 ? 'water' : c.layers.mask === 16 ? 'fx' : 'main'; const o = origR( s, c ); pass = p; return o; };
	const per = {}, tot = {};
	const orig = r.renderBufferDirect.bind( r );
	r.renderBufferDirect = function ( camera, scene, geometry, material, object, group ) {
		let n = object; const path = [];
		while ( n && n !== app.scene ) { path.unshift( n.name || n.type ); n = n.parent; }
		const k = pass + ' | ' + path.slice( 0, 2 ).join( '/' ) + ( object.castShadow ? ' (cs)' : '' ) + ( object.frustumCulled ? '' : ' (nocull)' );
		per[ k ] = ( per[ k ] || 0 ) + 1;
		tot[ pass ] = ( tot[ pass ] || 0 ) + 1;
		return orig( camera, scene, geometry, material, object, group );
	};
	app.render();
	return { tot, per: Object.entries( per ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 60 ).map( ( [ k, v ] ) => v + '  ' + k ) };
} );
console.log( JSON.stringify( res, null, 1 ) );
await browser.close();
