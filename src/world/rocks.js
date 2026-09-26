import * as THREE from 'three';
import { commonParsGLSL } from '../shaders/common.glsl.js';
import { sharedUniforms } from '../core/uniforms.js';
import { RNG, hash2 } from '../core/rng.js';
import { WORLD } from '../core/world.js';

// ---- a little 3D value noise for sculpting boulders on the CPU ----
function hash3( x, y, z ) {

	let h = Math.imul( x | 0, 374761393 ) + Math.imul( y | 0, 668265263 ) + Math.imul( z | 0, 2147483647 );
	h = Math.imul( h ^ ( h >>> 13 ), 1274126177 );
	return ( ( h ^ ( h >>> 16 ) ) >>> 0 ) / 4294967296;

}

function vnoise3( x, y, z ) {

	const ix = Math.floor( x ), iy = Math.floor( y ), iz = Math.floor( z );
	const fx = x - ix, fy = y - iy, fz = z - iz;
	const u = fx * fx * ( 3 - 2 * fx ), v = fy * fy * ( 3 - 2 * fy ), w = fz * fz * ( 3 - 2 * fz );
	const l = ( a, b, t ) => a + ( b - a ) * t;
	return l(
		l( l( hash3( ix, iy, iz ), hash3( ix + 1, iy, iz ), u ), l( hash3( ix, iy + 1, iz ), hash3( ix + 1, iy + 1, iz ), u ), v ),
		l( l( hash3( ix, iy, iz + 1 ), hash3( ix + 1, iy, iz + 1 ), u ), l( hash3( ix, iy + 1, iz + 1 ), hash3( ix + 1, iy + 1, iz + 1 ), u ), v ),
		w ) * 2 - 1;

}

function fbm3( x, y, z, oct ) {

	let a = 0, b = 0.5;
	for ( let i = 0; i < oct; i ++ ) {

		a += b * vnoise3( x, y, z );
		x *= 2.03; y *= 2.03; z *= 2.03;
		b *= 0.5;

	}

	return a;

}

// A glacial boulder: noisy sphere, cleaved by a few fracture planes, sat flat on its base.
function makeBoulder( rng ) {

	const g = new THREE.IcosahedronGeometry( 1, 4 );
	const pos = g.getAttribute( 'position' );
	const seed = rng.next() * 100;
	const stretch = new THREE.Vector3( rng.range( 0.9, 1.5 ), rng.range( 0.55, 0.9 ), rng.range( 0.8, 1.2 ) );
	const planes = [];
	for ( let i = 0; i < 6; i ++ ) {

		const n = new THREE.Vector3( rng.range( - 1, 1 ), rng.range( - 0.3, 1 ), rng.range( - 1, 1 ) ).normalize();
		planes.push( { n, d: rng.range( 0.62, 0.85 ) } );

	}

	const v = new THREE.Vector3();
	for ( let i = 0; i < pos.count; i ++ ) {

		v.fromBufferAttribute( pos, i );
		const r = 1 + 0.22 * fbm3( v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3, 4 ) + 0.05 * fbm3( v.x * 5 + seed, v.y * 5, v.z * 5, 3 );
		v.multiplyScalar( r );
		for ( const p of planes ) {

			const dd = v.dot( p.n );
			if ( dd > p.d ) v.addScaledVector( p.n, ( p.d - dd ) * 0.85 );

		}

		v.multiply( stretch );
		if ( v.y < - 0.25 ) v.y = - 0.25 + ( v.y + 0.25 ) * 0.3;
		pos.setXYZ( i, v.x, v.y, v.z );

	}

	g.computeVertexNormals();
	// bake cavity AO from how far each vertex sits inside the average radius
	const ao = new Float32Array( pos.count );
	for ( let i = 0; i < pos.count; i ++ ) {

		v.fromBufferAttribute( pos, i );
		ao[ i ] = THREE.MathUtils.clamp( 0.55 + ( v.y + 0.25 ) * 0.5, 0.45, 1 );

	}

	g.setAttribute( 'aAO', new THREE.BufferAttribute( ao, 1 ) );
	return g;

}

const vert = /* glsl */ `
attribute float aAO;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vObj;
varying float vAO;
void main() {
	#ifdef USE_INSTANCING
		mat4 im = modelMatrix * instanceMatrix;
	#else
		mat4 im = modelMatrix;
	#endif
	vec4 wp = im * vec4( position, 1.0 );
	vWorldPos = wp.xyz;
	vNormal = normalize( mat3( im ) * normal );
	#ifdef CLIFF
		vObj = wp.xyz * 0.4;
	#else
		vObj = position * length( im[ 0 ].xyz ) + im[ 3 ].xyz * 0.37;
	#endif
	vAO = aAO;
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const frag = /* glsl */ `
${commonParsGLSL}
uniform sampler2DArray tMat;
uniform sampler2DArray tMatN;
#ifdef CLIFF
	uniform vec4 uFall;     // lip x, lip z, half width of the falling water, pool level
	uniform vec2 uFallSide; // along the wall
