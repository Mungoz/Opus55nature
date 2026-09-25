import * as THREE from 'three';
import { commonParsGLSL } from '../shaders/common.glsl.js';
import { noiseGLSL } from '../shaders/noise.glsl.js';
import { sharedUniforms, U } from '../core/uniforms.js';
import { RNG, hash2 } from '../core/rng.js';
import { makeConifer, makeBirch, makeShrub } from './treeGen.js';
import { buildFoliageAtlas } from '../gen/foliageAtlas.js';
import { WORLD } from '../core/world.js';

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const foliageShading = /* glsl */ `
// Species tint for foliage (kind: 3 spruce, 4 larch, 5 birch, 6 shrub)
vec3 foliageTint( float kind, float rnd, float branch ) {
	float r2 = fract( rnd * 7.13 + branch * 0.37 );
	if ( kind < 3.5 ) return mix( vec3( 0.85, 0.95, 0.9 ), vec3( 1.1, 1.05, 0.95 ), rnd ) * ( 0.85 + 0.25 * r2 );
	if ( kind < 4.5 ) {
		// larches: most gold, some amber, a few lagging green-gold
		vec3 t = mix( vec3( 1.0, 0.92, 0.75 ), vec3( 1.08, 0.78, 0.55 ), smoothstep( 0.55, 0.95, rnd ) );
		t = mix( t, vec3( 0.8, 0.95, 0.55 ), step( rnd, 0.12 ) * 0.7 );
		return t * ( 0.85 + 0.3 * r2 );
	}
	if ( kind < 5.5 ) return mix( vec3( 1.0 ), vec3( 1.1, 0.85, 0.6 ), smoothstep( 0.6, 1.0, rnd ) ) * ( 0.85 + 0.3 * r2 );
	return vec3( 0.9 + 0.3 * r2 );
}

vec3 shadeFoliage( vec3 albedo, vec3 N, vec3 V, vec3 wp, float ao, float sh ) {
	albedo *= 1.0 - uWeather.y * 0.25;
	vec3 L = uSunDir;
	float NoL = dot( N, L );
	float wrap = saturate( ( NoL + 0.45 ) / 1.45 );
	float back = pow( saturate( dot( -V, L ) ), 3.0 );
	vec3 trans = albedo * saturate( albedo * 2.2 ) * back * ( 0.5 + 0.5 * ao ) * 2.2;
	vec3 direct = uSunColor * sh * ( albedo / PI * wrap + trans * 0.3 );
	vec3 amb = albedo / PI * skyIrradiance( N ) * ao;
	vec3 H = normalize( L + V );
	float spec = pow( saturate( dot( N, H ) ), 20.0 ) * 0.035 * sh * ao;
	return ( direct + amb ) * underwaterLight( wp ) + uSunColor * spec;
}

vec3 barkAlbedo( float kind, vec2 b, float rnd, vec3 wp, out float rough ) {
	rough = 0.85;
	float n = gnoise( vec2( b.x * 6.0, b.y * 1.2 ) + rnd * 13.0 );
	float fine = gnoise( vec2( b.x * 24.0, b.y * 5.0 ) );
	if ( kind < 0.5 ) {
		// spruce: grey-brown flaky scales
		vec3 c = mix( vec3( 0.11, 0.08, 0.065 ), vec3( 0.22, 0.17, 0.14 ), n * 0.5 + 0.5 );
		return c * ( 0.85 + 0.25 * fine );
	}
	if ( kind < 1.5 ) {
		// larch: deep reddish fissures
		float fis = smoothstep( 0.1, 0.5, abs( gnoise( vec2( b.x * 9.0, b.y * 0.6 ) ) ) );
		vec3 c = mix( vec3( 0.09, 0.05, 0.04 ), vec3( 0.3, 0.16, 0.1 ), fis );
		return c * ( 0.85 + 0.2 * fine );
	}
	// birch: chalk white with dark lenticels, blackened base
	float len = smoothstep( 0.55, 0.8, gnoise( vec2( b.x * 5.0, b.y * 9.0 ) + 3.0 ) ) * smoothstep( 0.2, 0.5, abs( gnoise( vec2( b.x * 2.0, b.y * 40.0 ) ) ) );
	float patchy = smoothstep( 0.3, 0.7, gnoise( vec2( b.x * 3.0, b.y * 0.8 ) + 7.0 ) );
	vec3 c = vec3( 0.78, 0.76, 0.72 ) * ( 0.9 + 0.1 * fine );
	c = mix( c, vec3( 0.08, 0.07, 0.07 ), max( len * 0.9, patchy * 0.6 * smoothstep( 4.0, 0.0, wp.y - 0.0 ) ) );
	c = mix( c, vec3( 0.12, 0.1, 0.09 ), smoothstep( 1.8, 0.2, b.y ) * 0.85 );
	rough = 0.6;
	return c;
}
`;

