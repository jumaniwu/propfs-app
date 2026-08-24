// ============================================================
// PropFS — Menyatukan daftar proyek antara perangkat (logika murni)
//
// Gejalanya: HP menampilkan dua proyek, laptop hanya satu — dan proyek yang
// SAMA pun berbeda isinya (realisasi Rp 46,8 jt vs Rp 32,7 jt). Artinya kedua
// perangkat tidak pernah bertemu di tengah, dan salah satunya menyimpan
// pekerjaan yang tidak ada di mana pun selain di HP itu.
//
// Tiga hal yang memungkinkannya, ketiganya diperbaiki bersama modul ini:
//
//   1. Daftar lokal ditulis ulang UTUH setiap kali menyimpan. Kalau salinan
//      cloud belum sempat datang (ia diambil belakangan, tidak menunggu),
//      proyek yang cuma ada di cloud ikut terhapus dari perangkat ini.
//   2. Pengambilan cloud MENYERAH DIAM-DIAM bila sesi belum siap, dan tidak
//      pernah dicoba lagi. Di laptop yang baru dibuka, itu berarti cloud tidak
//      pernah dibaca sama sekali.
//   3. Kunci penyimpanan jatuh ke ":anonymous" ketika pemiliknya belum
//      dikenali, sehingga tulisan pertama mendarat di laci yang salah.
//
// Aturan penyatuannya sengaja KONSERVATIF: apa pun yang ada di salah satu sisi
// tetap ada di hasil. Yang lebih baru menang untuk id yang sama, tetapi tidak
// ada satu pun proyek yang boleh lenyap hanya karena tidak muncul di sisi lain.
// Menghapus proyek harus lewat penghapusan yang disengaja, bukan lewat
// penggabungan.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

export interface ProyekTersimpan {
  info?: { id?: string; projectName?: string }
  updatedAt?: string
  [k: string]: unknown
}

const idProyek = (p: ProyekTersimpan | null | undefined): string =>
  String(p?.info?.id ?? '').trim()

/**
 * Waktu perubahan terakhir dalam milidetik.
 *
 * Tanda waktu yang tidak terbaca dianggap PALING TUA, bukan paling baru:
 * data cacat tidak boleh menang atas data yang jelas.
 */
export function waktuUbah(p: ProyekTersimpan | null | undefined): number {
  const t = Date.parse(String(p?.updatedAt ?? ''))
  return Number.isFinite(t) ? t : 0
}

export interface HasilGabung {
  /** Gabungan kedua sisi, terbaru di depan. */
  gabungan: ProyekTersimpan[]
  /** Yang lebih baru / hanya ada di perangkat ini — perlu didorong ke cloud. */
  perluDorong: ProyekTersimpan[]
  /** Yang hanya ada di cloud; ditarik ke perangkat ini. */
  baruDariCloud: ProyekTersimpan[]
}

/**
 * Satukan daftar lokal dan cloud.
 *
 * Proyek tanpa id dibuang: ia tidak bisa dicocokkan maupun disimpan, dan
 * membiarkannya hanya melahirkan baris hantu yang bertambah tiap pemuatan.
 */
export function gabungProyek(
  lokal: ProyekTersimpan[] = [],
  cloud: ProyekTersimpan[] = [],
): HasilGabung {
  const peta = new Map<string, ProyekTersimpan>()
  const dariCloud = new Set<string>()

  for (const c of cloud ?? []) {
    const id = idProyek(c)
    if (!id) continue
    // Cloud pun bisa memuat dua baris untuk id yang sama bila pernah ada
    // kegagalan; yang terbaru yang dipakai.
    const ada = peta.get(id)
    if (!ada || waktuUbah(c) > waktuUbah(ada)) peta.set(id, c)
    dariCloud.add(id)
  }

  const perluDorong: ProyekTersimpan[] = []
  for (const l of lokal ?? []) {
    const id = idProyek(l)
    if (!id) continue
    const c = peta.get(id)
    if (!c) {
      // Hanya ada di perangkat ini — inilah yang selama ini hilang.
      peta.set(id, l)
      perluDorong.push(l)
      continue
    }
    // Kedua sisi memuat proyek ini. Isinya DISATUKAN, bukan salah satunya
    // dipilih: memilih berarti membuang entri yang hanya ada di sisi lain.
    const satu = gabungIsiProyek(l, c)
    peta.set(id, satu)
    // Didorong balik HANYA bila cloud memang belum memuatnya seluruhnya:
    // entri milik perangkat ini yang belum ada di sana, atau dokumen lokal
    // yang memang lebih baru. Mendorong salinan yang identik hanya menghabiskan
    // kuota dan menyalakan penanda "menyimpan" tanpa ada yang berubah.
    if (waktuUbah(l) > waktuUbah(c) || adaYangBelumDiCloud(satu, c)) {
      perluDorong.push(satu)
    }
  }

  const gabungan = [...peta.values()].sort((a, b) => waktuUbah(b) - waktuUbah(a))
  const idLokal = new Set((lokal ?? []).map(idProyek).filter(Boolean))
  const baruDariCloud = gabungan.filter(p => dariCloud.has(idProyek(p)) && !idLokal.has(idProyek(p)))

  return { gabungan, perluDorong, baruDariCloud }
}

