// Renders the footstep takes (src/story/steps.js) offline: a WAV per ground (its takes in a row,
// at walking pace) and a spectrogram sheet, to shots/steps/, with a few numbers per ground.
// usage: node tools/stepsrender.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';
import { buildSteps } from '../src/story/steps.js';

const sr = 48000;
const ctx = { sampleRate: sr, createBuffer: ( ch, n ) => { const d = new Float32Array( n ); return { length: n, getChannelData: () => d }; } };
const steps = buildSteps( ctx );
fs.mkdirSync( 'shots/steps', { recursive: true } );

function wav( path, d ) {

	const b = Buffer.alloc( 44 + d.length * 2 );
	b.write( 'RIFF', 0 ); b.writeUInt32LE( 36 + d.length * 2, 4 ); b.write( 'WAVE', 8 ); b.write( 'fmt ', 12 );
	b.writeUInt32LE( 16, 16 ); b.writeUInt16LE( 1, 20 ); b.writeUInt16LE( 1, 22 ); b.writeUInt32LE( sr, 24 ); b.writeUInt32LE( sr * 2, 28 ); b.writeUInt16LE( 2, 32 ); b.writeUInt16LE( 16, 34 );
	b.write( 'data', 36 ); b.writeUInt32LE( d.length * 2, 40 );
	for ( let i = 0; i < d.length; i ++ ) b.writeInt16LE( Math.max( - 32767, Math.min( 32767, Math.round( d[ i ] * 32767 ) ) ), 44 + i * 2 );
	fs.writeFileSync( path, b );

}

// a spectrogram of d: W columns, H rows (log frequency 40 Hz .. 16 kHz), dB
function spectro( d, W, H ) {

	const N = 1024, hop = Math.max( 1, Math.floor( ( d.length - N ) / W ) ), out = [];
	for ( let c = 0; c < W; c ++ ) {

		const o = c * hop, col = new Float32Array( H );
		for ( let r = 0; r < H; r ++ ) {

			const f = 40 * Math.pow( 16000 / 40, r / ( H - 1 ) );
			// (a single-bin DFT at f with a Hann window)
			let re = 0, im = 0;
			for ( let i = 0; i < N; i += 2 ) {

				const w = 0.5 - 0.5 * Math.cos( 2 * Math.PI * i / N ), x = ( d[ o + i ] || 0 ) * w, a = 2 * Math.PI * f * i / sr;
				re += x * Math.cos( a ); im += x * Math.sin( a );

			}

			col[ r ] = 10 * Math.log10( re * re + im * im + 1e-12 );

		}

		out.push( col );

	}

	return out;

}

// (a bare PNG writer: RGBA rows, deflated)
function writePNG( path, width, height, data ) {

	const crcT = Array.from( { length: 256 }, ( _, n ) => { let c = n; for ( let k = 0; k < 8; k ++ ) c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1; return c >>> 0; } );
	const crc = ( b ) => { let c = 0xffffffff; for ( const x of b ) c = crcT[ ( c ^ x ) & 255 ] ^ ( c >>> 8 ); return ( c ^ 0xffffffff ) >>> 0; };
	const chunk = ( type, body ) => { const len = Buffer.alloc( 4 ); len.writeUInt32BE( body.length ); const tb = Buffer.concat( [ Buffer.from( type ), body ] ); const c = Buffer.alloc( 4 ); c.writeUInt32BE( crc( tb ) ); return Buffer.concat( [ len, tb, c ] ); };
	const ihdr = Buffer.alloc( 13 ); ihdr.writeUInt32BE( width, 0 ); ihdr.writeUInt32BE( height, 4 ); ihdr[ 8 ] = 8; ihdr[ 9 ] = 6;
	const raw = Buffer.alloc( ( width * 4 + 1 ) * height );
	for ( let y = 0; y < height; y ++ ) { raw[ y * ( width * 4 + 1 ) ] = 0; Buffer.from( data.buffer, data.byteOffset + y * width * 4, width * 4 ).copy( raw, y * ( width * 4 + 1 ) + 1 ); }
	fs.writeFileSync( path, Buffer.concat( [ Buffer.from( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ), chunk( 'IHDR', ihdr ), chunk( 'IDAT', zlib.deflateSync( raw ) ), chunk( 'IEND', Buffer.alloc( 0 ) ) ] ) );

}

const names = Object.keys( steps ), W = 300, H = 90, pad = 4;
const png = { width: W, height: names.length * ( H + pad ) }; png.data = new Uint8Array( png.width * png.height * 4 );
names.forEach( ( name, gi ) => {

	// the takes at walking pace, a step every 0.55 s
	const gap = Math.floor( sr * 0.55 ), takes = steps[ name ];
	const d = new Float32Array( gap * takes.length + sr * 0.5 );
	takes.forEach( ( b, k ) => { const c = b.getChannelData( 0 ); for ( let i = 0; i < c.length; i ++ ) d[ k * gap + i ] += c[ i ]; } );
	wav( `shots/steps/${name}.wav`, d );
	// numbers: peak, loudness, where the energy sits
	let peak = 0, e = 0, cen = 0, tot = 0, bad = 0;
	for ( const b of takes ) {

		const c = b.getChannelData( 0 );
		for ( let i = 0; i < c.length; i ++ ) { peak = Math.max( peak, Math.abs( c[ i ] ) ); e += c[ i ] * c[ i ]; if ( ! Number.isFinite( c[ i ] ) ) bad ++; }

	}

	const S = spectro( d.subarray( 0, gap * 2 ), W, H );
	for ( const col of S ) col.forEach( ( v, r ) => { const p = Math.pow( 10, v / 10 ); cen += p * r; tot += p; } );
	const fc = 40 * Math.pow( 16000 / 40, cen / tot / ( H - 1 ) );
	console.log( name.padEnd( 8 ), 'peak', peak.toFixed( 3 ), 'rms', Math.sqrt( e / ( takes.length * takes[ 0 ].length ) ).toFixed( 4 ), 'centroid', Math.round( fc ) + ' Hz', bad ? 'NaN ' + bad : '' );
	let mx = - 1e9;
	for ( const col of S ) for ( const v of col ) mx = Math.max( mx, v );
	for ( let c = 0; c < W; c ++ ) for ( let r = 0; r < H; r ++ ) {

		const v = Math.max( 0, Math.min( 1, ( S[ c ][ r ] - mx + 70 ) / 70 ) );
		const y = gi * ( H + pad ) + ( H - 1 - r ), i = ( y * W + c ) * 4;
		png.data[ i ] = Math.round( 255 * Math.min( 1, v * 1.6 ) ); png.data[ i + 1 ] = Math.round( 255 * Math.max( 0, v * 1.6 - 0.6 ) ); png.data[ i + 2 ] = Math.round( 255 * Math.max( 0, 0.4 - v ) + 60 * v ); png.data[ i + 3 ] = 255;

	}

} );
writePNG( 'shots/steps/spectro.png', png.width, png.height, png.data );
console.log( 'rows:', names.join( ', ' ) );