const nearVert = /* glsl */ `
${noiseGLSL}
uniform float uTime;
uniform vec4 uWind;
uniform sampler2D uNoiseTex;
uniform float uNearDist;
uniform float uFadeBand;
attribute vec2 aBark;
attribute vec3 aInfo;
attribute vec2 aWind;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vBark;
varying vec3 vInfo;
varying float vRnd;
varying float vFade;

void main() {
	#ifdef USE_INSTANCING
		mat4 im = modelMatrix * instanceMatrix;
	#else
		mat4 im = modelMatrix;
	#endif
	vec3 origin = im[ 3 ].xyz;
	float rnd = hash12( floor( origin.xz * 3.0 ) );
	vec3 wp = ( im * vec4( position, 1.0 ) ).xyz;
	vec3 n = normalize( mat3( im ) * normal );
	#ifndef BAKE
		float hm = max( wp.y - origin.y, 0.0 );
		vec2 wdir = normalize( uWind.xy + 1e-4 );
		float gust = textureLod( uNoiseTex, origin.xz / 420.0 - wdir * uTime * 0.018, 0.0 ).g;
		float strength = uWind.z * ( 0.3 + 1.1 * smoothstep( 0.35, 0.8, gust ) );
		float sway = strength * hm * hm * 0.0007 + sin( uTime * ( 0.8 + rnd * 0.4 ) + rnd * 6.283 ) * hm * hm * 0.00022 * uWind.z;
		wp.xz += wdir * sway;
		float flex = aWind.y;
		float fl = sin( uTime * ( 2.1 + rnd ) + aInfo.z * 6.283 + dot( wp.xz, vec2( 0.31, 0.27 ) ) ) * flex * ( 0.03 + 0.07 * strength );
		wp += n * fl;
		if ( aInfo.x > 4.5 ) wp += n * sin( uTime * 7.0 + aInfo.z * 40.0 ) * 0.02 * strength;
	#endif
	vWorldPos = wp;
	vNormal = n;
	vUv = uv;
	vBark = aBark;
	vInfo = aInfo;
	vRnd = rnd;
	float d = length( cameraPosition.xz - origin.xz );
	vFade = 1.0 - smoothstep( uNearDist - uFadeBand, uNearDist, d );
	gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}
`;

const nearFrag = /* glsl */ `
${commonParsGLSL}
${foliageShading}
uniform sampler2D tAtlas;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vBark;
varying vec3 vInfo;
varying float vRnd;
varying float vFade;

void main() {
	float kind = vInfo.x;
	#ifndef BAKE
		if ( vFade < 0.999 && interleavedGradient( gl_FragCoord.xy ) > vFade ) discard;
	#endif
	bool leaf = kind > 2.5;
	vec3 albedo;
	float alpha = 1.0;
	float rough = 0.8;
	if ( leaf ) {
		vec4 t = texture2D( tAtlas, vUv );
		alpha = t.a;
		albedo = t.rgb * foliageTint( kind, vRnd, vInfo.z );
	} else {
		albedo = barkAlbedo( kind, vBark, vRnd, vWorldPos, rough );
	}
	#ifdef A2C
		alpha = leaf ? saturate( ( alpha - 0.42 ) / max( fwidth( alpha ), 1e-4 ) + 0.5 ) : 1.0;
		if ( alpha < 0.02 ) discard;
	#else
		if ( alpha < 0.42 ) discard;
		alpha = 1.0;
	#endif
	vec3 N = normalize( vNormal );
	#ifdef BAKE_ALBEDO
		gl_FragColor = vec4( albedo * vInfo.y, leaf ? 1.0 : 0.5 );
		return;
	#endif
	#ifdef BAKE_NORMAL
		gl_FragColor = vec4( N * 0.5 + 0.5, 1.0 );
		return;
	#endif
	vec3 V = normalize( cameraPosition - vWorldPos );
	float ao = vInfo.y;
	vec3 col;
	if ( leaf ) {
		float sh = sunShadow( vWorldPos, N * 0.2 );
		col = shadeFoliage( albedo, N, V, vWorldPos, ao, sh );
	} else {
		if ( !gl_FrontFacing ) N = -N;
		col = shadeSurface( albedo, N, V, vWorldPos, ao, sunShadow( vWorldPos, N ), rough, 0.03 );
	}
	col = waterColumn( col, vWorldPos, uSunColor );
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, alpha );
}
`;

