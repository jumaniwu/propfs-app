// ============================================================
// PropFS — Buku Pengeluaran yang tahu keadaan sebenarnya
//
// DUA MASALAH YANG DIPERBAIKI MODUL INI.
//
// 1. STATUS "✅ Dicatat" TIDAK BERARTI SUDAH DIBAYAR.
//
//    Kolom `status` pada entri biaya adalah teks bebas yang ditulis AI saat
//    membaca nota. Ia menjawab "sudah tercatat belum", bukan "sudah dibayar
//    belum" — padahal keduanya terbaca sama di layar. Sementara itu Procurement
//    menyimpan jawaban yang sebenarnya: PO, surat jalan, dan pembayarannya.
//    Buku pengeluaran tinggal membacanya.
//
// 2. BARANG YANG SUDAH ADA DI PROCUREMENT HARUS DIKETIK ULANG DI SINI.
//
//    PO yang barangnya sudah datang belum tentu punya baris di buku
//    pengeluaran, sehingga orang mengetiknya lagi — dua pekerjaan untuk satu
//    kejadian, dan dua angka yang bisa berbeda.
//
// YANG SENGAJA TIDAK DIKERJAKAN: menyalin PO menjadi baris biaya secara
// diam-diam. Nota yang sama bisa sudah masuk lewat Chat AI, dan menambahkannya
// lagi dari PO membuat biayanya terhitung DUA KALI. Biaya ganda jauh lebih
// merusak daripada satu ketukan konfirmasi: yang ganda ikut ke laba rugi, ke
// neraca, dan ke perbandingan terhadap RAB — dan tidak ada yang menyadarinya
// sampai ada yang menghitung ulang dengan tangan.
//
// Karena itu pencocokannya hanya memakai TAUTAN YANG BISA DIBUKTIKAN — surat
// jalan yang memang menghubungkan nota dengan PO-nya. Kemiripan nama toko
// sengaja tidak dipakai: label "Lunas" yang menempel pada nota yang keliru
// lebih berbahaya daripada tidak ada label sama sekali.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

import type { RealisasiEntry } from './ai-realisasi.ts'
import type { PurchaseOrder, PoItem } from './procurement.ts'
import { jenisPo } from './procurement.ts'
import type { DeliveryOrder, PoPayment } from './penerimaan.ts'
import { totalDibayar, statusBayar, type StatusBayar } from './penerimaan.ts'
import { normalNota } from './duplikatBiaya.ts'

const teks = (v: unknown) => String(v ?? '').trim()
const kunci = (v: unknown) => teks(v).toLowerCase().replace(/\s+/g, ' ')

export interface StatusEntri {
  /** PO yang menaungi entri ini; null bila tidak ada tautan yang bisa dibuktikan. */
  po: PurchaseOrder | null
  /** Surat jalan yang menghubungkannya. */
  doId: string | null
  status: StatusBayar | null
  /** Sisa tagihan PO-nya, bukan sisa entri ini. */
  sisa: number
}

/**
 * Surat jalan yang memuat entri biaya ini.
 *
 * Dua tautan yang sah, keduanya EKSAK:
 *   • `doId` pada entrinya — ditulis saat nota dicatat sekaligus sebagai
 *     penerimaan barang, jadi ia memang surat jalan yang sama;
 *   • nomor nota yang sama persis pada surat jalan.
 *
 * Nama toko TIDAK dipakai. "Global Bangunan Seraya" bisa memasok lima PO
 * sekaligus, dan menempelkan status bayar PO yang salah pada sebuah nota
 * membuat orang mengira hutang sudah lunas padahal belum.
 */
