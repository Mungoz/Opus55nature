import * as THREE from 'three';
import { polygonize, fieldAO } from '../gen/isosurface.js';
import { noise3 } from '../fauna/sdf.js';
import { FALL } from './../core/features.js';

// The rock the waterfall pours over, sculpted as a distance field and meshed with surface
// nets, after photographs of the Staubbach and Giessbach falls and of the gorges under the
// Eiger: bedded limestone in tiers of ledges, each bed recessed a little differently, split
// by vertical joints into blocks, broken and rounded by frost. It is a skin a metre or so
// proud of the terrain's own cliff (a heightfield cannot overhang or carry that detail),
// following it tier for tier; behind the falling water it steps back into an undercut
// alcove, the way a plunge pool eats back into the rock under a fall.
//
// Built in the wall's frame: u along the wall, w into the rock (from FALL.base against
// FALL.out), y up. lipB is the stream's lip, measured into the rock.

const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

const hash1 = ( i ) => {

	const x = Math.sin( i * 127.1 + 311.7 ) * 43758.5453;
	return x - Math.floor( x );

};

export function buildFallCliff( td, lipB ) {

	const base = FALL.base, out = FALL.out;
	const side = new THREE.Vector2( - out.y, out.x );
	const hAt = ( u, w ) => td.heightAt( base.x + side.x * u - out.x * w, base.y + side.y * u - out.y * w );

	// ---- the terrain's face, column by column along the wall ----
	const U = 36, du = 0.5, u0 = - U - 4;
	const nu = Math.round( ( 2 * U + 8 ) / du ) + 1;
	const dw = 0.25, wScan = 22;
	const cols = [];
	let yLo = Infinity, yHi = - Infinity;
	for ( let i = 0; i < nu; i ++ ) {

		const u = u0 + i * du;
		// the steepest drop near the lip line marks the face
		let wS = lipB, steep = 0;
		for ( let w = lipB - 18; w < lipB + 18; w += dw ) {

			const d = hAt( u, w + 1 ) - hAt( u, w - 1 );
			if ( d > steep ) { steep = d; wS = w; }

		}

		const ws = [], hs = [];
		for ( let w = wS - wScan; w <= wS + wScan; w += dw ) { ws.push( w ); hs.push( hAt( u, w ) ); }
		const top = hAt( u, wS + 4 ), foot = hAt( u, wS - 7 );
		cols.push( { u, wS, ws, hs, top, foot } );
		yLo = Math.min( yLo, foot - 4 );
		yHi = Math.max( yHi, top + 2 );

	}

	// for each column and height: how far into the rock the ground first reaches that height
	const dy = 1, ny = Math.ceil( ( yHi - yLo ) / dy ) + 1;
	const W = new Float32Array( nu * ny );
	let wLo = Infinity, wHi = - Infinity;
	cols.forEach( ( c, i ) => {

		for ( let j = 0; j < ny; j ++ ) {

			const y = yLo + j * dy;
			// march out from inside the rock to where the ground first falls below y (from the
			// valley side, the far bank of the plunge pool would read as a face)
			let w = 1e3;
			const last = c.hs.length - 1;
			if ( c.hs[ last ] >= y ) {

				w = c.ws[ 0 ];
				for ( let k = last; k > 0; k -- ) if ( c.hs[ k - 1 ] < y ) {

					const t = ( y - c.hs[ k - 1 ] ) / Math.max( c.hs[ k ] - c.hs[ k - 1 ], 1e-4 );
					w = c.ws[ k - 1 ] + t * dw;
					break;

				}

			}

			W[ i * ny + j ] = w;
			if ( w < 1e3 && y > c.foot - 1 && y < c.top + 1 ) { wLo = Math.min( wLo, w ); wHi = Math.max( wHi, w ); }

		}

	} );

	const lookW = ( u, y ) => {

		const fi = Math.min( nu - 1.001, Math.max( 0, ( u - u0 ) / du ) ), fj = Math.min( ny - 1.001, Math.max( 0, ( y - yLo ) / dy ) );
		const i = Math.floor( fi ), j = Math.floor( fj ), a = fi - i, b = fj - j;
		const w00 = W[ i * ny + j ], w10 = W[ ( i + 1 ) * ny + j ], w01 = W[ i * ny + j + 1 ], w11 = W[ ( i + 1 ) * ny + j + 1 ];
		// above the top of a column there is no face: keep that out of the blend
		if ( w00 >= 1e3 || w10 >= 1e3 || w01 >= 1e3 || w11 >= 1e3 ) return Math.min( w00, w10, w01, w11 ) >= 1e3 ? 1e3 : Math.min( w00, w10, w01, w11 );
		return ( w00 * ( 1 - a ) + w10 * a ) * ( 1 - b ) + ( w01 * ( 1 - a ) + w11 * a ) * b;

	};

	const colAt = ( u ) => cols[ Math.min( nu - 1, Math.max( 0, Math.round( ( u - u0 ) / du ) ) ) ];

	// ---- the rock's own form ----
	// Beds of uneven thickness (thin shaly partings between thick limestone beds): the soft
	// ones weather back under the hard ones, which stand out as ledges and small overhangs.
	const beds = [];
	for ( let y = yLo - 10, k = 0; y < yHi + 10; k ++ ) {

		const soft = hash1( k * 3.1 + 0.7 ) < 0.28;
		const t = soft ? 0.5 + hash1( k * 5.3 ) * 0.9 : 1.4 + hash1( k * 5.3 ) * 4.2;
		beds.push( { y0: y, t, recess: soft ? 1.0 + hash1( k * 2.7 ) * 0.8 : hash1( k * 2.7 ) * 0.7, joint: 3 + hash1( k * 9.1 ) * 7, phase: hash1( k * 4.4 ) } );
		y += t;

	}

	const bedAt = ( y ) => {

		let lo = 0, hi = beds.length - 1;
		while ( lo < hi ) {

			const m = ( lo + hi + 1 ) >> 1;
			if ( beds[ m ].y0 <= y ) lo = m; else hi = m - 1;

		}

		return lo;

	};

	const detail = ( u, y, w ) => {

		// the beds dip gently along the wall and warp a little
		const yb = y + 0.07 * u + 2.2 * noise3( u * 0.025, 0.5, 2.0 ) + 0.6 * noise3( u * 0.09, 4.5, 1.0 );
		const k = bedAt( yb ), b = beds[ k ], nb = beds[ Math.min( beds.length - 1, k + 1 ) ];
		const f = ( yb - b.y0 ) / b.t;
		// rounded where one bed meets the next
		const edge = Math.min( 0.35, 0.6 / b.t );
		const bed = b.recess * ( 1 - ss( 1 - edge, 1.0, f ) ) + nb.recess * ss( 1 - edge, 1.0, f );
		// vertical joints: spacing and offset differ from bed to bed, so the blocks stagger
		const ju = u / b.joint + b.phase + 0.15 * noise3( y * 0.1, u * 0.07, 1.0 );
		const jf = Math.abs( ju - Math.round( ju ) ) * b.joint;
		const joint = ss( 0.45, 0.05, jf ) * ( 0.5 + hash1( Math.round( ju ) * 13.7 + k ) * 0.8 );
		// gullies and buttresses, then frost-broken block faces
		const big = 1.3 * noise3( u * 0.055, y * 0.02, 3.3 );
		const n = noise3( u * 0.28, y * 0.28, w * 0.28 ) * 0.75 + noise3( u * 0.9, y * 0.9, w * 0.9 ) * 0.22;
		return bed + joint + big + n - 0.7;

	};

	const sdf = ( u, y, w ) => {

		const c = colAt( u );
		const Wf = lookW( u, y );
		if ( Wf >= 1e3 ) return 2;
		const notch = Math.exp( - u * u / ( 2 * 6 * 6 ) );
		// proud of the terrain's face, but set back behind the lip where the water pours over
		// and undercut into an alcove lower down
		// Beyond the sheer section the skin sinks back into the terrain's tiers, so the
		// two meet in the rock rather than at an edge.
		const sink = ss( U - 16, U - 4, Math.abs( u ) + 4 * noise3( y * 0.06, 5.0, 2.0 ) );
		const proud = ( 2.3 * ( 1 - notch ) - 0.6 * notch ) * ( 1 - sink ) - 2.5 * sink;
		const alcove = 2.6 * Math.exp( - u * u / ( 2 * 8 * 8 ) ) * ss( c.top - 12, c.top - 30, y );
		const face = Wf - proud + detail( u, y, w ) + alcove;
		const dFace = face - w;
		const dBack = w - ( Wf + 7 );
		const dTop = y - ( c.top + 0.45 * ( 1 - notch ) - 0.4 * notch + 0.35 * noise3( u * 0.2, w * 0.2, 7.0 ) );
		const dBot = ( c.foot - 2.5 ) - y;
		const dSide = Math.abs( u ) - ( U - 5 * ( 0.5 + 0.5 * noise3( y * 0.05, 3.0, 1.0 ) ) );
		return Math.max( dFace, dBack, dTop, dBot, dSide );

	};

	const h = 0.72;
	const min = [ - U - 1, yLo, wLo - 4 ], max = [ U + 1, yHi, wHi + 9 ];
	const { pos, nrm, idx } = polygonize( sdf, min, max, h );
	const nv = pos.length / 3;
	const P = new Float32Array( nv * 3 ), N = new Float32Array( nv * 3 ), ao = new Float32Array( nv );
	for ( let v = 0; v < nv; v ++ ) {

		const u = pos[ v * 3 ], y = pos[ v * 3 + 1 ], w = pos[ v * 3 + 2 ];
		const nu_ = nrm[ v * 3 ], ny_ = nrm[ v * 3 + 1 ], nw = nrm[ v * 3 + 2 ];
		ao[ v ] = fieldAO( sdf, u, y, w, nu_, ny_, nw, h * 1.3 );
		// wall frame to world: u along side, w against out
		P[ v * 3 ] = base.x + side.x * u - out.x * w;
		P[ v * 3 + 1 ] = y;
		P[ v * 3 + 2 ] = base.y + side.y * u - out.y * w;
		N[ v * 3 ] = side.x * nu_ - out.x * nw;
		N[ v * 3 + 1 ] = ny_;
		N[ v * 3 + 2 ] = side.y * nu_ - out.y * nw;

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.BufferAttribute( P, 3 ) );
	g.setAttribute( 'normal', new THREE.BufferAttribute( N, 3 ) );
	g.setAttribute( 'aAO', new THREE.BufferAttribute( ao, 1 ) );
	g.setIndex( new THREE.BufferAttribute( new Uint32Array( idx ), 1 ) );
	g.computeBoundingSphere();
	return g;

}
