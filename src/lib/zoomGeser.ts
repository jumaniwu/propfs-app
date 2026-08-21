// ============================================================
// PropFS — Cubit untuk memperbesar, seret untuk menggeser
//
// Denah dibaca dengan cara yang berbeda dari membaca dokumen. Yang dicari
// bukan kalimat melainkan ANGKA di sudut gambar: dimensi kolom, jarak as,
// elevasi. Angka-angka itu ditulis untuk kertas A1, dan di layar HP selebar
// 390 piksel ia setinggi satu-dua piksel — bukan kecil, melainkan tidak ada.
//
// Karena itu memperbesar bukan kenyamanan tambahan di sini; tanpa itu
// gambarnya tidak bisa dipakai sama sekali, dan satu-satunya jalan tersisa
// adalah mengunduhnya ke aplikasi lain — persis yang hendak dihindari.
//
// Yang diurus modul ini hanya HITUNGANNYA, dan hitungan itu punya dua bagian
// yang mudah dibuat salah:
//
//   1. MEMPERBESAR HARUS BERPUSAT DI JARI. Kalau titik pusatnya selalu tengah
//      layar, gambar yang sedang dilihat melompat pergi tepat ketika orangnya
//      mencoba memperbesarnya. Rasanya seperti alat yang melawan.
//   2. GESERAN HARUS DIBATASI. Tanpa batas, satu sapuan terlalu kuat
//      melemparkan gambarnya ke luar layar, dan yang tersisa bidang kosong
//      tanpa petunjuk arah untuk kembali.
//
// Tanpa DOM supaya bisa diuji di Node.
// ============================================================

/** Perbesaran terkecil: seluruh gambar terlihat. */
export const SKALA_MIN = 1

/**
 * Perbesaran terbesar.
 *
 * 8x, dan angkanya bukan sembarang: gambar dirender pada lebar sekitar tiga
 * kali lebar layar, jadi di atas 8x yang bertambah hanyalah piksel yang
 * dibesarkan — kabur, dan menipu orang yang mengira ia belum cukup dekat.
 */
export const SKALA_MAKS = 8

/** Perbesaran satu ketukan ganda. Cukup untuk membaca dimensi pada denah. */
export const SKALA_KETUK = 2.5

export interface Titik { x: number; y: number }

const angka = (v: unknown, bawaan = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : bawaan
}

export function batasSkala(s: unknown): number {
  const n = angka(s, SKALA_MIN)
  return Math.min(SKALA_MAKS, Math.max(SKALA_MIN, n))
}

export interface KeadaanZoom {
  skala: number
  /** Geseran dalam piksel layar, relatif terhadap posisi terpusat. */
  x: number
  y: number
}

export const ZOOM_AWAL: KeadaanZoom = { skala: SKALA_MIN, x: 0, y: 0 }

export interface UkuranTampil {
  /** Ukuran kotak yang terlihat. */
  lebarLayar: number
  tinggiLayar: number
  /** Ukuran konten pada skala 1. */
  lebarKonten: number
  tinggiKonten: number
}

/**
 * Batasi geseran supaya tepi konten tidak pernah masuk ke dalam layar.
 *
 * Ketika kontennya LEBIH KECIL daripada layar pada sumbu tertentu, geseran di
 * sumbu itu dikunci ke nol — bukan dibatasi longgar. Denah potret pada layar
 * HP hanya bisa digeser naik-turun; membiarkannya bergeser ke samping sedikit
 * demi sedikit membuat orang menyangka gambarnya "lari", padahal memang tidak
 * ada yang bisa dilihat di samping.
 */
export function geserTerbatas(z: KeadaanZoom, u: UkuranTampil): KeadaanZoom {
  const skala = batasSkala(z?.skala)
  const lebarIsi = angka(u?.lebarKonten) * skala
  const tinggiIsi = angka(u?.tinggiKonten) * skala
  const lebarLayar = angka(u?.lebarLayar)
  const tinggiLayar = angka(u?.tinggiLayar)

  const batasX = Math.max(0, (lebarIsi - lebarLayar) / 2)
  const batasY = Math.max(0, (tinggiIsi - tinggiLayar) / 2)

  return {
    skala,
    x: Math.min(batasX, Math.max(-batasX, angka(z?.x))),
    y: Math.min(batasY, Math.max(-batasY, angka(z?.y))),
  }
}

