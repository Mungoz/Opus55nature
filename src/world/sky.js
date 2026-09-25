import * as THREE from 'three';
import { atmosphereGLSL, skyMappingGLSL } from '../shaders/atmosphere.glsl.js';
import { noiseGLSL } from '../shaders/noise.glsl.js';
import { commonParsGLSL } from '../shaders/common.glsl.js';
import { FullscreenPass, passMaterial, makeTarget } from '../gen/gpu.js';
import { U, sharedUniforms } from '../core/uniforms.js';
import { WORLD } from '../core/world.js';

const D2R = Math.PI / 180;
export const SUN_E = 6.0; // solar irradiance scale (scene units)
const MOON_E = SUN_E * 0.0075;
const VIEW_ALT = 1650; // the lake sits ~1650 m above sea level
// Geographic azimuth that maps onto world -z (straight up the lake toward the massif).
const WORLD_NORTH_OFFSET = 58;

// ---------- CPU atmosphere (transmittance only) for light colours ----------
const BR = [ 5.802e-6, 13.558e-6, 33.1e-6 ];
const BME = 4.4e-6;
const BO = [ 0.650e-6, 1.881e-6, 0.085e-6 ];
const RG = 6360e3, RT = 6460e3;

function transmittance( altitude, dir, out, mieScale = 1 ) {

	// ray from (0, RG+alt, 0) along dir to the top of the atmosphere
	const oy = RG + altitude;
	const b = oy * dir.y;
	const cG = oy * oy - RG * RG;
	const dG = b * b - cG;
	if ( dG > 0 && - b - Math.sqrt( dG ) > 0 ) {

		out.set( 0, 0, 0 );
		return out;

	}

	const cT = oy * oy - RT * RT;
	const tMax = - b + Math.sqrt( b * b - cT );
	const N = 40;
	const dt = tMax / N;
	let odR = 0, odM = 0, odO = 0;
	for ( let i = 0; i < N; i ++ ) {

		const t = ( i + 0.5 ) * dt;
		const x = dir.x * t, y = oy + dir.y * t, z = dir.z * t;
		const h = Math.sqrt( x * x + y * y + z * z ) - RG;
		odR += Math.exp( - h / 8000 ) * dt;
		odM += Math.exp( - h / 1200 ) * dt;
		odO += Math.max( 0, 1 - Math.abs( h - 25000 ) / 15000 ) * dt;

	}

	out.set(
		Math.exp( - ( BR[ 0 ] * odR + BME * mieScale * odM + BO[ 0 ] * odO ) ),
		Math.exp( - ( BR[ 1 ] * odR + BME * mieScale * odM + BO[ 1 ] * odO ) ),
		Math.exp( - ( BR[ 2 ] * odR + BME * mieScale * odM + BO[ 2 ] * odO ) ),
	);
	return out;

}

// ---------- astronomy ----------
function celestialToWorld( decDeg, hourAngleDeg, out ) {

	const lat = WORLD.latitude * D2R, dec = decDeg * D2R, H = hourAngleDeg * D2R;
	const sinEl = Math.sin( lat ) * Math.sin( dec ) + Math.cos( lat ) * Math.cos( dec ) * Math.cos( H );
	const el = Math.asin( THREE.MathUtils.clamp( sinEl, - 1, 1 ) );
	let cosAz = ( Math.sin( dec ) - Math.sin( el ) * Math.sin( lat ) ) / ( Math.cos( el ) * Math.cos( lat ) );
	let az = Math.acos( THREE.MathUtils.clamp( cosAz, - 1, 1 ) );
	if ( Math.sin( H ) > 0 ) az = 2 * Math.PI - az;
	az -= WORLD_NORTH_OFFSET * D2R;
	return out.set( Math.sin( az ) * Math.cos( el ), Math.sin( el ), - Math.cos( az ) * Math.cos( el ) );

}

