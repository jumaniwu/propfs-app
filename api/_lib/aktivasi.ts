// ============================================================
// PropFS — Aktivasi pembayaran di server
//
// Satu-satunya tempat sebuah pembayaran berubah menjadi paket yang aktif.
// Dipakai webhook Midtrans dan /api/verifikasi-bayar; keduanya boleh datang
// bersamaan, berkali-kali, dalam urutan apa pun.
//
// ATURANNYA.
//
//   1. Jumlah yang dibayar berasal dari Midtrans — dari notifikasi yang
//      tanda tangannya sudah diperiksa, atau dari API status Midtrans yang
//      dipanggil dengan kunci server. Tidak pernah dari browser.
//   2. Jumlah itu harus menutup DUA angka: nilai invoice, dan harga resmi
//      paketnya dihitung ulang dari katalog. Nilai invoice saja tidak cukup,
//      karena invoice dibuat dan bisa diubah oleh browser.
//   3. Tepat sekali. Invoice "diklaim" lunas lewat satu UPDATE bersyarat
//      (status <> 'paid'); hanya yang berhasil mengklaim yang memberi paket.
//      Notifikasi yang datang dua kali tidak menambah slot dua kali.
//   4. Uang yang masuk tetap tercatat. Pembayaran yang kurang membuat invoice
//      lunas TANPA mengaktifkan paket, dan meninggalkan catatan untuk
//      ditinjau — bukan hilang diam-diam.
//
// CARA MENGIMPORNYA, DAN KENAPA IA TIDAK MENGIMPOR APA PUN.
//
// Endpoint mengimpornya sebagai './_lib/aktivasi.js' — DENGAN .js. package.json
// ber-"type": "module", builder @vercel/node mengompilasi tiap berkas menjadi
// ESM apa adanya, dan Node menolak impor relatif tanpa ekstensi: tanpa .js
// fungsinya ter-build tanpa galat lalu gagal dimuat pada permintaan pertama.
// (Folder berawalan garis bawah tidak dijadikan endpoint oleh Vercel.)
//
// Modul ini sendiri hanya mengimpor tipe, supaya tidak ada rantai berkas lokal
// yang harus ikut terbawa. Rumus harga di bawah karena itu SALINAN dari
// src/lib/planCatalog.ts dan src/lib/hargaResmi.ts; tes paritas
// membandingkan keduanya pada ratusan masukan, jadi salinan yang menyimpang
// akan ketahuan sebelum di-deploy.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Rumus harga (salinan yang dijaga tes paritas) ───────────────────────────

export const DISKON_DURASI: Readonly<Record<number, number>> = { 1: 0, 3: 10, 12: 20 }
export const HARI_PER_BULAN = 30
export const TOLERANSI_RP = 1000
export const PPN_BAWAAN = 0.11
export const KUNCI_HARGA_ADDON: Readonly<Record<string, string>> = {
  addon_fs: 'addon_fs_price',
  addon_cost: 'addon_cost_price',
  addon_user: 'addon_user_price',
}
/** Id paket bawaan katalog — semua berharga 0 sampai admin mengaturnya. */
export const ID_KATALOG_BAWAAN = ['free', 'kontraktor', 'fs', 'bundle']

function angkaKatalog(v: unknown, bawaan = 0): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : bawaan
  if (typeof v === 'boolean') return v ? 999 : 0
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase()
    if (t === 'true') return 999
    if (t === 'false' || t === '') return 0
    const n = parseInt(t, 10)
    return Number.isNaN(n) ? bawaan : n
  }
  return bawaan
}

/** Baris katalog mentah dengan id ini — yang PERTAMA, sama dengan bacaKatalog + find. */
function barisKatalog(katalogMentah: unknown, planId: string): Record<string, unknown> | null {
  const daftar = Array.isArray(katalogMentah) ? katalogMentah : []
  for (const raw of daftar) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as Record<string, unknown>
    if (typeof p.id === 'string' && p.id && p.id === planId) return p
  }
  return null
}

/** Produk bawaan paket katalog bawaan (KATALOG_DEFAULT). */
const PRODUK_BAWAAN: Readonly<Record<string, string | null>> = {
  free: null, kontraktor: 'kontraktor', fs: 'feasibility', bundle: 'bundle',
}