/**
 * Perbesar dengan satu titik yang TETAP DI TEMPATNYA.
 *
 * Inti seluruh modul ini. Titik yang dijadikan pusat — tengah antara dua jari,
 * atau tempat ketukan ganda mendarat — harus berada di piksel layar yang sama
 * sebelum dan sesudah perbesaran. Kalau tidak, gambar melompat pergi tepat
 * ketika orangnya mencoba mendekatinya.
 *
 * `pusat` diberikan relatif terhadap TENGAH kotak tampil, bukan terhadap sudut
 * kiri atasnya. Bentuk itu dipilih karena geseran di sini juga diukur dari
 * tengah — memakai dua acuan berbeda dalam satu perhitungan adalah cara paling
 * mudah menghasilkan pergeseran yang selalu meleset separuh layar.
 */
export function zoomKeTitik(
  z: KeadaanZoom, skalaBaru: unknown, pusat: Titik, u?: UkuranTampil,
): KeadaanZoom {
  const lama = batasSkala(z?.skala)
  const baru = batasSkala(skalaBaru)
  const px = angka(pusat?.x)
  const py = angka(pusat?.y)

  // Titik konten yang sedang berada di bawah `pusat`, dinyatakan pada skala 1.
  // Sesudah diperbesar, geserannya disusun ulang supaya titik itu kembali
  // mendarat di tempat yang sama.
  const rasio = baru / lama
  const hasil: KeadaanZoom = {
    skala: baru,
    x: px - (px - angka(z?.x)) * rasio,
    y: py - (py - angka(z?.y)) * rasio,
  }
  return u ? geserTerbatas(hasil, u) : hasil
}

/**
 * Skala berikutnya untuk ketukan ganda.
 *
 * Dua keadaan saja, bukan tangga bertingkat: mendekat, lalu kembali utuh.
 * Tangga yang mengharuskan mengetuk empat kali untuk kembali membuat orang
 * menutup gambarnya lalu membukanya lagi — dan itu lebih lambat daripada
 * seluruh yang hendak dihemat.
 */
export function skalaKetukGanda(sekarang: unknown): number {
  return batasSkala(sekarang) > SKALA_MIN + 0.01 ? SKALA_MIN : SKALA_KETUK
}

/** Jarak antara dua jari. */
export function jarak(a: Titik, b: Titik): number {
  const dx = angka(a?.x) - angka(b?.x)
  const dy = angka(a?.y) - angka(b?.y)
  return Math.hypot(dx, dy)
}

/** Titik tengah antara dua jari. */
export function tengah(a: Titik, b: Titik): Titik {
  return { x: (angka(a?.x) + angka(b?.x)) / 2, y: (angka(a?.y) + angka(b?.y)) / 2 }
}

/**
 * Skala hasil cubitan.
 *
 * Dihitung dari jarak AWAL cubitan, bukan dari jarak sebelumnya. Menghitung
 * bertahap membuat galat pembulatan menumpuk sepanjang gerakan: jari kembali
 * ke jarak semula, tetapi gambarnya tidak kembali ke ukuran semula.
 */
export function skalaCubit(skalaAwal: unknown, jarakAwal: unknown, jarakKini: unknown): number {
  const awal = angka(jarakAwal)
  if (awal <= 0) return batasSkala(skalaAwal)
  return batasSkala(angka(skalaAwal, SKALA_MIN) * (angka(jarakKini) / awal))
}

/** Apakah sedang diperbesar — dipakai memutuskan siapa yang menerima seretan. */
export function sedangDiperbesar(z: KeadaanZoom): boolean {
  return batasSkala(z?.skala) > SKALA_MIN + 0.01
}

/**
 * Apakah seretan harus DITANGKAP penampil, atau dibiarkan menggulung halaman.
 *
 * Selama gambarnya belum diperbesar, satu-satunya gerakan yang masuk akal
 * adalah menggulung daftar halaman — merebutnya membuat daftar terasa macet.
 * Begitu diperbesar, seretan berarti menggeser gambar; membiarkannya lolos ke
 * halaman membuat gambar yang sedang diperiksa hanyut pergi.
 */
export function tangkapSeretan(z: KeadaanZoom): boolean {
  return sedangDiperbesar(z)
}
