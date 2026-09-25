// Dev helper: sampling CPU profile of app.render() (or the whole frame), self time by function.
// usage: node tools/_cpuprof.mjs "<query>" [mobile] [what=render|frame]
import puppeteer from 'puppeteer-core';

const [ query = 'shot=30&speed=1&t=15.5', mode, what = 'render' ] = process.argv.slice( 2 );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
if ( mode === 'mobile' ) {

	await page.setUserAgent( 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' );
	await page.setViewport( { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true } );

} else await page.setViewport( { width: 1600, height: 900 } );

await page.goto( 'http://localhost:5199/?' + query, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000 } );
await page.evaluate( ( w ) => {

	window.__loop = async ( n ) => {

		for ( let i = 0; i < n; i ++ ) {

			if ( w === 'frame' ) app.update( 1 / 60 ); else app.update( 1 / 60 );
			app.render();
			await new Promise( ( r ) => requestAnimationFrame( r ) );

		}

	};

}, what );
await page.evaluate( () => window.__loop( 20 ) );
const cdp = await page.createCDPSession();
await cdp.send( 'Profiler.enable' );
await cdp.send( 'Profiler.setSamplingInterval', { interval: 100 } );
await cdp.send( 'Profiler.start' );
await page.evaluate( () => window.__loop( 120 ) );
const { profile } = await cdp.send( 'Profiler.stop' );
// self time per function, and inclusive time for app.render's callees
const byId = new Map( profile.nodes.map( ( n ) => [ n.id, n ] ) );
const self = new Map();
const counts = new Map();
for ( const s of profile.samples ) counts.set( s, ( counts.get( s ) || 0 ) + 1 );
let total = 0;
for ( const [ id, c ] of counts ) {

	const n = byId.get( id );
	const f = n.callFrame;
	const key = ( f.functionName || '(anon)' ) + ' ' + f.url.split( '/' ).pop().split( '?' )[ 0 ] + ':' + ( f.lineNumber + 1 );
	self.set( key, ( self.get( key ) || 0 ) + c );
	total += c;

}

// inclusive: walk parents
const parent = new Map();
for ( const n of profile.nodes ) for ( const ch of n.children || [] ) parent.set( ch, n.id );
const incl = new Map();
for ( const [ id, c ] of counts ) {

	const seen = new Set();
	let cur = id;
	while ( cur !== undefined ) {

		const f = byId.get( cur ).callFrame;
		const key = ( f.functionName || '(anon)' ) + ' ' + f.url.split( '/' ).pop().split( '?' )[ 0 ] + ':' + ( f.lineNumber + 1 );
		if ( ! seen.has( key ) ) { incl.set( key, ( incl.get( key ) || 0 ) + c ); seen.add( key ); }
		cur = parent.get( cur );

	}

}

const pct = ( v ) => ( 100 * v / total ).toFixed( 1 ) + '%';
console.log( 'SELF' );
for ( const [ k, v ] of [ ...self ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 30 ) ) console.log( pct( v ).padStart( 7 ), k );
console.log( 'INCLUSIVE' );
for ( const [ k, v ] of [ ...incl ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 45 ) ) console.log( pct( v ).padStart( 7 ), k );
await browser.close();