const lutFrag = /* glsl */ `
${noiseGLSL}
${atmosphereGLSL}
${skyMappingGLSL}
uniform vec3 uSunDirT;
uniform vec3 uMoonDirT;
uniform vec3 uSunE;
uniform vec3 uMoonE;
uniform float uViewAlt;
uniform vec2 uRes;
uniform float uOvercast;
void main() {
	vec2 uv = gl_FragCoord.xy / uRes;
	vec3 rd = skyUVToDir( uv );
	vec3 ro = vec3( 0.0, R_GROUND + uViewAlt, 0.0 );
	vec3 col = scatter( ro, rd, uSunDirT, uSunE, uMoonDirT, uMoonE );
	// overcast: a flat grey vault, brightest overhead
	float lum = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
	vec3 grey = vec3( lum ) * vec3( 0.93, 0.97, 1.03 ) * ( 0.55 + 0.25 * max( rd.y, 0.0 ) );
	col = mix( col, grey, uOvercast * 0.92 );
	// faint airglow / starlight so moonless nights are never pure black
	col += vec3( 0.0003, 0.00045, 0.0008 ) * ( 0.6 + 0.4 * max( rd.y, 0.0 ) );
	gl_FragColor = vec4( col, 1.0 );
}
`;

const irrFrag = /* glsl */ `
${noiseGLSL}
${skyMappingGLSL}
uniform sampler2D uLUT;
uniform vec3 uSunGround;
uniform vec3 uSunDirT;
uniform vec2 uRes;
uniform float uOvercast;
const int NS = 192;
vec3 fib( int i ) {
	float k = ( float( i ) + 0.5 ) / float( NS );
	float phi = acos( 1.0 - 2.0 * k );
	float th = PI * ( 1.0 + sqrt( 5.0 ) ) * float( i );
	return vec3( cos( th ) * sin( phi ), cos( phi ), sin( th ) * sin( phi ) );
}
void main() {
	vec3 n = skyUVToDir( gl_FragCoord.xy / uRes );
	// irradiance falling on flat ground from the sky dome
	vec3 eUp = vec3( 0.0 );
	float dw = 4.0 * PI / float( NS );
	for ( int i = 0; i < NS; i ++ ) {
		vec3 w = fib( i );
		if ( w.y > 0.0 ) eUp += texture2D( uLUT, dirToSkyUV( w ) ).rgb * w.y * dw;
	}
	vec3 ground = vec3( 0.16, 0.15, 0.11 ) / PI * ( eUp + uSunGround * max( uSunDirT.y, 0.0 ) );
	vec3 e = vec3( 0.0 );
	for ( int i = 0; i < NS; i ++ ) {
		vec3 w = fib( i );
		float c = dot( n, w );
		if ( c <= 0.0 ) continue;
		vec3 L = w.y > 0.0 ? texture2D( uLUT, dirToSkyUV( w ) ).rgb : ground;
		e += L * c * dw;
	}
	// under cloud, sunlight arrives as soft diffuse light from the whole vault
	vec3 diffuseSun = uSunGround * max( uSunDirT.y + 0.05, 0.0 ) * 0.28 * ( 0.6 + 0.4 * max( n.y, 0.0 ) );
	vec3 grey = vec3( dot( e, vec3( 0.2126, 0.7152, 0.0722 ) ) ) * vec3( 0.95, 0.98, 1.03 ) + diffuseSun;
	e = mix( e, grey, uOvercast * 0.9 );
	gl_FragColor = vec4( e, 1.0 );
}
`;

const domeVert = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = position;
	vec4 p = projectionMatrix * viewMatrix * vec4( position * 1000.0 + cameraPosition, 1.0 );
	gl_Position = p.xyww;
}
`;

const domeFrag = /* glsl */ `
${commonParsGLSL}
uniform vec3 uSunDisk;
uniform vec3 uMoonDisk;
uniform vec3 uCloudSun;
uniform vec3 uMoonDir;
uniform mat3 uStarRot;
uniform float uAurora;
uniform float uStars;
varying vec3 vDir;

