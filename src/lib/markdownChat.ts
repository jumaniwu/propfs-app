// ============================================================
// PropFS — Membaca balasan AI menjadi blok yang bisa digambar
//
// AKAR MASALAH YANG DIPERBAIKI BERKAS INI.
//
// Instruksi sistemnya sejak dulu berbunyi "Balas ramah dan tampilkan tabel
// rekap markdown", dan model memang mengirim tabel. Yang hilang bukan
// tabelnya — melainkan yang menggambarnya.
//
// Chat lama (TabRealisasiBiaya) punya `MarkdownText`: tabel sungguhan, judul,
// dan butir. Halaman Chat AI yang baru menyalin sebagian kecilnya menjadi
// `Teks` — hanya menebalkan `**…**`, membuang baris pemisah `|---|`, dan
// mencetak sisanya sebagai paragraf datar. Jadi tabel yang dikirim model
// keluar sebagai deretan pipa, judul keluar sebagai "## ", dan butir keluar
// sebagai baris biasa. Persis yang dilaporkan: "format chat dulu lebih rapi,
// kalau perlu tabel dia munculin tabel."
//
// Dua penggambar untuk satu pekerjaan itulah sebabnya yang satu tertinggal.
// Sekarang keduanya memakai pengurai ini.
//
// Dua cacat pada penggambar lama sekalian diperbaiki:
//
//   • `.filter(c => c.trim())` MEMBUANG sel kosong, sehingga baris yang qty-nya
//     tidak tertulis bergeser ke kiri dan angka masuk ke kolom yang salah —
//     tabel yang salah lebih berbahaya daripada tabel yang tidak muncul.
//   • `rows = slice(2)` menganggap baris pemisah selalu ada; bila model
//     melewatkannya, baris data pertama ikut termakan.
//
// Tanpa DOM supaya bisa diuji di Node.
// ============================================================

export type Gaya = 'biasa' | 'tebal' | 'kode'

export interface Bagian { gaya: Gaya; teks: string }

export type Blok =
  | { jenis: 'tabel'; kepala: string[]; baris: string[][] }
  | { jenis: 'judul'; tingkat: 1 | 2 | 3; teks: string }
  | { jenis: 'daftar'; urut: boolean; butir: string[] }
  | { jenis: 'kode'; isi: string }
  | { jenis: 'paragraf'; teks: string }
  | { jenis: 'jeda' }

const BARIS_TABEL = (l: string) => l.trim().startsWith('|')
/** Baris pemisah tabel: hanya `-`, `:`, `|`, dan spasi — dan harus ada `-`. */
const PEMISAH = (l: string) => /^[\s|:-]+$/.test(l) && l.includes('-')

/**
 * Pecah satu baris tabel menjadi sel.
 *
 * Sel kosong DIPERTAHANKAN. Membuangnya menggeser seluruh kolom di kanannya,
 * dan pada tabel nota itu berarti harga satuan terbaca sebagai qty.
 */
export function selBaris(baris: string): string[] {
  return baris.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim())
}

/** Potong `**tebal**` dan `` `kode` `` menjadi bagian yang bisa digambar. */
export function potongGaya(teks: string): Bagian[] {
  const hasil: Bagian[] = []
  for (const p of String(teks ?? '').split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
    if (!p) continue
    if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) {
      hasil.push({ gaya: 'tebal', teks: p.slice(2, -2) })
    } else if (p.length > 2 && p.startsWith('`') && p.endsWith('`')) {
      hasil.push({ gaya: 'kode', teks: p.slice(1, -1) })
    } else {
      hasil.push({ gaya: 'biasa', teks: p })
    }
  }
  return hasil.length ? hasil : [{ gaya: 'biasa', teks: '' }]
}

/**
 * Uraikan balasan AI menjadi blok.
 *
 * Blok JSON di akhir pesan sudah dilucuti `extractEntriesFromText` sebelum
 * sampai ke sini; pagar ```…``` di bawah untuk pagar lain yang mungkin ikut.
 */