const MAX_VARIANTS = 8;

const bbVert = /* glsl */ `
${noiseGLSL}
uniform float uNearDist;
uniform float uFadeBand;
uniform float uFarDist;
uniform vec4 uCell[ ${MAX_VARIANTS} ];
uniform vec4 uDim[ ${MAX_VARIANTS} ];
uniform float uTime;
uniform vec4 uWind;
attribute vec4 aTree;
attribute vec2 aVar;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vRight;
varying vec3 vFwd;
varying float vFade;
varying float vFlip;
varying float vRnd;
void main() {
	int vi = int( aVar.x + 0.5 );
	vec3 o = aTree.xyz;
	float s = aTree.w;
	vec2 toC = cameraPosition.xz - o.xz;
	float d = length( toC );
	float fade = smoothstep( uNearDist - uFadeBand, uNearDist, d );
	if ( fade <= 0.0 || d > uFarDist ) {
		gl_Position = vec4( 0.0, 0.0, -2.0, 1.0 );
		return;
	}
	vec3 fwd = vec3( toC.x, 0.0, toC.y ) / max( d, 1e-3 );
	vec3 right = vec3( fwd.z, 0.0, -fwd.x );
	vec4 dim = uDim[ vi ];
	vec3 wp = o + right * position.x * dim.x * s + vec3( 0.0, ( position.y * dim.y + dim.z ) * s, 0.0 );
	// lean slightly toward the camera when seen from above so trees don't look paper-thin
	vec3 toCam3 = normalize( cameraPosition - o );
	wp += fwd * position.y * dim.y * s * clamp( toCam3.y, 0.0, 0.6 ) * 0.5;
	// gentle sway
	vec2 wdir = normalize( uWind.xy + 1e-4 );
	float rnd = hash12( floor( o.xz * 3.0 ) );
	wp.xz += wdir * position.y * position.y * s * uWind.z * ( 0.25 + 0.12 * sin( uTime + rnd * 6.28 ) );
	vec4 cell = uCell[ vi ];
	vUv = cell.xy + vec2( 0.5 + position.x * aVar.y, position.y ) * cell.zw;
	vWorldPos = wp;
	vRight = right;
	vFwd = fwd;
	vFade = fade;
	vFlip = aVar.y;
	vRnd = rnd;
	gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}
`;

const bbFrag = /* glsl */ `
${commonParsGLSL}
${foliageShading}
uniform sampler2D tImpAlbedo;
uniform sampler2D tImpNormal;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vRight;
varying vec3 vFwd;
varying float vFade;
varying float vFlip;
varying float vRnd;
void main() {
	vec4 nb = texture2D( tImpNormal, vUv );
	float cov = nb.a;
	#ifdef A2C
		float alpha = saturate( ( cov - 0.4 ) / max( fwidth( cov ), 1e-4 ) + 0.5 );
		if ( alpha < 0.02 ) discard;
	#else
		if ( cov < 0.4 ) discard;
		float alpha = 1.0;
	#endif
	if ( vFade < 0.999 && interleavedGradient( gl_FragCoord.xy + 7.0 ) > vFade ) discard;
	vec4 ab = texture2D( tImpAlbedo, vUv );
	vec3 albedo = ab.rgb;
	vec3 n = nb.rgb * 2.0 - 1.0;
	n.x *= vFlip;
	vec3 N = normalize( vRight * n.x + vec3( 0.0, 1.0, 0.0 ) * n.y + vFwd * n.z );
	vec3 V = normalize( cameraPosition - vWorldPos );
	float sh = sunShadow( vWorldPos, N * 0.2 ) ;
	// self-occlusion inside the crown, lost when flattening to a card
	float ao = 0.8;
	vec3 col = ab.a / max( cov, 1e-3 ) > 0.75 ? shadeFoliage( albedo, N, V, vWorldPos, ao, sh ) : shadeSurface( albedo, N, V, vWorldPos, ao, sh, 0.85, 0.03 );
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, alpha );
}
`;

