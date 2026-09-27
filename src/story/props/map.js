import * as THREE from 'three';

// The map on the forest lodge's wall: the valley drawn from the ground itself - shaded relief
// and contours, the lake and the stream, the woods - on old paper, with the marked path pencilled
// over it in red, its places named in the forester's hand, the lodge crossed ("X here"), and a
// ring round the black pond with a question beside it.
// td: the terrain; path: the route (samples); marks: [ { x, z, label, ring, cross } ];
// woods( x, z ): 0..1; box: [ x0, z0, x1, z1 ] (the part of the valley drawn)
export function drawValleyMap( td, path, marks, woods, box, w = 1024, h = 796 ) {

	const c = document.createElement( 'canvas' );
	c.width = w; c.height = h;
	const g = c.getContext( '2d' );
	const [ x0, z0, x1, z1 ] = box;
	// north is -z; the sheet's up is north
	const sx = ( x ) => ( x - x0 ) / ( x1 - x0 ) * w, sy = ( z ) => ( z - z0 ) / ( z1 - z0 ) * h;
	const img = g.createImageData( w, h ), d = img.data;
	const step = 2; // (every other pixel sampled, the rest filled)
	const H = new Float32Array( Math.ceil( w / step ) * Math.ceil( h / step ) );
	const gw = Math.ceil( w / step ), gh = Math.ceil( h / step );
	for ( let j = 0; j < gh; j ++ ) for ( let i = 0; i < gw; i ++ ) {

		const x = x0 + ( i * step ) / w * ( x1 - x0 ), z = z0 + ( j * step ) / h * ( z1 - z0 );
		H[ j * gw + i ] = td.heightAt( x, z );

	}

	const at = ( i, j ) => H[ Math.min( gh - 1, Math.max( 0, j ) ) * gw + Math.min( gw - 1, Math.max( 0, i ) ) ];
	const paper = [ 226, 214, 184 ];
	for ( let py = 0; py < h; py ++ ) for ( let px = 0; px < w; px ++ ) {

		const i = Math.floor( px / step ), j = Math.floor( py / step );
		const hh = at( i, j );
		// relief shading from the north-west, and contour lines every 20 m
		const dx = at( i + 1, j ) - at( i - 1, j ), dz = at( i, j + 1 ) - at( i, j - 1 );
		const shade = Math.max( - 0.35, Math.min( 0.35, ( - dx - dz ) * 0.04 ) );
		const x = x0 + px / w * ( x1 - x0 ), z = z0 + py / h * ( z1 - z0 );
		let r = paper[ 0 ], gg = paper[ 1 ], b = paper[ 2 ];
		if ( hh < - 0.05 ) {

			// water: a flat blue-grey wash, darker toward the middle
			const deep = Math.min( 1, - hh / 12 );
			r = 150 - deep * 40; gg = 170 - deep * 35; b = 176 - deep * 20;

		} else {

			const wd = woods( x, z );
			if ( wd > 0.2 ) { r -= 40 * wd; gg -= 22 * wd; b -= 48 * wd; }
			r += shade * 70; gg += shade * 62; b += shade * 50;
			const ct = hh / 20, cf = ct - Math.floor( ct );
			if ( cf < 0.06 && hh > 3 ) { r -= 38; gg -= 48; b -= 60; }

		}

		// the paper's grain and stains
		const n = ( Math.sin( px * 12.9898 + py * 78.233 ) * 43758.5453 ) % 1;
		const k = ( py * w + px ) * 4;
		d[ k ] = r + n * 8; d[ k + 1 ] = gg + n * 8; d[ k + 2 ] = b + n * 6; d[ k + 3 ] = 255;

	}

	g.putImageData( img, 0, 0 );
	// the marked path, pencilled in red, dashed
	g.strokeStyle = 'rgba(160,30,24,0.85)';
	g.lineWidth = 3.2;
	g.setLineDash( [ 10, 6 ] );
	g.beginPath();
	path.samples.forEach( ( s, i ) => ( i ? g.lineTo( sx( s.x ), sy( s.z ) ) : g.moveTo( sx( s.x ), sy( s.z ) ) ) );
	g.stroke();
	g.setLineDash( [] );
	// the places, in the forester's hand
	g.font = 'italic 26px "Cedarville Cursive", "Segoe Script", "Bradley Hand", serif';
	g.fillStyle = 'rgba(40,32,26,0.9)';
	g.strokeStyle = 'rgba(40,32,26,0.85)';
	for ( const m of marks ) {

		const X = sx( m.x ), Y = sy( m.z );
		if ( m.cross ) {

			g.lineWidth = 3;
			g.beginPath(); g.moveTo( X - 9, Y - 9 ); g.lineTo( X + 9, Y + 9 ); g.moveTo( X + 9, Y - 9 ); g.lineTo( X - 9, Y + 9 ); g.stroke();

		} else if ( m.ring ) {

			g.lineWidth = 2.2;
			g.beginPath(); g.ellipse( X, Y, m.ring * 1.2, m.ring, 0.2, 0, Math.PI * 2 ); g.stroke();

		} else {

			g.beginPath(); g.arc( X, Y, 4, 0, Math.PI * 2 ); g.fill();

		}

		if ( m.label ) g.fillText( m.label, X + ( m.dx ?? 12 ), Y + ( m.dy ?? - 10 ) );

	}

	// a north arrow, the forester's initial, a fold across the middle
	g.font = 'bold 22px Georgia, serif';
	g.fillText( 'N', w - 44, 52 );
	g.lineWidth = 2;
	g.beginPath(); g.moveTo( w - 38, 64 ); g.lineTo( w - 38, 108 ); g.moveTo( w - 44, 74 ); g.lineTo( w - 38, 62 ); g.lineTo( w - 32, 74 ); g.stroke();
	g.fillStyle = 'rgba(0,0,0,0.07)';
	g.fillRect( w / 2 - 2, 0, 4, h );
	g.fillRect( 0, h / 2 - 2, w, 4 );
	const vig = g.createRadialGradient( w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.8 );
	vig.addColorStop( 0, 'rgba(90,60,20,0)' );
	vig.addColorStop( 1, 'rgba(90,60,20,0.35)' );
	g.fillStyle = vig;
	g.fillRect( 0, 0, w, h );
	const tex = new THREE.CanvasTexture( c );
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return { canvas: c, texture: tex };

}
