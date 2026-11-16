// ============================================================
// HPP apartemen mengikuti biaya tower yang DIISI, dan revisi tidak tertimpa.
//
// GEJALANYA (Pasific Suites): biaya konstruksi Tower 1 diubah menjadi
// Rp 12.000.000/m², tetapi "Prorata HPP Bangunan / m²" di Harga Jual tetap
// Rp 9.679.580. Isian yang diubah adalah kolom rumah tapak
// (biayaKonstruksiPerM2) — yang tidak dibaca perhitungan apartemen — sementara
// biaya tower & podium yang dipakai tidak punya isian sama sekali dan terkunci
// di bawaan Rp 7.000.000 & Rp 5.000.000.
//
// Yang diuji:
//   1. Rumusnya sama persis dengan rumus lama (tidak ada angka yang bergeser
//      untuk proyek yang tidak diubah), dan kini mengikuti biaya tower.
//   2. Kolom lama dikenali, tetapi tidak dipindahkan diam-diam.
//   3. Halaman Biaya Pembangunan mengisi kolom yang benar-benar dihitung.
//   4. Penyimpanan FS tidak lagi tumpang tindih: isian terakhir selalu yang
//      terakhir tiba di server.
// ============================================================
import { readFileSync } from 'node:fs'
import {
  rincianBiayaTower, hppTowerFase, biayaKolomLamaTower, EFISIENSI_BAWAAN,
} from '../src/engine/biayaTower.ts'
import { buatSatuSekaligus } from '../src/lib/simpanDraf.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const baca = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const tanpaKomentar = t => t.split('\n').filter(b => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(b)).join('\n')
const dekat = (a, b, t = 1e-6) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b))

/** Rumus SEBELUM perubahan ini, disalin apa adanya sebagai pembanding. */
function rumusLama(t) {
  const units = t.tipeUnit || []
  const totalNSA = units.reduce((s, u) => s + ((u.luasSemigross || 0) * (u.jumlahUnit || 0)), 0)
  const efisiensi = t.efisiensiLantai || 80
  const totalGFA = totalNSA / (efisiensi / 100)
  const podiumCost = (t.luasPodiumParkiran || 0) * (t.biayaKonstruksiPodiumPerM2 || 0)
  const towerCostRaw = totalGFA * (t.biayaKonstruksiTowerPerM2 || 0)
  return totalNSA > 0 ? (podiumCost + towerCostRaw) / totalNSA : 0
}

const TOWER = {
  id: 'tw1', kategori: 'apartemen', nama: 'Tower 1',
  luasBangunan: 0, luasKavling: 0, jumlahUnit: 0,
  biayaKonstruksiPerM2: 12_000_000,           // diketik di kolom LAMA
  kenaikanBiayaPerFase: 7,
  marginBangunanPerM2: 0, kelipatanMarginBangunan: 1, marginKavlingPerM2: 0, kelipatanMarginKavling: 1,
  luasPodiumParkiran: 6_900, efisiensiLantai: 80,
  biayaKonstruksiPodiumPerM2: 5_000_000, biayaKonstruksiTowerPerM2: 7_000_000,
  tipeUnit: [
    { id: 'u1', nama: 'Studio', luasSemigross: 33.35, jumlahUnit: 504, marginUnitPerM2: 10_000_000 },
    { id: 'u2', nama: '1 bedroom', luasSemigross: 41.69, jumlahUnit: 224, marginUnitPerM2: 10_000_000 },
    { id: 'u3', nama: '2 bedrooms', luasSemigross: 66.04, jumlahUnit: 168, marginUnitPerM2: 10_000_000 },
  ],
}

