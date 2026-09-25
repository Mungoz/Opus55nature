// Dev helper: records uniform / sampler usage of every linked shader program and flags
// any that exceed typical mobile limits (224 fragment uniform vectors, 16 samplers).
import puppeteer from 'puppeteer-core';
const q = process.argv[ 2 ] || 'shot=30&speed=0';
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
await page.setViewport( { width: 800, height: 450 } );
await page.evaluateOnNewDocument( () => {

	window.__progs = [];
	const rows = ( gl, type, size ) => {

		const T = {
			[ gl.FLOAT_MAT4 ]: 4, [ gl.FLOAT_MAT3 ]: 3, [ gl.FLOAT_MAT2 ]: 2,
		};
		return ( T[ type ] || 1 ) * size;

	};

	const isSampler = ( gl, t ) => [ gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_2D_ARRAY_SHADOW, gl.INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_2D ].includes( t );
	const orig = WebGL2RenderingContext.prototype.linkProgram;
	WebGL2RenderingContext.prototype.linkProgram = function ( p ) {

		orig.call( this, p );
		const gl = this;
		const ok = gl.getProgramParameter( p, gl.LINK_STATUS );
		const n = gl.getProgramParameter( p, gl.ACTIVE_UNIFORMS );
		let vec = 0, samp = 0;
		const big = [];
		for ( let i = 0; i < n; i ++ ) {

			const u = gl.getActiveUniform( p, i );
			if ( isSampler( gl, u.type ) ) samp += u.size;
			else {

				const r = rows( gl, u.type, u.size );
				vec += r;
				if ( r >= 24 ) big.push( u.name + ':' + r );

			}

		}

		const sh = gl.getAttachedShaders( p ).map( ( s ) => gl.getShaderSource( s ) );
		const fs = sh.find( ( s ) => s.includes( 'gl_FragColor' ) || s.includes( 'out highp vec4 pc_fragColor' ) ) || sh[ 1 ] || '';
		const name = ( fs.match( /#define SHADER_NAME (.*)/ ) || [] )[ 1 ] || fs.split( '\n' ).find( ( l ) => /^\/\/ |uniform sampler2D|void main/.test( l ) ) || '?';
		window.__progs.push( { ok, vec, samp, big, name: name.slice( 0, 60 ), len: fs.length } );

	};

} );
await page.goto( 'http://localhost:5199/?' + q, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true || window.__shotError', { timeout: 180000, polling: 250 } );
const progs = await page.evaluate( () => window.__progs );
const lim = await page.evaluate( () => { const gl = app.renderer.getContext(); return { frag: gl.getParameter( gl.MAX_FRAGMENT_UNIFORM_VECTORS ), vert: gl.getParameter( gl.MAX_VERTEX_UNIFORM_VECTORS ), tex: gl.getParameter( gl.MAX_TEXTURE_IMAGE_UNITS ) }; } );
console.log( 'this GPU limits', JSON.stringify( lim ), 'programs', progs.length );
progs.sort( ( a, b ) => b.vec - a.vec );
for ( const p of progs.slice( 0, 12 ) ) console.log( ( p.vec > 220 || p.samp > 16 || ! p.ok ? '!! ' : '   ' ) + `vec ${p.vec}  samp ${p.samp}  ok ${p.ok}  ${p.name}  ${p.big.join( ' ' )}` );
const bySamp = [ ...progs ].sort( ( a, b ) => b.samp - a.samp ).slice( 0, 4 );
for ( const p of bySamp ) console.log( `   samp ${p.samp} vec ${p.vec} ${p.name}` );
await browser.close();
