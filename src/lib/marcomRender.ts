// ============================================================
// PropFS — Marcom: menggambar materi promosi di atas kanvas
//
// Menempel logo, judul, dan nomor kontak ke atas foto — lalu merangkai
// beberapa foto menjadi video pendek. Semuanya dikerjakan DI PERAMBAN,
// tanpa server dan tanpa pustaka tambahan:
//
//   • Gambar: kanvas biasa → PNG.
//   • Video: `canvas.captureStream()` + `MediaRecorder`. Ini satu-satunya cara
//     menghasilkan video di peramban tanpa memuat ffmpeg.wasm (±30 MB) yang
//     akan membuat halaman ini berat bagi semua orang, termasuk yang tidak
//     pernah membuat video.
//
// Konsekuensi yang HARUS diketahui pemakainya, bukan disembunyikan: format
// keluaran video bergantung pada peramban. Chrome versi baru bisa MP4; sisanya
// WebM, yang tidak diterima aplikasi Instagram/TikTok di ponsel. `dukunganVideo()`
// menjawab pertanyaan itu di muka supaya pemakainya tidak menunggu satu menit
// lalu menemukan berkasnya tidak bisa diunggah.
// ============================================================

import { simpanBerkas } from './unduhBerkas.ts'
import {
  FORMAT_MARCOM, tataLetak, barisKontak, namaTampil, bungkusBaris, judulGambar,
  garisProyek, fotoPadaWaktu, durasiVideo, durasiPakai, DURASI_PER_FOTO, MAKS_DETIK_VIDEO,
  type FormatMarcom, type ProfilMarcom, type TemplateMarcom,
} from './marcom.ts'

export interface IsiBingkai {
  profil?: ProfilMarcom
  /** Nama proyek. */
  judul?: string | null
  /** Baris kecil pendamping, mis. lokasi atau tahap pekerjaan. */
  keterangan?: string | null
  /** Lingkup pekerjaan untuk pita bawah, mis. "Civil, Architecture & MEP works". */
  lingkup?: string | null
  /** Semboyan di bawah logo. */
  tagline?: string | null
}

export interface OpsiKomposisi extends IsiBingkai {
  fotoDataUrl: string
  format: FormatMarcom
  template?: TemplateMarcom
}

// ── Pemuatan gambar ─────────────────────────────────────────────────────────

export function muatGambar(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // Foto bisa datang dari URL Supabase; tanpa ini kanvasnya "ternoda" dan
    // toDataURL() gagal — dan gagalnya baru terasa di langkah terakhir.
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Gambar tidak bisa dimuat.'))
    img.src = src
  })
}

/**
 * Gambar foto memenuhi bingkai tanpa mengubah proporsinya (cover).
 *
 * Meregangkan foto agar pas adalah kesalahan yang paling cepat terlihat orang:
 * bangunan jadi gepeng. Lebih baik sebagian foto terpotong.
 */
function gambarPenuh(
  ctx: CanvasRenderingContext2D,
  sumber: CanvasImageSource,
  lebarAsli: number,
  tinggiAsli: number,
  lebar: number,
  tinggi: number,
) {
  if (!lebarAsli || !tinggiAsli) return
  const skala = Math.max(lebar / lebarAsli, tinggi / tinggiAsli)
  const w = lebarAsli * skala
  const h = tinggiAsli * skala
  ctx.drawImage(sumber, (lebar - w) / 2, (tinggi - h) / 2, w, h)
}

// ── Menggambar satu bingkai ─────────────────────────────────────────────────

/**
 * Tempelkan bingkai promosi ke sebuah kanvas yang sudah berisi foto.
 *
 * Dipakai dua kali: sekali untuk gambar diam, dan berulang untuk tiap bingkai
 * video. Karena itu ia menerima ctx, bukan membuat kanvasnya sendiri.
 */
