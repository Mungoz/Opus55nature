// Reference photos from Wikimedia Commons: searches, downloads the first few results of each
// term into shots/refs/<tag>/ and lays them out on one labelled contact sheet.
// usage: node tools/refs.mjs <tag> <perTerm> "term 1" "term 2" ...
// (the files keep their Commons titles, for attribution; shots/ is not committed)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const [ tag, perTerm = '6', ...terms ] = process.argv.slice( 2 );
const UA = { 'User-Agent': 'LarchmereRefs/1.0 (reference research for a game; contact via github Mungoz)' };
const dir = path.join( 'shots/refs', tag );
fs.mkdirSync( dir, { recursive: true } );
const got = [];
for ( const t of terms ) {

	const u = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent( t )}&gsrnamespace=6&gsrlimit=30&prop=imageinfo&iiprop=url|size&iiurlwidth=800&format=json`;
	const j = await ( await fetch( u, { headers: UA } ) ).json();
	const pages = Object.values( j.query?.pages || {} ).sort( ( a, b ) => a.index - b.index );
	let n = 0;
	for ( const p of pages ) {

		const ii = p.imageinfo?.[ 0 ];
		if ( ! ii || ! /\.(jpe?g)$/i.test( p.title ) || n >= + perTerm ) continue;
		const name = p.title.replace( 'File:', '' ).replace( /[^\w.\-() ]+/g, '_' ).slice( 0, 90 );
		const file = path.join( dir, name );
		try {

			if ( ! fs.existsSync( file ) ) {

				const r = await fetch( ii.thumburl, { headers: UA } );
				if ( ! r.ok ) continue;
				fs.writeFileSync( file, Buffer.from( await r.arrayBuffer() ) );

			}

			got.push( { file, label: `${got.length}: ${name}` } );
			n ++;

		} catch ( e ) { /* skip */ }

	}

}

console.log( got.map( ( g ) => g.label ).join( '\n' ) );
// contact sheet, 4 across
const CW = 480, CH = 330, cols = 4, rows = Math.ceil( got.length / cols );
if ( ! got.length ) process.exit( 0 );
const browser = await puppeteer.launch( { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true } );
const page = await browser.newPage();
await page.setViewport( { width: CW * cols, height: CH * rows } );
const imgs = got.map( ( g ) => ( { name: g.label, src: 'data:image/jpeg;base64,' + fs.readFileSync( g.file ).toString( 'base64' ) } ) );
await page.evaluate( async ( imgs, CW, CH, cols ) => {

	document.body.style.margin = 0;
	const c = document.createElement( 'canvas' ); c.width = CW * cols; c.height = CH * Math.ceil( imgs.length / cols ); document.body.appendChild( c );
	const g = c.getContext( '2d' ); g.fillStyle = '#111'; g.fillRect( 0, 0, c.width, c.height );
	for ( let i = 0; i < imgs.length; i ++ ) {

		const im = new Image(); im.src = imgs[ i ].src;
		try { await im.decode(); } catch ( e ) { continue; }
		const x = ( i % cols ) * CW, y = Math.floor( i / cols ) * CH;
		const s = Math.min( CW / im.width, CH / im.height );
		const w = im.width * s, h = im.height * s;
		g.drawImage( im, x + ( CW - w ) / 2, y + ( CH - h ) / 2, w, h );
		g.font = 'bold 14px sans-serif'; g.fillStyle = '#ff0'; g.strokeStyle = '#000'; g.lineWidth = 3;
		const t = imgs[ i ].name.slice( 0, 48 );
		g.strokeText( t, x + 6, y + 18 ); g.fillText( t, x + 6, y + 18 );

	}

}, imgs, CW, CH, cols );
await page.screenshot( { path: path.join( 'shots/refs', tag + '.jpg' ), type: 'jpeg', quality: 82 } );
await browser.close();
console.log( 'sheet: shots/refs/' + tag + '.jpg' );
