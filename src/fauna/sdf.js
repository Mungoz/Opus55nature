import * as THREE from 'three';

// The animals' palettes are sampled from photographs, whose colours are as displayed (exposed
// and tone-mapped), far brighter than the albedo of real fur and feathers. Colours are taken
// as sRGB (THREE.Color stores them linear) and scaled down to albedo.
export const ALBEDO = 0.42;
// ...and given back a little of the saturation the camera's exposure took from them
export const SATURATE = 1.3;
export function toAlbedo( r, g, b, out, i ) {

	const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	out[ i ] = Math.max( 0, l + ( r - l ) * SATURATE ) * ALBEDO;
	out[ i + 1 ] = Math.max( 0, l + ( g - l ) * SATURATE ) * ALBEDO;
	out[ i + 2 ] = Math.max( 0, l + ( b - l ) * SATURATE ) * ALBEDO;

}

// Sculpting organic creatures: a body is a smooth union of distance-field
// primitives (round cones and oriented ellipsoids), each bound to a bone.
// It is polygonised with surface nets into one continuous skin, weighted to
// the bones by proximity to the parts, and shaded with per-vertex colour.

// ---- small 3D value noise for fur/tuft displacement ----
function h3( x, y, z ) {

	let h = Math.imul( x | 0, 374761393 ) + Math.imul( y | 0, 668265263 ) + Math.imul( z | 0, 1440662683 );
	h = Math.imul( h ^ ( h >>> 13 ), 1274126177 );
	return ( ( h ^ ( h >>> 16 ) ) >>> 0 ) / 4294967296;

}

export function noise3( x, y, z ) {

	const ix = Math.floor( x ), iy = Math.floor( y ), iz = Math.floor( z );
	const fx = x - ix, fy = y - iy, fz = z - iz;
	const u = fx * fx * ( 3 - 2 * fx ), v = fy * fy * ( 3 - 2 * fy ), w = fz * fz * ( 3 - 2 * fz );
	const L = ( a, b, t ) => a + ( b - a ) * t;
	return L(
		L( L( h3( ix, iy, iz ), h3( ix + 1, iy, iz ), u ), L( h3( ix, iy + 1, iz ), h3( ix + 1, iy + 1, iz ), u ), v ),
		L( L( h3( ix, iy, iz + 1 ), h3( ix + 1, iy, iz + 1 ), u ), L( h3( ix, iy + 1, iz + 1 ), h3( ix + 1, iy + 1, iz + 1 ), u ), v ),
		w ) * 2 - 1;

}

function roundCone( px, py, pz, P ) {

	// IQ's exact round cone
	const pax = px - P.ax, pay = py - P.ay, paz = pz - P.az;
	const y = pax * P.bax + pay * P.bay + paz * P.baz;
	const z = y - P.l2;
	const qx = pax * P.l2 - P.bax * y, qy = pay * P.l2 - P.bay * y, qz = paz * P.l2 - P.baz * y;
	const x2 = qx * qx + qy * qy + qz * qz;
	const y2 = y * y * P.l2;
	const z2 = z * z * P.l2;
	const k = Math.sign( P.rr ) * P.rr * P.rr * x2;
	if ( Math.sign( z ) * P.a2 * z2 > k ) return Math.sqrt( x2 + z2 ) * P.il2 - P.r2;
	if ( Math.sign( y ) * P.a2 * y2 < k ) return Math.sqrt( x2 + y2 ) * P.il2 - P.r1;
	return ( Math.sqrt( x2 * P.a2 * P.il2 ) + y * P.rr ) * P.il2 - P.r1;

}

