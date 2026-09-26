// Dev helper: a true top-down view of part of the valley, with the horror route, its beats,
// the landmarks and the animals drawn over it.
// usage: node tools/routemap.mjs <out.png> [cx=-40] [cz=620] [span=420] [query]
// (run while `npm run dev` is up; `query` is extra URL parameters, e.g. "edition=nature")
import puppeteer from 'puppeteer-core';

const [ out, cx = '-40', cz = '620', span = '420', query = '' ] = process.argv.slice( 2 );
const W = 1200, H = 1200;
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist', `--window-size=${W},${H}` ] } );
const page = await browser.newPage();
await page.setViewport( { width: W, height: H } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
page.on( 'console', ( m ) => { if ( m.type() === 'error' ) console.log( '[console]', m.text() ); } );
await page.goto( `http://localhost:5199/?shot=20&speed=0&t=12.5&weather=clear${query ? '&' + query : ''}`, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true || window.__shotError', { timeout: 240000, polling: 250 } );
const notes = await page.evaluate( async ( cx, cz, span ) => {

	const cam = app.camera;
	const h = span / 2 / Math.tan( cam.fov * Math.PI / 360 );
	app.update = () => {};
	cam.position.set( cx, h + 20, cz );
	cam.up.set( 0, 0, - 1 );
	cam.lookAt( cx, 0, cz );
	cam.updateMatrixWorld();
	app.forest.update( cam );
	app.rocks.update( cam );
	app.render();
	const v = cam.position.clone();
	const td = app.terrainData;
	const scr = ( x, z, y ) => {

		v.set( x, y ?? Math.max( 0, td.heightAt( x, z ) ), z ).project( cam );
		return [ ( v.x * 0.5 + 0.5 ) * innerWidth, ( - v.y * 0.5 + 0.5 ) * innerHeight ];

	};

	const c = document.createElement( 'canvas' );
	c.width = innerWidth; c.height = innerHeight;
	c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;pointer-events:none';
	document.body.appendChild( c );
	const g = c.getContext( '2d' );
	g.lineJoin = g.lineCap = 'round';
	// a 50 m grid
	g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '11px sans-serif';
	for ( let x = Math.floor( ( cx - span ) / 50 ) * 50; x < cx + span; x += 50 ) for ( let z = Math.floor( ( cz - span ) / 50 ) * 50; z < cz + span; z += 50 ) {

		const [ sx, sy ] = scr( x, z );
		if ( sx < 0 || sy < 0 || sx > innerWidth || sy > innerHeight ) continue;
		g.fillRect( sx - 1, sy - 1, 2, 2 );
		if ( x % 100 === 0 && z % 100 === 0 ) g.fillText( x + ',' + z, sx + 3, sy - 3 );

	}

	const label = ( text, x, z, color = '#fff', r = 4 ) => {

		const [ sx, sy ] = scr( x, z );
		g.fillStyle = color; g.strokeStyle = '#000'; g.lineWidth = 3;
		g.beginPath(); g.arc( sx, sy, r, 0, 7 ); g.fill(); g.stroke();
		g.font = 'bold 12px sans-serif';
		g.strokeText( text, sx + 7, sy + 4 ); g.fillText( text, sx + 7, sy + 4 );

	};

	const story = app.story;
	if ( story ) {

		// the path: its width band, then its centreline coloured by clock time
		const P = story.path;
		g.strokeStyle = 'rgba(255,240,200,0.35)'; g.lineWidth = Math.max( 2, 5 * innerWidth / span );
		g.beginPath();
		P.samples.forEach( ( s, i ) => { const [ sx, sy ] = scr( s.x, s.z ); i ? g.lineTo( sx, sy ) : g.moveTo( sx, sy ); } );
		g.stroke();
		g.lineWidth = 2;
		for ( let i = 1; i < P.samples.length; i ++ ) {

			const a = P.samples[ i - 1 ], b = P.samples[ i ];
			const t = i / P.samples.length;
			g.strokeStyle = `hsl(${40 - t * 260},90%,60%)`;
			g.beginPath(); g.moveTo( ...scr( a.x, a.z ) ); g.lineTo( ...scr( b.x, b.z ) ); g.stroke();

		}

		for ( let d = 0; d < P.length; d += 100 ) { const s = P.at( d ); const [ sx, sy ] = scr( s.x, s.z ); g.fillStyle = '#fff'; g.font = '10px sans-serif'; g.fillText( d + 'm', sx + 5, sy + 12 ); }
		for ( const b of story.beats ) if ( b.at !== undefined ) { const s = P.at( b.at ); label( b.id, s.x, s.z, '#ff5' ); }
		for ( const e of story.encounters ?? [] ) label( e.id, e.x, e.z, '#f8a', 3 );
		if ( story.blockers ) for ( const o of story.blockers.debugShapes() ) {

			g.strokeStyle = o.color || 'rgba(255,60,60,0.9)'; g.lineWidth = 2;
			if ( o.r !== undefined && o.b === undefined ) { const [ sx, sy ] = scr( o.x, o.z ); const [ ex ] = scr( o.x + o.r, o.z ); g.beginPath(); g.arc( sx, sy, Math.max( 1, Math.abs( ex - sx ) ), 0, 7 ); g.stroke(); }
			else { g.beginPath(); g.moveTo( ...scr( o.a[ 0 ], o.a[ 1 ] ) ); g.lineTo( ...scr( o.b[ 0 ], o.b[ 1 ] ) ); g.stroke(); }

		}

	}

	for ( const p of app.streams.ponds ) label( 'pond', p.mesh.position.x, p.mesh.position.z, '#08f' );
	const M = app.mammals;
	M.deer.forEach( ( a ) => label( 'deer', a.mesh.position.x, a.mesh.position.z, '#c84', 3 ) );
	M.marmots.forEach( ( a ) => label( '', a.mesh.position.x, a.mesh.position.z, '#bb8', 2 ) );
	M.hares.forEach( ( a ) => label( '', a.mesh.position.x, a.mesh.position.z, '#ddd', 2 ) );
	M.bears.forEach( ( a ) => label( 'bear', a.mesh.position.x, a.mesh.position.z, '#f00', 3 ) );
	app.moreBirds.herons.forEach( ( h ) => label( 'heron', h.pos.x, h.pos.z, '#0ff', 3 ) );
	return { cam: cam.position.toArray(), story: !! story };

}, parseFloat( cx ), parseFloat( cz ), parseFloat( span ) );
await page.screenshot( { path: out } );
console.log( JSON.stringify( notes ) );
await browser.close();
