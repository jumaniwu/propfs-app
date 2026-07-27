// ============================================================
// PropFS — Procurement (logika murni, tanpa DOM)
//
// Menyambung Material Request yang sudah disetujui ke Purchase Order:
// menghitung sisa yang belum dipesan, menjumlahkan nilai PO, membandingkan
// harga antar vendor, dan menjaga aturan bahwa PO hanya boleh dikirim setelah
// ditandatangani pembuat DAN disetujui.
// ============================================================

import type { MaterialRequest } from './materialApi'
import type { RealisasiEntry } from './ai-realisasi'

// ── Vendor & katalog ────────────────────────────────────────────────────────

export type TermPembayaran = 'cash' | 'term'
export type StatusVendor = 'baru' | 'aktif' | 'nonaktif'

export interface Vendor {
  id: string
  nama: string
  pic: string
  no_wa: string
  email: string
  alamat: string
  npwp: string
  kategori: string
  term: TermPembayaran
  term_hari: number
  catatan: string
  status: StatusVendor
  self_token?: string
  created_at?: string
}

export interface VendorItem {
  id: string
  vendor_id: string
  nama: string
  satuan: string
  harga: number
  merek: string
  min_order: number
  catatan: string
}

/** Profil vendor tanpa kolom yang dikelola server (id, status, token). */
export type ProfilVendor = Omit<Vendor, 'id' | 'status' | 'self_token' | 'created_at'>

export const PROFIL_VENDOR_KOSONG: ProfilVendor = {
  nama: '', pic: '', no_wa: '', email: '', alamat: '', npwp: '',
  kategori: '', term: 'cash', term_hari: 0, catatan: '',
}

/**
 * Nilai awal form profil vendor.
 *
 * Vendor yang dibuat sekali-klik dari nota pembelian hanya membawa nama;
 * kolom lain bisa null dari basis data (default '' baru berlaku untuk baris
 * baru, bukan untuk kolom yang ditambahkan belakangan). Tanpa penyeragaman
 * ini React akan berpindah dari input tak-terkendali ke terkendali dan
 * memuntahkan peringatan, dan `null` ikut terkirim balik saat menyimpan.
 */
export function profilAwal(v?: Partial<Vendor> | null): ProfilVendor {
  if (!v) return { ...PROFIL_VENDOR_KOSONG }
  const teks = (x: unknown) => (typeof x === 'string' ? x : '')
  return {
    nama: teks(v.nama),
    pic: teks(v.pic),
    no_wa: teks(v.no_wa),
    email: teks(v.email),
    alamat: teks(v.alamat),
    npwp: teks(v.npwp),
    kategori: teks(v.kategori),
    term: v.term === 'term' ? 'term' : 'cash',
    term_hari: Math.max(0, Math.trunc(Number(v.term_hari) || 0)),
    catatan: teks(v.catatan),
  }
}

export const LABEL_TERM: Record<TermPembayaran, string> = {
  cash: 'Cash / Tunai',
  term: 'Tempo',
}

export const LABEL_STATUS_VENDOR: Record<StatusVendor, string> = {
  baru: 'Baru — perlu verifikasi',
  aktif: 'Aktif',
  nonaktif: 'Nonaktif',
}

export const TONE_STATUS_VENDOR: Record<StatusVendor, string> = {
  baru: 'bg-amber-100 text-amber-700',
  aktif: 'bg-emerald-100 text-emerald-700',
  nonaktif: 'bg-slate-200 text-slate-600',
}

/** "Tempo 30 hari" / "Cash". Dipakai di kartu vendor dan pada PDF PO. */
export function teksTerm(term: TermPembayaran, hari: number): string {
  if (term !== 'term') return LABEL_TERM.cash
  const h = Math.max(0, Math.floor(hari || 0))
  return h > 0 ? `Tempo ${h} hari` : 'Tempo'
}

// ── Purchase Order ──────────────────────────────────────────────────────────

export type StatusPo =
  | 'draft'               // baru dibuat, belum ditandatangani
  | 'menunggu_approval'   // sudah ditandatangani pembuat
  | 'disetujui'           // sudah disetujui, siap dikirim
  | 'terkirim'            // sudah dikirim ke vendor
  | 'ditolak'
  | 'selesai'             // barang diterima

export interface PoItem {
  /** Material Request sumbernya; kosong bila barang ditambah manual. */
  request_id?: string | null
  nama: string
  satuan: string
  qty: number
  harga: number
  subtotal: number
}

