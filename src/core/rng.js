// Small seeded PRNG (mulberry32) so the world is identical on every visit.
export class RNG {

	constructor( seed = 1 ) {

		this.s = seed >>> 0;

	}

	next() {

		let t = ( this.s = ( this.s + 0x6D2B79F5 ) >>> 0 );
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	}

	range( a, b ) { return a + ( b - a ) * this.next(); }

	int( a, b ) { return Math.floor( this.range( a, b + 1 ) ); }

	pick( arr ) { return arr[ Math.floor( this.next() * arr.length ) ]; }

	gauss() {

		const u = 1 - this.next(), v = this.next();
		return Math.sqrt( - 2 * Math.log( u ) ) * Math.cos( 2 * Math.PI * v );

	}

}

// Cheap deterministic 2D hash in [0,1)
export function hash2( x, z ) {

	let h = Math.imul( Math.floor( x ) | 0, 374761393 ) + Math.imul( Math.floor( z ) | 0, 668265263 );
	h = Math.imul( h ^ ( h >>> 13 ), 1274126177 );
	return ( ( h ^ ( h >>> 16 ) ) >>> 0 ) / 4294967296;

}
