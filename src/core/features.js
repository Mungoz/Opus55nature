import * as THREE from 'three';

// Hand-placed landscape features shared by the terrain generator (as GLSL
// constants/uniforms) and by the meshes that sit on them.

// A hanging-valley step on the west wall of the lower valley, with a waterfall.
// base: foot of the cliff; out: unit vector from the cliff face into the valley.
export const FALL = {
	base: new THREE.Vector2( - 190, 790 ),
	out: new THREE.Vector2( 0.967, - 0.257 ).normalize(),
	height: 92,
	width: 135, // half-length of the rock step along the wall
};

// The stream from the plunge pool, meandering across the meadow into the lake.
const RIVER_CTRL = [
	[ - 181, 788 ], [ - 142, 774 ], [ - 104, 764 ], [ - 64, 748 ], [ - 22, 728 ], [ 16, 700 ], [ 52, 668 ],
	[ 78, 624 ], [ 70, 580 ], [ 84, 540 ], [ 74, 503 ], [ 58, 468 ], [ 48, 438 ],
].map( ( [ x, z ] ) => new THREE.Vector3( x, 0, z ) );

export const RIVER_SAMPLES = 160;
export const RIVER_CHUNK = 8; // segments per bounding box in the shader's coarse pass

// smooth 1D value noise (quintic), deterministic
const hash1 = ( i ) => {

	const x = Math.sin( i * 127.1 + 311.7 ) * 43758.5453;
	return x - Math.floor( x );

};

function vnoise01( x ) {

	const i = Math.floor( x ), f = x - i;
	const u = f * f * f * ( f * ( f * 6 - 15 ) + 10 );
	return hash1( i ) + ( hash1( i + 1 ) - hash1( i ) ) * u;

}

const vnoise = ( x ) => vnoise01( x ) * 2 - 1;

// Evenly spaced samples along the stream: { p: Vector2, width (half-width, m), s (m from source) }.
// Below the tumbling reach under the fall the stream meanders across the flat meadow.
export function riverSamples() {

	const curve = new THREE.CatmullRomCurve3( RIVER_CTRL, false, 'centripetal', 0.5 );
	const len = curve.getLength();
	const N = RIVER_SAMPLES * 4;
	const pts = [];
	for ( let i = 0; i < N; i ++ ) {

		const u = i / ( N - 1 );
		const s = u * len;
		const p = curve.getPointAt( u ), t = curve.getTangentAt( u );
		// irregular meanders: bends of every size from smooth noise, with tight loops,
		// lazy sweeps and nearly straight reaches where the amplitude dies away
		const reach = 0.2 + 0.8 * Math.pow( vnoise01( s / 150 + 11.3 ), 1.4 );
		const A = 13 * reach * THREE.MathUtils.smoothstep( s, 110, 240 ) * ( 1 - 0.6 * THREE.MathUtils.smoothstep( s, len - 90, len - 10 ) );
		const off = A * ( 0.8 * vnoise( s / 34 + 2.7 ) + 0.35 * vnoise( s / 15 + 8.1 ) ) + 1.2 * vnoise( s / 7 + 4.4 );
		pts.push( new THREE.Vector3( p.x - t.z * off, 0, p.z + t.x * off ) );

	}

	// resample the meandering line evenly
	const path = new THREE.CatmullRomCurve3( pts, false, 'centripetal', 0.5 );
	const plen = path.getLength();
	const out = [];
	for ( let i = 0; i < RIVER_SAMPLES; i ++ ) {

		const u = i / ( RIVER_SAMPLES - 1 );
		const p = path.getPointAt( u );
		// over its last stretch the stream spreads into a shallow fan and opens into the lake
		const flare = 1 + 2.2 * THREE.MathUtils.smoothstep( u, 0.86, 1.0 );
		out.push( { p: new THREE.Vector2( p.x, p.z ), width: THREE.MathUtils.lerp( 2.1, 4.4, Math.pow( u, 0.8 ) ) * flare, s: u * plen } );

	}

	return out;

}