// ---- aurora: layered triangle-wave noise curtains ----
float tri( float x ) { return clamp( abs( fract( x ) - 0.5 ), 0.01, 0.49 ); }
vec2 tri2( vec2 p ) { return vec2( tri( p.x ) + tri( p.y ), tri( p.y + tri( p.x ) ) ); }
mat2 rot2( float a ) { float c = cos( a ), s = sin( a ); return mat2( c, s, -s, c ); }
float auroraNoise( vec2 p ) {
	float z = 1.8, z2 = 2.5, rz = 0.0;
	p *= rot2( p.x * 0.06 );
	vec2 bp = p;
	for ( int i = 0; i < 5; i ++ ) {
		vec2 dg = tri2( bp * 1.85 ) * 0.75;
		dg *= rot2( uTime * 0.05 );
		p -= dg / z2;
		bp *= 1.3;
		z2 *= 0.45;
		z *= 0.42;
		p *= 1.21 + ( rz - 1.0 ) * 0.02;
		rz += tri( p.x + tri( p.y ) ) * z;
		p *= -mat2( 0.95534, 0.29552, -0.29552, 0.95534 );
	}
	return clamp( 1.0 / pow( rz * 29.0, 1.3 ), 0.0, 0.55 );
}
vec3 aurora( vec3 rd ) {
	vec3 col = vec3( 0.0 );
	vec3 acc = vec3( 0.0 );
	float jitter = interleavedGradient( gl_FragCoord.xy );
	for ( int i = 0; i < 42; i ++ ) {
		float fi = float( i );
		float of = 0.006 * jitter * smoothstep( 0.0, 15.0, fi );
		float pt = ( ( 0.8 + pow( fi, 1.4 ) * 0.002 ) ) / ( rd.y * 2.0 + 0.4 ) - of;
		vec2 p = ( rd * pt ).zx + vec2( 3.0, -1.0 );
		float n = auroraNoise( p );
		vec3 c = ( sin( 1.0 - vec3( 2.15, -0.5, 1.2 ) + fi * 0.043 ) * 0.5 + 0.5 ) * n;
		acc = mix( acc, c, 0.5 );
		col += acc * exp2( -fi * 0.065 - 2.5 ) * smoothstep( 0.0, 5.0, fi );
	}
	return col * clamp( rd.y * 15.0 + 0.4, 0.0, 1.0 ) * 1.8;
}

// ---- stars and the milky way ----
vec3 starField( vec3 rd, float pix ) {
	vec3 s = uStarRot * rd;
	vec3 col = vec3( 0.0 );
	for ( int layer = 0; layer < 2; layer ++ ) {
		float scale = layer == 0 ? 160.0 : 330.0;
		vec3 p = s * scale;
		vec3 cell = floor( p );
		vec3 h = hash33( cell + float( layer ) * 31.0 );
		vec3 sp = normalize( cell + 0.2 + 0.6 * h );
		float ang = length( s - sp );
		// only a few percent of cells hold a star; most of those are faint
		float exists = step( layer == 0 ? 0.984 : 0.9935, hash13( cell + 11.0 + float( layer ) * 7.0 ) );
		float mag = exists * pow( hash13( cell + 5.3 ), 4.0 ) * ( layer == 0 ? 0.6 : 0.08 ) + exists * 0.012;
		float size = max( pix * 0.55, 0.0002 );
		float b = mag * exp( -ang * ang / ( size * size ) );
		float tw = 0.7 + 0.3 * sin( uTime * ( 2.0 + h.y * 5.0 ) + h.z * 60.0 );
		vec3 tint = mix( vec3( 0.65, 0.78, 1.0 ), vec3( 1.0, 0.82, 0.62 ), h.x * h.x );
		col += tint * b * tw;
	}
	// milky way band
	vec3 nMW = normalize( vec3( 0.25, 0.55, -0.8 ) );
	float d = dot( s, nMW );
	float band = exp( -d * d * 14.0 );
	float cloud = fbm3( s * 5.0, 5 ) * 0.5 + 0.5;
	float dust = smoothstep( 0.45, 0.75, fbm3( s * 9.0 + 3.0, 4 ) * 0.5 + 0.5 ) * exp( -d * d * 60.0 );
	col += vec3( 0.85, 0.82, 0.95 ) * band * cloud * ( 1.0 - dust * 0.8 ) * 0.012;
	// unresolved faint stars
	float speck = pow( hash13( floor( s * 900.0 ) ), 90.0 );
	col += vec3( 0.8, 0.85, 1.0 ) * speck * ( 0.3 + band ) * 0.04;
	return col;
}

