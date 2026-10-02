import { defineConfig } from 'vitest/config'

// Terpisah dari vite.config.ts supaya plugin PWA tidak ikut jalan saat unit test.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'convex/**/*.test.ts'],
    environment: 'node',
    // Fondasi belum punya logika. Unit test pertama datang bersama skema Convex dan room.
    passWithNoTests: true,
  },
})
