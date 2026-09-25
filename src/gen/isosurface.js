// Surface nets over a signed distance function, for sculpted static props.
// The field is sampled on a coarse grid first; fine samples are only taken in
// blocks the surface can pass through, which keeps big sparse shapes cheap.

const CORNERS = [ [ 0, 0, 0 ], [ 1, 0, 0 ], [ 0, 1, 0 ], [ 1, 1, 0 ], [ 0, 0, 1 ], [ 1, 0, 1 ], [ 0, 1, 1 ], [ 1, 1, 1 ] ];
const EDGES = [ [ 0, 1 ], [ 2, 3 ], [ 4, 5 ], [ 6, 7 ], [ 0, 2 ], [ 1, 3 ], [ 4, 6 ], [ 5, 7 ], [ 0, 4 ], [ 1, 5 ], [ 2, 6 ], [ 3, 7 ] ];

// sdf(x, y, z) -> distance (negative inside); min/max: bounds [x, y, z]; h: cell size.
// Returns { pos, nrm, idx } (flat arrays).
export function polygonize( sdf, min, max, h ) {

	const B = 4; // fine cells per coarse block
	const nx = Math.ceil( ( max[ 0 ] - min[ 0 ] ) / h / B ) * B + 1;
	const ny = Math.ceil( ( max[ 1 ] - min[ 1 ] ) / h / B ) * B + 1;
	const nz = Math.ceil( ( max[ 2 ] - min[ 2 ] ) / h / B ) * B + 1;
	const I = ( i, j, k ) => i + nx * ( j + ny * k );
	const field = new Float32Array( nx * ny * nz ).fill( NaN );
	const at = ( i, j, k ) => {

		const q = I( i, j, k );
		let v = field[ q ];
		if ( v !== v ) v = field[ q ] = sdf( min[ 0 ] + i * h, min[ 1 ] + j * h, min[ 2 ] + k * h );
		return v;

	};

	// coarse pass: skip blocks the surface cannot reach (with slack for non-exact fields)
	const reach = B * h * 1.75 * 1.3;
	for ( let k = 0; k < nz - 1; k += B ) for ( let j = 0; j < ny - 1; j += B ) for ( let i = 0; i < nx - 1; i += B ) {

		let far = true, sgn = 0;
		for ( const [ a, b, c ] of CORNERS ) {

			const v = at( i + a * B, j + b * B, k + c * B );
			if ( Math.abs( v ) < reach ) far = false;
			sgn += v < 0 ? - 1 : 1;

		}

		if ( far && Math.abs( sgn ) === 8 ) {

			const fill = sgn < 0 ? - reach : reach;
			for ( let c = 0; c <= B; c ++ ) for ( let b = 0; b <= B; b ++ ) for ( let a = 0; a <= B; a ++ ) {

				const q = I( i + a, j + b, k + c );
				if ( field[ q ] !== field[ q ] ) field[ q ] = fill;

			}

		}

	}

	for ( let k = 0; k < nz; k ++ ) for ( let j = 0; j < ny; j ++ ) for ( let i = 0; i < nx; i ++ ) at( i, j, k );

	const cellVert = new Int32Array( nx * ny * nz ).fill( - 1 );
	const pos = [];
	const cv = new Float32Array( 8 );
	for ( let k = 0; k < nz - 1; k ++ ) for ( let j = 0; j < ny - 1; j ++ ) for ( let i = 0; i < nx - 1; i ++ ) {

		let inside = 0;
		for ( let c = 0; c < 8; c ++ ) {

			cv[ c ] = field[ I( i + CORNERS[ c ][ 0 ], j + CORNERS[ c ][ 1 ], k + CORNERS[ c ][ 2 ] ) ];
			if ( cv[ c ] < 0 ) inside ++;

		}

		if ( inside === 0 || inside === 8 ) continue;
		let sx = 0, sy = 0, sz = 0, n = 0;
		for ( const [ a, b ] of EDGES ) {

			const da = cv[ a ], db = cv[ b ];
			if ( ( da < 0 ) === ( db < 0 ) ) continue;
			const t = da / ( da - db );
			sx += CORNERS[ a ][ 0 ] + ( CORNERS[ b ][ 0 ] - CORNERS[ a ][ 0 ] ) * t;
			sy += CORNERS[ a ][ 1 ] + ( CORNERS[ b ][ 1 ] - CORNERS[ a ][ 1 ] ) * t;
			sz += CORNERS[ a ][ 2 ] + ( CORNERS[ b ][ 2 ] - CORNERS[ a ][ 2 ] ) * t;
			n ++;

		}

		cellVert[ I( i, j, k ) ] = pos.length / 3;
		pos.push( min[ 0 ] + ( i + sx / n ) * h, min[ 1 ] + ( j + sy / n ) * h, min[ 2 ] + ( k + sz / n ) * h );

	}

	const idx = [];
	const quad = ( a, b, c, d, flip ) => {

		if ( a < 0 || b < 0 || c < 0 || d < 0 ) return;
		if ( flip ) idx.push( a, c, b, a, d, c );
		else idx.push( a, b, c, a, c, d );

	};

	for ( let k = 1; k < nz - 1; k ++ ) for ( let j = 1; j < ny - 1; j ++ ) for ( let i = 0; i < nx - 1; i ++ ) {

		const a = field[ I( i, j, k ) ] < 0, b = field[ I( i + 1, j, k ) ] < 0;
		if ( a !== b ) quad( cellVert[ I( i, j - 1, k - 1 ) ], cellVert[ I( i, j, k - 1 ) ], cellVert[ I( i, j, k ) ], cellVert[ I( i, j - 1, k ) ], a );

	}

	for ( let k = 1; k < nz - 1; k ++ ) for ( let j = 0; j < ny - 1; j ++ ) for ( let i = 1; i < nx - 1; i ++ ) {

		const a = field[ I( i, j, k ) ] < 0, b = field[ I( i, j + 1, k ) ] < 0;
		if ( a !== b ) quad( cellVert[ I( i - 1, j, k - 1 ) ], cellVert[ I( i - 1, j, k ) ], cellVert[ I( i, j, k ) ], cellVert[ I( i, j, k - 1 ) ], a );

	}

	for ( let k = 0; k < nz - 1; k ++ ) for ( let j = 1; j < ny - 1; j ++ ) for ( let i = 1; i < nx - 1; i ++ ) {

		const a = field[ I( i, j, k ) ] < 0, b = field[ I( i, j, k + 1 ) ] < 0;
		if ( a !== b ) quad( cellVert[ I( i - 1, j - 1, k ) ], cellVert[ I( i, j - 1, k ) ], cellVert[ I( i, j, k ) ], cellVert[ I( i - 1, j, k ) ], a );

	}

	// normals from the field gradient; fix any triangle wound against them
	const nv = pos.length / 3;
	const nrm = new Float32Array( nv * 3 );
	const e = h * 0.5;
	for ( let v = 0; v < nv; v ++ ) {

		const x = pos[ v * 3 ], y = pos[ v * 3 + 1 ], z = pos[ v * 3 + 2 ];
		const gx = sdf( x + e, y, z ) - sdf( x - e, y, z );
		const gy = sdf( x, y + e, z ) - sdf( x, y - e, z );
		const gz = sdf( x, y, z + e ) - sdf( x, y, z - e );
		const l = Math.hypot( gx, gy, gz ) || 1;
		nrm[ v * 3 ] = gx / l; nrm[ v * 3 + 1 ] = gy / l; nrm[ v * 3 + 2 ] = gz / l;

	}

	for ( let t = 0; t < idx.length; t += 3 ) {

		const a = idx[ t ], b = idx[ t + 1 ], c = idx[ t + 2 ];
		const ux = pos[ b * 3 ] - pos[ a * 3 ], uy = pos[ b * 3 + 1 ] - pos[ a * 3 + 1 ], uz = pos[ b * 3 + 2 ] - pos[ a * 3 + 2 ];
		const wx = pos[ c * 3 ] - pos[ a * 3 ], wy = pos[ c * 3 + 1 ] - pos[ a * 3 + 1 ], wz = pos[ c * 3 + 2 ] - pos[ a * 3 + 2 ];
		const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
		const dn = cx * ( nrm[ a * 3 ] + nrm[ b * 3 ] + nrm[ c * 3 ] ) + cy * ( nrm[ a * 3 + 1 ] + nrm[ b * 3 + 1 ] + nrm[ c * 3 + 1 ] ) + cz * ( nrm[ a * 3 + 2 ] + nrm[ b * 3 + 2 ] + nrm[ c * 3 + 2 ] );
		if ( dn < 0 ) {

			idx[ t + 1 ] = c;
			idx[ t + 2 ] = b;

		}

	}

	return { pos, nrm, idx };

}

// Ambient occlusion from the field: how quickly space opens up along the normal.
export function fieldAO( sdf, x, y, z, nx, ny, nz, step ) {

	let occ = 0, sca = 1;
	for ( let s = 1; s <= 5; s ++ ) {

		const dd = s * step;
		occ += ( dd - sdf( x + nx * dd, y + ny * dd, z + nz * dd ) ) * sca;
		sca *= 0.7;

	}

	return Math.min( 1, Math.max( 0.25, 1 - occ / step * 0.35 ) );

}
