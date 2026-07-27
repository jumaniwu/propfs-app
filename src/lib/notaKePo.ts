// ============================================================
// PropFS — Satu nota, semua modul
//
// Nota pembelian sebelumnya harus dimasukkan dua kali: sekali di Realisasi
// Biaya (sebagai biaya), sekali di Procurement (sebagai penerimaan barang).
// Dua kali kerja untuk satu kertas yang sama — dan karena keduanya tidak
// saling tahu, stok gampang terhitung ganda.
//
// Modul ini menjembataninya: dari barang yang dibaca AI di nota, dicarikan
// Purchase Order mana yang barangnya baru saja datang, lalu disusun usulan
// surat jalannya. Pencocokan hanya MENGUSULKAN — keputusan tetap di tangan
// pemakainya, karena satu nama barang bisa muncul di beberapa PO sekaligus.
//
// Tanpa DOM dan tanpa jaringan supaya bisa diuji di Node.
// ============================================================

/** Barang yang terbaca dari nota — bentuk sempit dari RealisasiEntry material. */
export interface BarangNota {
  /** id entri Realisasi Biaya asalnya, dipakai menandai entri setelah dicatat. */
  id?: string
  nama: string
  satuan?: string
  qty: number
  harga?: number
}

export interface ItemPo {
  nama?: string
  satuan?: string
  qty?: number
  harga?: number
  request_id?: string | null
}

export interface PoUntukCocok {
  id: string
  nomor?: string
  status?: string
  vendor_nama?: string
  project_name?: string
  items?: unknown
}

export interface DoUntukCocok {
  po_id: string
  items?: unknown
}

/** Satu barang PO beserta sisa yang belum pernah datang. */
export interface SisaBarangPo {
  nama: string
  satuan: string
  dipesan: number
  diterima: number
  sisa: number
  harga: number
}

export interface PasanganBarang {
  /** Barang dari nota. */
  nota: BarangNota
  /** Barang PO yang dianggap sama. */
  po: SisaBarangPo
  /** Qty yang diusulkan dicatat datang: sekecil-kecilnya antara nota dan sisa. */
  qty: number
}

export interface CocokPo {
  po: PoUntukCocok
  pasangan: PasanganBarang[]
  /** Barang di nota yang tidak ada di PO ini. */
  takCocok: BarangNota[]
  vendorCocok: boolean
  /** Makin besar makin yakin. Dipakai mengurutkan, bukan memutuskan. */
  skor: number
}

/** PO yang barangnya masih mungkin datang. Draft & yang ditolak tidak dihitung. */
export const STATUS_PO_BISA_DATANG = ['terkirim', 'selesai']

const rapi = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const angka = (n: unknown) => Math.max(0, Number(n) || 0)
const daftar = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? v as Array<Record<string, unknown>> : []

/**
 * Dua nama dianggap barang yang sama bila persis sama, atau bila yang satu
 * memuat yang lain seutuhnya ("Besi Beton 12mm" vs "Besi Beton 12mm SNI").
 * Sengaja tidak memakai kecocokan per kata: "Besi 12" dan "Paku 12" berbagi
 * satu kata, dan menyamakan keduanya jauh lebih berbahaya daripada melewatkan
 * satu pasangan yang bisa dipilih manual.
 */
export function namaSama(a: string, b: string): boolean {
  const x = rapi(a), y = rapi(b)
  if (!x || !y) return false
  if (x === y) return true
  const panjang = Math.min(x.length, y.length)
  // Ambang 4 huruf menjaga potongan pendek seperti "besi" tidak menyamakan
  // semua barang yang kebetulan mengandung kata itu.
  if (panjang < 4) return false
  return x.includes(y) || y.includes(x)
}

/**
 * Sisa tiap barang pada satu PO: yang dipesan dikurangi yang sudah pernah
 * datang lewat surat jalan sebelumnya. Inilah yang boleh diterima lagi.
 */
export function sisaBarangPo(po: PoUntukCocok, dos: DoUntukCocok[] = []): SisaBarangPo[] {
  const rows = new Map<string, SisaBarangPo>()
  for (const it of daftar(po?.items)) {
    const nama = String(it?.nama ?? '').trim()
    if (!nama) continue
    const k = rapi(nama)
    const ada = rows.get(k)
    if (ada) { ada.dipesan += angka(it.qty); continue }
    rows.set(k, {
      nama, satuan: String(it?.satuan ?? '').trim(),
      dipesan: angka(it.qty), diterima: 0, sisa: 0, harga: angka(it.harga),
    })
  }
  for (const d of dos ?? []) {
    if (d?.po_id !== po?.id) continue
    for (const it of daftar(d.items)) {
      const k = rapi(it?.nama)
      const row = rows.get(k)
      if (row) row.diterima += angka(it.qty)
    }
  }
  return [...rows.values()].map(r => ({ ...r, sisa: Math.max(0, r.dipesan - r.diterima) }))
}