export interface PurchaseOrder {
  id: string
  nomor: string
  vendor_id: string | null
  vendor_nama: string
  vendor_wa: string
  project_name: string
  tanggal: string
  butuh_tanggal: string | null
  term: TermPembayaran
  term_hari: number
  items: PoItem[]
  subtotal: number
  ppn_pct: number
  ppn: number
  total: number
  catatan: string
  status: StatusPo
  pembuat_nama: string
  pembuat_jabatan: string
  pembuat_signature: string | null
  pembuat_signed_at: string | null
  approver_nama: string
  approver_jabatan: string
  approver_signature: string | null
  approver_signed_at: string | null
  catatan_approval: string
  view_token: string
  terkirim_at?: string | null
  created_at?: string
}

export const LABEL_STATUS_PO: Record<StatusPo, string> = {
  draft: 'Draft',
  menunggu_approval: 'Menunggu Approval',
  disetujui: 'Disetujui',
  terkirim: 'Terkirim ke Vendor',
  ditolak: 'Ditolak',
  selesai: 'Selesai',
}

export const TONE_STATUS_PO: Record<StatusPo, string> = {
  draft: 'bg-slate-200 text-slate-600',
  menunggu_approval: 'bg-amber-100 text-amber-700',
  disetujui: 'bg-blue-100 text-blue-700',
  terkirim: 'bg-emerald-100 text-emerald-700',
  ditolak: 'bg-rose-100 text-rose-700',
  selesai: 'bg-navy/10 text-navy',
}

/** Nomor PO otomatis, mengikuti pola nomorSpkOtomatis(). */
export function nomorPo(count: number, sekarang = new Date()): string {
  const mm = String(sekarang.getMonth() + 1).padStart(2, '0')
  return `PO/${String(Math.max(0, count) + 1).padStart(3, '0')}/${mm}/${sekarang.getFullYear()}`
}

export interface TotalPo {
  subtotal: number
  ppn: number
  total: number
  /** Baris dengan subtotal yang sudah dihitung ulang. */
  items: PoItem[]
}

/**
 * Hitung ulang seluruh nilai PO dari qty × harga. Subtotal per baris tidak
 * dipercaya dari masukan supaya nilai PO tidak pernah berbeda dengan
 * rinciannya. Semua angka dibulatkan ke rupiah utuh.
 */
export function hitungTotalPo(items: PoItem[], ppnPct = 0): TotalPo {
  const baris = (items ?? []).map(i => {
    const qty = Number(i.qty) || 0
    const harga = Number(i.harga) || 0
    return { ...i, qty, harga, subtotal: Math.round(qty * harga) }
  })
  const subtotal = baris.reduce((s, i) => s + i.subtotal, 0)
  const pct = Math.max(0, Number(ppnPct) || 0)
  const ppn = Math.round(subtotal * (pct / 100))
  return { subtotal, ppn, total: subtotal + ppn, items: baris }
}

// ── Kepemilikan baris ───────────────────────────────────────────────────────

/**
 * Menempelkan pemilik data pada baris yang akan disisipkan.
 *
 * Tabel vendors / vendor_items / purchase_orders memakai RLS
 * `auth.uid() = user_id or is_team_member(user_id)`. Baris tanpa `user_id`
 * membuat pemeriksaan itu bernilai NULL — bukan true — sehingga PostgREST
 * menolak dengan HTTP 403, bukan pesan kolom kosong yang lebih jelas.
 *
 * Nilainya adalah pemilik WORKSPACE aktif (dataOwnerId), bukan uid penyisip.
 * Kalau anggota tim menyimpan atas namanya sendiri, barisnya tak akan terlihat
 * oleh pemilik perusahaan dan data vendor jadi terpecah per orang.
 */
export function milikWorkspace<T extends object>(
  baris: T, ownerId: string | null | undefined,
): T & { user_id: string } {
  if (!ownerId) {
    throw new Error('Sesi login tidak ditemukan — muat ulang halaman lalu coba lagi.')
  }
  return { ...baris, user_id: ownerId }
}

// ── Sambungan ke Material Request ───────────────────────────────────────────

/** Qty request yang masih belum dipesan. Tidak pernah negatif. */
export function sisaQty(r: Pick<MaterialRequest, 'qty'> & { qty_dipesan?: number }): number {
  const qty = Number(r.qty) || 0
  const dipesan = Math.max(0, Number(r.qty_dipesan) || 0)
  return Math.max(0, qty - dipesan)
}

/**
 * Request yang siap dipesan: sudah disetujui dan masih ada sisa qty.
 * Yang masih menunggu, ditolak, atau sudah penuh terpesan tidak ikut —
 * pemesanan hanya boleh lahir dari permintaan yang sudah lewat approval.
 */
export function belumTerpesan<T extends Pick<MaterialRequest, 'status' | 'qty'> & { qty_dipesan?: number }>(
  requests: T[],
): T[] {
  return (requests ?? []).filter(r => r.status === 'disetujui' && sisaQty(r) > 0)
}

