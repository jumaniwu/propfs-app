/**
 * Util PDF bersama: render halaman-halaman awal PDF menjadi canvas
 * (dipakai scan koordinat dan render dari file CAD/PDF).
 */
export async function pdfToCanvases(file: File, maxPages = 3): Promise<HTMLCanvasElement[]> {
  // build legacy: kompatibel dengan browser yang lebih lama
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const canvases: HTMLCanvasElement[] = []
  const n = Math.min(doc.numPages, maxPages)
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport }).promise
    canvases.push(canvas)
  }
  return canvases
}

/**
 * Render SELURUH halaman PDF menjadi gambar, dari byte mentah.
 *
 * Kenapa ini ada, dan kenapa ia bukan sekadar kenyamanan:
 *
 * Lampiran tagihan vendor selama ini hanya bisa dilihat dengan menyerahkannya
 * ke aplikasi lain — tab baru di peramban, atau menu Bagikan Android di dalam
 * APK. Keduanya menuntut sesuatu di luar kendali aplikasi ini: peramban yang
 * mau menavigasi ke data URI panjang, atau jembatan native yang benar-benar
 * terpasang di APK-nya. Ketika salah satunya tidak ada, yang tersisa adalah
 * tombol yang tidak menghasilkan apa-apa.
 *
 * pdf.js menggambar sendiri ke canvas. Tidak ada penampil bawaan yang
 * dipanggil, tidak ada aplikasi lain yang dilibatkan, tidak ada jembatan yang
 * harus terpasang. Berjalan sama di peramban dan di dalam APK versi mana pun.
 *
 * Catatan lama di LihatBerkas — "penampil PDF di dalam halaman tidak bisa
 * diandalkan pada peramban ponsel" — benar untuk <iframe> dan <embed>, yang
 * menyerahkan pekerjaannya kepada sistem. Ia tidak berlaku di sini.
 */
export interface HalamanPdf {
  src: string
  /**
   * Ukuran piksel hasil render.
   *
   * Ikut dikembalikan supaya penampilnya bisa memberi tiap halaman kotak yang
   * BERBENTUK seperti halamannya. Tanpa itu, satu-satunya pilihan adalah kotak
   * bertinggi tetap — dan denah lanskap A3 di dalam kotak setinggi layar
   * menyisakan bidang kosong lebih besar daripada gambarnya sendiri.
   */
  lebar: number
  tinggi: number
}

export async function pdfKeGambar(
  data: ArrayBuffer | Uint8Array,
  opsi: { maksHalaman?: number; lebarTarget?: number } = {},
): Promise<{ halaman: HalamanPdf[]; total: number }> {
  const maks = Math.max(1, Math.floor(opsi.maksHalaman ?? 12))
  const lebarTarget = Math.max(320, Math.floor(opsi.lebarTarget ?? 1000))

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  // Disalin: pdf.js MENGAMBIL ALIH buffer yang diberikan kepadanya, dan
  // pemanggil di sini memakai byte yang sama untuk tombol Simpan. Tanpa
  // salinan, menyimpan setelah melihat akan menghasilkan berkas kosong.
  const salinan = data instanceof Uint8Array ? data.slice() : new Uint8Array(data).slice()
  const doc = await pdfjs.getDocument({ data: salinan }).promise

  const halaman: HalamanPdf[] = []
  const n = Math.min(doc.numPages, maks)
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i)
    const asli = page.getViewport({ scale: 1 })
    // Skala dihitung dari lebar halamannya sendiri, bukan angka tetap.
    // Nota vendor dipotret dalam berbagai ukuran kertas; skala tetap membuat
    // yang kecil kabur dan yang besar memakan memori HP sampai tabnya mati.
    // Lantainya 1,5 dan bukan 1. Nota A4 lebarnya 595 titik; digambar pada
    // skala 1 lalu ditampilkan selebar layar, angka rekening di dalamnya sudah
    // di ambang terbaca — dan angka itulah yang dicari orang saat membuka
    // lampiran tagihan.
    const skala = Math.min(3, Math.max(1.5, lebarTarget / asli.width))
    const viewport = page.getViewport({ scale: skala })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport }).promise
    halaman.push({
      src: canvas.toDataURL('image/jpeg', 0.85),
      lebar: canvas.width,
      tinggi: canvas.height,
    })
    // Dibebaskan segera: pada PDF belasan halaman, canvas yang menumpuk di
    // memori HP kelas bawah cukup untuk membuat halamannya dimuat ulang
    // sendiri di tengah jalan.
    canvas.width = 0
    canvas.height = 0
    page.cleanup()
  }
  const total = doc.numPages
  // `cleanup()`, bukan `destroy()`: yang terakhir tidak ada di tipe pdf.js
  // versi ini. Dibungkus try karena melepas memori tidak boleh menggagalkan
  // penampilan yang sudah berhasil.
  try { doc.cleanup() } catch { /* sudah dilepas */ }
  return { halaman, total }
}