/**
 * Sisipkan satu proyek yang baru disimpan ke dalam daftar, TANPA menghapus
 * yang lain.
 *
 * Inilah pengganti "tulis ulang seluruh daftar dari yang ada di memori".
 * `daftarTerbaru` adalah isi penyimpanan yang baru saja dibaca ulang — bukan
 * salinan lama yang menempel di memori sejak halaman dibuka. Tanpa itu, proyek
 * yang datang dari cloud beberapa ratus milidetik setelah halaman terbuka akan
 * terhapus oleh penyimpanan berikutnya.
 */
export function sisipkanProyek(
  daftarTerbaru: ProyekTersimpan[] = [],
  proyek: ProyekTersimpan,
): ProyekTersimpan[] {
  const id = idProyek(proyek)
  if (!id) return [...(daftarTerbaru ?? [])]
  const sisa = (daftarTerbaru ?? []).filter(p => idProyek(p) !== id)
  return [proyek, ...sisa]
}

/** Berapa proyek yang belum tentu ada di cloud, untuk ditampilkan apa adanya. */
export interface RingkasSinkron {
  lokal: number
  cloud: number
  /** Ada di perangkat ini tetapi belum ada di cloud. */
  belumNaik: number
  /** Ada di cloud tetapi belum ada di perangkat ini. */
  belumTurun: number
  aman: boolean
}

export function ringkasSinkron(
  lokal: ProyekTersimpan[] = [],
  cloud: ProyekTersimpan[] = [],
): RingkasSinkron {
  const idCloud = new Set((cloud ?? []).map(idProyek).filter(Boolean))
  const idLokal = new Set((lokal ?? []).map(idProyek).filter(Boolean))
  const belumNaik = [...idLokal].filter(id => !idCloud.has(id)).length
  const belumTurun = [...idCloud].filter(id => !idLokal.has(id)).length
  return {
    lokal: idLokal.size,
    cloud: idCloud.size,
    belumNaik,
    belumTurun,
    aman: belumNaik === 0,
  }
}

/** Kalimat apa adanya untuk ditampilkan ke pemakai. */
export function kalimatSinkron(r: RingkasSinkron): string {
  if (r.lokal === 0 && r.cloud === 0) return 'Belum ada proyek.'
  if (r.aman && r.belumTurun === 0) {
    return `${r.cloud} proyek tersimpan di server. Aman dibuka dari perangkat lain.`
  }
  const bagian: string[] = []
  if (r.belumNaik > 0) bagian.push(`${r.belumNaik} proyek BELUM tersimpan di server`)
  if (r.belumTurun > 0) bagian.push(`${r.belumTurun} proyek dari server belum ditarik`)
  return bagian.join(' · ')
}

// ── Menggabungkan ISI proyek, bukan hanya memilih dokumennya ────────────────

/**
 * Baris biaya yang hidup di dalam sebuah proyek.
 *
 * Bentuknya sengaja sesempit mungkin: modul ini tidak boleh ikut berubah
 * setiap kali kolom entri bertambah.
 */
interface EntriBerId { id?: string; [k: string]: unknown }

/** Daftar yang digabung per-baris ketika dua perangkat sama-sama menyuntingnya. */
const DAFTAR_ISI = ['realisasiEntries'] as const

/** Satu baris yang sudah dihapus, berikut kapan dihapusnya. */
export interface Nisan { id: string; at?: string }

/** Medan tempat catatan penghapusan disimpan di dalam dokumen proyek. */
export const MEDAN_NISAN = 'dihapus'

