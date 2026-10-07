/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/visual/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});