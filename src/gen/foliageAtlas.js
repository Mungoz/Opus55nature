import * as THREE from 'three';
import { RNG } from '../core/rng.js';

// Procedurally painted foliage atlas (1024x1024):
//   row 0: spruce branch spray (top view), trunk at the left, tip at the right
//   row 1: larch branch with golden needle tufts
//   row 2: two birch leaf clusters
//   bottom-right corner: an opaque block used by bark (so shadows keep trunks)
export const ATLAS = {
	size: 1024,
	spruce: { x: 0, y: 0, w: 1024, h: 320 },
	larch: { x: 0, y: 336, w: 1024, h: 320 },
	birchA: { x: 0, y: 672, w: 336, h: 336 },
	birchB: { x: 344, y: 672, w: 336, h: 336 },
	shrub: { x: 688, y: 672, w: 320, h: 320 },
	solid: { x: 1008, y: 1008, w: 16, h: 16 },
};

// UV rectangle in texture space (flipY = true: canvas top is v = 1)
export function atlasRect( r ) {

	const s = ATLAS.size;
	return { u0: r.x / s, u1: ( r.x + r.w ) / s, v0: 1 - ( r.y + r.h ) / s, v1: 1 - r.y / s };

}

function hsl( h, s, l, a = 1 ) {

	return `hsla(${h.toFixed( 1 )},${( s * 100 ).toFixed( 1 )}%,${( l * 100 ).toFixed( 1 )}%,${a})`;

}

function stroke( ctx, x0, y0, x1, y1, w, color ) {

	ctx.strokeStyle = color;
	ctx.lineWidth = w;
	ctx.beginPath();
	ctx.moveTo( x0, y0 );
	ctx.lineTo( x1, y1 );
	ctx.stroke();

}

// A shoot: a slightly curved stem clothed in needles.
function needleShoot( ctx, rng, x, y, ang, len, opts ) {

	const steps = Math.max( 2, Math.floor( len / opts.spacing ) );
	let px = x, py = y, a = ang;
	const pts = [];
	for ( let i = 0; i <= steps; i ++ ) {

		pts.push( [ px, py, a ] );
		a += ( rng.next() - 0.5 ) * 0.05 + opts.curl;
		px += Math.cos( a ) * len / steps;
		py += Math.sin( a ) * len / steps;

	}

	// stem
	ctx.lineCap = 'round';
	for ( let i = 0; i < pts.length - 1; i ++ ) {

		const w = opts.stemW * ( 1 - i / pts.length * 0.7 );
		stroke( ctx, pts[ i ][ 0 ], pts[ i ][ 1 ], pts[ i + 1 ][ 0 ], pts[ i + 1 ][ 1 ], w, opts.stemColor );

	}

	// needles
	for ( let i = 0; i < pts.length; i ++ ) {

		const [ sx, sy, sa ] = pts[ i ];
		const u = i / pts.length;
		const nl = opts.needleLen * ( 1 - u * 0.35 ) * ( 0.8 + rng.next() * 0.4 );
		for ( const side of [ - 1, 1 ] ) {

			const na = sa + side * ( opts.needleAngle + ( rng.next() - 0.5 ) * 0.4 );
			const col = opts.needleColor( rng, u );
			stroke( ctx, sx, sy, sx + Math.cos( na ) * nl, sy + Math.sin( na ) * nl, opts.needleW, col );

		}

	}

	return pts;

}