/**
 * Berapa lama catatan penghapusan disimpan.
 *
 * Ada dua kerugian, dan keduanya nyata:
 *
 *   TERLALU PENDEK — perangkat yang lama tidak dibuka membawa salinan lamanya,
 *   catatan penghapusannya sudah dibuang, dan baris yang sudah dihapus hidup
 *   lagi. Persis keadaan sebelum catatan ini ada.
 *
 *   TERLALU PANJANG — daftarnya tumbuh terus di dalam tiap dokumen proyek dan
 *   ikut naik-turun pada setiap sinkronisasi.
 *
 * 180 hari dipilih karena ia jauh lebih lama daripada jeda terlama yang masuk
 * akal untuk sebuah HP proyek yang tidak dibuka, sementara satu baris nisan
 * hanya berisi id dan tanggal — seribu di antaranya masih di bawah 60 KB.
 */
export const UMUR_NISAN_HARI = 180

const waktuNisan = (n: Nisan | null | undefined): number => {
  const t = Date.parse(String(n?.at ?? ''))
  return Number.isFinite(t) ? t : 0
}

/** Catatan penghapusan pada sebuah dokumen proyek. */
export function nisanProyek(p: ProyekTersimpan | null | undefined): Nisan[] {
  const raw = (p as Record<string, unknown> | null | undefined)?.[MEDAN_NISAN]
  if (!Array.isArray(raw)) return []
  return raw
    .map(n => ({ id: String((n as Nisan)?.id ?? '').trim(), at: (n as Nisan)?.at }))
    .filter(n => !!n.id)
}

/**
 * Satukan dua daftar nisan, buang yang sudah kedaluwarsa.
 *
 * Yang PALING BARU menang untuk id yang sama: nisan yang tanggalnya lebih baru
 * berarti barisnya dihapus lagi setelah sempat dibuat ulang, dan tanggal itulah
 * yang menentukan kapan ia boleh dilupakan.
 */
export function gabungNisan(
  a: Nisan[] = [], b: Nisan[] = [], sekarang = Date.now(),
): Nisan[] {
  const batas = sekarang - UMUR_NISAN_HARI * 86_400_000
  const peta = new Map<string, Nisan>()
  for (const n of [...(a ?? []), ...(b ?? [])]) {
    const id = String(n?.id ?? '').trim()
    if (!id) continue
    const ada = peta.get(id)
    if (!ada || waktuNisan(n) > waktuNisan(ada)) peta.set(id, { id, at: n?.at })
  }
  // Nisan tanpa tanggal TIDAK dibuang: ketiadaan tanggal berarti asalnya tidak
  // diketahui, dan membuang penghapusan yang tidak diketahui umurnya berarti
  // menghidupkan kembali baris yang sudah sengaja dihapus.
  return [...peta.values()].filter(n => waktuNisan(n) === 0 || waktuNisan(n) >= batas)
}

/** Tambahkan catatan penghapusan ke sebuah dokumen proyek. */
export function tandaiDihapus(
  p: ProyekTersimpan, ids: string[], waktu = new Date().toISOString(),
): ProyekTersimpan {
  const baru = (ids ?? [])
    .map(id => String(id ?? '').trim())
    .filter(Boolean)
    .map(id => ({ id, at: waktu }))
  if (!baru.length) return p
  return { ...p, [MEDAN_NISAN]: gabungNisan(nisanProyek(p), baru) }
}

/**
 * Satukan isi dua salinan proyek yang sama.
 *
 * INILAH CACAT YANG DIPERBAIKI. Sebelumnya `gabungProyek` memilih SELURUH
 * dokumen milik sisi yang `updatedAt`-nya lebih baru. Akibatnya, ketika satu
 * orang mencatat dari ponsel dan satu lagi dari laptop, yang menyimpan
 * belakangan MENIMPA seluruh entri milik yang lain — bukan menambahinya.
 *
 * Itu benar-benar terjadi: laptop menampilkan 26 transaksi (Rp 46,79 juta)
 * sementara ponsel menampilkan 46 (Rp 109,42 juta) untuk proyek yang sama.
 * Dua puluh baris hilang tanpa pesan apa pun, dan yang melihat laptop mengira
 * itulah seluruh datanya.
 *
 * Medan biasa (nama proyek, RAB, setelan) tetap diambil dari dokumen yang
 * lebih baru — untuk itu `updatedAt` memang ada. Yang digabung per-baris hanya
 * daftar yang sifatnya BERTAMBAH: entri biaya. Barisnya dicocokkan lewat `id`,
 * dan versi dari dokumen yang lebih baru yang menang bila keduanya memuatnya.
 *
 * BATASAN ITU KINI DITUTUP. Dulu di sini tertulis bahwa baris yang dihapus di
 * satu perangkat bisa hidup lagi dari salinan perangkat lain, dan bahwa itu
 * "dipilih dengan sadar karena baris yang muncul kembali terlihat dan bisa
 * dihapus lagi".
 *
 * Alasan itu keliru pada satu titik yang menentukan: menghapusnya lagi TIDAK
 * MENYELESAIKAN APA PUN. Penghapusan berikutnya hanya menghasilkan dokumen
 * yang, sekali lagi, tidak memuat baris itu — sementara salinan sebelah masih
 * memuatnya, dan penggabungan berikutnya menghidupkannya kembali. Yang terjadi
 * bukan gangguan sesekali melainkan LINGKARAN: dihapus, kembali, dihapus,
 * kembali, dan pemakainya menyimpulkan aplikasinya tidak menyimpan apa-apa.
 *
 * Penggabungan berdasarkan gabungan (union) memang tidak bisa menyatakan
 * penghapusan sama sekali — ketiadaan sebuah baris di satu sisi tidak bisa
 * dibedakan dari "belum pernah ada di sisi itu". Satu-satunya jalan adalah
 * menuliskan penghapusannya, bukan menyiratkannya. Itulah nisan di bawah:
 * yang sudah dihapus tetap tercatat sebagai dihapus, dan penggabungan
 * menghormatinya.
 */
