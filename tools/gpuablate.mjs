// Dev helper: how much GPU time each top-level scene object costs, per pass.
// Hides each object in turn and measures the passes with timer queries.
// usage: node tools/gpuablate.mjs "<query>" [mobile]
import puppeteer from 'puppeteer-core';

const [ query = 'shot=30&speed=0.0001&t=15.5', mode ] = process.argv.slice( 2 );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
if ( mode === 'mobile' ) {

	await page.setUserAgent( 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' );
	await page.setViewport( { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true } );

} else await page.setViewport( { width: 1600, height: 900 } );

await page.goto( 'http://localhost:5199/?' + query, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true || window.__shotError', { timeout: 180000, polling: 250 } );
const res = await page.evaluate( async () => {

	const r = app.renderer, gl = r.getContext();
	const ext = gl.getExtension( 'EXT_disjoint_timer_query_webgl2' );
	// time a whole frame (no nesting problems)
	const measure = async ( frames = 16 ) => {

		const qs = [];
		for ( let f = 0; f < frames; f ++ ) {

			app.update( 1 / 60 );
			const q = gl.createQuery();
			gl.beginQuery( ext.TIME_ELAPSED_EXT, q );
			app.render();
			gl.endQuery( ext.TIME_ELAPSED_EXT );
			qs.push( q );
			await new Promise( ( res ) => requestAnimationFrame( res ) );

		}

		gl.finish();
		await new Promise( ( res ) => setTimeout( res, 300 ) );
		const v = qs.map( ( q ) => gl.getQueryParameter( q, gl.QUERY_RESULT_AVAILABLE ) ? gl.getQueryParameter( q, gl.QUERY_RESULT ) / 1e6 : null ).filter( ( x ) => x !== null ).sort( ( a, b ) => a - b );
		return v.length ? v[ Math.floor( v.length / 2 ) ] : null;

	};

	const base = await measure();
	const out = { base: +base.toFixed( 2 ) };
	const items = [];
	for ( const c of app.scene.children ) if ( c.visible && ! c.isCamera && ! c.isLight ) items.push( [ c.name || c.type, c ] );
	// the second level for big groups
	for ( const g of [ app.forest.group, app.streams.group, app.mammals.group, app.waterPlants.group, app.groundCover.group, app.meadow.group ] ) for ( const c of g.children ) if ( c.visible ) items.push( [ ( g.name || 'g' ) + '/' + ( c.name || c.type ) + '#' + g.children.indexOf( c ), c ] );
	// the mirrors themselves
	const toggles = [
		[ 'stream mirror pass', () => { const f = app.streams.renderReflection; app.streams.renderReflection = () => {}; return () => ( app.streams.renderReflection = f ); } ],
		[ 'lake mirror pass', () => { const f = app.water.renderMirror; app.water.renderMirror = () => {}; return () => ( app.water.renderMirror = f ); } ],
		[ 'shadows', () => { const f = r.shadowMap.render; r.shadowMap.render = () => {}; return () => ( r.shadowMap.render = f ); } ],
		[ 'post', () => { const f = app.post.render; app.post.render = () => {}; return () => ( app.post.render = f ); } ],
	];
	for ( const [ n, t ] of toggles ) {

		const undo = t();
		const m = await measure();
		undo();
		out[ n ] = +( base - m ).toFixed( 2 );

	}

	for ( const [ n, c ] of items ) {

		c.visible = false;
		const m = await measure();
		c.visible = true;
		const d = base - m;
		if ( d > 0.3 ) out[ n ] = +d.toFixed( 2 );

	}

	return out;

} );
console.log( JSON.stringify( res, null, 1 ) );
await browser.close();