/**
 * Produk yang dicakup sebuah paket, dari KATALOG — bukan dari invoice.
 *
 * Langganan tanpa produk berlaku untuk SEMUA produk, jadi produk yang
 * diaktifkan harus berasal dari sumber yang tidak bisa diatur pembeli.
 * Logikanya sama dengan normalisasiPaket. undefined bila paketnya tidak ada.
 */
export function produkDariKatalog(katalogMentah: unknown, planId: string): string | null | undefined {
  const p = barisKatalog(katalogMentah, planId)
  if (!p) return planId in PRODUK_BAWAAN ? PRODUK_BAWAAN[planId] : undefined
  if (typeof p.product === 'string' && ['feasibility', 'kontraktor', 'bundle'].includes(p.product)) return p.product
  if (planId === 'free') return null
  const fitur = (p.features && typeof p.features === 'object' ? p.features : {}) as Record<string, unknown>
  const fs = angkaKatalog(p.fsProjects ?? fitur.fs_projects, 0)
  const cost = angkaKatalog(p.costProjects ?? fitur.cost_control, 0)
  if (fs > 0 && cost > 0) return 'bundle'
  if (cost > 0) return 'kontraktor'
  return 'feasibility'
}

/** Harga sebulan sebuah paket dari katalog mentah; null bila paketnya tidak ada. */
export function hargaBulananDariKatalog(katalogMentah: unknown, planId: string): number | null {
  const p = barisKatalog(katalogMentah, planId)
  // Paket bawaan yang belum diatur admin tetap dikenali, dengan harga 0.
  if (!p) return ID_KATALOG_BAWAAN.includes(planId) ? 0 : null
  const harga = angkaKatalog(p.priceIdr, 0)
  const promo = p.promoPriceIdr === null || p.promoPriceIdr === undefined || p.promoPriceIdr === ''
    ? null : angkaKatalog(p.promoPriceIdr, 0)
  return promo !== null && promo > 0 && promo < harga ? promo : harga
}

export function bulanDariPeriode(mulai?: string | null, akhir?: string | null): number {
  const a = new Date(String(mulai ?? '')).getTime()
  const b = new Date(String(akhir ?? '')).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1
  return Math.max(1, Math.round((b - a) / (HARI_PER_BULAN * 86_400_000)))
}

export function ppnPersen(rate: unknown): number {
  const n = Number(rate ?? PPN_BAWAAN)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : Math.round(PPN_BAWAAN * 100)
}

export interface SumberHargaMentah {
  /** Isi app_settings.plan_catalog apa adanya. */
  katalog: unknown
  ppnRate: unknown
  hargaAddon: Record<string, number>
}

export interface InvoiceAktivasi {
  id: string
  user_id: string
  plan_id: string
  period_start?: string | null
  period_end?: string | null
  total_idr: number
  status: string
  midtrans_order_id?: string | null
  product?: string | null
  notes?: string | null
}

/**
 * Harga resmi sebuah invoice; null bila paketnya tidak bisa dibeli — tidak
 * ada di katalog, atau harganya belum diatur (0). Paket berharga 0 tidak
 * pernah dijual lewat pembayaran: membayarnya Rp 1 bukan pembelian.
 */
export function hargaResmiServer(inv: Pick<InvoiceAktivasi, 'plan_id' | 'period_start' | 'period_end'>,
  sumber: SumberHargaMentah): number | null {
  const id = String(inv?.plan_id ?? '')
  if (!id) return null
  if (id in KUNCI_HARGA_ADDON) {
    const h = Math.floor(Number(sumber.hargaAddon?.[id]))
    return Number.isFinite(h) && h > 0 ? h : null
  }
  const bulanan = hargaBulananDariKatalog(sumber.katalog, id)
  if (bulanan === null) return null
  const bulan = bulanDariPeriode(inv.period_start, inv.period_end)
  const subtotal = Math.round(bulanan * Math.max(1, bulan) * (1 - (DISKON_DURASI[bulan] ?? 0) / 100))
  const total = subtotal + Math.round(subtotal * (ppnPersen(sumber.ppnRate) / 100))
  return total > 0 ? total : null
}

const SEHARI = 86_400_000

