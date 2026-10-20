import { setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// Vite mem-bundle worker MapLibre beserta modul bersamanya jadi satu file. Tanpa ini worker-nya hilang setelah build.
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(urlWorker)

/** Peta dasar OpenFreeMap: gratis, tanpa API key. Positron tenang supaya pin stiker yang menonjol. */
export const GAYA_PETA = {
  terang: 'https://tiles.openfreemap.org/styles/positron',
  gelap: 'https://tiles.openfreemap.org/styles/dark',
}
export const JAKARTA: [number, number] = [106.8456, -6.2088]
