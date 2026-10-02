import { defineConfig, devices } from '@playwright/test'
import { URL_BACKEND } from './e2e/backend'

// Port khusus E2E supaya tidak pernah memakai server preview lama yang masih jalan.
const PORT = 4318

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  globalSetup: './e2e/siapkan-backend.ts',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: [
    {
      // Kalau `npx convex dev` sudah jalan di terminal lain, backend itu yang dipakai.
      command: 'npx convex dev',
      url: `${URL_BACKEND}/version`,
      reuseExistingServer: true,
      // Di mesin baru, termasuk CI, binary backend Convex perlu diunduh dulu.
      timeout: 180_000,
    },
    {
      command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: false,
      env: { VITE_CONVEX_URL: URL_BACKEND },
    },
  ],
})
