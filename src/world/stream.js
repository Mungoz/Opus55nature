import * as THREE from 'three';
import { Water as Water2 } from 'three/addons/objects/Water2.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { commonParsGLSL } from '../shaders/common.glsl.js';
import { skyMappingGLSL } from '../shaders/atmosphere.glsl.js';
import { sharedUniforms, U } from '../core/uniforms.js';
import { FALL } from '../core/features.js';
import { LAYERS } from '../core/world.js';
import { Water } from './water.js';

const lightsU = () => ( { ...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ), ...sharedUniforms() } );

// Water that is not the lake, built from three.js's water library:
//  - the stream and the waterfall use three.js Water2's shader and water normal maps
//    (flow-mapped normals, Fresnel mix of reflection and refraction). Their UVs run
//    downstream, so the current follows every bend. Reflections come from one
//    three.js Reflector kept level with the water nearest the camera; refraction is
//    the frame itself, drawn before the water - so every reach of the stream gets the
//    full effect for the cost of a single extra pass
//  - the ponds: three.js Water mirrors, shaded like the lake
// Only the spray drifting off the falls is drawn here by hand.

// Spray and mist: a billowing cloud over the plunge pool, and drift off the curtain.
const mistVert = /* glsl */ `
uniform float uTime;
uniform vec4 uWind;
attribute vec4 aSeed; // size, alpha, phase, rate
attribute vec3 aVel;
varying float vAlpha;
varying vec3 vWorldPos;
void main() {
	float life = fract( uTime * aSeed.w + aSeed.z );
	vec3 p = position + aVel * life * ( 1.0 + life ) + vec3( uWind.x, 0.0, uWind.y ) * life * life * ( 2.0 + 6.0 * uWind.z );
	vAlpha = sin( life * 3.14159 ) * ( 0.5 + 0.5 * aSeed.y );
	vec4 wp = modelMatrix * vec4( p, 1.0 );
	vWorldPos = wp.xyz;
	vec4 mv = viewMatrix * wp;
	gl_Position = projectionMatrix * mv;
	gl_PointSize = clamp( aSeed.x * ( 0.4 + 1.6 * life ) * 900.0 / max( -mv.z, 1.0 ), 1.5, 520.0 );
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
	float a = pow( 1.0 - r2, 1.5 ) * vAlpha * 0.11;
	vec3 V = normalize( cameraPosition - vWorldPos );
	float sh = sunShadowFast( vWorldPos );
	vec3 col = ( skyIrradiance( vec3( 0.0, 1.0, 0.0 ) ) * 0.55 + uSunColor * sh * ( 0.3 + 1.2 * pow( max( dot( -V, uSunDir ), 0.0 ), 5.0 ) ) ) / PI;
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, a );
}
`;

// Water2's own shader (flow-mapped normals, reflection, refraction), with the falling
// water aerated: where the flowing normal maps churn, the sheet turns white, lit by the
// same sky and sun as the rest of the valley; it frays to spray at its edges and foot.
function whiteWaterShader( length ) {

	const base = Water2.WaterShader;
	const frag = base.fragmentShader
		.replace( 'uniform vec4 config;', 'uniform vec4 config;\nuniform float uLength;\nuniform sampler2D uIrrLUT;\nuniform vec3 uSunC;\nuniform vec3 uSunD;\nuniform vec3 uFaceN;\n' + skyMappingGLSL )
		.replace( 'gl_FragColor = vec4( color, 1.0 ) * mix( refractColor, reflectColor, reflectance );', `
			vec4 water = vec4( color, 1.0 ) * mix( refractColor, reflectColor, reflectance );
			float v = clamp( vUv.y / uLength, 0.0, 1.0 );
			float halfW = 2.4 + 5.5 * pow( v, 1.2 );
			float across = abs( vUv.x ) / halfW;
			// aeration from the churn of the two flowing normal maps
			float churn = abs( normalColor0.r - normalColor1.r ) + abs( normalColor0.g - normalColor1.g ) + ( 1.0 - normalColor.b ) * 1.2;
			float foam = smoothstep( 0.1, 0.5, churn + v * 0.45 ) * smoothstep( 0.0, 0.08, v );
			vec3 N = normalize( uFaceN + vec3( normal.x, 0.0, normal.z ) * 0.6 );
			vec3 V = normalize( vToEye );
			vec3 light = texture2D( uIrrLUT, dirToSkyUV( N ) ).rgb * 0.8 + texture2D( uIrrLUT, dirToSkyUV( vec3( 0.0, 1.0, 0.0 ) ) ).rgb * 0.35
				+ uSunC * ( max( dot( N, uSunD ), 0.0 ) * 0.8 + pow( max( dot( -V, uSunD ), 0.0 ), 4.0 ) * 0.6 );
			vec3 white = color * 0.85 * light / PI;
			vec3 col = mix( water.rgb, white, 0.35 + 0.6 * foam );
			float alpha = ( 1.0 - smoothstep( 0.5 - 0.1 * v, 1.0, across + ( normalColor.r - 0.5 ) * 0.6 ) ) * mix( 0.97, 0.7, v * v );
			gl_FragColor = vec4( col, alpha );` );
	return {
		name: 'WhiteWaterShader',
		uniforms: { ...THREE.UniformsUtils.clone( base.uniforms ), uLength: { value: length }, uIrrLUT: { value: null }, uSunC: { value: new THREE.Vector3() }, uSunD: { value: new THREE.Vector3() }, uFaceN: { value: new THREE.Vector3() } },
		vertexShader: base.vertexShader,
		fragmentShader: frag,
	};

}

