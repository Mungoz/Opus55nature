import * as THREE from 'three';
import { FullscreenPass, passMaterial, makeTarget } from '../gen/gpu.js';

// 13-tap downsample (Jimenez 2014) with a Karis average on the first pass to tame fireflies.
const downFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uFirst;
varying vec2 vUv;
float lum( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
vec3 k( vec3 c ) { return c / ( 1.0 + lum( c ) ); }
void main() {
	vec2 t = uTexel;
	vec3 a = texture2D( tSrc, vUv + t * vec2( -2.0, 2.0 ) ).rgb;
	vec3 b = texture2D( tSrc, vUv + t * vec2( 0.0, 2.0 ) ).rgb;
	vec3 c = texture2D( tSrc, vUv + t * vec2( 2.0, 2.0 ) ).rgb;
	vec3 d = texture2D( tSrc, vUv + t * vec2( -2.0, 0.0 ) ).rgb;
	vec3 e = texture2D( tSrc, vUv ).rgb;
	vec3 f = texture2D( tSrc, vUv + t * vec2( 2.0, 0.0 ) ).rgb;
	vec3 g = texture2D( tSrc, vUv + t * vec2( -2.0, -2.0 ) ).rgb;
	vec3 h = texture2D( tSrc, vUv + t * vec2( 0.0, -2.0 ) ).rgb;
	vec3 i = texture2D( tSrc, vUv + t * vec2( 2.0, -2.0 ) ).rgb;
	vec3 j = texture2D( tSrc, vUv + t * vec2( -1.0, 1.0 ) ).rgb;
	vec3 kk = texture2D( tSrc, vUv + t * vec2( 1.0, 1.0 ) ).rgb;
	vec3 l = texture2D( tSrc, vUv + t * vec2( -1.0, -1.0 ) ).rgb;
	vec3 m = texture2D( tSrc, vUv + t * vec2( 1.0, -1.0 ) ).rgb;
	vec3 o;
	if ( uFirst > 0.5 ) {
		o = ( k( j ) + k( kk ) + k( l ) + k( m ) ) * 0.125;
		o += ( k( a ) + k( b ) + k( d ) + k( e ) ) * 0.03125;
		o += ( k( b ) + k( c ) + k( e ) + k( f ) ) * 0.03125;
		o += ( k( d ) + k( e ) + k( g ) + k( h ) ) * 0.03125;
		o += ( k( e ) + k( f ) + k( h ) + k( i ) ) * 0.03125;
		o = o / max( 1.0 - lum( o ), 1e-3 );
	} else {
		o = e * 0.125 + ( a + c + g + i ) * 0.03125 + ( b + d + f + h ) * 0.0625 + ( j + kk + l + m ) * 0.125;
	}
	gl_FragColor = vec4( min( o, vec3( 6e4 ) ), 1.0 );
}
`;

const upFrag = /* glsl */ `
uniform sampler2D tLow;
uniform sampler2D tHigh;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
void main() {
	vec2 t = uTexel * uRadius;
	vec3 s = texture2D( tLow, vUv ).rgb * 4.0;
	s += ( texture2D( tLow, vUv + vec2( -t.x, 0.0 ) ).rgb + texture2D( tLow, vUv + vec2( t.x, 0.0 ) ).rgb + texture2D( tLow, vUv + vec2( 0.0, -t.y ) ).rgb + texture2D( tLow, vUv + vec2( 0.0, t.y ) ).rgb ) * 2.0;
	s += texture2D( tLow, vUv - t ).rgb + texture2D( tLow, vUv + t ).rgb + texture2D( tLow, vUv + vec2( t.x, -t.y ) ).rgb + texture2D( tLow, vUv + vec2( -t.x, t.y ) ).rgb;
	gl_FragColor = vec4( texture2D( tHigh, vUv ).rgb + s / 16.0, 1.0 );
}
`;

// God rays: bright sky around the sun, radially smeared.
const raysPreFrag = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uSun;
uniform float uAspect;
varying vec2 vUv;
void main() {
	vec4 c = texture2D( tScene, vUv );
	float sky = 1.0 - c.a;
	vec2 d = ( vUv - uSun ) * vec2( uAspect, 1.0 );
	float fall = exp( -dot( d, d ) * 9.0 );
	vec3 v = min( c.rgb, vec3( 40.0 ) ) * sky * fall;
	gl_FragColor = vec4( v, 1.0 );
}
`;

const raysBlurFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSun;
uniform float uStep;
varying vec2 vUv;
float ign( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
void main() {
	const int N = 24;
	vec2 dir = ( uSun - vUv ) * uStep / float( N );
	vec2 uv = vUv + dir * ign( gl_FragCoord.xy );
	vec3 acc = vec3( 0.0 );
	float w = 1.0, ws = 0.0;
	for ( int i = 0; i < N; i ++ ) {
		acc += texture2D( tSrc, uv ).rgb * w;
		ws += w;
		w *= 0.965;
		uv += dir;
	}
	gl_FragColor = vec4( acc / ws, 1.0 );
}
`;

// Eye adaptation: centre-weighted log-average luminance of the (tiny) last bloom
// mip, eased toward over time. Stored in a 1x1 target and read by the composite.
const adaptFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tPrev;
uniform float uBlend;
varying vec2 vUv;
void main() {
	float acc = 0.0, wsum = 0.0;
	for ( int j = 0; j < 9; j ++ ) for ( int i = 0; i < 16; i ++ ) {
		vec2 uv = ( vec2( float( i ), float( j ) ) + 0.5 ) / vec2( 16.0, 9.0 );
		vec3 c = texture2D( tSrc, uv ).rgb;
		float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
		vec2 d = uv - vec2( 0.5, 0.45 );
		float w = exp( -dot( d, d ) * 3.0 );
		acc += log2( l + 1e-5 ) * w;
		wsum += w;
	}
	float avg = acc / wsum;
	float prev = texture2D( tPrev, vec2( 0.5 ) ).r;
	gl_FragColor = vec4( mix( prev, avg, uBlend ), 0.0, 0.0, 1.0 );
}
`;

const compositeFrag = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform sampler2D tAdapt;
uniform float uExposure;
uniform float uBloom;
uniform float uRays;
uniform vec3 uRaysTint;
uniform float uNight;
uniform float uTime;
uniform float uVignette;
uniform float uGrain;
uniform float uSaturation;
uniform vec2 uRes;
varying vec2 vUv;

const mat3 SRGB_TO_2020 = mat3( vec3( 0.6274, 0.0691, 0.0164 ), vec3( 0.3293, 0.9195, 0.0880 ), vec3( 0.0433, 0.0113, 0.8956 ) );
const mat3 R2020_TO_SRGB = mat3( vec3( 1.6605, -0.1246, -0.0182 ), vec3( -0.5876, 1.1329, -0.1006 ), vec3( -0.0728, -0.0083, 1.1187 ) );
vec3 agxCurve( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx( vec3 color ) {
	const mat3 inset = mat3( vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ), vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ), vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 ) );
	const mat3 outset = mat3( vec3( 1.1271005818144368, -0.1413297634984383, -0.14132976349843826 ), vec3( -0.11060664309660323, 1.157823702216272, -0.11060664309660294 ), vec3( -0.016493938717834573, -0.016493938717834257, 1.2519364065950405 ) );
	const float minEv = -12.47393;
	const float maxEv = 4.026069;
	color = SRGB_TO_2020 * color;
	color = inset * color;
	color = clamp( ( log2( max( color, 1e-10 ) ) - minEv ) / ( maxEv - minEv ), 0.0, 1.0 );
	color = agxCurve( color );
	// "punchy" look, dialled in partially
	float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	vec3 p = pow( max( color, 0.0 ), vec3( 1.25 ) );
	float lp = dot( p, vec3( 0.2126, 0.7152, 0.0722 ) );
	color = lp + uSaturation * ( p - lp );
	color = outset * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = R2020_TO_SRGB * color;
	return clamp( color, 0.0, 1.0 );
}
vec3 toSRGB( vec3 c ) {
	return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) );
}
float hash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * .1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }

