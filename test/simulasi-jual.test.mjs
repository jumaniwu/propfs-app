// ============================================================
// Unit terjual yang diketik harus benar-benar tercatat.
//
// Simulasi penjualan membatasi angka yang diketik dengan
//
//     const clamped = Math.min(val, maxUnit - totalSudah, maxUnit)
//     if (clamped > 0) newPenjualan.push(...)
//
// Ketika `maxUnit` masih 0 — jumlah unit tipe itu belum diisi — `clamped`
// selalu 0 dan barisnya tidak pernah ditambahkan. Yang mengetik melihat
// angkanya kembali ke nol, mengetik lagi, kembali nol lagi, tanpa satu pun
// keterangan. `penjualan` tetap kosong, dan SELURUH pendapatan terhitung
// Rp 0 selamanya.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  batasUnit, pasangUnit, unitDiFaseLain, alasanPendapatanNol,
} from '../src/lib/simulasiJual.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Jumlah unit belum diisi TIDAK menelan angkanya ────────────────
//
// Inilah cacat aslinya. Menolak angkanya berarti membuang pekerjaan orang
// demi kolom lain yang belum diisi — kolom yang bisa diisi sesudahnya.
{
  const b = batasUnit(50, 0, 0)
  assert(b.nilai === 50, 'angkanya TETAP dicatat, tidak dijadikan nol')
  assert(b.perluJumlahUnit === true, 'ditandai apa yang sebenarnya kurang')
  assert(/Step 3/.test(b.alasan), 'dan di mana mengisinya')

  // Prasyarat: begini rumus lamanya berperilaku.
  assert(Math.min(50, 0 - 0, 0) === 0,
    'rumus lama menghasilkan nol — lalu `if (clamped > 0)` membuang barisnya')
}

// ── 2. Pemotongan karena sisa TIDAK boleh diam ──────────────────────
//
// Yang mengetik 50 lalu melihat 30 menyangka aplikasinya salah hitung.
{
  const b = batasUnit(50, 100, 70)
  assert(b.nilai === 30, 'dipotong ke sisa yang benar')
  assert(/tinggal 30/.test(b.alasan), 'dan dikatakan berapa sisanya')
  assert(/100/.test(b.alasan), 'berikut totalnya, supaya angkanya bisa dicocokkan')
  assert(b.perluJumlahUnit === false, 'ini bukan soal jumlah unit yang kosong')
}

// ── 3. Sisa nol dijelaskan, bukan sekadar ditolak ──────────────────
{
  const b = batasUnit(10, 100, 100)
  assert(b.nilai === 0, 'tidak ada sisa')
  assert(/sudah dijadwalkan di fase lain/.test(b.alasan),
    'menyebut ke mana unitnya pergi — tanpa itu, "0" terbaca seperti kerusakan')
}

// ── 4. Angka yang wajar lewat tanpa berisik ────────────────────────
{
  const b = batasUnit(30, 100, 20)
  assert(b.nilai === 30 && b.alasan === '', 'diterima apa adanya, tanpa peringatan')
}

// ── 5. Tidak pernah menghasilkan angka negatif ─────────────────────
//
// `maxUnit - totalSudah` pada rumus lama bisa minus, dan minus tidak lebih
// besar dari nol — jadi barisnya ikut dibuang diam-diam.
{
  assert(batasUnit(10, 50, 80).nilai === 0, 'sudah kelebihan di fase lain: nol, bukan minus')
  assert(batasUnit(-5, 100, 0).nilai === 0, 'ketikan minus dianggap nol')
  assert(batasUnit('x', 'y', 'z').nilai === 0, 'masukan tak masuk akal aman')
  assert(batasUnit(null, null, null).nilai === 0, 'kosong aman')
  assert(batasUnit(10.7, 100, 0).nilai === 10, 'pecahan dibulatkan ke bawah — unit itu utuh')
}

