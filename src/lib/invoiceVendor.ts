// ============================================================
// PropFS — Tagihan yang dikirim vendor sendiri
//
// Alurnya dulu berhenti setelah PO dikirim. Tagihan vendor beredar sebagai
// foto di WhatsApp, dan yang memutuskan kapan membayar harus mencarinya lagi
// di gulungan chat — lalu mengetik ulang isinya, lalu membandingkannya sendiri
// dengan PO-nya.
//
// Modul ini bagian yang bisa salah tanpa ketahuan, jadi ia dipisahkan dari
// layar dan diuji: membaca hasil AI, menjumlahkan, dan yang terpenting
// MEMBANDINGKAN tagihan dengan PO-nya.
//
// Perbandingan itu inti fiturnya. Tagihan yang jumlahnya persis sama dengan
// PO bisa dilanjutkan tanpa dibaca satu per satu; yang berbeda harus berhenti
// di meja orang. Tanpa pembandingan, keduanya terlihat sama di layar dan
// satu-satunya pengaman adalah ketelitian orang yang sedang buru-buru.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

import type { PoItem } from './procurement.ts'

export type StatusInvoice = 'masuk' | 'cocok' | 'selisih' | 'disetujui' | 'ditolak' | 'dibayar'

export const LABEL_STATUS_INVOICE: Record<StatusInvoice, string> = {
  masuk: 'Baru masuk',
  cocok: 'Cocok dengan PO',
  selisih: 'Ada selisih',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
  dibayar: 'Sudah dibayar',
}

export const TONE_STATUS_INVOICE: Record<StatusInvoice, string> = {
  masuk: 'bg-sky-100 text-sky-700',
  cocok: 'bg-emerald-100 text-emerald-700',
  selisih: 'bg-amber-100 text-amber-800',
  disetujui: 'bg-emerald-100 text-emerald-700',
  ditolak: 'bg-rose-100 text-rose-700',
  dibayar: 'bg-slate-200 text-slate-700',
}

export interface ItemInvoice {
  nama: string
  satuan: string
  qty: number
  harga: number
  subtotal: number
}

export interface InvoiceVendor {
  nomor_invoice: string
  tanggal: string
  jatuh_tempo: string
  items: ItemInvoice[]
  subtotal: number
  ppn: number
  total: number
  catatan: string
  dikirim_oleh: string
}

export const INVOICE_KOSONG: InvoiceVendor = {
  nomor_invoice: '', tanggal: '', jatuh_tempo: '', items: [],
  subtotal: 0, ppn: 0, total: 0, catatan: '', dikirim_oleh: '',
}

const teks = (v: unknown): string => String(v ?? '').trim()

/**
 * Angka dari apa pun yang ditulis AI atau diketik orang.
 *
 * "Rp 1.160.000", "1.160.000", "1160000", dan 1160000 semuanya harus menjadi
 * angka yang sama. Titik ribuan Indonesia yang dibaca sebagai desimal mengubah
 * satu juta seratus enam puluh ribu menjadi satu koma enam belas — dan itu
 * tetap terlihat seperti angka yang masuk akal di layar.
 */
