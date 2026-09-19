// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import node from '@astrojs/node';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  output: 'server',
  adapter: node({ mode: 'standalone' }),

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": "./src"
      }
    },
    // Dev only: allow extra hostnames (e.g. the TLS test proxy) without
    // editing this file — run with DEV_ALLOWED_HOSTS=elk.maw.best pnpm dev.
    // Vite blocks non-localhost hosts by default (DNS-rebinding protection);
    // the setting has no effect on production builds.
    ...(process.env.DEV_ALLOWED_HOSTS
      ? { server: { allowedHosts: process.env.DEV_ALLOWED_HOSTS.split(",") } }
      : {}),
  },

  security: {
    checkOrigin: false,
  }
});
