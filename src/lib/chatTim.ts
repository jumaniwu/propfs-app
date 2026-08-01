// ============================================================
// PropFS — Chat Tim: percakapan orang + kabar sistem dalam satu aliran
//
// Koordinasi tim selama ini terjadi di WhatsApp, di luar sistem. Akibatnya
// keputusan lapangan tidak punya jejak yang bisa dirujuk, dan kabar sistem
// (laporan masuk, material diminta, PO disetujui) hidup di tempat lain lagi —
// terpisah dari percakapan yang membahasnya.
//
// Di sini keduanya dijadikan SATU ALIRAN. Pesan orang datang dari tabel
// `team_messages`; kabar sistem TIDAK disimpan di tabel mana pun melainkan
// diturunkan saat dibaca dari data yang sudah ada (lihat `notifikasi.ts`).
// Itu berarti tidak ada trigger yang bisa gagal, kabarnya berlaku surut, dan
// bila barisnya dihapus kabarnya ikut hilang dengan sendirinya.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

import type { Notifikasi, JenisNotifikasi } from './notifikasi.ts'

/** Baris mentah dari tabel `team_messages`. */
export interface PesanTim {
  id?: string
  penulis_id?: string | null
  penulis_nama?: string
  penulis_role?: string
  teks?: string
  foto?: string[] | null
  project_name?: string
  balas_id?: string | null
  created_at?: string
}

export interface BarisOrang {
  jenis: 'orang'
  id: string
  waktu: string
  penulisId: string
  nama: string
  role: string
  teks: string
  foto: string[]
  proyek?: string
  balasId?: string
}

export interface BarisSistem {
  jenis: 'sistem'
  id: string
  waktu: string
  judul: string
  rincian: string
  kategori: JenisNotifikasi
  tautan: string
  proyek?: string
  menunggu?: boolean
  /** Nama orang penyebab kejadian, bila barisnya menyebutkannya. */
  oleh?: string
}

export type BarisChat = BarisOrang | BarisSistem

const teks = (v: unknown) => String(v ?? '').trim()

/**
 * Nama untuk dibandingkan: huruf kecil, tanpa sapaan, tanpa spasi berlebih.
 *
 * "Pak Yono", "pak yono", dan "Yono" adalah orang yang sama; "Yono Susilo"
 * BUKAN — sengaja tidak dicocokkan sebagian, karena dua orang bernama depan
 * sama itu lumrah di lapangan dan salah orang lebih buruk daripada tidak tahu.
 */
export function namaKunci(nama: unknown): string {
  // Dirapikan LEBIH DULU, baru sapaannya dibuang: "  IBU   Ria " tidak akan
  // pernah cocok dengan pola berjangkar ^ selama spasi awalnya masih ada.
  return String(nama ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(pak|bpk|bapak|bu|ibu|mas|mbak|kang|abang|bang|sdr|sdri) /, '')
    .trim()
}

/**
 * Gabungkan pesan orang dan kabar sistem menjadi satu aliran, terlama di atas
 * seperti aplikasi chat pada umumnya.
 *
 * `proyek` menyaring aliran ke satu proyek. Baris yang TIDAK menyebut proyek
 * ikut lolos: obrolan umum dan kabar yang tak berproyek tetap relevan bagi
 * siapa pun, dan menyembunyikannya membuat ruangnya terasa kosong.
 */