function paintSpruce( ctx, r, rng ) {

	const cy = r.y + r.h / 2;
	const len = r.w * 0.95;
	const x0 = r.x + 10;
	const needleColor = ( rng2, u ) => {

		const tip = rng2.next() < 0.06 + u * 0.1;
		return tip ? hsl( 110 + rng2.next() * 20, 0.25, 0.26 + rng2.next() * 0.06 ) : hsl( 135 + rng2.next() * 25, 0.22 + rng2.next() * 0.12, 0.1 + rng2.next() * 0.08 );

	};

	const opts = { spacing: 2.6, curl: 0, stemW: 3, stemColor: 'rgb(60,44,30)', needleLen: 16, needleAngle: 1.05, needleW: 2.6, needleColor };
	// laterals first (under), then the main stem on top
	for ( let s = 0.03; s < 0.95; s += 0.021 ) {

		const env = r.h * 0.47 * Math.pow( Math.sin( Math.PI * Math.min( s * 1.08, 1 ) ), 0.7 ) * ( 1 - s * 0.3 );
		for ( const side of [ - 1, 1 ] ) {

			if ( rng.next() < 0.1 ) continue;
			const ang = side * ( 0.75 + rng.next() * 0.35 );
			const L = env / Math.sin( Math.abs( ang ) ) * ( 0.7 + rng.next() * 0.35 );
			const pts = needleShoot( ctx, rng, x0 + s * len, cy + ( rng.next() - 0.5 ) * 4, ang, L, { ...opts, stemW: 1.8, needleLen: 14, curl: - side * 0.004 } );
			// secondary shoots
			for ( let k = 2; k < pts.length - 3; k += 3 + Math.floor( rng.next() * 3 ) ) {

				const [ px, py, pa ] = pts[ k ];
				const sa = pa + ( rng.next() < 0.5 ? - 1 : 1 ) * ( 0.7 + rng.next() * 0.3 );
				needleShoot( ctx, rng, px, py, sa, L * ( 0.3 + rng.next() * 0.25 ), { ...opts, stemW: 1.1, needleLen: 12 } );

			}

		}

	}

	needleShoot( ctx, rng, x0, cy, 0, len, { ...opts, stemW: 5 } );

}

function paintLarch( ctx, r, rng ) {

	const cy = r.y + r.h / 2;
	const len = r.w * 0.95;
	const x0 = r.x + 10;
	const tuftColor = () => {

		const k = rng.next();
		if ( k < 0.08 ) return hsl( 70 + rng.next() * 12, 0.5, 0.42 ); // a few still greenish
		if ( k < 0.25 ) return hsl( 30 + rng.next() * 6, 0.75, 0.42 + rng.next() * 0.1 ); // orange
		return hsl( 40 + rng.next() * 9, 0.72 + rng.next() * 0.2, 0.48 + rng.next() * 0.14 );

	};

	const tuft = ( x, y, ang, size ) => {

		const n = 16 + Math.floor( rng.next() * 12 );
		const base = tuftColor();
		for ( let i = 0; i < n; i ++ ) {

			const a = ang + ( rng.next() - 0.5 ) * 2.6;
			const l = size * ( 0.6 + rng.next() * 0.5 );
			stroke( ctx, x, y, x + Math.cos( a ) * l, y + Math.sin( a ) * l, 1.7, rng.next() < 0.7 ? base : tuftColor() );

		}

	};

	const shoot = ( x, y, ang, L, w, depth ) => {

		const steps = Math.max( 3, Math.floor( L / 8 ) );
		let px = x, py = y, a = ang;
		for ( let i = 0; i < steps; i ++ ) {

			const nx = px + Math.cos( a ) * L / steps, ny = py + Math.sin( a ) * L / steps;
			stroke( ctx, px, py, nx, ny, w * ( 1 - i / steps * 0.6 ), 'rgb(92,62,40)' );
			tuft( nx, ny, a + ( rng.next() < 0.5 ? - 1 : 1 ) * 0.8, 15 + rng.next() * 7 );
			if ( rng.next() < 0.6 ) tuft( ( px + nx ) / 2, ( py + ny ) / 2, a + ( rng.next() < 0.5 ? - 1 : 1 ) * 0.9, 13 + rng.next() * 6 );
			if ( depth < 1 && i > 1 && rng.next() < 0.45 ) shoot( nx, ny, a + ( rng.next() < 0.5 ? - 1 : 1 ) * ( 0.6 + rng.next() * 0.5 ), L * 0.4, w * 0.6, depth + 1 );
			px = nx; py = ny;
			a += ( rng.next() - 0.5 ) * 0.15;

		}

		// tip tuft
		tuft( px, py, a, 12 );

	};

	for ( let s = 0.04; s < 0.93; s += 0.035 + rng.next() * 0.015 ) {

		const env = r.h * 0.46 * Math.pow( Math.sin( Math.PI * Math.min( s * 1.05, 1 ) ), 0.6 );
		for ( const side of [ - 1, 1 ] ) {

			if ( rng.next() < 0.18 ) continue;
			const ang = side * ( 0.55 + rng.next() * 0.4 );
			shoot( x0 + s * len, cy, ang, env / Math.sin( Math.abs( ang ) ) * ( 0.75 + rng.next() * 0.3 ), 2.2, 0 );

		}

	}

	shoot( x0, cy, 0, len, 4.5, 1 );

}

