// Dev helper: a top-down view of part of the valley with the animals and birds marked.
// usage: node tools/map.mjs <out.png> [cx=-30] [cz=540] [height=420] [simSeconds=0]
import puppeteer from 'puppeteer-core';

const [ out, cx = '-30', cz = '540', ht = '420', sim = '0' ] = process.argv.slice( 2 );
const W = 1100, H = 1100;
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist', `--window-size=${W},${H}` ] } );
const page = await browser.newPage();
await page.setViewport( { width: W, height: H } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
await page.goto( `http://localhost:5199/?shot=30&speed=1&t=12&cam=${cx},${ht},${cz},0,-89.9`, { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000, polling: 250 } );
const legend = await page.evaluate( async ( sim ) => {

	const cam = app.camera, p0 = cam.position.clone(), q0 = cam.quaternion.clone();
	for ( let i = 0; i < sim * 20; i ++ ) app.update( 1 / 20 );
	cam.position.copy( p0 ); cam.quaternion.copy( q0 ); cam.updateMatrixWorld();
	app.update = () => {};
	app.render();
	const marks = [];
	const add = ( label, color, x, z ) => marks.push( { label, color, x, z } );
	const M = app.mammals;
	add( 'SPAWN', '#fff', - 5, 508 );
	M.deer.forEach( ( a ) => add( 'deer', '#c84', a.mesh.position.x, a.mesh.position.z ) );
	M.marmots.forEach( ( a ) => add( 'marmot', '#bb8', a.mesh.position.x, a.mesh.position.z ) );
	M.squirrels.forEach( ( a ) => add( 'squirrel', '#f60', a.mesh.position.x, a.mesh.position.z ) );
	M.hares.forEach( ( a ) => add( 'hare', '#ddd', a.mesh.position.x, a.mesh.position.z ) );
	M.bears.forEach( ( a ) => add( 'BEAR', '#f00', a.mesh.position.x, a.mesh.position.z ) );
	const B = app.moreBirds;
	B.herons.forEach( ( h ) => add( 'heron', '#0ff', h.pos.x, h.pos.z ) );
	B.grebes.forEach( ( g ) => add( 'grebe', '#0af', g.pos.x, g.pos.z ) );
	add( 'choughs', '#f0f', B.chough.c.x, B.chough.c.z );
	app.waterfowl.birds.forEach( ( b ) => add( 'fowl', '#ff0', b.pos.x, b.pos.z ) );
	for ( const p of app.streams.ponds ) add( 'pond', '#08f', p.mesh.position.x, p.mesh.position.z );
	const v = new cam.position.constructor();
	const res = [];
	for ( const m of marks ) {

		v.set( m.x, app.terrainData.heightAt( m.x, m.z ), m.z ).project( cam );
		res.push( { ...m, sx: ( v.x * 0.5 + 0.5 ) * innerWidth, sy: ( - v.y * 0.5 + 0.5 ) * innerHeight } );

	}

	const c = document.createElement( 'canvas' );
	c.width = innerWidth; c.height = innerHeight;
	c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;pointer-events:none';
	document.body.appendChild( c );
	const g = c.getContext( '2d' );
	g.font = 'bold 12px sans-serif';
	for ( const m of res ) {

		g.fillStyle = m.color; g.strokeStyle = '#000'; g.lineWidth = 3;
		g.beginPath(); g.arc( m.sx, m.sy, 5, 0, 7 ); g.fill(); g.stroke();
		g.strokeText( m.label, m.sx + 7, m.sy + 4 ); g.fillText( m.label, m.sx + 7, m.sy + 4 );

	}

	// a 50 m grid with world coordinates
	g.fillStyle = '#fff'; g.font = '11px sans-serif';
	for ( let x = Math.floor( ( p0.x - 400 ) / 50 ) * 50; x < p0.x + 400; x += 50 ) for ( let z = Math.floor( ( p0.z - 400 ) / 50 ) * 50; z < p0.z + 400; z += 50 ) {

		v.set( x, app.terrainData.heightAt( x, z ), z ).project( cam );
		const sx = ( v.x * 0.5 + 0.5 ) * innerWidth, sy = ( - v.y * 0.5 + 0.5 ) * innerHeight;
		if ( sx < 0 || sy < 0 || sx > innerWidth || sy > innerHeight ) continue;
		g.fillRect( sx - 1, sy - 1, 2, 2 );
		if ( x % 100 === 0 && z % 100 === 0 ) g.fillText( x + ',' + z, sx + 3, sy - 3 );

	}

	return res.filter( ( m ) => m.sx < 0 || m.sy < 0 || m.sx > innerWidth || m.sy > innerHeight ).map( ( m ) => m.label + ' off map at ' + Math.round( m.x ) + ',' + Math.round( m.z ) );

}, parseFloat( sim ) );
await page.screenshot( { path: out } );
console.log( legend.join( '\n' ) );
await browser.close();
