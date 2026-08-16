// ============================================================
// PropFS — Subjek materi promosi: TENTANG APA materi ini dibuat
//
// CACAT YANG DIPERBAIKI BERKAS INI.
//
// Marcom mengambil nama proyek dari proyek yang kebetulan sedang terbuka, dan
// tidak menyediakan satu pun cara mengubahnya. Nama itu lalu DIBAKAR ke dalam
// gambar — "Project: Ruko Pak Soni | Ruko De Monde Bay" — dan ikut ke caption
// yang ditulis AI.
//
// Akibatnya: aplikasi ini hanya bisa mempromosikan proyek yang terakhir
// dibuka. Mau mengumumkan proyek baru? Tidak bisa. Mengangkat proyek lama yang
// fotonya bagus? Tidak bisa. Membuat materi perusahaan — ucapan hari raya,
// lowongan tukang, profil singkat — yang memang tidak menyebut proyek mana
// pun? Tidak bisa juga; namanya tetap muncul di sana.
//
// KENAPA INI SALAH SECARA MENDASAR, bukan sekadar kolom yang lupa dibuat:
//
// Modul lain — RAB, realisasi, kurva S — memang MILIK sebuah proyek. Subjeknya
// sudah ditentukan oleh konteksnya, dan mewarisi proyek aktif adalah perilaku
// yang benar.
//
// Marcom tidak begitu. Ia alat PEMASARAN. Yang dipromosikan orang minggu ini
// hampir tidak pernah sama dengan yang sedang dikerjakannya hari ini. Subjek
// di sini adalah pilihan yang sadar, dan karena itu ia harus menjadi data
// tersendiri — bukan bayangan dari layar sebelah.
//
// Modul murni: tanpa DOM, tanpa jaringan, bisa diuji langsung di Node.
// ============================================================

export interface SubjekMarcom {
  /** Nama yang dicetak besar, mis. "Noble Cove Residence". */
  judul: string
  /** Baris kecil pendamping: lokasi, tahap, atau apa pun. */
  lokasi: string
  /** Lingkup pekerjaan di pita bawah, mis. "Civil, Arsitektur & MEP". */
  lingkup: string
}

export const SUBJEK_KOSONG: SubjekMarcom = { judul: '', lokasi: '', lingkup: '' }

/** Nilai khusus pemilih: materi yang tidak menyebut proyek mana pun. */
export const TANPA_PROYEK = '__tanpa__'
/** Nilai khusus pemilih: judul diketik sendiri, di luar daftar proyek. */
export const KETIK_SENDIRI = '__ketik__'

function teks(s: unknown): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ')
}

/** Bentuk proyek tersimpan seminimal yang dibutuhkan modul ini. */
export interface ProyekRingkas {
  id?: string
  projectName?: string
  location?: string
  type?: string
}

/** Subjek dari sebuah proyek tersimpan. */
export function subjekDariProyek(p: ProyekRingkas | null | undefined): SubjekMarcom {
  return {
    judul: teks(p?.projectName),
    lokasi: teks(p?.location),
    // Jenis proyek ("Ruko", "Perumahan") BUKAN lingkup pekerjaan. Lingkup
    // adalah apa yang dikerjakan — sipil, arsitektur, MEP — dan hanya
    // pemiliknya yang tahu. Mengisinya dengan jenis akan mencetak
    // "Project: Noble Cove | Perumahan", yang berbunyi seperti keterangan
    // kategori, bukan seperti pengumuman pekerjaan.
    lingkup: '',
  }
}

/**
 * Subjek yang ditawarkan saat halaman Marcom pertama dibuka.
 *
 * Proyek aktif dipakai sebagai TAWARAN — bukan sebagai kunci. Kebanyakan
 * materi memang tentang proyek yang sedang dikerjakan, jadi mengisinya lebih
 * dulu menghemat pengetikan. Yang berubah dari sebelumnya: sekarang ia bisa
 * diganti.
 */
export function subjekAwal(
  aktif: ProyekRingkas | null | undefined,
  daftar: ProyekRingkas[] | null | undefined,
): SubjekMarcom {
  if (teks(aktif?.projectName)) return subjekDariProyek(aktif)
  const pertama = (daftar ?? []).find(p => teks(p?.projectName))
  return pertama ? subjekDariProyek(pertama) : { ...SUBJEK_KOSONG }
}

export interface PilihanSubjek {
  nilai: string
  label: string
}

