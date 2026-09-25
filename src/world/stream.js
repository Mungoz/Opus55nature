import * as THREE from 'three';
import { commonParsGLSL } from '../shaders/common.glsl.js';
import { sharedUniforms } from '../core/uniforms.js';
import { FALL } from '../core/features.js';

const lightsU = () => ( { ...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ), ...sharedUniforms() } );

// Water that is not the lake: the stream (flowing, along a ribbon) and ponds
// (still). No planar mirror here, so reflections come from the sky model.
const flowVert = /* glsl */ `
attribute vec4 aFlow; // across (-1..1), along (m), speed (m/s), turbulence
attribute vec2 aDir;  // flow direction (xz)
attribute float aHalfW;
varying vec3 vWorldPos;
varying vec4 vFlow;
varying vec2 vDir;
varying float vHalfW;
void main() {
	vec4 wp = modelMatrix * vec4( position, 1.0 );
	vWorldPos = wp.xyz;
	vFlow = aFlow;
	vDir = aDir;
	vHalfW = aHalfW;
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const flowFrag = /* glsl */ `
${commonParsGLSL}
uniform sampler2D tWaterN;
uniform sampler2D tReflect; // the lake's mirror image
uniform mat4 uTexMatrix;
varying vec3 vWorldPos;
varying vec4 vFlow;
varying vec2 vDir;
varying float vHalfW;
vec2 wn( vec2 uv ) { return texture2D( tWaterN, uv ).xy * 2.0 - 1.0; }
void main() {
	vec3 wp = vWorldPos;
	vec3 V = cameraPosition - wp;
	float dist = length( V );
	V /= dist;
	float across = vFlow.x, along = vFlow.y, speed = vFlow.z, turb = vFlow.w;
	vec2 dir = normalize( vDir + 1e-4 );
	vec2 side = vec2( -dir.y, dir.x );
	float t = uTime;
	float edge = abs( across );
	float mid = 1.0 - edge * edge;
	vec2 s;
	if ( speed > 0.01 ) {
		// ripples drawn out along the current and carried downstream; the fastest,
		// choppiest water runs down the middle, the margins are glassy
		vec2 q = vec2( across * vHalfW, along );
		float v = speed * ( 0.35 + 0.65 * mid );
		vec2 a = wn( vec2( q.x / 1.5, ( q.y - t * v ) / 4.2 ) );
		vec2 b = wn( vec2( q.x / 0.6 + 0.37, ( q.y - t * v * 1.15 ) / 1.4 ) );
		vec2 c = wn( vec2( q.x / 3.1 + 0.71, ( q.y - t * v * 0.8 ) / 7.0 ) );
		vec2 ts = a * 0.45 + b * 0.3 + c * 0.35;
		s = ( side * ts.x + dir * ts.y ) * ( 0.05 + ( 0.12 + 0.3 * turb ) * mid );
	} else {
		// still pond: only the breeze
		vec2 w = normalize( uWind.xy + 1e-4 );
		s = ( wn( wp.xz / 4.0 + w * t * 0.02 ) * 0.6 + wn( wp.xz / 1.3 - w * t * 0.035 ) * 0.4 ) * ( 0.012 + 0.07 * uWind.z );
	}
	// ripples too fine to resolve average out to a smoother, glossier surface
	s /= 1.0 + dist * 0.006;
	vec3 N = normalize( vec3( -s.x, 1.0, -s.y ) );
	float NoV = max( dot( N, V ), 0.0 );
	float F = 0.02 + 0.98 * pow( 1.0 - NoV, 5.0 );
	vec3 R = reflect( -V, N );
	vec3 sky = skyRadiance( normalize( vec3( R.x, max( R.y, 0.03 ), R.z ) ) );
	vec3 amb = skyIrradiance( vec3( 0.0, 1.0, 0.0 ) );
	float sh = sunShadow( wp, vec3( 0.0, 1.0, 0.0 ) );
	// a narrow stream mostly mirrors its own banks - turf, grass and trees - and
	// only sees open sky in steeper reflections; ponds see more of the sky
	vec3 bankCol = ( amb * 0.5 + uSunColor * sh * max( uSunDir.y, 0.0 ) * 0.4 ) * vec3( 0.075, 0.085, 0.035 );
	float horizon = clamp( 1.1 / vHalfW, 0.05, 0.36 );
	vec3 refl = mix( bankCol, sky, smoothstep( horizon * 0.35, horizon, R.y + 0.16 * ( texture2D( uNoiseTex, wp.xz * 0.03 ).r - 0.5 ) ) );
	if ( speed < 0.01 ) {
		// still pools mirror the mountains and woods: look up the lake's reflection along this
		// pixel's own reflected ray (exact for anything more than a few tens of metres away)
		vec4 rc = uTexMatrix * vec4( wp + R * 400.0, 1.0 );
		vec2 ruv = rc.xy / rc.w + s * 0.25;
		if ( rc.w > 0.0 && all( greaterThan( ruv, vec2( 0.001 ) ) ) && all( lessThan( ruv, vec2( 0.999 ) ) ) ) refl = texture2D( tReflect, ruv ).rgb;
	}
	vec3 spec = uSunColor * sh * specGGX( N, V, uSunDir, mix( 0.08, 0.2, turb ), 0.02 );
	// clear peaty water: the stony bed shows through where it is shallow or seen
	// from above, the colour builds with the path length through the water
	float depthM = speed > 0.01 ? ( 0.4 + vHalfW * 0.1 ) * pow( mid, 0.8 ) + 0.02 : along;
	float path = depthM / max( V.y, 0.12 );
	vec3 tint = speed > 0.01 ? vec3( 0.2, 0.36, 0.3 ) : vec3( 0.2, 0.17, 0.08 );
	vec3 body = ( amb * 0.07 + uSunColor * sh * max( uSunDir.y, 0.0 ) * 0.04 ) * tint;
	float bodyA = 1.0 - exp( -path * ( speed > 0.01 ? 1.3 : 2.4 ) );
	// a scum of pollen and leaf litter drifts into the lee of pond margins
	if ( speed < 0.01 ) {
		float drift = smoothstep( 0.55, 0.8, texture2D( uNoiseTex, wp.xz / 9.0 ).g ) * ( 1.0 - smoothstep( 0.1, 0.7, along ) );
		body = mix( body, ( amb * 0.3 + uSunColor * sh * 0.25 ) * vec3( 0.2, 0.15, 0.07 ), drift * 0.7 );
		bodyA = max( bodyA, drift * 0.8 );
	}
	// white water in the riffles and a thin fringe where the current meets the banks
	float n = texture2D( uNoiseTex, vec2( across * vHalfW * 0.4, ( along - t * speed ) * 0.22 ) ).b;
	float n2 = texture2D( uNoiseTex, vec2( across * vHalfW * 1.3 + 0.5, ( along - t * speed * 1.2 ) * 0.9 ) ).g;
	float foam = smoothstep( 0.62, 0.9, n * 0.75 + n2 * 0.35 + turb * 0.35 - 0.2 ) * smoothstep( 0.15, 0.6, turb ) * mid;
	foam = max( foam, smoothstep( 0.72, 0.95, edge ) * smoothstep( 0.5, 0.8, n2 ) * 0.45 * step( 0.01, speed ) );
	vec3 foamCol = ( uSunColor * sh * max( uSunDir.y, 0.1 ) + amb ) * 0.8 / PI;
	vec3 col = mix( body, refl, F ) + spec;
	float alpha = max( bodyA, F );
	col = mix( col, foamCol, foam );
	alpha = mix( alpha, 0.9, foam );
	col = applyAtmosphere( col, wp );
	gl_FragColor = vec4( col, alpha );
}
`;

// The waterfall: a cascade that hugs the rock, streaked and broken into spray.
const fallVert = /* glsl */ `
attribute vec2 aFall; // across (-1..1), down (0 top .. 1 foot)
varying vec3 vWorldPos;
varying vec2 vFall;
varying vec3 vNormal;
void main() {
	vec4 wp = modelMatrix * vec4( position, 1.0 );
	vWorldPos = wp.xyz;
	vFall = aFall;
	vNormal = normalize( mat3( modelMatrix ) * normal );
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fallFrag = /* glsl */ `
${commonParsGLSL}
uniform float uLayer;
varying vec3 vWorldPos;
varying vec2 vFall;
varying vec3 vNormal;
void main() {
	vec3 wp = vWorldPos;
	vec3 V = normalize( cameraPosition - wp );
	float t = uTime;
	float x = vFall.x, y = vFall.y;
	// the water accelerates down the face: a remapped coordinate that scrolls at a
	// constant rate but is stretched toward the foot, so streaks speed up as they fall
	float g = sqrt( y + 0.02 ) * 7.0;
	float lumps = texture2D( uNoiseTex, vec2( x * 0.8 + uLayer * 0.5, g * 0.18 - t * 0.16 ) ).r;
	float streak = texture2D( uNoiseTex, vec2( x * 1.9 + uLayer * 0.37, g * 0.07 - t * 0.12 ) ).g;
	float fine = texture2D( uNoiseTex, vec2( x * 6.5 + uLayer * 0.61, g * 0.35 - t * 0.5 ) ).b;
	float streaks = smoothstep( 0.2, 0.85, streak * 0.7 + fine * 0.45 + ( lumps - 0.5 ) * 0.3 );
	// a dense core with frayed, translucent edges that spread over the lower tiers
	float edgeN = abs( x ) + ( lumps - 0.5 ) * ( 0.25 + 0.35 * y ) + ( fine - 0.5 ) * 0.15;
	float core = 1.0 - smoothstep( 0.3 + 0.1 * y, 0.95, edgeN );
	float alpha = core * mix( 0.5, 0.97, streaks );
	// the outer veil is broken spray
	alpha *= mix( 1.0, 0.55 * smoothstep( 0.35, 0.8, streaks + ( lumps - 0.5 ) * 0.4 ), uLayer );
	alpha *= smoothstep( 0.0, 0.04, y );
	if ( alpha < 0.02 ) discard;
	float body = streaks;
	vec3 N = normalize( vNormal );
	float sh = sunShadowFast( wp );
	vec3 amb = skyIrradiance( N ) + skyIrradiance( vec3( 0.0, 1.0, 0.0 ) );
	// aerated water scatters light: bright, with a glow when back-lit
	vec3 col = ( amb * 0.5 + uSunColor * sh * ( 0.5 + 0.5 * max( dot( N, uSunDir ), 0.0 ) ) ) * 0.85 / PI;
	col += uSunColor * sh * pow( max( dot( -V, uSunDir ), 0.0 ), 5.0 ) * 0.25;
	col = mix( col * vec3( 0.8, 0.9, 0.92 ), col, body );
	col = applyAtmosphere( col, wp );
	gl_FragColor = vec4( col, alpha );
}
`;

// Spray drifting off the foot of the fall.
const mistVert = /* glsl */ `
uniform float uTime;
attribute vec4 aSeed;
varying float vAlpha;
varying vec3 vWorldPos;
void main() {
	float life = fract( uTime * ( 0.08 + aSeed.w * 0.06 ) + aSeed.z );
	vec3 p = position + vec3( ( aSeed.x - 0.5 ) * 14.0 * ( 0.3 + life ), life * 22.0 * ( 0.4 + aSeed.y ), ( aSeed.y - 0.5 ) * 14.0 * ( 0.3 + life ) );
	vAlpha = sin( life * 3.14159 ) * ( 0.5 + 0.5 * aSeed.w );
	vec4 wp = modelMatrix * vec4( p, 1.0 );
	vWorldPos = wp.xyz;
	vec4 mv = viewMatrix * wp;
	gl_Position = projectionMatrix * mv;
	gl_PointSize = clamp( ( 5.0 + life * 10.0 ) * 700.0 / max( -mv.z, 1.0 ), 2.0, 380.0 );
}
`;

const mistFrag = /* glsl */ `
${commonParsGLSL}
varying float vAlpha;
varying vec3 vWorldPos;
void main() {
	vec2 c = gl_PointCoord * 2.0 - 1.0;
	float r2 = dot( c, c );
	if ( r2 > 1.0 ) discard;
	float a = ( 1.0 - r2 ) * ( 1.0 - r2 ) * vAlpha * 0.16;
	vec3 V = normalize( cameraPosition - vWorldPos );
	vec3 col = ( skyIrradiance( vec3( 0.0, 1.0, 0.0 ) ) * 0.4 + uSunColor * sunShadowFast( vWorldPos ) * ( 0.25 + pow( max( dot( -V, uSunDir ), 0.0 ), 4.0 ) ) ) / PI;
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, a );
}
`;

const blend = {
	transparent: true,
	depthWrite: false,
	blending: THREE.CustomBlending,
	blendSrc: THREE.SrcAlphaFactor,
	blendDst: THREE.OneMinusSrcAlphaFactor,
	blendSrcAlpha: THREE.ZeroFactor,
	blendDstAlpha: THREE.OneFactor,
};

export class Streams {

	constructor( terrain, textures, water ) {

		this.terrain = terrain;
		this.group = new THREE.Group();
		this.group.name = 'streams';
		this.flowMat = new THREE.ShaderMaterial( {
			vertexShader: flowVert, fragmentShader: flowFrag, lights: true, ...blend,
			uniforms: { ...lightsU(), tWaterN: { value: textures.waterN }, tReflect: { value: water.rt.texture }, uTexMatrix: { value: water.texMatrix } },
		} );
		this._buildRiver();
		this._buildPonds();
		this._buildFall();

	}

	_buildRiver() {

		const smp = this.terrain.river;
		const pos = [], flow = [], dir = [], halfW = [], idx = [];
		// densify the samples for a smooth ribbon
		const pts = [];
		for ( let i = 0; i < smp.length - 1; i ++ ) {

			for ( let k = 0; k < 4; k ++ ) {

				const u = k / 4;
				pts.push( {
					p: smp[ i ].p.clone().lerp( smp[ i + 1 ].p, u ),
					w: THREE.MathUtils.lerp( smp[ i ].width, smp[ i + 1 ].width, u ),
					surf: THREE.MathUtils.lerp( smp[ i ].surf, smp[ i + 1 ].surf, u ),
					s: THREE.MathUtils.lerp( smp[ i ].s, smp[ i + 1 ].s, u ),
				} );

			}

		}

		const last = smp[ smp.length - 1 ];
		pts.push( { p: last.p.clone(), w: last.width, surf: last.surf, s: last.s } );
		this.path = pts;
		pts.forEach( ( pt, i ) => {

			const a = pts[ Math.max( 0, i - 1 ) ], b = pts[ Math.min( pts.length - 1, i + 1 ) ];
			const d = b.p.clone().sub( a.p ).normalize();
			const n = new THREE.Vector2( - d.y, d.x );
			const ds = Math.max( b.s - a.s, 1e-3 );
			const slope = Math.max( 0, ( a.surf - b.surf ) / ds );
			const speed = 0.35 + Math.min( slope * 40, 1.8 );
			const turb = THREE.MathUtils.clamp( slope * 25, 0, 1 ) + ( pt.s < 25 ? 1 - pt.s / 25 : 0 );
			const w = pt.w + 0.5;
			for ( const side of [ - 1, 1 ] ) {

				pos.push( pt.p.x + n.x * w * side, pt.surf, pt.p.y + n.y * w * side );
				flow.push( side, pt.s, speed, Math.min( turb, 1 ) );
				dir.push( d.x, d.y );
				halfW.push( w );

			}

			if ( i < pts.length - 1 ) {

				const k = i * 2;
				idx.push( k, k + 1, k + 2, k + 1, k + 3, k + 2 );

			}

		} );
		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'aFlow', new THREE.Float32BufferAttribute( flow, 4 ) );
		g.setAttribute( 'aDir', new THREE.Float32BufferAttribute( dir, 2 ) );
		g.setAttribute( 'aHalfW', new THREE.Float32BufferAttribute( halfW, 1 ) );
		g.setIndex( idx );
		g.computeBoundingSphere();
		const m = new THREE.Mesh( g, this.flowMat );
		m.renderOrder = 11;
		m.layers.set( 1 );
		m.name = 'river';
		this.group.add( m );

	}

	_buildPonds() {

		const td = this.terrain;
		for ( const pd of td.ponds ) {

			// march out from the centre to where the bank rises above the water, all round
			const N = 120, rings = 6;
			const edge = [];
			for ( let k = 0; k < N; k ++ ) {

				const a = k / N * Math.PI * 2;
				const dx = Math.cos( a ), dz = Math.sin( a );
				let r = 0.5;
				while ( r < pd.r * 2.4 && td.heightAt( pd.c.x + dx * r, pd.c.y + dz * r ) < pd.surf + 0.02 ) r += 0.25;
				edge.push( r + 0.8 );

			}

			const pos = [], flow = [], dir = [], hw = [], idx = [];
			const vert = ( x, z ) => {

				const depth = Math.max( 0, pd.surf - td.heightAt( pd.c.x + x, pd.c.y + z ) );
				pos.push( x, 0, z );
				flow.push( 0, depth, 0, 0 );
				dir.push( 1, 0 );
				hw.push( pd.r );
				return pos.length / 3 - 1;

			};

			const c = vert( 0, 0 );
			const grid = [];
			for ( let j = 1; j <= rings; j ++ ) {

				const row = [];
				for ( let k = 0; k < N; k ++ ) {

					const a = k / N * Math.PI * 2, r = edge[ k ] * j / rings;
					row.push( vert( Math.cos( a ) * r, Math.sin( a ) * r ) );

				}

				grid.push( row );

			}

			for ( let k = 0; k < N; k ++ ) {

				const k1 = ( k + 1 ) % N;
				idx.push( c, grid[ 0 ][ k1 ], grid[ 0 ][ k ] );
				for ( let j = 0; j < rings - 1; j ++ ) idx.push( grid[ j ][ k ], grid[ j ][ k1 ], grid[ j + 1 ][ k ], grid[ j ][ k1 ], grid[ j + 1 ][ k1 ], grid[ j + 1 ][ k ] );

			}

			const g = new THREE.BufferGeometry();
			g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
			g.setAttribute( 'aFlow', new THREE.Float32BufferAttribute( flow, 4 ) );
			g.setAttribute( 'aDir', new THREE.Float32BufferAttribute( dir, 2 ) );
			g.setAttribute( 'aHalfW', new THREE.Float32BufferAttribute( hw, 1 ) );
			g.setIndex( idx );
			g.computeBoundingSphere();
			const m = new THREE.Mesh( g, this.flowMat );
			m.position.set( pd.c.x, pd.surf, pd.c.y );
			m.renderOrder = 11;
			m.layers.set( 1 );
			m.name = 'pond';
			this.group.add( m );
			pd.edge = edge;

		}

	}

	_buildFall() {

		const td = this.terrain;
		const out = FALL.out, base = FALL.base;
		const side = new THREE.Vector2( - out.y, out.x );
		const pool = this.terrain.river[ 0 ];
		// walk up the fall line from the pool to the lip, hugging the rock
		const rows = 48, cols = 8;
		const pos = [], uv = [], idx = [];
		const lipBehind = 40;
		for ( let j = 0; j <= rows; j ++ ) {

			const v = j / rows; // 0 top .. 1 foot
			const behind = THREE.MathUtils.lerp( lipBehind, - 7, Math.pow( v, 0.85 ) );
			const c = base.clone().addScaledVector( out, - behind );
			const halfW = THREE.MathUtils.lerp( 2.4, 7.5, Math.pow( v, 0.8 ) );
			for ( let i = 0; i <= cols; i ++ ) {

				const u = i / cols * 2 - 1;
				const q = c.clone().addScaledVector( side, u * halfW );
				let y = td.heightAt( q.x, q.y ) + 0.7;
				if ( v > 0.93 ) y = Math.max( y, pool.surf + 0.05 );
				pos.push( q.x, y, q.y );
				uv.push( u, v );

			}

		}

		for ( let j = 0; j < rows; j ++ ) for ( let i = 0; i < cols; i ++ ) {

			const a = j * ( cols + 1 ) + i, b = a + cols + 1;
			idx.push( a, b, a + 1, a + 1, b, b + 1 );

		}

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'aFall', new THREE.Float32BufferAttribute( uv, 2 ) );
		g.setIndex( idx );
		g.computeVertexNormals();
		// two layers: the sheet, and a looser veil of spray just in front
		for ( const layer of [ 0, 1 ] ) {

			const mat = new THREE.ShaderMaterial( {
				vertexShader: fallVert, fragmentShader: fallFrag, lights: true, side: THREE.DoubleSide, ...blend,
				uniforms: { ...lightsU(), uLayer: { value: layer } },
			} );
			const m = new THREE.Mesh( g, mat );
			if ( layer ) {

				m.position.set( out.x * 0.6, 0.3, out.y * 0.6 );
				m.scale.set( 1, 1, 1 );

			}

			m.renderOrder = 12 + layer;
			m.layers.enableAll();
			m.name = 'waterfall';
			this.group.add( m );

		}

		// mist rising from the plunge pool
		const n = 70;
		const mg = new THREE.BufferGeometry();
		const mp = new Float32Array( n * 3 ), seed = new Float32Array( n * 4 );
		for ( let i = 0; i < n; i ++ ) {

			mp.set( [ pool.p.x + ( Math.random() - 0.5 ) * 8, pool.surf + 0.5, pool.p.y + ( Math.random() - 0.5 ) * 8 ], i * 3 );
			seed.set( [ Math.random(), Math.random(), Math.random(), Math.random() ], i * 4 );

		}

		mg.setAttribute( 'position', new THREE.BufferAttribute( mp, 3 ) );
		mg.setAttribute( 'aSeed', new THREE.BufferAttribute( seed, 4 ) );
		const mist = new THREE.Points( mg, new THREE.ShaderMaterial( {
			vertexShader: mistVert, fragmentShader: mistFrag, lights: true, ...blend, uniforms: lightsU(),
		} ) );
		mist.frustumCulled = false;
		mist.renderOrder = 14;
		mist.layers.set( 1 );
		this.group.add( mist );
		this.poolPos = new THREE.Vector3( pool.p.x, pool.surf, pool.p.y );

	}

	// distance from a point to the stream (for the soundscape)
	distanceTo( p ) {

		let best = Infinity;
		for ( let i = 0; i < this.path.length; i += 2 ) {

			const q = this.path[ i ];
			const d = Math.hypot( q.p.x - p.x, q.p.y - p.z, q.surf - p.y ) - q.w;
			if ( d < best ) best = d;

		}

		return Math.max( best, 0 );

	}

}