/**
 * Cari PO yang paling mungkin menjadi asal barang di nota ini.
 *
 * Yang dikembalikan sudah terurut dari yang paling meyakinkan, dan hanya PO
 * yang benar-benar punya barang cocok yang masih tersisa — PO yang barangnya
 * sudah datang semua tidak ditawarkan lagi.
 */
export function cocokkanNotaKePo(
  barang: BarangNota[],
  pos: PoUntukCocok[],
  dos: DoUntukCocok[] = [],
  namaVendor = '',
): CocokPo[] {
  const isi = (barang ?? []).filter(b => (b?.nama ?? '').trim() && angka(b.qty) > 0)
  if (isi.length === 0) return []

  const hasil: CocokPo[] = []
  for (const po of pos ?? []) {
    if (!STATUS_PO_BISA_DATANG.includes(String(po?.status ?? ''))) continue

    const sisa = sisaBarangPo(po, dos).filter(s => s.sisa > 0)
    if (sisa.length === 0) continue

    const pasangan: PasanganBarang[] = []
    const takCocok: BarangNota[] = []
    const terpakai = new Set<string>()

    for (const b of isi) {
      const cocok = sisa.find(s => !terpakai.has(rapi(s.nama)) && namaSama(s.nama, b.nama))
      if (!cocok) { takCocok.push(b); continue }
      terpakai.add(rapi(cocok.nama))
      pasangan.push({ nota: b, po: cocok, qty: Math.min(angka(b.qty), cocok.sisa) })
    }
    if (pasangan.length === 0) continue

    const vendorCocok = !!namaVendor && namaSama(po.vendor_nama ?? '', namaVendor)
    hasil.push({
      po, pasangan, takCocok, vendorCocok,
      // Jumlah barang yang cocok adalah bukti terkuat; nama vendor hanya
      // penguat, karena nota sering menulis nama toko berbeda dari nama vendor
      // yang terdaftar.
      skor: pasangan.length * 10 + (vendorCocok ? 5 : 0),
    })
  }
  return hasil.sort((a, b) => b.skor - a.skor || String(a.po.nomor ?? '').localeCompare(String(b.po.nomor ?? '')))
}

export interface UsulanDo {
  po_id: string
  nomor_nota: string
  tanggal_nota: string | null
  tanggal_terima: string
  penerima: string
  catatan: string
  items: Array<{ nama: string; satuan: string; qty: number }>
}

/**
 * Susun surat jalan dari pasangan yang disetujui. Nama barang memakai nama di
 * PO, bukan nama di nota: stok, PO, dan tagihan harus menyebut barang yang
 * sama dengan sebutan yang sama, kalau tidak sisanya tidak akan pernah nol.
 */
export function usulanDo(cocok: CocokPo, info: {
  nomorNota?: string
  tanggalNota?: string | null
  tanggalTerima?: string
  penerima?: string
  catatan?: string
} = {}): UsulanDo {
  return {
    po_id: cocok.po.id,
    nomor_nota: (info.nomorNota ?? '').trim(),
    tanggal_nota: info.tanggalNota ?? null,
    tanggal_terima: info.tanggalTerima || new Date().toISOString().slice(0, 10),
    penerima: (info.penerima ?? '').trim(),
    catatan: (info.catatan ?? '').trim(),
    items: cocok.pasangan
      .filter(p => p.qty > 0)
      .map(p => ({ nama: p.po.nama, satuan: p.po.satuan || p.nota.satuan || '', qty: p.qty })),
  }
}

/** Ringkasan sebaris untuk ditawarkan ke pemakai sebelum ia menyetujui. */
export function ringkasCocok(c: CocokPo): string {
  const barang = c.pasangan.length
  const bagian = [`${barang} barang cocok dengan ${c.po.nomor ?? 'PO'}`]
  if (c.po.vendor_nama) bagian.push(c.po.vendor_nama)
  if (c.takCocok.length > 0) bagian.push(`${c.takCocok.length} barang di luar PO`)
  return bagian.join(' · ')
}
