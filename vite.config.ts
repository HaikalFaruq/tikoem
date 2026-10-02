import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        // Library jarang berubah: dipisah supaya update aplikasi cukup mengunduh ulang kode kita saja.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'motion', test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/ },
            { name: 'convex', test: /node_modules[\\/]convex[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Tikoem — Titik kumpul yang adil buat semua',
        short_name: 'Tikoem',
        description: 'Tiap orang kirim lokasinya, Tikoem carikan tempat ketemuan yang waktu tempuhnya paling seimbang.',
        lang: 'id',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        // Warna kertas peta dari identitas terpilih (docs/desain/identitas.html). Ikon PNG menyusul di PR ikon PWA.
        theme_color: '#F2F4FF',
        background_color: '#F2F4FF',
        icons: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Peta (~1,5 MB) tidak ikut diunduh di latar belakang saat beranda dibuka, supaya tidak menghabiskan kuota.
        // Peta disimpan saat pertama kali dipakai. Nama filenya ber-hash, jadi aman disajikan dari cache.
        globIgnores: ['**/PetaLive-*', '**/maplibre-gl-worker-*'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/(PetaLive|maplibre-gl-worker)-[\w-]+\.(js|css)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'tikoem-peta', expiration: { maxEntries: 8 } },
          },
        ],
      },
    }),
  ],
})
