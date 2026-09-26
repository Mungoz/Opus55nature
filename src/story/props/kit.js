import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { commonParsGLSL } from '../../shaders/common.glsl.js';
import { sharedUniforms } from '../../core/uniforms.js';

// The story's props (the hut, the jetty and boats, the bridge, the signpost...) are built from
// primitives into one merged geometry each, every vertex tagged with a surface kind; one
// procedural shader (below) draws them all with the game's shared lighting: weathered wood
// with its grain, end grain, bark, rubble masonry, stones, shingles, iron, rope, painted and
// tarred planks, trampled earth.


// surface kinds
export const M = { LOG: 0, RUBBLE: 1, SHINGLE: 2, PLANK: 3, IRON: 4, VOID: 5, BARK: 6, END: 7, BRONZE: 8, LEATHER: 9, STONE: 10, FLAG: 11, DIRT: 12, BOARD: 13, GLOW: 14, PAINT: 15, ROPE: 16, HULL: 17, HULLIN: 18, DECK: 19 };

const vert = /* glsl */ `
attribute vec3 color;
attribute float aMat;
attribute vec3 aAxis;
attribute vec3 aCenter;
attribute float aAO;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vObj;
varying vec3 vObjN;
varying vec3 vColor;
varying vec3 vAxis;
varying vec3 vCenter;
varying float vMat;
varying float vAO;
void main() {
	vec4 wp = modelMatrix * vec4( position, 1.0 );
	vWorldPos = wp.xyz;
	vNormal = normalize( mat3( modelMatrix ) * normal );
	vObj = position;
	vObjN = normal;
	vColor = color;
	vAxis = aAxis;
	vCenter = aCenter;
	vMat = aMat;
	vAO = aAO;
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const frag = /* glsl */ `
${commonParsGLSL}
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vObj;
varying vec3 vObjN;
varying vec3 vColor;
varying vec3 vAxis;
varying vec3 vCenter;
varying float vMat;
varying float vAO;
uniform vec4 uLamp;

// bump mapping without tangents (Mikkelsen): tilt N by the screen-space slope of a height
vec3 bump( vec3 N, float h, float k ) {
	vec3 dpx = dFdx( vWorldPos ), dpy = dFdy( vWorldPos );
	float hx = dFdx( h ), hy = dFdy( h );
	vec3 r1 = cross( dpy, N ), r2 = cross( N, dpx );
	float det = dot( dpx, r1 );
	vec3 g = sign( det ) * ( hx * r1 + hy * r2 );
	return normalize( abs( det ) * N - g * k );
}

// weathered wood along a grain axis: long streaks, finer fibres, drying checks, a knot or two
vec4 wood( vec3 p, vec3 ax, float fine ) {
	float along = dot( p, ax );
	vec3 q = p - ax * along;
	vec2 c = vec2( q.x + q.z * 0.8 + q.y * 0.6, q.y - q.x * 0.5 + q.z * 0.3 );
	float s1 = gnoise3( vec3( along * 0.7, c * 30.0 ) );
	float s2 = gnoise3( vec3( along * 2.2, c * 110.0 * fine ) );
	float fib = gnoise3( vec3( along * 9.0, c * 380.0 * fine ) );
	float ck = abs( gnoise3( vec3( along * 0.28, c * 13.0 ) ) );
	float check = ( 1.0 - smoothstep( 0.0, 0.035, ck ) ) * smoothstep( 0.2, 0.6, gnoise3( vec3( along * 0.5, c * 4.0 ) ) + 0.5 );
	// knots: small dark ovals stretched along the grain
	vec3 kq = vec3( along * 1.6, c * 9.0 );
	float kn = smoothstep( 0.8, 0.93, gnoise3( kq + 11.0 ) );
	float tone = 0.87 + 0.13 * s1 + 0.07 * s2 + 0.04 * fib + 0.08 * gnoise3( vec3( along * 0.15, c * 2.0 ) );
	return vec4( tone, check, kn, s2 * 0.5 + fib * 0.5 );
}

