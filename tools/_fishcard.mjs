// Dev helper: renders each fish model side-on on a plain background (a model card).
import puppeteer from 'puppeteer-core';
const out = process.argv[ 2 ];
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: [ '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage();
await page.setViewport( { width: 1200, height: 700 } );
page.on( 'pageerror', ( e ) => console.log( '[pageerror]', e.message ) );
await page.goto( 'http://localhost:5199/?shot=30&speed=0&t=12&cam=0,60,1500,0,0', { waitUntil: 'load' } );
await page.waitForFunction( 'window.__shotReady === true', { timeout: 180000 } );
await page.evaluate( async () => {
	const THREE = await import( '/node_modules/.vite/deps/three.js' );
	const { fishGeometry } = await import( '/src/fauna/fishModels.js' );
	const { creatureMaterial } = await import( '/src/fauna/creature.js' );
	app.update = () => {};
	const cam = app.camera;
	const base = cam.position.clone().add( new THREE.Vector3( 0, 0, - 1.2 ) );
	const mat = creatureMaterial();
	[ 'perch', 'char', 'minnow', 'grayling' ].forEach( ( s, i ) => {
		const m = new THREE.Mesh( fishGeometry( s ), mat );
		m.position.copy( base ).add( new THREE.Vector3( ( i % 2 - 0.5 ) * 0.55, ( 0.5 - Math.floor( i / 2 ) ) * 0.3, 0 ) );
		m.rotation.y = - Math.PI / 2;
		m.layers.enable( 1 );
		app.scene.add( m );
	} );
	app.scene.updateMatrixWorld();
	app.render();
} );
await page.screenshot( { path: out } );
await browser.close();
console.log( out );
