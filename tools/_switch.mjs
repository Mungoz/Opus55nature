import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
await page.setUserAgent( 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' );
await page.setViewport( { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true } );
await page.goto( 'http://localhost:5199/?' + ( process.argv[ 2 ] || 'shot=30&speed=1&t=15.5' ), { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000 } );
const res = await page.evaluate( () => {
	const r = app.renderer;
	for ( let i = 0; i < 3; i ++ ) { app.update( 1 / 60 ); app.render(); }
	const F = [ 'lightsStateVersion', 'receiveShadow', 'numClippingPlanes', 'numIntersection', 'toneMapping', 'outputColorSpace', 'instancing', 'skinning', 'fog', 'environment', 'vertexAlphas', 'vertexTangents', 'morphTargets', 'batching', 'instancingColor', 'instancingMorph', '__version' ];
	const snap = ( p ) => { const o = {}; for ( const f of F ) o[ f ] = p[ f ]; return o; };
	const out = {};
	let pass = 'main';
	const wrap = ( obj, fn, label ) => { const orig = obj[ fn ]; obj[ fn ] = function ( ...a ) { const p = pass; pass = label; const o = orig.apply( this, a ); pass = p; return o; }; };
	wrap( app.water, 'renderMirror', 'lake' );
	wrap( app.streams, 'renderReflection', 'stream' );
	wrap( r.shadowMap, 'render', 'shadow' );
	const orig = r.renderBufferDirect.bind( r );
	let n = 0;
	r.renderBufferDirect = function ( camera, scene, geometry, material, object, group ) {
		const p = r.properties.get( material );
		const before = snap( p ), prog = p.currentProgram;
		const res = orig( camera, scene, geometry, material, object, group );
		const after = snap( p );
		if ( p.currentProgram !== prog || before.__version !== after.__version || JSON.stringify( before ) !== JSON.stringify( after ) ) {
			n ++;
			const d = [];
			for ( const f of F ) if ( before[ f ] !== after[ f ] ) d.push( f + ':' + before[ f ] + '->' + after[ f ] );
			const k = pass + ' ' + ( material.name || material.type ) + ' [' + ( object.name || object.type ) + '] ' + d.join( ' ' );
			out[ k ] = ( out[ k ] || 0 ) + 1;
		}
		return res;
	};
	// the shadow depth materials are internal; also count program switches globally via useProgram
	const gl = r.getContext();
	const up = gl.useProgram.bind( gl );
	let uses = 0;
	gl.useProgram = ( p ) => { uses ++; return up( p ); };
	for ( let i = 0; i < 3; i ++ ) { app.update( 1 / 60 ); app.render(); }
	return { changesPerFrame: n / 3, useProgramPerFrame: uses / 3, top: Object.entries( out ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 30 ) };
} );
console.log( JSON.stringify( res, null, 1 ) );
await browser.close();
