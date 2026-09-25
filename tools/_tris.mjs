// Dev helper: triangles each scene object submits per frame, over all passes.
// usage: node tools/_tris.mjs "<query>" [mobile]
import puppeteer from 'puppeteer-core';

const [ query = 'shot=30&speed=0.0001&t=15.5', mode ] = process.argv.slice( 2 );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
if ( mode === 'mobile' ) {

	await page.setUserAgent( 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' );
	await page.setViewport( { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true } );

} else await page.setViewport( { width: 1600, height: 900 } );

await page.goto( 'http://localhost:5199/?' + query, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000 } );
const res = await page.evaluate( () => {

	const r = app.renderer;
	app.update = () => {};
	r.info.autoReset = false;
	// per pass: wrap the mirror and shadow renders
	const byPass = {};
	let pass = 'main';
	const wrap = ( obj, fn, label ) => {

		const orig = obj[ fn ];
		obj[ fn ] = function ( ...a ) {

			const prev = pass;
			pass = label;
			const out = orig.apply( this, a );
			pass = prev;
			return out;

		};

	};

	wrap( r.shadowMap, 'render', 'shadow' );
	wrap( app.water, 'renderMirror', 'lake mirror' );
	for ( const p of app.streams.ponds ) wrap( p.mesh, 'onBeforeRender', 'pond mirror' );
	wrap( app.streams, 'renderReflection', 'stream mirror' );
	const tally = {};
	app.scene.traverse( ( o ) => {

		if ( ! ( o.isMesh || o.isPoints || o.isLine ) ) return;
		let n = o;
		const path = [];
		while ( n && n !== app.scene ) { path.unshift( n.name || n.type ); n = n.parent; }
		const key = path.slice( 0, 2 ).join( '/' );
		const ob = o.onBeforeRender;
		o.onBeforeRender = function ( renderer, scene, camera, geometry, material, group ) {

			ob.apply( this, arguments );
			let t = 0;
			const idx = geometry.index, cnt = idx ? idx.count : geometry.attributes.position.count;
			const range = Math.min( cnt, geometry.drawRange.count );
			t = range / 3 * ( geometry.isInstancedBufferGeometry ? geometry.instanceCount : o.isInstancedMesh ? o.count : 1 );
			const k = pass + ' | ' + key;
			tally[ k ] = ( tally[ k ] || 0 ) + t;
			byPass[ pass ] = ( byPass[ pass ] || 0 ) + t;

		};

	} );

	r.info.reset();
	app.render();
	const top = Object.entries( tally ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 40 ).map( ( [ k, v ] ) => k + ': ' + ( v / 1e6 ).toFixed( 2 ) + 'M' );
	for ( const k in byPass ) byPass[ k ] = ( byPass[ k ] / 1e6 ).toFixed( 2 ) + 'M';
	return { info: r.info.render.triangles, byPass, top };

} );
console.log( JSON.stringify( res, null, 1 ) );
await browser.close();
