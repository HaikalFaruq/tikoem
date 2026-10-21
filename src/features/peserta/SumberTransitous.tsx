/** Halaman sumber data Transitous. Link ini syarat pemakaian Transitous, jadi harus terlihat di layar (#58). */
const SUMBER_TRANSITOUS = 'https://transitous.org/sources/'

/** Batas hitungan transportasi umum, beserta link ke sumber datanya. */
export function KeteranganTransportasiUmum({ className }: { className?: string }) {
  return (
    <p className={`text-sm text-teks-redup ${className ?? ''}`} data-keterangan-transportasi-umum>
      Waktu tempuhnya dihitung untuk KRL dan TransJakarta, MRT dan LRT belum. Rute dari{' '}
      <a href={SUMBER_TRANSITOUS} target="_blank" rel="noopener noreferrer" className="font-semibold text-teks underline">
        Transitous
      </a>
      .
    </p>
  )
}
