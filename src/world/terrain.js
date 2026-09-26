import * as THREE from 'three';
import { commonParsGLSL } from '../shaders/common.glsl.js';
import { paletteGLSL } from '../shaders/palette.glsl.js';
import { sharedUniforms } from '../core/uniforms.js';

// Grid coordinates along one axis: uniform spacing through the detailed core,
// then geometrically growing cells out to the edge of the world.
function axis( min, max, coreMin, coreMax, s0, growth ) {

	const core = [];
	const n = Math.ceil( ( coreMax - coreMin ) / s0 );
	for ( let i = 0; i <= n; i ++ ) core.push( coreMin + ( coreMax - coreMin ) * i / n );
	const right = [];
	let s = s0, x = coreMax;
	while ( x < max ) {

		s *= growth;
		x = Math.min( x + s, max );
		right.push( x );

	}

	const left = [];
	s = s0;
	x = coreMin;
	while ( x > min ) {

		s *= growth;
		x = Math.max( x - s, min );
		left.push( x );

	}

	return [ ...left.reverse(), ...core, ...right ];

}

export function buildTerrainGeometry( data, spacing = 2, growth = 1.03, extent = 6000 ) {

	// full detail over the lake, the meadows and the whole stream up to the falls
	const xs = axis( - extent, extent, - 440, 400, spacing, growth );
	const zs = axis( - extent, extent, - 720, 920, spacing, growth );
	const nx = xs.length, nz = zs.length;
	const pos = new Float32Array( nx * nz * 3 );
	let k = 0;
	for ( let j = 0; j < nz; j ++ ) {

		for ( let i = 0; i < nx; i ++ ) {

			const x = xs[ i ], z = zs[ j ];
			pos[ k ++ ] = x;
			pos[ k ++ ] = data.heightAt( x, z );
			pos[ k ++ ] = z;

		}

	}

	const idx = new Uint32Array( ( nx - 1 ) * ( nz - 1 ) * 6 );
	k = 0;
	for ( let j = 0; j < nz - 1; j ++ ) {

		for ( let i = 0; i < nx - 1; i ++ ) {

			const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
			// alternate the diagonal for a less directional triangulation
			if ( ( i + j ) & 1 ) {

				idx[ k ++ ] = a; idx[ k ++ ] = c; idx[ k ++ ] = b;
				idx[ k ++ ] = b; idx[ k ++ ] = c; idx[ k ++ ] = d;

			} else {

				idx[ k ++ ] = a; idx[ k ++ ] = c; idx[ k ++ ] = d;
				idx[ k ++ ] = a; idx[ k ++ ] = d; idx[ k ++ ] = b;

			}

		}

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
	g.setIndex( new THREE.BufferAttribute( idx, 1 ) );
	g.computeBoundingSphere();
	g.boundingSphere.radius = extent * 2;
	return g;

}

const vert = /* glsl */ `
varying vec3 vWorldPos;
void main() {
	vec4 wp = modelMatrix * vec4( position, 1.0 );
	vWorldPos = wp.xyz;
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const frag = /* glsl */ `
${commonParsGLSL}
${paletteGLSL}
uniform sampler2DArray tMat;
uniform sampler2DArray tMatN;
#define ROCK 0.0
#define PEBBLE 1.0
#define SOIL 2.0
#define TURF 3.0
uniform float uGrassFar;
varying vec3 vWorldPos;

vec3 decode( vec3 c ) { return pow( c, vec3( 2.2 ) ); }
vec3 unpackN( vec4 t ) { vec2 xy = t.xy * 2.0 - 1.0; return vec3( xy, sqrt( max( 0.0, 1.0 - dot( xy, xy ) ) ) ); }
// tangent-space slope of an xz-projected texture -> world-space perturbation
vec3 tn2w( vec3 t ) { return vec3( t.x, 0.0, t.y ); }

void main() {
	vec3 wp = vWorldPos;
	vec3 V = cameraPosition - wp;
	float dist = length( V );
	V /= dist;

	vec4 hn = terrainHN( wp.xz );
	vec3 N = hnNormal( hn );
	float ao = hn.w;
	vec4 bio = biomeAt( wp.xz );
	float h = wp.y;
	float steep = 1.0 - N.y;
	float macro = gnoise( wp.xz * 0.004 ) * 0.5 + gnoise( wp.xz * 0.019 ) * 0.3;

	// ---------- rock (triplanar, two scales against tiling) ----------
	vec3 bw = pow( abs( N ), vec3( 4.0 ) );
	bw /= bw.x + bw.y + bw.z;
	float rs = 1.0 / 7.0;
	vec4 rX = texture( tMat, vec3( wp.zy * rs, ROCK ) );
	vec4 rY = texture( tMat, vec3( wp.xz * rs, ROCK ) );
	vec4 rZ = texture( tMat, vec3( wp.xy * rs, ROCK ) );
	vec4 rockT = rX * bw.x + rY * bw.y + rZ * bw.z;
	vec4 rockT2 = texture( tMat, vec3( wp.xz * rs * 0.21 + 0.37, ROCK ) ) * bw.y + texture( tMat, vec3( wp.zy * rs * 0.21, ROCK ) ) * bw.x + texture( tMat, vec3( wp.xy * rs * 0.21, ROCK ) ) * bw.z;
	rockT = mix( rockT, rockT2, 0.4 );
	vec3 nX = unpackN( texture( tMatN, vec3( wp.zy * rs, ROCK ) ) );
	vec3 nY = unpackN( texture( tMatN, vec3( wp.xz * rs, ROCK ) ) );
	vec3 nZ = unpackN( texture( tMatN, vec3( wp.xy * rs, ROCK ) ) );
	vec3 rockDN = vec3( 0.0, nX.y, nX.x ) * bw.x + vec3( nY.x, 0.0, nY.y ) * bw.y + vec3( nZ.x, nZ.y, 0.0 ) * bw.z;
	vec3 rockAlb = decode( rockT.rgb );
	rockAlb *= 0.85 + macro * 0.25;
	// geology: strata of differing tone, iron-ochre stains, dark water streaks down the cliffs
	float band = gnoise( vec2( h * 0.045 + macro * 2.0, 0.5 ) ) + gnoise( vec2( h * 0.12, 3.0 ) ) * 0.4;
	rockAlb *= mix( vec3( 0.86, 0.85, 0.84 ), vec3( 1.1, 1.05, 0.99 ), smoothstep( -0.6, 0.6, band ) );
	float ochre = smoothstep( 0.2, 0.75, gnoise( wp.xz * 0.0032 + h * 0.003 ) + band * 0.25 );
	rockAlb = mix( rockAlb, rockAlb * vec3( 1.3, 0.96, 0.66 ), ochre * 0.5 );
	float streak = smoothstep( 0.3, 0.85, gnoise( vec2( ( wp.x + wp.z ) * 0.05, h * 0.0025 ) ) );
	rockAlb *= 1.0 - streak * 0.35 * smoothstep( 0.25, 0.5, steep );

	// macro relief for distant faces: ribs, gullies and boulder fields the heightmap
	// is too coarse to hold. Triplanar so steep faces don't stretch.
	vec3 macroDN;
	{
		float e = 4.0;
		#define MH( uv ) ( texture2D( uNoiseTex, ( uv ) / 170.0 ).r * 0.75 + texture2D( uNoiseTex, ( uv ) / 60.0 + 0.3 ).g * 0.25 )
		float x0 = MH( wp.zy ), xz = MH( wp.zy + vec2( e, 0.0 ) ), xy = MH( wp.zy + vec2( 0.0, e ) );
		float y0 = MH( wp.xz ), yx = MH( wp.xz + vec2( e, 0.0 ) ), yz = MH( wp.xz + vec2( 0.0, e ) );
		float z0 = MH( wp.xy ), zx = MH( wp.xy + vec2( e, 0.0 ) ), zy = MH( wp.xy + vec2( 0.0, e ) );
		#undef MH
		vec3 g = vec3( 0.0, xy - x0, xz - x0 ) * bw.x + vec3( yx - y0, 0.0, yz - y0 ) * bw.y + vec3( zx - z0, zy - z0, 0.0 ) * bw.z;
		g /= e;
		macroDN = -( g - N * dot( g, N ) ) * 11.0;
	}

	// ---------- beach stones ----------
	vec2 puv = wp.xz / 2.4;
	vec4 pebT = texture( tMat, vec3( puv, PEBBLE ) );
	vec3 pebDN = tn2w( unpackN( texture( tMatN, vec3( puv, PEBBLE ) ) ) );
	vec3 pebAlb = decode( pebT.rgb ) * ( 0.8 + 0.35 * gnoise( wp.xz * 0.11 ) );
	{
		// a second, larger pebble scale, rotated, breaks up the tiling
		vec2 puv2 = mat2( 0.8, -0.6, 0.6, 0.8 ) * wp.xz / 5.3 + 0.37;
		vec4 pebT2 = texture( tMat, vec3( puv2, PEBBLE ) );
		float mixP = smoothstep( 0.3, 0.7, texture2D( uNoiseTex, wp.xz / 19.0 + 0.2 ).g );
		pebAlb = mix( pebAlb, decode( pebT2.rgb ) * ( 0.85 + 0.3 * gnoise( wp.xz * 0.07 + 3.0 ) ), mixP );
		pebT.a = mix( pebT.a, pebT2.a, mixP );
		// pale sand and fine grit in patches, and washed up along the swash line
		float grit = gnoise( wp.xz * 9.0 ) * 0.5 + 0.5;
		vec3 sand = decode( vec3( 0.58, 0.53, 0.44 ) ) * ( 0.85 + 0.25 * grit );
		float sandW = smoothstep( 0.45, 0.75, texture2D( uNoiseTex, wp.xz / 31.0 + 0.61 ).b + 0.2 * gnoise( wp.xz * 0.4 ) );
		sandW = max( sandW, smoothstep( 0.55, 0.3, h ) * smoothstep( 0.05, 0.2, h ) * 0.6 );
		pebAlb = mix( pebAlb, sand, sandW * ( 1.0 - smoothstep( 0.6, 0.9, pebT.a ) * 0.6 ) );
		pebT.a = mix( pebT.a, 0.4 + 0.2 * grit, sandW * 0.7 );
	}

	// ---------- soil / forest floor ----------
	vec2 suv = wp.xz / 3.2;
	vec4 soilT = texture( tMat, vec3( suv, SOIL ) );
	vec3 soilDN = tn2w( unpackN( texture( tMatN, vec3( suv, SOIL ) ) ) );
	vec3 soilAlb = decode( soilT.rgb );

	// ---------- meadow turf ----------
	vec2 tuv = wp.xz / 2.2;
	vec4 turfT = texture( tMat, vec3( tuv, TURF ) );
	vec4 turfT2 = texture( tMat, vec3( wp.xz / 8.7 + 0.41, TURF ) );
	vec3 turfDN = tn2w( unpackN( texture( tMatN, vec3( tuv, TURF ) ) ) );
	vec3 turf = decode( mix( turfT.rgb, turfT2.rgb, 0.35 ) );
	vec3 gcol = grassColor( wp.xz, h );
	// tint the turf toward the local grass palette (patches of green, straw and rust)
	vec3 tinted = mix( turf, gcol * ( luma( turf ) / max( luma( gcol ), 1e-3 ) ), 0.45 );
	float nearG = 1.0 - smoothstep( 8.0, uGrassFar, dist );
	// near: turf glimpsed between blades; far: turf blended with the blades' average colour
	vec3 grassGround = mix( mix( tinted, gcol, 0.5 ), tinted * 0.85, nearG );

	// ---------- layer weights ----------
	float wGrass = bio.r;
	float wForest = bio.g;
	float wShore = bio.a;
	float wRock = bio.b;
	// height-aware blend: rock pokes through where its texture is high
	wRock = smoothstep( 0.0, 1.0, wRock * 1.5 - 0.25 + ( rockT.a - 0.5 ) * 0.9 );

	vec3 alb = grassGround;
	vec3 dn = turfDN * 0.6;
	float rough = 0.92;
	float cav = turfT.a;
	// forest floor
	float fW = smoothstep( 0.15, 0.7, wForest ) * ( 1.0 - wGrass * 0.6 );
	alb = mix( alb, soilAlb * vec3( 0.95, 0.9, 0.85 ), fW );
	dn = mix( dn, soilDN, fW );
	cav = mix( cav, soilT.a, fW );
	// distant forest: the ground between far trees reads as continuous canopy
	float canopyW = smoothstep( 0.06, 0.4, wForest ) * smoothstep( 120.0, 600.0, dist );
	float larchK = saturate( 0.18 + smoothstep( 120.0, 520.0, h ) * 0.5 + gnoise( wp.xz * 0.012 + vec2( 11.0, -3.0 ) ) * 0.35 );
	vec3 canopy = mix( decode( vec3( 0.1, 0.16, 0.1 ) ), decode( vec3( 0.62, 0.46, 0.16 ) ), smoothstep( 0.35, 0.8, larchK + gnoise( wp.xz * 0.05 ) * 0.25 ) );
	canopy *= 0.75 + 0.5 * texture2D( uNoiseTex, wp.xz / 90.0 ).b;
	alb = mix( alb, canopy, canopyW );
	// scree and gravel where nothing grows (neither grass nor forest)
	float bare = ( 1.0 - smoothstep( 0.05, 0.4, wGrass + wForest ) ) * ( 1.0 - wShore );
	vec3 scree = mix( decode( texture( tMat, vec3( wp.xz / 4.0, PEBBLE ) ).rgb ) * 0.8, rockAlb, 0.55 );
	scree = mix( soilAlb, scree, smoothstep( 80.0, 300.0, h ) );
	alb = mix( alb, scree, bare * 0.85 );
	// shore: a strand of stones with a ragged, natural edge into the turf
	float edgeN = gnoise( wp.xz * 0.9 ) * 0.22 + gnoise( wp.xz * 0.21 ) * 0.25;
	float sW = smoothstep( 0.3, 0.7, wShore + edgeN + ( pebT.a - 0.5 ) * 0.6 );
	alb = mix( alb, pebAlb, sW );
	dn = mix( dn, pebDN * 1.3, sW );
	cav = mix( cav, pebT.a, sW );
	// steep banks on the valley floor: bare earth in layers, roots, a turf lip
	float bankW = smoothstep( 0.2, 0.36, steep + gnoise( wp.xz * 1.3 ) * 0.05 ) * ( 1.0 - smoothstep( 25.0, 60.0, h ) ) * ( 1.0 - wRock ) * ( 1.0 - smoothstep( 0.5, 0.9, wShore ) );
	if ( bankW > 0.0 ) {
		float strata = gnoise( vec2( ( wp.x + wp.z ) * 0.35, h * 9.0 ) ) * 0.5 + 0.5;
		vec3 earth = mix( decode( vec3( 0.33, 0.24, 0.16 ) ), decode( vec3( 0.46, 0.35, 0.24 ) ), strata );
		earth = mix( earth, decode( vec3( 0.2, 0.15, 0.1 ) ), smoothstep( 0.55, 0.9, gnoise( wp.xz * 3.5 + h * 6.0 ) ) * 0.6 );
		earth = mix( earth, pebAlb, smoothstep( 0.6, 0.85, pebT.a ) * 0.5 );
		alb = mix( alb, earth, bankW );
		dn = mix( dn, soilDN * 1.2, bankW );
		cav = mix( cav, soilT.a, bankW );
	}
	// rock
	alb = mix( alb, rockAlb, wRock );
	dn = mix( dn, rockDN, wRock );
	rough = mix( rough, 0.75, wRock );
	cav = mix( cav, rockT.a, wRock );

	// ---------- snow ----------
	float snowline = 1020.0 + macro * 160.0 + gnoise( wp.xz * 0.02 ) * 25.0;
	float snow = smoothstep( snowline, snowline + 90.0, h );
	snow *= 1.0 - smoothstep( 0.2 + rockT.a * 0.12, 0.36, steep );
	// wind-blown dusting clinging to ledges and gullies
	snow = max( snow, smoothstep( snowline + 60.0, snowline + 300.0, h ) * smoothstep( 0.55, 0.3, steep - ( 1.0 - rockT.a ) * 0.25 ) * 0.9 );
	snow = saturate( snow + ( rockT.a - 0.5 ) * 0.4 * snow );
	alb = mix( alb, vec3( 0.86, 0.9, 0.97 ), snow );
	dn = mix( dn, vec3( 0.0 ), snow * 0.8 );
	rough = mix( rough, 0.55, snow );

	// ---------- underwater & wet margin ----------
	float depth = uWaterLevel - h;
	float under = smoothstep( -0.05, 0.2, depth );
	// submerged stones grow a film of algae, then settle into silt with depth
	vec3 algae = pebAlb * vec3( 0.5, 0.6, 0.36 ) + vec3( 0.006, 0.012, 0.0 );
	vec3 silt = decode( vec3( 0.3, 0.29, 0.21 ) ) * ( 0.8 + 0.3 * pebT.a );
	vec3 bed = mix( pebAlb * 0.85, algae, smoothstep( 0.1, 1.2, depth ) );
	bed = mix( bed, silt, smoothstep( 1.5, 6.0, depth ) * ( 1.0 - smoothstep( 0.55, 0.8, pebT.a ) * 0.6 ) );
	alb = mix( alb, bed, under );
	dn = mix( dn, pebDN, under * ( 1.0 - smoothstep( 2.0, 8.0, depth ) ) );
	cav = mix( cav, pebT.a, under );
	// soaked band that breathes with the lapping water (same phase as the water shader)
	float lap = 0.12 * sin( uTime * 1.1 + wp.x * 0.35 + wp.z * 0.27 );
	float wet = 1.0 - smoothstep( 0.0, 0.5 + lap, h - uWaterLevel );
	wet *= 1.0 - under;
	alb *= 1.0 - wet * 0.5;
	rough = mix( rough, mix( 0.22, 0.6, smoothstep( 60.0, 400.0, dist ) ), wet );

	// ---------- normal ----------
	float detailFade = 1.0 - smoothstep( 60.0, 400.0, dist );
	vec3 Nd = normalize( N + dn * 0.9 * detailFade );
	if ( wRock > 0.0 ) Nd = normalize( mix( Nd, normalize( N + rockDN * 0.8 * detailFade ), wRock ) );
	Nd = normalize( Nd + macroDN * smoothstep( 80.0, 350.0, dist ) * ( 0.35 + 0.65 * max( wRock, bare ) ) * ( 1.0 - snow * 0.5 ) );

	// ---------- lighting ----------
	float cavity = mix( 1.0, 0.55 + 0.45 * cav, detailFade );
	float occl = ao * cavity * ( 1.0 - wForest * 0.45 );
	float sh = sunShadow( wp, N );
	// canopy shade inside dense stands (trees far away are not in the shadow cascades)
	sh *= 1.0 - wForest * 0.55 * smoothstep( 80.0, 400.0, dist ) * ( 1.0 - canopyW * 0.7 );
	vec3 col = shadeSurface( alb, Nd, V, wp, occl, sh, rough, mix( 0.03, 0.02, wet ) );

	// snow sparkle
	if ( snow > 0.1 ) {
		vec3 g = floor( wp * 40.0 );
		float spark = step( 0.996, hash13( g + floor( uTime * 0.0 ) ) ) * snow;
		vec3 H = normalize( uSunDir + V );
		col += uSunColor * sh * spark * pow( saturate( dot( Nd, H ) ), 12.0 ) * 6.0 * detailFade;
	}

	// caustics dance on the lakebed
	if ( depth > 0.0 ) {
		col += alb * uSunColor * sh * caustics( wp ) * 0.9 * underwaterLight( wp ) * max( uSunDir.y, 0.0 );
		col = waterColumn( col, wp, uSunColor * sh );
	}

	col = applyAtmosphere( col, wp );
	gl_FragColor = vec4( col, 1.0 );
}
`;

export class Terrain {

	constructor( data, textures, quality ) {

		this.data = data;
		this.uniforms = {
			...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ),
			...sharedUniforms(),
			tMat: { value: textures.matAlbedo },
			tMatN: { value: textures.matNormal },
			uGrassFar: { value: quality.grassFar },
		};
		this.material = new THREE.ShaderMaterial( {
			vertexShader: vert,
			fragmentShader: frag,
			uniforms: this.uniforms,
			lights: true,
		} );

		this.mesh = new THREE.Mesh( buildTerrainGeometry( data, quality.terrainSpacing ), this.material );
		this.mesh.name = 'terrain';
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = true;
		this.mesh.layers.set( 1 );

		// coarser copy for the water reflection pass
		this.reflectMesh = new THREE.Mesh( buildTerrainGeometry( data, quality.terrainSpacing * 2.5, 1.045 ), this.material );
		this.reflectMesh.frustumCulled = false;
		this.reflectMesh.layers.set( 2 );
		// the terrain's shader is the costliest in the frame: draw it after grass, trees and
		// rocks so that the ground they hide is rejected by the depth test instead of shaded
		this.mesh.renderOrder = 5;
		this.reflectMesh.renderOrder = 5;

	}

}
