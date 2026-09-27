// Footsteps measured: recordings (any audio files, decoded in Chrome) beside the game's takes
// (src/story/steps.js), on the same measures - length, how many impacts, where the energy sits
// (spectral centroid), how much is below 300 Hz, how fast it rises, how smooth or grainy it is.
// usage: node tools/stepref.mjs <folder of recordings> [name filter]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { buildSteps } from '../src/story/steps.js';

const [ dir, filter = 'footstep' ] = process.argv.slice( 2 );
const files = fs.readdirSync( dir ).filter( ( f ) => f.includes( filter ) && /\.(ogg|wav|mp3)$/.test( f ) );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true } );
const page = await browser.newPage();
await page.setContent( '<body></body>' );
const refs = {};
for ( const f of files ) {

	const b64 = fs.readFileSync( path.join( dir, f ) ).toString( 'base64' );
	const pcm = await page.evaluate( async ( b64 ) => {

		const bin = Uint8Array.from( atob( b64 ), ( c ) => c.charCodeAt( 0 ) );
		const ctx = new OfflineAudioContext( 1, 48000, 48000 );
		const buf = await ctx.decodeAudioData( bin.buffer );
		const d = buf.getChannelData( 0 );
		// resample to 48 kHz by linear interpolation (the recordings may be 44.1)
		const k = buf.sampleRate / 48000, n = Math.floor( d.length / k ), out = new Array( n );
		for ( let i = 0; i < n; i ++ ) { const x = i * k, i0 = Math.floor( x ), t = x - i0; out[ i ] = d[ i0 ] * ( 1 - t ) + ( d[ i0 + 1 ] ?? 0 ) * t; }
		return out;

	}, b64 );
	refs[ f.replace( /\.\w+$/, '' ) ] = Float32Array.from( pcm );

}

await browser.close();

const sr = 48000;
// the measures
function measure( d ) {

	// the envelope, 2 ms frames
	const F = 96, env = [];
	for ( let i = 0; i + F <= d.length; i += F ) { let e = 0; for ( let j = 0; j < F; j ++ ) e += d[ i + j ] ** 2; env.push( Math.sqrt( e / F ) ); }
	const peak = Math.max( ...env );
	const on = env.findIndex( ( v ) => v > peak * 0.05 );
	let off = env.length - 1;
	while ( off > on && env[ off ] < peak * 0.05 ) off --;
	const rise = env.indexOf( peak ) - on;
	// impacts: rises of the 10 ms-smoothed envelope past half the peak after falling below a quarter
	const sm = env.map( ( _, i ) => env.slice( Math.max( 0, i - 2 ), i + 3 ).reduce( ( a, b ) => a + b, 0 ) / 5 );
	let hits = 0, armed = true;
	for ( const v of sm ) { if ( armed && v > peak * 0.45 ) { hits ++; armed = false; } else if ( v < peak * 0.22 ) armed = true; }
	// graininess: how much the 2 ms envelope jumps from frame to frame (0 smooth)
	let jag = 0, cnt = 0;
	for ( let i = on + 1; i <= off; i ++ ) { jag += Math.abs( env[ i ] - env[ i - 1 ] ) / ( env[ i ] + env[ i - 1 ] + 1e-9 ); cnt ++; }
	// the spectrum (a DFT at linear frequencies, over the active part)
	const a = on * F, b = Math.min( d.length, ( off + 1 ) * F );
	let num = 0, den = 0, low = 0;
	for ( let f = 40; f < 16000; f += f < 1000 ? 20 : 100 ) {

		let re = 0, im = 0;
		for ( let i = a; i < b; i += 1 ) { const w = 0.5 - 0.5 * Math.cos( 2 * Math.PI * ( i - a ) / ( b - a ) ); const ph = 2 * Math.PI * f * i / sr; re += d[ i ] * w * Math.cos( ph ); im += d[ i ] * w * Math.sin( ph ); }
		const p = ( re * re + im * im ) * ( f < 1000 ? 20 : 100 );
		num += f * p; den += p;
		if ( f < 300 ) low += p;

	}

	return { ms: ( off - on + 1 ) * 2, rise: rise * 2, hits, cent: Math.round( num / den ), low: ( low / den ).toFixed( 2 ), jag: ( jag / cnt ).toFixed( 2 ) };

}

const row = ( name, m ) => console.log( name.padEnd( 24 ), `${m.ms} ms`.padStart( 7 ), `rise ${m.rise}`.padStart( 8 ), `hits ${m.hits}`, `centroid ${m.cent} Hz`.padStart( 17 ), `<300Hz ${m.low}`, `grain ${m.jag}` );
console.log( '--- recordings' );
for ( const [ k, d ] of Object.entries( refs ) ) row( k, measure( d ) );
console.log( '--- the game\'s takes (two of each)' );
const ctx = { sampleRate: sr, createBuffer: ( c, n ) => { const d = new Float32Array( n ); return { length: n, getChannelData: () => d }; } };
const takes = buildSteps( ctx );
for ( const [ k, list ] of Object.entries( takes ) ) for ( const b of list.slice( 0, 2 ) ) row( k, measure( b.getChannelData( 0 ) ) );
// the recordings as WAVs too, for the spectrogram sheet
fs.mkdirSync( 'shots/steps', { recursive: true } );
fs.writeFileSync( 'shots/steps/refs.json', JSON.stringify( Object.fromEntries( Object.entries( refs ).map( ( [ k, d ] ) => [ k, Array.from( d.subarray( 0, 48000 ), ( v ) => Math.round( v * 1e4 ) / 1e4 ) ] ) ) ) );
