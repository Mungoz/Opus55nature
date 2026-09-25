import * as THREE from 'three';
import { commonParsGLSL } from '../shaders/common.glsl.js';
import { sharedUniforms, U } from '../core/uniforms.js';

export const MAX_RIPPLES = 48;

const vert = /* glsl */ `
uniform mat4 uTexMatrix;
varying vec3 vWorldPos;
varying vec4 vReflCoord;
void main() {
	vec4 wp = modelMatrix * vec4( position, 1.0 );
	vWorldPos = wp.xyz;
	vReflCoord = uTexMatrix * wp;
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const frag = /* glsl */ `
${commonParsGLSL}
uniform sampler2D tReflect;
uniform sampler2D tWaterN;
uniform vec4 uRipples[ ${MAX_RIPPLES} ];
uniform float uRippleTime;
uniform float uCalm;
varying vec3 vWorldPos;
varying vec4 vReflCoord;

// Raindrop rings: each grid cell hosts a drop landing at its own rhythm.
vec2 rainRings( vec2 p, float t ) {
	vec2 s = vec2( 0.0 );
	for ( int l = 0; l < 2; l ++ ) {
		float sc = l == 0 ? 1.7 : 3.1;
		vec2 q = p * sc + float( l ) * 17.3;
		vec2 cell = floor( q );
		for ( int j = -1; j <= 1; j ++ )
		for ( int i = -1; i <= 1; i ++ ) {
			vec2 c = cell + vec2( float( i ), float( j ) );
			vec3 h = hash32( c );
			float period = 0.7 + h.z * 0.9;
			float ph = fract( t / period + h.x * 7.0 );
			vec2 d = q - ( c + h.xy );
			float dl = length( d ) + 1e-4;
			float x = dl - ph * 1.1;
			float ring = sin( x * 26.0 ) * exp( -x * x * 40.0 ) * ( 1.0 - ph ) * ( 1.0 - ph );
			s += d / dl * ring;
		}
	}
	return s;
}

vec2 waveSlope( vec2 uv ) {
	vec2 n = texture2D( tWaterN, uv ).xy * 2.0 - 1.0;
	return n;
}

