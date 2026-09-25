import * as THREE from 'three';
import { noiseGLSL, tileNoiseGLSL } from '../shaders/noise.glsl.js';
import { FullscreenPass, passMaterial, makeTarget } from './gpu.js';

const header = /* glsl */ `
${noiseGLSL}
${tileNoiseGLSL}
uniform vec2 uRes;
`;

const causticsGLSL = /* glsl */ `
float caustic( vec2 uv ) {
	vec2 p = uv * 7.0;
	vec2 warp = vec2( tfbm( uv * 3.0, vec2( 3.0 ), 3 ), tfbm( uv * 3.0 + 7.3, vec2( 3.0 ), 3 ) ) * 0.9;
	vec3 v = tvoronoi( p + warp, vec2( 7.0 ) );
	float e = v.y - v.x;
	float c = pow( 1.0 - smoothstep( 0.0, 0.32, e ), 3.0 );
	vec3 v2 = tvoronoi( p * 2.0 + warp * 1.7 + 3.0, vec2( 14.0 ) );
	float c2 = pow( 1.0 - smoothstep( 0.0, 0.25, v2.y - v2.x ), 3.0 );
	return clamp( c * 0.8 + c2 * 0.35, 0.0, 1.0 );
}
`;

// R: billowy cloud base, G: mid fbm, B: fine detail, A: caustics. All tile.
const noiseFrag = header + causticsGLSL + /* glsl */ `
void main() {
	vec2 uv = gl_FragCoord.xy / uRes;
	float per = 5.0;
	float f = tfbm( uv * per, vec2( per ), 7 ) * 0.5 + 0.5;
	vec3 w = tvoronoi( uv * 6.0, vec2( 6.0 ) );
	vec3 w2 = tvoronoi( uv * 13.0, vec2( 13.0 ) );
	float worley = 1.0 - ( w.x * 0.65 + w2.x * 0.35 );
	float base = clamp( f * 0.7 + worley * 0.45 - 0.12, 0.0, 1.0 );
	float mid = tfbm( uv * 8.0 + 3.1, vec2( 8.0 ), 6 ) * 0.5 + 0.5;
	float fine = 1.0 - tvoronoi( uv * 24.0, vec2( 24.0 ) ).x;
	fine = fine * 0.6 + ( tfbm( uv * 32.0, vec2( 32.0 ), 3 ) * 0.5 + 0.5 ) * 0.4;
	gl_FragColor = vec4( base, mid, fine, caustic( uv ) );
}
`;

// Albedo (sRGB-encoded) in rgb, height in a. Period of 1 texture = the material's tile size.
const rockFrag = header + /* glsl */ `
void main() {
	vec2 uv = gl_FragCoord.xy / uRes;
	// layered strata, slightly folded
	float fold = tfbm( uv * 2.0, vec2( 2.0 ), 4 );
	float strata = tfbm( vec2( uv.x * 2.0, uv.y * 14.0 + fold * 2.0 ), vec2( 2.0, 14.0 ), 5 );
	float big = tfbm( uv * 4.0 + 1.3, vec2( 4.0 ), 6 );
	float grain = tgnoise( uv * 180.0, vec2( 180.0 ) ) * 0.5 + tgnoise( uv * 90.0 + 3.0, vec2( 90.0 ) ) * 0.5;
	vec3 cr = tvoronoi( uv * 5.0 + vec2( big * 0.4 ), vec2( 5.0 ) );
	float crack = 1.0 - smoothstep( 0.0, 0.035, cr.y - cr.x );
	vec3 cr2 = tvoronoi( uv * 17.0 + vec2( big ), vec2( 17.0 ) );
	float crack2 = 1.0 - smoothstep( 0.0, 0.03, cr2.y - cr2.x );
	float h = 0.55 + big * 0.35 + strata * 0.12 + grain * 0.04 - crack * 0.45 - crack2 * 0.15;
	// facet planes per cell give chunky, fractured faces
	h += ( cr.z - 0.5 ) * 0.2;

	vec3 grey = mix( vec3( 0.44, 0.43, 0.41 ), vec3( 0.62, 0.61, 0.58 ), smoothstep( -0.4, 0.5, big + strata * 0.4 ) );
	grey = mix( grey, vec3( 0.52, 0.47, 0.41 ), smoothstep( 0.2, 0.6, strata ) * 0.5 );
	grey *= 0.9 + grain * 0.12;
	// lichens: pale grey-green crusts and a few orange spots
	float lich = smoothstep( 0.62, 0.72, tfbm( uv * 9.0 + 5.0, vec2( 9.0 ), 5 ) * 0.5 + 0.5 );
	grey = mix( grey, vec3( 0.66, 0.68, 0.58 ), lich * 0.7 );
	float orange = smoothstep( 0.78, 0.84, tfbm( uv * 14.0 + 11.0, vec2( 14.0 ), 4 ) * 0.5 + 0.5 );
	grey = mix( grey, vec3( 0.78, 0.48, 0.16 ), orange * 0.8 );
	grey *= 1.0 - crack * 0.55 - crack2 * 0.25;
	gl_FragColor = vec4( grey, clamp( h, 0.0, 1.0 ) );
}
`;