// ---------------------------------------------------------------------------

function valueNoise( x, z ) {

	const ix = Math.floor( x ), iz = Math.floor( z );
	const fx = x - ix, fz = z - iz;
	const u = fx * fx * ( 3 - 2 * fx ), v = fz * fz * ( 3 - 2 * fz );
	const a = hash2( ix, iz ), b = hash2( ix + 1, iz ), c = hash2( ix, iz + 1 ), d = hash2( ix + 1, iz + 1 );
	return a + ( b - a ) * u + ( c - a ) * v + ( a - b - c + d ) * u * v;

}

export class Forest {

	constructor( terrain, quality, renderer ) {

		this.terrain = terrain;
		this.quality = quality;
		this.renderer = renderer;
		this.group = new THREE.Group();
		this.group.name = 'forest';
		this.atlas = buildFoliageAtlas();
		this.a2c = quality.msaa > 0;
		this._lastUpdate = new THREE.Vector3( 1e9, 0, 0 );

		const rng = new RNG( 7 );
		this.variants = [
			makeConifer( rng, 'spruce' ), makeConifer( rng, 'spruce' ), makeConifer( rng, 'spruce' ),
			makeConifer( rng, 'larch' ), makeConifer( rng, 'larch' ), makeConifer( rng, 'larch' ),
			makeBirch( rng ), makeBirch( rng ),
		];
		this.shrubVariants = [ makeShrub( rng ), makeShrub( rng ), makeShrub( rng ) ];
		this.speciesVariants = { spruce: [ 0, 1, 2 ], larch: [ 3, 4, 5 ], birch: [ 6, 7 ] };

		this.sharedNear = {
			...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ),
			...sharedUniforms(),
			tAtlas: { value: this.atlas },
			uNearDist: { value: quality.treeNear },
			uFadeBand: { value: 18 },
		};