// ── 1. Rumus ─────────────────────────────────────────────────────────
{
  const r = rincianBiayaTower(TOWER)
  assert(r.unit === 896, '504 + 224 + 168 = 896 unit')
  assert(dekat(r.nsa, 33.35 * 504 + 41.69 * 224 + 66.04 * 168), 'luas jual = Σ luas × unit')
  assert(dekat(r.gfa, r.nsa / 0.8), 'GFA = luas jual ÷ efisiensi')
  assert(dekat(r.biayaTower, r.gfa * 7_000_000) && dekat(r.biayaPodium, 6_900 * 5_000_000), 'biaya tower & podium')
  assert(dekat(r.hppPerM2, (r.biayaTower + r.biayaPodium) / r.nsa), 'HPP = total ÷ luas jual')
  assert(dekat(r.hppPerM2, rumusLama(TOWER)), 'sama persis dengan rumus lama — proyek yang tidak diubah tidak bergeser')

  // Kolom lama (biayaKonstruksiPerM2) memang TIDAK menggerakkan HPP — itulah gejalanya.
  assert(dekat(rincianBiayaTower({ ...TOWER, biayaKonstruksiPerM2: 99_000_000 }).hppPerM2, r.hppPerM2),
    'mengubah kolom rumah tapak tidak mengubah HPP tower (penyebab keluhan)')
  // Biaya tower yang diisi dengan benar langsung terbaca.
  const naik = rincianBiayaTower({ ...TOWER, biayaKonstruksiTowerPerM2: 12_000_000 })
  assert(dekat(naik.hppPerM2 - r.hppPerM2, (12_000_000 - 7_000_000) / 0.8),
    'tower Rp 7 jt → Rp 12 jt menaikkan HPP sebesar 5 jt ÷ efisiensi 80% = Rp 6,25 jt/m² luas jual')

  assert(dekat(hppTowerFase(TOWER, 1), r.hppPerM2), 'fase 1 tanpa kenaikan')
  assert(dekat(hppTowerFase(TOWER, 2), r.hppPerM2 * 1.07), 'fase 2 naik 7%')
  assert(dekat(hppTowerFase(TOWER, 3), r.hppPerM2 * 1.07 * 1.07), 'fase 3 naik majemuk')

  // Batas-batas.
  assert(rincianBiayaTower({ ...TOWER, tipeUnit: [] }).hppPerM2 === 0, 'tanpa unit: HPP 0, bukan pembagian dengan nol')
  assert(rincianBiayaTower({ ...TOWER, efisiensiLantai: 0 }).efisiensi === EFISIENSI_BAWAAN, 'efisiensi 0 → bawaan 80%')
  assert(dekat(rincianBiayaTower({ ...TOWER, efisiensiLantai: 0 }).hppPerM2, rumusLama({ ...TOWER, efisiensiLantai: 0 })), 'efisiensi 0: sama dengan rumus lama')
  const kosong = rincianBiayaTower({ kategori: 'apartemen', tipeUnit: [{ luasSemigross: 30, jumlahUnit: 10 }] })
  assert(kosong.hppPerM2 === 0 && kosong.nsa === 300, 'biaya belum diisi: 0, sama dengan rumus lama')
  assert(rincianBiayaTower(null).hppPerM2 === 0 && rincianBiayaTower(undefined).unit === 0, 'null aman')
  for (let i = 0; i < 300; i++) {
    const t = {
      ...TOWER,
      efisiensiLantai: [0, 60, 75, 80, 92.5][i % 5],
      luasPodiumParkiran: (i * 137) % 9000,
      biayaKonstruksiTowerPerM2: 3_000_000 + (i * 91_000) % 9_000_000,
      biayaKonstruksiPodiumPerM2: (i * 53_000) % 6_000_000,
      tipeUnit: TOWER.tipeUnit.map((u, k) => ({ ...u, jumlahUnit: (u.jumlahUnit + i * (k + 1)) % 700 })),
    }
    assert(dekat(rincianBiayaTower(t).hppPerM2, rumusLama(t)), `paritas rumus lama #${i}`)
  }

  assert(biayaKolomLamaTower(TOWER) === 12_000_000, 'angka di kolom lama tower dikenali')
  assert(biayaKolomLamaTower({ ...TOWER, biayaKonstruksiPerM2: 0 }) === 0, 'kolom lama kosong: tidak ada tawaran')
  assert(biayaKolomLamaTower({ ...TOWER, kategori: 'landed' }) === 0, 'rumah tapak: kolom itu memang dipakai, bukan "lama"')
}