// Beach stone field: overlapping rounded stones of several sizes lying in
// coarse grit (deliberately NOT a tessellation, so no mosaic look).
const stoneFieldGLSL = /* glsl */ `
// One layer of stones on a jittered grid; returns (height, stone id, rim darkness).
vec3 stoneLayer( vec2 uv, float cells, float seed, float fill ) {
	vec2 p = uv * cells;
	vec2 cell = floor( p );
	float best = 0.0, id = 0.0, rim = 1.0;
	for ( int j = -1; j <= 1; j ++ )
	for ( int i = -1; i <= 1; i ++ ) {
		vec2 c = cell + vec2( float( i ), float( j ) );
		vec2 cm = mod( c, vec2( cells ) );
		vec3 h = hash32( cm * 1.37 + seed );
		if ( h.z > fill ) continue;
		vec2 ctr = c + 0.15 + 0.7 * h.xy;
		float r = 0.38 + 0.42 * hash12( cm + seed + 3.1 );
		float ang = hash12( cm + seed + 7.7 ) * 6.2832;
		float asp = 0.55 + 0.45 * hash12( cm + seed + 5.3 );
		vec2 d = p - ctr;
		d = mat2( cos( ang ), -sin( ang ), sin( ang ), cos( ang ) ) * d;
		d.y /= asp;
		// slightly irregular outline
		float wob = 1.0 + 0.08 * sin( atan( d.y, d.x ) * 3.0 + h.x * 20.0 ) + 0.05 * sin( atan( d.y, d.x ) * 5.0 + h.y * 30.0 );
		float q = length( d ) / ( r * wob );
		if ( q < 1.0 ) {
			float flat_ = 0.35 + 0.65 * hash12( cm + seed + 9.1 );
			float hh = pow( 1.0 - q * q, 0.35 + flat_ * 0.4 ) * ( 0.55 + 0.45 * r ) + 0.02;
			if ( hh > best ) { best = hh; id = hash12( cm + seed + 11.3 ); rim = q; }
		}
	}
	return vec3( best, id, rim );
}
vec3 stoneColor( float id, vec2 uv ) {
	vec3 c = mix( vec3( 0.36, 0.35, 0.33 ), vec3( 0.62, 0.6, 0.56 ), fract( id * 3.7 ) );
	c = mix( c, vec3( 0.5, 0.4, 0.31 ), step( 0.72, fract( id * 7.13 ) ) * 0.8 );   // rusty
	c = mix( c, vec3( 0.8, 0.78, 0.74 ), step( 0.9, fract( id * 13.7 ) ) );         // quartz
	c = mix( c, vec3( 0.2, 0.21, 0.22 ), step( 0.84, fract( id * 3.31 ) ) * 0.85 );  // dark schist
	// granite speckle and faint banding
	float sp = tgnoise( uv * 520.0, vec2( 520.0 ) );
	c *= 0.86 + 0.2 * smoothstep( -0.2, 0.6, sp );
	return c;
}
`;