const blend = {
	transparent: true,
	depthWrite: false,
	blending: THREE.CustomBlending,
	blendSrc: THREE.SrcAlphaFactor,
	blendDst: THREE.OneMinusSrcAlphaFactor,
	blendSrcAlpha: THREE.ZeroFactor,
	blendDstAlpha: THREE.OneFactor,
};

// three's water objects face local +z; make sure the triangles do too
function faceUp( g ) {

	const p = g.getAttribute( 'position' ), idx = g.index.array;
	const a = new THREE.Vector3().fromBufferAttribute( p, idx[ 0 ] ), b = new THREE.Vector3().fromBufferAttribute( p, idx[ 1 ] ), c = new THREE.Vector3().fromBufferAttribute( p, idx[ 2 ] );
	const nz = new THREE.Vector3().crossVectors( b.sub( a ), c.sub( a ) ).z;
	if ( nz < 0 ) for ( let i = 0; i < idx.length; i += 3 ) [ idx[ i + 1 ], idx[ i + 2 ] ] = [ idx[ i + 2 ], idx[ i + 1 ] ];
	return g;

}


const _v = new THREE.Vector3();
const _frustum = new THREE.Frustum(), _m4 = new THREE.Matrix4(), _sphere = new THREE.Sphere();

export class Streams {

	// lake: the lake Water (its mirror is shared with far ponds); terrainMesh joins the
	// mirrors' passes so the banks are reflected
	constructor( terrain, textures, lake, quality, terrainMesh, reflectMesh ) {

		this.terrain = terrain;
		this.quality = quality;
		this.lake = lake;
		this.terrainMesh = terrainMesh;
		this.reflectMesh = reflectMesh;
		this.group = new THREE.Group();
		this.group.name = 'streams';
		const tl = new THREE.TextureLoader();
		this.normalMap0 = tl.load( './textures/Water_1_M_Normal.jpg' );
		this.normalMap1 = tl.load( './textures/Water_2_M_Normal.jpg' );
		for ( const t of [ this.normalMap0, this.normalMap1 ] ) t.wrapS = t.wrapT = THREE.RepeatWrapping;
		this.mainCamera = null;
		this.ponds = [];
		this.flowing = []; // materials driven by Water2's flow cycle
		// three.js Reflector for the stream: a level mirror at the height of the water nearest you
		this.reflector = new Reflector( new THREE.PlaneGeometry( 10, 10 ), { textureWidth: 512, textureHeight: 512, multisample: quality.msaa ? 4 : 0 } );
		this.reflector.rotation.x = - Math.PI / 2;
		this.refraction = { value: null };
		this._buildRiver();
		this._buildPonds();
		this._buildFall();

	}