export function susunChat(
  pesan: PesanTim[] = [],
  kabar: Notifikasi[] = [],
  opsi: { proyek?: string } = {},
): BarisChat[] {
  const hasil: BarisChat[] = []

  for (const p of pesan ?? []) {
    const waktu = teks(p?.created_at)
    const isi = teks(p?.teks)
    const foto = Array.isArray(p?.foto) ? p.foto.filter(f => teks(f)) : []
    // Pesan tanpa waktu tidak bisa diurutkan; pesan tanpa isi DAN tanpa foto
    // tidak membawa apa pun.
    if (!waktu || (!isi && foto.length === 0)) continue
    hasil.push({
      jenis: 'orang',
      id: `pesan:${teks(p.id) || waktu}`,
      waktu,
      penulisId: teks(p.penulis_id),
      nama: teks(p.penulis_nama) || 'Anggota tim',
      role: teks(p.penulis_role),
      teks: isi,
      foto,
      proyek: teks(p.project_name) || undefined,
      balasId: teks(p.balas_id) || undefined,
    })
  }

  for (const n of kabar ?? []) {
    const waktu = teks(n?.waktu)
    if (!waktu) continue
    hasil.push({
      jenis: 'sistem',
      id: `sistem:${teks(n.id) || waktu}`,
      waktu,
      judul: teks(n.judul),
      rincian: teks(n.rincian),
      kategori: n.jenis,
      tautan: teks(n.tautan) || '/kontraktor',
      proyek: teks(n.proyek) || undefined,
      menunggu: n.menunggu,
      oleh: teks(n.oleh) || undefined,
    })
  }

  const saring = teks(opsi.proyek)
  const terpakai = saring
    ? hasil.filter(b => !b.proyek || b.proyek === saring)
    : hasil

  // Terlama di atas. Id dipakai sebagai pemecah seri supaya urutannya tetap
  // sama di setiap pemuatan — daftar yang berubah sendiri sulit dipercaya.
  return terpakai.sort((a, b) => a.waktu.localeCompare(b.waktu) || a.id.localeCompare(b.id))
}

export interface KelompokHari {
  /** 'YYYY-MM-DD' */
  hari: string
  label: string
  baris: BarisChat[]
}

const HARI_MS = 86_400_000

/** "Hari ini" / "Kemarin" / "Senin, 20 Jul 2026". */
export function labelHari(hari: string, sekarang = new Date()): string {
  const t = Date.parse(`${hari}T00:00:00Z`)
  if (Number.isNaN(t)) return hari
  const kini = Date.parse(`${sekarang.toISOString().slice(0, 10)}T00:00:00Z`)
  const beda = Math.round((kini - t) / HARI_MS)
  if (beda === 0) return 'Hari ini'
  if (beda === 1) return 'Kemarin'
  return new Date(t).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

/** Pisahkan aliran menjadi kelompok per hari, untuk pembatas tanggal di layar. */
export function kelompokHari(baris: BarisChat[] = [], sekarang = new Date()): KelompokHari[] {
  const peta = new Map<string, BarisChat[]>()
  for (const b of baris ?? []) {
    const hari = teks(b?.waktu).slice(0, 10)
    if (!hari) continue
    const daftar = peta.get(hari)
    if (daftar) daftar.push(b)
    else peta.set(hari, [b])
  }
  return [...peta.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hari, isi]) => ({ hari, label: labelHari(hari, sekarang), baris: isi }))
}

/**
 * Baris yang lebih baru daripada tanda waktu terakhir dibaca.
 *
 * Pesan yang DITULIS SENDIRI tidak pernah dihitung belum terbaca — mengirim
 * pesan lalu melihat lencana "1 belum dibaca" hanya membingungkan.
 */
export function belumTerbaca(
  baris: BarisChat[] = [],
  terakhirDibaca?: string | null,
  sayaId?: string,
): BarisChat[] {
  const saya = teks(sayaId)
  const bukanSaya = (b: BarisChat) => !(b.jenis === 'orang' && saya && b.penulisId === saya)
  const batas = teks(terakhirDibaca)
  if (!batas) return (baris ?? []).filter(bukanSaya)
  return (baris ?? []).filter(b => b.waktu.localeCompare(batas) > 0 && bukanSaya(b))
}

/** Tanda waktu untuk disimpan sebagai "sudah dibaca sampai sini". */
export function batasTerbaca(baris: BarisChat[] = []): string {
  return baris.length > 0 ? baris[baris.length - 1].waktu : new Date().toISOString()
}

/** Ringkasan sebaris untuk judul, mis. "24 pesan · 11 kabar sistem". */
export function ringkasChat(baris: BarisChat[] = []): string {
  const orang = baris.filter(b => b.jenis === 'orang').length
  const sistem = baris.length - orang
  if (baris.length === 0) return 'belum ada percakapan'
  const bagian: string[] = []
  if (orang > 0) bagian.push(`${orang} pesan`)
  if (sistem > 0) bagian.push(`${sistem} kabar sistem`)
  return bagian.join(' · ')
}

/** Daftar proyek yang pernah disebut di aliran, untuk pilihan penyaring. */
export function proyekDiChat(baris: BarisChat[] = []): string[] {
  const set = new Set<string>()
  for (const b of baris ?? []) if (b.proyek) set.add(b.proyek)
  return [...set].sort((a, b) => a.localeCompare(b))
}