		this.nearMaterial = this._makeNearMaterial( {} );
		this.depthMaterial = new THREE.MeshDepthMaterial( { map: this.atlas, alphaTest: 0.42, side: THREE.DoubleSide } );

	}

	_makeNearMaterial( defines ) {

		const d = { ...defines };
		if ( this.a2c && ! d.BAKE_ALBEDO && ! d.BAKE_NORMAL ) d.A2C = '';
		return new THREE.ShaderMaterial( {
			vertexShader: nearVert,
			fragmentShader: nearFrag,
			uniforms: this.sharedNear,
			defines: d,
			lights: true,
			side: THREE.DoubleSide,
			alphaToCoverage: d.A2C !== undefined,
		} );

	}

	// ---------- impostor atlas ----------
	bakeImpostors() {

		const r = this.renderer;
		const cellW = 256, cellH = 512;
		const W = cellW * MAX_VARIANTS, H = cellH;
		const mk = () => new THREE.WebGLRenderTarget( W, H, {
			type: THREE.UnsignedByteType, depthBuffer: true, generateMipmaps: true,
			minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
		} );
		this.impAlbedo = mk();
		this.impNormal = mk();
		const matA = this._makeNearMaterial( { BAKE: '', BAKE_ALBEDO: '' } );
		const matN = this._makeNearMaterial( { BAKE: '', BAKE_NORMAL: '' } );
		const scene = new THREE.Scene();
		const cam = new THREE.OrthographicCamera( - 1, 1, 1, - 1, - 200, 200 );
		cam.position.set( 0, 0, 50 );
		cam.lookAt( 0, 0, 0 );
		this.cells = [];
		this.dims = [];

		const prevTarget = r.getRenderTarget();
		const prevAuto = r.autoClear;
		const prevClear = r.getClearColor( new THREE.Color() );
		const prevAlpha = r.getClearAlpha();
		r.autoClear = false;
		for ( const [ rt, mat, clear ] of [ [ this.impAlbedo, matA, 0x3a3a1a ], [ this.impNormal, matN, 0x8080ff ] ] ) {

			r.setRenderTarget( rt );
			r.setClearColor( clear, 0 );
			r.clear( true, true, false );
			this.variants.forEach( ( v, i ) => {

				const mesh = new THREE.Mesh( v.geometry, mat );
				scene.add( mesh );
				const halfW = v.radius * 1.08;
				const top = v.height * 1.04;
				// keep the 1:2 cell aspect: fit whichever dimension is larger
				const h = Math.max( top, halfW * 2 * ( cellH / cellW ) );
				const w = h * cellW / cellH;
				cam.left = - w / 2; cam.right = w / 2; cam.top = h - 0.5; cam.bottom = - 0.5;
				cam.updateProjectionMatrix();
				rt.viewport.set( i * cellW, 0, cellW, cellH );
				rt.scissor.set( i * cellW, 0, cellW, cellH );
				rt.scissorTest = true;
				r.setRenderTarget( rt );
				r.render( scene, cam );
				scene.remove( mesh );
				this.cells[ i ] = new THREE.Vector4( i * cellW / W, 0, cellW / W, 1 );
				this.dims[ i ] = new THREE.Vector4( w, h, - 0.5, 0 );

			} );
			rt.scissorTest = false;
			rt.viewport.set( 0, 0, W, H );

		}

		r.setRenderTarget( prevTarget );
		r.autoClear = prevAuto;
		r.setClearColor( prevClear, prevAlpha );
		matA.dispose();
		matN.dispose();

	}

	// ---------- placement ----------
	place() {

		const td = this.terrain;
		const rng = new RNG( 99 );
		const trees = [];
		const bio = [ 0, 0, 0, 0 ];
		const n = new THREE.Vector3();
		const near = WORLD.near;
		const nx0 = near.cx - near.size / 2, nx1 = near.cx + near.size / 2;
		const nz0 = near.cz - near.size / 2, nz1 = near.cz + near.size / 2;
		const R = 3900;

		const consider = ( x, z, cellArea, detailed ) => {

			const h = td.heightAt( x, z );
			if ( h < 1.2 ) return;
			td.biomeAt( x, z, bio );
			const forest = bio[ 1 ], grass = bio[ 0 ], rock = bio[ 2 ], shore = bio[ 3 ];
			if ( rock > 0.5 || shore > 0.4 ) return;
			td.normalAt( x, z, n, 1.5 );
			if ( n.y < 0.74 ) return;
			const treeline = 640 + ( valueNoise( x * 0.004, z * 0.004 ) - 0.5 ) * 160;
			if ( h > treeline ) return;
			let p = Math.pow( forest, 1.25 ) * 0.9;
			// lone trees and small groves in the meadows
			if ( detailed ) p += grass * 0.012 + ( valueNoise( x * 0.02 + 5, z * 0.02 ) > 0.78 ? grass * 0.05 : 0 );
			// thin out near the treeline
			p *= 1 - 0.7 * THREE.MathUtils.smoothstep( h, treeline - 120, treeline );
			p *= cellArea / 45;
			if ( rng.next() > p ) return;

			const cluster = valueNoise( x * 0.012 + 11, z * 0.012 - 3 );
			let larchP = 0.18 + THREE.MathUtils.smoothstep( h, 120, 520 ) * 0.5 + ( cluster - 0.5 ) * 0.5;
			let birchP = h < 70 ? 0.3 * ( 1 - forest * 0.6 ) : 0.03;
			const k = rng.next();
			let species = 'spruce';
			if ( k < birchP ) species = 'birch';
			else if ( k < birchP + larchP ) species = 'larch';
			const vs = this.speciesVariants[ species ];
			const variant = vs[ Math.floor( rng.next() * vs.length ) ];
			let s = rng.range( 0.72, 1.15 ) * ( 1 - 0.4 * THREE.MathUtils.smoothstep( h, treeline - 250, treeline ) );
			if ( forest < 0.3 ) s *= rng.range( 0.75, 1.0 );
			trees.push( { x, y: h - 0.15, z, s, rot: rng.next() * Math.PI * 2, variant } );

		};

		// detailed near region
		const c1 = 6.2;
		for ( let z = nz0; z < nz1; z += c1 ) for ( let x = nx0; x < nx1; x += c1 ) consider( x + rng.next() * c1, z + rng.next() * c1, c1 * c1, true );
		// the wider valley
		const c2 = 10.5;
		for ( let z = - R; z < R; z += c2 ) {

			for ( let x = - R; x < R; x += c2 ) {

				if ( x > nx0 && x < nx1 && z > nz0 && z < nz1 ) continue;
				if ( x * x + ( z + 300 ) * ( z + 300 ) > R * R ) continue;
				consider( x + rng.next() * c2, z + rng.next() * c2, c2 * c2, false );

			}

		}

		this.trees = trees;

		// shrubs along the shore and forest margins (near region only)
		const shrubs = [];
		for ( let z = nz0; z < nz1; z += 4 ) {

			for ( let x = nx0; x < nx1; x += 4 ) {

				const px = x + rng.next() * 4, pz = z + rng.next() * 4;
				const h = td.heightAt( px, pz );
				if ( h < 0.9 || h > 500 ) continue;
				td.biomeAt( px, pz, bio );
				const edge = bio[ 1 ] * ( 1 - bio[ 1 ] ) * 4; // forest margins
				const shoreBand = h < 4.5 ? 0.8 : 0;
				let p = ( edge * 0.1 + shoreBand * 0.035 ) * ( 1 - bio[ 2 ] ) * ( valueNoise( px * 0.05, pz * 0.05 ) > 0.5 ? 1 : 0.1 );
				if ( rng.next() > p ) continue;
				shrubs.push( { x: px, y: h - 0.15, z: pz, s: rng.range( 0.45, 0.85 ), rot: rng.next() * 6.28, variant: Math.floor( rng.next() * 3 ) } );

			}

		}

		this.shrubs = shrubs;
		if ( this.showcase ) {

			// debug: a row of every variant in front of the start position
			const { x, z } = this.showcase;
			this.trees = this.trees.filter( ( t ) => Math.hypot( t.x - x, t.z - z ) > 90 );
			this.shrubs = this.shrubs.filter( ( t ) => Math.hypot( t.x - x, t.z - z ) > 60 );
			this.variants.forEach( ( v, i ) => {

				const px = x + ( i - 3.5 ) * 11, pz = z - 38;
				this.trees.push( { x: px, y: td.heightAt( px, pz ) - 0.15, z: pz, s: 1, rot: i, variant: i } );

			} );
			for ( let i = 0; i < 3; i ++ ) {

				const px = x - 8 + i * 8, pz = z - 16;
				this.shrubs.push( { x: px, y: td.heightAt( px, pz ) - 0.1, z: pz, s: 1, rot: i, variant: i } );

			}

		}

		return this.trees.length;

	}

	// ---------- scene objects ----------
	build() {

		this.bakeImpostors();

		// far billboards: every tree, faded in beyond the near distance
		const quad = new THREE.PlaneGeometry( 1, 1, 1, 1 );
		quad.translate( 0, 0.5, 0 );
		const geo = new THREE.InstancedBufferGeometry();
		geo.index = quad.index;
		geo.setAttribute( 'position', quad.getAttribute( 'position' ) );
		const aTree = new Float32Array( this.trees.length * 4 );
		const aVar = new Float32Array( this.trees.length * 2 );
		this.trees.forEach( ( t, i ) => {

			aTree.set( [ t.x, t.y, t.z, t.s ], i * 4 );
			aVar.set( [ t.variant, t.rot > Math.PI ? 1 : - 1 ], i * 2 );

		} );
		geo.setAttribute( 'aTree', new THREE.InstancedBufferAttribute( aTree, 4 ) );
		geo.setAttribute( 'aVar', new THREE.InstancedBufferAttribute( aVar, 2 ) );
		geo.instanceCount = this.trees.length;

		const bbDefines = this.a2c ? { A2C: '' } : {};
		this.bbMaterial = new THREE.ShaderMaterial( {
			vertexShader: bbVert,
			fragmentShader: bbFrag,
			uniforms: {
				...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ),
				...sharedUniforms(),
				tImpAlbedo: { value: this.impAlbedo.texture },
				tImpNormal: { value: this.impNormal.texture },
				uCell: { value: this.cells },
				uDim: { value: this.dims },
				uNearDist: this.sharedNear.uNearDist,
				uFadeBand: this.sharedNear.uFadeBand,
				uFarDist: { value: 5200 },
			},
			defines: bbDefines,
			lights: true,
			side: THREE.DoubleSide,
			alphaToCoverage: this.a2c,
		} );
		this.billboards = new THREE.Mesh( geo, this.bbMaterial );
		this.billboards.frustumCulled = false;
		this.billboards.name = 'tree-billboards';
		this.group.add( this.billboards );

		// near meshes, one InstancedMesh per variant
		this.nearMeshes = this.variants.map( ( v ) => {

			const m = new THREE.InstancedMesh( v.geometry, this.nearMaterial, 4000 );
			m.count = 0;
			m.frustumCulled = false;
			m.castShadow = true;
			m.receiveShadow = true;
			m.customDepthMaterial = this.depthMaterial;
			m.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
			this.group.add( m );
			return m;

		} );

		this.shrubMeshes = this.shrubVariants.map( ( v ) => {

			const m = new THREE.InstancedMesh( v.geometry, this.nearMaterial, 6000 );
			m.count = 0;
			m.frustumCulled = false;
			m.castShadow = true;
			m.customDepthMaterial = this.depthMaterial;
			m.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
			this.group.add( m );
			return m;

		} );

		// precomputed instance matrices
		const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
		const up = new THREE.Vector3( 0, 1, 0 );
		const compose = ( list ) => {

			const arr = new Float32Array( list.length * 16 );
			list.forEach( ( t, i ) => {

				q.setFromAxisAngle( up, t.rot );
				mat.compose( p.set( t.x, t.y, t.z ), q, s.set( t.s, t.s, t.s ) );
				mat.toArray( arr, i * 16 );

			} );
			return arr;

		};

		this.treeMatrices = compose( this.trees );
		this.shrubMatrices = compose( this.shrubs );
		return this.group;

	}

	setNearDistance( d ) {

		this.sharedNear.uNearDist.value = d;
		this._lastUpdate.set( 1e9, 0, 0 );

	}

	update( camera ) {

		const cp = camera.position;
		if ( cp.distanceToSquared( this._lastUpdate ) < 16 ) return;
		this._lastUpdate.copy( cp );
		const nearD = this.sharedNear.uNearDist.value + 4;
		const nd2 = nearD * nearD;
		const fill = ( list, matrices, meshes, maxD2 ) => {

			const counts = meshes.map( () => 0 );
			for ( let i = 0; i < list.length; i ++ ) {

				const t = list[ i ];
				const dx = t.x - cp.x, dz = t.z - cp.z;
				if ( dx * dx + dz * dz > maxD2 ) continue;
				const m = meshes[ t.variant ];
				const c = counts[ t.variant ];
				if ( c >= m.instanceMatrix.count ) continue;
				m.instanceMatrix.array.set( matrices.subarray( i * 16, i * 16 + 16 ), c * 16 );
				counts[ t.variant ] = c + 1;

			}

			meshes.forEach( ( m, k ) => {

				m.count = counts[ k ];
				m.instanceMatrix.clearUpdateRanges();
				m.instanceMatrix.addUpdateRange( 0, counts[ k ] * 16 );
				m.instanceMatrix.needsUpdate = true;

			} );

		};

		fill( this.trees, this.treeMatrices, this.nearMeshes, nd2 );
		const sd = Math.min( 160, nearD );
		fill( this.shrubs, this.shrubMatrices, this.shrubMeshes, sd * sd );

	}

}