// Small ponds: centre, nominal radius. The outline is lobed and warped (pondShape in GLSL);
// surface heights are measured from the terrain at load.
export const PONDS = [
	{ c: new THREE.Vector2( - 58, 540 ), r: 15 },
	{ c: new THREE.Vector2( - 110, 682 ), r: 18 },
	{ c: new THREE.Vector2( 106, 716 ), r: 20 },
	// the plunge pool the waterfall has scoured out of the foot of its cliff; the stream
	// flows out of it (its level is the stream's, set when the water is measured)
	{ c: FALL.base.clone().addScaledVector( FALL.out, 15 ), r: 17, plunge: true },
];
export const PLUNGE = 3; // index of the plunge pool among the ponds

// GLSL: shared constants + the carving functions. Uniforms are filled by the generator.
export const featuresGLSL = /* glsl */ `
#define RIVER_N ${RIVER_SAMPLES}
// the stream as a float texture (a texture, not a uniform array, so it fits the uniform
// limits of mobile GPUs): row 0 = x, z, surface height, half-width; row 1 = signed
// curvature of the channel (1/m, + turning left); row 2 = padded bounds of each chunk
// of RIVER_CHUNK segments
#define RIVER_CHUNK 8
uniform highp sampler2D uRiverTex;
uniform vec4 uRiverBox;           // bounds of the stream (min x, min z, max x, max z), padded
uniform vec4 uPonds[ 4 ];         // x, z, radius, surface height (3: the plunge pool)
uniform float uFeatures;          // 0 during the pre-pass that measures the natural ground
const vec2 FALL_BASE = vec2( ${FALL.base.x.toFixed( 3 )}, ${FALL.base.y.toFixed( 3 )} );
const vec2 FALL_OUT = vec2( ${FALL.out.x.toFixed( 5 )}, ${FALL.out.y.toFixed( 5 )} );
const float FALL_H = ${FALL.height.toFixed( 1 )};
const float FALL_W = ${FALL.width.toFixed( 1 )};

// (distance to the stream centreline, surface height there, half-width there);
// bend > 0 on the inside of a bend, < 0 on the outside (1/m)
vec3 riverQueryB( vec2 p, out float bend ) {
	float best = 1e9, surf = 0.0, w = 0.0;
	bend = 0.0;
	if ( any( lessThan( p, uRiverBox.xy ) ) || any( greaterThan( p, uRiverBox.zw ) ) ) return vec3( 1e9, 0.0, 0.0 );
	for ( int c = 0; c < ( RIVER_N + RIVER_CHUNK - 2 ) / RIVER_CHUNK; c ++ ) {
	vec4 bb = texelFetch( uRiverTex, ivec2( c, 2 ), 0 );
	if ( any( lessThan( p, bb.xy ) ) || any( greaterThan( p, bb.zw ) ) ) continue;
	int i0 = c * RIVER_CHUNK, i1 = min( i0 + RIVER_CHUNK, RIVER_N - 1 );
	vec4 b = texelFetch( uRiverTex, ivec2( i0, 0 ), 0 );
	for ( int i = i0; i < i1; i ++ ) {
		vec4 a = b;
		b = texelFetch( uRiverTex, ivec2( i + 1, 0 ), 0 );
		vec2 pa = p - a.xy, ba = b.xy - a.xy;
		float t = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );
		float d = length( pa - ba * t );
		if ( d < best ) {
			best = d; surf = mix( a.z, b.z, t ); w = mix( a.w, b.w, t );
			float side = sign( ba.x * pa.y - ba.y * pa.x );
			bend = side * mix( texelFetch( uRiverTex, ivec2( i, 1 ), 0 ).r, texelFetch( uRiverTex, ivec2( i + 1, 1 ), 0 ).r, t );
		}
	}
	}
	return vec3( best, surf, w );
}
vec3 riverQuery( vec2 p ) { float b; return riverQueryB( p, b ); }

// Normalised distance from a pond's centre: 1 on its shoreline. The outline has lobes,
// bays and a warp so no two ponds share a shape.
float pondShape( vec2 p, vec4 pd, float i ) {
	vec2 q = p - pd.xy;
	q += pd.z * 0.18 * vec2( gnoise( q / pd.z * 0.8 + i * 7.3 ), gnoise( q / pd.z * 0.8 + i * 7.3 + 3.1 ) );
	float a = atan( q.y, q.x );
	float lobes = 0.2 * sin( 2.0 * a + i * 1.7 ) + 0.13 * sin( 3.0 * a + i * 2.9 ) + 0.07 * sin( 5.0 * a + i * 4.3 ) + 0.04 * sin( 8.0 * a + i );
	return length( q ) / ( pd.z * ( 1.0 + lobes ) );
}

// The rock step with the waterfall, applied to natural ground h.
float applyFallStep( vec2 p, float h ) {
	vec2 wv = p - FALL_BASE;
	float along = dot( wv, vec2( -FALL_OUT.y, FALL_OUT.x ) );
	// buttresses, ribs and gullies push the face in and out along its length
	float buttress = 7.0 * gnoise( vec2( along * 0.035, 1.3 ) );
	float rib = 1.0 - abs( gnoise( vec2( along * 0.075, 2.2 ) ) );
	float rib2 = 1.0 - abs( gnoise( vec2( along * 0.21, 5.3 ) ) );
	float behind = -dot( wv, FALL_OUT ) + buttress + 4.5 * rib * rib + 1.6 * rib2 - 3.0 + 1.5 * gnoise( p * 0.13 );
	float span = 1.0 - smoothstep( FALL_W * 0.55, FALL_W, abs( along ) + 25.0 * gnoise( p * 0.01 ) );
	// the wall climbs in jointed tiers with ledges between them
	float hv = FALL_H * ( 0.9 + 0.2 * gnoise( vec2( along * 0.02, 7.0 ) ) );
	float j = 1.2 * gnoise( vec2( along * 0.09, 11.0 ) );
	float tiers = 0.26 * smoothstep( -5.0, 0.5, behind )
		+ 0.22 * smoothstep( 5.5 + j, 9.5 + j, behind )
		+ 0.2 * smoothstep( 13.5 - j, 17.0 - j, behind )
		+ 0.17 * smoothstep( 21.0 + j, 24.5 + j, behind )
		+ 0.15 * smoothstep( 28.5, 32.0, behind );
	// where the stream goes over, the ice cut one sheer face (Staubbach-like)
	float sheer = 1.0 - smoothstep( 14.0, 32.0, abs( along ) + 7.0 * gnoise( vec2( along * 0.05, 3.0 ) ) );
	float single = smoothstep( -3.0, 3.0, behind + 1.5 * gnoise( vec2( along * 0.2, 9.0 ) ) );
	tiers = mix( tiers, single, sheer );
	// broken blocks and a scree apron at the foot
	tiers += 0.03 * gnoise( p * 0.09 ) * smoothstep( -4.0, 2.0, behind );
	tiers += 0.05 * smoothstep( -16.0, -4.0, behind ) * ( 1.0 - smoothstep( -4.0, 0.0, behind ) );
	float step_ = hv * tiers * ( 1.0 - smoothstep( 380.0, 700.0, behind ) );
	// a notch in the lip where the stream pours over
	float lipB = mix( 30.0, 3.0, sheer );
	step_ -= 6.0 * exp( -along * along / 60.0 ) * smoothstep( lipB - 4.0, lipB + 4.0, behind ) * ( 1.0 - smoothstep( 60.0, 160.0, behind ) );
	return h + step_ * span;
}

float applyWater( vec2 p, float h ) {
	if ( uFeatures < 0.5 ) return h;
	// stream channel with soft banks
	float bend;
	vec3 rq = riverQueryB( p, bend );
	float d = rq.x, surf = rq.y, w = rq.z;
	if ( d < w + 12.0 ) {
		// the current undercuts the outside of each bend into a steep earth bank and
		// drops gravel on the inside as a low bar
		float outer = smoothstep( 0.006, 0.035, - bend ), inner = smoothstep( 0.006, 0.035, bend );
		float depth = ( 0.4 + w * 0.1 ) * ( 1.0 + 0.45 * outer - 0.3 * inner );
		float bed = surf - depth * ( 1.0 - pow( clamp( d / w, 0.0, 1.0 ), mix( 2.2, 5.0, outer ) ) ) - 0.05;
		float lip = ( 0.55 + 0.35 * gnoise( p * 0.045 ) ) * ( 1.0 - 0.75 * inner ) + outer * ( 0.5 + 0.45 * gnoise( p * 0.07 + 2.0 ) );
		float rise = mix( mix( 1.6, 4.5, inner ), 0.35, outer );
		// toward the mouth the banks sink to water level, so the stream opens into the lake
		lip *= smoothstep( 0.03, 0.5, surf );
		float bank = surf + 0.08 + lip * smoothstep( 0.0, rise, d - w ) + max( d - w - rise, 0.0 ) * 0.04;
		float carved = d < w ? min( bed, h ) : mix( bank, max( h, bank - 0.3 ), smoothstep( w + rise, w + 12.0, d ) );
		// never build banks up out of the lake: where the ground already lies under the
		// water, only the channel is cut
		h = mix( min( h, carved ), carved, smoothstep( surf - 0.7, surf + 0.05, h ) );
	}
	// ponds: an uneven bed - shelving shallows, a deeper hole off-centre - inside a low
	// turf rim that undercuts in places
	for ( int i = 0; i < 4; i ++ ) {
		vec4 pd = uPonds[ i ];
		if ( length( p - pd.xy ) > pd.z * 2.2 + 18.0 ) continue;
		float fi = float( i );
		float rn = pondShape( p, pd, fi );
		float over = ( rn - 1.0 ) * pd.z; // metres beyond the shoreline (approx.)
		if ( over < 16.0 ) {
			// the plunge pool is deepest right under the fall, where the water lands
			float plunge = i == 3 ? 1.0 : 0.0;
			vec2 hole = pd.xy + mix( pd.z * 0.35 * vec2( cos( fi * 2.4 + 1.0 ), sin( fi * 2.4 + 1.0 ) ), - FALL_OUT * pd.z * 0.3, plunge );
			float deep = ( 0.55 + pd.z * 0.07 ) * ( 1.0 + plunge * 1.3 );
			deep *= 0.55 + 0.75 * exp( - dot( p - hole, p - hole ) / ( pd.z * pd.z * 0.25 ) );
			deep *= 0.8 + 0.35 * gnoise( p * 0.09 + fi * 5.0 );
			float bed = pd.w - deep * ( 1.0 - pow( clamp( rn, 0.0, 1.0 ), mix( 1.3, 3.5, 0.5 + 0.5 * gnoise( p * 0.05 + fi ) ) ) ) - 0.06;
			bed += 0.05 * gnoise( p * 0.6 + fi * 3.0 );
			float lip = 0.12 + 0.3 * ( 0.5 + 0.5 * gnoise( p * 0.12 + fi * 9.0 ) );
			float rim = pd.w + 0.06 + lip * smoothstep( 0.0, 1.2, over ) + max( over - 1.2, 0.0 ) * 0.03;
			float carved = rn < 1.0 ? bed : mix( rim, max( h, rim - 0.2 ), smoothstep( 1.2, 16.0, over ) );
			// the plunge pool's rim opens where the stream leaves it: there the stream's own
			// channel (already cut into h) is kept, and the pool deepens into it
			if ( i == 3 ) {
				float bend;
				vec3 rq = riverQueryB( p, bend );
				float gap = 1.0 - smoothstep( rq.z + 0.5, rq.z + 5.0, rq.x );
				carved = mix( carved, min( carved, h ), gap );
			}
			h = carved;
		}
	}
	return h;
}

float pondWater( vec2 p ) {
	float m = 0.0;
	for ( int i = 0; i < 4; i ++ ) {
		vec4 pd = uPonds[ i ];
		if ( length( p - pd.xy ) > pd.z * 2.2 ) continue;
		float over = ( pondShape( p, pd, float( i ) ) - 1.0 ) * pd.z;
		m = max( m, 1.0 - smoothstep( - 1.5, 0.3, over ) );
	}
	return m;
}

// 0 outside, 1 on open water (streams and ponds) - for the biome masks
float surfaceWater( vec2 p ) {
	float m = 0.0;
	float bend;
	vec3 rq = riverQueryB( p, bend );
	// the bed, plus gravel bars on the inside of bends
	float bar = 0.3 + 0.8 * smoothstep( 0.1, 0.6, gnoise( p * 0.03 + 3.0 ) ) + 3.2 * smoothstep( 0.006, 0.035, bend );
	m = max( m, 1.0 - smoothstep( rq.z - 0.2, rq.z + bar, rq.x ) );
	return m;
}
`;
