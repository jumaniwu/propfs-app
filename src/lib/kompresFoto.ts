// ============================================================
// PropFS — Mengecilkan foto sebelum dikirim ke AI
//
// Foto dari kamera ponsel hari ini berukuran 3–8 MB. Ia dibaca apa adanya
// menjadi base64 — yang menggelembungkannya sekitar sepertiga lagi — lalu
// dikirim utuh. Selama browser memanggil Google langsung, itu "hanya" lambat.
// Sejak kuncinya dipindah ke server, foto yang sama menempuh dua perjalanan:
// dari ponsel ke server kami, lalu dari server kami ke Google. Yang tadinya
// lambat menjadi dua kali lambat, dan yang menanggungnya adalah orang di
// lapangan dengan sinyal seadanya.
//
// Lebih dari itu: badan permintaan ke fungsi serverless dibatasi beberapa
// megabyte. Foto yang cukup besar tidak menjadi lambat — ia GAGAL, dengan
// galat yang tidak menyebut ukuran sama sekali.
//
// Dan tidak ada yang didapat dari mengirimnya sebesar itu. Yang dibaca AI
// adalah tulisan pada nota; 1280 piksel sisi terpanjang sudah jauh melampaui
// yang dibutuhkan untuk itu, dan menghasilkan berkas belasan kali lebih kecil.
// Ukuran yang berlebih hanya menambah waktu tunggu dan biaya token masukan.
//
// Bagian hitungannya dipisah supaya bisa diuji di Node tanpa DOM.
// ============================================================

/**
 * Sisi terpanjang setelah dikecilkan.
 *
 * Gemini memproses gambar dalam petak 768 piksel, jadi detail di atas itu
 * sebagian besar terbuang sebelum sempat dibaca. 1280 memberi kelonggaran
 * cukup untuk cetakan kecil pada nota tanpa membayar byte yang tidak dipakai.
 */
export const SISI_MAKS = 1280

/** Mutu JPEG. 0.8 masih tajam untuk teks, jauh lebih kecil daripada 1.0. */
export const MUTU = 0.8

/**
 * Ukuran yang masih dianggap wajar untuk satu lampiran.
 *
 * Di atas ini, foto dikecilkan sekali lagi dengan mutu lebih rendah. Sebabnya
 * bukan batas teknis melainkan waktu tunggu: tiap 100 KB tambahan berarti
 * detik tambahan pada sambungan seluler di lapangan, dua kali — sekali ke
 * server kami, sekali dari server kami ke Google.
 */
export const TARGET_BYTE = 400_000

/**
 * Ambang aman untuk satu permintaan, dalam byte base64.
 *
 * Fungsi serverless membatasi badan permintaan; melewatinya berarti gagal
 * total, bukan sekadar lambat. Angka ini sengaja jauh di bawah batas itu
 * karena satu pesan bisa membawa beberapa lampiran sekaligus.
 */
export const BATAS_KIRIM = 3_000_000

export interface Ukuran { lebar: number; tinggi: number }

/**
 * Ukuran setelah dikecilkan, dengan perbandingan sisi dipertahankan.
 *
 * Gambar yang sudah lebih kecil daripada batas TIDAK diperbesar: memperbesar
 * tidak menambah satu pun detail yang bisa dibaca, hanya menambah byte.
 */
export function ukuranTarget(lebar: number, tinggi: number, maks = SISI_MAKS): Ukuran {
  const l = Math.max(0, Math.floor(Number(lebar) || 0))
  const t = Math.max(0, Math.floor(Number(tinggi) || 0))
  if (!l || !t) return { lebar: 0, tinggi: 0 }

  const sisiTerpanjang = Math.max(l, t)
  if (sisiTerpanjang <= maks) return { lebar: l, tinggi: t }

  const rasio = maks / sisiTerpanjang
  // Dibulatkan ke atas supaya sisi yang pendek tidak pernah menjadi nol pada
  // gambar yang sangat memanjang — kanvas berukuran nol menghasilkan berkas
  // kosong, dan kegagalannya baru terlihat setelah AI menjawab "tidak ada apa-apa".
  return { lebar: Math.max(1, Math.round(l * rasio)), tinggi: Math.max(1, Math.round(t * rasio)) }
}

