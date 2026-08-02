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
    if (waktuUbah(l) > waktuUbah(c)) {
      peta.set(id, l)
      perluDorong.push(l)
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