/**
 * Isi pemilih "materi ini tentang apa".
 *
 * Dua pilihan terakhir bukan pelengkap — merekalah yang membuat modul ini
 * berhenti terkurung pada proyek aktif:
 *   - KETIK SENDIRI untuk proyek yang belum ada di sistem. Proyek baru
 *     diumumkan JAUH sebelum RAB-nya dibuat; itulah justru saat promosi paling
 *     dibutuhkan.
 *   - TANPA PROYEK untuk materi perusahaan: ucapan hari raya, lowongan tukang,
 *     profil singkat. Materi seperti itu tidak boleh membawa nama proyek siapa
 *     pun di pojok bawahnya.
 */
export function pilihanSubjek(daftar: ProyekRingkas[] | null | undefined): PilihanSubjek[] {
  const proyek = (daftar ?? [])
    .filter(p => teks(p?.projectName))
    .map(p => ({ nilai: String(p.id ?? p.projectName), label: teks(p.projectName) }))

  // Nama proyek yang sama bisa muncul dua kali bila proyeknya memang dibuat
  // dua kali; yang disaring adalah NILAI kembar, karena itulah yang membuat
  // pemilihnya tidak bisa membedakan mana yang sedang dipilih.
  const terlihat = new Set<string>()
  const unik = proyek.filter(p => !terlihat.has(p.nilai) && terlihat.add(p.nilai))

  return [
    ...unik,
    { nilai: KETIK_SENDIRI, label: 'Proyek lain — ketik sendiri' },
    { nilai: TANPA_PROYEK, label: 'Tanpa proyek (materi perusahaan)' },
  ]
}

/**
 * Subjek setelah sebuah pilihan diketuk.
 *
 * `sebelumnya` dibawa supaya lingkup pekerjaan yang sudah diketik tidak hilang
 * saat berpindah proyek: "Civil, Arsitektur & MEP" berlaku untuk seluruh
 * proyek perusahaan itu, dan mengetiknya ulang tiap kali berganti materi
 * adalah pekerjaan yang tidak ada gunanya.
 */
export function pilihSubjek(
  nilai: string,
  daftar: ProyekRingkas[] | null | undefined,
  sebelumnya: SubjekMarcom = SUBJEK_KOSONG,
): SubjekMarcom {
  const lingkup = teks(sebelumnya.lingkup)

  if (nilai === TANPA_PROYEK) return { judul: '', lokasi: '', lingkup }
  if (nilai === KETIK_SENDIRI) {
    // Judul DIKOSONGKAN, bukan dibiarkan. Kalau nama proyek sebelumnya
    // tertinggal di kolom, orang akan menekan Unduh tanpa sadar materinya
    // masih menyebut proyek yang salah — persis cacat yang sedang diperbaiki.
    return { judul: '', lokasi: '', lingkup }
  }

  const p = (daftar ?? []).find(x => String(x?.id ?? x?.projectName) === nilai)
  return p ? { ...subjekDariProyek(p), lingkup } : { judul: '', lokasi: '', lingkup }
}

/**
 * Pilihan mana yang sedang berlaku untuk sebuah subjek.
 *
 * Dibutuhkan karena judulnya bisa diketik bebas setelah dipilih: begitu
 * ketikannya tidak lagi cocok dengan proyek mana pun, pemilihnya harus
 * berpindah sendiri ke "ketik sendiri" — kalau tidak, layarnya mengaku sedang
 * menampilkan proyek yang sebenarnya sudah tidak dipakai.
 */
export function nilaiTerpilih(
  subjek: SubjekMarcom,
  daftar: ProyekRingkas[] | null | undefined,
): string {
  const judul = teks(subjek?.judul)
  if (!judul) return TANPA_PROYEK
  const cocok = (daftar ?? []).find(
    p => teks(p?.projectName).toLowerCase() === judul.toLowerCase(),
  )
  return cocok ? String(cocok.id ?? cocok.projectName) : KETIK_SENDIRI
}

/**
 * Mode pemilih setelah judulnya DIKETIK.
 *
 * Kenapa mode harus disimpan, bukan diturunkan dari judulnya:
 *
 * Menurunkannya terdengar rapi — "judul kosong berarti tanpa proyek" — tetapi
 * pada saat dipakai, ia menelan dirinya sendiri. Begitu orang memilih "ketik
 * sendiri", judulnya dikosongkan (memang harus, supaya nama proyek lama tidak
 * tertinggal), turunannya membaca kosong itu sebagai "tanpa proyek", dan
 * kolom yang baru saja diminta untuk diketik LENYAP sebelum sempat disentuh.
 *
 * Jadi mode adalah keadaan tersendiri, dan fungsi ini hanya menggesernya saat
 * ketikannya memang menuntut: nama yang cocok dengan sebuah proyek membuat
 * pemilihnya berpindah ke proyek itu — kalau tidak, layarnya mengaku sedang
 * menampilkan proyek yang sudah tidak dipakai.
 */