/**
 * Lama langganan yang diberikan untuk sebuah invoice.
 *
 * Harga dihitung dari jumlah bulan yang DIBULATKAN (hari ÷ 30), jadi periode
 * invoice tidak boleh dipakai mentah-mentah: periode 44 hari dibayar sebagai
 * 1 bulan. Lamanya dibatasi yang terpanjang dari dua cara aplikasi menulis
 * periode — bulan × 30 hari (halaman Harga) dan bulan kalender (tagihan dari
 * pendaftaran) — ditambah dua hari: bulan kalender dihitung browser dalam
 * waktu setempat, sedangkan di sini dalam UTC, dan keduanya bisa berbeda
 * satu tanggal ditambah satu jam pergantian musim.
 */
export function durasiLangganan(mulai?: string | null, akhir?: string | null): number {
  const a = new Date(String(mulai ?? '')).getTime()
  const b = new Date(String(akhir ?? '')).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return HARI_PER_BULAN * SEHARI
  const bulan = bulanDariPeriode(mulai, akhir)
  const kalender = new Date(a)
  const tgl = kalender.getUTCDate()
  kalender.setUTCMonth(kalender.getUTCMonth() + bulan)
  if (kalender.getUTCDate() !== tgl) kalender.setUTCDate(0)
  const batas = Math.max(bulan * HARI_PER_BULAN * SEHARI, kalender.getTime() - a) + 2 * SEHARI
  return Math.min(b - a, batas)
}

export function cukup(dibayar: number, harus: number): boolean {
  const d = Number(dibayar)
  const h = Number(harus)
  if (!Number.isFinite(d) || !Number.isFinite(h)) return false
  if (h <= 0) return d >= 0
  return d >= h - TOLERANSI_RP
}

// ── Aktivasi ────────────────────────────────────────────────────────────────

export interface LanggananAktif { id: string; expired_at?: string | null; plan_id?: string | null }

/**
 * Produk yang DITULIS ke subscriptions.product untuk sebuah paket.
 *
 * Kolom itu hanya menerima 'feasibility', 'kontraktor', atau NULL (lihat
 * migration_product_subscriptions). Bundle mencakup kedua produk — persis arti
 * NULL — jadi ditulis NULL; menulis 'bundle' ditolak database.
 */
export function produkLangganan(produkKatalog: string | null | undefined): string | null {
  return produkKatalog === 'feasibility' || produkKatalog === 'kontraktor' ? produkKatalog : null
}

export interface DbAktivasi {
  cariInvoice(orderId: string): Promise<InvoiceAktivasi | null>
  bacaSumberHarga(): Promise<SumberHargaMentah>
  /** UPDATE bersyarat status <> 'paid'. true HANYA bila panggilan ini yang mengubahnya. */
  klaimLunas(invoiceId: string, orderId: string, metode: string): Promise<boolean>
  tambahCatatan(invoiceId: string, baris: string): Promise<void>
  tambahSlot(userId: string, planId: string): Promise<void>
  cariLanggananAktif(userId: string, product: string | null): Promise<LanggananAktif | null>
  perbaruiLangganan(id: string, isi: Record<string, unknown>): Promise<void>
  buatLangganan(isi: Record<string, unknown>): Promise<void>
  catatKomisi(inv: InvoiceAktivasi): Promise<void>
}

export type StatusAktivasi = 'aktif' | 'sudah' | 'kurang' | 'tidak_ditemukan' | 'harga_tidak_dikenal' | 'gagal'

export interface HasilAktivasi {
  status: StatusAktivasi
  pesan: string
  invoiceId?: string
}