/**
 * Apakah salinan cloud perlu diperbarui dari hasil gabungan ini.
 *
 * Membandingkan JUMLAH saja tidak cukup lagi, dan cacatnya persis kebalikan
 * dari yang dulu dijaga. Setelah sebuah baris dihapus, hasil gabungan justru
 * lebih SEDIKIT daripada salinan cloud — pemeriksaan `g.length > c.length`
 * menjawab "tidak perlu didorong", cloud tetap memuat baris yang sudah
 * dihapus, dan penggabungan berikutnya menghidupkannya kembali. Lingkaran yang
 * sama, hanya berpindah tempat.
 *
 * Karena itu catatan penghapusan ikut diperiksa: nisan yang belum sampai ke
 * cloud adalah alasan yang cukup untuk mendorong, apa pun jumlah barisnya.
 */
function adaYangBelumDiCloud(gabung: ProyekTersimpan, cloud: ProyekTersimpan): boolean {
  const nisanCloud = new Set(nisanProyek(cloud).map(n => n.id))
  if (nisanProyek(gabung).some(n => !nisanCloud.has(n.id))) return true

  for (const medan of DAFTAR_ISI) {
    const g = Array.isArray(gabung[medan]) ? gabung[medan] as EntriBerId[] : []
    const c = Array.isArray(cloud[medan]) ? cloud[medan] as EntriBerId[] : []
    // Beda jumlah ke ARAH MANA PUN berarti kedua sisi belum sama. Yang lebih
    // banyak berarti ada baris baru; yang lebih sedikit berarti ada yang sudah
    // dihapus dan cloud belum tahu.
    if (g.length !== c.length) return true
  }
  return false
}

export function gabungIsiProyek(
  a: ProyekTersimpan, b: ProyekTersimpan,
): ProyekTersimpan {
  const [tua, muda] = waktuUbah(a) >= waktuUbah(b) ? [b, a] : [a, b]
  const hasil: ProyekTersimpan = { ...tua, ...muda }

  // Catatan penghapusan dari KEDUA sisi. Satu perangkat yang menghapus sudah
  // cukup: yang tidak tahu bukan berarti tidak setuju, ia hanya belum
  // mendengar.
  const nisan = gabungNisan(nisanProyek(tua), nisanProyek(muda))
  const dihapus = new Set(nisan.map(n => n.id))
  if (nisan.length) hasil[MEDAN_NISAN] = nisan
  else delete (hasil as Record<string, unknown>)[MEDAN_NISAN]

  for (const medan of DAFTAR_ISI) {
    const dariTua = Array.isArray(tua[medan]) ? tua[medan] as EntriBerId[] : []
    const dariMuda = Array.isArray(muda[medan]) ? muda[medan] as EntriBerId[] : []
    if (!dariTua.length && !dariMuda.length) continue

    const peta = new Map<string, EntriBerId>()
    // Yang tua lebih dulu supaya urutannya terjaga; yang muda menimpa isinya
    // bila id-nya sama.
    for (const e of dariTua) {
      const id = String(e?.id ?? '').trim()
      if (id && !dihapus.has(id)) peta.set(id, e)
    }
    for (const e of dariMuda) {
      const id = String(e?.id ?? '').trim()
      if (id && !dihapus.has(id)) peta.set(id, e)
    }
    hasil[medan] = [...peta.values()]
  }
  return hasil
}
