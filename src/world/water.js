import * as THREE from 'three';
import { Water as ThreeWater } from 'three/addons/objects/Water.js';
import { commonParsGLSL } from '../shaders/common.glsl.js';
import { sharedUniforms, U } from '../core/uniforms.js';
import { LAYERS } from '../core/world.js';

export const MAX_RIPPLES = 48;

// The lake is three.js's Water (examples/jsm/objects/Water.js): its planar mirror pass,
// its water normal map, and its shading - four scrolling scales of the normal map, a
// sharp sun glint, subsurface scatter and a Fresnel mix with the distorted reflection.
// The shader is extended in the same style for this scene: our sky and shadows, cat's
// paws in the gusts, ripple rings from fish, birds, rain and thrown stones, clear
// shallows that show the stony bed, and foam at the shore.

const vert = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 mirrorCoord;
varying vec3 worldPosition;
void main() {
	vec4 wp = modelMatrix * vec4( position, 1.0 );
	worldPosition = wp.xyz;
	mirrorCoord = textureMatrix * wp;
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const frag = /* glsl */ `
${commonParsGLSL}
uniform sampler2D mirrorSampler;
uniform sampler2D normalSampler;
uniform float time;
uniform float size;
uniform float distortionScale;
uniform vec3 waterColor;
uniform float uLevel;
uniform vec4 uRipples[ ${MAX_RIPPLES} ];
uniform float uCalm;
varying vec4 mirrorCoord;
varying vec3 worldPosition;

// three.js Water: four scales of the normal map drifting in different directions
vec4 getNoise( vec2 uv ) {
	vec2 uv0 = ( uv / 103.0 ) + vec2( time / 17.0, time / 29.0 );
	vec2 uv1 = uv / 107.0 - vec2( time / -19.0, time / 31.0 );
	vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );
	vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( time / 109.0, time / -113.0 );
	vec4 noise = texture2D( normalSampler, uv0 ) +
		texture2D( normalSampler, uv1 ) +
		texture2D( normalSampler, uv2 ) +
		texture2D( normalSampler, uv3 );
	return noise * 0.5 - 1.0;
}

void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, vec3 sunColor, inout vec3 diffuseColor, inout vec3 specularColor ) {
	vec3 reflection = normalize( reflect( -uSunDir, surfaceNormal ) );
	float direction = max( 0.0, dot( eyeDirection, reflection ) );
	specularColor += pow( direction, shiny ) * sunColor * spec;
	diffuseColor += max( dot( uSunDir, surfaceNormal ), 0.0 ) * sunColor * diffuse;
}

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

void main() {
	vec3 wp = worldPosition;
	float depth = uLevel - terrainH( wp.xz );
	if ( depth < -0.4 ) discard;
	vec3 worldToEye = cameraPosition - wp;
	float dist = length( worldToEye );
	vec3 eyeDirection = worldToEye / dist;
	float t = uTime;

	// ---- surface normal: three.js Water's, calmed or ruffled by the wind ----
	vec4 noise = getNoise( wp.xz * size );
	vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );
	// cat's paws: gusts ruffle patches of the lake, the rest stays glassy
	vec2 wind = normalize( uWind.xy + 1e-4 );
	vec2 gp = wp.xz / 520.0 + wind * t * 0.0065;
	float gust = smoothstep( 0.42, 0.78, texture2D( uNoiseTex, gp ).g * 0.65 + texture2D( uNoiseTex, gp * 2.7 + 0.4 ).r * 0.35 );
	float rough = mix( uCalm, 1.0, gust ) * clamp( uWind.z * 1.4, 0.15, 2.0 );
	rough *= 1.0 + smoothstep( 1.2, 2.2, uWind.z ) * 0.6;
	rough += uWeather.x * 0.3;
	rough *= mix( 1.0, 0.65, smoothstep( 60.0, 1200.0, dist ) );
	surfaceNormal = normalize( mix( vec3( 0.0, 1.0, 0.0 ), surfaceNormal, clamp( rough, 0.0, 1.6 ) ) );

	// ---- ripple rings (fish, wakes, stones) and rain ----
	vec2 s = vec2( 0.0 );
	float splashFoam = 0.0;
	for ( int i = 0; i < ${MAX_RIPPLES}; i ++ ) {
		vec4 r = uRipples[ i ];
		if ( r.w <= 0.0 ) continue;
		float age = t - r.z;
		if ( age < 0.0 || age > 9.0 ) continue;
		vec2 d = wp.xz - r.xy;
		float dl = length( d ) + 1e-4;
		float R = age * 0.9 + 0.05;
		float x = dl - R;
		float env = exp( -x * x / ( 0.08 + age * 0.12 ) );
		float amp = r.w * exp( -age * 0.55 ) / ( 1.0 + R * 0.8 );
		float k = 9.0 / ( 1.0 + age * 0.35 );
		s += ( d / dl ) * cos( x * k ) * env * amp * k * 0.06;
		if ( r.w > 0.8 ) splashFoam = max( splashFoam, exp( -dl * dl / ( 0.05 + age * 0.3 ) ) * exp( -age * 2.2 ) * ( r.w - 0.6 ) * smoothstep( 0.25, 0.6, texture2D( uNoiseTex, wp.xz * 1.7 + r.xy ).b + 0.3 - age * 0.3 ) );
	}
	if ( uWeather.x > 0.01 && dist < 80.0 ) s += rainRings( wp.xz, t ) * 0.2 * uWeather.x * ( 1.0 - smoothstep( 25.0, 80.0, dist ) );
	surfaceNormal = normalize( surfaceNormal + vec3( -s.x, 0.0, -s.y ) * 1.6 );

	// ---- three.js Water shading ----
	float sh = sunShadow( wp, vec3( 0.0, 1.0, 0.0 ) );
	vec3 sunColor = uSunColor * sh;
	vec3 diffuseLight = vec3( 0.0 );
	vec3 specularLight = vec3( 0.0 );
	sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, sunColor, diffuseLight, specularLight );
	specularLight *= exp( -dist * 0.00012 );
	// (three.js scales this by 1 / distance; capped here so the water at your feet, seen from
	// eye height, does not tear the mirror image apart)
	vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / max( dist, 45.0 ) ) * distortionScale;
	vec3 reflectionSample = texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ).rgb;
	float theta = max( dot( eyeDirection, surfaceNormal ), 0.0 );
	float rf0 = 0.02;
	float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );
	vec3 amb = skyIrradiance( vec3( 0.0, 1.0, 0.0 ) );
	vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor * ( amb + sunColor * max( uSunDir.y, 0.0 ) * 0.3 ) / PI;
	vec3 body = diffuseLight * waterColor * 0.3 / PI + scatter;
	// the water is clear: in the shallows the stony bed shows through the body colour
	float opacity = smoothstep( 0.2, 9.0, depth ) * 0.85;
	vec3 col = reflectionSample * reflectance + specularLight + body * ( 1.0 - reflectance ) * opacity;
	float alpha = reflectance + ( 1.0 - reflectance ) * opacity;

	// ---- foam: the swash at the shore, splashes, whitecaps in a gale ----
	float lap = sin( t * 1.1 + wp.x * 0.35 + wp.z * 0.27 ) * 0.5 + 0.5;
	float edge = smoothstep( 0.22 + lap * 0.12, 0.0, depth );
	float foamN = texture2D( uNoiseTex, wp.xz * 0.35 + t * 0.02 ).b;
	float foam = edge * smoothstep( 0.35, 0.8, foamN ) * 0.55 * ( 1.0 - smoothstep( 40.0, 220.0, dist ) );
	float crest = texture2D( normalSampler, wp.xz / 9.0 + wind * t * 0.05 ).b;
	foam = max( foam, smoothstep( 0.85, 0.95, crest ) * smoothstep( 1.4, 2.2, uWind.z ) * gust * 0.5 * smoothstep( 1.0, 4.0, depth ) );
	foam = max( foam, saturate( splashFoam * 1.4 ) );
	vec3 foamCol = ( uSunColor * sh * max( uSunDir.y, 0.0 ) + amb ) * 0.75 / PI;
	col = mix( col, foamCol, foam );
	alpha = mix( alpha, 1.0, foam );
	// thin film where the bed rises through the surface
	float film = smoothstep( -0.4, 0.02, depth );
	gl_FragColor = vec4( col * film, alpha * film );
}
`;

export class Water {

	// opts: geometry (in the XY plane; laid flat, local +y points to world -z), position
	// (the water level is its y), reflectScale, ripples (shared array), name
	constructor( textures, quality, opts = {} ) {

		this.quality = quality;
		this.reflectScale = opts.reflectScale ?? 1;
		const normals = Water.normals || ( Water.normals = new THREE.TextureLoader().load( './textures/waternormals.jpg' ) );
		normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
		normals.anisotropy = 4;

		// the lake surface by default: a plane in XY, laid flat as three's Water expects
		let geo = opts.geometry;
		if ( ! geo ) {

			geo = new THREE.PlaneGeometry( 1500, 2300, 1, 1 );
			geo.translate( 0, 300, 0 );

		}

		this.mesh = new ThreeWater( geo, {
			textureWidth: 512,
			textureHeight: 512,
			waterNormals: normals,
			distortionScale: 3.7,
			fog: false,
		} );
		this.mesh.rotation.x = - Math.PI / 2;
		this.mesh.position.copy( opts.position || new THREE.Vector3( 0, U.uWaterLevel.value, 0 ) );
		this.mesh.name = opts.name || 'water';
		this.mesh.layers.set( LAYERS.WATER );
		// the mirror pass runs only when the water itself is drawn
		this.mesh.frustumCulled = true;
		this.mesh.renderOrder = 10;

		// three's mirror rig: reflection texture, texture matrix and eye, updated in place
		const rig = this.mesh.material.uniforms;
		this.reflectTarget = rig.mirrorSampler.value.renderTarget;
		this.rt = this.reflectTarget;
		this.texMatrix = rig.textureMatrix.value;

		this.ripples = opts.ripples || Array.from( { length: MAX_RIPPLES }, () => new THREE.Vector4( 0, 0, - 100, 0 ) );
		this._rippleIndex = 0;
		this.uniforms = {
			...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ),
			...sharedUniforms(),
			mirrorSampler: { value: rig.mirrorSampler.value },
			textureMatrix: { value: rig.textureMatrix.value },
			uLevel: { value: this.mesh.position.y },
			normalSampler: rig.normalSampler,
			time: { value: 0 },
			size: { value: 2.2 },
			distortionScale: rig.distortionScale,
			waterColor: { value: new THREE.Color( 0x1e4a48 ).convertSRGBToLinear() },
			uRipples: { value: this.ripples },
			uCalm: { value: 0.3 },
		};
		this.material = new THREE.ShaderMaterial( {
			name: 'LakeWater',
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
		this.mesh.material = this.material;

		// Objects that appear only in the reflection (a cheaper terrain on layer 2). three's
		// mirror camera sees layer 0, so they join layer 0 for the mirror pass alone.
		this.reflectOnly = [];
		// small waters far away borrow the lake's mirror image instead of rendering their own
		this.fallback = opts.fallback || null;
		this.farDist = opts.farDist ?? Infinity;
		const own = { tex: rig.mirrorSampler.value, mat: rig.textureMatrix.value };
		const centre = new THREE.Vector3();
		const mirror = this.mesh.onBeforeRender;
		// The mirror is drawn by renderMirror(), which the app calls before the frame for each
		// water in view - not from inside the water pass, where it would be a nested render
		// with a lighting state of its own.
		this.mesh.onBeforeRender = () => {};
		this.renderMirror = ( renderer, scene, camera ) => {

			this.mesh.geometry.boundingSphere && centre.copy( this.mesh.geometry.boundingSphere.center ).applyMatrix4( this.mesh.matrixWorld );
			const far = this.fallback && camera.position.distanceTo( centre ) > this.farDist;
			this.uniforms.mirrorSampler.value = far ? this.fallback.uniforms.mirrorSampler.value : own.tex;
			this.uniforms.textureMatrix.value = far ? this.fallback.uniforms.textureMatrix.value : own.mat;
			if ( far ) return;
			for ( const o of this.reflectOnly ) o.layers.enable( 0 );
			renderer.setClearColor( 0x000000, 1 );
			mirror( renderer, scene, camera );
			for ( const o of this.reflectOnly ) o.layers.disable( 0 );

		};

	}

	addRipple( x, z, strength = 1, delay = 0 ) {

		const r = this.ripples[ this._rippleIndex ];
		r.set( x, z, U.uTime.value + delay, strength );
		this._rippleIndex = ( this._rippleIndex + 1 ) % MAX_RIPPLES;

	}

	setSize( width, height ) {

		const s = this.quality.reflectScale * this.reflectScale;
		this.reflectTarget.setSize( Math.max( 2, Math.round( width * s ) ), Math.max( 2, Math.round( height * s ) ) );

	}

	// the waves run faster in a stiffer breeze
	update( dt ) {

		this.uniforms.time.value += dt * ( 0.35 + 0.9 * Math.min( 2, U.uWind.value.z ) );

	}

}