const rp = (n: number) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`

export async function aktifkan(
  db: DbAktivasi,
  masukan: { orderId: string; dibayar: number; metode?: string },
  sekarang: Date = new Date(),
): Promise<HasilAktivasi> {
  const inv = await db.cariInvoice(masukan.orderId)
  if (!inv) return { status: 'tidak_ditemukan', pesan: `Invoice untuk order ${masukan.orderId} tidak ditemukan.` }
  if (inv.status === 'paid') return { status: 'sudah', pesan: 'Invoice ini sudah diproses.', invoiceId: inv.id }

  const sumber = await db.bacaSumberHarga()
  const resmi = hargaResmiServer(inv, sumber)
  const harus = Math.max(Number(inv.total_idr) || 0, resmi ?? 0)

  // Klaim lebih dulu: uang yang sudah masuk HARUS tercatat, apa pun yang
  // terjadi sesudahnya. Yang gagal mengklaim berarti sudah diproses jalur lain.
  const diklaim = await db.klaimLunas(inv.id, masukan.orderId, masukan.metode || 'midtrans')
  if (!diklaim) return { status: 'sudah', pesan: 'Invoice ini sudah diproses.', invoiceId: inv.id }

  const tanggal = sekarang.toISOString().slice(0, 10)

  if (resmi === null) {
    await db.tambahCatatan(inv.id, `PERLU DITINJAU ${tanggal}: paket "${inv.plan_id}" tidak ada di katalog atau belum berharga;`
      + ` dibayar ${rp(masukan.dibayar)}. Paket TIDAK diaktifkan otomatis.`)
    return { status: 'harga_tidak_dikenal', pesan: 'Paket tidak dikenali; menunggu tinjauan admin.', invoiceId: inv.id }
  }

  if (!cukup(masukan.dibayar, harus)) {
    await db.tambahCatatan(inv.id, `PERLU DITINJAU ${tanggal}: dibayar ${rp(masukan.dibayar)},`
      + ` seharusnya ${rp(harus)} (invoice ${rp(inv.total_idr)}, harga resmi ${rp(resmi)}).`
      + ' Paket TIDAK diaktifkan otomatis.')
    return { status: 'kurang', pesan: 'Pembayaran kurang dari harga paket; menunggu tinjauan admin.', invoiceId: inv.id }
  }

  try {
    if (inv.plan_id in KUNCI_HARGA_ADDON) {
      await db.tambahSlot(inv.user_id, inv.plan_id)
    } else {
      const durasi = durasiLangganan(inv.period_start, inv.period_end)
      const product = produkLangganan(produkDariKatalog(sumber.katalog, inv.plan_id))
      // Perpanjangan dihitung dari akhir langganan yang masih berjalan —
      // membayar lebih awal tidak boleh menghanguskan hari yang sudah dibayar.
      const dasarDari = (l: LanggananAktif | null) => {
        const sisa = new Date(String(l?.expired_at ?? '')).getTime()
        return Number.isFinite(sisa) && sisa > sekarang.getTime() ? sisa : sekarang.getTime()
      }
      const ada = await db.cariLanggananAktif(inv.user_id, product)
      if (ada) {
        await db.perbaruiLangganan(ada.id, {
          plan_id: inv.plan_id,
          expired_at: new Date(dasarDari(ada) + durasi).toISOString(),
          midtrans_order_id: masukan.orderId,
        })
      } else {
        // Langganan lama (tanpa produk) untuk paket yang SAMA: hari yang
        // tersisa tetap dihitung, tetapi langganan barunya hanya untuk
        // produk yang dibeli — bukan ikut memperpanjang akses ke semua produk.
        const lama = product === null ? null : await db.cariLanggananAktif(inv.user_id, null)
        const dasar = lama && lama.plan_id === inv.plan_id ? dasarDari(lama) : sekarang.getTime()
        await db.buatLangganan({
          user_id: inv.user_id,
          plan_id: inv.plan_id,
          status: 'active',
          started_at: sekarang.toISOString(),
          expired_at: new Date(dasar + durasi).toISOString(),
          midtrans_order_id: masukan.orderId,
          product,
        })
      }
    }
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e)
    await db.tambahCatatan(inv.id, `AKTIVASI GAGAL ${tanggal}: ${pesan}. Pembayaran sudah diterima —`
      + ' paket perlu diaktifkan manual.')
    return { status: 'gagal', pesan: 'Pembayaran diterima, tetapi aktivasi gagal; admin akan menindaklanjuti.', invoiceId: inv.id }
  }

  // Komisi tidak boleh membatalkan aktivasi yang sudah berhasil.
  try { await db.catatKomisi(inv) } catch { /* dicatat di log oleh adaptornya */ }

  return { status: 'aktif', pesan: 'Pembayaran diterima dan paket sudah aktif.', invoiceId: inv.id }
}

// ── Adaptor Supabase ────────────────────────────────────────────────────────

/** id invoice dari order_id berbentuk <uuid>_<waktu>; null untuk bentuk lain. */
export function idInvoiceDariOrder(orderId: string): string | null {
  const m = String(orderId ?? '').match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_\d+$/i)
  return m ? m[1].toLowerCase() : null
}

/** Galat karena kolom opsional (product, midtrans_order_id) belum ada. */
function galatKolom(e: unknown): boolean {
  const m = String((e as { message?: unknown })?.message ?? '')
  const c = String((e as { code?: unknown })?.code ?? '')
  return c === '42703' || c === 'PGRST204' || /column/i.test(m)
}

export function dbDariSupabase(sb: SupabaseClient): DbAktivasi {
  return {
    async cariInvoice(orderId) {
      // Order dari /api/initiate-payment selalu berbentuk <uuid invoice>_<waktu>:
      // invoicenya ditentukan bentuk itu, bukan kolom yang bisa ditulis pemiliknya.
      const id = idInvoiceDariOrder(orderId)
      if (id) {
        const { data } = await sb.from('invoices').select('*').eq('id', id).maybeSingle()
        return (data as InvoiceAktivasi) ?? null
      }
      const { data } = await sb.from('invoices').select('*').eq('midtrans_order_id', orderId).maybeSingle()
      return (data as InvoiceAktivasi) ?? null
    },

    async bacaSumberHarga() {
      const kunci = ['plan_catalog', 'ppn_rate', ...Object.values(KUNCI_HARGA_ADDON)]
      const { data } = await sb.from('app_settings').select('key, value').in('key', kunci)
      const nilai = (k: string) => (data ?? []).find((r: { key: string }) => r.key === k)?.value
      const hargaAddon: Record<string, number> = {}
      for (const [id, k] of Object.entries(KUNCI_HARGA_ADDON)) {
        hargaAddon[id] = Math.floor(Number(String(nilai(k) ?? '').replace(/"/g, ''))) || 0
      }
      return { katalog: nilai('plan_catalog'), ppnRate: nilai('ppn_rate') ?? PPN_BAWAAN, hargaAddon }
    },

    async klaimLunas(invoiceId, orderId, metode) {
      const { data, error } = await sb.from('invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString(), payment_method: metode, midtrans_order_id: orderId })
        .eq('id', invoiceId).neq('status', 'paid').select('id')
      if (error) throw error
      return Array.isArray(data) && data.length > 0
    },

    async tambahCatatan(invoiceId, baris) {
      const { data } = await sb.from('invoices').select('notes').eq('id', invoiceId).maybeSingle()
      const lama = String((data as { notes?: string } | null)?.notes ?? '').trim()
      const { error } = await sb.from('invoices').update({ notes: lama ? `${lama}\n${baris}` : baris }).eq('id', invoiceId)
      if (error) console.error('[aktivasi] gagal menulis catatan invoice:', error.message, '|', baris)
    },

    async tambahSlot(userId, planId) {
      const { error } = planId === 'addon_user'
        ? await sb.rpc('increment_addon_user_slots', { uid: userId, jumlah: 1 })
        : await sb.rpc('increment_addon_slots', {
          uid: userId, slot_col: planId === 'addon_fs' ? 'addon_fs_slots' : 'addon_cost_slots',
        })
      if (error) throw error
    },

    async cariLanggananAktif(userId, product) {
      let q = sb.from('subscriptions').select('id, expired_at, plan_id')
        .eq('user_id', userId).eq('status', 'active')
      q = product === null ? q.is('product', null) : q.eq('product', product)
      let { data, error } = await q.order('expired_at', { ascending: false }).limit(1)
      if (error && galatKolom(error)) {
        // Kolom product belum ada: semua langganan memang lintas produk.
        ;({ data, error } = await sb.from('subscriptions').select('id, expired_at, plan_id')
          .eq('user_id', userId).eq('status', 'active')
          .order('expired_at', { ascending: false }).limit(1))
      }
      if (error) throw error
      return (data?.[0] as LanggananAktif) ?? null
    },

    async perbaruiLangganan(id, isi) {
      let { error } = await sb.from('subscriptions').update(isi).eq('id', id)
      if (error && galatKolom(error)) {
        const { midtrans_order_id: _o, ...tanpa } = isi
        ;({ error } = await sb.from('subscriptions').update(tanpa).eq('id', id))
      }
      if (error) throw error
    },

    async buatLangganan(isi) {
      let { error } = await sb.from('subscriptions').insert(isi)
      if (error && galatKolom(error)) {
        const { midtrans_order_id: _o, product: _p, ...tanpa } = isi
        ;({ error } = await sb.from('subscriptions').insert(tanpa))
      }
      if (error) throw error
    },

    async catatKomisi(inv) {
      const { data: setelan } = await sb.from('app_settings').select('key, value')
        .in('key', ['affiliate_enabled', 'affiliate_commission_pct'])
      const nilai = (k: string) => (setelan ?? []).find((r: { key: string }) => r.key === k)?.value
      const aktif = nilai('affiliate_enabled') === true || nilai('affiliate_enabled') === 'true'
      if (!aktif) return
      const { data: profil } = await sb.from('profiles').select('referred_by').eq('id', inv.user_id).maybeSingle()
      const perujuk = (profil as { referred_by?: string } | null)?.referred_by
      if (!perujuk) return
      const pct = parseInt(String(nilai('affiliate_commission_pct') ?? '10'), 10) || 10
      const { error } = await sb.from('referral_earnings').insert({
        referrer_id: perujuk, referred_user_id: inv.user_id, invoice_id: inv.id,
        commission_idr: Math.floor((Number(inv.total_idr) || 0) * (pct / 100)),
        commission_pct: pct, status: 'pending',
      })
      if (error) console.error('[aktivasi] komisi gagal dicatat:', error.message)
    },
  }
}

// ── Midtrans ────────────────────────────────────────────────────────────────

/**
 * Asal API Midtrans. Ungkapannya SAMA dengan yang dipakai initiate-payment
 * saat membuat transaksi — status harus ditanyakan ke lingkungan yang sama.
 */
export function asalMidtrans(serverKey: string, env: Record<string, string | undefined>): string {
  const prod = env.MIDTRANS_ENV === 'production' || env.VERCEL_ENV === 'production' || !serverKey.startsWith('SB-')
  return prod ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com'
}

export interface StatusMidtrans {
  transaction_status?: string
  fraud_status?: string
  gross_amount?: string | number
  payment_type?: string
  status_code?: string
}

/** Lunas menurut Midtrans. capture (kartu) hanya bila lolos pemeriksaan fraud. */
export function sudahLunas(s: StatusMidtrans | null | undefined): boolean {
  const t = s?.transaction_status
  if (t === 'settlement') return true
  if (t === 'capture') return !s?.fraud_status || s.fraud_status === 'accept'
  return false
}

export async function cekStatusMidtrans(
  orderId: string, serverKey: string, env: Record<string, string | undefined>,
  ambil: typeof fetch = fetch, batasMs = 15000,
): Promise<StatusMidtrans> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), batasMs)
  try {
    const res = await ambil(`${asalMidtrans(serverKey, env)}/v2/${encodeURIComponent(orderId)}/status`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`,
      },
      signal: ctrl.signal,
    })
    return await res.json() as StatusMidtrans
  } finally {
    clearTimeout(timer)
  }
}

