import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relativa asset-URL:er fungerar både lokalt och under /repository-name/ på GitHub Pages.
export default defineConfig({ base: './', plugins: [react()] });