function leaf( ctx, x, y, ang, L, W, color, rng ) {

	ctx.save();
	ctx.translate( x, y );
	ctx.rotate( ang );
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo( 0, 0 );
	ctx.bezierCurveTo( L * 0.25, - W * 0.75, L * 0.7, - W * 0.55, L, 0 );
	ctx.bezierCurveTo( L * 0.7, W * 0.55, L * 0.25, W * 0.75, 0, 0 );
	ctx.fill();
	// midrib + slight shading on one half
	ctx.strokeStyle = 'rgba(80,60,20,0.35)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo( 0, 0 );
	ctx.lineTo( L * 0.95, 0 );
	ctx.stroke();
	ctx.fillStyle = `rgba(60,40,0,${0.08 + rng.next() * 0.1})`;
	ctx.beginPath();
	ctx.moveTo( 0, 0 );
	ctx.bezierCurveTo( L * 0.25, W * 0.75, L * 0.7, W * 0.55, L, 0 );
	ctx.closePath();
	ctx.fill();
	ctx.restore();

}

function paintBirch( ctx, r, rng, palette ) {

	const cx = r.x + r.w / 2, by = r.y + r.h * 0.92;
	const twigs = [];
	const grow = ( x, y, a, L, w, d ) => {

		const steps = 6;
		let px = x, py = y;
		for ( let i = 0; i < steps; i ++ ) {

			const nx = px + Math.cos( a ) * L / steps, ny = py + Math.sin( a ) * L / steps;
			stroke( ctx, px, py, nx, ny, w * ( 1 - i / steps * 0.5 ), 'rgb(70,50,40)' );
			twigs.push( [ nx, ny, a ] );
			if ( d < 2 && rng.next() < 0.35 ) grow( nx, ny, a + ( rng.next() - 0.5 ) * 1.6, L * 0.5, w * 0.6, d + 1 );
			px = nx; py = ny;
			a += ( rng.next() - 0.5 ) * 0.3;

		}

	};

	for ( let i = 0; i < 5; i ++ ) grow( cx + ( rng.next() - 0.5 ) * 30, by, - Math.PI / 2 + ( i - 2 ) * 0.45 + ( rng.next() - 0.5 ) * 0.2, r.h * ( 0.55 + rng.next() * 0.25 ), 3, 0 );
	// leaves hang from the twigs
	for ( const [ x, y, a ] of twigs ) {

		const n = 1 + Math.floor( rng.next() * 3 );
		for ( let k = 0; k < n; k ++ ) {

			const la = a + ( rng.next() - 0.5 ) * 2.8 + Math.PI * 0.1;
			const L = 22 + rng.next() * 12;
			leaf( ctx, x, y, la, L, L * 0.62, palette( rng ), rng );

		}

	}

}

function paintShrub( ctx, r, rng ) {

	// rowan / bilberry: small pinnate leaves in reds and oranges
	const pal = ( g ) => {

		const k = g.next();
		if ( k < 0.45 ) return hsl( 4 + g.next() * 10, 0.7, 0.32 + g.next() * 0.12 );
		if ( k < 0.8 ) return hsl( 16 + g.next() * 14, 0.8, 0.4 + g.next() * 0.1 );
		return hsl( 42 + g.next() * 10, 0.7, 0.45 );

	};

	const cx = r.x + r.w / 2, by = r.y + r.h * 0.95;
	for ( let i = 0; i < 9; i ++ ) {

		let x = cx + ( rng.next() - 0.5 ) * 40, y = by, a = - Math.PI / 2 + ( rng.next() - 0.5 ) * 1.6;
		const L = r.h * ( 0.5 + rng.next() * 0.4 );
		for ( let s = 0; s < 8; s ++ ) {

			const nx = x + Math.cos( a ) * L / 8, ny = y + Math.sin( a ) * L / 8;
			stroke( ctx, x, y, nx, ny, 2.2, 'rgb(80,40,30)' );
			for ( const side of [ - 1, 1 ] ) leaf( ctx, nx, ny, a + side * 1.1, 16 + rng.next() * 8, 9, pal( rng ), rng );
			x = nx; y = ny;
			a += ( rng.next() - 0.5 ) * 0.25;

		}

		// berries
		for ( let b = 0; b < 6; b ++ ) {

			ctx.fillStyle = hsl( 2 + rng.next() * 8, 0.85, 0.38 );
			ctx.beginPath();
			ctx.arc( x + ( rng.next() - 0.5 ) * 14, y + ( rng.next() - 0.5 ) * 14, 3.2, 0, Math.PI * 2 );
			ctx.fill();

		}

	}

}