// ── Identitas pemanggil ─────────────────────────────────────────────────────

/**
 * Alamat project Supabase. Cadangannya alamat PUBLIK yang sama dengan
 * src/lib/supabase.ts — alamat bukan rahasia, dan endpoint pembayaran tidak
 * boleh berhenti hanya karena variabel alamatnya lupa disetel. Kunci servis
 * TIDAK punya cadangan: tanpa kunci itu endpoint menolak bekerja.
 */
export const URL_SUPABASE_PUBLIK = 'https://ciazztqmkhzrgbaqfyyz.supabase.co'
export function urlSupabase(env: Record<string, string | undefined>): string {
  return env.SUPABASE_URL || env.VITE_SUPABASE_URL || URL_SUPABASE_PUBLIK
}

/** id pengguna dari JWT Supabase; null bila tidak sah. */
export async function penggunaDariToken(
  token: string, env: Record<string, string | undefined>, ambil: typeof fetch = fetch,
): Promise<string | null> {
  const url = urlSupabase(env)
  // Kunci apa pun dari project ini diterima sebagai apikey; yang menentukan
  // identitas adalah token login di header Authorization.
  const kunci = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!kunci || !token) return null
  try {
    const res = await ambil(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: kunci } })
    if (!res.ok) return null
    const u = await res.json() as { id?: unknown }
    return typeof u?.id === 'string' && u.id ? u.id : null
  } catch {
    return null
  }
}