const pebbleFrag = header + stoneFieldGLSL + /* glsl */ `
void main() {
	vec2 uv = gl_FragCoord.xy / uRes;
	vec3 big = stoneLayer( uv, 7.0, 1.0, 0.55 );
	vec3 mid = stoneLayer( uv, 15.0, 2.0, 0.75 );
	vec3 sml = stoneLayer( uv, 34.0, 3.0, 0.85 );
	vec3 gra = stoneLayer( uv, 80.0, 4.0, 0.9 );
	// grit and sand in the gaps
	float g1 = tgnoise( uv * 260.0, vec2( 260.0 ) ) * 0.5 + 0.5;
	float g2 = tgnoise( uv * 90.0, vec2( 90.0 ) ) * 0.5 + 0.5;
	vec3 col = mix( vec3( 0.22, 0.2, 0.16 ), vec3( 0.42, 0.38, 0.31 ), g1 * 0.6 + g2 * 0.4 );
	float h = 0.05 + g1 * 0.05;
	float ao = 0.6;
	// composite from small to big, taller stones win
	vec3 layers[ 4 ];
	layers[ 0 ] = gra; layers[ 1 ] = sml; layers[ 2 ] = mid; layers[ 3 ] = big;
	float scales[ 4 ];
	scales[ 0 ] = 0.18; scales[ 1 ] = 0.4; scales[ 2 ] = 0.7; scales[ 3 ] = 1.0;
	for ( int k = 0; k < 4; k ++ ) {
		vec3 L = layers[ k ];
		float lh = L.x * scales[ k ];
		if ( L.x > 0.0 && lh > h ) {
			float edgeShade = smoothstep( 1.0, 0.7, L.z );
			col = stoneColor( L.y + float( k ) * 0.31, uv ) * ( 0.62 + 0.38 * edgeShade );
			// cast contact shadow of bigger stones onto what lies around them
			h = lh;
			ao = 0.55 + 0.45 * edgeShade;
		}
	}
	col *= ao + 0.3;
	gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), clamp( h, 0.0, 1.0 ) );
}
`;

// Meadow turf seen between and beyond the blades: short living and dead
// blades, moss, clover and fallen larch needles over dark humus.
const turfFrag = header + /* glsl */ `
float segDist( vec2 p, vec2 a, vec2 b, out float t ) {
	vec2 pa = p - a, ba = b - a;
	t = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );
	return length( pa - ba * t );
}
void main() {
	vec2 uv = gl_FragCoord.xy / uRes;
	float n = tfbm( uv * 5.0, vec2( 5.0 ), 5 );
	vec3 col = mix( vec3( 0.07, 0.06, 0.04 ), vec3( 0.14, 0.11, 0.07 ), smoothstep( -0.5, 0.5, n ) );
	float h = 0.1;
	// moss cushions
	float moss = smoothstep( 0.1, 0.45, tfbm( uv * 9.0 + 3.0, vec2( 9.0 ), 4 ) );
	col = mix( col, vec3( 0.16, 0.2, 0.06 ) * ( 0.8 + 0.4 * tgnoise( uv * 200.0, vec2( 200.0 ) ) ), moss * 0.7 );
	h += moss * 0.12;
	// layers of short blades lying in all directions
	for ( int k = 0; k < 5; k ++ ) {
		float sc = 36.0 + float( k ) * 13.0;
		vec2 p = uv * sc;
		vec2 cell = floor( p );
		for ( int j = -1; j <= 1; j ++ )
		for ( int i = -1; i <= 1; i ++ ) {
			vec2 c = cell + vec2( float( i ), float( j ) );
			vec2 cm = mod( c, vec2( sc ) );
			vec3 r = hash32( cm + float( k ) * 17.0 );
			for ( int b = 0; b < 2; b ++ ) {
				vec2 rb = hash22( cm + float( b ) * 7.3 + float( k ) );
				vec2 a = c + rb;
				float ang = ( r.x + float( b ) * 0.37 ) * 6.2832;
				float len = 0.7 + 1.0 * r.y;
				vec2 e = a + vec2( cos( ang ), sin( ang ) ) * len;
				float t;
				float d = segDist( p, a, e, t );
				float w = 0.075 * ( 1.0 - t * 0.8 );
				if ( d < w ) {
					float kind = fract( r.z * 7.0 + float( b ) * 0.5 );
					vec3 bc = kind < 0.45 ? vec3( 0.22, 0.3, 0.09 ) : ( kind < 0.75 ? vec3( 0.52, 0.44, 0.22 ) : ( kind < 0.9 ? vec3( 0.36, 0.25, 0.12 ) : vec3( 0.3, 0.34, 0.12 ) ) );
					bc *= 0.75 + 0.5 * t * r.z;
					float bh = 0.25 + float( k ) * 0.12 + t * 0.2;
					if ( bh > h ) { col = bc * ( 0.8 + 0.4 * ( 1.0 - d / w ) ); h = bh; }
				}
			}
		}
	}
	// three-lobed clover here and there
	vec3 cv = tvoronoi( uv * 30.0 + 1.3, vec2( 30.0 ) );
	if ( cv.z > 0.82 && cv.x < 0.28 ) { col = vec3( 0.14, 0.24, 0.07 ) * ( 0.8 + cv.x ); h = max( h, 0.6 ); }
	// fallen golden larch needles
	vec3 lv = tvoronoi( uv * 55.0 + 7.1, vec2( 55.0 ) );
	if ( lv.z > 0.93 && lv.y - lv.x < 0.05 ) { col = vec3( 0.72, 0.52, 0.18 ); h = max( h, 0.7 ); }
	gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), clamp( h, 0.0, 1.0 ) );
}
`;