/** Perkiraan ukuran byte dari panjang teks base64. */
export function byteBase64(base64: unknown): number {
  const t = String(base64 ?? '')
  if (!t) return 0
  const padding = t.endsWith('==') ? 2 : t.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((t.length * 3) / 4) - padding)
}

/** "2,4 MB" — untuk dikatakan kepada pemakainya, bukan jumlah byte mentah. */
export function ukuranTampil(byte: unknown): string {
  const b = Number(byte) || 0
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** Apakah kumpulan lampiran ini masih muat dikirim dalam satu permintaan. */
export function muatDikirim(base64Semua: readonly string[], batas = BATAS_KIRIM): boolean {
  return (base64Semua ?? []).reduce((j, b) => j + byteBase64(b), 0) <= batas
}

// ── Bagian yang membutuhkan browser ─────────────────────────────────────────

/** Hanya gambar yang dikecilkan; PDF dan lainnya diteruskan apa adanya. */
export const bisaDikecilkan = (mime: unknown): boolean =>
  /^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(String(mime ?? ''))

export interface HasilKompres {
  base64Data: string
  mimeType: string
  /** Ukuran sebelum & sesudah, untuk dicatat maupun ditampilkan. */
  byteAsal: number
  byteAkhir: number
}

/**
 * Kecilkan satu berkas gambar menjadi JPEG yang cukup untuk dibaca AI.
 *
 * Tidak pernah melempar: bila apa pun gagal — format yang tidak bisa dibaca
 * kanvas, gambar rusak — berkas ASLINYA yang dikembalikan. Kegagalan
 * mengecilkan tidak boleh berubah menjadi kegagalan mengirim nota, karena yang
 * satu merugikan sedikit dan yang lain menghentikan pekerjaan.
 */
export async function kecilkanFoto(berkas: File, maks = SISI_MAKS): Promise<HasilKompres> {
  const asli = async (): Promise<HasilKompres> => {
    const b64 = await bacaBase64(berkas)
    return { base64Data: b64, mimeType: berkas.type, byteAsal: berkas.size, byteAkhir: berkas.size }
  }

  if (!bisaDikecilkan(berkas.type)) return asli()

  try {
    const bitmap = await createImageBitmap(berkas)
    const { lebar, tinggi } = ukuranTarget(bitmap.width, bitmap.height, maks)
    if (!lebar || !tinggi) { bitmap.close?.(); return asli() }

    const kanvas = document.createElement('canvas')
    kanvas.width = lebar
    kanvas.height = tinggi
    const ctx = kanvas.getContext('2d')
    if (!ctx) { bitmap.close?.(); return asli() }
    ctx.drawImage(bitmap, 0, 0, lebar, tinggi)
    bitmap.close?.()

    let dataUrl = kanvas.toDataURL('image/jpeg', MUTU)
    let base64Data = dataUrl.slice(dataUrl.indexOf(',') + 1)
    let byteAkhir = byteBase64(base64Data)

    // Nota yang ramai — banyak baris, latar bertekstur — bisa tetap besar
    // meski sudah dikecilkan. Satu putaran lagi dengan mutu lebih rendah
    // memangkasnya tanpa mengubah ukuran pikselnya, sehingga tulisannya tetap
    // sebesar tadi dan hanya kehalusan warnanya yang berkurang.
    if (byteAkhir > TARGET_BYTE) {
      const lagi = kanvas.toDataURL('image/jpeg', 0.62)
      const isiLagi = lagi.slice(lagi.indexOf(',') + 1)
      const byteLagi = byteBase64(isiLagi)
      if (byteLagi < byteAkhir) {
        dataUrl = lagi; base64Data = isiLagi; byteAkhir = byteLagi
      }
    }

    // Kalau hasil "pengecilan" justru lebih besar — bisa terjadi pada gambar
    // kecil bertekstur ramai — pakai yang asli.
    if (byteAkhir >= berkas.size) return asli()

    return { base64Data, mimeType: 'image/jpeg', byteAsal: berkas.size, byteAkhir }
  } catch {
    return asli()
  }
}

function bacaBase64(berkas: File): Promise<string> {
  return new Promise((selesai, gagal) => {
    const r = new FileReader()
    r.readAsDataURL(berkas)
    r.onload = () => {
      const hasil = String(r.result ?? '')
      selesai(hasil.slice(hasil.indexOf(',') + 1))
    }
    r.onerror = () => gagal(r.error)
  })
}
