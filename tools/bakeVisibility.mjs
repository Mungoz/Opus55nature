// Bakes which parts of the world can ever be seen from where the player can go, into
// src/gen/visibility.js. Re-run it whenever the landscape changes shape.
//
// The player is kept to the valley: ground below WORLD.reachHeight, connected to the start
// (walking or flying; flying no higher than WORLD.flyCeiling). From viewpoints across all of
// that, at eye height and at the flying ceiling, rays sweep out through the heightfield;
// a place counts as seen if anything up to TOL metres tall standing there would show above
// the horizon along some ray. The mask is then dilated for safety.
//
// usage: node tools/bakeVisibility.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
await page.setViewport( { width: 400, height: 300 } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
// ?novis: build everything, so the bake does not depend on an older mask
await page.goto( 'http://localhost:5199/?shot=5&speed=0&novis', { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 240000 } );
const res = await page.evaluate( async () => {

	const { WORLD } = await import( '/src/core/world.js' );
	const { START_POSE } = await import( '/src/app.js' );
	const td = app.terrainData;
	const H = ( x, z ) => td.heightAt( x, z );
	const reach = WORLD.reachHeight, ceil = WORLD.flyCeiling, TOL = 45;

	// 1. the reachable valley: flood fill on a 20 m grid from the start
	const G = 20, GR = WORLD.boundsRadius, GN = Math.ceil( 2 * GR / G );
	const cz0 = WORLD.lakeCenter[ 1 ];
	const cell = ( i, j ) => [ - GR + ( i + 0.5 ) * G, cz0 - GR + ( j + 0.5 ) * G ];
	const ok = new Uint8Array( GN * GN ), seen = new Uint8Array( GN * GN );
	const si = Math.floor( ( START_POSE[ 0 ] + GR ) / G ), sj = Math.floor( ( START_POSE[ 2 ] - cz0 + GR ) / G );
	const stack = [ [ si, sj ] ];
	seen[ sj * GN + si ] = 1;
	let reachable = 0;
	while ( stack.length ) {

		const [ i, j ] = stack.pop();
		const [ x, z ] = cell( i, j );
		if ( Math.hypot( x, z - cz0 ) > GR || H( x, z ) > reach ) continue;
		ok[ j * GN + i ] = 1;
		reachable ++;
		for ( const [ di, dj ] of [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ] ) {

			const a = i + di, b = j + dj;
			if ( a < 0 || b < 0 || a >= GN || b >= GN || seen[ b * GN + a ] ) continue;
			seen[ b * GN + a ] = 1;
			stack.push( [ a, b ] );

		}

	}

	// 2. viewpoints: every 5th reachable cell (100 m), at eye height and at the ceiling
	const views = [];
	for ( let j = 0; j < GN; j += 5 ) for ( let i = 0; i < GN; i += 5 ) {

		if ( ! ok[ j * GN + i ] ) continue;
		const [ x, z ] = cell( i, j );
		const g = Math.max( H( x, z ), 0 );
		views.push( [ x, g + 1.7, z ], [ x, Math.max( ceil, g + 2 ), z ] );

	}

	// the edge of the reachable area too (the highest places people can stand)
	for ( let j = 1; j < GN - 1; j ++ ) for ( let i = 1; i < GN - 1; i ++ ) {

		const k = j * GN + i;
		if ( ! ok[ k ] || ( ok[ k - 1 ] && ok[ k + 1 ] && ok[ k - GN ] && ok[ k + GN ] ) ) continue;
		if ( ( i + j ) % 3 ) continue;
		const [ x, z ] = cell( i, j );
		views.push( [ x, H( x, z ) + 1.7, z ] );

	}

	// 3. the mask: 40 m cells over the whole world
	const M = 40, MR = 6000, MN = Math.ceil( 2 * MR / M );
	const mask = new Uint8Array( MN * MN );
	const mark = ( x, z ) => {

		const i = Math.floor( ( x + MR ) / M ), j = Math.floor( ( z + MR ) / M );
		if ( i >= 0 && j >= 0 && i < MN && j < MN ) mask[ j * MN + i ] = 1;

	};

	const DIRS = 1440;
	for ( const [ ex, ey, ez ] of views ) {

		for ( let d = 0; d < DIRS; d ++ ) {

			const a = d / DIRS * Math.PI * 2, dx = Math.cos( a ), dz = Math.sin( a );
			let maxSlope = - Infinity;
			for ( let r = 4; r < 8500; r += Math.max( 4, r * 0.012 ) ) {

				const x = ex + dx * r, z = ez + dz * r;
				if ( Math.abs( x ) > MR || Math.abs( z ) > MR ) break;
				const g = H( x, z );
				const top = ( g + TOL - ey ) / r;
				if ( top >= maxSlope ) mark( x, z );
				const s = ( g - ey ) / r;
				if ( s > maxSlope ) maxSlope = s;

			}

		}

	}

	// 4. dilate by two cells
	let out = mask;
	for ( let pass = 0; pass < 2; pass ++ ) {

		const nx = out.slice();
		for ( let j = 0; j < MN; j ++ ) for ( let i = 0; i < MN; i ++ ) {

			if ( ! out[ j * MN + i ] ) continue;
			for ( let b = Math.max( 0, j - 1 ); b <= Math.min( MN - 1, j + 1 ); b ++ ) for ( let a2 = Math.max( 0, i - 1 ); a2 <= Math.min( MN - 1, i + 1 ); a2 ++ ) nx[ b * MN + a2 ] = 1;

		}

		out = nx;

	}

	let n = 0;
	const bytes = new Uint8Array( Math.ceil( MN * MN / 8 ) );
	for ( let k = 0; k < MN * MN; k ++ ) if ( out[ k ] ) { bytes[ k >> 3 ] |= 1 << ( k & 7 ); n ++; }
	let s = '';
	for ( let k = 0; k < bytes.length; k ++ ) s += String.fromCharCode( bytes[ k ] );
	return { b64: btoa( s ), MN, M, MR, visible: n / ( MN * MN ), views: views.length, reachable: reachable * G * G / 1e6 };

} );
const src = `// Generated by tools/bakeVisibility.mjs - which parts of the world can ever be seen from where
// the player can go (a ${res.MN}x${res.MN} grid of ${res.M} m cells over +-${res.MR} m, 1 bit each).
// Re-bake whenever the landscape changes shape. Things that can never be seen are not built.
const MN = ${res.MN}, M = ${res.M}, MR = ${res.MR};
const B64 = '${res.b64}';
let bits = null;
let off = typeof location !== 'undefined' && new URLSearchParams( location.search ).has( 'novis' );

export function canBeSeen( x, z ) {

	if ( off ) return true;
	if ( ! bits ) bits = Uint8Array.from( atob( B64 ), ( c ) => c.charCodeAt( 0 ) );
	const i = Math.floor( ( x + MR ) / M ), j = Math.floor( ( z + MR ) / M );
	if ( i < 0 || j < 0 || i >= MN || j >= MN ) return false;
	const k = j * MN + i;
	return ( bits[ k >> 3 ] >> ( k & 7 ) & 1 ) === 1;

}
`;
fs.writeFileSync( 'src/gen/visibility.js', src );
console.log( JSON.stringify( { visible: res.visible.toFixed( 3 ), views: res.views, reachableKm2: res.reachable.toFixed( 2 ), bytes: res.b64.length } ) );
await browser.close();