export function angkaRupiah(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  let s = teks(v).replace(/rp/gi, '').replace(/\s/g, '')
  if (!s) return 0
  const koma = s.lastIndexOf(',')
  const titik = s.lastIndexOf('.')
  // Pemisah desimal adalah yang PALING KANAN, dan hanya bila di belakangnya
  // tersisa satu atau dua angka. "1.160.000" tidak punya desimal sama sekali.
  const pisah = Math.max(koma, titik)
  if (pisah >= 0 && s.length - pisah - 1 <= 2 && /^\d{1,2}$/.test(s.slice(pisah + 1))) {
    s = s.slice(0, pisah).replace(/[.,]/g, '') + '.' + s.slice(pisah + 1)
  } else {
    s = s.replace(/[.,]/g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/** Tanggal apa pun bentuknya menjadi YYYY-MM-DD; '' bila tidak terbaca. */
export function tanggalIso(v: unknown): string {
  const s = teks(v)
  if (!s) return ''
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // Nota Indonesia hampir selalu hari-bulan-tahun. Membacanya sebagai
  // bulan-hari akan diam-diam menggeser tanggal jatuh tempo.
  const dmy = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2,4})$/.exec(s)
  if (dmy) {
    const [, d, m, y] = dmy
    const tahun = y.length === 2 ? `20${y}` : y
    const hari = Number(d), bulan = Number(m)
    if (hari >= 1 && hari <= 31 && bulan >= 1 && bulan <= 12) {
      return `${tahun}-${String(bulan).padStart(2, '0')}-${String(hari).padStart(2, '0')}`
    }
  }
  return ''
}

export function bersihkanItem(v: unknown): ItemInvoice {
  const o = (v ?? {}) as Record<string, unknown>
  const qty = angkaRupiah(o.qty ?? o.volume ?? o.jumlah)
  const harga = angkaRupiah(o.harga ?? o.hargaSatuan ?? o.harga_satuan)
  const sub = angkaRupiah(o.subtotal ?? o.total)
  return {
    nama: teks(o.nama ?? o.namaMaterial ?? o.item ?? o.deskripsi),
    satuan: teks(o.satuan) || 'unit',
    qty,
    harga,
    // Subtotal yang tertulis dipercaya bila ada; kalau tidak, dihitung.
    // Nota sering memuat potongan atau pembulatan yang tidak terbaca dari
    // qty × harga, dan menghitung ulang akan menghapusnya diam-diam.
    subtotal: sub || qty * harga,
  }
}

/**
 * Ambil isi tagihan dari balasan AI.
 *
 * Model diminta menutup jawabannya dengan satu blok JSON. Yang datang sering
 * berupa teks penjelas + blok itu; kadang blok itu saja; kadang penjelasannya
 * memuat kurung kurawal lain. Jadi yang dicari adalah blok berpagar lebih
 * dulu, baru objek terluar sebagai jaring pengaman.
 */
export function uraikanInvoiceAi(balasan: unknown): InvoiceVendor | null {
  const t = teks(balasan)
  if (!t) return null

  const calon: string[] = []
  const pagar = /```(?:json)?\s*([\s\S]*?)```/gi
  for (let m = pagar.exec(t); m; m = pagar.exec(t)) calon.push(m[1])
  const buka = t.indexOf('{')
  const tutup = t.lastIndexOf('}')
  if (buka >= 0 && tutup > buka) calon.push(t.slice(buka, tutup + 1))

  for (const c of calon) {
    let j: Record<string, unknown>
    try { j = JSON.parse(c) as Record<string, unknown> } catch { continue }
    if (!j || typeof j !== 'object') continue

    const items = Array.isArray(j.items) ? j.items.map(bersihkanItem).filter(i => i.nama || i.subtotal) : []
    const subtotal = angkaRupiah(j.subtotal) || items.reduce((s, i) => s + i.subtotal, 0)
    const ppn = angkaRupiah(j.ppn ?? j.pajak)
    return {
      nomor_invoice: teks(j.nomor_invoice ?? j.nomor ?? j.no_invoice),
      tanggal: tanggalIso(j.tanggal),
      jatuh_tempo: tanggalIso(j.jatuh_tempo ?? j.jatuhTempo ?? j.due_date),
      items,
      subtotal,
      ppn,
      total: angkaRupiah(j.total) || subtotal + ppn,
      catatan: teks(j.catatan),
      dikirim_oleh: teks(j.dikirim_oleh ?? j.pengirim),
    }
  }
  return null
}

export interface TotalInvoice { subtotal: number; ppn: number; total: number }

export function hitungTotalInvoice(items: ItemInvoice[], ppn = 0): TotalInvoice {
  const subtotal = (items ?? []).reduce((s, i) => s + (Number(i?.subtotal) || 0), 0)
  const p = Number(ppn) || 0
  return { subtotal, ppn: p, total: subtotal + p }
}

// ── Membandingkan dengan PO-nya ─────────────────────────────────────────────

export type JenisSelisih = 'total' | 'harga' | 'qty' | 'item_asing'

export interface Selisih {
  jenis: JenisSelisih
  /** Nama barangnya; kosong untuk selisih total. */
  nama: string
  /** Menurut PO. */
  po: number
  /** Menurut tagihan. */
  invoice: number
  /** Kalimat siap tampil. */
  pesan: string
}

/** Nama barang disamakan sebelum dibandingkan: spasi & huruf besar bukan beda. */
const kunciNama = (n: unknown): string =>
  teks(n).toLowerCase().replace(/\s+/g, ' ')

const rp = (n: number): string => `Rp ${Math.round(n).toLocaleString('id-ID')}`

/**
 * Beda antara tagihan dan PO-nya.
 *
 * `toleransi` ada karena pembulatan PPN dan pembulatan ke rupiah terdekat
 * memang menghasilkan beda beberapa rupiah pada dokumen yang sebenarnya
 * identik. Menandai beda satu rupiah sebagai "selisih" membuat penandanya
 * berbunyi terus, dan penanda yang selalu berbunyi berhenti dibaca — lalu
 * selisih yang sungguhan ikut terlewat.
 */
export function bandingkanDenganPo(
  invoice: Pick<InvoiceVendor, 'items' | 'total'>,
  poItems: PoItem[] | null | undefined,
  poTotal: number,
  toleransi = 1000,
): Selisih[] {
  const hasil: Selisih[] = []
  const beda = Math.round((Number(invoice?.total) || 0) - (Number(poTotal) || 0))
  if (Math.abs(beda) > toleransi) {
    hasil.push({
      jenis: 'total', nama: '', po: poTotal, invoice: invoice?.total ?? 0,
      pesan: `Total tagihan ${rp(invoice?.total ?? 0)}, PO ${rp(poTotal)} — `
        + `${beda > 0 ? 'lebih' : 'kurang'} ${rp(Math.abs(beda))}.`,
    })
  }

  const daftarPo = new Map<string, PoItem>()
  for (const p of poItems ?? []) {
    const k = kunciNama(p?.nama)
    if (k) daftarPo.set(k, p)
  }

  for (const it of invoice?.items ?? []) {
    const k = kunciNama(it.nama)
    if (!k) continue
    const p = daftarPo.get(k)
    if (!p) {
      hasil.push({
        jenis: 'item_asing', nama: it.nama, po: 0, invoice: it.subtotal,
        pesan: `"${it.nama}" ditagih ${rp(it.subtotal)} tetapi tidak ada di PO.`,
      })
      continue
    }
    const hargaPo = Number(p.harga) || 0
    if (it.harga && Math.abs(it.harga - hargaPo) > 0.5) {
      hasil.push({
        jenis: 'harga', nama: it.nama, po: hargaPo, invoice: it.harga,
        pesan: `"${it.nama}" ditagih ${rp(it.harga)}/${it.satuan}, di PO ${rp(hargaPo)}.`,
      })
    }
    const qtyPo = Number(p.qty) || 0
    if (it.qty && Math.abs(it.qty - qtyPo) > 0.001) {
      hasil.push({
        jenis: 'qty', nama: it.nama, po: qtyPo, invoice: it.qty,
        pesan: `"${it.nama}" ditagih ${it.qty} ${it.satuan}, di PO ${qtyPo}.`,
      })
    }
  }
  return hasil
}

/** Status awal sebuah tagihan yang baru masuk. */
export function statusDariSelisih(selisih: Selisih[]): StatusInvoice {
  return selisih.length ? 'selisih' : 'cocok'
}

/**
 * Boleh dikirim atau belum, beserta alasannya.
 *
 * Vendor mengisi lewat ponsel, sering sambil berdiri di toko. Menolak
 * kiriman tanpa menyebut apa yang kurang berarti ia mencoba menebak — dan
 * biasanya menyerah lalu mengirim fotonya lewat WhatsApp seperti dulu.
 */
export function siapDikirim(inv: InvoiceVendor): { boleh: boolean; alasan: string } {
  if (!teks(inv.nomor_invoice)) return { boleh: false, alasan: 'Nomor invoice belum diisi.' }
  if (!teks(inv.tanggal)) return { boleh: false, alasan: 'Tanggal invoice belum diisi.' }
  if (!(inv.items ?? []).length) return { boleh: false, alasan: 'Belum ada satu pun baris barang.' }
  if (!(Number(inv.total) > 0)) return { boleh: false, alasan: 'Total tagihan masih nol.' }
  if (!teks(inv.dikirim_oleh)) return { boleh: false, alasan: 'Nama pengirim belum diisi.' }
  return { boleh: true, alasan: '' }
}

/**
 * Perintah untuk AI yang membaca invoice.
 *
 * Isi PO ikut disertakan supaya model memakai NAMA BARANG YANG SAMA. Tanpa
 * itu, "Semen Portland 50kg" pada PO menjadi "SEMEN PC 50 KG" pada tagihan,
 * dan pembandingan di atas melaporkan dua barang asing alih-alih satu
 * kecocokan — penanda selisih yang salah lebih buruk daripada tidak ada.
 */
export function perintahBacaInvoice(poItems: PoItem[] | null | undefined): string {
  const daftar = (poItems ?? [])
    .map(p => `- ${p.nama} | ${p.qty} ${p.satuan} | ${Math.round(Number(p.harga) || 0)}`)
    .join('\n') || '(tidak ada rincian PO)'
  return [
    'Kamu membaca satu dokumen INVOICE/TAGIHAN dari supplier material bangunan.',
    'Ekstrak isinya menjadi JSON. Jawab HANYA dengan satu blok JSON, tanpa kalimat lain.',
    '',
    'Barang yang dipesan pada PO terkait (pakai NAMA YANG SAMA bila barangnya sama):',
    daftar,
    '',
    'Bentuk JSON-nya persis begini:',
    '```json',
    '{',
    '  "nomor_invoice": "INV/2026/0123",',
    '  "tanggal": "2026-08-13",',
    '  "jatuh_tempo": "2026-09-12",',
    '  "items": [',
    '    { "nama": "Semen Portland 50kg", "satuan": "sak", "qty": 20, "harga": 58000, "subtotal": 1160000 }',
    '  ],',
    '  "subtotal": 1160000,',
    '  "ppn": 0,',
    '  "total": 1160000,',
    '  "catatan": ""',
    '}',
    '```',
    '',
    'Aturan: angka tanpa titik/koma pemisah ribuan. Tanggal YYYY-MM-DD.',
    'Bila sebuah nilai tidak terbaca, isi "" untuk teks dan 0 untuk angka —',
    'JANGAN menebak. Yang salah lebih merepotkan daripada yang kosong, sebab',
    'yang kosong terlihat dan yang salah tidak.',
  ].join('\n')
}
