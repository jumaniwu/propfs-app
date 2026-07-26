// Test katalog langganan: 3 katalog (FS, Kontraktor AI, Bundle) + Free Trial,
// harga & jumlah proyek diatur admin di backend.
import {
  KATALOG_DEFAULT, normalisasiPaket, bacaKatalog, katalogTampil, urutkanKatalog,
  kuotaProyek, hargaEfektif, totalHarga,
} from '../src/lib/planCatalog.ts'
import { produkTercakup, langgananUntuk, planProduk } from '../src/lib/produk.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── Katalog bawaan ─────────────────────────────────────────────────────────
assert(KATALOG_DEFAULT.length === 4, 'Free Trial + 3 katalog berbayar')
assert(KATALOG_DEFAULT.map(p => p.id).join(',') === 'free,fs,kontraktor,bundle', 'id katalog')
assert(KATALOG_DEFAULT.find(p => p.id === 'fs').product === 'feasibility', 'katalog fs → produk feasibility')
assert(KATALOG_DEFAULT.find(p => p.id === 'kontraktor').product === 'kontraktor', 'katalog kontraktor → produk kontraktor')
assert(KATALOG_DEFAULT.find(p => p.id === 'bundle').product === 'bundle', 'katalog bundle → cakupan bundle')
assert(KATALOG_DEFAULT.find(p => p.id === 'free').product === null, 'Free Trial tanpa cakupan produk')
// Harga & kuota sengaja 0 — diisi admin di backend
assert(KATALOG_DEFAULT.filter(p => p.id !== 'free').every(p => p.priceIdr === 0),
  'harga katalog berbayar dibiarkan 0 untuk diisi admin')

// ── Cakupan bundle ─────────────────────────────────────────────────────────
assert(produkTercakup('bundle').join(',') === 'feasibility,kontraktor', 'bundle mencakup dua produk')
assert(produkTercakup('kontraktor').join(',') === 'kontraktor', 'katalog kontraktor satu produk')
assert(produkTercakup(null).length === 0, 'Free Trial tidak mencakup produk berbayar')

const subBundle = { product: 'bundle', plan_id: 'bundle', status: 'active' }
assert(langgananUntuk(subBundle, 'feasibility'), 'langganan bundle berlaku untuk Feasibility')
assert(langgananUntuk(subBundle, 'kontraktor'), 'langganan bundle berlaku untuk Kontraktor AI')
assert(planProduk([subBundle], 'kontraktor') === 'bundle', 'paket kontraktor diambil dari bundle')
assert(planProduk([subBundle], 'feasibility') === 'bundle', 'paket feasibility diambil dari bundle')

// ── Normalisasi katalog LAMA (Starter/Pro pakai features.fs_projects) ──────
const lamaStarter = {
  id: 'starter', name: 'Starter', priceIdr: 149000, promoPriceIdr: null, maxProjects: 5,
  features: { fs_projects: 5, cost_control: 1, upload_rab: true, multi_user: 1 },
}
const nStarter = normalisasiPaket(lamaStarter)
assert(nStarter.fsProjects === 5, 'jumlah proyek FS dibaca dari katalog lama')
assert(nStarter.costProjects === 1, 'jumlah proyek Kontraktor dibaca dari katalog lama')
assert(nStarter.product === 'bundle', 'katalog lama dengan dua kuota ditebak sebagai bundle')

const lamaFsSaja = { id: 'x', name: 'X', priceIdr: 50000, features: { fs_projects: 3, cost_control: 0 } }
assert(normalisasiPaket(lamaFsSaja).product === 'feasibility', 'katalog lama hanya kuota FS → feasibility')

const lamaCostSaja = { id: 'y', name: 'Y', priceIdr: 50000, features: { fs_projects: 0, cost_control: 4 } }
assert(normalisasiPaket(lamaCostSaja).product === 'kontraktor', 'katalog lama hanya kuota cost → kontraktor')