// ---- clouds ----
float hg( float mu, float g ) { float gg = g * g; return ( 1.0 - gg ) / pow( 1.0 + gg - 2.0 * g * mu, 1.5 ); }

float cloudDensityDetail( vec2 p ) {
	vec2 uv = ( p + uCloud.yz ) / 9000.0;
	float base = texture2D( uNoiseTex, uv ).r;
	float det = texture2D( uNoiseTex, uv * 3.7 + 0.31 ).g;
	float fine = texture2D( uNoiseTex, uv * 13.0 + 0.77 ).b;
	float d = base * 0.72 + det * 0.22 + fine * 0.08;
	float cov = uCloud.x;
	return smoothstep( 1.0 - cov, 1.0 - cov + 0.3, d );
}

vec4 cloudLayer( vec3 rd, vec3 L, vec3 lightCol ) {
	if ( rd.y <= 0.0 ) return vec4( 0.0 );
	float Rv = 6360e3 + 1650.0 + cameraPosition.y;
	float Rc = 6360e3 + 1650.0 + 2300.0;
	float b = Rv * rd.y;
	float t = -b + sqrt( b * b + Rc * Rc - Rv * Rv );
	vec2 p = cameraPosition.xz + rd.xz * t;
	float d = cloudDensityDetail( p );
	if ( d <= 0.001 ) return vec4( 0.0 );
	vec2 ld = normalize( L.xz + vec2( 1e-4 ) );
	float od = 0.0;
	for ( int i = 1; i <= 4; i ++ ) {
		float fi = float( i );
		od += cloudDensityAt( p + ld * fi * fi * 70.0 ) * ( 0.6 + fi * 0.2 );
	}
	float Ts = exp( -od * 0.45 );
	float mu = dot( rd, L );
	// forward scattering, capped so small puffs near the sun glow rather than blaze
	float phase = min( mix( hg( mu, 0.6 ), hg( mu, -0.2 ), 0.35 ), 2.2 );
	float powder = 1.0 - exp( -d * 3.0 );
	vec3 amb = skyIrradiance( vec3( 0.0, 1.0, 0.0 ) ) * 0.075 * ( 1.2 - 0.6 * d ) + skyIrradiance( vec3( 0.0, -1.0, 0.0 ) ) * 0.04;
	vec3 c = lightCol * Ts * phase * mix( 0.5, 1.0, powder ) * 0.2 + amb;
	c *= 1.0 - uWeather.x * 0.55 * smoothstep( 0.3, 0.9, d );
	c += uWeather.w * vec3( 2.6, 2.8, 3.4 ) * ( 0.3 + d );
	float alpha = ( 1.0 - exp( -d * 5.0 ) ) * smoothstep( 0.0, 0.18, d );
	float fade = exp( -t / 60000.0 );
	c = mix( skyRadiance( rd ), c, fade );
	return vec4( c, alpha * smoothstep( 0.0, 0.05, rd.y ) );
}

