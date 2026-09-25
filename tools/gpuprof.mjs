// Dev helper: GPU time per render pass, measured with WebGL timer queries.
// usage: node tools/gpuprof.mjs "<query>" [mobile]
//   mobile: emulate a phone (844x390 @3x, the preset a phone would pick)
import puppeteer from 'puppeteer-core';

const [ query = 'shot=30&speed=0.0001&t=15.5', mode, setup = '' ] = process.argv.slice( 2 );
const mobile = mode === 'mobile';
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist', '--enable-webgl-draft-extensions' ] } );
const page = await browser.newPage();
if ( mobile ) {

	await page.setUserAgent( 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' );
	await page.setViewport( { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true } );

} else await page.setViewport( { width: 1600, height: 900 } );

page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
await page.goto( 'http://localhost:5199/?' + query, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true || window.__shotError', { timeout: 180000, polling: 250 } );
if ( setup ) await page.evaluate( setup );
const res = await page.evaluate( async () => {

	const r = app.renderer, gl = r.getContext();
	const ext = gl.getExtension( 'EXT_disjoint_timer_query_webgl2' );
	if ( ! ext ) return { error: 'no timer query extension' };
	const totals = {}, pending = [];
	const stack = [];
	let current = null;
	const begin = ( label ) => {

		if ( current ) {

			gl.endQuery( ext.TIME_ELAPSED_EXT );
			pending.push( current );

		}

		const q = gl.createQuery();
		gl.beginQuery( ext.TIME_ELAPSED_EXT, q );
		current = { q, label };

	};

	const push = ( label ) => {

		stack.push( current ? current.label : null );
		begin( label );

	};

	const pop = () => {

		const parent = stack.pop();
		if ( parent ) begin( parent );
		else if ( current ) {

			gl.endQuery( ext.TIME_ELAPSED_EXT );
			pending.push( current );
			current = null;

		}

	};

	const wrap = ( obj, fn, label ) => {

		const orig = obj[ fn ];
		obj[ fn ] = function ( ...a ) {

			push( label );
			const out = orig.apply( this, a );
			pop();
			return out;

		};

	};

	wrap( r.shadowMap, 'render', 'shadows' );
	wrap( app.water, 'renderMirror', 'lake mirror' );
	for ( const p of app.streams.ponds ) wrap( p, 'renderMirror', 'pond mirrors' );
	wrap( app.streams, 'renderReflection', 'stream mirror' );
	wrap( app, '_copy', 'refraction copy' );
	wrap( app.post, 'render', 'post' );
	// the three scene passes in app.render
	const origRender = r.render.bind( r );
	let depth = 0;
	r.render = function ( scene, camera ) {

		if ( depth === 0 && camera === app.camera ) {

			const m = camera.layers.mask;
			const label = m === ( 1 << 3 ) ? 'water pass' : m === ( 1 << 4 ) ? 'effects pass' : 'main scene';
			depth ++;
			push( label );
			origRender( scene, camera );
			pop();
			depth --;
			return;

		}

		depth ++;
		origRender( scene, camera );
		depth --;

	};

	const frames = 40;
	for ( let f = 0; f < frames; f ++ ) {

		app.update( 1 / 60 );
		app.render();
		await new Promise( ( res ) => requestAnimationFrame( res ) );

	}

	gl.finish();
	await new Promise( ( res ) => setTimeout( res, 500 ) );
	let lost = 0;
	for ( const p of pending ) {

		const ok = gl.getQueryParameter( p.q, gl.QUERY_RESULT_AVAILABLE );
		if ( ! ok || gl.getParameter( ext.GPU_DISJOINT_EXT ) ) {

			lost ++;
			continue;

		}

		totals[ p.label ] = ( totals[ p.label ] || 0 ) + gl.getQueryParameter( p.q, gl.QUERY_RESULT ) / 1e6;

	}

	const out = {};
	let sum = 0;
	for ( const k in totals ) {

		out[ k ] = +( totals[ k ] / frames ).toFixed( 2 );
		sum += out[ k ];

	}

	return { preset: app.presetName, px: [ r.domElement.width, r.domElement.height ], ms: out, total: +sum.toFixed( 2 ), lost, tris: r.info.render.triangles, calls: r.info.render.calls };

} );
console.log( JSON.stringify( res, null, 1 ) );
await browser.close();