function ellipsoid( px, py, pz, P ) {

	const dx = px - P.cx, dy = py - P.cy, dz = pz - P.cz;
	// into the part's frame
	const lx = ( dx * P.m[ 0 ] + dy * P.m[ 1 ] + dz * P.m[ 2 ] );
	const ly = ( dx * P.m[ 3 ] + dy * P.m[ 4 ] + dz * P.m[ 5 ] );
	const lz = ( dx * P.m[ 6 ] + dy * P.m[ 7 ] + dz * P.m[ 8 ] );
	const k0 = Math.sqrt( ( lx / P.rx ) ** 2 + ( ly / P.ry ) ** 2 + ( lz / P.rz ) ** 2 );
	const k1 = Math.sqrt( ( lx / ( P.rx * P.rx ) ) ** 2 + ( ly / ( P.ry * P.ry ) ) ** 2 + ( lz / ( P.rz * P.rz ) ) ** 2 );
	return k1 > 1e-9 ? k0 * ( k0 - 1 ) / k1 : - Math.min( P.rx, P.ry, P.rz );

}

const smin = ( a, b, k ) => {

	if ( k <= 0 ) return Math.min( a, b );
	const h = Math.max( k - Math.abs( a - b ), 0 ) / k;
	return Math.min( a, b ) - h * h * k * 0.25;

};

const V3 = ( v ) => ( Array.isArray( v ) ? new THREE.Vector3( ...v ) : v.clone() );

export class Sculpt {

	constructor() {

		this.parts = [];
		this.bones = new Map(); // name -> { pos: Vector3 (world, rest), parent }
		this.boneOrder = [];
		this.aoStep = 0.03; // metres; scale with the creature

	}

	bone( name, pos, parent = null ) {

		this.bones.set( name, { pos: V3( pos ), parent } );
		this.boneOrder.push( name );
		return this;

	}

	_part( P, o ) {

		P.bone = o.bone;
		P.k = o.k ?? 0.04;
		P.color = o.color ?? '#888888';
		P.fuzz = o.fuzz ?? 0;
		P.fuzzFreq = o.fuzzFreq ?? 60;
		P.sub = !! o.sub;
		P.mat = o.mat ?? 2;
		// fur: length (m), tip colour (hex or fn), comb direction (object space; hairs lie
		// back along the body unless told otherwise); pat: plumage pattern weights
		// [ vermiculation, scalloped feathers, iridescence ] (array or fn)
		P.fur = o.fur ?? 0;
		P.tip = o.tip ?? null;
		P.comb = o.comb ?? null;
		P.pat = o.pat ?? null;
		// bounding sphere for culling
		this.parts.push( P );
		return this;

	}

	cone( a, b, r1, r2, o ) {

		a = V3( a );
		b = V3( b );
		const ba = b.clone().sub( a );
		const l2 = ba.lengthSq();
		const P = {
			type: 0, ax: a.x, ay: a.y, az: a.z, bax: ba.x, bay: ba.y, baz: ba.z,
			l2, rr: r1 - r2, a2: l2 - ( r1 - r2 ) ** 2, il2: 1 / l2, r1, r2,
			bc: a.clone().add( b ).multiplyScalar( 0.5 ), br: Math.sqrt( l2 ) * 0.5 + Math.max( r1, r2 ),
		};
		return this._part( P, o );

	}

	// Ellipsoid with radii along an orthonormal frame (x, y, z axes given as vectors).
	ellipsoid( c, r, o, axes = null ) {

		c = V3( c );
		let m = [ 1, 0, 0, 0, 1, 0, 0, 0, 1 ];
		if ( axes ) {

			const [ ax, ay, az ] = axes.map( ( v ) => V3( v ).normalize() );
			m = [ ax.x, ax.y, ax.z, ay.x, ay.y, ay.z, az.x, az.y, az.z ];

		}

		const P = { type: 1, cx: c.x, cy: c.y, cz: c.z, rx: r[ 0 ], ry: r[ 1 ], rz: r[ 2 ], m, bc: c, br: Math.max( ...r ) };
		return this._part( P, o );

	}

	// Frame for an ellipsoid whose long (y) axis points along dir, flat (z) side facing `face`.
	static frame( dir, face = [ 0, 0, 1 ] ) {

		const y = V3( dir ).normalize();
		let z = V3( face );
		z.addScaledVector( y, - z.dot( y ) ).normalize();
		const x = new THREE.Vector3().crossVectors( y, z ).normalize();
		return [ x, y, z ];

	}