// ── 6. Nol MENGHAPUS barisnya, bukan diabaikan ────────────────────
//
// Mengosongkan sebuah fase adalah perubahan yang disengaja. Mengabaikannya
// membuat angka lama menempel di sana tanpa bisa dihapus.
{
  const awal = [{ tipeId: 't1', fase: 1, unitTerjual: 20 }, { tipeId: 't2', fase: 1, unitTerjual: 5 }]
  const kosong = pasangUnit(awal, 't1', 1, 0)
  assert(kosong.length === 1 && kosong[0].tipeId === 't2', 'barisnya terhapus')

  const isi = pasangUnit(awal, 't1', 1, 35)
  assert(isi.find(p => p.tipeId === 't1').unitTerjual === 35, 'nilainya diganti, tidak ditumpuk')
  assert(isi.length === 2, 'tidak melahirkan baris kembar')

  const baru = pasangUnit(awal, 't3', 2, 7)
  assert(baru.length === 3, 'tipe & fase baru ditambahkan')
  assert(pasangUnit(awal, '', 1, 5).length === 2, 'tanpa tipe: tidak mengubah apa pun')
  assert(pasangUnit(null, 't1', 1, 5).length === 1, 'daftar kosong aman')
}

// ── 7. Hitungan fase lain tidak menghitung fase yang sedang diisi ──
//
// Kalau ikut terhitung, mengubah angka di fase 1 akan membandingkannya dengan
// dirinya sendiri — dan setiap penambahan tampak melebihi batas.
{
  const p = [
    { tipeId: 't1', fase: 1, unitTerjual: 20 },
    { tipeId: 't1', fase: 2, unitTerjual: 30 },
    { tipeId: 't2', fase: 1, unitTerjual: 99 },
  ]
  assert(unitDiFaseLain(p, 't1', 1) === 30, 'hanya fase lain, dan hanya tipe itu')
  assert(unitDiFaseLain(p, 't1', 3) === 50, 'fase baru: seluruh fase lain dihitung')
  assert(unitDiFaseLain(null, 't1', 1) === 0, 'kosong aman')
}

// ── 8. Pendapatan nol selalu punya penjelasan ─────────────────────
//
// Nol yang tidak dijelaskan adalah keluhan yang paling sering datang dari
// layar ini: seluruh angka biaya terisi, dan satu-satunya baris yang penting
// berbunyi Rp 0 tanpa sebab yang bisa ditebak.
{
  assert(/Step 3/.test(alasanPendapatanNol({ adaTipe: false, adaJadwal: false, adaHarga: false })),
    'tanpa tipe bangunan')
  const jadwal = alasanPendapatanNol({ adaTipe: true, adaJadwal: false, adaHarga: true })
  assert(/Simulasi Penjualan/.test(jadwal), 'menunjuk layar yang harus dibuka')
  assert(/bukan dari jumlah unit yang dibangun/.test(jadwal),
    'dan meluruskan salah paham yang paling sering: dibangun ≠ terjual')
  assert(/margin/.test(alasanPendapatanNol({ adaTipe: true, adaJadwal: true, adaHarga: false })),
    'harga nol menunjuk margin')
  assert(alasanPendapatanNol({ adaTipe: true, adaJadwal: true, adaHarga: true }) === '',
    'semuanya terisi: tidak ada yang perlu dikatakan')
}

// ── 9. Layarnya benar-benar memakai aturan ini ────────────────────
{
  const akar = new URL('../src', import.meta.url).pathname
  const step = readFileSync(join(akar, 'components/inputs/Step6SimulasiPenjualan.tsx'), 'utf8')
  assert(/batasUnit\(/.test(step), 'batasnya lewat aturan yang bisa diuji')
  assert(/pasangUnit\(/.test(step), 'dan pemasangannya juga')
  // Baris kode saja; komentar yang MENGUTIP bentuk lamanya justru berguna.
  const kode = step.split('\n').filter(b => !b.trim().startsWith('//')).join('\n')
  assert(!/if \(clamped > 0\) newPenjualan\.push/.test(kode),
    'baris yang membuang angka diam-diam sudah tidak ada')
  assert(/data-alasan-nol/.test(step),
    'dan pendapatan yang nol menjelaskan dirinya sendiri di layar')
}

console.log(`simulasi-jual: ${ok} assert lulus`)
