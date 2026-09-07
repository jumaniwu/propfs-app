// ============================================================
// Cadangan data akuntan yang dipegang pemiliknya sendiri.
//
// Pemasukan Rp 250 juta hilang dan TIDAK ADA satu pun baris di database yang
// bisa dipakai memulihkannya. Yang Rp 177 juta selamat hanya karena kebetulan
// sudah berkwitansi — kwitansi adalah baris tersendiri, jadi ia bertahan.
// Yang belum berkwitansi tidak meninggalkan apa pun sama sekali.
//
// Sebabnya bentuk penyimpanannya: seluruh data akuntan hidup sebagai SATU
// dokumen JSON per pemakai, ditulis ulang utuh tiap ada perubahan. Satu
// penulisan keliru menghapus semuanya.
//
// Berkas cadangan adalah jaring terakhir: salinan yang bisa disimpan di HP,
// dikirim lewat WhatsApp, atau ditaruh di Drive — dan tidak bergantung pada
// apakah aplikasinya berperilaku benar.
//
// Yang paling diuji di sini: MEMASUKKAN CADANGAN TIDAK MENIMPA. Cadangan yang
// menimpa akan mengulang persoalan yang sama dari arah sebaliknya.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buatCadangan, namaBerkasCadangan, ringkasCadangan, bacaCadangan,
  rencanaMasuk, kalimatMasuk,
} from '../src/lib/cadanganAkuntan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const isi = {
  pemasukanEntries: [
    { id: 'p1', tanggal: '2026-08-14', sumber: 'DP Noble Cove', kategori: 'termin', jumlah: 177000000 },
    { id: 'p2', tanggal: '2026-07-02', sumber: 'Termin Pak Soni', kategori: 'termin', jumlah: 250000000 },
  ],
  inventoryAdjustments: [{ id: 'i1', tanggal: '2026-08-01', nama: 'Semen', satuan: 'sak', qty: 10 }],
  biayaUmumEntries: [{ id: 'b1', jumlah: 500000 }],
  hapusan: [{ id: 'lama-1', at: '2026-06-01' }],
}

// ── 1. Cadangan memuat semuanya, dan bisa dikenali kembali ──────────
{
  const c = buatCadangan(isi, new Date('2026-09-06T10:30:00Z'))
  assert(c.jenis === 'propfs-akuntan' && c.versi === 1, 'punya penanda jenis & versi')
  assert(c.pemasukanEntries.length === 2, 'pemasukan ikut')
  assert(c.biayaUmumEntries.length === 1 && c.inventoryAdjustments.length === 1, 'biaya & inventori ikut')
  assert(c.hapusan.length === 1, 'nisan ikut — supaya yang dihapus tidak hidup lagi saat dimasukkan')

  const r = ringkasCadangan(c)
  assert(r.pemasukan === 2 && r.totalRupiah === 427000000, 'ringkasannya menyebut nominal total')

  // Nama berkas menyebut tanggal & jam, supaya cadangan lama tidak tertimpa
  // oleh yang baru pada hari yang sama.
  const nama = namaBerkasCadangan(new Date('2026-09-06T10:30:00'))
  assert(/^propfs-akuntan-20260906-1030\.json$/.test(nama), `nama berkasnya bertanggal: ${nama}`)
}

// ── 2. Bolak-balik: disimpan lalu dibaca, isinya utuh ───────────────
{
  const teks = JSON.stringify(buatCadangan(isi))
  const { isi: kembali, galat } = bacaCadangan(teks)
  assert(!galat && kembali, 'terbaca kembali tanpa galat')
  assert(kembali.pemasukanEntries.length === 2, 'jumlahnya utuh')
  assert(kembali.pemasukanEntries[1].jumlah === 250000000, 'nominalnya utuh sampai rupiah terakhir')
  assert(kembali.pemasukanEntries[1].sumber === 'Termin Pak Soni', 'keterangannya utuh')
}

// ── 3. Berkas yang keliru DITOLAK DENGAN SEBAB ──────────────────────
//
// Berkas yang salah dipilih adalah kejadian biasa, dan "tidak terjadi
// apa-apa" setelah memilih berkas terbaca sebagai aplikasi yang rusak.
{
  const bukanJson = bacaCadangan('ini bukan json')
  assert(!bukanJson.isi && /JSON/.test(bukanJson.galat), 'bukan JSON → disebut')

  const jsonLain = bacaCadangan('{"hello":"world"}')
  assert(!jsonLain.isi && /bukan berkas cadangan/i.test(jsonLain.galat), 'JSON lain → disebut')

  const kosong = bacaCadangan(JSON.stringify({ jenis: 'propfs-akuntan', pemasukanEntries: [] }))
  assert(!kosong.isi && /tidak berisi/i.test(kosong.galat), 'cadangan kosong → disebut')

  assert(!bacaCadangan(null).isi, 'null tidak melempar')
  assert(!bacaCadangan('').isi, 'teks kosong tidak melempar')
}

