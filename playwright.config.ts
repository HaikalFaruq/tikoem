import { defineConfig, devices } from '@playwright/test'

// Port khusus E2E supaya tidak pernah memakai server preview lama yang masih jalan.
const PORT = 4318

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    // E2E belum memanggil backend. Alamat backend lokal ini cukup supaya klien Convex bisa dibuat saat build.
    env: { VITE_CONVEX_URL: 'http://127.0.0.1:3210' },
  },
})