export function gambarBingkai(
  ctx: CanvasRenderingContext2D,
  format: FormatMarcom,
  o: IsiBingkai & { template?: TemplateMarcom; logo?: HTMLImageElement | null },
) {
  const t = tataLetak(format, o.template ?? 'sorot')
  const profil = o.profil ?? {}
  const kontak = barisKontak(profil, 2)

  if (t.template === 'sorot') gambarSorot(ctx, t, o, profil, kontak)
  else gambarKlasik(ctx, t, o, profil, kontak)
}

// ── Template 'sorot': logo di tengah atas, pita tipis di bawah ──────────────
function gambarSorot(
  ctx: CanvasRenderingContext2D,
  t: ReturnType<typeof tataLetak>,
  o: IsiBingkai & { logo?: HTMLImageElement | null },
  profil: ProfilMarcom,
  kontak: string[],
) {
  // Pita bawah: solid, tipis, dengan sedikit gradasi di atasnya supaya tepinya
  // tidak terlihat seperti gambar yang terpotong.
  const atasBar = t.tinggi - t.tinggiFooter
  const naik = Math.round(t.tinggiFooter * 0.7)
  const grad = ctx.createLinearGradient(0, atasBar - naik, 0, atasBar)
  grad.addColorStop(0, 'rgba(13,27,42,0)')
  grad.addColorStop(1, 'rgba(13,27,42,0.80)')
  ctx.fillStyle = grad
  ctx.fillRect(0, atasBar - naik, t.lebar, naik)
  ctx.fillStyle = 'rgba(13,27,42,0.80)'
  ctx.fillRect(0, atasBar, t.lebar, t.tinggiFooter)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // Logo di tengah atas, TANPA alas putih — supaya menyatu dengan fotonya,
  // bukan tampak seperti stiker. Keterbacaan dijaga bayangan lembut, yang
  // bekerja pada langit terang maupun dinding gelap.
  let bawahLogo = t.logo.y
  if (o.logo) {
    const skala = Math.min(t.logo.maks / o.logo.width, t.logo.maks / o.logo.height)
    const w = o.logo.width * skala
    const h = o.logo.height * skala
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = Math.round(t.ukuranKecil * 0.9)
    ctx.shadowOffsetY = Math.round(t.ukuranKecil * 0.2)
    ctx.drawImage(o.logo, t.logo.x - w / 2, t.logo.y, w, h)
    ctx.restore()
    bawahLogo = t.logo.y + h
  } else {
    const nama = namaTampil(profil)
    if (nama) {
      const ukuran = Math.round(t.ukuranKecil * 2.2)
      ctx.font = `800 ${ukuran}px Inter, system-ui, sans-serif`
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = Math.round(ukuran * 0.5)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(nama.toUpperCase(), t.logo.x, t.logo.y + ukuran)
      ctx.restore()
      bawahLogo = t.logo.y + ukuran
    }
  }

  const tagline = String(o.tagline ?? '').trim()
  if (tagline) {
    ctx.font = `600 ${t.tagline.ukuran}px Inter, system-ui, sans-serif`
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = Math.round(t.tagline.ukuran * 0.8)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(tagline, t.logo.x, bawahLogo + Math.round(t.tagline.ukuran * 1.7))
    ctx.restore()
  }

  // ── Pita bawah, baris 1: keterangan proyek.
  const garis = garisProyek(o.judul, o.lingkup || o.keterangan)
  if (garis) {
    ctx.font = `500 ${t.garisProyek.ukuran}px Inter, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    // Dipangkas agar tidak melebar keluar bingkai pada nama proyek yang panjang.
    let teks = garis
    const maks = t.lebar - t.tepi * 2
    while (teks.length > 8 && ctx.measureText(teks).width > maks) {
      teks = `${teks.slice(0, -2).trimEnd()}…`
    }
    ctx.fillText(teks, t.lebar / 2, t.garisProyek.y)
  }

  // ── Pita bawah, baris 2: kontak.
  if (kontak.length) {
    ctx.font = `700 ${t.kontak.ukuran}px Inter, system-ui, sans-serif`
    ctx.fillStyle = '#C9A84C'
    ctx.fillText(`☎  ${kontak.join('   ·   ')}`, t.lebar / 2, t.kontak.y)
  }

  ctx.textAlign = 'left'
}

// ── Template 'klasik': judul besar di footer tinggi ─────────────────────────
function gambarKlasik(
  ctx: CanvasRenderingContext2D,
  t: ReturnType<typeof tataLetak>,
  o: IsiBingkai & { logo?: HTMLImageElement | null },
  profil: ProfilMarcom,
  kontak: string[],
) {
  // Pita gelap di bawah: teks putih di atas foto terang tidak terbaca.
  // Gradasi, bukan kotak pekat, supaya fotonya tidak terasa dipotong.
  const grad = ctx.createLinearGradient(0, t.tinggi - t.tinggiFooter * 1.6, 0, t.tinggi)
  grad.addColorStop(0, 'rgba(13,27,42,0)')
  grad.addColorStop(0.45, 'rgba(13,27,42,0.72)')
  grad.addColorStop(1, 'rgba(13,27,42,0.94)')
  ctx.fillStyle = grad
  ctx.fillRect(0, t.tinggi - t.tinggiFooter * 1.6, t.lebar, t.tinggiFooter * 1.6)

  // Logo di kiri atas, dengan alas putih supaya logo gelap tetap terlihat
  // di atas foto yang terang.
  if (o.logo) {
    const maks = t.logo.maks
    const skala = Math.min(maks / o.logo.width, maks / o.logo.height)
    const w = o.logo.width * skala
    const h = o.logo.height * skala
    const pad = Math.round(maks * 0.16)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    bulat(ctx, t.logo.x, t.logo.y, w + pad * 2, h + pad * 2, Math.round(maks * 0.18))
    ctx.fill()
    ctx.drawImage(o.logo, t.logo.x + pad, t.logo.y + pad, w, h)
  } else {
    const nama = namaTampil(profil)
    if (nama) {
      ctx.font = `700 ${t.ukuranKecil}px Inter, system-ui, sans-serif`
      const lebarTeks = ctx.measureText(nama).width
      const pad = Math.round(t.ukuranKecil * 0.7)
      ctx.fillStyle = 'rgba(13,27,42,0.78)'
      bulat(ctx, t.logo.x, t.logo.y, lebarTeks + pad * 2, t.ukuranKecil * 2.1, t.ukuranKecil * 0.5)
      ctx.fill()
      ctx.fillStyle = '#C9A84C'
      ctx.textBaseline = 'middle'
      ctx.fillText(nama, t.logo.x + pad, t.logo.y + t.ukuranKecil * 1.05)
    }
  }

  ctx.textBaseline = 'alphabetic'

  // Tumpukan digambar DARI BAWAH KE ATAS supaya jumlah baris judul tidak
  // pernah mendorong apa pun ke luar bingkai maupun menabrak nomor kontak.
  if (kontak.length) {
    let ky = t.kontak.y - t.kontak.tinggiBaris * (kontak.length - 1)
    ctx.font = `700 ${t.kontak.ukuran}px Inter, system-ui, sans-serif`
    for (let i = 0; i < kontak.length; i++) {
      ctx.fillStyle = i === 0 ? '#C9A84C' : 'rgba(255,255,255,0.82)'
      ctx.fillText(i === 0 ? `☎  ${kontak[i]}` : kontak[i], t.kontak.x, ky)
      ky += t.kontak.tinggiBaris
    }
  }

  const jdl = judulGambar(o.judul, 70)
  let atasJudul = t.judul.yBawah
  if (jdl) {
    ctx.font = `800 ${t.judul.ukuran}px Georgia, "Times New Roman", serif`
    ctx.fillStyle = '#FFFFFF'
    const baris = bungkusBaris(jdl, s => ctx.measureText(s).width <= t.judul.lebarMaks, 2)
    for (let i = 0; i < baris.length; i++) {
      ctx.fillText(baris[i], t.judul.x, t.judul.yBawah - t.judul.tinggiBaris * (baris.length - 1 - i))
    }
    atasJudul = t.judul.yBawah - t.judul.tinggiBaris * (baris.length - 1)
  }

  const ket = String(o.keterangan ?? '').trim()
  if (ket) {
    ctx.font = `600 ${t.ukuranKecil}px Inter, system-ui, sans-serif`
    ctx.fillStyle = '#C9A84C'
    ctx.fillText(ket.toUpperCase(), t.keterangan.x,
      atasJudul - t.judul.ukuran - Math.round(t.ukuranKecil * 0.55))
  }
}

function bulat(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Satu gambar promosi jadi, sebagai data URL PNG. */
export async function komposisiGambar(o: OpsiKomposisi): Promise<string> {
  const { lebar, tinggi } = FORMAT_MARCOM[o.format]
  const kanvas = document.createElement('canvas')
  kanvas.width = lebar
  kanvas.height = tinggi
  const ctx = kanvas.getContext('2d')
  if (!ctx) throw new Error('Kanvas tidak tersedia di peramban ini.')

  ctx.fillStyle = '#0D1B2A'
  ctx.fillRect(0, 0, lebar, tinggi)

  const foto = await muatGambar(o.fotoDataUrl)
  gambarPenuh(ctx, foto, foto.width, foto.height, lebar, tinggi)

  const logoSrc = String(o.profil?.logo ?? '').trim()
  const logo = logoSrc ? await muatGambar(logoSrc).catch(() => null) : null

  gambarBingkai(ctx, o.format, {
    template: o.template, profil: o.profil, judul: o.judul,
    keterangan: o.keterangan, lingkup: o.lingkup, tagline: o.tagline, logo,
  })
  return kanvas.toDataURL('image/png')
}

// ── Video ───────────────────────────────────────────────────────────────────

export interface DukunganVideo {
  bisa: boolean
  mime: string
  ext: string
  /** true bila keluarannya MP4 — satu-satunya yang diterima aplikasi ponsel. */
  mp4: boolean
  catatan: string
}

/**
 * Apa yang bisa dihasilkan peramban ini, dijawab SEBELUM pemakainya menunggu.
 *
 * Urutannya disengaja: MP4 dulu. WebM tetap ditawarkan karena masih berguna di
 * komputer (unggah lewat web Instagram, kirim lewat WhatsApp Desktop), tetapi
 * pemakainya diberi tahu batasnya, bukan dibiarkan menemukan sendiri setelah
 * berkasnya ditolak aplikasi.
 */
export function dukunganVideo(): DukunganVideo {
  if (typeof MediaRecorder === 'undefined') {
    return {
      bisa: false, mime: '', ext: '', mp4: false,
      catatan: 'Peramban ini tidak bisa merekam video. Buka propfs.id lewat Chrome '
        + '(bukan peramban di dalam aplikasi WhatsApp/Instagram), lalu coba lagi.',
    }
  }
  // Diperiksa TERPISAH dari MediaRecorder: beberapa peramban — Safari iOS lama,
  // dan peramban yang tertanam di dalam aplikasi WhatsApp/Instagram — punya
  // MediaRecorder tetapi tidak punya captureStream. Tanpa pemeriksaan ini,
  // tombolnya menyala lalu meledak di tengah jalan.
  if (typeof HTMLCanvasElement === 'undefined'
    || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    return {
      bisa: false, mime: '', ext: '', mp4: false,
      catatan: 'Peramban ini tidak bisa merekam isi kanvas. Buka propfs.id lewat Chrome '
        + '(bukan peramban di dalam aplikasi WhatsApp/Instagram), lalu coba lagi.',
    }
  }
  const mp4 = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4']
  const webm = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']

  for (const m of mp4) {
    if (MediaRecorder.isTypeSupported(m)) {
      return { bisa: true, mime: m, ext: 'mp4', mp4: true, catatan: 'Siap diunggah ke Instagram, TikTok, & WhatsApp.' }
    }
  }
  for (const m of webm) {
    if (MediaRecorder.isTypeSupported(m)) {
      return {
        bisa: true, mime: m, ext: 'webm', mp4: false,
        catatan: 'Peramban ini menghasilkan WebM. Bisa diunggah dari komputer, '
          + 'tetapi aplikasi Instagram/TikTok di HP umumnya hanya menerima MP4 — '
          + 'buka halaman ini di Chrome versi baru untuk mendapat MP4.',
      }
    }
  }
  return { bisa: false, mime: '', ext: '', mp4: false, catatan: 'Peramban ini tidak menyediakan format video yang bisa dipakai.' }
}

export interface OpsiVideo extends IsiBingkai {
  fotoDataUrls: string[]
  format: FormatMarcom
  template?: TemplateMarcom
  perFoto?: number
  onProgress?: (pct: number) => void
}

export interface HasilVideo {
  blob: Blob
  ext: string
  mp4: boolean
  durasiMs: number
}

/**
 * Rangkai foto menjadi video pendek berbingkai promosi.
 *
 * Perekamannya BERJALAN SEWAKTU-NYATA — video 10 detik memakan 10 detik. Itu
 * batas `MediaRecorder`, bukan pilihan; karena itu kemajuannya dilaporkan
 * supaya pemakainya tahu halamannya tidak menggantung.
 */
export async function buatVideo(o: OpsiVideo): Promise<HasilVideo> {
  const dukungan = dukunganVideo()
  if (!dukungan.bisa) throw new Error(dukungan.catatan)

  const foto = (o.fotoDataUrls ?? []).filter(Boolean)
  if (!foto.length) throw new Error('Belum ada foto untuk dijadikan video.')

  const { lebar, tinggi } = FORMAT_MARCOM[o.format]
  const kanvas = document.createElement('canvas')
  kanvas.width = lebar
  kanvas.height = tinggi

  // Kanvas DITEMPEL ke halaman, walau tak terlihat. Kanvas yang tidak pernah
  // ikut digambar ke layar tidak dijamin menghasilkan bingkai pada sebagian
  // peramban — dan akibatnya berkas video yang kosong, bukan pesan kesalahan.
  kanvas.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none;opacity:0.01'
  document.body.appendChild(kanvas)

  const ctx = kanvas.getContext('2d')
  if (!ctx) { kanvas.remove(); throw new Error('Kanvas tidak tersedia di peramban ini.') }

  try {
    const gambar = await Promise.all(foto.map(f => muatGambar(f)))
    const logoSrc = String(o.profil?.logo ?? '').trim()
    const logo = logoSrc ? await muatGambar(logoSrc).catch(() => null) : null

    const perFoto = o.perFoto ?? DURASI_PER_FOTO
    const total = durasiVideo(gambar.length, perFoto)

    const isi = {
      template: o.template, profil: o.profil, judul: o.judul,
      keterangan: o.keterangan, lingkup: o.lingkup, tagline: o.tagline, logo,
    }

    /** Gambar satu bingkai pada milidetik ke-`t`. */
    const bingkai = (t: number) => {
      const { indeks, pudar } = fotoPadaWaktu(t, gambar.length, perFoto)
      ctx.fillStyle = '#0D1B2A'
      ctx.fillRect(0, 0, lebar, tinggi)

      // Zoom pelan (efek Ken Burns) supaya video dari foto diam tidak terasa
      // seperti presentasi yang macet.
      const maju = (t - indeks * perFoto) / perFoto
      const zoom = 1 + maju * 0.06
      ctx.save()
      ctx.translate(lebar / 2, tinggi / 2)
      ctx.scale(zoom, zoom)
      ctx.translate(-lebar / 2, -tinggi / 2)
      ctx.globalAlpha = pudar
      gambarPenuh(ctx, gambar[indeks], gambar[indeks].width, gambar[indeks].height, lebar, tinggi)
      ctx.restore()
      ctx.globalAlpha = 1

      gambarBingkai(ctx, o.format, isi)
    }

    // Bingkai pertama digambar SEBELUM perekaman dimulai. Merekam kanvas yang
    // masih kosong menghasilkan berkas tanpa isi pada sebagian peramban.
    bingkai(0)

    const aliran = kanvas.captureStream(30)
    const perekam = new MediaRecorder(aliran, { mimeType: dukungan.mime, videoBitsPerSecond: 6_000_000 })
    const potongan: BlobPart[] = []
    perekam.ondataavailable = e => { if (e.data.size) potongan.push(e.data) }

    let galat = ''
    perekam.onerror = () => { galat = 'Perekaman dihentikan peramban.' }

    const selesai = new Promise<Blob>(resolve => {
      perekam.onstop = () => resolve(new Blob(potongan, { type: dukungan.mime }))
    })

    // Potongan diminta tiap detik, bukan sekali di akhir: satu blob raksasa
    // lebih mudah gagal di perangkat dengan memori terbatas.
    perekam.start(1000)
    const mulai = performance.now()

    await new Promise<void>(resolve => {
      let henti = false
      const sudah = () => { if (!henti) { henti = true; clearInterval(jaga); resolve() } }

      const langkah = () => {
        if (henti) return
        const t = performance.now() - mulai
        if (t >= total) { sudah(); return }
        bingkai(t)
        o.onProgress?.(Math.min(99, Math.round((t / total) * 100)))
        requestAnimationFrame(langkah)
      }

      // Penjaga waktu. `requestAnimationFrame` BERHENTI ketika halaman
      // disembunyikan — layar HP terkunci, pemakainya pindah aplikasi sebentar
      // — dan tanpa penjaga ini perekamannya menggantung selamanya di angka
      // berapa pun ia berhenti. Pemeriksa ini tetap berjalan (meski melambat)
      // dan memastikan perekaman selalu punya ujung.
      const jaga = setInterval(() => {
        if (performance.now() - mulai >= total + 500) sudah()
      }, 250)

      requestAnimationFrame(langkah)
    })

    perekam.stop()
    const blob = await selesai
    o.onProgress?.(100)

    // Berkas kosong adalah kegagalan, bukan keberhasilan. Tanpa pemeriksaan ini
    // pemakainya mengunduh berkas 0 byte dan baru tahu saat mengunggahnya.
    if (!blob.size) {
      throw new Error(galat || 'Video gagal direkam di peramban ini (berkasnya kosong). '
        + 'Coba buka lewat Chrome versi terbaru.')
    }
    return { blob, ext: dukungan.ext, mp4: dukungan.mp4, durasiMs: total }
  } finally {
    kanvas.remove()
  }
}

// ── Video yang diunggah pemakainya ─────────────────────────────────────────

/**
 * Muat sebuah video sampai ukuran & durasinya diketahui.
 *
 * Durasi tidak selalu ada di metadata. Video yang DIREKAM aplikasi lain —
 * termasuk yang dibuat MediaRecorder sendiri — sering datang tanpa durasi di
 * header, dan peramban melaporkannya `Infinity`. Kalau dibiarkan, tombolnya
 * akan berbunyi "Olah Video (1:30)" untuk video 4 detik, dan bilah
 * kemajuannya berjalan ke angka yang salah.
 *
 * Caranya memaksa peramban menghitung sendiri: lompat ke waktu yang mustahil,
 * tunggu ia menyerah dan mengisi `duration`, lalu kembali ke awal.
 */
export function muatVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'auto'
    v.crossOrigin = 'anonymous'
    // Wajib di iOS: tanpa ini video akan direbut pemutar layar penuh dan
    // bingkainya tidak pernah sampai ke kanvas.
    v.playsInline = true
    v.setAttribute('playsinline', '')
    v.muted = true

    let selesai = false
    const jadi = () => {
      if (selesai) return
      selesai = true
      v.ontimeupdate = null
      try { v.currentTime = 0 } catch { /* biarkan di tempatnya */ }
      resolve(v)
    }

    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) { jadi(); return }
      v.ontimeupdate = () => {
        if (Number.isFinite(v.duration) && v.duration > 0) jadi()
      }
      try { v.currentTime = 1e101 } catch { jadi() }
      // Kalau akalnya tidak berhasil pun jangan menggantung: lanjut dengan
      // durasi yang tak diketahui, dan pemakaian nanti dibatasi `durasiPakai`.
      setTimeout(jadi, 3000)
    }
    v.onerror = () => reject(new Error('Video tidak bisa dibaca. Coba format MP4.'))
    v.src = src
  })
}

/** Satu bingkai video beserta bingkai promosinya — untuk pratinjau. */
export async function pratinjauVideo(
  videoUrl: string,
  format: FormatMarcom,
  isi: IsiBingkai & { template?: TemplateMarcom },
  detik = 0,
): Promise<string> {
  const { lebar, tinggi } = FORMAT_MARCOM[format]
  const v = await muatVideo(videoUrl)

  await new Promise<void>(resolve => {
    let selesai = false
    const jadi = () => { if (!selesai) { selesai = true; resolve() } }
    v.onseeked = jadi
    // Sebagian video tidak pernah memicu `seeked` (durasi tak terbaca, berkas
    // rusak sebagian). Jangan menggantung — pakai bingkai apa pun yang ada.
    setTimeout(jadi, 3000)
    try { v.currentTime = Math.max(0, Math.min(detik, (v.duration || 1) - 0.1)) } catch { jadi() }
  })

  const kanvas = document.createElement('canvas')
  kanvas.width = lebar
  kanvas.height = tinggi
  const ctx = kanvas.getContext('2d')
  if (!ctx) throw new Error('Kanvas tidak tersedia di peramban ini.')

  ctx.fillStyle = '#0D1B2A'
  ctx.fillRect(0, 0, lebar, tinggi)
  gambarPenuh(ctx, v, v.videoWidth, v.videoHeight, lebar, tinggi)

  const logoSrc = String(isi.profil?.logo ?? '').trim()
  const logo = logoSrc ? await muatGambar(logoSrc).catch(() => null) : null
  gambarBingkai(ctx, format, { ...isi, logo })

  v.src = ''
  return kanvas.toDataURL('image/png')
}

export interface OpsiOlahVideo extends IsiBingkai {
  videoUrl: string
  format: FormatMarcom
  template?: TemplateMarcom
  maksDetik?: number
  onProgress?: (pct: number) => void
}

/**
 * Tempelkan logo, keterangan proyek, dan nomor kontak ke video yang sudah ada.
 *
 * Suaranya DIPERTAHANKAN, lewat jalur yang sedikit berputar: audio video
 * dialirkan melalui Web Audio ke sebuah MediaStream, dan sengaja TIDAK
 * disambungkan ke pengeras suara. Menyetel `video.muted = true` akan lebih
 * sederhana tetapi membuat suara yang terekam ikut senyap; membiarkannya
 * berbunyi berarti pemakainya mendengar videonya diputar keras-keras selama
 * proses. Jalur ini senyap di telinga, utuh di berkas.
 */
export async function olahVideo(o: OpsiOlahVideo): Promise<HasilVideo> {
  const dukungan = dukunganVideo()
  if (!dukungan.bisa) throw new Error(dukungan.catatan)

  const { lebar, tinggi } = FORMAT_MARCOM[o.format]
  const v = await muatVideo(o.videoUrl)
  const pakai = durasiPakai(v.duration, o.maksDetik ?? MAKS_DETIK_VIDEO)

  const kanvas = document.createElement('canvas')
  kanvas.width = lebar
  kanvas.height = tinggi
  kanvas.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none;opacity:0.01'
  document.body.appendChild(kanvas)

  const ctx = kanvas.getContext('2d')
  if (!ctx) { kanvas.remove(); throw new Error('Kanvas tidak tersedia di peramban ini.') }

  let audioCtx: AudioContext | null = null
  try {
    const logoSrc = String(o.profil?.logo ?? '').trim()
    const logo = logoSrc ? await muatGambar(logoSrc).catch(() => null) : null
    const isi = { ...o, logo }

    const bingkai = () => {
      ctx.fillStyle = '#0D1B2A'
      ctx.fillRect(0, 0, lebar, tinggi)
      gambarPenuh(ctx, v, v.videoWidth, v.videoHeight, lebar, tinggi)
      gambarBingkai(ctx, o.format, isi)
    }

    v.currentTime = 0
    bingkai()

    const aliran = kanvas.captureStream(30)

    // Suara asli video, bila ada. Kegagalan di sini tidak membatalkan apa pun —
    // video tanpa suara masih jauh lebih berguna daripada tidak ada video.
    try {
      const AC = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext
      if (AC) {
        audioCtx = new AC()
        const sumber = audioCtx.createMediaElementSource(v)
        const tujuan = audioCtx.createMediaStreamDestination()
        sumber.connect(tujuan) // sengaja TIDAK ke audioCtx.destination
        for (const t of tujuan.stream.getAudioTracks()) aliran.addTrack(t)
      }
    } catch {
      // lanjut tanpa suara
    }

    const perekam = new MediaRecorder(aliran, { mimeType: dukungan.mime, videoBitsPerSecond: 6_000_000 })
    const potongan: BlobPart[] = []
    perekam.ondataavailable = e => { if (e.data.size) potongan.push(e.data) }
    let galat = ''
    perekam.onerror = () => { galat = 'Perekaman dihentikan peramban.' }

    const selesai = new Promise<Blob>(resolve => {
      perekam.onstop = () => resolve(new Blob(potongan, { type: dukungan.mime }))
    })

    perekam.start(1000)
    await v.play()

    await new Promise<void>(resolve => {
      let henti = false
      const sudah = () => { if (!henti) { henti = true; clearInterval(jaga); resolve() } }

      const langkah = () => {
        if (henti) return
        if (v.ended || v.currentTime >= pakai.detik) { sudah(); return }
        bingkai()
        o.onProgress?.(Math.min(99, Math.round((v.currentTime / pakai.detik) * 100)))
        requestAnimationFrame(langkah)
      }

      // Penjaga waktu yang sama seperti pada slideshow: requestAnimationFrame
      // berhenti bila halaman disembunyikan, dan tanpa ini perekamannya
      // menggantung selamanya. Diberi kelonggaran 2 detik atas durasi video.
      const mulai = performance.now()
      const jaga = setInterval(() => {
        if (v.ended || v.currentTime >= pakai.detik) sudah()
        else if (performance.now() - mulai >= (pakai.detik + 2) * 1000) sudah()
      }, 250)

      requestAnimationFrame(langkah)
    })

    v.pause()
    perekam.stop()
    const blob = await selesai
    o.onProgress?.(100)

    if (!blob.size) {
      throw new Error(galat || 'Video gagal direkam di peramban ini (berkasnya kosong). '
        + 'Coba buka lewat Chrome versi terbaru.')
    }
    return { blob, ext: dukungan.ext, mp4: dukungan.mp4, durasiMs: Math.round(pakai.detik * 1000) }
  } finally {
    kanvas.remove()
    v.pause()
    try { await audioCtx?.close() } catch { /* sudah tertutup */ }
  }
}

// ── Unduh & bagikan ─────────────────────────────────────────────────────────

export function unduh(isi: string | Blob, nama: string) {
  void simpanBerkas(isi, nama)
}

/** Ubah data URL menjadi File, supaya bisa dibagikan lewat Web Share. */
export async function keFile(dataUrl: string, nama: string): Promise<File> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return new File([blob], nama, { type: blob.type })
}

/**
 * Bagikan langsung ke aplikasi lain bila peramban mendukung.
 *
 * Mengembalikan false bila tidak didukung, supaya pemanggilnya bisa jatuh ke
 * unduhan biasa alih-alih memberi tombol yang tidak melakukan apa-apa.
 */
export async function bagikan(berkas: File[], teks: string): Promise<boolean> {
  const nav = navigator as Navigator & {
    canShare?: (d: ShareData) => boolean
    share?: (d: ShareData) => Promise<void>
  }
  if (!nav.share || !nav.canShare || !nav.canShare({ files: berkas })) return false
  try {
    await nav.share({ files: berkas, text: teks })
    return true
  } catch {
    // Pemakainya membatalkan — bukan kegagalan.
    return false
  }
}