export function doUntukEntri(
  entri: Pick<RealisasiEntry, 'doId' | 'nomorNota'>,
  dos: DeliveryOrder[] | null | undefined,
): DeliveryOrder | null {
  const daftar = dos ?? []
  const id = teks(entri?.doId)
  if (id) {
    const lewatId = daftar.find(d => teks(d?.id) === id)
    if (lewatId) return lewatId
  }
  // Nomor nota disamakan dengan MEMBUANG seluruh aksara selain huruf & angka.
  // "A 40637" yang diketik manusia dan "A40637" yang dibaca AI adalah nota
  // yang sama; menganggapnya berbeda sudah pernah melahirkan biaya ganda.
  const nota = normalNota(entri?.nomorNota)
  if (!nota) return null
  const cocok = daftar.filter(d => normalNota(d?.nomor_nota) === nota)
  // Nomor nota yang muncul pada DUA surat jalan berbeda bukan tautan yang bisa
  // dibuktikan — ia justru tanda ada yang keliru. Lebih baik tidak menebak.
  return cocok.length === 1 ? cocok[0] : null
}

/** Keadaan pembayaran sebuah entri biaya, menurut Procurement. */
export function statusEntri(
  entri: Pick<RealisasiEntry, 'doId' | 'nomorNota'>,
  dos: DeliveryOrder[] | null | undefined,
  pos: PurchaseOrder[] | null | undefined,
  bayar: PoPayment[] | null | undefined,
): StatusEntri {
  const kosong: StatusEntri = { po: null, doId: null, status: null, sisa: 0 }
  const d = doUntukEntri(entri, dos)
  if (!d) return kosong
  const po = (pos ?? []).find(p => teks(p?.id) === teks(d.po_id)) ?? null
  if (!po) return { ...kosong, doId: teks(d.id) || null }
  return {
    po,
    doId: teks(d.id) || null,
    status: statusBayar(po, bayar),
    sisa: Math.max(0, (Number(po.total) || 0) - totalDibayar(po.id, bayar)),
  }
}

/**
 * Catatan singkat untuk ditempel pada baris pengeluaran.
 *
 * Yang LUNAS sengaja tidak diberi catatan apa pun. Menandai setiap baris —
 * termasuk yang tidak menuntut apa-apa — membuat catatan berhenti dibaca, dan
 * yang hilang justru "belum lunas" yang seharusnya menonjol.
 */
export function catatanBayar(s: StatusEntri): string {
  if (!s.po || !s.status || s.status === 'lunas') return ''
  const rp = `Rp ${Math.round(s.sisa).toLocaleString('id-ID')}`
  return s.status === 'belum'
    ? `Belum lunas — sisa ${rp} ke ${s.po.vendor_nama || 'vendor'}`
    : `Belum lunas — kurang ${rp} ke ${s.po.vendor_nama || 'vendor'}`
}

// ── Barang di Procurement yang belum ada di buku pengeluaran ────────────────

export interface UsulDariPo {
  po: PurchaseOrder
  /** Surat jalan yang membuktikan barangnya sudah datang. */
  suratJalan: DeliveryOrder
  status: StatusBayar
  sisa: number
  /** Baris biaya yang akan dibuat bila usulnya diterima. */
  entri: Omit<RealisasiEntry, 'id'>[]
  total: number
}

/**
 * Penerimaan barang yang belum punya baris di buku pengeluaran.
 *
 * Kebalikan dari `statusEntri`: di sana kita bertanya "entri ini PO yang
 * mana"; di sini "surat jalan ini sudah ada baris biayanya belum".
 *
 * Hanya surat jalan yang dilihat, bukan PO. PO yang barangnya belum datang
 * belum menjadi biaya — mencatatnya sebagai pengeluaran berarti membukukan
 * uang yang belum tentu keluar.
 */