// Forest floor & meadow soil: humus, fallen needles and autumn leaves.
const soilFrag = header + /* glsl */ `
void main() {
	vec2 uv = gl_FragCoord.xy / uRes;
	float n = tfbm( uv * 6.0, vec2( 6.0 ), 6 );
	vec3 col = mix( vec3( 0.19, 0.14, 0.10 ), vec3( 0.30, 0.23, 0.15 ), smoothstep( -0.5, 0.5, n ) );
	float h = 0.3 + n * 0.2;
	// needles: short random strokes
	for ( int k = 0; k < 3; k ++ ) {
		float sc = 60.0 + float( k ) * 23.0;
		vec2 p = uv * sc;
		vec2 cell = floor( p );
		vec2 f = fract( p ) - 0.5;
		vec2 hh = hash22( mod( cell, vec2( sc ) ) + float( k ) * 17.0 );
		float a = hh.x * 6.2831;
		vec2 dir = vec2( cos( a ), sin( a ) );
		float along = dot( f, dir );
		float across = dot( f, vec2( -dir.y, dir.x ) );
		float needle = ( 1.0 - smoothstep( 0.02, 0.05, abs( across ) ) ) * ( 1.0 - smoothstep( 0.3, 0.45, abs( along ) ) );
		needle *= step( 0.35, hh.y );
		col = mix( col, mix( vec3( 0.42, 0.28, 0.14 ), vec3( 0.55, 0.40, 0.2 ), hh.y ), needle * 0.8 );
		h += needle * 0.12;
	}
	// fallen leaves: rounded cells in autumn colours
	vec3 lv = tvoronoi( uv * 22.0 + n * 0.3, vec2( 22.0 ) );
	float leaf = 1.0 - smoothstep( 0.18, 0.3, lv.x );
	leaf *= step( 0.55, fract( lv.z * 5.3 ) );
	vec3 lc = mix( vec3( 0.75, 0.52, 0.12 ), vec3( 0.62, 0.25, 0.08 ), fract( lv.z * 11.7 ) );
	lc = mix( lc, vec3( 0.40, 0.28, 0.12 ), step( 0.7, fract( lv.z * 3.1 ) ) );
	col = mix( col, lc, leaf * 0.9 );
	h += leaf * 0.15;
	// small stones
	vec3 st = tvoronoi( uv * 40.0 + 2.0, vec2( 40.0 ) );
	float stone = ( 1.0 - smoothstep( 0.12, 0.2, st.x ) ) * step( 0.9, st.z );
	col = mix( col, vec3( 0.45, 0.44, 0.42 ), stone );
	h += stone * 0.2;
	gl_FragColor = vec4( col, clamp( h, 0.0, 1.0 ) );
}
`;

// Tileable wave normals for water: (normal.xz * 0.5 + 0.5, height).
const waterNormalFrag = header + /* glsl */ `
float waves( vec2 uv ) {
	float h = 0.0;
	h += tfbm( uv * 4.0, vec2( 4.0 ), 6 ) * 0.7;
	h += ( 1.0 - abs( tgnoise( uv * 10.0 + 1.7, vec2( 10.0 ) ) ) ) * 0.25;
	return h;
}
void main() {
	vec2 uv = gl_FragCoord.xy / uRes;
	float e = 1.0 / uRes.x;
	float hx = waves( uv + vec2( e, 0.0 ) ) - waves( uv - vec2( e, 0.0 ) );
	float hz = waves( uv + vec2( 0.0, e ) ) - waves( uv - vec2( 0.0, e ) );
	vec3 n = normalize( vec3( -hx * 18.0, 1.0, -hz * 18.0 ) );
	gl_FragColor = vec4( n.x * 0.5 + 0.5, n.z * 0.5 + 0.5, waves( uv ), 1.0 );
}
`;