void main() {
	vec2 uv = vUv;
	// faint lateral chromatic aberration toward the frame edges
	vec2 cd = ( uv - 0.5 ) * 0.0014 * dot( uv - 0.5, uv - 0.5 ) * 4.0;
	vec3 c;
	c.r = texture2D( tScene, uv + cd ).r;
	c.g = texture2D( tScene, uv ).g;
	c.b = texture2D( tScene, uv - cd ).b;
	vec3 bloom = texture2D( tBloom, uv ).rgb;
	c = mix( c, bloom, uBloom );
	c += texture2D( tRays, uv ).rgb * uRays * uRaysTint;
	// auto exposure: map the adapted average to a key that sinks in the dark,
	// so dusk and night stay dim and moody rather than being lifted to grey
	float logL = texture2D( tAdapt, vec2( 0.5 ) ).r;
	float key = mix( 0.03, 0.165, smoothstep( -12.5, -2.5, logL ) );
	float ev = clamp( log2( key ) - logL, -2.0, 7.5 );
	c *= exp2( ev ) * uExposure;

	// night vision: rods lose colour and shift blue
	float L = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	vec3 scot = vec3( 0.55, 0.68, 1.0 ) * L;
	c = mix( c, scot, uNight * 0.55 * ( 1.0 - smoothstep( 0.1, 0.6, L ) ) );

	c = agx( c );

	// gentle split-tone: warm highlights, cool shadows
	float l2 = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c = mix( c, c * vec3( 0.93, 0.99, 1.07 ), ( 1.0 - smoothstep( 0.0, 0.35, l2 ) ) * 0.5 );
	c = mix( c, c * vec3( 1.04, 1.0, 0.95 ), smoothstep( 0.45, 1.0, l2 ) * 0.5 );

	vec2 q = uv - 0.5;
	float vig = 1.0 - dot( q, q ) * uVignette;
	c *= vig;
	c = toSRGB( clamp( c, 0.0, 1.0 ) );
	float g = hash( gl_FragCoord.xy + fract( uTime * 7.13 ) * 131.0 ) - 0.5;
	c += g * uGrain;
	gl_FragColor = vec4( c, 1.0 );
}
`;

export class Post {

	constructor( renderer, opts ) {

		this.renderer = renderer;
		this.opts = opts;
		this.scale = 1;
		this.bloomLevels = 6;
		this.exposure = 1;
		this.bloomStrength = 0.05;
		this.raysStrength = 0.35;
		this.raysTint = new THREE.Vector3( 1, 1, 1 );
		this.night = 0;
		this.sunScreen = new THREE.Vector2( 0.5, 0.5 );
		this.sunVisible = 0;

		this.downPass = new FullscreenPass( passMaterial( downFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } } ) );
		this.upPass = new FullscreenPass( passMaterial( upFrag, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } } ) );
		this.raysPre = new FullscreenPass( passMaterial( raysPreFrag, { tScene: { value: null }, uSun: { value: this.sunScreen }, uAspect: { value: 1 } } ) );
		this.raysBlur = new FullscreenPass( passMaterial( raysBlurFrag, { tSrc: { value: null }, uSun: { value: this.sunScreen }, uStep: { value: 1 } } ) );
		this.adapt = [ 0, 1 ].map( () => makeTarget( 1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter } ) );
		this.adaptPass = new FullscreenPass( passMaterial( adaptFrag, { tSrc: { value: null }, tPrev: { value: null }, uBlend: { value: 1 } } ) );
		this._adaptIndex = 0;
		this._adaptFrames = 0;
		this.dt = 1 / 60;
		this.composite = new FullscreenPass( passMaterial( compositeFrag, {
			tAdapt: { value: null },
			tScene: { value: null },
			tBloom: { value: null },
			tRays: { value: null },
			uExposure: { value: 1 },
			uBloom: { value: 0.05 },
			uRays: { value: 0 },
			uRaysTint: { value: this.raysTint },
			uNight: { value: 0 },
			uTime: { value: 0 },
			uVignette: { value: 0.55 },
			uGrain: { value: 0.012 },
			uSaturation: { value: 1.12 },
			uRes: { value: new THREE.Vector2() },
		} ) );

		this.sceneRT = null;
		this.down = [];
		this.up = [];

	}

	setSize( width, height, scale = this.scale ) {

		this.scale = scale;
		const w = Math.max( 2, Math.round( width * scale ) ), h = Math.max( 2, Math.round( height * scale ) );
		this.width = w;
		this.height = h;
		if ( ! this.sceneRT ) {

			this.sceneRT = new THREE.WebGLRenderTarget( w, h, {
				type: THREE.HalfFloatType,
				samples: this.opts.msaa,
				depthBuffer: true,
				stencilBuffer: false,
			} );
			this.sceneRT.texture.name = 'scene';

		} else {

			this.sceneRT.setSize( w, h );

		}

		for ( const t of [ ...this.down, ...this.up, this.raysA, this.raysB ] ) t?.dispose();
		this.down = [];
		this.up = [];
		let bw = w, bh = h;
		for ( let i = 0; i < this.bloomLevels; i ++ ) {

			bw = Math.max( 1, bw >> 1 );
			bh = Math.max( 1, bh >> 1 );
			this.down.push( makeTarget( bw, bh, { type: THREE.HalfFloatType } ) );
			if ( i < this.bloomLevels - 1 ) this.up.push( makeTarget( bw, bh, { type: THREE.HalfFloatType } ) );

		}

		const rw = Math.max( 2, w >> 2 ), rh = Math.max( 2, h >> 2 );
		this.raysA = makeTarget( rw, rh, { type: THREE.HalfFloatType } );
		this.raysB = makeTarget( rw, rh, { type: THREE.HalfFloatType } );
		this.composite.material.uniforms.uRes.value.set( width, height );
		this.raysPre.material.uniforms.uAspect.value = w / h;

	}

	setMSAA( samples ) {

		if ( this.sceneRT && this.sceneRT.samples !== samples ) {

			this.sceneRT.dispose();
			this.sceneRT = null;
			this.opts.msaa = samples;
			this.setSize( this.width / this.scale, this.height / this.scale );

		}

	}

	render( time ) {

		const r = this.renderer;
		const src = this.sceneRT.texture;

		// bloom
		let input = src;
		for ( let i = 0; i < this.down.length; i ++ ) {

			const u = this.downPass.material.uniforms;
			u.tSrc.value = input;
			u.uTexel.value.set( 1 / input.image.width, 1 / input.image.height );
			u.uFirst.value = i === 0 ? 1 : 0;
			this.downPass.render( r, this.down[ i ] );
			input = this.down[ i ].texture;

		}

		let low = this.down[ this.down.length - 1 ].texture;
		for ( let i = this.up.length - 1; i >= 0; i -- ) {

			const u = this.upPass.material.uniforms;
			u.tLow.value = low;
			u.tHigh.value = this.down[ i ].texture;
			u.uTexel.value.set( 1 / low.image.width, 1 / low.image.height );
			u.uRadius.value = 1.0;
			this.upPass.render( r, this.up[ i ] );
			low = this.up[ i ].texture;

		}

		// eye adaptation (a quick start, then a gentle ~2 s adaptation)
		const prev = this.adapt[ this._adaptIndex ], next = this.adapt[ 1 - this._adaptIndex ];
		const au = this.adaptPass.material.uniforms;
		au.tSrc.value = this.down[ this.down.length - 1 ].texture;
		au.tPrev.value = prev.texture;
		au.uBlend.value = this._adaptFrames < 3 ? 1 : 1 - Math.exp( - this.dt * 1.6 );
		this.adaptPass.render( r, next );
		this._adaptIndex = 1 - this._adaptIndex;
		this._adaptFrames ++;

		// god rays
		const raysOn = this.sunVisible > 0.001 && this.raysStrength > 0;
		if ( raysOn ) {

			this.raysPre.material.uniforms.tScene.value = src;
			this.raysPre.render( r, this.raysA );
			const bu = this.raysBlur.material.uniforms;
			bu.tSrc.value = this.raysA.texture;
			bu.uStep.value = 0.9;
			this.raysBlur.render( r, this.raysB );
			bu.tSrc.value = this.raysB.texture;
			bu.uStep.value = 0.35;
			this.raysBlur.render( r, this.raysA );

		}

		const cu = this.composite.material.uniforms;
		cu.tScene.value = src;
		cu.tBloom.value = low;
		cu.tRays.value = this.raysA.texture;
		cu.tAdapt.value = next.texture;
		cu.uRays.value = raysOn ? this.raysStrength * this.sunVisible : 0;
		cu.uExposure.value = this.exposure;
		cu.uBloom.value = this.bloomStrength;
		cu.uNight.value = this.night;
		cu.uTime.value = time;
		this.composite.render( r, null );

	}

}