vec4 cirrus( vec3 rd, vec3 L, vec3 lightCol ) {
	if ( rd.y <= 0.0 ) return vec4( 0.0 );
	float Rv = 6360e3 + 1650.0 + cameraPosition.y;
	float Rc = 6360e3 + 9000.0;
	float b = Rv * rd.y;
	float t = -b + sqrt( b * b + Rc * Rc - Rv * Rv );
	vec2 p = ( cameraPosition.xz + rd.xz * t + uCloud.yz * 1.6 ) / 30000.0;
	p = mat2( 0.87, 0.5, -0.5, 0.87 ) * p;
	float n = texture2D( uNoiseTex, vec2( p.x * 0.35, p.y * 3.0 ) ).g;
	float n2 = texture2D( uNoiseTex, p * 1.3 + 0.2 ).r;
	float d = smoothstep( 0.52, 0.85, n * 0.7 + n2 * 0.45 ) * smoothstep( 0.2, 0.7, uCloud.x + 0.25 );
	if ( d <= 0.0 ) return vec4( 0.0 );
	float mu = dot( rd, L );
	vec3 c = lightCol * mix( hg( mu, 0.7 ), 1.0, 0.5 ) * 0.07 + skyIrradiance( vec3( 0.0, 1.0, 0.0 ) ) * 0.06;
	float fade = exp( -t / 90000.0 );
	c = mix( skyRadiance( rd ), c, fade );
	return vec4( c, d * 0.55 * smoothstep( 0.0, 0.08, rd.y ) );
}