// Nilai tersimpan sebagai string / boolean tetap terbaca
const aneh = { id: 'z', name: 'Z', priceIdr: '250000', features: { fs_projects: '7', cost_control: true } }
const nAneh = normalisasiPaket(aneh)
assert(nAneh.priceIdr === 250000, 'harga berupa string tetap terbaca')
assert(nAneh.fsProjects === 7, 'kuota berupa string tetap terbaca')
assert(nAneh.costProjects === 999, 'kuota berupa boolean true = tak terbatas')

assert(normalisasiPaket(null) === null, 'baris kosong diabaikan')
assert(normalisasiPaket({ name: 'tanpa id' }) === null, 'baris tanpa id diabaikan')

// ── bacaKatalog: lengkapi id yang belum ada ────────────────────────────────
const dariDb = bacaKatalog([lamaStarter])
assert(dariDb.find(p => p.id === 'starter'), 'katalog lama tetap ada')
for (const id of ['free', 'fs', 'kontraktor', 'bundle']) {
  assert(dariDb.find(p => p.id === id), `katalog "${id}" dilengkapi otomatis`)
}
assert(bacaKatalog(null).length === 4, 'katalog kosong jatuh ke bawaan')
assert(bacaKatalog([]).length === 4, 'array kosong jatuh ke bawaan')

// ── Urutan & visibilitas ───────────────────────────────────────────────────
const acak = [
  { id: 'bundle', name: 'B', product: 'bundle', features: {}, isVisible: true },
  { id: 'free', name: 'F', product: null, features: {}, isVisible: true },
  { id: 'kontraktor', name: 'K', product: 'kontraktor', features: {}, isVisible: false },
  { id: 'fs', name: 'S', product: 'feasibility', features: {}, isVisible: true },
].map(normalisasiPaket)

assert(urutkanKatalog(acak).map(p => p.id).join(',') === 'free,fs,kontraktor,bundle', 'urutan tampil benar')
assert(katalogTampil(acak).map(p => p.id).join(',') === 'free,fs,bundle', 'katalog disembunyikan tidak tampil')

// ── Kuota & harga ──────────────────────────────────────────────────────────
const paket = normalisasiPaket({
  id: 'kontraktor', name: 'Kontraktor AI', product: 'kontraktor',
  priceIdr: 300000, promoPriceIdr: 200000, fsProjects: 0, costProjects: 3, features: {},
})
assert(kuotaProyek(paket, 'kontraktor') === 3, 'kuota proyek Kontraktor AI')
assert(kuotaProyek(paket, 'feasibility') === 0, 'paket kontraktor tidak memberi kuota FS')
assert(kuotaProyek(null, 'kontraktor') === 0, 'tanpa paket = kuota 0')

assert(hargaEfektif(paket) === 200000, 'promo dipakai bila lebih murah')
const tanpaPromo = { ...paket, promoPriceIdr: null }
assert(hargaEfektif(tanpaPromo) === 300000, 'tanpa promo pakai harga normal')
const promoMahal = { ...paket, promoPriceIdr: 400000 }
assert(hargaEfektif(promoMahal) === 300000, 'promo lebih mahal diabaikan')

assert(totalHarga(paket, 1, 0) === 200000, 'total 1 bulan tanpa diskon')
assert(totalHarga(paket, 12, 20) === 1_920_000, 'total 12 bulan diskon 20%')
assert(totalHarga(paket, 0, 0) === 200000, 'durasi 0 diperlakukan 1 bulan')

// Paket bundle memberi kuota untuk dua produk sekaligus
const paketBundle = normalisasiPaket({
  id: 'bundle', name: 'Bundle', product: 'bundle',
  priceIdr: 500000, fsProjects: 5, costProjects: 5, features: {},
})
assert(kuotaProyek(paketBundle, 'feasibility') === 5 && kuotaProyek(paketBundle, 'kontraktor') === 5,
  'bundle memberi kuota untuk kedua produk')

console.log(`✅ planCatalog: ${ok} assertion lolos`)
