// Test pemisahan langganan Feasibility Study vs Kontraktor AI.
import {
  PRODUK, produkDariFitur, produkDariJenisProyek, langgananUntuk,
  langgananProduk, planProduk, sudahKedaluwarsa, sisaHari,
} from '../src/lib/produk.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

assert(PRODUK.length === 2, 'dua produk terdaftar')
assert(PRODUK.map(p => p.key).join(',') === 'feasibility,kontraktor', 'urutan produk')

// ── Pemetaan fitur → produk ────────────────────────────────────────────────
assert(produkDariFitur('fs_module') === 'feasibility', 'fs_module milik Feasibility')
assert(produkDariFitur('ai_solver') === 'feasibility', 'ai_solver milik Feasibility')
assert(produkDariFitur('cost_control') === 'kontraktor', 'cost_control milik Kontraktor AI')
assert(produkDariFitur('cost_rab') === 'kontraktor', 'cost_rab milik Kontraktor AI')
assert(produkDariFitur('scurve') === 'kontraktor', 'scurve milik Kontraktor AI')
assert(produkDariFitur('pdf_export') === null, 'pdf_export berlaku umum')
assert(produkDariFitur('dashboard_admin') === null, 'dashboard_admin berlaku umum')

assert(produkDariJenisProyek('cost') === 'kontraktor', 'kuota proyek cost → Kontraktor AI')
assert(produkDariJenisProyek('fs') === 'feasibility', 'kuota proyek fs → Feasibility')

// ── Langganan per produk ───────────────────────────────────────────────────
const subKontraktor = { product: 'kontraktor', plan_id: 'pro', status: 'active', expired_at: null }
const subFeasibility = { product: 'feasibility', plan_id: 'basic', status: 'active', expired_at: null }
const subLama = { plan_id: 'pro', status: 'active', expired_at: null }            // tanpa penanda produk
const subMati = { product: 'kontraktor', plan_id: 'pro', status: 'expired', expired_at: null }

assert(langgananUntuk(subKontraktor, 'kontraktor'), 'langganan kontraktor berlaku untuk kontraktor')
assert(!langgananUntuk(subKontraktor, 'feasibility'), 'langganan kontraktor tidak berlaku untuk feasibility')
assert(!langgananUntuk(subMati, 'kontraktor'), 'langganan non-aktif tidak berlaku')

// Kompatibilitas: langganan lama tanpa product mencakup KEDUA produk
assert(langgananUntuk(subLama, 'kontraktor'), 'langganan lama mencakup Kontraktor AI')
assert(langgananUntuk(subLama, 'feasibility'), 'langganan lama mencakup Feasibility')

// Berlangganan dua produk terpisah, masing-masing paketnya sendiri
const duaProduk = [subFeasibility, subKontraktor]
assert(planProduk(duaProduk, 'feasibility') === 'basic', 'paket Feasibility = basic')
assert(planProduk(duaProduk, 'kontraktor') === 'pro', 'paket Kontraktor AI = pro')

// Hanya berlangganan Kontraktor AI → Feasibility jadi free
assert(planProduk([subKontraktor], 'kontraktor') === 'pro', 'kontraktor saja: paket kontraktor pro')
assert(planProduk([subKontraktor], 'feasibility') === 'free', 'kontraktor saja: feasibility free')

// Tidak berlangganan apa pun
assert(planProduk([], 'kontraktor') === 'free', 'tanpa langganan = free')
assert(planProduk([subMati], 'kontraktor') === 'free', 'langganan expired = free')

// Langganan lama memberi paket yang sama untuk dua produk
assert(planProduk([subLama], 'kontraktor') === 'pro', 'langganan lama: kontraktor pro')
assert(planProduk([subLama], 'feasibility') === 'pro', 'langganan lama: feasibility pro')

// Yang bertanda produk diprioritaskan di atas langganan lama
const campur = [subLama, subKontraktor]
assert(langgananProduk(campur, 'kontraktor').product === 'kontraktor',
  'langganan bertanda produk menang atas langganan lama')
assert(langgananProduk(campur, 'feasibility').product === undefined,
  'feasibility tetap memakai langganan lama')

// ── Masa aktif ─────────────────────────────────────────────────────────────
const kini = new Date('2026-07-25T00:00:00Z')
const habis = { product: 'kontraktor', plan_id: 'pro', status: 'active', expired_at: '2026-07-20T00:00:00Z' }
const masihAda = { product: 'kontraktor', plan_id: 'pro', status: 'active', expired_at: '2026-08-04T00:00:00Z' }

assert(sudahKedaluwarsa(habis, kini), 'tanggal lewat = kedaluwarsa')
assert(!sudahKedaluwarsa(masihAda, kini), 'tanggal depan = masih aktif')
assert(!sudahKedaluwarsa(subKontraktor, kini), 'tanpa expired_at = tidak kedaluwarsa')
assert(sisaHari(masihAda, kini) === 10, 'sisa 10 hari')
assert(sisaHari(habis, kini) === -5, 'sudah lewat 5 hari')
assert(sisaHari(subKontraktor, kini) === null, 'tanpa expired_at = null')

console.log(`✅ produk: ${ok} assertion lolos`)
