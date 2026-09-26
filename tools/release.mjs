// Builds one edition and packs it for itch.io.
// usage: node tools/release.mjs horror|nature
//   horror -> larchmere-horror-itch.zip (the main game)
//   nature -> larchmere-itch.zip (the original nature scene)
import { execSync } from 'node:child_process';

const edition = process.argv[ 2 ] === 'nature' ? 'nature' : 'horror';
const zip = edition === 'horror' ? 'larchmere-horror-itch.zip' : 'larchmere-itch.zip';
execSync( 'npx vite build', { stdio: 'inherit', env: { ...process.env, VITE_EDITION: edition } } );
execSync( `node tools/zip.mjs ${zip}`, { stdio: 'inherit' } );
