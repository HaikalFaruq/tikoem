import { execFileSync } from 'node:child_process'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { PAKAI_LAYANAN_TIRUAN, URL_BACKEND, URL_TIRUAN } from './backend'

/** Env Convex yang mengarahkan layanan luar ke server tiruan. */
const ENV_TIRUAN: Record<string, string> = {
  OVERPASS_URL: `${URL_TIRUAN}/overpass`,
  ORS_URL: `${URL_TIRUAN}/ors`,
  NOMINATIM_URL: `${URL_TIRUAN}/nominatim/search`,
}

const convexEnv = (...argumen: string[]) => execFileSync('npx', ['convex', 'env', ...argumen], { encoding: 'utf8' })

/** Nama env yang sudah terisi. Nilainya tidak dibaca, supaya key ORS asli tidak ikut terbawa ke proses test. */
const namaEnvTerisi = () => new Set(convexEnv('list').split('\n').map((baris) => baris.split('=')[0].trim()).filter(Boolean))

export default async function siapkanBackend() {
  // Backend sudah menerima koneksi sebelum `npx convex dev` selesai mengirim fungsi, jadi tunggu sampai fungsi room bisa dipanggil.
  const convex = new ConvexHttpClient(URL_BACKEND)
  const batas = Date.now() + 120_000
  for (;;) {
    try {
      await convex.query(api.room.lihat, { kode: 'ZZZZZZ' })
      break
    } catch (galat) {
      if (Date.now() > batas) throw galat
      await new Promise((lanjut) => setTimeout(lanjut, 1000))
    }
  }

  if (!PAKAI_LAYANAN_TIRUAN) return

  const sudahAda = namaEnvTerisi()
  const lama = new Map([...sudahAda].filter((nama) => nama in ENV_TIRUAN).map((nama) => [nama, convexEnv('get', nama).trim()]))
  for (const [nama, nilai] of Object.entries(ENV_TIRUAN)) convexEnv('set', nama, nilai)
  // Layanan tiruan tidak memeriksa key. Key asli, kalau ada, dibiarkan dan hanya dikirim ke server tiruan di laptop sendiri.
  const tambahKunci = !sudahAda.has('ORS_API_KEY')
  if (tambahKunci) convexEnv('set', 'ORS_API_KEY', 'kunci-tiruan')

  // Deployment CI dibuang setelah dipakai. Di laptop, env dikembalikan seperti semula.
  return async () => {
    if (process.env.CI) return
    for (const nama of Object.keys(ENV_TIRUAN)) {
      const nilaiLama = lama.get(nama)
      if (nilaiLama === undefined) convexEnv('remove', nama)
      else convexEnv('set', nama, nilaiLama)
    }
    if (tambahKunci) convexEnv('remove', 'ORS_API_KEY')
  }
}
