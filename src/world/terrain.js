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

	const xs = axis( - extent, extent, - 600, 600, spacing, growth );
	const zs = axis( - extent, extent, - 1250, 820, spacing, growth );
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
uniform float uGrassFar;
varying vec3 vWorldPos;

vec3 decode( vec3 c ) { return pow( c, vec3( 2.2 ) ); }
vec3 unpackN( vec4 t ) { vec2 xy = t.xy * 2.0 - 1.0; return vec3( xy, sqrt( max( 0.0, 1.0 - dot( xy, xy ) ) ) ); }

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

	// macro relief for distant faces: ribs and gullies the heightmap is too coarse to hold
	vec3 macroDN;
	{
		float e = 0.012;
		vec2 a = wp.xz / 150.0, b = vec2( ( wp.x + wp.z ) * 0.7, wp.y * 1.6 ) / 150.0;
		float a0 = texture2D( uNoiseTex, a ).r, ax = texture2D( uNoiseTex, a + vec2( e, 0.0 ) ).r, az = texture2D( uNoiseTex, a + vec2( 0.0, e ) ).r;
		float b0 = texture2D( uNoiseTex, b ).g, bx = texture2D( uNoiseTex, b + vec2( e, 0.0 ) ).g, by = texture2D( uNoiseTex, b + vec2( 0.0, e ) ).g;
		vec3 flat_ = vec3( a0 - ax, 0.0, a0 - az );
		vec2 hz = normalize( vec2( N.x, N.z ) + 1e-4 );
		vec3 wall_ = vec3( vec2( -hz.y, hz.x ) * ( b0 - bx ), b0 - by ).xzy;
		macroDN = mix( flat_, wall_, smoothstep( 0.15, 0.45, steep ) ) * 9.0;
	}

	// ---------- pebbles / shore ----------
	vec2 puv = wp.xz / 1.5;
	vec4 pebT = texture( tMat, vec3( puv, PEBBLE ) );
	vec3 pebDN = unpackN( texture( tMatN, vec3( puv, PEBBLE ) ) );
	vec3 pebAlb = decode( pebT.rgb ) * ( 0.62 + 0.3 * gnoise( wp.xz * 0.15 ) );

	// ---------- soil / forest floor ----------
	vec2 suv = wp.xz / 3.2;
	vec4 soilT = texture( tMat, vec3( suv, SOIL ) );
	vec3 soilDN = unpackN( texture( tMatN, vec3( suv, SOIL ) ) );
	vec3 soilAlb = decode( soilT.rgb );

	// ---------- grass ground ----------
	vec3 gcol = grassColor( wp.xz, h );
	float nearG = 1.0 - smoothstep( 8.0, uGrassFar, dist );
	// under the blades: dark matted thatch rather than bare soil
	vec3 thatch = gcol * ( 0.38 + 0.25 * soilT.a ) + vec3( 0.012, 0.008, 0.003 );
	vec3 grassGround = mix( gcol * 0.85, thatch, nearG );

	// ---------- layer weights ----------
	float wGrass = bio.r;
	float wForest = bio.g;
	float wShore = bio.a;
	float wRock = bio.b;
	// height-aware blend: rock pokes through where its texture is high
	wRock = smoothstep( 0.0, 1.0, wRock * 1.5 - 0.25 + ( rockT.a - 0.5 ) * 0.9 );

	vec3 alb = grassGround;
	vec3 dn = soilDN * 0.3 * nearG;
	float rough = 0.92;
	// forest floor
	float fW = smoothstep( 0.15, 0.7, wForest ) * ( 1.0 - wGrass * 0.6 );
	alb = mix( alb, soilAlb * vec3( 0.95, 0.9, 0.85 ), fW );
	dn = mix( dn, soilDN, fW );
	// bare ground where nothing grows (neither grass nor forest)
	// scree and gravel where nothing grows (neither grass nor forest)
	float bare = ( 1.0 - smoothstep( 0.05, 0.4, wGrass + wForest ) ) * ( 1.0 - wShore );
	vec3 scree = mix( decode( texture( tMat, vec3( wp.xz / 3.0, PEBBLE ) ).rgb ) * 0.8, rockAlb, 0.55 );
	scree = mix( soilAlb, scree, smoothstep( 80.0, 300.0, h ) );
	alb = mix( alb, scree, bare * 0.85 );
	// shore
	float sW = smoothstep( 0.2, 0.8, wShore + ( pebT.a - 0.5 ) * 0.4 );
	alb = mix( alb, pebAlb, sW );
	dn = mix( dn, pebDN, sW );
	// rock
	alb = mix( alb, rockAlb, wRock );
	dn = mix( dn, rockDN, wRock );
	rough = mix( rough, 0.75, wRock );

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
	float under = smoothstep( -0.05, 0.25, depth );
	vec3 silt = decode( vec3( 0.33, 0.31, 0.22 ) ) * ( 0.8 + 0.2 * pebT.a );
	alb = mix( alb, mix( pebAlb, silt, smoothstep( 0.4, 5.0, depth ) ), under );
	float wet = 1.0 - smoothstep( 0.0, 0.45 + 0.15 * sin( uTime * 0.6 + wp.x * 0.05 ), h - uWaterLevel );
	wet *= 1.0 - under;
	alb *= 1.0 - wet * 0.45;
	rough = mix( rough, mix( 0.22, 0.6, smoothstep( 60.0, 400.0, dist ) ), wet );

	// ---------- normal ----------
	float detailFade = 1.0 - smoothstep( 60.0, 400.0, dist );
	vec3 Nd = normalize( N + dn * vec3( 1.0, 0.0, 1.0 ) * 0.9 * detailFade + vec3( 0.0, dn.y * 0.0, 0.0 ) );
	if ( wRock > 0.0 ) Nd = normalize( mix( Nd, normalize( N + rockDN * 0.8 * detailFade ), wRock ) );
	Nd = normalize( Nd + macroDN * smoothstep( 80.0, 350.0, dist ) * ( 0.35 + 0.65 * max( wRock, bare ) ) * ( 1.0 - snow * 0.5 ) );

	// ---------- lighting ----------
	float cavity = mix( 1.0, 0.65 + 0.35 * mix( soilT.a, rockT.a, wRock ), detailFade );
	float occl = ao * cavity * ( 1.0 - wForest * 0.45 );
	float sh = sunShadow( wp, N );
	// canopy shade inside dense stands (trees far away are not in the shadow cascades)
	sh *= 1.0 - wForest * 0.55 * smoothstep( 80.0, 400.0, dist );
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

	}

}
