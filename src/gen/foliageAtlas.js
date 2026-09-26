import * as THREE from 'three';
import { RNG } from '../core/rng.js';

// Procedurally painted foliage atlas (1024x2048):
//   spruce, larch and stone pine branch sprays (top view, stem at the left, tip at the right)
//   birch, aspen and rowan leaf clusters, a shrub, bilberry heath and a bracken frond
//   bottom-right corner: an opaque block used by bark (so shadows keep trunks)
export const ATLAS = {
	w: 1024,
	h: 2048,
	spruce: { x: 0, y: 0, w: 1024, h: 320 },
	larch: { x: 0, y: 336, w: 1024, h: 320 },
	birchA: { x: 0, y: 672, w: 336, h: 336 },
	birchB: { x: 344, y: 672, w: 336, h: 336 },
	shrub: { x: 688, y: 672, w: 320, h: 320 },
	pine: { x: 0, y: 1024, w: 1024, h: 320 },
	aspenA: { x: 0, y: 1360, w: 336, h: 336 },
	aspenB: { x: 344, y: 1360, w: 336, h: 336 },
	rowan: { x: 688, y: 1360, w: 336, h: 336 },
	fern: { x: 0, y: 1712, w: 672, h: 320 },
	heath: { x: 688, y: 1712, w: 320, h: 320 },
	solid: { x: 1008, y: 2032, w: 16, h: 16 },
};