export function uraikanMarkdown(teks: unknown): Blok[] {
  const baris = String(teks ?? '').split('\n')
  const blok: Blok[] = []
  let i = 0

  while (i < baris.length) {
    const b = baris[i]

    // ── Pagar kode ───────────────────────────────────────────────────────
    if (b.trim().startsWith('```')) {
      const isi: string[] = []
      i++
      while (i < baris.length && !baris[i].trim().startsWith('```')) { isi.push(baris[i]); i++ }
      i++ // pagar penutup
      if (isi.length) blok.push({ jenis: 'kode', isi: isi.join('\n') })
      continue
    }

    // ── Tabel ────────────────────────────────────────────────────────────
    if (BARIS_TABEL(b)) {
      const kumpul: string[] = []
      while (i < baris.length && BARIS_TABEL(baris[i])) { kumpul.push(baris[i]); i++ }

      const kepala = selBaris(kumpul[0])
      // Baris pemisah hanya dilewati bila ia MEMANG ada. Menganggapnya selalu
      // ada akan memakan baris data pertama pada tabel yang tidak memuatnya.
      const mulai = kumpul.length > 1 && PEMISAH(kumpul[1]) ? 2 : 1
      const isi = kumpul.slice(mulai)
        .map(selBaris)
        // Kolom disamakan dengan kepalanya: kelebihan dibuang, kekurangan
        // diisi kosong. Tanpa ini satu baris cacat merusak seluruh tabel.
        .map(r => Array.from({ length: kepala.length }, (_, k) => r[k] ?? ''))

      // Satu baris berpipa tanpa isi bukan tabel — itu kalimat biasa.
      if (isi.length) blok.push({ jenis: 'tabel', kepala, baris: isi })
      else blok.push({ jenis: 'paragraf', teks: kumpul[0] })
      continue
    }

    // ── Judul ────────────────────────────────────────────────────────────
    const judul = /^(#{1,3})\s+(.*)$/.exec(b)
    if (judul) {
      blok.push({ jenis: 'judul', tingkat: judul[1].length as 1 | 2 | 3, teks: judul[2].trim() })
      i++
      continue
    }

    // ── Daftar ───────────────────────────────────────────────────────────
    const butirTak = /^\s*[-*•]\s+(.*)$/
    const butirUrut = /^\s*\d+[.)]\s+(.*)$/
    if (butirTak.test(b) || butirUrut.test(b)) {
      const urut = butirUrut.test(b)
      const pola = urut ? butirUrut : butirTak
      const butir: string[] = []
      while (i < baris.length) {
        const m = pola.exec(baris[i])
        if (!m) break
        butir.push(m[1].trim())
        i++
      }
      blok.push({ jenis: 'daftar', urut, butir })
      continue
    }

    // ── Garis pemisah & baris kosong ─────────────────────────────────────
    if (!b.trim() || /^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(b)) {
      // Jeda beruntun tidak digandakan: balasan model sering penuh baris kosong.
      if (blok[blok.length - 1]?.jenis !== 'jeda' && blok.length) blok.push({ jenis: 'jeda' })
      i++
      continue
    }

    blok.push({ jenis: 'paragraf', teks: b.trim() })
    i++
  }

  while (blok.length && blok[blok.length - 1].jenis === 'jeda') blok.pop()
  return blok
}

/**
 * Apakah balasan ini memuat tabel.
 *
 * Gelembung chat dibatasi 85% lebar layar supaya percakapan terlihat sebagai
 * percakapan. Tetapi tabel rekap nota butuh setiap piksel yang ada: pada
 * ponsel 390 piksel, potongan 15% itu cukup untuk membuang kolom TOTAL ke luar
 * layar — justru kolom yang paling dicari orang. Yang memuat tabel diberi
 * lebar penuh.
 */
export function adaTabel(teks: unknown): boolean {
  return uraikanMarkdown(teks).some(b => b.jenis === 'tabel')
}