/**
 * Apakah PO boleh dikirim ke vendor. Wajib ada tanda tangan pembuat DAN
 * persetujuan; keduanya diperiksa ulang di server oleh po_tandai_terkirim().
 * Mengembalikan alasan penolakan agar tombolnya bisa menjelaskan diri sendiri.
 */
export function bolehKirimPo(po: Pick<PurchaseOrder,
  'pembuat_signature' | 'approver_signature' | 'status' | 'items' | 'vendor_wa'>,
): { boleh: boolean; alasan: string } {
  if (!po.items || po.items.length === 0) return { boleh: false, alasan: 'PO belum punya barang.' }
  if (po.status === 'ditolak') return { boleh: false, alasan: 'PO sudah ditolak.' }
  if (po.status === 'terkirim' || po.status === 'selesai') {
    return { boleh: false, alasan: 'PO sudah dikirim ke vendor.' }
  }
  if (!po.pembuat_signature) return { boleh: false, alasan: 'Belum ditandatangani pembuat PO.' }
  if (!po.approver_signature) return { boleh: false, alasan: 'Belum disetujui Owner / Manajemen / Project Manager.' }
  if (!po.vendor_wa) return { boleh: false, alasan: 'Nomor WhatsApp vendor belum ada.' }
  return { boleh: true, alasan: '' }
}

/** Status PO yang sesuai setelah tanda tangan / persetujuan terisi. */
export function statusPoSetelah(po: Pick<PurchaseOrder,
  'pembuat_signature' | 'approver_signature' | 'status'>): StatusPo {
  if (po.status === 'terkirim' || po.status === 'selesai' || po.status === 'ditolak') return po.status
  if (po.pembuat_signature && po.approver_signature) return 'disetujui'
  if (po.pembuat_signature) return 'menunggu_approval'
  return 'draft'
}

// ── Katalog: perbandingan harga antar vendor ────────────────────────────────

/** Asal sebuah harga: didaftarkan vendor, atau dibaca dari nota pembelian. */
export type SumberHarga = 'vendor' | 'nota'

export interface PenawaranKatalog {
  /** Kosong bila tokonya berasal dari nota dan belum terdaftar sebagai vendor. */
  vendor_id: string
  vendor_nama: string
  harga: number
  merek: string
  term: string
  sumber: SumberHarga
  /** Tanggal pembelian terakhir — hanya untuk sumber 'nota'. */
  terakhir?: string
  /** Berapa kali barang ini dibeli dari toko tersebut — hanya untuk 'nota'. */
  jumlahBeli?: number
}

export interface BarisKatalog {
  nama: string
  satuan: string
  /** Penawaran dari tiap vendor/toko, termurah lebih dulu. */
  penawaran: PenawaranKatalog[]
  hargaTermurah: number
  /** Nama vendor/toko dengan harga termurah. */
  vendorTermurah: string
}

const kunci = (s: string) => (s ?? '').trim().toLowerCase()

/** Satu barang yang pernah dibeli dari satu toko, diringkas dari nota. */
export interface ItemNota {
  nama: string
  satuan: string
  supplier: string
  /** Harga satuan pada pembelian TERAKHIR. */
  harga: number
  terakhir: string
  jumlahBeli: number
}

export const TOKO_TIDAK_DICATAT = '(toko tidak dicatat)'

/**
 * Ringkas riwayat pembelian material dari nota yang sudah dicatat di Realisasi
 * Biaya, dikelompokkan per (toko × barang). Harga yang dipakai adalah harga
 * pembelian TERAKHIR — harga material bergerak, jadi yang paling baru yang
 * paling berguna sebagai acuan.
 *
 * Nota yang tidak mencantumkan harga satuan tetap dipakai dengan menghitung
 * jumlah ÷ volume, karena banyak nota hanya menulis totalnya.
 */