#endif
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vObj;
varying float vAO;
vec3 unpackN( vec4 t ) { vec2 xy = t.xy * 2.0 - 1.0; return vec3( xy, sqrt( max( 0.0, 1.0 - dot( xy, xy ) ) ) ); }
void main() {
	vec3 wp = vWorldPos;
	vec3 N = normalize( vNormal );
	vec3 V = cameraPosition - wp;
	float dist = length( V );
	V /= dist;
	vec3 bw = pow( abs( N ), vec3( 4.0 ) );
	bw /= bw.x + bw.y + bw.z;
	vec3 q = vObj / 0.9;
	vec4 t = texture( tMat, vec3( q.zy, 0.0 ) ) * bw.x + texture( tMat, vec3( q.xz, 0.0 ) ) * bw.y + texture( tMat, vec3( q.xy, 0.0 ) ) * bw.z;
	vec3 nX = unpackN( texture( tMatN, vec3( q.zy, 0.0 ) ) );
	vec3 nY = unpackN( texture( tMatN, vec3( q.xz, 0.0 ) ) );
	vec3 nZ = unpackN( texture( tMatN, vec3( q.xy, 0.0 ) ) );
	vec3 dn = vec3( 0.0, nX.y, nX.x ) * bw.x + vec3( nY.x, 0.0, nY.y ) * bw.y + vec3( nZ.x, nZ.y, 0.0 ) * bw.z;
	vec3 Nd = normalize( N + dn * 0.9 );
	vec3 alb = pow( t.rgb, vec3( 2.2 ) ) * 0.95;
	// moss and lichen cushions on the upper faces
	float moss = smoothstep( 0.45, 0.8, N.y + gnoise( vObj.xz * 1.7 ) * 0.35 + ( t.a - 0.5 ) * 0.4 );
	moss *= smoothstep( 0.6, 1.5, wp.y - uWaterLevel );
	vec3 mossCol = mix( vec3( 0.06, 0.09, 0.02 ), vec3( 0.2, 0.18, 0.05 ), gnoise( vObj.xz * 4.0 ) * 0.5 + 0.5 );
	alb = mix( alb, mossCol, moss * 0.7 );
	// wet dark band and algae at the waterline
	float wet = 1.0 - smoothstep( 0.0, 0.35, wp.y - uWaterLevel );
	alb *= 1.0 - wet * 0.5;
	alb = mix( alb, vec3( 0.05, 0.06, 0.03 ), smoothstep( 0.1, -0.6, wp.y - uWaterLevel ) * 0.6 );
	float rough = mix( mix( 0.72, 0.95, moss ), 0.2, wet );
	#ifdef CLIFF
		// the rock by the fall is soaked by spray and runs with seepage: dark and glistening
		// beside the water and round the pool, dark stains streaking down the rest of the face
		vec2 fp = wp.xz - uFall.xy;
		float along = dot( fp, uFallSide );
		float beside = 1.0 - smoothstep( uFall.z, uFall.z + 10.0, abs( along ) );
		float pool = smoothstep( uFall.w + 16.0, uFall.w + 2.0, wp.y ) * ( 1.0 - smoothstep( uFall.z + 6.0, uFall.z + 26.0, abs( along ) ) );
		float soaked = max( beside * 0.9, pool * 0.75 );
		float streaks = smoothstep( 0.55, 0.8, gnoise( vec2( along * 0.45, wp.y * 0.018 ) ) * 0.5 + 0.5 ) * ( 1.0 - max( N.y, 0.0 ) );
		// weathered to the grey of the surrounding crags, then soaked and stained
		alb *= 0.56 * ( 1.0 - 0.45 * soaked - 0.28 * streaks );
		// spray-fed moss and algae on the soaked ledges
		alb = mix( alb, vec3( 0.03, 0.05, 0.02 ), soaked * smoothstep( 0.3, 0.8, N.y ) * 0.6 );
		rough = mix( rough, 0.22, soaked );
	#endif
	float ao = vAO * mix( 0.6 + 0.4 * t.a, 1.0, 0.3 );
	float sh = sunShadow( wp, N );
	vec3 col = shadeSurface( alb, Nd, V, wp, ao, sh, rough, 0.035 );
	if ( wp.y < uWaterLevel ) col += alb * uSunColor * sh * caustics( wp ) * max( uSunDir.y, 0.0 ) * underwaterLight( wp );
	col = waterColumn( col, wp, uSunColor * sh );
	col = applyAtmosphere( col, wp );
	gl_FragColor = vec4( col, 1.0 );
}
`;

export class Rocks {

	constructor( terrain, textures ) {

		this.terrain = terrain;
		const rng = new RNG( 555 );
		this.variants = [ makeBoulder( rng ), makeBoulder( rng ), makeBoulder( rng ), makeBoulder( rng ), makeBoulder( rng ) ];
		this.material = new THREE.ShaderMaterial( {
			vertexShader: vert,
			fragmentShader: frag,
			uniforms: {
				...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ),
				...sharedUniforms(),
				tMat: { value: textures.matAlbedo },
				tMatN: { value: textures.matNormal },
			},
			lights: true,
		} );
		this.group = new THREE.Group();
		this.group.name = 'rocks';
		this.list = [];
		this._last = new THREE.Vector3( 1e9, 0, 0 );
		this.maxDist = 420;

	}

	// the same rock for the sculpted cliff under the waterfall (a plain mesh in world space)
	cliffMaterial( fall ) {

		return new THREE.ShaderMaterial( {
			vertexShader: vert,
			fragmentShader: frag,
			defines: { CLIFF: '' },
			uniforms: {
				...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ),
				...sharedUniforms(),
				tMat: this.material.uniforms.tMat,
				tMatN: this.material.uniforms.tMatN,
				uFall: { value: new THREE.Vector4( fall.lip.x, fall.lip.y, fall.halfWidth, fall.floorY ) },
				uFallSide: { value: new THREE.Vector2( fall.side.x, fall.side.z ).normalize() },
			},
			lights: true,
		} );

	}

	place( extra = [] ) {

		const td = this.terrain;
		const rng = new RNG( 808 );
		const bio = [ 0, 0, 0, 0 ];
		const n = new THREE.Vector3();
		const near = WORLD.near;
		const x0 = near.cx - near.size / 2 + 20, x1 = near.cx + near.size / 2 - 20;
		const z0 = near.cz - near.size / 2 + 20, z1 = near.cz + near.size / 2 - 20;
		const add = ( x, z, s, sink = 0.3 ) => {

			const h = td.heightAt( x, z );
			td.normalAt( x, z, n, 1.5 );
			this.list.push( { x, y: h - s * sink, z, s, rot: rng.next() * Math.PI * 2, tiltX: ( rng.next() - 0.5 ) * 0.3, variant: Math.floor( rng.next() * this.variants.length ), nx: n.x, nz: n.z } );

		};

		for ( let z = z0; z < z1; z += 5 ) {

			for ( let x = x0; x < x1; x += 5 ) {

				const px = x + rng.next() * 5, pz = z + rng.next() * 5;
				const h = td.heightAt( px, pz );
				if ( h < - 2.2 || h > 700 ) continue;
				td.biomeAt( px, pz, bio );
				const cluster = hash2( Math.floor( px / 40 ), Math.floor( pz / 40 ) );
				let p = 0;
				// shoreline boulders, some wading into the shallows
				if ( h > - 2.2 && h < 2.5 ) p += 0.03 * ( cluster > 0.5 ? 2.5 : 0.4 );
				// erratics dotted over the meadows
				p += bio[ 0 ] * 0.0035 * ( cluster > 0.7 ? 4 : 1 );
				// talus beneath cliffs
				p += bio[ 2 ] * 0.05;
				p += bio[ 1 ] * 0.004;
				if ( rng.next() > p ) continue;
				let s = Math.pow( rng.next(), 2.2 ) * 2.8 + 0.35;
				if ( bio[ 2 ] > 0.4 ) s *= 1.4;
				if ( rng.next() < 0.03 ) s = rng.range( 3.5, 6 );
				add( px, pz, s );

			}

		}

		for ( const e of extra ) add( e.x, e.z, e.s, e.sink ?? 0.3 );

		const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
		this.matrices = new Float32Array( this.list.length * 16 );
		this.list.forEach( ( r, i ) => {

			e.set( r.tiltX + r.nz * 0.4, r.rot, - r.nx * 0.4 );
			q.setFromEuler( e );
			mat.compose( p.set( r.x, r.y, r.z ), q, sc.set( r.s, r.s, r.s ) );
			mat.toArray( this.matrices, i * 16 );

		} );

		this.meshes = this.variants.map( ( g ) => {

			const m = new THREE.InstancedMesh( g, this.material, 3000 );
			m.count = 0;
			m.frustumCulled = false;
			m.castShadow = true;
			m.receiveShadow = true;
			m.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
			this.group.add( m );
			return m;

		} );
		return this.list.length;

	}

	update( camera ) {

		const cp = camera.position;
		if ( cp.distanceToSquared( this._last ) < 25 ) return;
		this._last.copy( cp );
		const counts = this.meshes.map( () => 0 );
		const md2 = this.maxDist * this.maxDist;
		for ( let i = 0; i < this.list.length; i ++ ) {

			const r = this.list[ i ];
			const dx = r.x - cp.x, dz = r.z - cp.z;
			// big rocks stay visible further away
			if ( dx * dx + dz * dz > md2 * Math.min( 4, r.s * r.s * 0.5 + 0.3 ) ) continue;
			const m = this.meshes[ r.variant ];
			const c = counts[ r.variant ];
			if ( c >= 3000 ) continue;
			m.instanceMatrix.array.set( this.matrices.subarray( i * 16, i * 16 + 16 ), c * 16 );
			counts[ r.variant ] = c + 1;

		}

		this.meshes.forEach( ( m, k ) => {

			m.count = counts[ k ];
			m.instanceMatrix.needsUpdate = true;

		} );

	}

}
