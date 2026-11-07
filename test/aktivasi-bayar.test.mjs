// ============================================================
// Pembayaran diputus di server, tepat sekali, dengan harga dari katalog.
//
// api/_lib/aktivasi.ts adalah satu-satunya tempat pembayaran berubah menjadi
// paket yang aktif — dipakai webhook Midtrans dan /api/verifikasi-bayar.
// Tes ini memeriksa:
//
//   1. PARITAS HARGA. Rumus harga server adalah salinan halaman Harga
//      (bacaKatalog + totalHarga + PPN). Ratusan katalog dan invoice acak
//      harus menghasilkan angka yang sama persis di kedua sisi; salinan
//      yang menyimpang akan menolak pembayaran yang sah.
//   2. TEPAT SEKALI. Notifikasi yang datang bersamaan atau berulang hanya
//      memberi paket satu kali.
//   3. KEPUTUSAN AKTIVASI. Produk, lama langganan, perpanjangan, add-on,
//      pembayaran kurang, paket tak dikenal, dan kegagalan di tengah jalan.
//   4. BENTUK KODE. Halaman pembayaran tidak lagi memberi paket sendiri,
//      dan impor antar-berkas api/ memakai ekstensi .js (package.json
//      ber-"type": "module"; Node menolak impor relatif tanpa ekstensi).
// ============================================================
import { readFileSync } from 'node:fs'
import {
  hargaResmiServer, hargaBulananDariKatalog, produkDariKatalog, produkLangganan, durasiLangganan,
  bulanDariPeriode as bulanServer, cukup as cukupServer, aktifkan, idInvoiceDariOrder, sudahLunas,
  asalMidtrans, cekStatusMidtrans, penggunaDariToken, dbDariSupabase, DISKON_DURASI as DISKON_SERVER,
  KUNCI_HARGA_ADDON as ADDON_SERVER, TOLERANSI_RP,
} from '../api/_lib/aktivasi.ts'
import {
  hargaResmi, cukup, bulanDariPeriode, DISKON_DURASI, KUNCI_HARGA_ADDON,
} from '../src/lib/hargaResmi.ts'
import { bacaKatalog } from '../src/lib/planCatalog.ts'
import { akhirPeriode, DISKON_BULAN } from '../src/lib/tagihan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const baca = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const tanpaKomentar = t => t.split('\n').filter(b => !/^\s*(\/\/|\*|\/\*)/.test(b)).join('\n')
const HARI = 86_400_000

// Acak yang bisa diulang.
let benih = 20261107
const acak = () => ((benih = (benih * 1103515245 + 12345) % 2147483648) / 2147483648)
const salah = a => a[Math.floor(acak() * a.length)]