// ── 4. MEMASUKKAN TIDAK MENIMPA ─────────────────────────────────────
{
  const c = buatCadangan(isi)

  // Kasus yang dilaporkan: p2 (Rp 250 jt) hilang, p1 masih ada.
  const r = rencanaMasuk(c, [{ id: 'p1' }], [])
  assert(r.pemasukan.length === 1, 'hanya yang hilang yang ditambahkan')
  assert(r.pemasukan[0].id === 'p2' && r.pemasukan[0].jumlah === 250000000, 'yang benar, dengan nominal utuh')
  assert(r.sudahAda === 1, 'yang sudah ada dihitung, bukan ditimpa')
  assert(r.totalRupiah === 250000000, 'totalnya hanya yang benar-benar masuk')

  // Semua sudah ada → tidak ada yang ditambahkan, dan itu bukan galat.
  const semua = rencanaMasuk(c, [{ id: 'p1' }, { id: 'p2' }], [])
  assert(semua.pemasukan.length === 0 && semua.sudahAda === 2, 'tidak ada yang digandakan')
  assert(/sudah ada di aplikasi/.test(kalimatMasuk(semua)), 'dan dikatakan apa adanya')
}

// ── 5. Yang sengaja dihapus tidak hidup lagi — dari KEDUA arah ──────
//
// Entri yang dihapus di perangkat lain SESUDAH cadangan dibuat tidak boleh
// hidup lagi hanya karena cadangannya lebih tua.
{
  const c = buatCadangan(isi)
  const nisanBaru = rencanaMasuk(c, [], ['p2'])
  assert(nisanBaru.pemasukan.length === 1 && nisanBaru.bernisan === 1,
    'nisan yang sekarang menahan entri dari cadangan lama')

  // Nisan yang ikut DI DALAM cadangan juga dihormati.
  const cDenganNisan = buatCadangan({ ...isi, hapusan: [{ id: 'p1' }] })
  const dariBerkas = rencanaMasuk(cDenganNisan, [], [])
  assert(dariBerkas.pemasukan.length === 1 && dariBerkas.pemasukan[0].id === 'p2',
    'nisan di dalam berkas cadangan ikut menahan')
}

// ── 6. Masukan rusak tidak merusak hasil ────────────────────────────
{
  assert(rencanaMasuk(null, null, null).pemasukan.length === 0, 'null aman')
  const aneh = rencanaMasuk(
    { pemasukanEntries: [{ id: 'x', jumlah: 'bukan angka' }, { id: '' }, { id: 'x' }] },
    [], [])
  assert(aneh.pemasukan.length === 1, 'id kosong dilewati, id kembar tidak digandakan')
  assert(aneh.pemasukan[0].jumlah === 0, 'jumlah yang bukan angka jadi nol, tidak menular NaN')
  assert(!/NaN/.test(kalimatMasuk(aneh)), 'NaN tidak pernah sampai ke layar')
}

// ── 7. Kalimat konfirmasi menyebut nominalnya ───────────────────────
{
  const s = kalimatMasuk(rencanaMasuk(buatCadangan(isi), [{ id: 'p1' }], []))
  assert(/Rp 250\.000\.000/.test(s), 'nominal dalam format Indonesia')
  assert(/1 yang sudah ada dibiarkan/.test(s), 'yang tidak disentuh ikut disebut')
}

// ── 8. Layarnya benar-benar memakai ini ─────────────────────────────
{
  const akar = new URL('../src', import.meta.url).pathname
  const tab = readFileSync(join(akar, 'components/cost/TabAkuntan.tsx'), 'utf8')
  assert(/buatCadangan/.test(tab), 'ada tombol unduh cadangan')
  assert(/bacaCadangan/.test(tab), 'dan pembaca berkas cadangan')
  assert(/rencanaMasuk/.test(tab) && /kalimatMasuk/.test(tab), 'memakai rencana & kalimat yang sama')
}

console.log(`cadangan-akuntan: ${ok} assert lulus`)