export function penerimaanBelumTercatat(
  dos: DeliveryOrder[] | null | undefined,
  pos: PurchaseOrder[] | null | undefined,
  entries: RealisasiEntry[] | null | undefined,
  bayar: PoPayment[] | null | undefined,
): UsulDariPo[] {
  const sudah = new Set<string>()
  const notaTerpakai = new Set<string>()
  for (const e of entries ?? []) {
    const id = teks(e?.doId)
    if (id) sudah.add(id)
    const n = normalNota(e?.nomorNota)
    if (n) notaTerpakai.add(n)
  }

  const hasil: UsulDariPo[] = []
  for (const d of dos ?? []) {
    const id = teks(d?.id)
    if (!id || sudah.has(id)) continue
    // Nota yang sama sudah diketik manual tanpa tautan surat jalan. Itu tetap
    // "sudah tercatat" — mengusulkannya lagi berarti mengajak membuat biaya
    // ganda, tepat kesalahan yang modul ini ada untuk mencegahnya.
    if (normalNota(d.nomor_nota) && notaTerpakai.has(normalNota(d.nomor_nota))) continue

    const po = (pos ?? []).find(p => teks(p?.id) === teks(d.po_id))
    if (!po) continue

    const entri = barisDariSuratJalan(d, po)
    if (!entri.length) continue
    hasil.push({
      po, suratJalan: d,
      status: statusBayar(po, bayar),
      sisa: Math.max(0, (Number(po.total) || 0) - totalDibayar(po.id, bayar)),
      entri,
      total: entri.reduce((s, e) => s + e.jumlah, 0),
    })
  }
  return hasil
}

/**
 * Baris biaya dari satu surat jalan.
 *
 * Harga diambil dari PO — surat jalan hanya mencatat QTY YANG DATANG, dan
 * qty itulah yang benar. Mengalikan qty PO dengan harga PO akan membukukan
 * barang yang belum datang sebagai biaya.
 */
export function barisDariSuratJalan(
  d: DeliveryOrder, po: PurchaseOrder,
): Omit<RealisasiEntry, 'id'>[] {
  const hargaPo = new Map<string, PoItem>()
  for (const it of po.items ?? []) {
    const k = kunci(it?.nama)
    if (k) hargaPo.set(k, it)
  }
  const tanggal = teks(d.tanggal_nota) || teks(d.tanggal_terima) || teks(po.tanggal)

  return (d.items ?? [])
    .filter(it => teks(it?.nama) && Number(it?.qty) > 0)
    .map(it => {
      const asal = hargaPo.get(kunci(it.nama))
      const harga = Number(asal?.harga) || 0
      const qty = Number(it.qty) || 0
      return {
        tipe: 'material' as const,
        tanggal,
        namaMaterial: teks(it.nama),
        volume: qty,
        satuan: teks(it.satuan) || teks(asal?.satuan) || 'unit',
        hargaSatuan: harga,
        namaSupplier: teks(po.vendor_nama),
        nomorNota: teks(d.nomor_nota),
        keterangan: `${teks(it.nama)} — dari ${teks(po.nomor)}`,
        kategori: 'bangunan',
        jumlah: Math.round(qty * harga),
        // Status pembayarannya TIDAK dibekukan ke dalam teks ini. Ia berubah
        // begitu vendornya dibayar, dan teks yang dibekukan akan tetap berbunyi
        // "belum lunas" selamanya. Yang menjawabnya adalah `statusEntri`.
        status: '✅ Dicatat',
        // Ditandai supaya stoknya tidak bertambah dua kali: yang menambah stok
        // adalah surat jalannya sendiri.
        doId: teks(d.id),
      }
    })
}

// ── Pembelian non-proyek yang belum jadi biaya perusahaan ──────────────────

/**
 * Baris biaya dari PO biaya kantor.
 *
 * Berbeda dari `barisDariSuratJalan` dalam tiga hal yang semuanya disengaja:
 *
 *   1. `tipe: 'operasional'`, bukan `'material'` — `hitungInventori` hanya
 *      menghitung yang bertipe material sebagai stok, dan kertas A4 kantor
 *      bukan persediaan proyek.
 *   2. `kategori: 'kantor'` — kategori baru mengalir sendiri ke Laba Rugi,
 *      yang mengelompokkan pengeluaran hanya dari string kategorinya.
 *   3. TANPA `doId` — penanda itu ada untuk mencegah stok dihitung dua kali,
 *      dan di sini tidak ada stok yang bisa terhitung dua kali.
 *
 * Dipakai untuk PO berjenis `kantor`. PO berjenis `alat` TIDAK lewat sini:
 * alat menjadi aset, bukan beban, dan yang menjadi beban hanyalah
 * penyusutannya.
 */
