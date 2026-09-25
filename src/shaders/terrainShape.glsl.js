// The analytic landscape: a U-shaped glacial trough holding a long lake, walled
// by ridged ranges and closed to the north by a pyramidal horn. Requires noise.glsl.
export const terrainShapeGLSL = /* glsl */ `
const vec2 LAKE_C = vec2( 0.0, -330.0 );
const vec2 LAKE_AX = vec2( 330.0, 780.0 );
const vec2 HORN_C = vec2( -120.0, -3350.0 );

float sdSegment( vec2 p, vec2 a, vec2 b ) {
	vec2 pa = p - a, ba = b - a;
	float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );
	return length( pa - ba * h );
}

// Smooth max whose blend radius shrinks with the smaller input, so two
// near-zero fields never lift the ground.
float smax( float a, float b, float k ) {
	k = max( 1e-3, min( k, max( min( a, b ), 0.0 ) * 0.6 ) );
	float h = max( k - abs( a - b ), 0.0 ) / k;
	return max( a, b ) + h * h * k * 0.25;
}

// Signed distance-ish to the lake shore (negative inside the lake).
float lakeSDF( vec2 p ) {
	vec2 w = vec2( fbm2( p * 0.0016 + vec2( 3.1, 1.7 ), 4 ), fbm2( p * 0.0016 + vec2( 8.3, 2.9 ), 4 ) );
	vec2 q = p - LAKE_C + w * 120.0;
	float t = clamp( q.y / LAKE_AX.y, -1.0, 1.0 );
	q.x /= 1.0 + 0.3 * t;
	float k = length( q / LAKE_AX );
	return ( k - 1.0 ) * LAKE_AX.x * 1.1;
}

float valleyDist( vec2 p ) {
	vec2 a = vec2( -60.0, -2050.0 );
	vec2 b = vec2( -40.0, 700.0 );
	vec2 c = vec2( 320.0, 1950.0 );
	vec2 d = vec2( 1050.0, 4700.0 );
	return min( sdSegment( p, a, b ), min( sdSegment( p, b, c ), sdSegment( p, c, d ) ) );
}

// Musgrave ridged multifractal: sharp arêtes, detail concentrated on the ridges.
float ridgedMF( vec2 p, int oct ) {
	float sum = 0.0, amp = 0.5, w = 1.0;
	for ( int i = 0; i < 12; i ++ ) {
		if ( i >= oct ) break;
		float n = 1.0 - abs( gnoise( p ) );
		n *= n;
		n *= w;
		w = clamp( n * 1.7, 0.0, 1.0 );
		sum += n * amp;
		amp *= 0.5;
		p = M2 * p * 2.03 + 3.7;
	}
	return sum;
}

// Eroded fBm (derivative-damped) in the spirit of IQ's "Elevated".
float erodedFbm( vec2 x, int oct ) {
	float a = 0.0, b = 1.0;
	vec2 d = vec2( 0.0 );
	for ( int i = 0; i < 14; i ++ ) {
		if ( i >= oct ) break;
		vec3 n = vnoised( x );
		d += n.yz;
		a += b * n.x / ( 1.0 + dot( d, d ) );
		b *= 0.5;
		x = M2 * x * 2.0;
	}
	return a;
}

// Octave budget: "detail" is the smallest wavelength (m) worth generating.
int octavesFor( float baseWavelength, float detail ) {
	return int( clamp( floor( log2( baseWavelength / detail ) ) + 1.0, 1.0, 14.0 ) );
}

float terrainHeight( vec2 p, float detail ) {
	float dv = valleyDist( p );

	// Flat-bottomed glacial trough with steep walls.
	// the trough opens into a broad valley toward the south-west (where the sun sets)
	// and pinches into a hanging valley beneath the horn
	float widen = smoothstep( 300.0, 3200.0, p.y ) * 1100.0 - smoothstep( -1200.0, -2000.0, p.y ) * 250.0;
	float wall = smoothstep( 430.0 + widen, 1850.0 + widen * 1.4, dv );
	wall = wall * wall * ( 3.0 - 2.0 * wall );

	// Valley floor: gently rolling, rising slowly down the outflow valley.
	float floorH = 4.0 + 4.0 * fbm2( p * 0.004, 3 ) + max( 0.0, p.y - 600.0 ) * 0.012;
	// low rolling hills and moraines across the outer valley floor
	floorH += 38.0 * smoothstep( 500.0, 2500.0, p.y ) * ( 0.5 + 0.5 * fbm2( p * 0.0018 + 13.0, 4 ) );

	// Ridged ranges on warped coordinates.
	vec2 wq = p / 2300.0;
	wq += 0.28 * vec2( fbm2( wq * 1.3 + 7.0, 4 ), fbm2( wq * 1.3 + 2.0, 4 ) );
	int oct = octavesFor( 2300.0, detail );
	float r = ridgedMF( wq + vec2( 4.3, 1.1 ), oct );
	int oct2 = octavesFor( 700.0, detail );
	float e = erodedFbm( p / 700.0 + vec2( 3.0, 9.0 ), min( oct2, 9 ) );
	float range = wall * ( 1050.0 * ( 0.28 + 0.95 * r ) + 110.0 * e );

	// The horn: a rounded pyramid with glacier-carved concave faces.
	vec2 hp = mat2( 0.82, -0.57, 0.57, 0.82 ) * ( p - HORN_C );
	// warp the pyramid so its faces and arêtes wander
	hp += 260.0 * vec2( fbm2( p * 0.0011 + 4.0, 4 ), fbm2( p * 0.0011 + 9.0, 4 ) );
	float l1 = ( abs( hp.x ) * 1.1 + abs( hp.y ) * 0.9 + length( hp ) * 0.9 ) / 1.9;
	float horn = 2250.0 * pow( max( 0.0, 1.0 - l1 / 2400.0 ), 2.0 );
	horn *= 0.88 + 0.22 * r;
	// buttresses and couloirs from the eroded field
	horn += 150.0 * e * smoothstep( 0.0, 400.0, horn );
	// shoulder peaks flanking the horn
	float s1 = 1150.0 * pow( max( 0.0, 1.0 - length( p - vec2( -2100.0, -2500.0 ) ) / 1500.0 ), 1.8 ) * ( 0.8 + 0.4 * r );
	float s2 = 1300.0 * pow( max( 0.0, 1.0 - length( p - vec2( 2000.0, -2300.0 ) ) / 1600.0 ), 1.8 ) * ( 0.8 + 0.4 * r );
	// the trough floor itself climbs toward the horn in glacial steps
	float headwall = smoothstep( -1250.0, -2100.0, p.y );
	floorH += headwall * ( 160.0 + 60.0 * smoothstep( -1500.0, -1650.0, p.y ) );
	float mtn = smax( range, horn * smoothstep( 150.0, 700.0, dv + ( 1.0 - headwall ) * 400.0 ), 220.0 );
	mtn = smax( mtn, max( s1, s2 ) * wall, 200.0 );

	// Buttresses and couloirs: ridged detail that survives on steep ground.
	float rockMask = smoothstep( 40.0, 260.0, mtn );
	int oct3 = octavesFor( 320.0, detail );
	mtn += rockMask * 75.0 * ( ridgedMF( p / 320.0 + vec2( 7.7, 3.1 ), min( oct3, 7 ) ) - 0.3 );

	// Sedimentary strata: soft terracing carves horizontal cliff bands and ledges.
	float bandH = 34.0 + 22.0 * ( fbm2( p * 0.0007 + 2.0, 2 ) * 0.5 + 0.5 );
	float sp = mtn / bandH + fbm2( p * 0.0016 + 5.0, 3 ) * 1.4;
	float fl = floor( sp );
	float fr = sp - fl;
	float terr = fl + smoothstep( 0.25, 0.75, fr ) * 0.9 + fr * 0.1;
	float terrK = 0.34 * smoothstep( -0.2, 0.5, fbm2( p * 0.0011 + 8.0, 3 ) );
	mtn = mix( mtn, ( terr - ( sp - mtn / bandH ) ) * bandH, terrK * rockMask );

	float h = floorH + mtn;

	// Moraine hummocks and small bumps where the heightmap can hold them.
	if ( detail < 4.0 ) {
		float fine = fbm2( p * 0.03, 3 ) * 1.3 + fbm2( p * 0.11, 2 ) * 0.3;
		h += fine * ( 1.0 - wall * 0.6 );
	}

	// --- Carve the lake ---
	float s = lakeSDF( p );
	// a low grassy bank rising from a narrow strand
	float shoreBase = 0.35 + max( s, 0.0 ) * 0.03 + smoothstep( 1.0, 9.0, s ) * 0.55;
	float shoreW = mix( 30.0, 130.0, smoothstep( -0.3, 0.4, fbm2( p * 0.003 + 21.0, 3 ) ) );
	// never steeper than ~40 degrees on average where the walls meet the water
	shoreW = max( shoreW, min( ( h - shoreBase ) / 0.85, 420.0 ) );
	float landT = smoothstep( 0.0, shoreW, s );
	float land = mix( shoreBase, h, landT * landT * ( 3.0 - 2.0 * landT ) );

	float depth = 28.0 * ( 1.0 - exp( min( s, 0.0 ) / 85.0 ) ) + 2.0 * fbm2( p * 0.01, 3 ) * smoothstep( 0.0, -60.0, s );
	float bed = 0.35 - depth - max( -s, 0.0 ) * 0.004;
	h = s > 0.0 ? land : bed;

	// A small rocky island.
	vec2 ip = p - vec2( -90.0, -520.0 );
	float ir = length( ip * vec2( 1.0, 0.8 ) ) + 12.0 * gnoise( p * 0.03 );
	float island = 8.0 - 19.0 * pow( ir / 58.0, 2.0 );
	island += 1.5 * gnoise( p * 0.08 ) * ( 1.0 - smoothstep( 10.0, 45.0, ir ) );
	h = max( h, island );

	return h;
}
`;
