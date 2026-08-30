// ============================================================
// PropFS — Yang tertulis di baris belanja: NAMA BARANGNYA
//
// Buku pengeluaran menampilkan `keterangan` sebagai judul tiap baris. Untuk
// nota yang diketik rapi itu kebetulan berisi nama barang — "Besi Ulir 16 x
// 12 MTR untuk…" — tetapi untuk yang lain ia hanya kalimat: "Pembelian alat
// kerja Noble Cove". Empat baris berturut-turut berbunyi sama, dan tidak ada
// satu pun cara mengetahui barang apa yang dibeli selain membuka notanya.
//
// Padahal nama barangnya SUDAH tersimpan, di `namaMaterial`, sejak awal. Yang
// keliru hanya kolom mana yang ditampilkan.
//
// Sekaligus: bila baris itu bisa ditelusuri sampai ke sebuah PO, nama barang
// di PO ikut ditunjukkan. Gunanya bukan hiasan — yang dicari orang ketika
// membuka daftar ini biasanya "nota ini barangnya sesuai pesanan tidak", dan
// selisih harga satuan antara nota dan PO adalah hal pertama yang ingin
// dilihat sebelum membayar.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================
import type { RealisasiEntry } from './ai-realisasi'
import type { PurchaseOrder, PoItem } from './procurement'
import type { DeliveryOrder } from './penerimaan'
import { doUntukEntri } from './sinkronRealisasi.ts'