// Height (alpha) -> tangent-space normal (rg), keeping albedo textures separate.
const normalFromHeightFrag = /* glsl */ `
uniform sampler2DArray uSrc;
uniform float uLayer;
uniform vec2 uRes;
uniform float uStrength;
float H( vec2 uv ) { return textureLod( uSrc, vec3( fract( uv ), uLayer ), 0.0 ).a; }
void main() {
	vec2 uv = gl_FragCoord.xy / uRes;
	vec2 e = 1.0 / uRes;
	float l = H( uv - vec2( e.x, 0.0 ) );
	float r = H( uv + vec2( e.x, 0.0 ) );
	float d = H( uv - vec2( 0.0, e.y ) );
	float u = H( uv + vec2( 0.0, e.y ) );
	vec3 n = normalize( vec3( ( l - r ) * uStrength, ( d - u ) * uStrength, 1.0 ) );
	gl_FragColor = vec4( n.xy * 0.5 + 0.5, n.z, 1.0 );
}
`;

export class TextureBank {

	constructor( renderer ) {

		this.renderer = renderer;
		this.maxAniso = Math.min( 8, renderer.capabilities.getMaxAnisotropy() );

	}

	_bake( frag, size, opts = {} ) {

		const rt = makeTarget( size, size, {
			type: opts.type ?? THREE.UnsignedByteType,
			wrap: THREE.RepeatWrapping,
			mipmaps: opts.mipmaps ?? true,
			minFilter: ( opts.mipmaps ?? true ) ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
			anisotropy: opts.aniso ? this.maxAniso : 1,
		} );
		const pass = new FullscreenPass( passMaterial( frag, { uRes: { value: new THREE.Vector2( size, size ) }, ...( opts.uniforms || {} ) } ) );
		pass.render( this.renderer, rt );
		pass.dispose();
		return rt.texture;

	}

	_arrayTarget( size, layers ) {

		const rt = new THREE.WebGLArrayRenderTarget( size, size, layers, {
			type: THREE.UnsignedByteType,
			format: THREE.RGBAFormat,
			wrapS: THREE.RepeatWrapping,
			wrapT: THREE.RepeatWrapping,
			minFilter: THREE.LinearMipmapLinearFilter,
			magFilter: THREE.LinearFilter,
			generateMipmaps: true,
			depthBuffer: false,
			anisotropy: this.maxAniso,
		} );
		rt.texture.anisotropy = this.maxAniso;
		return rt;

	}

	// Material stacks as texture arrays (keeps the terrain under 16 sampler units).
	// Layers: 0 rock, 1 beach stones, 2 soil, 3 meadow turf. Albedo+height in one array, normals in another.
	_bakeMaterials( size ) {

		const layers = [ [ rockFrag, 9.0 ], [ pebbleFrag, 16.0 ], [ soilFrag, 7.0 ], [ turfFrag, 6.0 ] ];
		const alb = this._arrayTarget( size, layers.length );
		const nrm = this._arrayTarget( size, layers.length );
		const res = new THREE.Vector2( size, size );
		layers.forEach( ( [ frag ], i ) => {

			const pass = new FullscreenPass( passMaterial( frag, { uRes: { value: res } } ) );
			pass.render( this.renderer, alb, null, i );
			pass.dispose();

		} );
		layers.forEach( ( [ , strength ], i ) => {

			const pass = new FullscreenPass( passMaterial( normalFromHeightFrag, {
				uSrc: { value: alb.texture }, uLayer: { value: i }, uRes: { value: res }, uStrength: { value: strength },
			} ) );
			pass.render( this.renderer, nrm, null, i );
			pass.dispose();

		} );
		this.matAlbedo = alb.texture;
		this.matNormal = nrm.texture;

	}

	build() {

		this.noise = this._bake( noiseFrag, 512, { mipmaps: true } );
		this._bakeMaterials( 1024 );
		this.waterN = this._bake( waterNormalFrag, 512, { aniso: true } );
		return this;

	}

}