// UV rectangle in texture space (flipY = true: canvas top is v = 1)
export function atlasRect( r ) {

	return { u0: r.x / ATLAS.w, u1: ( r.x + r.w ) / ATLAS.w, v0: 1 - ( r.y + r.h ) / ATLAS.h, v1: 1 - r.y / ATLAS.h };

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
	let shade = 1;
	const needleColor = ( rng2, u ) => {

		const tip = rng2.next() < 0.05 + u * 0.22;
		return tip ? hsl( 100 + rng2.next() * 24, 0.28, ( 0.25 + rng2.next() * 0.08 ) * shade ) : hsl( 128 + rng2.next() * 28, 0.2 + rng2.next() * 0.14, ( 0.08 + rng2.next() * 0.1 + u * 0.04 ) * shade );

	};

	const opts = { spacing: 2.6, curl: 0, stemW: 3, stemColor: 'rgb(60,44,30)', needleLen: 16, needleAngle: 1.05, needleW: 2.6, needleColor };
	// laterals first (under), then the main stem on top
	for ( let s = 0.03; s < 0.95; s += 0.021 ) {

		const env = r.h * 0.4 * Math.pow( Math.sin( Math.PI * Math.min( s * 1.08, 1 ) ), 0.7 ) * ( 1 - s * 0.3 );
		for ( const side of [ - 1, 1 ] ) {

			if ( rng.next() < 0.1 ) continue;
			shade = 0.65 + rng.next() * 0.45;
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

	shade = 1;
	needleShoot( ctx, rng, x0, cy, 0, len, { ...opts, stemW: 5 } );

}

function paintLarch( ctx, r, rng ) {

	const cy = r.y + r.h / 2;
	const len = r.w * 0.95;
	const x0 = r.x + 10;
	let shade = 1;
	const tuftColor = () => {

		const k = rng.next();
		if ( k < 0.08 ) return hsl( 68 + rng.next() * 12, 0.42, 0.4 * shade ); // a few still greenish
		if ( k < 0.25 ) return hsl( 32 + rng.next() * 6, 0.62, ( 0.4 + rng.next() * 0.1 ) * shade ); // orange
		return hsl( 42 + rng.next() * 8, 0.6 + rng.next() * 0.16, ( 0.46 + rng.next() * 0.14 ) * shade );

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

		const env = r.h * 0.39 * Math.pow( Math.sin( Math.PI * Math.min( s * 1.05, 1 ) ), 0.6 );
		for ( const side of [ - 1, 1 ] ) {

			if ( rng.next() < 0.18 ) continue;
			shade = 0.62 + rng.next() * 0.45;
			const ang = side * ( 0.55 + rng.next() * 0.4 );
			shoot( x0 + s * len, cy, ang, env / Math.sin( Math.abs( ang ) ) * ( 0.75 + rng.next() * 0.3 ), 2.2, 0 );

		}

	}

	shade = 1;
	shoot( x0, cy, 0, len, 4.5, 1 );

}

let leafDepth = 1; // set by the painters: < 1 for leaves deep inside a cluster
function leaf( ctx, x, y, ang, L, W, color, rng ) {

	ctx.save();
	ctx.translate( x, y );
	ctx.rotate( ang );
	const outline = () => {

		ctx.beginPath();
		ctx.moveTo( 0, 0 );
		ctx.bezierCurveTo( L * 0.25, - W * 0.75, L * 0.7, - W * 0.55, L, 0 );
		ctx.bezierCurveTo( L * 0.7, W * 0.55, L * 0.25, W * 0.75, 0, 0 );

	};

	outline();
	ctx.fillStyle = color;
	ctx.fill();
	ctx.save();
	ctx.clip();
	// light across the blade: one half catches it, the tip is paler, the base shadowed
	const g = ctx.createLinearGradient( 0, - W * 0.6, 0, W * 0.6 );
	const lift = 0.1 + rng.next() * 0.12;
	g.addColorStop( 0, `rgba(255,248,220,${lift})` );
	g.addColorStop( 0.5, 'rgba(255,248,220,0)' );
	g.addColorStop( 0.52, `rgba(40,26,8,${0.1 + rng.next() * 0.12})` );
	g.addColorStop( 1, 'rgba(40,26,8,0.2)' );
	ctx.fillStyle = g;
	ctx.fillRect( 0, - W, L, W * 2 );
	const t = ctx.createLinearGradient( 0, 0, L, 0 );
	t.addColorStop( 0, 'rgba(30,20,5,0.22)' );
	t.addColorStop( 0.35, 'rgba(30,20,5,0)' );
	t.addColorStop( 1, 'rgba(255,245,210,0.12)' );
	ctx.fillStyle = t;
	ctx.fillRect( 0, - W, L, W * 2 );
	// autumn spots on some leaves
	if ( rng.next() < 0.22 ) {

		const n = 1 + Math.floor( rng.next() * 4 );
		for ( let k = 0; k < n; k ++ ) {

			ctx.fillStyle = `rgba(${70 + rng.next() * 40},${38 + rng.next() * 20},12,${0.35 + rng.next() * 0.35})`;
			ctx.beginPath();
			ctx.arc( L * ( 0.25 + rng.next() * 0.6 ), ( rng.next() - 0.5 ) * W * 0.8, W * ( 0.08 + rng.next() * 0.14 ), 0, Math.PI * 2 );
			ctx.fill();

		}

	}

	// leaves deep in the cluster are in the shade of the ones in front
	if ( leafDepth < 1 ) {

		ctx.fillStyle = `rgba(12,10,4,${( 1 - leafDepth ) * 0.55})`;
		ctx.fillRect( 0, - W, L, W * 2 );

	}

	ctx.restore();
	// a darker rim and the midrib
	outline();
	ctx.strokeStyle = 'rgba(50,34,10,0.28)';
	ctx.lineWidth = 0.8;
	ctx.stroke();
	ctx.strokeStyle = 'rgba(70,50,18,0.4)';
	ctx.lineWidth = 0.9;
	ctx.beginPath();
	ctx.moveTo( 0, 0 );
	ctx.lineTo( L * 0.92, 0 );
	ctx.stroke();
	ctx.restore();

}

function paintBirch( ctx, r, rng, palette, shape = { L: 22, Lr: 12, w: 0.62, per: 3 } ) {

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

	for ( let i = 0; i < 5; i ++ ) grow( cx + ( rng.next() - 0.5 ) * 30, by, - Math.PI / 2 + ( i - 2 ) * 0.4 + ( rng.next() - 0.5 ) * 0.2, r.h * ( 0.42 + rng.next() * 0.16 ), 3, 0 );
	// leaves hang from the twigs; painted back to front, the ones behind in shade
	const leaves = [];
	for ( const [ x, y, a ] of twigs ) {

		const n = 1 + Math.floor( rng.next() * shape.per );
		for ( let k = 0; k < n; k ++ ) leaves.push( { x, y, a: a + ( rng.next() - 0.5 ) * 2.8 + Math.PI * 0.1, L: shape.L + rng.next() * shape.Lr, depth: rng.next() } );

	}

	leaves.sort( ( p, q ) => p.depth - q.depth );
	for ( const l of leaves ) {

		leafDepth = 0.45 + 0.55 * l.depth;
		leaf( ctx, l.x, l.y, l.a, l.L, l.L * shape.w, palette( rng ), rng );

	}

	leafDepth = 1;

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

// Swiss stone pine: stout twigs ending in dense brushes of long blue-green needles.
function paintPine( ctx, r, rng ) {

	const cy = r.y + r.h / 2;
	const len = r.w * 0.93;
	const x0 = r.x + 10;
	const col = () => rng.next() < 0.14 ? hsl( 178 + rng.next() * 14, 0.13, 0.36 + rng.next() * 0.1 ) : hsl( 148 + rng.next() * 24, 0.2 + rng.next() * 0.14, 0.12 + rng.next() * 0.1 );
	const needles = ( x, y, a, n, spread, l0, l1 ) => {

		for ( let k = 0; k < n; k ++ ) {

			const na = a + ( rng.next() - 0.5 ) * spread;
			const nl = l0 + rng.next() * ( l1 - l0 );
			stroke( ctx, x, y, x + Math.cos( na ) * nl, y + Math.sin( na ) * nl, 1.5 + rng.next() * 0.6, col() );

		}

	};

	const brush = ( x, y, ang, L, w ) => {

		const steps = Math.max( 3, Math.floor( L / 4 ) );
		let px = x, py = y, a = ang;
		for ( let i = 0; i < steps; i ++ ) {

			const u = i / steps;
			const nx = px + Math.cos( a ) * L / steps, ny = py + Math.sin( a ) * L / steps;
			stroke( ctx, px, py, nx, ny, w * ( 1 - u * 0.5 ), 'rgb(84,66,54)' );
			// older wood is sparse, the last part is a dense brush
			if ( u > 0.25 ) needles( nx, ny, a, 2 + Math.floor( u * u * 9 ), 1.7, 16, 26 );
			if ( u > 0.3 && u < 0.8 && rng.next() < 0.3 ) {

				const sa = a + ( rng.next() < 0.5 ? - 1 : 1 ) * ( 0.5 + rng.next() * 0.4 );
				const sl = L * ( 0.2 + rng.next() * 0.15 );
				stroke( ctx, nx, ny, nx + Math.cos( sa ) * sl, ny + Math.sin( sa ) * sl, w * 0.45, 'rgb(84,66,54)' );
				needles( nx + Math.cos( sa ) * sl, ny + Math.sin( sa ) * sl, sa, 18, 2.2, 14, 24 );

			}

			px = nx; py = ny;
			a += ( rng.next() - 0.5 ) * 0.2;

		}

		needles( px, py, a, 26, 2.4, 16, 28 );

	};

	for ( let s = 0.05; s < 0.93; s += 0.045 + rng.next() * 0.03 ) {

		const env = r.h * 0.37 * Math.pow( Math.sin( Math.PI * Math.min( s * 1.04, 1 ) ), 0.55 );
		for ( const side of [ - 1, 1 ] ) {

			if ( rng.next() < 0.12 ) continue;
			const ang = side * ( 0.5 + rng.next() * 0.45 );
			brush( x0 + s * len, cy + ( rng.next() - 0.5 ) * 4, ang, Math.max( 12, env / Math.sin( Math.abs( ang ) ) * ( 0.62 + rng.next() * 0.3 ) - 22 ), 2.4 );

		}

	}

	brush( x0, cy, 0, len - 26, 5 );

}

// Rowan: pinnate leaves in scarlet and orange, with heavy clusters of berries.
function paintRowan( ctx, r, rng ) {

	const cx = r.x + r.w / 2, by = r.y + r.h * 0.94;
	const twigs = [];
	const grow = ( x, y, a, L, w, d ) => {

		const steps = 5;
		let px = x, py = y;
		for ( let i = 0; i < steps; i ++ ) {

			const nx = px + Math.cos( a ) * L / steps, ny = py + Math.sin( a ) * L / steps;
			stroke( ctx, px, py, nx, ny, w * ( 1 - i / steps * 0.5 ), 'rgb(78,58,48)' );
			twigs.push( [ nx, ny, a ] );
			if ( d < 2 && rng.next() < 0.4 ) grow( nx, ny, a + ( rng.next() - 0.5 ) * 1.5, L * 0.5, w * 0.6, d + 1 );
			px = nx; py = ny;
			a += ( rng.next() - 0.5 ) * 0.3;

		}

	};

	for ( let i = 0; i < 4; i ++ ) grow( cx + ( rng.next() - 0.5 ) * 30, by, - Math.PI / 2 + ( i - 1.5 ) * 0.42, r.h * ( 0.4 + rng.next() * 0.14 ), 3, 0 );
	const tone = () => {

		const k = rng.next();
		if ( k < 0.45 ) return [ 2 + rng.next() * 10, 0.72, 0.33 + rng.next() * 0.1 ];
		if ( k < 0.85 ) return [ 16 + rng.next() * 14, 0.8, 0.42 + rng.next() * 0.1 ];
		return [ 40 + rng.next() * 12, 0.65, 0.45 ];

	};

	for ( const [ x, y, a ] of twigs ) {

		if ( rng.next() < 0.3 ) continue;
		// one compound leaf: a rachis with 5-7 pairs of leaflets and a terminal one
		const [ h, sat, l ] = tone();
		const la = a + ( rng.next() - 0.5 ) * 2.2;
		const RL = 40 + rng.next() * 22;
		const pairs = 5 + Math.floor( rng.next() * 3 );
		stroke( ctx, x, y, x + Math.cos( la ) * RL, y + Math.sin( la ) * RL, 1.2, 'rgb(110,60,40)' );
		for ( let p = 1; p <= pairs; p ++ ) {

			const u = p / ( pairs + 1 );
			const px = x + Math.cos( la ) * RL * u, py = y + Math.sin( la ) * RL * u;
			for ( const side of [ - 1, 1 ] ) leaf( ctx, px, py, la + side * 1.05, 13 + rng.next() * 4, 5, hsl( h + ( rng.next() - 0.5 ) * 6, sat, l + ( rng.next() - 0.5 ) * 0.06 ), rng );

		}

		leaf( ctx, x + Math.cos( la ) * RL, y + Math.sin( la ) * RL, la, 14, 5.5, hsl( h, sat, l ), rng );

	}

	// berry clusters hang at the ends of the shoots
	for ( let c = 0; c < 9; c ++ ) {

		const [ x, y ] = twigs[ Math.floor( rng.next() * twigs.length ) ];
		const n = 10 + Math.floor( rng.next() * 12 );
		for ( let b = 0; b < n; b ++ ) {

			const bx = x + ( rng.next() - 0.5 ) * 22, by2 = y + rng.next() * 16;
			ctx.fillStyle = hsl( 6 + rng.next() * 10, 0.9, 0.4 + rng.next() * 0.08 );
			ctx.beginPath();
			ctx.arc( bx, by2, 3.4 + rng.next() * 1.2, 0, Math.PI * 2 );
			ctx.fill();
			ctx.fillStyle = 'rgba(255,220,190,0.5)';
			ctx.beginPath();
			ctx.arc( bx - 1, by2 - 1, 1, 0, Math.PI * 2 );
			ctx.fill();

		}

	}

}

// Bracken frond in autumn: a rachis with pinnae, each divided into pinnules.
function paintFern( ctx, r, rng ) {

	const cy = r.y + r.h / 2;
	const len = r.w * 0.95;
	const x0 = r.x + 8;
	const tone = () => {

		const k = rng.next();
		if ( k < 0.5 ) return [ 22 + rng.next() * 10, 0.42 + rng.next() * 0.12, 0.26 + rng.next() * 0.08 ];
		if ( k < 0.78 ) return [ 32 + rng.next() * 8, 0.35, 0.36 + rng.next() * 0.08 ];
		return [ 62 + rng.next() * 18, 0.3, 0.3 ];

	};

	stroke( ctx, x0, cy, x0 + len, cy, 3, 'rgb(96,62,36)' );
	for ( let s = 0.04; s < 0.97; s += 0.055 ) {

		const env = r.h * 0.46 * Math.pow( 1 - s, 0.8 ) * Math.min( 1, s * 6 + 0.4 );
		for ( const side of [ - 1, 1 ] ) {

			const [ h, sat, l ] = tone();
			const px = x0 + s * len, a = side * ( 0.95 + rng.next() * 0.15 );
			const L = env / Math.sin( Math.abs( a ) );
			stroke( ctx, px, cy, px + Math.cos( a ) * L, cy + Math.sin( a ) * L, 1.6, 'rgb(110,70,40)' );
			const n = Math.max( 3, Math.floor( L / 7 ) );
			for ( let k = 1; k <= n; k ++ ) {

				const u = k / ( n + 1 );
				const qx = px + Math.cos( a ) * L * u, qy = cy + Math.sin( a ) * L * u;
				const pl = ( 9 + ( 1 - u ) * 8 ) * Math.min( 1, env / 60 + 0.4 );
				for ( const s2 of [ - 1, 1 ] ) {

					if ( rng.next() < 0.07 ) continue; // a few withered gaps
					leaf( ctx, qx, qy, a + s2 * 1.2, pl, pl * 0.42, hsl( h + ( rng.next() - 0.5 ) * 8, sat, l + ( rng.next() - 0.5 ) * 0.08 ), rng );

				}

			}

		}

	}

}

// Bilberry heath: wiry green stems with small oval leaves turning crimson and orange.
// Painted lying on its side: the stems rise from the left edge toward the right.
function paintHeath( ctx, r, rng ) {

	const x0 = r.x + 3;
	for ( let i = 0; i < 46; i ++ ) {

		let x = x0, y = r.y + r.h * ( 0.08 + rng.next() * 0.84 ), a = ( rng.next() - 0.5 ) * 1.1;
		const L = r.w * ( 0.45 + rng.next() * 0.5 );
		const steps = 7;
		const k = rng.next();
		const base = k < 0.5 ? [ 350 + rng.next() * 14, 0.62, 0.3 ] : k < 0.78 ? [ 14 + rng.next() * 16, 0.72, 0.4 ] : [ 95 + rng.next() * 25, 0.4, 0.3 ];
		for ( let s2 = 0; s2 < steps; s2 ++ ) {

			const nx = x + Math.cos( a ) * L / steps, ny = y + Math.sin( a ) * L / steps;
			stroke( ctx, x, y, nx, ny, 1.8, 'rgb(70,96,50)' );
			for ( const side of [ - 1, 1 ] ) {

				if ( rng.next() < 0.15 ) continue;
				leaf( ctx, nx, ny, a + side * ( 0.9 + rng.next() * 0.4 ), 12 + rng.next() * 6, 7.5, hsl( ( base[ 0 ] + ( rng.next() - 0.5 ) * 12 + 360 ) % 360, base[ 1 ], base[ 2 ] + ( rng.next() - 0.5 ) * 0.08 ), rng );

			}

			x = nx; y = ny;
			a += ( rng.next() - 0.5 ) * 0.35;

		}

	}

	// a few dark berries
	for ( let b = 0; b < 16; b ++ ) {

		ctx.fillStyle = hsl( 240, 0.35, 0.15 + rng.next() * 0.08 );
		ctx.beginPath();
		ctx.arc( r.x + r.w * ( 0.3 + rng.next() * 0.6 ), r.y + r.h * ( 0.1 + rng.next() * 0.8 ), 3.4, 0, Math.PI * 2 );
		ctx.fill();

	}

}

export function buildFoliageAtlas() {

	const S = ATLAS.w, SH = ATLAS.h;
	const canvas = document.createElement( 'canvas' );
	canvas.width = S;
	canvas.height = SH;
	const ctx = canvas.getContext( '2d', { willReadFrequently: true } );
	ctx.clearRect( 0, 0, S, SH );
	const rng = new RNG( 1234 );

	const within = ( r, paint ) => {

		ctx.save();
		ctx.beginPath();
		ctx.rect( r.x, r.y, r.w, r.h );
		ctx.clip();
		paint();
		ctx.restore();
		// fade anything that still reaches the edge of the cell
		const img = ctx.getImageData( r.x, r.y, r.w, r.h ), dd = img.data, E = 10;
		for ( let y = 0; y < r.h; y ++ ) for ( let x = 0; x < r.w; x ++ ) {

			const e = Math.min( x, y, r.w - 1 - x, r.h - 1 - y );
			if ( e < E ) dd[ ( y * r.w + x ) * 4 + 3 ] *= e / E;

		}

		ctx.putImageData( img, r.x, r.y );

	};

	within( ATLAS.spruce, () => paintSpruce( ctx, ATLAS.spruce, rng ) );
	within( ATLAS.larch, () => paintLarch( ctx, ATLAS.larch, rng ) );
	const birchPal = ( g ) => {

		const k = g.next();
		if ( k < 0.12 ) return hsl( 60 + g.next() * 12, 0.45, 0.4 );
		if ( k < 0.24 ) return hsl( 32 + g.next() * 6, 0.62, 0.42 );
		if ( k < 0.3 ) return hsl( 26 + g.next() * 8, 0.45, 0.32 );
		return hsl( 45 + g.next() * 8, 0.62 + g.next() * 0.16, 0.48 + g.next() * 0.12 );

	};

	within( ATLAS.birchA, () => paintBirch( ctx, ATLAS.birchA, rng, birchPal ) );
	within( ATLAS.birchB, () => paintBirch( ctx, ATLAS.birchB, rng, birchPal ) );
	within( ATLAS.shrub, () => paintBirch( ctx, ATLAS.shrub, rng, ( g ) => {

		const k = g.next();
		if ( k < 0.5 ) return hsl( 3 + g.next() * 10, 0.62, 0.26 + g.next() * 0.1 );
		if ( k < 0.85 ) return hsl( 16 + g.next() * 12, 0.7, 0.34 + g.next() * 0.1 );
		return hsl( 38 + g.next() * 8, 0.6, 0.4 );

	} ) );
	within( ATLAS.pine, () => paintPine( ctx, ATLAS.pine, rng ) );
	const aspenPal = ( g ) => {

		const k = g.next();
		if ( k < 0.12 ) return hsl( 62 + g.next() * 12, 0.45, 0.42 );
		if ( k < 0.3 ) return hsl( 26 + g.next() * 10, 0.68, 0.44 );
		if ( k < 0.36 ) return hsl( 8 + g.next() * 8, 0.58, 0.36 );
		return hsl( 46 + g.next() * 8, 0.7, 0.5 + g.next() * 0.1 );

	};

	const aspenShape = { L: 17, Lr: 8, w: 0.95, per: 3 };
	within( ATLAS.aspenA, () => paintBirch( ctx, ATLAS.aspenA, rng, aspenPal, aspenShape ) );
	within( ATLAS.aspenB, () => paintBirch( ctx, ATLAS.aspenB, rng, aspenPal, aspenShape ) );
	within( ATLAS.rowan, () => paintRowan( ctx, ATLAS.rowan, rng ) );
	within( ATLAS.fern, () => paintFern( ctx, ATLAS.fern, rng ) );
	within( ATLAS.heath, () => paintHeath( ctx, ATLAS.heath, rng ) );
	ctx.fillStyle = 'rgb(128,128,128)';
	ctx.fillRect( ATLAS.solid.x, ATLAS.solid.y, ATLAS.solid.w, ATLAS.solid.h );

	// Bleed colour into transparent texels so mipmaps don't fringe dark.
	const img = ctx.getImageData( 0, 0, S, SH );
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
	const known = new Uint8Array( S * SH );
	for ( let p = 0; p < S * SH; p ++ ) {

		const a = d[ p * 4 + 3 ];
		if ( a > 24 ) known[ p ] = 1;

	}

	for ( let pass = 0; pass < 4; pass ++ ) {

		const snapshot = known.slice();
		for ( let y = 1; y < SH - 1; y ++ ) {

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

	for ( let p = 0; p < S * SH; p ++ ) {

		if ( ! known[ p ] ) {

			const i = p * 4;
			d[ i ] = avg[ 0 ]; d[ i + 1 ] = avg[ 1 ]; d[ i + 2 ] = avg[ 2 ];

		}

	}

	const tex = new THREE.DataTexture( d, S, SH, THREE.RGBAFormat, THREE.UnsignedByteType );
	tex.flipY = true;
	// DataTexture ignores flipY on upload; flip rows ourselves so v=1 is the canvas top
	const flipped = new Uint8Array( d.length );
	for ( let y = 0; y < SH; y ++ ) flipped.set( d.subarray( y * S * 4, ( y + 1 ) * S * 4 ), ( SH - 1 - y ) * S * 4 );
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
