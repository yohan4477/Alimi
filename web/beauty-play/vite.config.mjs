import {localizedGameMetadata} from './html-metadata.mjs';
import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),base:'/beauty-play/',plugins:[react(),localizedGameMetadata()],build:{outDir:fileURLToPath(new URL('../../dist/beauty-play',import.meta.url)),emptyOutDir:false,assetsDir:'bundle'}});
