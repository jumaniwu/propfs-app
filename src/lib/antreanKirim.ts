// ============================================================
// PropFS — Antrean kiriman ke cloud, satu jalur per proyek
//
// KENAPA BERKAS INI ADA.
//
// Setiap perubahan di Realisasi Biaya mengirim SELURUH proyek ke server,
// dan tidak ada yang menunggu kiriman sebelumnya selesai. Dua akibatnya:
//
//   1. Kiriman yang menggantung di jaringan seluler tidak pernah selesai,
//      penanda "Menyimpan…" menyala selamanya, dan perangkat lain tidak
//      pernah melihat perubahannya. Itu yang terjadi ketika aplikasi di HP
//      menyimpan 99 transaksi sementara web hanya melihat 94.
//
//   2. Kiriman bisa TIBA TIDAK BERURUTAN. Versi lama yang tersendat lalu
//      tiba sesudah versi baru menimpanya di server — tanpa galat apa pun,
//      karena dari sisi server keduanya sama-sama penyimpanan yang sah.
//
// Antrean ini memastikan hanya satu kiriman berjalan per proyek. Perubahan
// yang datang selagi kiriman berjalan tidak ikut berangkat; yang TERBARU
// disimpan, lalu dikirim begitu kiriman sebelumnya selesai. Sepuluh ketukan
// beruntun menjadi paling banyak dua kiriman, dan yang terakhir selalu yang
// paling baru.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

export function buatAntrean<T>(
  kirim: (item: T) => Promise<boolean>,
  kunci: (item: T) => string,
): (item: T) => Promise<boolean> {
  const berjalan = new Map<string, Promise<boolean>>()
  const menunggu = new Map<string, T>()

  return function kirimBerurut(item: T): Promise<boolean> {
    const k = kunci(item)
    const sedang = berjalan.get(k)
    if (sedang) {
      // Yang lama digantikan: hanya versi terbaru yang perlu sampai.
      menunggu.set(k, item)
      return sedang
    }

    const jalan = (async () => {
      let sekarang = item
      for (;;) {
        let ok = false
        try { ok = await kirim(sekarang) } catch { ok = false }
        // Diperiksa dan dilepas dalam SATU langkah sinkron, tanpa `await` di
        // antaranya. Kalau dilepas belakangan (misalnya di .finally), ada
        // celah sesaat di mana kiriman baru masuk ke `menunggu` tetapi tidak
        // ada lagi yang akan mengirimnya — perubahan itu hilang diam-diam.
        const berikut = menunggu.get(k)
        if (berikut === undefined) {
          berjalan.delete(k)
          return ok
        }
        menunggu.delete(k)
        sekarang = berikut
      }
    })()

    berjalan.set(k, jalan)
    return jalan
  }
}

/** Kalimat untuk kegagalan kirim — yang dibatalkan karena waktu habis dikatakan apa adanya. */
export function pesanKirimGagal(e: unknown): string {
  const nama = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : ''
  const teks = e instanceof Error ? e.message
    : e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message)
    : typeof e === 'string' ? e : ''
  if (nama === 'AbortError' || /abort/i.test(teks)) {
    return 'Waktu habis saat mengirim ke server — data tetap aman di perangkat ini.'
      + ' Ketuk untuk mencoba lagi.'
  }
  return teks || 'Gagal mengirim ke server.'
}