// ── 2. Kode yang memakainya ──────────────────────────────────────────
{
  const kalk = tanpaKomentar(baca('src/engine/calculator.ts'))
  const apt = kalk.slice(kalk.indexOf("if (t.kategori === 'apartemen')"), kalk.indexOf('} else {', kalk.indexOf("if (t.kategori === 'apartemen')")))
  assert(/rincianBiayaTower\(t\)\.hppPerM2/.test(apt), 'mesin hitung memakai rumus bersama')
  assert(!/biayaKonstruksiTowerPerM2|biayaKonstruksiPodiumPerM2/.test(apt), 'tidak ada salinan rumus kedua di mesin hitung')

  const step4 = tanpaKomentar(baca('src/components/inputs/Step4BiayaPembangunan.tsx'))
  assert(/tipe\.kategori === 'apartemen' \? \(\s*<BiayaTowerApartemen/.test(step4), 'tower apartemen memakai isian tower')
  assert(/getSellingEntities\(inputs\)/.test(step4) && /calcBiayaBangunPerUnit\(ent, fase\)/.test(step4),
    'total biaya bangun dihitung dari entitas jual — apartemen tidak lagi Rp 0')

  const tower = tanpaKomentar(baca('src/components/inputs/BiayaTowerApartemen.tsx'))
  assert(/onUbah\(\{ biayaKonstruksiTowerPerM2: v \}\)/.test(tower), 'isian biaya tower menulis kolom yang dihitung')
  assert(/onUbah\(\{ biayaKonstruksiPodiumPerM2: v \}\)/.test(tower), 'isian biaya podium menulis kolom yang dihitung')
  assert(/onUbah\(\{ biayaKonstruksiTowerPerM2: lama, biayaKonstruksiPerM2: 0 \}\)/.test(tower),
    'angka kolom lama dipindahkan hanya bila tombolnya ditekan')
  assert(/rincianBiayaTower\(tipe\)/.test(tower) && /data-hpp-tower/.test(tower), 'HPP yang ditampilkan berasal dari rumus yang sama')
  assert(!/biayaKonstruksiPerM2: v\b/.test(tower), 'tower tidak lagi punya isian kolom rumah tapak')

  const step5 = tanpaKomentar(baca('src/components/inputs/Step5HargaJual.tsx'))
  assert(/data-asal-hpp/.test(step5) && /rincianBiayaTower\(tower\)/.test(step5), 'Harga Jual menyebut asal HPP-nya')
}

// ── 3. Penyimpanan FS: satu kiriman sekaligus ────────────────────────
{
  const tidur = ms => new Promise(r => setTimeout(r, ms))
  let benih = 7
  const acak = () => ((benih = (benih * 1103515245 + 12345) % 2147483648) / 2147483648)

  for (let ronde = 0; ronde < 25; ronde++) {
    const g = buatSatuSekaligus()
    let lokal = 0                 // isian di layar (versi)
    let server = 0                // versi yang terakhir TIBA di server
    let diJalan = 0, maksDiJalan = 0, kiriman = 0
    const berangkat = []

    async function simpan() {
      const tunggu = g.masuk(() => simpan())
      if (tunggu) return tunggu
      try {
        const versi = lokal       // dibaca saat berangkat, seperti get() di store
        berangkat.push(versi)
        kiriman++; diJalan++; maksDiJalan = Math.max(maksDiJalan, diJalan)
        await tidur(1 + Math.floor(acak() * 12))   // jaringan yang tak menentu
        server = versi
      } finally {
        diJalan--
        g.keluar()
      }
    }

    const janji = []
    for (let k = 0; k < 15; k++) {
      lokal++
      const versiSaatMinta = lokal
      janji.push(simpan().then(() => {
        assert(server >= versiSaatMinta || berangkat.some(v => v >= versiSaatMinta),
          'yang menunggu baru dilepas setelah kiriman berisi isiannya')
      }))
      await tidur(Math.floor(acak() * 6))
    }
    await Promise.all(janji)
    assert(maksDiJalan === 1, `ronde ${ronde}: tidak pernah dua kiriman bersamaan`)
    assert(server === lokal, `ronde ${ronde}: server berakhir dengan isian TERAKHIR (${server} = ${lokal})`)
    assert(berangkat.every((v, i) => i === 0 || v >= berangkat[i - 1]), `ronde ${ronde}: kiriman berangkat berurutan`)
    assert(kiriman < 15, `ronde ${ronde}: permintaan yang menumpuk digabung (${kiriman} kiriman untuk 15 permintaan)`)
    assert(!g.sibuk(), 'giliran dilepas di akhir')
  }

  // Kegagalan tidak mengunci antrean.
  {
    const g = buatSatuSekaligus()
    let jalan = 0
    async function gagal() {
      const t = g.masuk(() => gagal())
      if (t) return t
      try { jalan++; await tidur(2); if (jalan === 1) throw new Error('jaringan putus') } finally { g.keluar() }
    }
    await Promise.allSettled([gagal(), gagal(), gagal()])
    assert(jalan === 2 && !g.sibuk(), 'kiriman yang gagal tetap melepas giliran; susulannya berjalan')
  }

  const store = baca('src/store/fsStore.ts')
  const blok = store.match(/saveCurrentProject: async \(\) => \{[\s\S]*?\n  \},/)[0]
  const masuk = blok.indexOf('giliranSimpan.masuk(() => get().saveCurrentProject())')
  assert(masuk > 0 && masuk < blok.indexOf('set({ isSaving: true })'), 'giliran diminta sebelum kiriman berangkat')
  const ekor = blok.match(/\} finally \{[\s\S]*?\n    \}/)[0]
  assert(/giliranSimpan\.keluar\(\)/.test(ekor), 'giliran dilepas di finally')
}

console.log(`biaya-tower: ${ok} pemeriksaan lolos`)
