import { defineConfig } from 'vite';

// Two games from one source: the horror walk (the default) and the original nature scene.
// A build carries only its own edition's code: __HORROR__ is a literal there, so the other
// edition's branches (and the chunks they import) are dropped. The dev server serves both,
// choosing at runtime from the URL (?edition=nature).
export default defineConfig( ( { command } ) => {

	const edition = process.env.VITE_EDITION === 'nature' ? 'nature' : 'horror';
	const build = command === 'build';
	return {
		// itch.io serves games from a sub-path inside an iframe, so every asset URL must be relative.
		base: './',
		define: {
			__HORROR__: build ? JSON.stringify( edition === 'horror' ) : '( new URLSearchParams( location.search ).get( "edition" ) !== "nature" )',
		},
		plugins: [ {
			name: 'larchmere-edition',
			transformIndexHtml( html ) {

				// the horror build's page: its own title and loading screen
				if ( ! build || edition !== 'horror' ) return html;
				return html
					.replace( /<title>.*?<\/title>/, '<title>Larchmere</title>' )
					.replace( /<meta name="description"[^>]*>/, '<meta name="description" content="Late October. You row across the lake at golden hour to fetch the herder home." />' )
					.replace( '<p class="subtitle">an autumn evening in the high valley</p>', '<p class="subtitle">late October, the last evening of the season</p>' )
					.replace( 'Enter the valley', 'Begin' )
					.replace( '<body>', '<body class="horror">' );

			},
		} ],
		build: {
			target: 'es2022',
			assetsInlineLimit: 0,
			chunkSizeWarningLimit: 4000,
			sourcemap: false,
		},
		server: { port: 5199, strictPort: true },
	};

} );
