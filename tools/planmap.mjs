// Dev helper: a surveyor's plan of part of the valley - hillshade with 2 m contours, the
// lake, stream and ponds, every tree, rock and fallen log, and (horror edition) the route,
// its beats, encounters, props and blockers.
// usage: node tools/planmap.mjs <out.png> [x0=-300] [z0=380] [x1=220] [z1=830] [mPerPx=0.5] [query]
import puppeteer from 'puppeteer-core';

const [ out, x0 = '-300', z0 = '380', x1 = '220', z1 = '830', mpp = '0.5', query = '' ] = process.argv.slice( 2 );
const X0 = + x0, Z0 = + z0, X1 = + x1, Z1 = + z1, MPP = + mpp;
const W = Math.round( ( X1 - X0 ) / MPP ), H = Math.round( ( Z1 - Z0 ) / MPP );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist', `--window-size=${Math.min( W, 1800 )},${Math.min( H, 1800 )}` ] } );
const page = await browser.newPage();
await page.setViewport( { width: Math.min( W, 1800 ), height: Math.min( H, 1800 ) } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
page.on( 'console', ( m ) => { if ( m.type() === 'error' || m.text().startsWith( '[plan]' ) ) console.log( '[console]', m.text() ); } );
await page.goto( `http://localhost:5199/?shot=2&speed=0${query ? '&' + query : ''}`, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true || window.__shotError', { timeout: 240000, polling: 250 } );
const b64 = await page.evaluate( ( X0, Z0, X1, Z1, MPP ) => {

	app.update = () => {};
	app.render = () => {};
	const td = app.terrainData;
	const W = Math.round( ( X1 - X0 ) / MPP ), H = Math.round( ( Z1 - Z0 ) / MPP );
	const c = document.createElement( 'canvas' );
	c.width = W; c.height = H;
	const g = c.getContext( '2d' );
	const img = g.createImageData( W, H );
	const hs = new Float32Array( ( W + 1 ) * ( H + 1 ) );
	for ( let j = 0; j <= H; j ++ ) for ( let i = 0; i <= W; i ++ ) hs[ j * ( W + 1 ) + i ] = td.heightAt( X0 + i * MPP, Z0 + j * MPP );
	const bio = [ 0, 0, 0, 0 ];
	const ponds = td.ponds;
	for ( let j = 0; j < H; j ++ ) for ( let i = 0; i < W; i ++ ) {

		const h = hs[ j * ( W + 1 ) + i ], hx = hs[ j * ( W + 1 ) + i + 1 ], hz = hs[ ( j + 1 ) * ( W + 1 ) + i ];
		const x = X0 + i * MPP, z = Z0 + j * MPP;
		// light from the north-west
		const nx = ( h - hx ) / MPP, nz = ( h - hz ) / MPP;
		let shade = 0.72 + 0.5 * ( nx * - 0.6 + nz * - 0.6 ) / Math.hypot( nx, 1, nz );
		td.biomeAt( x, z, bio );
		let r = 120 + 60 * bio[ 0 ], gg = 140 + 50 * bio[ 0 ] - 30 * bio[ 1 ], b = 90;
		r = r * ( 1 - bio[ 1 ] * 0.35 ) + bio[ 2 ] * 60; gg = gg * ( 1 - bio[ 1 ] * 0.2 ) + bio[ 2 ] * 50; b += bio[ 2 ] * 80;
		if ( bio[ 3 ] > 0.4 ) { r = 190; gg = 180; b = 160; }
		// water: the lake below 0, the stream and ponds from their measured surfaces
		let water = h < 0 ? 1 : 0, wd = - h;
		for ( const p of ponds ) if ( Math.hypot( x - p.c.x, z - p.c.y ) < p.r * 1.6 && h < p.surf - 0.02 ) { water = 1; wd = p.surf - h; }
		if ( water ) { r = 30; gg = 70 + 60 * Math.exp( - wd / 3 ); b = 110 + 60 * Math.exp( - wd / 3 ); shade = 1; }
		// 2 m contours, bolder every 10 m
		const k0 = Math.floor( h / 2 ), k1 = Math.floor( hx / 2 ), k2 = Math.floor( hz / 2 );
		if ( ! water && ( k0 !== k1 || k0 !== k2 ) ) shade *= Math.floor( h / 10 ) !== Math.floor( hx / 10 ) || Math.floor( h / 10 ) !== Math.floor( hz / 10 ) ? 0.55 : 0.8;
		const o = ( j * W + i ) * 4;
		img.data[ o ] = r * shade; img.data[ o + 1 ] = gg * shade; img.data[ o + 2 ] = b * shade; img.data[ o + 3 ] = 255;

	}

	g.putImageData( img, 0, 0 );
	const S = ( x, z ) => [ ( x - X0 ) / MPP, ( z - Z0 ) / MPP ];
	const px = ( m ) => m / MPP;
	// the stream
	for ( const s of td.river ) { const [ a, bb ] = S( s.p.x, s.p.y ); g.fillStyle = 'rgba(60,140,200,0.9)'; g.beginPath(); g.arc( a, bb, Math.max( 1, px( s.width ) ), 0, 7 ); g.fill(); }
	// trees: crown discs by species
	const F = app.forest;
	const cols = { 0: '#1d3a22', 1: '#1d3a22', 2: '#1d3a22', 16: '#1d3a22', 17: '#1d3a22', 18: '#1d3a22', 3: '#c8a032', 4: '#c8a032', 5: '#c8a032', 19: '#c8a032', 20: '#c8a032', 21: '#c8a032', 6: '#e0d060', 7: '#e0d060', 23: '#e0d060', 8: '#2f4f2a', 9: '#2f4f2a', 22: '#2f4f2a', 10: '#e8c040', 11: '#e8c040', 12: '#d05030', 13: '#d05030', 14: '#777', 15: '#777' };
	for ( const t of F.trees ) {

		if ( t.x < X0 - 10 || t.x > X1 + 10 || t.z < Z0 - 10 || t.z > Z1 + 10 ) continue;
		const [ a, bb ] = S( t.x, t.z );
		g.fillStyle = cols[ t.variant ] || '#333'; g.globalAlpha = 0.75;
		g.beginPath(); g.arc( a, bb, Math.max( 1.5, px( 2.2 * t.s ) ), 0, 7 ); g.fill();
		g.globalAlpha = 1; g.fillStyle = '#3a2512'; g.beginPath(); g.arc( a, bb, Math.max( 0.8, px( 0.3 * t.s ) ), 0, 7 ); g.fill();

	}

	for ( const t of F.shrubs ) { if ( t.x < X0 || t.x > X1 || t.z < Z0 || t.z > Z1 ) continue; const [ a, bb ] = S( t.x, t.z ); g.fillStyle = 'rgba(120,90,40,0.8)'; g.beginPath(); g.arc( a, bb, Math.max( 1, px( 0.9 * t.s ) ), 0, 7 ); g.fill(); }
	g.strokeStyle = '#4a3020'; g.lineWidth = Math.max( 1, px( 0.5 ) );
	for ( const it of F.props.log.items ) {

		if ( it.x < X0 || it.x > X1 || it.z < Z0 || it.z > Z1 ) continue;
		const hl = F.props.log.variants[ it.variant ].halfLen * it.s, ax = Math.cos( it.rot ), az = - Math.sin( it.rot );
		g.beginPath(); g.moveTo( ...S( it.x - ax * hl, it.z - az * hl ) ); g.lineTo( ...S( it.x + ax * hl, it.z + az * hl ) ); g.stroke();

	}

	g.fillStyle = '#5a4030';
	for ( const it of F.props.stump.items ) { if ( it.x < X0 || it.x > X1 || it.z < Z0 || it.z > Z1 ) continue; const [ a, bb ] = S( it.x, it.z ); g.fillRect( a - 1.5, bb - 1.5, 3, 3 ); }
	g.fillStyle = '#9a9a98';
	for ( const r of app.rocks.items ?? [] ) { if ( r.x < X0 || r.x > X1 || r.z < Z0 || r.z > Z1 ) continue; const [ a, bb ] = S( r.x, r.z ); g.beginPath(); g.arc( a, bb, Math.max( 1.2, px( r.r ?? r.s ?? 1 ) ), 0, 7 ); g.fill(); }
	// grid
	g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '12px sans-serif';
	for ( let x = Math.ceil( X0 / 50 ) * 50; x <= X1; x += 50 ) for ( let z = Math.ceil( Z0 / 50 ) * 50; z <= Z1; z += 50 ) {

		const [ a, bb ] = S( x, z );
		g.fillRect( a - 2, bb - 2, 4, 4 );
		g.fillText( `${x},${z}`, a + 4, bb - 4 );

	}

	const label = ( text, x, z, color = '#fff', r = 4 ) => {

		const [ a, bb ] = S( x, z );
		g.fillStyle = color; g.strokeStyle = '#000'; g.lineWidth = 3;
		g.beginPath(); g.arc( a, bb, r, 0, 7 ); g.fill(); g.stroke();
		g.font = 'bold 13px sans-serif';
		g.strokeText( text, a + 7, bb + 4 ); g.fillText( text, a + 7, bb + 4 );

	};

	const story = app.story;
	if ( story ) {

		const P = story.path;
		g.lineJoin = g.lineCap = 'round';
		g.strokeStyle = 'rgba(255,245,220,0.5)'; g.lineWidth = px( 3 );
		g.beginPath(); P.samples.forEach( ( s, i ) => { const [ a, bb ] = S( s.x, s.z ); i ? g.lineTo( a, bb ) : g.moveTo( a, bb ); } ); g.stroke();
		for ( let i = 1; i < P.samples.length; i ++ ) {

			const a = P.samples[ i - 1 ], b2 = P.samples[ i ];
			g.strokeStyle = `hsl(${40 - i / P.samples.length * 260},90%,55%)`; g.lineWidth = 2;
			g.beginPath(); g.moveTo( ...S( a.x, a.z ) ); g.lineTo( ...S( b2.x, b2.z ) ); g.stroke();

		}

		for ( let d = 0; d < P.length; d += 50 ) { const s = P.at( d ); const [ a, bb ] = S( s.x, s.z ); g.fillStyle = '#fff'; g.font = '11px sans-serif'; g.fillText( d + '', a + 5, bb + 12 ); }
		for ( const sh of story.blockers?.debugShapes?.() ?? [] ) {

			g.strokeStyle = sh.color || 'rgba(255,40,40,0.95)'; g.lineWidth = 2;
			if ( sh.b ) { g.beginPath(); g.moveTo( ...S( sh.a[ 0 ], sh.a[ 1 ] ) ); g.lineTo( ...S( sh.b[ 0 ], sh.b[ 1 ] ) ); g.stroke(); }
			else { const [ a, bb ] = S( sh.x, sh.z ); g.beginPath(); g.arc( a, bb, Math.max( 1, px( sh.r ) ), 0, 7 ); g.stroke(); }

		}

		for ( const p of story.debugMarks?.() ?? [] ) label( p.label, p.x, p.z, p.color || '#ff5', p.r || 4 );

	}

	for ( const p of app.streams.ponds ) label( 'pond', p.mesh.position.x, p.mesh.position.z, '#08f', 3 );
	return c.toDataURL( 'image/png' ).split( ',' )[ 1 ];

}, X0, Z0, X1, Z1, MPP );
const fs = await import( 'node:fs' );
fs.writeFileSync( out, Buffer.from( b64, 'base64' ) );
console.log( `${out} ${W}x${H}` );
await browser.close();
