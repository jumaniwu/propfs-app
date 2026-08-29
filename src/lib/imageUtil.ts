// Perkecil gambar di browser jadi JPEG data URL (untuk hemat penyimpanan foto laporan).
import { capPas, letakCap } from './capWaktu'

export function downscaleImage(file: File, maxSide = 1280, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas tidak tersedia')); return }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File bukan gambar yang valid.')) }
    img.src = url
  })
}

/**
 * Perkecil gambar SEKALIGUS membakar cap tanggal & jam di dasarnya.
 *
 * Dipakai foto serah-terima alat. Foto seperti itu gunanya membuktikan dua
 * hal — keadaan alatnya dan KAPAN keadaan itu direkam — dan tanggal yang
 * hanya tersimpan di baris database membuktikan yang kedua hanya bagi yang
 * percaya pada barisnya. Cap yang dibakar ke gambarnya ikut ke mana pun
 * gambarnya pergi, termasuk ketika diteruskan lewat WhatsApp, tempat seluruh
 * perselisihan ini biasanya berlangsung.
 *
 * Waktunya diambil saat GAMBARNYA DIPROSES, bukan diserahkan pemanggil. Foto
 * yang dipilih dari album karena itu bercap waktu saat ia dilampirkan, bukan
 * saat ia dipotret — dan itu memang yang bisa dijamin aplikasi ini. Mengaku
 * tahu kapan sebuah foto lama diambil adalah mengarang.
 *
 * Ukuran dan teksnya dihitung di lib/capWaktu.ts supaya bisa diuji tanpa DOM.
 */
export function downscaleWithStamp(
  file: File,
  keterangan = '',
  maxSide = 1000,
  quality = 0.7,
  waktu: Date = new Date(),
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas tidak tersedia')); return }
      ctx.drawImage(img, 0, 0, w, h)

      const teks = capPas(waktu, keterangan, w)
      const { fontPx, tinggiBidang, padKiri, atasBidang, baseline } = letakCap(w, h)

      // Bidang gelap separuh tembus di belakang teksnya. Tanpa itu, cap putih
      // di atas foto dinding cor putih tidak terbaca sama sekali — dan foto
      // dinding cor putih persis yang paling sering diambil di sini.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
      ctx.fillRect(0, atasBidang, w, tinggiBidang)

      ctx.font = `bold ${fontPx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(teks, padKiri, baseline)

      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File bukan gambar yang valid.')) }
    img.src = url
  })
}