export function katalogDariNota(realisasi: RealisasiEntry[]): ItemNota[] {
  const map = new Map<string, ItemNota>()

  for (const r of realisasi ?? []) {
    if (r?.tipe !== 'material') continue
    const nama = (r.namaMaterial ?? '').trim()
    if (!nama) continue

    const volume = Number(r.volume) || 0
    const satuanHarga = Number(r.hargaSatuan) || 0
    const harga = satuanHarga > 0
      ? satuanHarga
      : volume > 0 ? Math.round((Number(r.jumlah) || 0) / volume) : 0
    if (harga <= 0) continue

    const supplier = (r.namaSupplier ?? '').trim() || TOKO_TIDAK_DICATAT
    const k = `${kunci(supplier)}|${kunci(nama)}`
    const tanggal = r.tanggal ?? ''
    const ada = map.get(k)

    if (!ada) {
      map.set(k, {
        nama, satuan: (r.satuan ?? '').trim() || '-', supplier,
        harga, terakhir: tanggal, jumlahBeli: 1,
      })
      continue
    }
    ada.jumlahBeli += 1
    // Hanya pembelian yang lebih baru yang boleh menggeser harga acuan.
    if (tanggal >= ada.terakhir) {
      ada.harga = harga
      ada.terakhir = tanggal
      if (!ada.satuan || ada.satuan === '-') ada.satuan = (r.satuan ?? '').trim() || '-'
    }
  }

  return [...map.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
}

/** Toko dari nota yang belum terdaftar sebagai vendor — bisa didaftarkan sekali klik. */
export function tokoBelumJadiVendor(
  dariNota: ItemNota[], vendors: Array<Pick<Vendor, 'nama'>>,
): string[] {
  const sudah = new Set(vendors.map(v => kunci(v.nama)))
  const keluar = new Map<string, string>()
  for (const n of dariNota) {
    if (n.supplier === TOKO_TIDAK_DICATAT) continue
    const k = kunci(n.supplier)
    if (!sudah.has(k) && !keluar.has(k)) keluar.set(k, n.supplier)
  }
  return [...keluar.values()].sort((a, b) => a.localeCompare(b, 'id'))
}

/**
 * Kelompokkan barang vendor menurut namanya agar harga bisa dibandingkan.
 * Nama dibandingkan tanpa memperhatikan huruf besar/kecil dan spasi berlebih,
 * karena vendor mengisi sendiri dan penulisannya tidak akan seragam.
 */
export function ringkasKatalog(
  items: Array<VendorItem & { vendor_nama?: string }>,
  vendors: Array<Pick<Vendor, 'id' | 'nama' | 'term' | 'term_hari'>> = [],
  dariNota: ItemNota[] = [],
): BarisKatalog[] {
  const petaVendor = new Map(vendors.map(v => [v.id, v]))
  // Toko pada nota dicocokkan ke vendor lewat namanya, supaya harga dari nota
  // dan harga yang didaftarkan vendor muncul di baris yang sama.
  const vendorPerNama = new Map(vendors.map(v => [kunci(v.nama), v]))
  const map = new Map<string, BarisKatalog>()

  const ambilBaris = (nama: string, satuan: string): BarisKatalog => {
    const k = kunci(nama)
    const ada = map.get(k)
    if (ada) {
      if (!ada.satuan || ada.satuan === '-') ada.satuan = satuan || '-'
      return ada
    }
    const baru: BarisKatalog = {
      nama, satuan: satuan || '-', penawaran: [], hargaTermurah: 0, vendorTermurah: '',
    }
    map.set(k, baru)
    return baru
  }

  for (const it of items ?? []) {
    const nama = (it.nama ?? '').trim()
    if (!nama) continue
    const v = petaVendor.get(it.vendor_id)
    ambilBaris(nama, it.satuan).penawaran.push({
      vendor_id: it.vendor_id,
      vendor_nama: it.vendor_nama || v?.nama || 'Vendor',
      harga: Number(it.harga) || 0,
      merek: it.merek || '',
      term: v ? teksTerm(v.term, v.term_hari) : '',
      sumber: 'vendor',
    })
  }

  for (const n of dariNota ?? []) {
    const nama = (n.nama ?? '').trim()
    if (!nama) continue
    const v = vendorPerNama.get(kunci(n.supplier))
    ambilBaris(nama, n.satuan).penawaran.push({
      vendor_id: v?.id ?? '',
      vendor_nama: n.supplier,
      harga: Number(n.harga) || 0,
      merek: '',
      term: v ? teksTerm(v.term, v.term_hari) : '',
      sumber: 'nota',
      terakhir: n.terakhir,
      jumlahBeli: n.jumlahBeli,
    })
  }

  return [...map.values()]
    .map(b => {
      // Harga 0 berarti vendor belum mengisi harga — jangan dianggap termurah.
      const penawaran = [...b.penawaran].sort((a, c) => {
        if ((a.harga > 0) !== (c.harga > 0)) return a.harga > 0 ? -1 : 1
        return a.harga - c.harga
      })
      const termurah = penawaran.find(p => p.harga > 0)
      return {
        ...b, penawaran,
        hargaTermurah: termurah?.harga ?? 0,
        vendorTermurah: termurah?.vendor_nama ?? '',
      }
    })
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
}

/**
 * Harga yang ditawarkan vendor tertentu untuk sebuah nama barang.
 * Dipakai mengisi harga otomatis saat membuat PO; 0 bila vendor tidak
 * menawarkan barang itu, supaya pembuat PO tahu harus mengisi manual.
 */
export function hargaVendorUntuk(
  items: VendorItem[], vendorId: string, nama: string,
): number {
  const k = kunci(nama)
  const harga = (items ?? [])
    .filter(i => i.vendor_id === vendorId && kunci(i.nama) === k)
    .map(i => Number(i.harga) || 0)
    .filter(h => h > 0)
  return harga.length > 0 ? Math.min(...harga) : 0
}
