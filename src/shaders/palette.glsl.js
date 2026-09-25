// Colour functions shared by the terrain and the vegetation that grows on it,
// so grass blades and the ground beneath them always agree.
export const paletteGLSL = /* glsl */ `
vec3 srgbToLinear( vec3 c ) { return pow( c, vec3( 2.2 ) ); }

// Autumn meadow grass colour (linear), varying in patches.
vec3 grassColor( vec2 p, float h ) {
	float n1 = gnoise( p * 0.012 + 3.0 );
	float n2 = gnoise( p * 0.045 + 5.0 );
	float n3 = gnoise( p * 0.13 + 9.0 );
	vec3 green = vec3( 0.30, 0.36, 0.12 );
	vec3 olive = vec3( 0.46, 0.43, 0.17 );
	vec3 straw = vec3( 0.72, 0.58, 0.28 );
	vec3 rust = vec3( 0.60, 0.33, 0.14 );
	vec3 c = mix( green, olive, smoothstep( -0.6, 0.6, n1 ) );
	c = mix( c, straw, smoothstep( -0.1, 0.8, n2 ) * 0.75 );
	c = mix( c, rust, smoothstep( 0.35, 0.9, n3 ) * 0.45 );
	// damp ground near the lake stays greener
	c = mix( c, vec3( 0.26, 0.36, 0.12 ), ( 1.0 - smoothstep( 1.0, 6.0, h ) ) * 0.55 );
	// alpine tundra above the treeline: heather and bilberry in deep reds
	float alp = smoothstep( 520.0, 760.0, h + n1 * 60.0 );
	c = mix( c, mix( vec3( 0.44, 0.22, 0.13 ), vec3( 0.50, 0.42, 0.26 ), smoothstep( -0.4, 0.3, n2 ) ), alp * 0.75 );
	return srgbToLinear( c );
}
`;