export function buildFoliageAtlas() {

	const S = ATLAS.size;
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = S;
	const ctx = canvas.getContext( '2d', { willReadFrequently: true } );
	ctx.clearRect( 0, 0, S, S );
	const rng = new RNG( 1234 );

	paintSpruce( ctx, ATLAS.spruce, rng );
	paintLarch( ctx, ATLAS.larch, rng );
	const birchPal = ( g ) => {

		const k = g.next();
		if ( k < 0.1 ) return hsl( 62 + g.next() * 10, 0.55, 0.4 );
		if ( k < 0.22 ) return hsl( 30 + g.next() * 6, 0.8, 0.45 );
		return hsl( 44 + g.next() * 8, 0.8 + g.next() * 0.15, 0.5 + g.next() * 0.12 );

	};

	paintBirch( ctx, ATLAS.birchA, rng, birchPal );
	paintBirch( ctx, ATLAS.birchB, rng, birchPal );
	paintBirch( ctx, ATLAS.shrub, rng, ( g ) => {

		const k = g.next();
		if ( k < 0.5 ) return hsl( 3 + g.next() * 10, 0.62, 0.26 + g.next() * 0.1 );
		if ( k < 0.85 ) return hsl( 16 + g.next() * 12, 0.7, 0.34 + g.next() * 0.1 );
		return hsl( 38 + g.next() * 8, 0.6, 0.4 );

	} );
	ctx.fillStyle = 'rgb(128,128,128)';
	ctx.fillRect( ATLAS.solid.x, ATLAS.solid.y, ATLAS.solid.w, ATLAS.solid.h );

	// Bleed colour into transparent texels so mipmaps don't fringe dark.
	const img = ctx.getImageData( 0, 0, S, S );
	const d = img.data;
	let sr = 0, sg = 0, sb = 0, n = 0;
	for ( let i = 0; i < d.length; i += 4 ) {

		if ( d[ i + 3 ] > 200 ) {

			sr += d[ i ]; sg += d[ i + 1 ]; sb += d[ i + 2 ]; n ++;

		}

	}

	const avg = [ sr / n, sg / n, sb / n ];
	// Canvas stores premultiplied colour, so faint edge texels have muddy RGB.
	// Un-premultiply them, then dilate solid colour outward into empty texels.
	const known = new Uint8Array( S * S );
	for ( let p = 0; p < S * S; p ++ ) {

		const a = d[ p * 4 + 3 ];
		if ( a > 24 ) known[ p ] = 1;

	}

	for ( let pass = 0; pass < 4; pass ++ ) {

		const snapshot = known.slice();
		for ( let y = 1; y < S - 1; y ++ ) {

			for ( let x = 1; x < S - 1; x ++ ) {

				const p = y * S + x;
				if ( snapshot[ p ] ) continue;
				let r = 0, g = 0, b = 0, c = 0;
				for ( const o of [ - 1, 1, - S, S ] ) {

					if ( snapshot[ p + o ] ) {

						const q = ( p + o ) * 4;
						r += d[ q ]; g += d[ q + 1 ]; b += d[ q + 2 ]; c ++;

					}

				}

				if ( c ) {

					const i = p * 4;
					d[ i ] = r / c; d[ i + 1 ] = g / c; d[ i + 2 ] = b / c;
					known[ p ] = 1;

				}

			}

		}

	}

	for ( let p = 0; p < S * S; p ++ ) {

		if ( ! known[ p ] ) {

			const i = p * 4;
			d[ i ] = avg[ 0 ]; d[ i + 1 ] = avg[ 1 ]; d[ i + 2 ] = avg[ 2 ];

		}

	}

	const tex = new THREE.DataTexture( d, S, S, THREE.RGBAFormat, THREE.UnsignedByteType );
	tex.flipY = true;
	// DataTexture ignores flipY on upload; flip rows ourselves so v=1 is the canvas top
	const flipped = new Uint8Array( d.length );
	for ( let y = 0; y < S; y ++ ) flipped.set( d.subarray( y * S * 4, ( y + 1 ) * S * 4 ), ( S - 1 - y ) * S * 4 );
	tex.image.data = flipped;
	tex.flipY = false;
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.generateMipmaps = true;
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	tex.magFilter = THREE.LinearFilter;
	tex.anisotropy = 4;
	tex.premultiplyAlpha = false;
	tex.needsUpdate = true;
	return tex;

}