// ── 1. Paritas harga server ⇄ halaman Harga ─────────────────────────
{
  const ID = ['free', 'kontraktor', 'fs', 'bundle', 'starter', 'pro', 'x-baru']
  const HARGA = [0, 149000, 299000, 449000, '199000', '  250000 ', 'true', 'false', '', 'abc', true, false,
    null, undefined, NaN, Infinity, -5000, 99999.5]
  const PROMO = [null, undefined, '', 0, 99000, 149000, 500000, '120000', 'abc', -1, true]
  const PPN = [0.11, 0.12, '0.11', 0, null, undefined, -1, 'abc', 0.115, 0.1]
  const baris = () => {
    const r = salah([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    if (r === 0) return salah([null, 'teks', 5, { id: '' }, { id: 7 }, {}])
    const p = { id: salah(ID), priceIdr: salah(HARGA) }
    if (acak() < 0.6) p.promoPriceIdr = salah(PROMO)
    if (acak() < 0.5) p.product = salah(['feasibility', 'kontraktor', 'bundle', null, 'aneh', 3])
    if (acak() < 0.4) p.fsProjects = salah([0, 1, 3, '2', 'true', null])
    if (acak() < 0.4) p.costProjects = salah([0, 1, 5, '0', 'false', null])
    if (acak() < 0.3) p.features = { fs_projects: salah([0, 2]), cost_control: salah([0, 1, true]) }
    return p
  }
  const katalogAcak = () => {
    const r = acak()
    if (r < 0.05) return salah([null, undefined, {}, 'teks', 42])
    if (r < 0.1) return []
    return Array.from({ length: 1 + Math.floor(acak() * 6) }, baris)
  }
  const periodeAcak = () => {
    const mulai = new Date(Date.UTC(2026, Math.floor(acak() * 12), 1 + Math.floor(acak() * 28), Math.floor(acak() * 24)))
    const r = acak()
    if (r < 0.05) return [salah(['', 'bukan tanggal', null]), mulai.toISOString()]
    if (r < 0.1) return [mulai.toISOString(), new Date(mulai.getTime() - HARI).toISOString()]
    const bulan = salah([1, 1, 3, 12, 2, 6, 24])
    const akhir = acak() < 0.5 ? new Date(mulai.getTime() + bulan * 30 * HARI) : akhirPeriode(bulan, mulai)
    return [mulai.toISOString(), (acak() < 0.2 ? akhir.toISOString().slice(0, 10) : akhir.toISOString())]
  }

  let dibanding = 0, berharga = 0
  for (let n = 0; n < 1500; n++) {
    const katalog = katalogAcak()
    const ppnRate = salah(PPN)
    const hargaAddon = { addon_fs: salah([0, 50000, 75000.7, -1]), addon_cost: salah([0, 60000]), addon_user: salah([0, 25000]) }
    const [period_start, period_end] = periodeAcak()
    const plan_id = salah([...ID, 'addon_fs', 'addon_cost', 'addon_user', ''])
    const inv = { plan_id, period_start, period_end }

    const server = hargaResmiServer(inv, { katalog, ppnRate, hargaAddon })
    const klien = hargaResmi(inv, { katalog: bacaKatalog(katalog), ppnRate, hargaAddon })
    assert(server === (klien ? klien.total : null),
      `harga server = halaman Harga untuk ${JSON.stringify({ katalog, ppnRate, inv })}: ${server} ≠ ${klien?.total}`)
    dibanding++
    if (server) berharga++

    if (plan_id && !(plan_id in ADDON_SERVER)) {
      const paket = bacaKatalog(katalog).find(p => p.id === plan_id)
      assert(produkDariKatalog(katalog, plan_id) === (paket ? paket.product : undefined),
        `produk server = normalisasiPaket untuk ${plan_id} di ${JSON.stringify(katalog)}`)
    }
    assert(bulanServer(period_start, period_end) === bulanDariPeriode(period_start, period_end), 'bulanDariPeriode identik')
  }
  assert(dibanding === 1500 && berharga > 300, `paritas diuji pada 1500 masukan (${berharga} berharga)`)

  for (const [d, h] of [[100, 100], [99_001, 100_000], [99_000, 100_000], [0, 0], [5, 0], [-1, 0], [NaN, 10], [10, NaN], [Infinity, 10]]) {
    assert(cukupServer(d, h) === cukup(d, h), `cukup(${d}, ${h}) identik`)
  }
  assert(JSON.stringify(DISKON_SERVER) === JSON.stringify(DISKON_DURASI), 'diskon durasi server = klien')
  assert(JSON.stringify(ADDON_SERVER) === JSON.stringify(KUNCI_HARGA_ADDON), 'kunci harga add-on server = klien')

  // Diskon juga harus sama dengan yang DITAMPILKAN dan yang ditagihkan dari pendaftaran.
  const harga = baca('src/pages/PricingPage.tsx')
  for (const [bulan, diskon] of Object.entries(DISKON_DURASI)) {
    assert(new RegExp(`months:\\s*${bulan}\\b[^}]*discount:\\s*${diskon}\\b`).test(harga),
      `halaman Harga menawarkan ${bulan} bulan diskon ${diskon}%`)
    assert(Math.round((DISKON_BULAN[bulan] ?? 0) * 100) === diskon, `tagihan pendaftaran ${bulan} bulan diskon ${diskon}%`)
  }
}

// ── 2. Contoh harga yang dihitung tangan ────────────────────────────
{
  const katalog = [
    { id: 'kontraktor', priceIdr: 299000, product: 'kontraktor' },
    { id: 'fs', priceIdr: 199000, promoPriceIdr: 149000 },
  ]
  const s = { katalog, ppnRate: 0.11, hargaAddon: { addon_fs: 50000 } }
  const per = (b, hari = 30) => ({ period_start: '2026-01-10T00:00:00Z', period_end: new Date(Date.parse('2026-01-10T00:00:00Z') + b * hari * HARI).toISOString() })
  assert(hargaResmiServer({ plan_id: 'kontraktor', ...per(1) }, s) === 331890, 'kontraktor 1 bulan = 299.000 + PPN 11%')
  assert(hargaResmiServer({ plan_id: 'kontraktor', ...per(3) }, s) === 807300 + 88803, 'kontraktor 3 bulan diskon 10%')
  assert(hargaResmiServer({ plan_id: 'kontraktor', ...per(12) }, s) === 2870400 + 315744, 'kontraktor 12 bulan diskon 20%')
  assert(hargaResmiServer({ plan_id: 'fs', ...per(1) }, s) === 149000 + 16390, 'harga promo dipakai bila lebih murah')
  assert(hargaResmiServer({ plan_id: 'addon_fs', ...per(1) }, s) === 50000, 'add-on tanpa PPN')
  assert(hargaResmiServer({ plan_id: 'addon_cost', ...per(1) }, s) === null, 'add-on yang belum berharga tidak dijual')
  assert(hargaResmiServer({ plan_id: 'bundle', ...per(1) }, s) === null, 'paket bawaan yang belum diatur (harga 0) tidak dijual')
  assert(hargaResmiServer({ plan_id: 'tidak-ada', ...per(1) }, s) === null, 'paket di luar katalog tidak dikenali')
  assert(hargaBulananDariKatalog([{ id: 'fs', priceIdr: 1 }, { id: 'fs', priceIdr: 999 }], 'fs') === 1, 'baris pertama yang dipakai bila id kembar')
  assert(produkLangganan('bundle') === null && produkLangganan('kontraktor') === 'kontraktor'
    && produkLangganan('feasibility') === 'feasibility' && produkLangganan(null) === null && produkLangganan(undefined) === null,
  'produk langganan: bundle ditulis NULL — kolomnya hanya menerima feasibility/kontraktor/NULL')
}

// ── 3. Lama langganan dibatasi jumlah bulan yang dibayar ────────────
{
  const d = (mulai, hari) => durasiLangganan(mulai, new Date(Date.parse(mulai) + hari * HARI).toISOString()) / HARI
  assert(durasiLangganan(null, null) === 30 * HARI && durasiLangganan('x', 'y') === 30 * HARI, 'periode rusak: 30 hari')
  assert(durasiLangganan('2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z') === 30 * HARI, 'periode terbalik: 30 hari')
  assert(d('2026-03-10T00:00:00Z', 30) === 30, '30 hari tetap 30 hari')
  assert(d('2026-03-10T00:00:00Z', 44) <= 33, 'periode 44 hari (dibayar 1 bulan) tidak memberi 44 hari')
  assert(d('2026-03-10T00:00:00Z', 360) === 360, '12 × 30 hari tetap utuh')
  assert(d('2026-03-10T00:00:00Z', 374) <= 368, 'periode 374 hari (dibayar 12 bulan) dibatasi')
  assert(d('2026-03-10T00:00:00Z', 90) === 90, '3 × 30 hari tetap utuh')

  // Periode yang ditulis aplikasi sendiri tidak pernah terpotong — di zona
  // waktu mana pun browser pembelinya, termasuk akhir bulan & tahun kabisat.
  const tzAsli = process.env.TZ
  for (const tz of ['UTC', 'Asia/Jakarta', 'Asia/Jayapura', 'America/New_York', 'Pacific/Kiritimati']) {
    process.env.TZ = tz
    for (let i = 0; i < 400; i++) {
      const mulai = new Date(Date.UTC(2027, 0, 1) + i * HARI + (i % 24) * 3600_000)
      for (const bulan of [1, 3, 12]) {
        const akhir = akhirPeriode(bulan, mulai)
        assert(durasiLangganan(mulai.toISOString(), akhir.toISOString()) === akhir - mulai,
          `bulan kalender ${tz} ${mulai.toISOString()} +${bulan}: periode utuh`)
        const tiga0 = new Date(mulai.getTime() + bulan * 30 * HARI)
        assert(durasiLangganan(mulai.toISOString(), tiga0.toISOString()) === tiga0 - mulai, `${bulan} × 30 hari utuh`)
      }
    }
  }
  process.env.TZ = tzAsli
}

// ── 4. aktifkan() dengan database tiruan ────────────────────────────
const KATALOG = [
  { id: 'kontraktor', priceIdr: 299000, product: 'kontraktor' },
  { id: 'fs', priceIdr: 199000, product: 'feasibility' },
  { id: 'bundle', priceIdr: 449000, product: 'bundle' },
]
const SEKARANG = new Date('2026-11-07T03:00:00Z')
const tick = () => new Promise(r => setTimeout(r, Math.floor(acak() * 3)))

function dbTiruan({ invoices = [], subs = [], gagalBuat = false, gagalKomisi = false, katalog = KATALOG } = {}) {
  const st = { invoices: invoices.map(i => ({ ...i })), subs: subs.map(s => ({ ...s })), slot: [], komisi: [], catatan: [] }
  const db = {
    st,
    async cariInvoice(o) { await tick(); const id = idInvoiceDariOrder(o); const i = st.invoices.find(x => id ? x.id === id : x.midtrans_order_id === o); return i ? { ...i } : null },
    async bacaSumberHarga() { await tick(); return { katalog, ppnRate: 0.11, hargaAddon: { addon_fs: 50000, addon_cost: 60000, addon_user: 25000 } } },
    async klaimLunas(id, o, metode) {
      await tick()
      const i = st.invoices.find(x => x.id === id)                 // UPDATE ... WHERE status <> 'paid': atomik
      if (!i || i.status === 'paid') return false
      Object.assign(i, { status: 'paid', paid_at: SEKARANG.toISOString(), payment_method: metode, midtrans_order_id: o })
      return true
    },
    async tambahCatatan(id, baris) { await tick(); st.catatan.push({ id, baris }) },
    async tambahSlot(u, p) { await tick(); st.slot.push({ u, p }) },
    async cariLanggananAktif(u, produk) {
      await tick()
      return st.subs.filter(s => s.user_id === u && s.status === 'active' && (s.product ?? null) === produk)
        .sort((a, b) => String(b.expired_at).localeCompare(String(a.expired_at)))[0] ?? null
    },
    async perbaruiLangganan(id, isi) { await tick(); Object.assign(st.subs.find(s => s.id === id), isi) },
    async buatLangganan(isi) {
      await tick()
      if (gagalBuat) throw new Error('duplicate key value violates unique constraint')
      st.subs.push({ id: 'sub' + (st.subs.length + 1), ...isi })
    },
    async catatKomisi(inv) { await tick(); if (gagalKomisi) throw new Error('komisi gagal'); st.komisi.push(inv.id) },
  }
  return db
}
const U = 'u-budi'
const ID1 = 'a0000000-0000-4000-8000-000000000001'
const order = (id = ID1) => `${id}_1762484400000`
const invoice = (bulan = 1, plan = 'kontraktor', total = 331890, extra = {}) => ({
  id: ID1, user_id: U, plan_id: plan, status: 'pending', total_idr: total,
  period_start: '2026-11-07T03:00:00Z', period_end: new Date(Date.parse('2026-11-07T03:00:00Z') + bulan * 30 * HARI).toISOString(),
  ...extra,
})
const hariDari = iso => (Date.parse(iso) - SEKARANG.getTime()) / HARI

{
  let db = dbTiruan()
  let h = await aktifkan(db, { orderId: order(), dibayar: 1 }, SEKARANG)
  assert(h.status === 'tidak_ditemukan', 'order tak dikenal: tidak_ditemukan')

  db = dbTiruan({ invoices: [invoice(1, 'kontraktor', 331890, { status: 'paid' })] })
  h = await aktifkan(db, { orderId: order(), dibayar: 331890 }, SEKARANG)
  assert(h.status === 'sudah' && db.st.subs.length === 0, 'invoice yang sudah lunas tidak memberi paket lagi')

  // Normal.
  db = dbTiruan({ invoices: [invoice()] })
  h = await aktifkan(db, { orderId: order(), dibayar: 331890, metode: 'qris' }, SEKARANG)
  const s = db.st.subs[0]
  assert(h.status === 'aktif' && db.st.subs.length === 1, 'pembayaran penuh: aktif')
  assert(s.plan_id === 'kontraktor' && s.product === 'kontraktor' && s.status === 'active' && s.user_id === U, 'langganan kontraktor')
  assert(hariDari(s.expired_at) === 30 && s.started_at === SEKARANG.toISOString() && s.midtrans_order_id === order(), '30 hari sejak sekarang')
  assert(db.st.invoices[0].status === 'paid' && db.st.invoices[0].payment_method === 'qris', 'invoice lunas dengan metode Midtrans')
  assert(db.st.komisi.length === 1, 'komisi dicatat sekali')

  // Bersamaan: sepuluh notifikasi untuk order yang sama.
  for (let ulang = 0; ulang < 20; ulang++) {
    db = dbTiruan({ invoices: [invoice()] })
    const semua = await Promise.all(Array.from({ length: 10 }, () => aktifkan(db, { orderId: order(), dibayar: 331890 }, SEKARANG)))
    assert(semua.filter(x => x.status === 'aktif').length === 1 && semua.filter(x => x.status === 'sudah').length === 9,
      'sepuluh notifikasi bersamaan: tepat satu yang mengaktifkan')
    assert(db.st.subs.length === 1 && db.st.komisi.length === 1, 'satu langganan, satu komisi')
  }
  db = dbTiruan({ invoices: [invoice(1, 'addon_fs', 50000)] })
  await Promise.all(Array.from({ length: 6 }, () => aktifkan(db, { orderId: order(), dibayar: 50000 }, SEKARANG)))
  assert(db.st.slot.length === 1 && db.st.slot[0].p === 'addon_fs' && db.st.subs.length === 0, 'add-on: slot ditambah tepat sekali, tanpa langganan')

  // Toleransi pembulatan, dan tidak lebih.
  db = dbTiruan({ invoices: [invoice()] })
  h = await aktifkan(db, { orderId: order(), dibayar: 331890 - TOLERANSI_RP }, SEKARANG)
  assert(h.status === 'aktif', 'selisih pembulatan diterima')
  db = dbTiruan({ invoices: [invoice()] })
  h = await aktifkan(db, { orderId: order(), dibayar: 331890 - TOLERANSI_RP - 1 }, SEKARANG)
  assert(h.status === 'kurang' && db.st.subs.length === 0, 'selisih lebih dari toleransi: tidak diaktifkan')
  assert(db.st.invoices[0].status === 'paid' && /PERLU DITINJAU/.test(db.st.catatan[0]?.baris), 'uang tetap tercatat lunas, dengan catatan tinjauan')
  assert(db.st.komisi.length === 0, 'pembayaran kurang tidak memberi komisi')

  // Nilai invoice yang rendah tidak menurunkan harga yang harus dibayar.
  db = dbTiruan({ invoices: [invoice(12, 'kontraktor', 1000)] })
  h = await aktifkan(db, { orderId: order(), dibayar: 1000 }, SEKARANG)
  assert(h.status === 'kurang' && db.st.subs.length === 0, 'invoice bernilai rendah: harga resmi tetap ditagih')
  // Nilai invoice yang LEBIH TINGGI dari harga resmi (harga normal saat promo) tetap harus dibayar penuh.
  db = dbTiruan({ invoices: [invoice(1, 'kontraktor', 400000)] })
  h = await aktifkan(db, { orderId: order(), dibayar: 331890 }, SEKARANG)
  assert(h.status === 'kurang', 'yang dibayar harus menutup nilai invoice juga')

  // Paket tak dikenal / belum berharga.
  db = dbTiruan({ invoices: [invoice(1, 'enterprise', 999000)] })
  h = await aktifkan(db, { orderId: order(), dibayar: 999000 }, SEKARANG)
  assert(h.status === 'harga_tidak_dikenal' && db.st.subs.length === 0 && db.st.invoices[0].status === 'paid', 'paket di luar katalog: lunas, tidak diaktifkan')
  db = dbTiruan({ invoices: [invoice(1, 'fs', 1)], katalog: [{ id: 'kontraktor', priceIdr: 299000 }] })
  h = await aktifkan(db, { orderId: order(), dibayar: 1 }, SEKARANG)
  assert(h.status === 'harga_tidak_dikenal' && db.st.subs.length === 0, 'paket berharga 0 tidak bisa dibeli seharga Rp 1')

  // Produk dari katalog, bukan dari invoice.
  for (const [plan, total, produkInvoice, harap] of [
    ['fs', 220890, null, 'feasibility'], ['fs', 220890, 'kontraktor', 'feasibility'],
    ['kontraktor', 331890, 'feasibility', 'kontraktor'], ['bundle', 498390, 'kontraktor', null],
  ]) {
    db = dbTiruan({ invoices: [invoice(1, plan, total, { product: produkInvoice })] })
    h = await aktifkan(db, { orderId: order(), dibayar: total }, SEKARANG)
    assert(h.status === 'aktif' && db.st.subs[0].product === harap, `${plan}: produk langganan ${harap} dari katalog`)
  }

  // Lama langganan.
  db = dbTiruan({ invoices: [invoice(12, 'kontraktor', 3186144)] })
  h = await aktifkan(db, { orderId: order(), dibayar: 3186144 }, SEKARANG)
  assert(h.status === 'aktif' && hariDari(db.st.subs[0].expired_at) === 360, 'paket 12 bulan aktif 360 hari, bukan 30')
  db = dbTiruan({ invoices: [invoice(1, 'kontraktor', 331890, { period_end: new Date(SEKARANG.getTime() + 44 * HARI).toISOString() })] })
  h = await aktifkan(db, { orderId: order(), dibayar: 331890 }, SEKARANG)
  assert(h.status === 'aktif' && hariDari(db.st.subs[0].expired_at) <= 33, 'periode 44 hari seharga 1 bulan: tidak memberi 44 hari')

  // Perpanjangan.
  db = dbTiruan({ invoices: [invoice()], subs: [{ id: 's1', user_id: U, plan_id: 'kontraktor', status: 'active', product: 'kontraktor',
    expired_at: new Date(SEKARANG.getTime() + 10 * HARI).toISOString() }] })
  h = await aktifkan(db, { orderId: order(), dibayar: 331890 }, SEKARANG)
  assert(h.status === 'aktif' && db.st.subs.length === 1 && hariDari(db.st.subs[0].expired_at) === 40, 'perpanjangan dini menyambung dari sisa 10 hari')
  db = dbTiruan({ invoices: [invoice()], subs: [{ id: 's1', user_id: U, plan_id: 'kontraktor', status: 'active', product: 'kontraktor',
    expired_at: new Date(SEKARANG.getTime() - 5 * HARI).toISOString() }] })
  await aktifkan(db, { orderId: order(), dibayar: 331890 }, SEKARANG)
  assert(db.st.subs.length === 1 && hariDari(db.st.subs[0].expired_at) === 30, 'langganan yang sudah lewat diperpanjang dari sekarang')
  db = dbTiruan({ invoices: [invoice()], subs: [{ id: 's1', user_id: U, plan_id: 'fs', status: 'active', product: 'feasibility',
    expired_at: new Date(SEKARANG.getTime() + 10 * HARI).toISOString() }] })
  await aktifkan(db, { orderId: order(), dibayar: 331890 }, SEKARANG)
  assert(db.st.subs.length === 2 && db.st.subs[0].plan_id === 'fs' && hariDari(db.st.subs[0].expired_at) === 10, 'langganan produk lain tidak disentuh')

  // Langganan lama tanpa produk.
  db = dbTiruan({ invoices: [invoice()], subs: [{ id: 's1', user_id: U, plan_id: 'kontraktor', status: 'active', product: null,
    expired_at: new Date(SEKARANG.getTime() + 10 * HARI).toISOString() }] })
  await aktifkan(db, { orderId: order(), dibayar: 331890 }, SEKARANG)
  assert(db.st.subs.length === 2 && db.st.subs[1].product === 'kontraktor' && hariDari(db.st.subs[1].expired_at) === 40
    && hariDari(db.st.subs[0].expired_at) === 10, 'langganan lama paket sama: sisa harinya ikut dihitung, langganan lama tidak diperpanjang')
  db = dbTiruan({ invoices: [invoice()], subs: [{ id: 's1', user_id: U, plan_id: 'fs', status: 'active', product: null,
    expired_at: new Date(SEKARANG.getTime() + 10 * HARI).toISOString() }] })
  await aktifkan(db, { orderId: order(), dibayar: 331890 }, SEKARANG)
  assert(hariDari(db.st.subs[1].expired_at) === 30, 'langganan lama paket lain: yang baru mulai sekarang')
  db = dbTiruan({ invoices: [invoice(1, 'bundle', 498390)], subs: [{ id: 's1', user_id: U, plan_id: 'kontraktor', status: 'active', product: null,
    expired_at: new Date(SEKARANG.getTime() + 10 * HARI).toISOString() }] })
  await aktifkan(db, { orderId: order(), dibayar: 498390 }, SEKARANG)
  assert(db.st.subs.length === 1 && db.st.subs[0].plan_id === 'bundle' && hariDari(db.st.subs[0].expired_at) === 40, 'bundle memperpanjang langganan lintas-produk')

  // Kegagalan di tengah jalan.
  db = dbTiruan({ invoices: [invoice()], gagalBuat: true })
  h = await aktifkan(db, { orderId: order(), dibayar: 331890 }, SEKARANG)
  assert(h.status === 'gagal' && db.st.invoices[0].status === 'paid' && /AKTIVASI GAGAL/.test(db.st.catatan[0]?.baris),
    'langganan gagal dibuat: invoice tetap lunas, ada catatan untuk admin')
  db = dbTiruan({ invoices: [invoice()], gagalKomisi: true })
  h = await aktifkan(db, { orderId: order(), dibayar: 331890 }, SEKARANG)
  assert(h.status === 'aktif' && db.st.subs.length === 1, 'komisi gagal dicatat tidak membatalkan aktivasi')
}

// ── 5. Pembantu Midtrans & identitas ────────────────────────────────
{
  assert(idInvoiceDariOrder(`${ID1}_1762484400000`) === ID1, 'order_id <uuid>_<waktu> → id invoice')
  assert(idInvoiceDariOrder(`${ID1.toUpperCase()}_1`) === ID1, 'huruf besar dinormalkan')
  for (const o of ['MANUAL_123', ID1, `${ID1}_`, `${ID1}_abc`, `x${ID1}_1`, `${ID1}_1_2`, '', null, undefined]) {
    assert(idInvoiceDariOrder(o) === null, `bentuk lain bukan id invoice: ${o}`)
  }
  assert(sudahLunas({ transaction_status: 'settlement' }), 'settlement = lunas')
  assert(sudahLunas({ transaction_status: 'capture', fraud_status: 'accept' }) && sudahLunas({ transaction_status: 'capture' }), 'capture lolos = lunas')
  for (const t of [{ transaction_status: 'capture', fraud_status: 'challenge' }, { transaction_status: 'capture', fraud_status: 'deny' },
    { transaction_status: 'pending' }, { transaction_status: 'deny' }, { transaction_status: 'expire' }, { transaction_status: 'cancel' },
    { transaction_status: 'refund' }, {}, null, undefined]) {
    assert(!sudahLunas(t), `bukan lunas: ${JSON.stringify(t)}`)
  }
  assert(asalMidtrans('SB-Mid-server-x', {}) === 'https://api.sandbox.midtrans.com', 'kunci sandbox → API sandbox')
  assert(asalMidtrans('Mid-server-x', {}) === 'https://api.midtrans.com', 'kunci produksi → API produksi')
  assert(asalMidtrans('SB-Mid-server-x', { VERCEL_ENV: 'production' }) === 'https://api.midtrans.com', 'VERCEL_ENV production → produksi')
  assert(asalMidtrans('SB-Mid-server-x', { MIDTRANS_ENV: 'production' }) === 'https://api.midtrans.com', 'MIDTRANS_ENV production → produksi')
  // Status harus ditanyakan ke lingkungan yang SAMA dengan tempat transaksinya dibuat.
  const mulai = baca('api/initiate-payment.ts')
  assert(mulai.includes("env.MIDTRANS_ENV === 'production' || env.VERCEL_ENV === 'production' || !serverKey.startsWith('SB-')"),
    'initiate-payment memilih lingkungan Midtrans dengan aturan yang sama')

  let dipanggil = []
  const ambil = async (url, opt) => { dipanggil.push({ url, opt }); return Response.json({ transaction_status: 'settlement', gross_amount: '10.00' }) }
  const st = await cekStatusMidtrans('a b/c', 'SB-k', {}, ambil)
  assert(st.transaction_status === 'settlement', 'status Midtrans terbaca')
  assert(dipanggil[0].url === 'https://api.sandbox.midtrans.com/v2/a%20b%2Fc/status', 'order_id di-encode di URL status')
  assert(dipanggil[0].opt.headers.Authorization === `Basic ${Buffer.from('SB-k:').toString('base64')}`, 'memakai kunci server (Basic)')
  const menggantung = (_u, opt) => new Promise((_, tolak) => opt.signal.addEventListener('abort', () => tolak(new Error('batal'))))
  let galat = null
  try { await cekStatusMidtrans('o', 'SB-k', {}, menggantung, 30) } catch (e) { galat = e }
  assert(galat, 'Midtrans yang tidak menjawab dibatalkan, tidak menggantung')

  const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon' }
  dipanggil = []
  const auth = async (url, opt) => { dipanggil.push({ url, opt }); return opt.headers.Authorization === 'Bearer sah' ? Response.json({ id: 'u-1' }) : new Response('{}', { status: 401 }) }
  assert(await penggunaDariToken('sah', env, auth) === 'u-1', 'token sah → id pengguna')
  assert(dipanggil[0].url === 'https://p.supabase.co/auth/v1/user' && dipanggil[0].opt.headers.apikey === 'anon', 'diperiksa ke Supabase Auth')
  assert(await penggunaDariToken('palsu', env, auth) === null, 'token palsu → null')
  dipanggil = []
  assert(await penggunaDariToken('', env, auth) === null && dipanggil.length === 0, 'tanpa token tidak bertanya ke mana pun')
  assert(await penggunaDariToken('sah', {}, auth) === null, 'tanpa kunci apa pun → null')
  dipanggil = []
  assert(await penggunaDariToken('sah', { SUPABASE_SERVICE_ROLE_KEY: 'servis' }, auth) === 'u-1'
    && dipanggil[0].url === 'https://ciazztqmkhzrgbaqfyyz.supabase.co/auth/v1/user',
  'tanpa variabel alamat: memakai alamat publik project, kunci servis diterima sebagai apikey')
  assert(await penggunaDariToken('sah', env, async () => { throw new Error('jaringan') }) === null, 'jaringan gagal → null')
  assert(await penggunaDariToken('sah', env, async () => Response.json({ id: '' })) === null, 'jawaban tanpa id → null')
}

// ── 6. Adaptor Supabase: invoice dicari dari bentuk order_id ────────
{
  const catat = []
  const builder = (tabel, hasil) => {
    const q = {
      select(c) { catat.push([tabel, 'select', c]); return q }, eq(k, v) { catat.push([tabel, 'eq', k, v]); return q },
      neq(k, v) { catat.push([tabel, 'neq', k, v]); return q }, update(isi) { catat.push([tabel, 'update', isi]); return q },
      maybeSingle() { return Promise.resolve(hasil) }, then(r, j) { return Promise.resolve(hasil).then(r, j) },
    }
    return q
  }
  let hasil = { data: { id: ID1 }, error: null }
  const sb = { from: t => builder(t, hasil) }
  const db = dbDariSupabase(sb)
  await db.cariInvoice(`${ID1}_123`)
  assert(catat.some(c => c[1] === 'eq' && c[2] === 'id' && c[3] === ID1) && !catat.some(c => c[2] === 'midtrans_order_id'),
    'order_id berbentuk <uuid>_<waktu>: dicari lewat id, tidak lewat kolom midtrans_order_id')
  catat.length = 0
  await db.cariInvoice('MANUAL_99')
  assert(catat.some(c => c[1] === 'eq' && c[2] === 'midtrans_order_id' && c[3] === 'MANUAL_99'), 'bentuk lain: lewat midtrans_order_id')

  catat.length = 0
  hasil = { data: [{ id: ID1 }], error: null }
  assert(await db.klaimLunas(ID1, 'o', 'qris') === true, 'klaim berhasil bila satu baris berubah')
  assert(catat.some(c => c[1] === 'neq' && c[2] === 'status' && c[3] === 'paid'), 'klaim bersyarat status <> paid')
  hasil = { data: [], error: null }
  assert(await db.klaimLunas(ID1, 'o', 'qris') === false, 'klaim gagal bila tidak ada baris yang berubah')
}

// ── 7. Bentuk kode di sekitar modul aktivasi ────────────────────────
{
  const aktivasi = baca('api/_lib/aktivasi.ts')
  const impor = aktivasi.split('\n').filter(b => /^\s*import\s/.test(b))
  assert(impor.length > 0 && impor.every(b => /^\s*import\s+type\s/.test(b)), 'modul aktivasi hanya mengimpor tipe — tidak ada kode lokal yang perlu ikut dibundel')
  assert(!/VITE_MIDTRANS_SERVER|VITE_SUPABASE_SERVICE|VITE_.*SECRET/.test(aktivasi), 'tidak ada rahasia berawalan VITE_')

  const api = ['api/webhook.ts', 'api/initiate-payment.ts', 'api/verifikasi-bayar.ts', 'api/midtrans-webhook.ts']
  for (const f of api) {
    const kode = tanpaKomentar(baca(f))
    const relatif = [...kode.matchAll(/(?:from|import)\s+['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => m[1])
    assert(relatif.length > 0 && relatif.every(p => p.endsWith('.js')),
      `${f}: impor relatif berakhiran .js (Node ESM menolak tanpa ekstensi): ${relatif.join(', ')}`)
  }
  assert(/"type":\s*"module"/.test(baca('package.json')), 'package.json memang ber-type module — alasan aturan .js di atas')

  // Alamat project boleh punya cadangan publik; kunci servis tidak boleh.
  assert(/URL_SUPABASE_PUBLIK = 'https:\/\/ciazztqmkhzrgbaqfyyz\.supabase\.co'/.test(aktivasi)
    && baca('src/lib/supabase.ts').includes("'https://ciazztqmkhzrgbaqfyyz.supabase.co'"), 'cadangan alamat sama dengan frontend')
  for (const f of ['api/webhook.ts', 'api/initiate-payment.ts', 'api/verifikasi-bayar.ts']) {
    const k = tanpaKomentar(baca(f))
    assert(/urlSupabase\((process\.)?env\)/.test(k) && !/SUPABASE_SERVICE_ROLE_KEY\s*(\|\||\?\?)/.test(k), `${f}: alamat lewat urlSupabase, kunci servis tanpa cadangan`)
  }

  const webhook = tanpaKomentar(baca('api/webhook.ts'))
  assert(/aktifkan\(db,/.test(webhook) && !/from\(['"]subscriptions['"]\)/.test(webhook), 'webhook menyerahkan aktivasi ke modul bersama')
  assert(/timingSafeEqual/.test(webhook) && /Buffer\.from/.test(webhook), 'tanda tangan dibandingkan waktu-konstan per byte')
  assert(/update\(\{ status: 'expired' \}\)[\s\S]{0,80}\.neq\('status', 'paid'\)/.test(webhook), 'expire tidak menimpa invoice lunas')
  assert(/export \{ default \} from '\.\/webhook\.js'/.test(baca('api/midtrans-webhook.ts')), 'alamat webhook lama menjalankan kode yang sama')

  const mulai = tanpaKomentar(baca('api/initiate-payment.ts'))
  assert(/penggunaDariToken/.test(mulai) && /status\(401\)/.test(mulai), 'initiate-payment mewajibkan login')
  assert(/inv\.user_id !== pengguna/.test(mulai), 'initiate-payment memeriksa pemilik invoice')
  assert(/gross_amount:\s*total\b/.test(mulai) && /const total = Math\.round\(Number\(inv\.total_idr\)/.test(mulai), 'yang ditagih berasal dari invoice di database')
  assert(!/req\.body\??\.(total_idr|gross_amount|amount|price|plan_id)/.test(mulai) && !/PLAN_PRICES/.test(mulai), 'angka dari browser tidak dipakai')

  const verif = tanpaKomentar(baca('api/verifikasi-bayar.ts'))
  assert(/inv\.user_id !== pengguna/.test(verif) && /idInvoiceDariOrder\(inv\.midtrans_order_id\)/.test(verif),
    'verifikasi-bayar: hanya pemilik, hanya transaksi milik invoice itu')
  assert(/cekStatusMidtrans/.test(verif) && /sudahLunas\(st\)/.test(verif), 'verifikasi-bayar bertanya langsung ke Midtrans')

  const halaman = tanpaKomentar(baca('src/pages/PaymentPage.tsx'))
  assert(!/from\(['"]subscriptions['"]\)/.test(halaman), 'halaman pembayaran tidak lagi membuat langganan sendiri')
  assert(!/status:\s*['"]paid['"]/.test(halaman.replace(/=== ['"]paid['"]/g, '')), 'halaman pembayaran tidak lagi menandai invoice lunas')
  assert(/verifikasiBayar\(/.test(halaman), 'halaman pembayaran meminta server memeriksa')

  const klien = tanpaKomentar(baca('src/lib/invoice.ts'))
  assert(/JSON\.stringify\(\{ invoice_id: invoiceId \}\)/.test(klien), 'browser hanya mengirim id invoice ke initiate-payment')
  assert(/Authorization: `Bearer \$\{await tokenLogin\(\)\}`/.test(klien), 'browser mengirim token login')
}

// ── 8. Migrasi pengunci: aman dijalankan, tidak menyentuh data ──────
{
  const sql = baca('supabase/migrations/migration_kunci_pembayaran.sql')
  const kode = sql.split('\n').filter(b => !b.trim().startsWith('--')).join('\n')
  assert(/JALANKAN SESUDAH/.test(sql), 'kepala berkas memperingatkan urutan menjalankannya')
  assert(!/\b(delete\s+from|truncate|drop\s+table|drop\s+column|alter\s+table|insert\s+into|update\s+public\.|update\s+invoices|update\s+subscriptions)\b/i.test(kode),
    'migrasi tidak menghapus, mengubah, atau menambah data')
  const fungsiInvoice = kode.slice(kode.indexOf('lindungi_invoice()'), kode.indexOf('trg_lindungi_invoice'))
  assert(!/\bnew\.\w+/i.test(fungsiInvoice), 'penjaga invoice tidak menyebut kolom lewat NEW.x (kolomnya berbeda antar database)')
  assert(/jsonb_populate_record\(new/.test(fungsiInvoice) && /to_jsonb\(new\)/.test(fungsiInvoice), 'kolom dibaca/diisi lewat jsonb')
  for (const k of ['status', 'paid_at', 'total_idr', 'plan_id', 'user_id', 'period_start', 'period_end', 'midtrans_order_id', 'notes']) {
    assert(new RegExp(`'${k}'`).test(fungsiInvoice), `kolom ${k} dijaga`)
  }
  assert(/auth\.uid\(\) is null/.test(kode) && /role = 'superadmin'/.test(kode), 'fungsi server & superadmin tetap boleh')
  assert(/before insert or update or delete on public\.subscriptions/.test(kode), 'langganan dijaga untuk tambah, ubah, hapus')

  const cek = baca('supabase/migrations/CEK_KEAMANAN.sql').split('\n').filter(b => !b.trim().startsWith('--')).join('\n')
  assert(!/\b(insert\s+into|update\s+\w+\s+set|delete\s+from|drop\s|alter\s|create\s|truncate)\b/i.test(cek), 'CEK_KEAMANAN hanya membaca')
  assert(/Sudah bayar, tetapi paketnya tidak aktif/.test(cek) && /PERLU DITINJAU/.test(cek) && /AKTIVASI GAGAL/.test(cek),
    'CEK_KEAMANAN menampilkan pembayaran yang belum menjadi paket')
  assert(/migration_kunci_pembayaran\.sql/.test(baca('supabase/migrations/CEK_MIGRASI.sql')), 'CEK_MIGRASI mengenali migrasi pengunci')
}

console.log(`aktivasi-bayar: ${ok} pemeriksaan lolos`)