void main() {
	vec3 wp = vWorldPos;
	vec3 V = cameraPosition - wp;
	float dist = length( V );
	V /= dist;

	float bed = terrainH( wp.xz );
	float depth = uWaterLevel - bed;
	if ( depth < -0.4 ) discard;

	// ---- surface normal ----
	vec2 wind = normalize( uWind.xy + 1e-4 );
	vec2 side = vec2( -wind.y, wind.x );
	float t = uTime;
	vec2 s = vec2( 0.0 );
	s += waveSlope( wp.xz / 11.0 + wind * t * 0.028 ) * 0.55;
	s += waveSlope( wp.xz / 3.7 + side * t * 0.045 + 0.3 ) * 0.35;
	s += waveSlope( wp.xz / 1.3 - wind * t * 0.06 + 0.7 ) * 0.22;
	s += waveSlope( wp.xz / 37.0 - side * t * 0.012 ) * 0.5;

	// cat's paws: gusts ruffle patches of the lake, the rest stays glassy
	vec2 gp = wp.xz / 520.0 + wind * t * 0.0065;
	float gust = texture2D( uNoiseTex, gp ).g * 0.65 + texture2D( uNoiseTex, gp * 2.7 + 0.4 ).r * 0.35;
	gust = smoothstep( 0.42, 0.78, gust );
	float rough = mix( uCalm, 1.0, gust ) * uWind.z;
	// strong wind builds a proper chop; rain stipples the whole surface
	rough *= 1.0 + smoothstep( 1.2, 2.2, uWind.z ) * 0.8;
	rough += uWeather.x * 0.35;
	// shallow water near shore is more ruffled, and distance softens the detail
	rough *= mix( 1.0, 0.6, smoothstep( 40.0, 900.0, dist ) );
	s *= 0.16 * rough;

	// ---- ripple rings (fish, wakes, stones) ----
	float splashFoam = 0.0;
	for ( int i = 0; i < ${MAX_RIPPLES}; i ++ ) {
		vec4 r = uRipples[ i ];
		if ( r.w <= 0.0 ) continue;
		float age = uRippleTime - r.z;
		if ( age < 0.0 || age > 9.0 ) continue;
		vec2 d = wp.xz - r.xy;
		float dl = length( d ) + 1e-4;
		float R = age * 0.9 + 0.05;
		float x = dl - R;
		float env = exp( -x * x / ( 0.08 + age * 0.12 ) );
		float amp = r.w * exp( -age * 0.55 ) / ( 1.0 + R * 0.8 );
		float k = 9.0 / ( 1.0 + age * 0.35 );
		s += ( d / dl ) * cos( x * k ) * env * amp * k * 0.06;
		// aerated white water at the point of impact, breaking up as it spreads
		if ( r.w > 0.8 ) splashFoam = max( splashFoam, exp( -dl * dl / ( 0.05 + age * 0.3 ) ) * exp( -age * 2.2 ) * ( r.w - 0.6 ) * smoothstep( 0.25, 0.6, texture2D( uNoiseTex, wp.xz * 1.7 + r.xy ).b + 0.3 - age * 0.3 ) );
	}

	if ( uWeather.x > 0.01 && dist < 80.0 ) s += rainRings( wp.xz, t ) * 0.2 * uWeather.x * ( 1.0 - smoothstep( 25.0, 80.0, dist ) );

	vec3 N = normalize( vec3( -s.x, 1.0, -s.y ) );
	float NoV = max( dot( N, V ), 0.0 );
	float F = 0.02 + 0.98 * pow( 1.0 - NoV, 5.0 );

	// ---- reflection ----
	vec2 ruv = vReflCoord.xy / vReflCoord.w;
	float distort = 0.9 / ( 1.0 + dist * 0.02 ) + 0.05;
	ruv += vec2( N.x, N.z ) * distort * 0.35;
	vec3 refl = texture2D( tReflect, ruv ).rgb;
	// rougher patches blur the mirror a touch
	refl = mix( refl, ( texture2D( tReflect, ruv + vec2( 0.0, 0.006 ) ).rgb + texture2D( tReflect, ruv - vec2( 0.0, 0.006 ) ).rgb ) * 0.5, gust * 0.5 );

	// ---- sun glitter ----
	float sh = sunShadow( wp, vec3( 0.0, 1.0, 0.0 ) );
	vec3 spec = uSunColor * sh * specGGX( N, V, uSunDir, 0.085, 0.02 ) * 1.4;
	spec *= exp( -dist * 0.00012 );

	// ---- shoreline wash ----
	float lap = sin( t * 1.1 + wp.x * 0.35 + wp.z * 0.27 ) * 0.5 + 0.5;
	float edge = smoothstep( 0.22 + lap * 0.12, 0.0, depth );
	float foamN = texture2D( uNoiseTex, wp.xz * 0.35 + t * 0.02 ).b;
	float foam = edge * smoothstep( 0.35, 0.8, foamN ) * 0.55 * ( 1.0 - smoothstep( 40.0, 220.0, dist ) );
	vec3 foamCol = ( uSunColor * sh * max( uSunDir.y, 0.0 ) + skyIrradiance( vec3( 0.0, 1.0, 0.0 ) ) ) * 0.75 / PI;

	vec3 col = refl * F + spec;
	float alpha = F;
	// whitecaps on wind-driven crests in a gale
	float crest = texture2D( tWaterN, wp.xz / 7.0 + wind * t * 0.06 ).b * 0.6 + texture2D( tWaterN, wp.xz / 3.1 - side * t * 0.05 ).b * 0.4;
	float caps = smoothstep( 0.7, 0.86, crest ) * smoothstep( 1.4, 2.2, uWind.z ) * gust * 0.5 * smoothstep( 1.0, 4.0, depth );
	foam = max( foam, caps );
	foam = max( foam, saturate( splashFoam * 1.4 ) );
	col = mix( col, foamCol, foam );
	alpha = mix( alpha, 1.0, foam );
	// fade out where the bed rises above the surface (thin film at the waterline)
	float film = smoothstep( -0.4, 0.02, depth );
	gl_FragColor = vec4( col * film, alpha * film );
}
`;

const _normal = new THREE.Vector3( 0, 1, 0 );
const _reflectorPos = new THREE.Vector3();
const _cameraPos = new THREE.Vector3();
const _rotation = new THREE.Matrix4();
const _lookAt = new THREE.Vector3();
const _target = new THREE.Vector3();
const _view = new THREE.Vector3();
const _plane = new THREE.Plane();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();

export class Water {

	constructor( textures, quality ) {

		this.quality = quality;
		this.reflectCamera = new THREE.PerspectiveCamera();
		this.reflectCamera.layers.set( 0 );
		this.reflectCamera.layers.enable( 2 );
		this.texMatrix = new THREE.Matrix4();
		this.rt = new THREE.WebGLRenderTarget( 2, 2, { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 } );
		this.rt.texture.name = 'reflection';

		this.ripples = Array.from( { length: MAX_RIPPLES }, () => new THREE.Vector4( 0, 0, - 100, 0 ) );
		this._rippleIndex = 0;

		this.uniforms = {
			...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ),
			...sharedUniforms(),
			tReflect: { value: this.rt.texture },
			tWaterN: { value: textures.waterN },
			uTexMatrix: { value: this.texMatrix },
			uRipples: { value: this.ripples },
			uRippleTime: U.uTime,
			uCalm: { value: 0.3 },
		};

		this.material = new THREE.ShaderMaterial( {
			vertexShader: vert,
			fragmentShader: frag,
			uniforms: this.uniforms,
			lights: true,
			transparent: true,
			depthWrite: false,
			blending: THREE.CustomBlending,
			blendEquation: THREE.AddEquation,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.ZeroFactor,
			blendDstAlpha: THREE.OneFactor,
		} );

		const geo = new THREE.PlaneGeometry( 1500, 2300, 1, 1 );
		geo.rotateX( - Math.PI / 2 );
		geo.translate( 0, 0, - 300 );
		this.mesh = new THREE.Mesh( geo, this.material );
		this.mesh.name = 'water';
		this.mesh.layers.set( 1 );
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 10;

	}

	addRipple( x, z, strength = 1, delay = 0 ) {

		const r = this.ripples[ this._rippleIndex ];
		r.set( x, z, U.uTime.value + delay, strength );
		this._rippleIndex = ( this._rippleIndex + 1 ) % MAX_RIPPLES;

	}

	setSize( width, height ) {

		const s = this.quality.reflectScale;
		this.rt.setSize( Math.max( 2, Math.round( width * s ) ), Math.max( 2, Math.round( height * s ) ) );

	}

	// Mirror the main camera through the water plane and render the reflection.
	render( renderer, scene, camera ) {

		_reflectorPos.set( 0, U.uWaterLevel.value, 0 );
		_cameraPos.setFromMatrixPosition( camera.matrixWorld );
		if ( _cameraPos.y < _reflectorPos.y ) return;

		_view.set( _cameraPos.x, 2 * _reflectorPos.y - _cameraPos.y, _cameraPos.z );
		_rotation.extractRotation( camera.matrixWorld );
		_lookAt.set( 0, 0, - 1 ).applyMatrix4( _rotation ).add( _cameraPos );
		_target.set( _lookAt.x, 2 * _reflectorPos.y - _lookAt.y, _lookAt.z );

		const vc = this.reflectCamera;
		vc.position.copy( _view );
		vc.up.set( 0, 1, 0 ).applyMatrix4( _rotation ).reflect( _normal );
		vc.lookAt( _target );
		vc.far = camera.far;
		vc.near = camera.near;
		vc.updateMatrixWorld();
		vc.projectionMatrix.copy( camera.projectionMatrix );

		this.texMatrix.set( 0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1 );
		this.texMatrix.multiply( vc.projectionMatrix );
		this.texMatrix.multiply( vc.matrixWorldInverse );

		// oblique near plane = the water surface (no geometry below it leaks in)
		_plane.setFromNormalAndCoplanarPoint( _normal, _reflectorPos );
		_plane.applyMatrix4( vc.matrixWorldInverse );
		_clip.set( _plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant );
		const pm = vc.projectionMatrix;
		_q.x = ( Math.sign( _clip.x ) + pm.elements[ 8 ] ) / pm.elements[ 0 ];
		_q.y = ( Math.sign( _clip.y ) + pm.elements[ 9 ] ) / pm.elements[ 5 ];
		_q.z = - 1.0;
		_q.w = ( 1.0 + pm.elements[ 10 ] ) / pm.elements[ 14 ];
		_clip.multiplyScalar( 2.0 / _clip.dot( _q ) );
		pm.elements[ 2 ] = _clip.x;
		pm.elements[ 6 ] = _clip.y;
		pm.elements[ 10 ] = _clip.z + 1.0 - 0.0005;
		pm.elements[ 14 ] = _clip.w;
		vc.projectionMatrixInverse.copy( pm ).invert();

		const prevTarget = renderer.getRenderTarget();
		const prevShadowAuto = renderer.shadowMap.autoUpdate;
		renderer.setRenderTarget( this.rt );
		renderer.setClearColor( 0x000000, 1 );
		renderer.clear( true, true, false );
		renderer.render( scene, vc );
		renderer.setRenderTarget( prevTarget );
		renderer.shadowMap.autoUpdate = prevShadowAuto;

	}

}