void main() {
	vec3 rd = normalize( vDir );
	float pix = length( fwidth( rd ) );
	vec3 skyDir = rd.y < 0.02 ? normalize( vec3( rd.x, 0.02 + ( rd.y - 0.02 ) * 0.05, rd.z ) ) : rd;
	vec3 col = skyRadiance( skyDir );
	float up = smoothstep( -0.02, 0.06, rd.y );
	vec3 Tzen = exp( -vec3( 0.03, 0.05, 0.1 ) / max( rd.y + 0.03, 0.03 ) );

	// night sky
	if ( uStars * ( 1.0 - uWeather.z ) > 0.001 && rd.y > -0.05 ) {
		col += starField( rd, pix ) * uStars * Tzen * up;
		if ( uAurora > 0.001 ) {
			// curtains hang over the northern horizon
			vec2 north = vec2( -0.848, -0.53 );
			float nf = smoothstep( -0.1, 0.7, dot( normalize( rd.xz + 1e-4 ), north ) ) * smoothstep( 0.75, 0.2, rd.y );
			col += aurora( rd ) * uAurora * uStars * uStars * 0.09 * up * nf;
		}
	}

	// moon
	vec3 M = uMoonDir;
	float cm = dot( rd, M );
	float moonR = 0.0095;
	if ( cm > cos( moonR * 1.05 ) ) {
		vec3 right = normalize( cross( M, vec3( 0.0, 1.0, 0.0 ) ) );
		vec3 upv = cross( right, M );
		vec2 q = vec2( dot( rd, right ), dot( rd, upv ) ) / moonR;
		float rr = dot( q, q );
		if ( rr < 1.0 ) {
			vec3 nrm = right * q.x + upv * q.y - M * sqrt( 1.0 - rr );
			float lit = smoothstep( -0.05, 0.12, dot( nrm, uTrueSunDir ) );
			vec3 sp = nrm * 3.0;
			float maria = smoothstep( 0.1, 0.5, fbm3( sp * 1.3 + 4.0, 4 ) * 0.5 + 0.5 );
			float crater = voronoi( q * 6.0 ).x;
			float alb = mix( 0.95, 0.55, maria ) * ( 0.9 + 0.1 * smoothstep( 0.1, 0.4, crater ) );
			vec3 mc = uMoonDisk * alb * ( lit + 0.012 );
			col = mix( col, mc * Tzen + col * 0.3, smoothstep( 1.0, 0.9, rr ) * up );
		}
	}

	// sun
	vec3 S = uTrueSunDir;
	float cs = dot( rd, S );
	float sunR = 0.0085;
	if ( cs > cos( sunR * 1.3 ) ) {
		float a = acos( clamp( cs, -1.0, 1.0 ) ) / sunR;
		float limb = 1.0 - 0.6 * ( 1.0 - sqrt( max( 0.0, 1.0 - a * a ) ) );
		col += uSunDisk * limb * smoothstep( 1.0, 0.92, a ) * up * ( 1.0 - uWeather.z * 0.97 );
	}

	// clouds: lit by the sun, or by the moon at night
	vec3 L = uTrueSunDir.y > -0.12 ? uTrueSunDir : M;
	vec3 lc = uCloudSun;
	vec4 ci = cirrus( rd, L, lc );
	col = mix( col, ci.rgb, ci.a );
	vec4 cl = cloudLayer( rd, L, lc );
	col = mix( col, cl.rgb, cl.a );
	// under a low cloud deck the whole vault is the deck itself
	if ( uCloudBase.y > 0.0 ) {
		float k = saturate( uCloudBase.y * 350.0 ) * smoothstep( -0.05, 0.08, rd.y );
		float tex = texture2D( uNoiseTex, rd.xz / max( rd.y + 0.15, 0.1 ) * 0.25 + uCloud.yz * 0.00003 ).r;
		col = mix( col, lowCloudColor() * ( 0.85 + 0.3 * tex ), k );
	}

	gl_FragColor = vec4( max( col, 0.0 ), 0.0 );
}
`;

export class Sky {

	constructor( renderer ) {

		this.renderer = renderer;
		this.lutRes = new THREE.Vector2( 256, 128 );
		this.lutRT = makeTarget( 256, 128, { type: THREE.HalfFloatType } );
		this.lutRT.texture.wrapS = THREE.RepeatWrapping;
		this.irrRT = makeTarget( 32, 16, { type: THREE.HalfFloatType } );
		this.irrRT.texture.wrapS = THREE.RepeatWrapping;
		U.uSkyLUT.value = this.lutRT.texture;
		U.uIrrLUT.value = this.irrRT.texture;

		this.sunDir = new THREE.Vector3();
		this.moonDir = new THREE.Vector3();
		this.sunColor = new THREE.Vector3();
		this.moonColor = new THREE.Vector3();
		this.mainDir = new THREE.Vector3();
		this.mainColor = new THREE.Vector3();
		this._t = new THREE.Vector3();

		this.lutPass = new FullscreenPass( passMaterial( lutFrag, {
			uSunDirT: { value: this.sunDir },
			uMoonDirT: { value: this.moonDir },
			uSunE: { value: new THREE.Vector3( SUN_E, SUN_E, SUN_E ) },
			uMoonE: { value: new THREE.Vector3() },
			uViewAlt: { value: VIEW_ALT },
			uRes: { value: this.lutRes },
			uMieScale: { value: 1.6 },
			uRayleighScale: { value: 1.0 },
			uOvercast: { value: 0 },
		} ) );

		this.irrPass = new FullscreenPass( passMaterial( irrFrag, {
			uLUT: { value: this.lutRT.texture },
			uSunGround: { value: this.sunColor },
			uSunDirT: { value: this.sunDir },
			uRes: { value: new THREE.Vector2( 32, 16 ) },
			uOvercast: { value: 0 },
		} ) );

		this.domeUniforms = {
			...sharedUniforms(),
			uSunDisk: { value: new THREE.Vector3() },
			uMoonDisk: { value: new THREE.Vector3() },
			uCloudSun: { value: new THREE.Vector3() },
			uStarRot: { value: new THREE.Matrix3() },
			uAurora: { value: 1 },
			uStars: { value: 0 },
		};
		this.material = new THREE.ShaderMaterial( {
			vertexShader: domeVert,
			fragmentShader: domeFrag,
			uniforms: this.domeUniforms,
			side: THREE.BackSide,
			depthWrite: false,
		} );
		this.mesh = new THREE.Mesh( new THREE.SphereGeometry( 1, 48, 24 ), this.material );
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = - 1000;
		this.mesh.name = 'sky';

		this.auroraEnabled = true;
		this.overcast = 0;
		this.dayOfYearDecl = - 12; // late October

	}

	// hours: local solar time (0..24)
	update( hours ) {

		const H = ( hours - 12 ) * 15;
		celestialToWorld( this.dayOfYearDecl, H, this.sunDir );
		// a waxing gibbous moon a little behind the anti-sun
		celestialToWorld( 11, H + 180 - 16, this.moonDir );
		U.uTrueSunDir.value.copy( this.sunDir );
		U.uMoonDir.value.copy( this.moonDir );

		transmittance( VIEW_ALT, this.sunDir, this._t, 1.6 );
		this.sunColor.copy( this._t ).multiplyScalar( SUN_E );
		// soften the planet-shadow edge a little (sun disk has finite size)
		const sunUp = THREE.MathUtils.smoothstep( this.sunDir.y, - 0.012, 0.01 );
		this.sunColor.multiplyScalar( sunUp );

		const phase = 0.5 * ( 1 - this.sunDir.dot( this.moonDir ) ); // illuminated fraction
		transmittance( VIEW_ALT, this.moonDir, this._t, 1.6 );
		const moonUp = THREE.MathUtils.smoothstep( this.moonDir.y, - 0.01, 0.02 );
		this.moonColor.copy( this._t ).multiplyScalar( MOON_E * phase * moonUp );

		// main (shadow-casting) light: sun by day, moon by night
		const night = THREE.MathUtils.smoothstep( - this.sunDir.y, 0.0, 0.2 );
		const moonShare = THREE.MathUtils.smoothstep( - this.sunDir.y, 0.05, 0.12 );
		if ( this.sunDir.y > - 0.08 ) {

			this.mainDir.copy( this.sunDir );
			this.mainColor.copy( this.sunColor );

		} else {

			this.mainDir.copy( this.moonDir );
			this.mainColor.copy( this.moonColor ).multiplyScalar( moonShare );

		}

		if ( this.mainDir.y < 0.02 ) {

			// keep the shadow direction sane when the light grazes the horizon
			this.mainDir.y = 0.02;
			this.mainDir.normalize();

		}

		U.uSunDir.value.copy( this.mainDir );
		U.uSunColor.value.copy( this.mainColor );
		U.uNight.value = night;

		// LUT
		this.lutPass.material.uniforms.uMoonE.value.set( MOON_E * phase, MOON_E * phase, MOON_E * phase );
		this.lutPass.material.uniforms.uOvercast.value = this.overcast;
		this.irrPass.material.uniforms.uOvercast.value = this.overcast;
		this.lutPass.render( this.renderer, this.lutRT );
		this.irrPass.render( this.renderer, this.irrRT );

		// dome
		const du = this.domeUniforms;
		transmittance( VIEW_ALT, this.sunDir, this._t, 1.6 );
		du.uSunDisk.value.copy( this._t ).multiplyScalar( SUN_E * 260 );
		const moonT = transmittance( VIEW_ALT, this.moonDir, new THREE.Vector3(), 1.6 );
		du.uMoonDisk.value.copy( moonT ).multiplyScalar( SUN_E * 0.6 );
		// sunlight at cloud altitude: stays lit a while after sunset at the valley floor
		if ( this.sunDir.y > - 0.12 ) {

			transmittance( VIEW_ALT + 2300, this.sunDir, this._t, 1.0 );
			const lit = THREE.MathUtils.smoothstep( this.sunDir.y, - 0.075, - 0.02 );
			du.uCloudSun.value.copy( this._t ).multiplyScalar( SUN_E * lit );

		} else {

			du.uCloudSun.value.copy( this.moonColor ).multiplyScalar( 1.2 );

		}

		du.uStars.value = THREE.MathUtils.smoothstep( - this.sunDir.y, 0.1, 0.28 );
		du.uAurora.value = this.auroraEnabled ? 1 : 0;

		// star sphere turns about the celestial pole (sidereal ~ solar here)
		const pole = new THREE.Vector3();
		celestialToWorld( 90, 0, pole );
		const q = new THREE.Quaternion().setFromAxisAngle( pole, - H * D2R );
		du.uStarRot.value.setFromMatrix4( new THREE.Matrix4().makeRotationFromQuaternion( q ) );

	}

	get sunElevation() { return Math.asin( this.sunDir.y ) / D2R; }

}