	_partDist( P, x, y, z ) {

		let d = P.type === 0 ? roundCone( x, y, z, P ) : ellipsoid( x, y, z, P );
		if ( P.fuzz ) d += P.fuzz * noise3( x * P.fuzzFreq, y * P.fuzzFreq, z * P.fuzzFreq );
		return d;

	}

	eval( x, y, z ) {

		let d = 1e9;
		for ( const P of this.parts ) {

			// cheap bound: skip parts that cannot affect the current minimum
			const dx = x - P.bc.x, dy = y - P.bc.y, dz = z - P.bc.z;
			const lb = Math.sqrt( dx * dx + dy * dy + dz * dz ) - P.br - P.fuzz;
			if ( ! P.sub && lb > d + P.k ) continue;
			const pd = this._partDist( P, x, y, z );
			if ( P.sub ) {

				// smooth subtraction
				const h = Math.max( P.k - Math.abs( - pd - d ), 0 ) / Math.max( P.k, 1e-6 );
				d = Math.max( d, - pd ) + h * h * P.k * 0.25;

			} else d = smin( d, pd, P.k );

		}

		return d;

	}

	// Polygonise with surface nets on a grid of spacing h.
	build( h = 0.02, pad = 0.05 ) {

		const min = new THREE.Vector3( Infinity, Infinity, Infinity ), max = min.clone().negate();
		for ( const P of this.parts ) {

			if ( P.sub ) continue;
			min.min( P.bc.clone().subScalar( P.br + pad ) );
			max.max( P.bc.clone().addScalar( P.br + pad ) );

		}

		const nx = Math.ceil( ( max.x - min.x ) / h ) + 1, ny = Math.ceil( ( max.y - min.y ) / h ) + 1, nz = Math.ceil( ( max.z - min.z ) / h ) + 1;
		const field = new Float32Array( nx * ny * nz );
		const I = ( i, j, k ) => i + nx * ( j + ny * k );
		for ( let k = 0; k < nz; k ++ ) for ( let j = 0; j < ny; j ++ ) for ( let i = 0; i < nx; i ++ ) {

			field[ I( i, j, k ) ] = this.eval( min.x + i * h, min.y + j * h, min.z + k * h );

		}

		const cellVert = new Int32Array( nx * ny * nz ).fill( - 1 );
		const pos = [];
		const corners = [ [ 0, 0, 0 ], [ 1, 0, 0 ], [ 0, 1, 0 ], [ 1, 1, 0 ], [ 0, 0, 1 ], [ 1, 0, 1 ], [ 0, 1, 1 ], [ 1, 1, 1 ] ];
		const edges = [ [ 0, 1 ], [ 2, 3 ], [ 4, 5 ], [ 6, 7 ], [ 0, 2 ], [ 1, 3 ], [ 4, 6 ], [ 5, 7 ], [ 0, 4 ], [ 1, 5 ], [ 2, 6 ], [ 3, 7 ] ];
		const cv = new Float32Array( 8 );
		for ( let k = 0; k < nz - 1; k ++ ) for ( let j = 0; j < ny - 1; j ++ ) for ( let i = 0; i < nx - 1; i ++ ) {

			let inside = 0;
			for ( let c = 0; c < 8; c ++ ) {

				cv[ c ] = field[ I( i + corners[ c ][ 0 ], j + corners[ c ][ 1 ], k + corners[ c ][ 2 ] ) ];
				if ( cv[ c ] < 0 ) inside ++;

			}

			if ( inside === 0 || inside === 8 ) continue;
			let sx = 0, sy = 0, sz = 0, n = 0;
			for ( const [ a, b ] of edges ) {

				const da = cv[ a ], db = cv[ b ];
				if ( ( da < 0 ) === ( db < 0 ) ) continue;
				const t = da / ( da - db );
				sx += corners[ a ][ 0 ] + ( corners[ b ][ 0 ] - corners[ a ][ 0 ] ) * t;
				sy += corners[ a ][ 1 ] + ( corners[ b ][ 1 ] - corners[ a ][ 1 ] ) * t;
				sz += corners[ a ][ 2 ] + ( corners[ b ][ 2 ] - corners[ a ][ 2 ] ) * t;
				n ++;

			}

			cellVert[ I( i, j, k ) ] = pos.length / 3;
			pos.push( min.x + ( i + sx / n ) * h, min.y + ( j + sy / n ) * h, min.z + ( k + sz / n ) * h );

		}

		// quads across every sign-changing grid edge
		const idx = [];
		const quad = ( a, b, c, d, flip ) => {

			if ( a < 0 || b < 0 || c < 0 || d < 0 ) return;
			if ( flip ) idx.push( a, c, b, a, d, c );
			else idx.push( a, b, c, a, c, d );

		};

		for ( let k = 1; k < nz - 1; k ++ ) for ( let j = 1; j < ny - 1; j ++ ) for ( let i = 0; i < nx - 1; i ++ ) {

			const a = field[ I( i, j, k ) ] < 0, b = field[ I( i + 1, j, k ) ] < 0;
			if ( a === b ) continue;
			quad( cellVert[ I( i, j - 1, k - 1 ) ], cellVert[ I( i, j, k - 1 ) ], cellVert[ I( i, j, k ) ], cellVert[ I( i, j - 1, k ) ], a );

		}

		for ( let k = 1; k < nz - 1; k ++ ) for ( let j = 0; j < ny - 1; j ++ ) for ( let i = 1; i < nx - 1; i ++ ) {

			const a = field[ I( i, j, k ) ] < 0, b = field[ I( i, j + 1, k ) ] < 0;
			if ( a === b ) continue;
			quad( cellVert[ I( i - 1, j, k - 1 ) ], cellVert[ I( i - 1, j, k ) ], cellVert[ I( i, j, k ) ], cellVert[ I( i, j, k - 1 ) ], a );

		}

		for ( let k = 0; k < nz - 1; k ++ ) for ( let j = 1; j < ny - 1; j ++ ) for ( let i = 1; i < nx - 1; i ++ ) {

			const a = field[ I( i, j, k ) ] < 0, b = field[ I( i, j, k + 1 ) ] < 0;
			if ( a === b ) continue;
			quad( cellVert[ I( i - 1, j - 1, k ) ], cellVert[ I( i, j - 1, k ) ], cellVert[ I( i, j, k ) ], cellVert[ I( i - 1, j, k ) ], a );

		}

		// normals from the field gradient; fix any triangle wound against it
		const nv = pos.length / 3;
		const nrm = new Float32Array( nv * 3 );
		const e = h * 0.5;
		for ( let v = 0; v < nv; v ++ ) {

			const x = pos[ v * 3 ], y = pos[ v * 3 + 1 ], z = pos[ v * 3 + 2 ];
			const gx = this.eval( x + e, y, z ) - this.eval( x - e, y, z );
			const gy = this.eval( x, y + e, z ) - this.eval( x, y - e, z );
			const gz = this.eval( x, y, z + e ) - this.eval( x, y, z - e );
			const l = Math.hypot( gx, gy, gz ) || 1;
			nrm.set( [ gx / l, gy / l, gz / l ], v * 3 );

		}

		for ( let t = 0; t < idx.length; t += 3 ) {

			const [ a, b, c ] = [ idx[ t ], idx[ t + 1 ], idx[ t + 2 ] ];
			const ux = pos[ b * 3 ] - pos[ a * 3 ], uy = pos[ b * 3 + 1 ] - pos[ a * 3 + 1 ], uz = pos[ b * 3 + 2 ] - pos[ a * 3 + 2 ];
			const wx = pos[ c * 3 ] - pos[ a * 3 ], wy = pos[ c * 3 + 1 ] - pos[ a * 3 + 1 ], wz = pos[ c * 3 + 2 ] - pos[ a * 3 + 2 ];
			const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
			const dn = cx * ( nrm[ a * 3 ] + nrm[ b * 3 ] + nrm[ c * 3 ] ) + cy * ( nrm[ a * 3 + 1 ] + nrm[ b * 3 + 1 ] + nrm[ c * 3 + 1 ] ) + cz * ( nrm[ a * 3 + 2 ] + nrm[ b * 3 + 2 ] + nrm[ c * 3 + 2 ] );
			if ( dn < 0 ) {

				idx[ t + 1 ] = c;
				idx[ t + 2 ] = b;

			}

		}

		// skin weights & colour from the nearest parts
		const boneIndex = new Map( this.boneOrder.map( ( n, i ) => [ n, i ] ) );
		const skinIndex = new Uint16Array( nv * 4 ), skinWeight = new Float32Array( nv * 4 );
		const color = new Float32Array( nv * 3 );
		const matAttr = new Float32Array( nv );
		const furAttr = new Float32Array( nv * 4 );
		const combAttr = new Float32Array( nv * 3 );
		const patAttr = new Float32Array( nv * 3 );
		const tipC = new THREE.Color();
		const defComb = new THREE.Vector3( 0, - 0.35, - 1 ).normalize();
		const comb = new THREE.Vector3();
		const cols = this.parts.map( ( P ) => ( typeof P.color === 'function' ? null : new THREE.Color( P.color ) ) );
		const tmpC = new THREE.Color();
		const pd = new Float32Array( this.parts.length );
		for ( let v = 0; v < nv; v ++ ) {

			const x = pos[ v * 3 ], y = pos[ v * 3 + 1 ], z = pos[ v * 3 + 2 ];
			let dmin = 1e9;
			for ( let p = 0; p < this.parts.length; p ++ ) {

				const P = this.parts[ p ];
				pd[ p ] = P.sub ? 1e9 : this._partDist( P, x, y, z );
				if ( pd[ p ] < dmin ) dmin = pd[ p ];

			}

			const bw = new Map();
			let nearest = 0;
			for ( let p = 1; p < this.parts.length; p ++ ) if ( pd[ p ] < pd[ nearest ] ) nearest = p;
			matAttr[ v ] = this.parts[ nearest ].mat;
			let cr = 0, cg = 0, cb = 0, cw = 0;
			let fl = 0, tr = 0, tg = 0, tb = 0, p0 = 0, p1 = 0, p2 = 0;
			comb.set( 0, 0, 0 );
			for ( let p = 0; p < this.parts.length; p ++ ) {

				const P = this.parts[ p ];
				if ( P.sub ) continue;
				const w = Math.exp( - ( pd[ p ] - dmin ) / 0.012 );
				if ( w < 1e-3 ) continue;
				bw.set( P.bone, ( bw.get( P.bone ) || 0 ) + w );
				const c = cols[ p ] ?? tmpC.set( P.color( x, y, z ) );
				const cwt = Math.exp( - ( pd[ p ] - dmin ) / 0.006 );
				cr += c.r * cwt; cg += c.g * cwt; cb += c.b * cwt; cw += cwt;
				fl += ( typeof P.fur === 'function' ? P.fur( x, y, z ) : P.fur ) * cwt;
				if ( P.tip ) tipC.set( typeof P.tip === 'function' ? P.tip( x, y, z ) : P.tip );
				else tipC.setRGB( c.r * 1.3, c.g * 1.3, c.b * 1.3 );
				tr += tipC.r * cwt; tg += tipC.g * cwt; tb += tipC.b * cwt;
				if ( P.comb ) {

					const cv = typeof P.comb === 'function' ? P.comb( x, y, z ) : P.comb;
					comb.x += cv[ 0 ] * cwt; comb.y += cv[ 1 ] * cwt; comb.z += cv[ 2 ] * cwt;

				}
				else comb.addScaledVector( defComb, cwt );
				if ( P.pat ) {

					const pt = typeof P.pat === 'function' ? P.pat( x, y, z ) : P.pat;
					p0 += pt[ 0 ] * cwt; p1 += pt[ 1 ] * cwt; p2 += pt[ 2 ] * cwt;

				}

			}

			toAlbedo( tr / cw, tg / cw, tb / cw, furAttr, v * 4 );
			furAttr[ v * 4 + 3 ] = fl / cw;
			combAttr.set( [ comb.x / cw, comb.y / cw, comb.z / cw ], v * 3 );
			patAttr.set( [ p0 / cw, p1 / cw, p2 / cw ], v * 3 );

			// ambient occlusion from the field itself: how quickly space opens up along the normal
			let occ = 0, sca = 1;
			for ( let s = 1; s <= 5; s ++ ) {

				const dd = s * this.aoStep;
				const f = this.eval( x + nrm[ v * 3 ] * dd, y + nrm[ v * 3 + 1 ] * dd, z + nrm[ v * 3 + 2 ] * dd );
				occ += ( dd - f ) * sca;
				sca *= 0.7;

			}

			const ao = Math.min( 1, Math.max( 0.25, 1 - occ / this.aoStep * 0.35 ) );
			toAlbedo( cr / cw * ao, cg / cw * ao, cb / cw * ao, color, v * 3 );
			const top = [ ...bw.entries() ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 4 );
			const sum = top.reduce( ( s, e2 ) => s + e2[ 1 ], 0 );
			top.forEach( ( [ name, w ], q ) => {

				skinIndex[ v * 4 + q ] = boneIndex.get( name );
				skinWeight[ v * 4 + q ] = w / sum;

			} );

		}

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'normal', new THREE.BufferAttribute( nrm, 3 ) );
		g.setAttribute( 'color', new THREE.BufferAttribute( color, 3 ) );
		g.setAttribute( 'skinIndex', new THREE.Uint16BufferAttribute( skinIndex, 4 ) );
		g.setAttribute( 'skinWeight', new THREE.BufferAttribute( skinWeight, 4 ) );
		g.setAttribute( 'aFlap', new THREE.BufferAttribute( new Float32Array( nv ), 1 ) );
		g.setAttribute( 'aMat', new THREE.BufferAttribute( matAttr, 1 ) );
		g.setAttribute( 'aFur', new THREE.BufferAttribute( furAttr, 4 ) );
		g.setAttribute( 'aComb', new THREE.BufferAttribute( combAttr, 3 ) );
		g.setAttribute( 'aPat', new THREE.BufferAttribute( patAttr, 3 ) );
		g.setIndex( idx );
		g.computeBoundingSphere();
		return g;

	}

	// Bones in rest pose (no rotation), positioned at the joints.
	skeleton() {

		const bones = new Map();
		for ( const name of this.boneOrder ) {

			const b = new THREE.Bone();
			b.name = name;
			const def = this.bones.get( name );
			const parent = def.parent ? bones.get( def.parent ) : null;
			const parentPos = def.parent ? this.bones.get( def.parent ).pos : new THREE.Vector3();
			b.position.copy( def.pos ).sub( parentPos );
			if ( parent ) parent.add( b );
			bones.set( name, b );

		}

		const list = this.boneOrder.map( ( n ) => bones.get( n ) );
		return { bones, list, root: list[ 0 ], skeleton: new THREE.Skeleton( list ) };

	}

	// Build a SkinnedMesh (plus bone map) with the given material.
	mesh( material, h ) {

		this.aoStep = h * 1.6;

		const geo = this.build( h );
		const { bones, root, skeleton } = this.skeleton();
		const m = new THREE.SkinnedMesh( geo, material );
		m.add( root );
		m.bind( skeleton );
		m.castShadow = true;
		m.receiveShadow = true;
		m.frustumCulled = false;
		return { mesh: m, bones };

	}

}