	// Water2's shader on any mesh: shared reflection and refraction, its own flow cycle
	_flowMaterial( shader, { color, reflectivity, scale, flowSpeed } ) {

		const uniforms = THREE.UniformsUtils.merge( [ THREE.UniformsLib.fog, shader.uniforms ] );
		uniforms.color.value = new THREE.Color( color );
		uniforms.reflectivity.value = reflectivity;
		uniforms.tReflectionMap.value = this.reflector.getRenderTarget().texture;
		uniforms.tRefractionMap = this.refraction;
		uniforms.tNormalMap0.value = this.normalMap0;
		uniforms.tNormalMap1.value = this.normalMap1;
		uniforms.textureMatrix.value = new THREE.Matrix4();
		uniforms.flowDirection = { value: new THREE.Vector2( 0, - 1 ) };
		// three.js Water2's flow cycle: two normal-map phases half a cycle apart
		const cycle = 0.15, half = cycle * 0.5;
		uniforms.config.value.set( 0, half, half, scale );
		const m = new THREE.ShaderMaterial( { name: shader.name, uniforms, vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader, transparent: true } );
		m.userData.flow = { speed: flowSpeed, cycle, half };
		this.flowing.push( m );
		return m;

	}

	_buildRiver() {

		const smp = this.terrain.river;
		const td = this.terrain;
		// densify the samples for a smooth channel
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
		// where both banks are under the lake, the stream has become the lake
		let end = pts.length;
		for ( let i = 0; i < pts.length; i ++ ) {

			const a = pts[ Math.max( 0, i - 1 ) ], b = pts[ Math.min( pts.length - 1, i + 1 ) ];
			const t = b.p.clone().sub( a.p ).normalize();
			const n = new THREE.Vector2( - t.y, t.x );
			const o = pts[ i ].w + 3;
			if ( td.heightAt( pts[ i ].p.x + n.x * o, pts[ i ].p.y + n.y * o ) < 0.02 && td.heightAt( pts[ i ].p.x - n.x * o, pts[ i ].p.y - n.y * o ) < 0.02 ) {

				end = Math.min( pts.length, i + 3 );
				break;

			}

		}

		pts.length = end;
		this.path = pts;
		// one ribbon along the whole stream on its true surface; u across, v downstream (m)
		const pos = [], uv = [], idx = [];
		pts.forEach( ( pt, i ) => {

			const a = pts[ Math.max( 0, i - 1 ) ], b = pts[ Math.min( pts.length - 1, i + 1 ) ];
			const d = b.p.clone().sub( a.p ).normalize();
			const n = new THREE.Vector2( - d.y, d.x );
			const w = pt.w + 0.7 + ( pt.s < 12 ? 5 * ( 1 - pt.s / 12 ) : 0 ); // wider where the fall lands
			for ( const side of [ - 1, 1 ] ) {

				pos.push( pt.p.x + n.x * w * side, pt.surf, pt.p.y + n.y * w * side );
				uv.push( w * side, pt.s );

			}

			if ( i < pts.length - 1 ) {

				const k = i * 2;
				idx.push( k, k + 1, k + 2, k + 1, k + 3, k + 2 );

			}

		} );
		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uv, 2 ) );
		g.setIndex( idx );
		g.computeBoundingSphere();
		const scale = 0.33; // the normal maps repeat every 3 m
		const m = new THREE.Mesh( g, this._flowMaterial( Water2.WaterShader, { color: 0xd4e6dc, reflectivity: 0.03, scale, flowSpeed: 0.9 * scale * 0.5 } ) );
		m.material.side = THREE.DoubleSide;
		m.layers.set( LAYERS.WATER );
		m.renderOrder = 11;
		m.frustumCulled = false;
		m.name = 'river';
		this.group.add( m );
		this.river = m;

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

			pd.edge = edge;
			// a disc following the shoreline, in three's XY plane (local +y = world -z)
			const pos = [ 0, 0, 0 ], idx = [];
			for ( let j = 1; j <= rings; j ++ ) {

				for ( let k = 0; k < N; k ++ ) {

					const a = k / N * Math.PI * 2, r = edge[ k ] * j / rings;
					pos.push( Math.cos( a ) * r, - Math.sin( a ) * r, 0 );

				}

			}

			for ( let k = 0; k < N; k ++ ) {

				const k1 = ( k + 1 ) % N;
				idx.push( 0, 1 + k, 1 + k1 );
				for ( let j = 0; j < rings - 1; j ++ ) {

					const a = 1 + j * N + k, b = 1 + j * N + k1, c = 1 + ( j + 1 ) * N + k, d = 1 + ( j + 1 ) * N + k1;
					idx.push( a, c, b, b, c, d );

				}

			}

			const g = new THREE.BufferGeometry();
			g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
			g.setIndex( idx );
			faceUp( g );
			g.computeBoundingSphere();
			const w = new Water( null, this.quality, {
				geometry: g,
				position: new THREE.Vector3( pd.c.x, pd.surf, pd.c.y ),
				reflectScale: 0.6,
				ripples: this.lake.ripples,
				fallback: this.lake,
				farDist: 220,
				name: 'pond',
			} );
			w.uniforms.size.value = 3.5;
			w.reflectOnly.push( this.terrainMesh );
			this.ponds.push( w );
			this.group.add( w.mesh );

		}

	}

	_buildFall() {

		const td = this.terrain;
		const out = FALL.out, base = FALL.base;
		const side = new THREE.Vector2( - out.y, out.x );
		const pool = this.terrain.river[ 0 ];
		// the lip: along the fall line, where the ground drops away most steeply
		const H = ( b ) => td.heightAt( base.x - out.x * b, base.y - out.y * b );
		let lipB = 0, steepest = 0;
		for ( let b = 40; b > - 25; b -= 0.25 ) {

			const drop = H( b ) - H( b - 2 );
			if ( drop > steepest ) {

				steepest = drop;
				lipB = b;

			}

		}

		// step back to the top of the edge
		while ( H( lipB + 0.25 ) > H( lipB ) + 0.05 && lipB < 60 ) lipB += 0.25;

		const lip = base.clone().addScaledVector( out, - lipB );
		const lipY = td.heightAt( lip.x, lip.y ) + 0.3;
		const floorY = pool.surf;
		// it falls free a little way out from the rock
		let reach = 4;
		while ( reach < 30 ) {

			let clear = true;
			for ( let v = 0.08; v <= 1; v += 0.04 ) {

				const q = lip.clone().addScaledVector( out, reach * v + 0.5 );
				if ( td.heightAt( q.x, q.y ) > lipY - ( lipY - floorY ) * v - 0.8 ) clear = false;

			}

			if ( clear ) break;
			reach += 1;

		}

		const foot = lip.clone().addScaledVector( out, reach );
		const top3 = new THREE.Vector3( lip.x, lipY, lip.y ), foot3 = new THREE.Vector3( foot.x, floorY, foot.y );
		const X = new THREE.Vector3( side.x, 0, side.y ).normalize();
		const Y = top3.clone().sub( foot3 ).normalize(); // up the curtain
		let Z = new THREE.Vector3().crossVectors( X, Y ).normalize();
		if ( Z.x * out.x + Z.z * out.y < 0 ) {

			X.negate();
			Z = new THREE.Vector3().crossVectors( X, Y ).normalize();

		}

		const L = top3.distanceTo( foot3 );
		const worldPts = [], uvs = [], idx = [];
		const rows = 16;
		for ( let j = 0; j <= rows; j ++ ) {

			const v = j / rows;
			const c = top3.clone().lerp( foot3, v );
			const halfW = 2.4 + 5.5 * Math.pow( v, 1.2 );
			for ( const sd of [ - 1, 1 ] ) {

				worldPts.push( c.clone().addScaledVector( X, halfW * sd ) );
				uvs.push( halfW * sd, v * L );

			}

			if ( j < rows ) {

				const k = j * 2;
				idx.push( k, k + 2, k + 1, k + 1, k + 2, k + 3 );

			}

		}

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( worldPts.flatMap( ( p ) => [ p.x, p.y, p.z ] ), 3 ) );
		g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
		g.setIndex( idx );
		g.computeBoundingSphere();
		const scale = 0.18;
		const fall = new THREE.Mesh( g, this._flowMaterial( whiteWaterShader( L ), { color: 0xe8f0f2, reflectivity: 0.05, scale, flowSpeed: 1.6 } ) );
		fall.material.side = THREE.DoubleSide;
		fall.material.uniforms.uFaceN.value.copy( Z );
		fall.layers.set( LAYERS.WATER );
		fall.renderOrder = 12;
		fall.frustumCulled = false;
		fall.name = 'waterfall';
		this.group.add( fall );
		this.fall = fall;

		// mist and spray
		const n = 320;
		const mg = new THREE.BufferGeometry();
		const mp = new Float32Array( n * 3 ), seed = new Float32Array( n * 4 ), vel = new Float32Array( n * 3 );
		const R = Math.random;
		for ( let i = 0; i < n; i ++ ) {

			if ( i < n * 0.6 ) {

				// the cloud boiling up from where the water lands
				const a = R() * Math.PI * 2, r = R() * 4;
				mp.set( [ foot.x + Math.cos( a ) * r, floorY + 0.5, foot.y + Math.sin( a ) * r ], i * 3 );
				const sp = 2 + R() * 5;
				vel.set( [ Math.cos( a ) * sp + out.x * 3, 2 + R() * 6, Math.sin( a ) * sp + out.y * 3 ], i * 3 );
				seed.set( [ 5 + R() * 9, R(), R(), 0.1 + R() * 0.08 ], i * 4 );

			} else {

				// spray peeling off the lower half of the curtain
				const v = 0.45 + 0.55 * R();
				const q = top3.clone().lerp( foot3, v ).addScaledVector( X, ( R() - 0.5 ) * 10 );
				mp.set( [ q.x, q.y, q.z ], i * 3 );
				vel.set( [ out.x * ( 1 + R() * 3 ), - 1 - R() * 3, out.y * ( 1 + R() * 3 ) ], i * 3 );
				seed.set( [ 2 + R() * 4, R(), R(), 0.15 + R() * 0.1 ], i * 4 );

			}

		}

		mg.setAttribute( 'position', new THREE.BufferAttribute( mp, 3 ) );
		mg.setAttribute( 'aSeed', new THREE.BufferAttribute( seed, 4 ) );
		mg.setAttribute( 'aVel', new THREE.BufferAttribute( vel, 3 ) );
		const mist = new THREE.Points( mg, new THREE.ShaderMaterial( {
			vertexShader: mistVert, fragmentShader: mistFrag, lights: true, ...blend, uniforms: lightsU(),
		} ) );
		mist.frustumCulled = false;
		mist.renderOrder = 15;
		mist.layers.set( LAYERS.FX );
		this.group.add( mist );
		this.poolPos = new THREE.Vector3( foot.x, floorY, foot.y );

	}

	setSize( width, height ) {

		const s = this.quality.reflectScale;
		this.reflector.getRenderTarget().setSize( Math.max( 2, Math.round( width * s ) ), Math.max( 2, Math.round( height * s ) ) );
		for ( const p of this.ponds ) p.setSize( width, height );

	}

	update( camera, dt ) {

		this.mainCamera = camera;
		for ( const p of this.ponds ) p.mainCamera = camera;
		// Water2's flow cycle, and the projection that maps each vertex to the screen
		const bias = new THREE.Matrix4().set( 0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1 );
		const proj = bias.multiply( camera.projectionMatrix ).multiply( camera.matrixWorldInverse );
		for ( const m of this.flowing ) {

			const c = m.uniforms.config.value, f = m.userData.flow;
			c.x += f.speed * dt;
			c.y = c.x + f.half;
			if ( c.x >= f.cycle ) {

				c.x = 0;
				c.y = f.half;

			} else if ( c.y >= f.cycle ) c.y -= f.cycle;

			m.uniforms.textureMatrix.value.copy( proj );

		}

		// the white water is lit by the valley's own sky and sun
		const fu = this.fall.material.uniforms;
		fu.uIrrLUT.value = U.uIrrLUT.value;
		fu.uSunC.value.copy( U.uSunColor.value );
		fu.uSunD.value.copy( U.uSunDir.value );
		this.fall.visible = camera.position.distanceTo( this.poolPos ) < 900;

	}

	// The stream's mirror: level with the water nearest the camera. Called before the frame.
	renderReflection( renderer, scene, camera ) {

		// only when some of the stream (or the falls) is on screen
		_frustum.setFromProjectionMatrix( _m4.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse ) );
		let best = Infinity, level = 0, seen = this.fall.visible && _frustum.intersectsObject( this.fall );
		const c = camera.position;
		for ( let i = 0; i < this.path.length; i += 2 ) {

			const q = this.path[ i ];
			const d = ( q.p.x - c.x ) ** 2 + ( q.p.y - c.z ) ** 2;
			if ( d < best ) {

				best = d;
				level = q.surf;

			}

			if ( ! seen && d < 600 * 600 ) seen = _frustum.intersectsSphere( _sphere.set( _v.set( q.p.x, q.surf, q.p.y ), q.w + 2 ) );

		}

		if ( ! seen ) return;
		this.reflector.position.y = Math.min( level, c.y - 0.3 );
		this.reflector.updateMatrixWorld();
		this.reflectMesh.layers.enable( 0 );
		renderer.setClearColor( 0x000000, 1 );
		this.reflector.onBeforeRender( renderer, scene, camera );
		this.reflectMesh.layers.disable( 0 );

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
