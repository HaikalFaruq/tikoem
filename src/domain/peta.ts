import { JARI_JARI_BUMI_METER, type Titik } from './lokasi'
import { titikTengah } from './titikTengah'

/** Pasangan [bujur, lintang], urutan yang dipakai GeoJSON dan MapLibre. */
export type Koordinat = [number, number]

/**
 * Cincin poligon berbentuk lingkaran di permukaan bumi, untuk area samar di sekitar lokasi yang disamarkan.
 * Titik pertama diulang di akhir, sesuai aturan cincin GeoJSON.
 */
export function lingkaranGeo(pusat: Titik, radiusMeter: number, jumlahTitik = 48): Koordinat[] {
  const derajatLat = (radiusMeter / JARI_JARI_BUMI_METER) * (180 / Math.PI)
  const derajatLng = derajatLat / Math.cos((pusat.lat * Math.PI) / 180)
  const cincin: Koordinat[] = []
  for (let i = 0; i < jumlahTitik; i++) {
    const sudut = (2 * Math.PI * i) / jumlahTitik
    cincin.push([pusat.lng + derajatLng * Math.cos(sudut), pusat.lat + derajatLat * Math.sin(sudut)])
  }
  cincin.push(cincin[0])
  return cincin
}

export type TitikLayar = { x: number; y: number }

/**
 * Penanda di layar: titik jangkarnya di tengah bawah (anchor `bottom` MapLibre), lebar dan tingginya dalam piksel.
 * Penanda yang `diam` tidak ikut digeser, misalnya bintang tempat kumpul, supaya tetap tepat di tempatnya.
 */
export type KotakPenanda = TitikLayar & { lebar: number; tinggi: number; diam?: boolean }

/**
 * Geseran layar (piksel) supaya penanda yang berdekatan di layar tidak saling menutupi (#65).
 * Ini sering terjadi karena lokasi dibulatkan ke grid ~110 m, dan beberapa kafe sering ada di satu ruas jalan.
 * Kotak yang bertumpuk didorong menjauh lewat sumbu yang tumpangannya paling kecil, berulang sampai semuanya lepas
 * dengan celah `celahPx`. Penanda yang tidak bertumpuk tidak digeser, jadi yang sendirian tetap di lokasinya.
 */
export function pisahkanPenanda(kotak: readonly KotakPenanda[], celahPx = 4, putaran = 80): TitikLayar[] {
  const posisi = kotak.map(({ x, y }) => ({ x, y }))
  for (let n = 0; n < putaran; n++) {
    let adaTumpuk = false
    for (let i = 0; i < kotak.length; i++) {
      for (let j = i + 1; j < kotak.length; j++) {
        const a = kotak[i]
        const b = kotak[j]
        if (a.diam && b.diam) continue
        const dx = posisi[j].x - posisi[i].x
        // Kotak tumbuh ke atas dari jangkarnya, jadi bandingkan titik tengah kotaknya.
        const dy = posisi[j].y - b.tinggi / 2 - (posisi[i].y - a.tinggi / 2)
        const tumpukX = (a.lebar + b.lebar) / 2 + celahPx - Math.abs(dx)
        const tumpukY = (a.tinggi + b.tinggi) / 2 + celahPx - Math.abs(dy)
        if (tumpukX <= 0 || tumpukY <= 0) continue
        adaTumpuk = true
        // Dua penanda di titik yang sama: yang kemudian ke kanan, supaya hasilnya selalu sama.
        const geser = tumpukX <= tumpukY ? { x: (dx < 0 ? -1 : 1) * tumpukX, y: 0 } : { x: 0, y: (dy < 0 ? -1 : 1) * tumpukY }
        const bagianA = a.diam ? 0 : b.diam ? 1 : 0.5
        posisi[i].x -= geser.x * bagianA
        posisi[i].y -= geser.y * bagianA
        posisi[j].x += geser.x * (1 - bagianA)
        posisi[j].y += geser.y * (1 - bagianA)
      }
    }
    if (!adaTumpuk) break
  }
  return posisi.map((p, i) => ({ x: Math.round(p.x - kotak[i].x), y: Math.round(p.y - kotak[i].y) }))
}

/** Kotak terkecil yang memuat semua titik: [[barat, selatan], [timur, utara]]. */
export function batasPeta(titik: readonly Titik[]): [Koordinat, Koordinat] | null {
  if (titik.length === 0) return null
  const lat = titik.map((t) => t.lat)
  const lng = titik.map((t) => t.lng)
  return [
    [Math.min(...lng), Math.min(...lat)],
    [Math.max(...lng), Math.max(...lat)],
  ]
}

/**
 * Titik awal peta "pilih di peta" (#53): lokasiku yang sudah masuk, kalau belum ada titik tengah lokasi teman,
 * kalau belum ada juga `null` (peta mulai dari Jakarta).
 */
export function titikAwalPilih(lokasiSaya: Titik | null, lokasiTeman: readonly Titik[]): Titik | null {
  return lokasiSaya ?? titikTengah(lokasiTeman)?.titik ?? null
}
