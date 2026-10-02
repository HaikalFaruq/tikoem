import type { Titik } from '../src/domain/lokasi'
import { bacaTempat, kueriOverpass, pilihKandidat, radiusPencarianMeter, type Tempat } from '../src/domain/tempat'
import { PENGENAL } from './pengenal'

const UTAMA = 'https://overpass-api.de/api/interpreter'
const CADANGAN = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'

/**
 * Server publik Overpass sering sibuk. Saat diuji 2026-10-03, server utama beberapa kali menjawab 504 lalu berhasil
 * beberapa detik kemudian, maps.mail.ru kadang butuh 23 detik, dan dua mirror lain tidak menjawab sama sekali.
 * Jadi urutannya: server utama, server cadangan, lalu server utama sekali lagi.
 */
const PERCOBAAN = [UTAMA, CADANGAN, UTAMA]


/** Kalau tempat yang ditemukan kurang dari ini, radius pencarian diperluas sekali. */
const MIN_TEMPAT = 5

export type OpsiOverpass = {
  ambil?: typeof fetch
  /** Server berikutnya ikut ditanya setelah jeda ini. */
  jedaCadanganMs?: number
  /** Batas waktu satu pencarian, untuk semua server sekaligus. */
  batasMs?: number
}

export class OverpassGagal extends Error {
  override name = 'OverpassGagal'
}

/**
 * Tempat di sekitar titik tengah, yang terdekat lebih dulu.
 * Hasilnya bisa kosong kalau memang tidak ada tempat, tapi melempar `OverpassGagal` kalau semua server gagal.
 * Dipanggil dari action alur hitung, karena `fetch` hanya boleh dipakai di action.
 */
export async function cariTempatSekitar(tengah: Titik, radiusTemanMeter: number, opsi: OpsiOverpass = {}): Promise<Tempat[]> {
  const radius = radiusPencarianMeter(radiusTemanMeter)
  const dekat = pilihKandidat(bacaTempat(await mintaOverpass(kueriOverpass(tengah, radius), opsi), tengah))
  if (dekat.length >= MIN_TEMPAT) return dekat
  // Daerah yang jarang tempatnya diperluas sekali saja, supaya tetap muat di batas waktu hitung.
  return pilihKandidat(bacaTempat(await mintaOverpass(kueriOverpass(tengah, radius * 2.5), opsi), tengah))
}

type Percobaan = { henti: AbortController; selesai: boolean; janji: Promise<unknown> }

async function mintaOverpass(kueri: string, { ambil = fetch, jedaCadanganMs = 4000, batasMs = 20_000 }: OpsiOverpass) {
  const tanya = async (server: string, sinyal: AbortSignal): Promise<unknown> => {
    const jawaban = await ambil(server, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': PENGENAL },
      body: new URLSearchParams({ data: kueri }),
      signal: sinyal,
    })
    if (!jawaban.ok) {
      await jawaban.body?.cancel()
      throw new OverpassGagal(`${server} menjawab HTTP ${jawaban.status}`)
    }
    const isi: unknown = await jawaban.json()
    // Overpass bisa menjawab 200 dengan `remark` berisi galat, misalnya kalau kuerinya kehabisan waktu di server.
    const catatan = typeof isi === 'object' && isi !== null && 'remark' in isi ? isi.remark : undefined
    if (typeof catatan === 'string' && /error/i.test(catatan)) throw new OverpassGagal(`${server}: ${catatan}`)
    return isi
  }

  // Server berikutnya ditanya setelah jeda, atau langsung begitu server sebelumnya gagal.
  // Tiap percobaan punya AbortController sendiri: menghentikan fetch yang sudah selesai dibaca membuat runtime Convex melempar galat.
  const daftar: Percobaan[] = []
  for (const [urutan, server] of PERCOBAAN.entries()) {
    const henti = new AbortController()
    const sebelumnya = daftar.at(-1)?.janji
    const giliran = sebelumnya
      ? Promise.race([tunggu(urutan * jedaCadanganMs, henti.signal), sebelumnya.then(() => TIDAK_PERNAH, () => undefined)])
      : Promise.resolve()
    const percobaan: Percobaan = { henti, selesai: false, janji: TIDAK_PERNAH }
    percobaan.janji = giliran
      .then(() => tanya(server, henti.signal))
      .finally(() => {
        percobaan.selesai = true
      })
    daftar.push(percobaan)
  }
  const hentikanSisanya = () => daftar.filter((p) => !p.selesai).forEach((p) => p.henti.abort())
  const batas = setTimeout(hentikanSisanya, batasMs)

  try {
    return await Promise.any(daftar.map((p) => p.janji))
  } catch (galat) {
    const sebab = galat instanceof AggregateError ? galat.errors.map(String).join('; ') : String(galat)
    throw new OverpassGagal(`Semua server Overpass gagal: ${sebab}`)
  } finally {
    clearTimeout(batas)
    // Jawaban pertama sudah dipakai. Percobaan lain dihentikan dan ditunggu sampai benar-benar berhenti,
    // karena Convex memperingatkan ada fetch yang menggantung kalau action selesai lebih dulu.
    hentikanSisanya()
    await Promise.allSettled(daftar.map((p) => p.janji))
  }
}

/** Dipakai sebagai "server sebelumnya berhasil": giliran server berikutnya tinggal menunggu jeda. */
const TIDAK_PERNAH = new Promise<never>(() => {})

function tunggu(ms: number, sinyal: AbortSignal) {
  return new Promise<void>((selesai, gagal) => {
    const jam = setTimeout(selesai, ms)
    sinyal.addEventListener(
      'abort',
      () => {
        clearTimeout(jam)
        gagal(new OverpassGagal('Pencarian dihentikan'))
      },
      { once: true },
    )
  })
}