export function barisDariPoKantor(
  d: DeliveryOrder, po: PurchaseOrder,
): Omit<RealisasiEntry, 'id'>[] {
  const hargaPo = new Map<string, PoItem>()
  for (const it of po.items ?? []) {
    const k = kunci(it?.nama)
    if (k) hargaPo.set(k, it)
  }
  const tanggal = teks(d.tanggal_nota) || teks(d.tanggal_terima) || teks(po.tanggal)

  return (d.items ?? [])
    .filter(it => teks(it?.nama) && Number(it?.qty) > 0)
    .map(it => {
      const asal = hargaPo.get(kunci(it.nama))
      const harga = Number(asal?.harga) || 0
      const qty = Number(it.qty) || 0
      return {
        tipe: 'operasional' as const,
        tanggal,
        namaMaterial: teks(it.nama),
        volume: qty,
        satuan: teks(it.satuan) || teks(asal?.satuan) || 'unit',
        hargaSatuan: harga,
        namaSupplier: teks(po.vendor_nama),
        nomorNota: teks(d.nomor_nota),
        keterangan: `${teks(it.nama)} — dari ${teks(po.nomor)}`,
        kategori: 'kantor',
        jumlah: Math.round(qty * harga),
        status: '✅ Dicatat',
      }
    })
}

/**
 * Penerimaan barang PO biaya kantor yang belum ada di buku biaya non-proyek.
 *
 * Sejajar `penerimaanBelumTercatat`, tetapi membaca daftar biaya umum — bukan
 * realisasi proyek — dan hanya melihat PO berjenis `kantor`. Penandanya di
 * sini `keterangan`, bukan `doId`: baris biaya kantor sengaja tidak membawa
 * `doId` (lihat `barisDariPoKantor`), jadi yang membuktikan "sudah dicatat"
 * adalah nomor PO yang tertulis di keterangannya.
 */
export function poKantorBelumTercatat(
  dos: DeliveryOrder[] | null | undefined,
  pos: PurchaseOrder[] | null | undefined,
  biayaUmum: RealisasiEntry[] | null | undefined,
  bayar: PoPayment[] | null | undefined,
): UsulDariPo[] {
  const notaTerpakai = new Set<string>()
  const poTerpakai = new Set<string>()
  for (const e of biayaUmum ?? []) {
    const n = normalNota(e?.nomorNota)
    if (n) notaTerpakai.add(n)
    const m = /dari\s+(\S+)/.exec(teks(e?.keterangan))
    if (m) poTerpakai.add(normalNota(m[1]))
  }

  const hasil: UsulDariPo[] = []
  for (const d of dos ?? []) {
    const po = (pos ?? []).find(p => teks(p?.id) === teks(d?.po_id))
    if (!po || jenisPo(po) !== 'kantor') continue
    if (normalNota(d.nomor_nota) && notaTerpakai.has(normalNota(d.nomor_nota))) continue
    if (normalNota(po.nomor) && poTerpakai.has(normalNota(po.nomor))) continue

    const entri = barisDariPoKantor(d, po)
    if (!entri.length) continue
    hasil.push({
      po, suratJalan: d,
      status: statusBayar(po, bayar),
      sisa: Math.max(0, (Number(po.total) || 0) - totalDibayar(po.id, bayar)),
      entri,
      total: entri.reduce((s, e) => s + e.jumlah, 0),
    })
  }
  return hasil
}

/** Ringkasan satu kalimat untuk panel "belum tercatat". */
export function ringkasUsul(usul: UsulDariPo[]): string {
  if (!usul.length) return ''
  const total = usul.reduce((s, u) => s + u.total, 0)
  const barang = usul.reduce((s, u) => s + u.entri.length, 0)
  return `${usul.length} penerimaan barang (${barang} baris, `
    + `Rp ${Math.round(total).toLocaleString('id-ID')}) belum ada di buku pengeluaran.`
}
