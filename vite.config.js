import { defineConfig } from 'vite';

// itch.io serves games from a sub-path inside an iframe, so every asset URL must be relative.
export default defineConfig( {
	base: './',
	build: {
		target: 'es2022',
		assetsInlineLimit: 0,
		chunkSizeWarningLimit: 4000,
		sourcemap: false,
	},
	server: { port: 5199, strictPort: true },
} );