// rubble masonry: stones of mixed size in rough courses, earth and small stones in the joints;
// returns ( stone mask, stone id, height )
vec3 rubble( vec2 uv ) {
	uv += 0.3 * vec2( gnoise( uv * 0.6 ), gnoise( uv * 0.6 + 3.1 ) );
	vec3 big = voronoi( uv * vec2( 0.85, 1.7 ) );
	float e = big.y - big.x;
	float jw = 0.03 + 0.06 * ( 0.5 + 0.5 * gnoise( uv * 1.3 + 9.0 ) );
	float m = smoothstep( jw * 0.5, jw + 0.06, e );
	float h = sqrt( saturate( e * 3.2 ) ) * m;
	vec3 sm = voronoi( uv * 3.4 + 7.0 );
	float es = sm.y - sm.x;
	float ms = smoothstep( 0.03, 0.14, es ) * ( 1.0 - m ) * step( 0.35, hash12( floor( uv * 3.4 + 7.0 ) ) );
	return vec3( max( m, ms ), m > 0.5 ? big.z : sm.z + 0.37, max( h, sqrt( saturate( es * 2.5 ) ) * ms * 0.6 ) );
}

void main() {
	vec3 N = normalize( vNormal );
	if ( ! gl_FrontFacing ) N = - N;
	vec3 V = normalize( cameraPosition - vWorldPos );
	vec3 p = vObj;
	vec3 n0 = normalize( vObjN );
	vec3 alb = vColor;
	float ao = vAO, rough = 0.85, f0 = 0.03;
	int m = int( vMat + 0.5 );
	vec3 ax = length( vAxis ) > 0.01 ? normalize( vAxis ) : vec3( 1.0, 0.0, 0.0 );
	float up = saturate( n0.y );
	float mirror = 0.0;

	if ( m == 0 || m == 3 || m == 6 || m == 13 ) {
		bool endGrain = abs( dot( n0, ax ) ) > 0.8;
		if ( endGrain ) {
			// a log's end: growth rings round the pith, radial checks, darker where the rain sits
			vec3 d3 = p - vCenter;
			vec3 d = d3 - ax * dot( d3, ax );
			float r = length( d );
			float rings = fract( r * 26.0 + gnoise( d.xy * 9.0 + d.z * 9.0 ) * 0.5 );
			alb *= 0.72 + 0.28 * smoothstep( 0.2, 0.8, rings );
			vec3 e1 = normalize( cross( ax, abs( ax.y ) < 0.9 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 ) ) );
			float ang = atan( dot( d, cross( ax, e1 ) ), dot( d, e1 ) );
			alb *= 1.0 - 0.6 * smoothstep( 0.95, 1.0, abs( sin( ang * 2.5 + hash12( vCenter.xz ) * 9.0 ) ) ) * smoothstep( 0.02, 0.05, r );
			alb *= 0.7;
			N = bump( N, rings * 0.002, 1.0 );
		} else {
			vec4 w = wood( p, ax, m == 13 || m == 3 ? 1.5 : 1.0 );
			alb *= w.x;
			alb *= 1.0 - 0.45 * w.y;
			alb = mix( alb, vec3( 0.09, 0.065, 0.045 ), w.z * 0.55 );
			ao *= 1.0 - 0.35 * w.y;
			float h = w.w * 0.0015 - w.y * 0.004;
			if ( m == 3 || m == 13 ) {
				// boards: a dark gap every ~17 cm across the grain
				float along = dot( p, ax );
				vec3 q = p - ax * along;
				float s = ( abs( ax.y ) > 0.5 ? q.x + q.z : q.y + q.x * 0.001 ) / 0.17;
				float seam = smoothstep( 0.04, 0.0, abs( fract( s ) - 0.5 ) - 0.46 );
				alb *= ( 1.0 - 0.8 * seam ) * ( 0.85 + 0.3 * hash11( floor( s ) + 3.0 ) );
				h -= seam * 0.004;
			}
			if ( m == 6 ) {
				// bark: furrowed, dark, grey on its ridges
				float along = dot( p, ax );
				vec3 q = p - ax * along;
				float f = gnoise3( vec3( along * 3.0, ( q.x + q.y + q.z ) * 60.0, 0.0 ) );
				alb *= 0.7 + 0.45 * smoothstep( -0.2, 0.5, f );
				h += f * 0.004;
			}
			// rain greys the wood where it reaches; sheltered wood stays brown
			alb = mix( alb, vec3( luma( alb ) ) * vec3( 1.0, 0.98, 0.94 ) * 1.25, 0.25 * up );
			N = bump( N, h, 1.0 );
		}
		rough = 0.8;
	} else if ( m == 1 || m == 11 ) {
		// rubble walls and flagstones
		vec3 an = abs( n0 );
		vec2 uv = an.y > 0.6 ? p.xz * ( m == 11 ? 1.6 : 2.6 ) : ( an.x > an.z ? p.zy : p.xy ) * vec2( 2.5, 2.9 );
		vec3 r = rubble( uv );
		float id = r.y;
		vec3 stone = vColor * ( 0.65 + 0.6 * hash11( id * 17.0 ) );
		float hue = hash11( id * 5.0 );
		stone *= mix( vec3( 1.06, 1.0, 0.9 ), vec3( 0.92, 0.97, 1.04 ), hue );
		stone = mix( stone, vec3( 0.36, 0.27, 0.17 ), step( 0.8, hue ) * 0.4 );
		stone *= 0.85 + 0.25 * gnoise3( p * 7.0 + id * 3.0 ) + 0.14 * gnoise3( p * 38.0 + id );
		vec3 joint = m == 11 ? vec3( 0.13, 0.11, 0.08 ) : vec3( 0.19, 0.17, 0.14 );
		alb = mix( joint * ( 0.8 + 0.4 * gnoise3( p * 20.0 ) ), stone, r.x );
		// lichen: grey-green rosettes and a few bright yellow spots on the faces that catch rain
		float lich = smoothstep( 0.35, 0.75, gnoise3( p * 4.0 + id * 7.0 ) );
		alb = mix( alb, vec3( 0.52, 0.53, 0.44 ), lich * 0.4 * r.x );
		float yel = smoothstep( 0.72, 0.85, gnoise3( p * 13.0 + 5.0 ) ) * r.x;
		alb = mix( alb, vec3( 0.55, 0.45, 0.12 ), yel * 0.4 );
		if ( m == 11 ) alb = mix( alb, vec3( 0.12, 0.16, 0.06 ), ( 1.0 - r.x ) * 0.5 * smoothstep( 0.0, 0.6, gnoise3( p * 3.0 ) ) );
		// each stone's face darkens toward its lower edge, stained where water runs off
		alb *= 0.85 + 0.25 * r.z;
		ao *= mix( 0.4, 1.0, r.x );
		N = bump( N, r.z * 0.045, 1.0 );
		rough = 0.9;
	} else if ( m == 10 ) {
		// loose stones and boulders: grainy, a little lichen
		float g = gnoise3( p * 9.0 ) * 0.6 + gnoise3( p * 37.0 ) * 0.4;
		alb *= 0.78 + 0.4 * g;
		alb *= 0.9 + 0.2 * gnoise3( vCenter * 5.0 + 1.0 );
		float lich = smoothstep( 0.3, 0.75, gnoise3( p * 5.0 + vCenter * 3.0 ) ) * saturate( n0.y + 0.3 );
		alb = mix( alb, vec3( 0.5, 0.52, 0.42 ), lich * 0.5 );
		N = bump( N, g * 0.012, 1.0 );
		rough = 0.9;
	} else if ( m == 2 ) {
		// a shingle: split larch, silvered, its grain along the slope, darker at the lower end
		// where the next one down lies in its shadow
		vec4 w = wood( p, ax, 0.55 );
		alb *= w.x * ( 1.0 - 0.35 * w.y );
		alb *= 0.9 + 0.2 * gnoise3( vCenter * 3.0 );
		float lichen = smoothstep( 0.5, 0.8, gnoise3( p * 2.5 + vCenter * 5.0 ) );
		alb = mix( alb, vec3( 0.36, 0.4, 0.2 ), lichen * 0.35 );
		N = bump( N, w.w * 0.002 - w.y * 0.002, 1.0 );
		rough = 0.8;
	} else if ( m == 12 ) {
		// trampled earth: mud, grit and small stones, grass creeping in at the edges
		float g = gnoise3( p * 3.0 ) * 0.5 + gnoise3( p * 17.0 ) * 0.3 + gnoise3( p * 70.0 ) * 0.2;
		vec3 vo = voronoi( p.xz * 14.0 );
		float peb = smoothstep( 0.1, 0.25, vo.y - vo.x ) * step( 0.6, vo.z );
		alb *= 0.8 + 0.35 * g;
		alb = mix( alb, vec3( 0.24, 0.23, 0.2 ), peb * 0.5 );
		alb = mix( alb, vec3( 0.14, 0.18, 0.06 ), smoothstep( 0.55, 0.95, vAO ) * smoothstep( 0.0, 0.6, gnoise3( p * 2.0 + 4.0 ) ) * 0.6 );
		N = bump( N, g * 0.01 + peb * 0.01, 1.0 );
		ao = 1.0;
		rough = 0.95;
	} else if ( m == 4 ) {
		alb *= 0.8 + 0.4 * gnoise3( p * 30.0 );
		alb = mix( alb, vec3( 0.3, 0.13, 0.05 ), smoothstep( 0.0, 0.6, gnoise3( p * 12.0 ) ) * 0.6 );
		rough = 0.65; f0 = 0.15;
	} else if ( m == 8 ) {
		alb *= 0.6 + 0.5 * gnoise3( p * 25.0 );
		alb = mix( alb, vec3( 0.12, 0.2, 0.15 ), smoothstep( 0.2, 0.7, gnoise3( p * 9.0 ) ) * 0.4 );
		rough = 0.45; f0 = 0.4;
	} else if ( m == 9 ) {
		alb *= 0.8 + 0.3 * gnoise3( p * 40.0 );
		rough = 0.6;
	} else if ( m == 5 ) {
		alb = vec3( 0.004 );
		rough = 1.0;
	} else if ( m == 15 ) {
		// tarred planks: near-black, a faint grain, the tar worn to bare grey wood on the edges
		// and where feet and oars rub, a little sheen
		vec4 w = wood( p, ax, 1.2 );
		alb *= 0.8 + 0.25 * w.x;
		float worn = smoothstep( 0.45, 0.8, gnoise3( p * 3.5 ) + 0.3 * gnoise3( p * 17.0 ) );
		alb = mix( alb, vec3( 0.34, 0.31, 0.27 ) * w.x, worn * 0.55 );
		N = bump( N, w.w * 0.001 - w.y * 0.002, 1.0 );
		rough = mix( 0.5, 0.85, worn ); f0 = 0.04;
	} else if ( m == 17 || m == 18 ) {
		// a painted plank of the hull. vCenter: ( along, across (m from its lower edge), width )
		// on the sides; on the bottom and the transom ( along, -1..1 across, -1 ) - five planks
		float u = vCenter.x;
		bool isFlat = vCenter.z < 0.0;
		float fa = isFlat ? fract( ( vCenter.y + 1.0 ) * 2.5 ) : vCenter.y / max( vCenter.z, 0.01 );
		float width = isFlat ? 0.2 : vCenter.z;
		float edge = min( fa, 1.0 - fa ) * width;
		vec4 w = wood( p, vec3( 0.0, 0.0, 1.0 ), 1.2 );
		vec3 bare = vec3( 0.34, 0.29, 0.23 ) * w.x;
		float chipN = gnoise3( p * 16.0 ) * 0.5 + gnoise3( p * 55.0 ) * 0.25 + gnoise3( p * 3.0 ) * 0.35;
		float zone = ( 1.0 - smoothstep( 0.0, 0.03, edge ) ) * 0.4 + ( m == 17 ? smoothstep( 0.34, 0.5, vObj.y ) * 0.25 : ( 1.0 - smoothstep( 0.0, 0.25, vObj.y ) ) * 0.3 );
		float chip = smoothstep( 0.46, 0.52, chipN + zone );
		vec3 paint = vColor * ( 0.88 + 0.14 * gnoise3( vec3( u * 1.2, p.y * 9.0, p.x * 9.0 ) ) );
		paint *= 1.0 - 0.12 * smoothstep( 0.3, 0.8, gnoise3( vec3( u * 0.4, p.y * 30.0, 2.0 ) ) );
		// the grey primer shows at a chip's rim, the bare wood at its heart
		alb = mix( paint, mix( vec3( 0.4, 0.39, 0.36 ), bare, smoothstep( 0.52, 0.6, chipN + zone ) ), chip );
		alb *= mix( 0.3, 1.0, smoothstep( 0.0, 0.005, edge ) );
		// a row of clench nails along each seam, each with a rust stain
		vec2 nq = vec2( mod( u + ( isFlat ? 0.0 : 0.03 ), 0.085 ) - 0.0425, edge - 0.017 );
		float nl = length( nq );
		float nail = 1.0 - smoothstep( 0.0035, 0.0055, nl );
		float stain = ( 1.0 - smoothstep( 0.005, 0.03, length( nq * vec2( 1.3, 0.5 ) + vec2( 0.0, 0.012 ) ) ) );
		alb = mix( alb, vec3( 0.22, 0.1, 0.04 ), max( nail, stain * 0.35 ) );
		float h = - chip * 0.0012 - ( 1.0 - smoothstep( 0.0, 0.005, edge ) ) * 0.002 + nail * 0.001;
		if ( m == 18 ) {
			// inside: larch needles and a few leaves settle in the bottom; rainwater stands
			// in the bilge, a small dark mirror
			float floorish = smoothstep( 0.6, 0.9, n0.y ) * ( 1.0 - smoothstep( 0.03, 0.14, vObj.y ) );
			vec3 vo = voronoi( p.xz * 19.0 );
			float leaf = smoothstep( 0.32, 0.18, vo.x ) * step( 0.6, vo.z ) * floorish;
			alb = mix( alb, mix( vec3( 0.55, 0.36, 0.07 ), vec3( 0.3, 0.14, 0.04 ), hash11( vo.z * 91.0 ) ), leaf );
			float nd = abs( sin( dot( p.xz, vec2( 173.0, 91.0 ) ) + gnoise( p.xz * 30.0 ) * 8.0 ) );
			float needles = smoothstep( 0.93, 0.99, nd ) * floorish * step( 0.1, gnoise3( p * 6.0 ) + 0.4 );
			alb = mix( alb, vec3( 0.62, 0.45, 0.1 ), needles * 0.8 );
			mirror = ( 1.0 - smoothstep( 0.038, 0.046, vObj.y ) ) * smoothstep( 0.85, 0.95, n0.y ) * ( 1.0 - leaf * 0.8 );
			h *= 1.0 - mirror;
		}
		N = bump( N, h, 1.0 );
		rough = mix( 0.42, 0.85, chip ); f0 = 0.04;
	} else if ( m == 19 ) {
		// a deck plank across the jetty. vCenter: ( plank centre x, its width, centre z )
		vec4 w = wood( p, vec3( 1.0, 0.0, 0.0 ), 1.0 );
		float dz = abs( p.z - vCenter.z ), halfW = vCenter.y * 0.5, edge = halfW - dz;
		alb *= w.x * ( 1.0 - 0.45 * w.y );
		alb = mix( alb, vec3( 0.07, 0.05, 0.04 ), w.z * 0.4 );
		// a path worn pale and smooth down the middle; moss and grit in the seams and at the edges
		float worn = 1.0 - smoothstep( 0.22, 0.5, abs( p.x ) + gnoise( p.xz * 2.5 ) * 0.12 );
		alb = mix( alb, alb * 1.15 + 0.015, worn * 0.6 );
		float moss = ( 1.0 - smoothstep( 0.0, 0.018, edge ) ) * smoothstep( -0.3, 0.4, gnoise3( p * 5.0 ) ) * ( 1.0 - worn * 0.8 );
		alb = mix( alb, vec3( 0.12, 0.17, 0.05 ), moss * 0.75 );
		alb *= mix( 0.4, 1.0, smoothstep( 0.0, 0.004, edge ) );
		// two nails where the plank crosses each stringer, a rust ring round each
		float sx = abs( p.x ) - 0.365 * floor( abs( p.x ) / 0.365 + 0.5 ) + 0.0;
		sx = abs( abs( p.x ) - 0.18 ) < 0.09 ? abs( p.x ) - 0.18 : ( abs( abs( p.x ) - 0.55 ) < 0.18 ? abs( p.x ) - 0.55 : ( abs( abs( p.x ) - 1.0 ) < 0.22 ? abs( p.x ) - 1.0 : abs( p.x ) - 1.45 ) );
		vec2 nq = vec2( sx, dz - halfW * 0.5 );
		float nl = length( nq );
		float nail = 1.0 - smoothstep( 0.0038, 0.0058, nl );
		alb *= 1.0 - 0.3 * ( 1.0 - smoothstep( 0.006, 0.028, nl ) );
		alb = mix( alb, vec3( 0.15, 0.11, 0.09 ), nail );
		// gull droppings here and there
		float dropN = smoothstep( 0.8, 0.84, gnoise3( p * 9.0 + 3.0 ) ) * step( 0.55, gnoise3( p * 1.1 + 7.0 ) + 0.5 );
		alb = mix( alb, vec3( 0.66, 0.64, 0.58 ), dropN * 0.8 );
		N = bump( N, w.w * 0.0015 - w.y * 0.003 - nail * 0.0008 - ( 1.0 - smoothstep( 0.0, 0.006, edge ) ) * 0.003, 1.0 );
		rough = mix( 0.82, 0.6, worn );
	} else if ( m == 16 ) {
		// laid hemp rope: strands twisted round the axis
		vec3 d = p - vCenter;
		float along = dot( d, ax );
		vec3 r = d - ax * along;
		vec3 e1 = normalize( cross( ax, abs( ax.y ) < 0.9 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 ) ) );
		float ang = atan( dot( r, cross( ax, e1 ) ), dot( r, e1 ) );
		float tw = fract( ( along * 60.0 + ang * 3.0 / 6.2832 ) );
		float strand = smoothstep( 0.0, 0.2, tw ) * smoothstep( 1.0, 0.75, tw );
		alb *= 0.55 + 0.5 * strand;
		N = bump( N, strand * 0.002, 1.0 );
		rough = 0.95;
	}

	float sh = sunShadow( vWorldPos, N );
	// wood and stone darken and grow a skin of algae where the water laps them
	float wl = vWorldPos.y - uWaterLevel;
	float wet = smoothstep( 0.35, 0.02, wl ) * ( m == 5 || m == 14 ? 0.0 : 1.0 );
	alb = mix( alb, alb * vec3( 0.45, 0.5, 0.38 ) + vec3( 0.0, 0.012, 0.004 ), wet * 0.8 );
	rough = mix( rough, 0.35, wet * smoothstep( -0.05, 0.1, wl ) );
	vec3 col = shadeSurface( alb, N, V, vWorldPos, ao, sh * mix( 0.5, 1.0, ao ), rough, f0 );
	// a lantern: warm light falling off with distance (uLamp: position, intensity)
	if ( uLamp.w > 0.0 ) {
		vec3 Ld = uLamp.xyz - vWorldPos;
		float d2 = dot( Ld, Ld );
		col += alb / PI * vec3( 1.0, 0.62, 0.3 ) * uLamp.w * saturate( dot( N, Ld * inversesqrt( d2 ) ) * 0.8 + 0.2 ) / ( d2 + 0.3 ) * mix( 0.6, 1.0, ao );
	}
	if ( mirror > 0.0 ) {
		vec3 R = reflect( -V, vec3( 0.0, 1.0, 0.0 ) );
		float fr = 0.02 + 0.98 * pow( 1.0 - saturate( V.y ), 5.0 );
		col = mix( col, col * 0.25 + skyRadiance( normalize( vec3( R.x, max( R.y, 0.01 ), R.z ) ) ) * fr, mirror );
	}
	if ( m == 14 ) col = vColor * 14.0 * ( 0.85 + 0.15 * gnoise( vec2( uTime * 3.0, 0.0 ) ) );
	col = waterColumn( col, vWorldPos, uSunColor * sh );
	col = applyAtmosphere( col, vWorldPos );
	gl_FragColor = vec4( col, 1.0 );
}
`;

export const LAMP = { value: new THREE.Vector4( 0, 0, 0, 0 ) };

export function propMaterial( { side = THREE.FrontSide } = {} ) {

	return new THREE.ShaderMaterial( {
		vertexShader: vert,
		fragmentShader: frag,
		uniforms: { ...THREE.UniformsUtils.merge( [ THREE.UniformsLib.lights ] ), ...sharedUniforms(), uLamp: LAMP },
		lights: true,
		side,
	} );

}

// ---------------------------------------------------------------------------
// geometry kit
// ---------------------------------------------------------------------------
const ATTRS = [ 'position', 'normal', 'color', 'aMat', 'aAxis', 'aCenter', 'aAO' ];
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _s = new THREE.Vector3( 1, 1, 1 );

export class Kit {

	// ground( x, z ): the terrain height in the kit's frame; aoFn( x, y, z, ny ) replaces the
	// default occlusion (near the ground)
	constructor( ground, aoFn = null ) {

		this.ground = ground;
		this.parts = [];
		if ( aoFn ) this.ao = aoFn;

	}

	// ambient occlusion: darker toward the ground (a prop may pass its own)
	ao( x, y, z, ny ) {

		const g = this.ground( x, z );
		return ( ny < - 0.5 ? 0.6 : 1 ) * ( 0.5 + 0.5 * THREE.MathUtils.smoothstep( y - g, - 0.05, 0.5 ) );

	}

	// add a geometry (in the hut frame) with a surface kind, a colour (sRGB hex or THREE.Color),
	// a grain axis and a centre (for end grain, per-stone variation)
	add( geo, mat, color, axis = [ 1, 0, 0 ], center = [ 0, 0, 0 ] ) {

		const g = geo.index ? geo.toNonIndexed() : geo;
		if ( ! g.getAttribute( 'normal' ) ) g.computeVertexNormals();
		const n = g.getAttribute( 'position' ).count;
		const pos = g.getAttribute( 'position' ), nrm = g.getAttribute( 'normal' );
		const col = color === null ? new THREE.Color( 1, 1, 1 ) : color.isColor ? color : new THREE.Color( color );
		const c = new Float32Array( n * 3 ), ax = new Float32Array( n * 3 ), ce = new Float32Array( n * 3 ), ao = new Float32Array( n );
		for ( let i = 0; i < n; i ++ ) {

			c[ i * 3 ] = col.r; c[ i * 3 + 1 ] = col.g; c[ i * 3 + 2 ] = col.b;
			ax[ i * 3 ] = axis[ 0 ]; ax[ i * 3 + 1 ] = axis[ 1 ]; ax[ i * 3 + 2 ] = axis[ 2 ];
			ce[ i * 3 ] = center[ 0 ]; ce[ i * 3 + 1 ] = center[ 1 ]; ce[ i * 3 + 2 ] = center[ 2 ];
			ao[ i ] = this.ao( pos.getX( i ), pos.getY( i ), pos.getZ( i ), nrm.getY( i ) );

		}

		if ( ! g.getAttribute( 'color' ) || color !== null ) g.setAttribute( 'color', new THREE.BufferAttribute( c, 3 ) );
		g.setAttribute( 'aMat', new THREE.BufferAttribute( new Float32Array( n ).fill( mat ), 1 ) );
		if ( ! g.getAttribute( 'aAxis' ) ) g.setAttribute( 'aAxis', new THREE.BufferAttribute( ax, 3 ) );
		if ( ! g.getAttribute( 'aCenter' ) ) g.setAttribute( 'aCenter', new THREE.BufferAttribute( ce, 3 ) );
		g.setAttribute( 'aAO', new THREE.BufferAttribute( ao, 1 ) );
		for ( const k of Object.keys( g.attributes ) ) if ( ! ATTRS.includes( k ) ) g.deleteAttribute( k );
		this.parts.push( g );
		return this;

	}

	// place a geometry: position, rotation [ x, y, z, order ]
	put( g, x, y, z, rot ) {

		_q.setFromEuler( _e.set( rot?.[ 0 ] || 0, rot?.[ 1 ] || 0, rot?.[ 2 ] || 0, rot?.[ 3 ] || 'XYZ' ) );
		_m.compose( _v.set( x, y, z ), _q, _s );
		g.applyMatrix4( _m );
		return _q.clone();

	}

	box( x, y, z, sx, sy, sz, mat, color, { rot = null, axis = null, round = 0 } = {} ) {

		const g = round > 0 ? new RoundedBoxGeometry( sx, sy, sz, 2, Math.min( round, sx / 2.1, sy / 2.1, sz / 2.1 ) ) : new THREE.BoxGeometry( sx, sy, sz );
		const q = this.put( g, x, y, z, rot );
		let a = axis;
		if ( ! a ) a = ( sx >= sy && sx >= sz ? new THREE.Vector3( 1, 0, 0 ) : sy >= sz ? new THREE.Vector3( 0, 1, 0 ) : new THREE.Vector3( 0, 0, 1 ) ).applyQuaternion( q ).toArray();
		return this.add( g, mat, color, a, [ x, y, z ] );

	}

	// a round pole or post from a to b, slightly crooked
	pole( a, b, r, mat, color, seed = 0 ) {

		const d = new THREE.Vector3().subVectors( b, a ), len = d.length();
		const g = new THREE.CylinderGeometry( r * 0.92, r, len, 8, Math.max( 2, Math.round( len / 0.6 ) ) );
		const p = g.getAttribute( 'position' );
		for ( let i = 0; i < p.count; i ++ ) {

			const t = p.getY( i ) / len + 0.5;
			p.setX( i, p.getX( i ) + Math.sin( t * 3.1 + seed ) * r * 0.5 );
			p.setZ( i, p.getZ( i ) + Math.sin( t * 2.3 + seed * 2 ) * r * 0.4 );

		}

		g.computeVertexNormals();
		g.applyQuaternion( new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), d.clone().normalize() ) );
		g.translate( ( a.x + b.x ) / 2, ( a.y + b.y ) / 2, ( a.z + b.z ) / 2 );
		return this.add( g, mat, color, d.normalize().toArray(), [ ( a.x + b.x ) / 2, ( a.y + b.y ) / 2, ( a.z + b.z ) / 2 ] );

	}

	// a loose stone: a lumpy, flattened blob, sat on its base at (x, y, z)
	stone( x, y, z, rx, ry, rz, color, seed, rot = [ 0, 0, 0 ] ) {

		const g = new THREE.IcosahedronGeometry( 1, 1 );
		const p = g.getAttribute( 'position' );
		for ( let i = 0; i < p.count; i ++ ) {

			const px = p.getX( i ), py = p.getY( i ), pz = p.getZ( i );
			let k = 1 + 0.24 * Math.sin( px * 2.9 + seed ) * Math.cos( pz * 2.6 + seed * 1.7 ) + 0.12 * Math.sin( py * 4.7 + seed * 3.1 ) + 0.08 * Math.sin( ( px + pz ) * 7 + seed ) + 0.06 * Math.sin( px * 11 - pz * 9 + seed );
			// flat-ish underneath
			const yy = py < - 0.3 ? - 0.3 - ( - 0.3 - py ) * 0.4 : py;
			p.setXYZ( i, px * k * rx, ( yy + 0.3 ) * k * ry, pz * k * rz );

		}

		g.computeVertexNormals();
		this.put( g, x, y - 0.02, z, [ rot[ 0 ], rot[ 1 ] + seed * 2.3, rot[ 2 ], 'ZXY' ] );
		return this.add( g, M.STONE, color, [ 1, 0, 0 ], [ x, y, z ] );

	}

	build() {

		const g = mergeGeometries( this.parts, false );
		g.computeBoundingSphere();
		return g;

	}

}

export const col = ( hex, k = 1 ) => new THREE.Color( hex ).multiplyScalar( k );
export const mixc = ( a, b, t ) => new THREE.Color( a ).lerp( new THREE.Color( b ), t );