const teks = (v: unknown): string => String(v ?? '').trim()
const angka = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Kunci pembanding nama barang: huruf & angka saja, huruf kecil. */
export function kunciBarang(v: unknown): string {
  return teks(v).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Judul sebuah baris belanja.
 *
 * `namaMaterial` MENANG atas `keterangan`. Keterangan boleh berisi kalimat
 * apa pun — dari mana barangnya, untuk pekerjaan apa, siapa yang membeli —
 * dan kalimat itu tidak menjawab pertanyaan yang sedang ditanyakan orang yang
 * menggulir daftar ini: barang apa.
 */
export function judulBaris(e: Partial<RealisasiEntry> | null | undefined): string {
  return teks(e?.namaMaterial)
    || teks(e?.namaTukang)
    || teks(e?.keterangan)
    || '(tanpa nama)'
}

/**
 * Baris kedua: keterangannya, HANYA bila ia menambah sesuatu.
 *
 * Ketika judulnya sudah diambil dari `keterangan` — karena nama barangnya
 * kosong — menampilkannya lagi di bawah hanya mengulang kalimat yang sama dua
 * kali, dan barisnya jadi tampak seperti kesalahan render.
 */
export function anakJudul(e: Partial<RealisasiEntry> | null | undefined): string {
  const judul = judulBaris(e)
  const ket = teks(e?.keterangan)
  return ket && ket !== judul ? ket : ''
}

/** Baris belanja ini belum menyebut nama barangnya sama sekali. */
export function tanpaNamaBarang(e: Partial<RealisasiEntry> | null | undefined): boolean {
  return e?.tipe === 'material' && !teks(e?.namaMaterial)
}

/**
 * Selisih harga yang terlalu kecil untuk diributkan.
 *
 * Harga satuan di baris belanja sering hasil BAGI: Rp 10.300.000 ÷ 52 batang
 * = Rp 198.077, sementara PO menuliskan Rp 198.000. Selisih Rp 77 itu
 * pembulatan, bukan kelebihan tagihan — dan menandainya membuat hampir setiap
 * baris menyala. Peringatan yang selalu menyala berhenti dibaca, dan yang
 * hilang justru selisih yang benar-benar perlu ditanyakan.
 *
 * Dua syarat, keduanya harus terpenuhi: cukup besar dalam rupiah DAN cukup
 * besar dibanding harganya. Tanpa syarat persentase, barang seharga Rp 5.000
 * yang naik dua kali lipat lolos; tanpa syarat rupiah, besi Rp 200.000 ribut
 * karena selisih Rp 200.
 */
export const SELISIH_MIN_RP = 1_000
export const SELISIH_MIN_PCT = 0.005

export function selisihBerarti(selisih: unknown, hargaPo: unknown): boolean {
  const s = Math.abs(angka(selisih))
  const h = Math.abs(angka(hargaPo))
  if (s < SELISIH_MIN_RP) return false
  return h <= 0 || s / h >= SELISIH_MIN_PCT
}

export interface CocokPo {
  /** Nomor PO-nya, untuk ditampilkan. */
  nomor: string
  /** Baris PO yang paling cocok; null bila PO-nya ketemu tapi barangnya tidak. */
  item: PoItem | null
  /** Harga satuan di PO. 0 bila tidak diketahui. */
  hargaPo: number
  /** Harga satuan di nota. 0 bila tidak diketahui. */
  hargaNota: number
  /** Selisih harga satuan, nota dikurangi PO. Positif = nota lebih mahal. */
  selisih: number
}

/**
 * Cocokkan satu baris belanja dengan PO-nya, bila bisa ditelusuri.
 *
 * Penelusurannya memakai `doUntukEntri` yang sudah ada — lewat `doId`, atau
 * nomor nota yang sama persis. Nama toko sengaja TIDAK dipakai: satu vendor
 * bisa memasok lima PO sekaligus, dan menempelkan PO yang salah pada sebuah
 * nota jauh lebih buruk daripada tidak menempelkan apa-apa.
 *
 * Barangnya dicocokkan menurut nama. Bila PO-nya ketemu tetapi barangnya
 * tidak ada di sana, `item` bernilai null — dan itu bukan kegagalan yang perlu
 * disembunyikan: nota yang memuat barang di luar PO justru yang paling perlu
 * dilihat orang sebelum membayar.
 */
export function cocokPo(
  e: Partial<RealisasiEntry> | null | undefined,
  dos: DeliveryOrder[] | null | undefined,
  pos: PurchaseOrder[] | null | undefined,
): CocokPo | null {
  if (!e) return null
  const d = doUntukEntri(
    { doId: e.doId, nomorNota: e.nomorNota } as Pick<RealisasiEntry, 'doId' | 'nomorNota'>, dos)
  if (!d) return null
  const po = (pos ?? []).find(p => teks(p?.id) === teks(d.po_id))
  if (!po) return null

  const k = kunciBarang(e.namaMaterial)
  // Kecocokan PERSIS dulu, baru kecocokan sebagian. Dibalik urutannya,
  // "Besi Beton 10mm" akan menempel pada "Besi Beton 12mm" hanya karena
  // keduanya diawali huruf yang sama.
  const items = po.items ?? []
  const item = (k
    ? items.find(it => kunciBarang(it?.nama) === k)
      ?? items.find(it => {
        const a = kunciBarang(it?.nama)
        return a.length > 3 && k.length > 3 && (a.includes(k) || k.includes(a))
      })
    : undefined) ?? null

  const hargaPo = angka(item?.harga)
  const hargaNota = angka(e.hargaSatuan)
  return {
    nomor: teks(po.nomor),
    item,
    hargaPo,
    hargaNota,
    // Selisih hanya berarti bila KEDUANYA diketahui. Nol di salah satu sisi
    // akan melahirkan "selisih" sebesar harga penuh — angka yang menakutkan
    // dan tidak berarti apa-apa.
    selisih: hargaPo > 0 && hargaNota > 0 ? hargaNota - hargaPo : 0,
  }
}

/**
 * Kalimat pendek tentang kecocokan dengan PO.
 *
 * Yang perlu menonjol hanya dua keadaan: barangnya TIDAK ada di PO, dan
 * harganya BEDA. Baris yang cocok sempurna cukup menyebut nomor PO-nya —
 * menandai semuanya dengan kalimat panjang membuat yang penting tenggelam.
 */
export function kalimatCocok(c: CocokPo | null | undefined): string {
  if (!c) return ''
  if (!c.item) return `${c.nomor} · barang ini tidak ada di PO`
  if (selisihBerarti(c.selisih, c.hargaPo)) {
    const arah = c.selisih > 0 ? 'lebih mahal' : 'lebih murah'
    return `${c.nomor} · harga satuan ${arah} Rp ${Math.abs(c.selisih).toLocaleString('id-ID')} dari PO`
  }
  return c.nomor
}

/** Kecocokan ini perlu diperhatikan orang, bukan sekadar dicatat. */
export function perluDilihat(c: CocokPo | null | undefined): boolean {
  return !!c && (!c.item || selisihBerarti(c.selisih, c.hargaPo))
}
