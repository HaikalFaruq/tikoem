import { defineConfig } from 'vitest/config'

// Terpisah dari vite.config.ts supaya plugin PWA tidak ikut jalan saat unit test.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'convex/**/*.test.ts'],
    environment: 'node',
    // Test fungsi Convex memakai convex-test di environment edge-runtime (lihat kepala convex/*.test.ts).
    server: { deps: { inline: ['convex-test'] } },
  },
})
