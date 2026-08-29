// ============================================================
// PropFS — Cap tanggal & jam DI ATAS fotonya
//
// Foto serah-terima alat gunanya membuktikan dua hal: keadaan alatnya, dan
// KAPAN keadaan itu direkam. Tanggal yang hanya tersimpan di baris database
// membuktikan yang kedua hanya bagi yang percaya pada barisnya.
//
// Itu justru yang tidak ada ketika dibutuhkan. Genset dikembalikan lecet,
// yang meminjam bilang "sudah begitu waktu saya ambil", dan foto yang ada
// tidak menunjukkan apa-apa tentang kapan ia diambil. Yang tersisa dua
// ingatan yang bertentangan.
//
// Cap yang DIBAKAR ke dalam gambarnya ikut ke mana pun gambarnya pergi —
// termasuk ketika ia diteruskan lewat WhatsApp, tempat seluruh perselisihan
// ini biasanya berlangsung.
//
// Ia bukan bukti kriptografis; siapa pun yang mau bisa memalsukannya. Yang
// dicegahnya bukan pemalsuan melainkan KETIDAKJELASAN — dan itulah yang
// sembilan dari sepuluh kali menjadi sengketanya.
//
// Yang di sini hanya HITUNGAN dan TEKSNYA supaya bisa diuji tanpa DOM;
// penggambarannya ke kanvas ada di imageUtil.
// ============================================================

const dua = (n: number): string => String(n).padStart(2, '0')

const BULAN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

/**
 * Teks cap: tanggal, jam, lalu keterangan.
 *
 * Ditulis untuk dibaca orang di layar HP, bukan untuk diurai mesin —
 * "21 Agu 2026 · 08:17" dan bukan ISO. Yang membacanya mandor yang sedang
 * berdebat soal kapan alatnya diserahkan, dan ia harus bisa membacanya
 * sekilas tanpa menerjemahkan apa pun.
 */
export function tekesCap(waktu: Date | string | number, keterangan = ''): string {
  const d = waktu instanceof Date ? waktu : new Date(waktu)
  const sah = !Number.isNaN(d.getTime())
  if (!sah) return String(keterangan ?? '').trim()

  const tanggal = `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`
  const jam = `${dua(d.getHours())}:${dua(d.getMinutes())}`
  const ket = String(keterangan ?? '').trim()
  return ket ? `${tanggal} · ${jam} · ${ket}` : `${tanggal} · ${jam}`
}

export interface UkuranCap {
  /** Tinggi huruf dalam piksel. */
  fontPx: number
  /** Tinggi bidang gelap di dasar gambar. */
  tinggiBidang: number
  /** Jarak teks dari tepi kiri. */
  padKiri: number
  /** Garis dasar teks, dihitung dari atas gambar. */
  baseline: number
}

/**
 * Ukuran cap, diturunkan dari LEBAR gambarnya.
 *
 * Bukan angka tetap. Foto yang dikecilkan ke 640 piksel dan foto 2000 piksel
 * sama-sama ditampilkan selebar layar, jadi cap setinggi 14 piksel yang pas
 * pada yang pertama menjadi goresan tak terbaca pada yang kedua.
 *
 * Ada lantai dan langit-langitnya: di bawah 11 piksel huruf tidak terbaca
 * setelah gambarnya dikirim lewat WhatsApp yang memampatkannya lagi, dan di
 * atas 48 piksel capnya mulai menutupi barang yang justru difoto.
 */
export function ukuranCap(lebar: unknown): UkuranCap {
  const w = Math.max(1, Math.floor(Number(lebar) || 0))
  const fontPx = Math.min(48, Math.max(11, Math.round(w * 0.038)))
  const tinggiBidang = Math.round(fontPx * 1.9)
  return {
    fontPx,
    tinggiBidang,
    padKiri: Math.round(fontPx * 0.6),
    baseline: 0, // diisi `letakCap`
  }
}

/**
 * Di mana capnya digambar pada sebuah gambar setinggi `tinggi`.
 *
 * Selalu di DASAR gambar. Bagian atas foto lapangan hampir selalu berisi
 * langit atau atap — kosong dan aman — tetapi bagian yang dipotret orang
 * justru sering ada di sepertiga atas bingkai. Menaruh cap di sana menutupi
 * hal yang menjadi alasan foto itu diambil.
 */
export function letakCap(lebar: unknown, tinggi: unknown): UkuranCap & { atasBidang: number } {
  const u = ukuranCap(lebar)
  const h = Math.max(1, Math.floor(Number(tinggi) || 0))
  const atasBidang = Math.max(0, h - u.tinggiBidang)
  return {
    ...u,
    atasBidang,
    // Garis dasar teks diletakkan sedikit di atas dasar bidang, bukan di
    // tengahnya: huruf berekor (g, y, p) turun di bawah garis dasar, dan
    // menempatkannya di tengah membuat ekornya terpotong tepi gambar.
    baseline: atasBidang + Math.round(u.tinggiBidang * 0.68),
  }
}

/**
 * Apakah sebuah teks cap masih pantas dibakar ke gambar selebar ini.
 *
 * Teks yang jauh lebih panjang daripada lebar gambarnya akan terpotong di
 * tengah kata dan menjadi lebih membingungkan daripada tidak ada cap sama
 * sekali — "21 Agu 2026 · 08:17 · Serah terima gens" terbaca seperti data
 * yang rusak.
 */
export function capMuat(teks: unknown, lebar: unknown): boolean {
  const t = String(teks ?? '')
  if (!t) return false
  const { fontPx, padKiri } = ukuranCap(lebar)
  // ±0,55 lebar huruf per piksel tinggi untuk huruf sans-serif biasa. Kasar,
  // tetapi cukup: yang perlu dijawab hanya "muat atau tidak", bukan berapa
  // piksel tepatnya.
  const perkiraanLebar = t.length * fontPx * 0.55
  return perkiraanLebar <= Math.max(1, Number(lebar) || 0) - padKiri * 2
}

/**
 * Pendekkan keterangan sampai capnya muat, tanggal & jam TIDAK pernah dibuang.
 *
 * Urutan pengorbanannya disengaja: keterangan boleh hilang, waktu tidak.
 * Waktulah satu-satunya bagian yang tidak bisa didapat dari tempat lain —
 * keterangan masih tercatat di barisnya, tanggal pada foto yang beredar di
 * WhatsApp tidak ada di mana pun selain di gambar itu.
 */
export function capPas(
  waktu: Date | string | number, keterangan: string, lebar: unknown,
): string {
  const penuh = tekesCap(waktu, keterangan)
  if (capMuat(penuh, lebar)) return penuh

  const tanpaKet = tekesCap(waktu, '')
  let ket = String(keterangan ?? '').trim()
  while (ket.length > 1) {
    ket = ket.slice(0, -1).trim()
    const coba = `${tanpaKet} · ${ket}…`
    if (capMuat(coba, lebar)) return coba
  }
  return tanpaKet
}