export function modeSetelahKetik(
  judul: unknown,
  daftar: ProyekRingkas[] | null | undefined,
  modeSekarang: string,
): string {
  // Materi perusahaan tidak punya kolom judul sama sekali; kalau toh sampai
  // ke sini, modenya tidak boleh bergeser sendiri.
  if (modeSekarang === TANPA_PROYEK) return TANPA_PROYEK

  const n = teks(judul)
  if (!n) return KETIK_SENDIRI

  const cocok = (daftar ?? []).find(
    p => teks(p?.projectName).toLowerCase() === n.toLowerCase(),
  )
  return cocok ? String(cocok.id ?? cocok.projectName) : KETIK_SENDIRI
}

/**
 * Baris persis seperti yang akan TERCETAK di gambar.
 *
 * Ditampilkan sebelum dirender karena tulisan ini dibakar ke dalam foto: salah
 * satu huruf pun tidak bisa diperbaiki setelah materinya diunggah ke Instagram
 * — yang bisa dilakukan hanyalah menghapus unggahannya.
 *
 * Bentuknya harus sama persis dengan garisProyek() di marcom.ts; diuji
 * berdampingan supaya keduanya tidak pernah berbeda diam-diam.
 */
export function pratinjauGaris(subjek: SubjekMarcom | null | undefined): string {
  const n = teks(subjek?.judul)
  const l = teks(subjek?.lingkup) || teks(subjek?.lokasi)
  if (!n && !l) return ''
  if (!n) return l
  return l ? `Project: ${n} | ${l}` : `Project: ${n}`
}

/**
 * Apakah subjek ini akan mencetak sesuatu di pita bawah.
 *
 * Kosong itu SAH — materi perusahaan memang tidak menyebut proyek. Yang
 * dibutuhkan hanyalah memberi tahu pemakainya bahwa pitanya akan kosong,
 * supaya ia tidak mengira ada yang gagal.
 */
export function adaGarisProyek(subjek: SubjekMarcom | null | undefined): boolean {
  return pratinjauGaris(subjek).length > 0
}

// ── Caption yang tertinggal di proyek lama ──────────────────────────────────

/**
 * Nama proyek asing yang masih disebut sebuah caption.
 *
 * MASALAHNYA. Gambar dan caption disusun terpisah. Begitu subjeknya diganti,
 * gambarnya ikut — tetapi captionnya, yang sudah lebih dulu ditulis, tetap
 * menyebut proyek lama. Yang ditempel orang ke Instagram adalah CAPTION-nya.
 * Jadi yang terbit adalah foto Noble Cove dengan tulisan "Update progres Ruko
 * Pak Soni", lengkap dengan tagar proyek yang salah.
 *
 * KENAPA TIDAK DITIMPA SAJA. Caption bisa sudah disunting tangan, atau ditulis
 * AI dengan susunan yang disukai pemakainya. Menimpanya diam-diam menghapus
 * pekerjaan orang — kesalahan yang lebih mahal daripada nama yang tertinggal,
 * karena yang hilang tidak bisa dikembalikan.
 *
 * Jadi yang dilakukan hanya MEMBERI TAHU, dan menyediakan tombol untuk
 * menulis ulang bila memang diinginkan.
 */
export function proyekAsingDiCaption(
  caption: unknown,
  judulSekarang: unknown,
  namaProyek: Array<string | null | undefined> | null | undefined,
): string[] {
  const t = String(caption ?? '')
  if (!t.trim()) return []
  const sekarang = teks(judulSekarang).toLowerCase()

  const out: string[] = []
  for (const n of namaProyek ?? []) {
    const nama = teks(n)
    if (!nama) continue
    if (nama.toLowerCase() === sekarang) continue
    // Dicocokkan pada teks polos maupun bentuk tagar (#RukoDeMondeBay), karena
    // tagar itulah yang paling sering tertinggal dan paling jarang terbaca
    // ulang sebelum ditempel.
    const polos = t.toLowerCase().includes(nama.toLowerCase())
    const tagar = t.toLowerCase().includes(`#${nama.replace(/\s+/g, '').toLowerCase()}`)
    if ((polos || tagar) && !out.includes(nama)) out.push(nama)
  }
  return out
}

/**
 * Apakah caption ini masih naskah bawaan yang belum disentuh siapa pun.
 *
 * Hanya yang masih utuh begini yang boleh disegarkan sendiri saat subjeknya
 * berganti. Sekali orang mengetik satu huruf di dalamnya, ia miliknya.
 */
export function captionMasihBawaan(
  caption: unknown,
  naskahTerakhir: unknown,
): boolean {
  const t = String(caption ?? '')
  if (!t.trim()) return true
  return t === String(naskahTerakhir ?? '')
}
