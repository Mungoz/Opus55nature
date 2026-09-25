import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
await page.setViewport( { width: 640, height: 360 } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
await page.goto( 'http://localhost:5199/?shot=30&speed=1&t=13', { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000 } );
const res = await page.evaluate( async () => {

	const M = app.mammals;
	const all = [ ...M.deer.map( ( a ) => [ 'deer', a ] ), ...M.marmots.map( ( a ) => [ 'marmot', a ] ), ...M.squirrels.map( ( a ) => [ 'squirrel', a ] ), ...M.hares.map( ( a ) => [ 'hare', a ] ), ...M.bears.map( ( a ) => [ 'bear', a ] ) ];
	const worst = {};
	for ( let f = 0; f < 4000; f ++ ) {

		app.update( 1 / 20 );
		if ( f % 7 ) continue;
		app.scene.updateMatrixWorld( true );
		for ( const [ n, a ] of all ) {

			const m = a.mesh;
			const pad = m.boundingSphere;
			m.boundingSphere = null;
			m.computeBoundingSphere();
			const t = m.boundingSphere;
			m.boundingSphere = pad;
			// fraction of the padded radius used
			const need = ( t.center.distanceTo( pad.center ) + t.radius ) / pad.radius;
			worst[ n ] = Math.max( worst[ n ] || 0, need );

		}

	}

	for ( const k in worst ) worst[ k ] = +worst[ k ].toFixed( 3 );
	return { worst, radii: all.map( ( [ n, a ] ) => n + ':' + a.mesh.boundingSphere.radius.toFixed( 2 ) ).filter( ( x, i, s ) => s.indexOf( x ) === i ) };

} );
console.log( JSON.stringify( res ) );
await browser.close();
