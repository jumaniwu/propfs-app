// ============================================================
// Mengubah jumlah & membatalkan Material Request.
//
// Yang berbahaya di sini bukan mengubahnya, melainkan URUTANNYA.
//
// Sebuah permintaan bisa SUDAH sebagian dipesan, dan angkanya ada di dua
// tempat yang berbeda: `qty_dipesan` untuk PO yang sudah dikirim ke vendor,
// dan PO berstatus draft/menunggu/disetujui untuk yang belum. Menurunkan
// jumlah permintaan di bawah salah satunya membuat vendor dipesani lebih
// banyak daripada yang diminta — dan tidak ada galat yang muncul, karena
// sisaQty menjepitnya ke nol. Layarnya tetap rapi, pembukuannya sudah salah.
//
// Itulah yang diuji di sini, bukan tampilannya.
// ============================================================
import {
  periksaUbahQty, periksaBatal, kalimatBatal, catatanBatal, poYangMenahan,
} from '../src/lib/suntingPermintaan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const req = (lebih = {}) => ({
  id: 'r1', nama: 'Paku beton 2,5', satuan: 'Kotak', qty: 10, qty_dipesan: 0, ...lebih,
})
const po = (status, qty, nomor = 'PO/020/10/2026', requestId = 'r1') => ({
  status, nomor, items: [{ request_id: requestId, qty }],
})

// ── 1. Menaikkan jumlah selalu boleh ────────────────────────────────
//
// Sisanya bertambah; tidak ada PO yang jadi salah karenanya.
{
  const h = periksaUbahQty(req({ qty_dipesan: 8 }), 20, [po('terkirim', 8)])
  assert(h.boleh, 'menaikkan jumlah boleh walau sebagian sudah terkirim')
  assert(/naik dari 10 Kotak menjadi 20 Kotak/.test(h.peringatan ?? ''), 'perubahannya disebut')
}

// ── 2. Yang sudah TERKIRIM mengunci batas bawahnya ──────────────────
{
  const r = req({ qty_dipesan: 6 })
  const kurang = periksaUbahQty(r, 5, [])
  assert(!kurang.boleh, 'tidak boleh turun di bawah yang sudah terkirim')
  assert(/6 Kotak sudah terkirim/.test(kurang.alasan), 'menyebut angkanya')
  assert(/tidak bisa ditarik kembali/.test(kurang.alasan), 'menjelaskan kenapa')

  const pas = periksaUbahQty(r, 6, [])
  assert(pas.boleh, 'turun tepat sampai batasnya masih boleh')

  const turun = periksaUbahQty(r, 7, [])
  assert(turun.boleh, 'turun di atas batasnya boleh')
  assert(/turun dari 10 Kotak menjadi 7 Kotak/.test(turun.peringatan ?? ''), 'penurunannya disebut')
}

// ── 3. PO yang BELUM dikirim juga menahan ───────────────────────────
//
// Inilah yang paling mudah terlewat: angkanya belum masuk qty_dipesan sama
// sekali, jadi permintaannya masih tampak "belum dipesan".
{
  const r = req({ qty_dipesan: 0 })
  for (const status of ['draft', 'menunggu_approval', 'disetujui']) {
    const h = periksaUbahQty(r, 2, [po(status, 7)])
    assert(!h.boleh, `PO berstatus ${status} ikut menahan`)
    assert(/PO\/020\/10\/2026/.test(h.alasan), 'nomor PO-nya disebut — tanpa itu tidak bisa ditindaklanjuti')
    assert(/\(7 Kotak\)/.test(h.alasan), 'qty di PO itu disebut')
    assert(/vendor dipesani lebih banyak/.test(h.alasan), 'akibatnya dijelaskan')
  }

  // PO yang ditolak tidak menahan apa pun.
  assert(periksaUbahQty(r, 2, [po('ditolak', 7)]).boleh, 'PO yang ditolak tidak menahan')

  // Yang sudah terkirim/selesai TIDAK dihitung di sini — ia sudah masuk
  // qty_dipesan, dan menghitungnya dua kali akan menolak perubahan yang sah.
  assert(poYangMenahan('r1', [po('terkirim', 7), po('selesai', 3)]).length === 0,
    'PO terkirim & selesai tidak dihitung ulang')
}

// Keduanya DIJUMLAHKAN: 4 sudah terkirim + 3 menunggu = batas bawah 7.
{
  const r = req({ qty_dipesan: 4 })
  assert(!periksaUbahQty(r, 6, [po('draft', 3)]).boleh, 'terkirim + tertunda dijumlahkan')
  assert(periksaUbahQty(r, 7, [po('draft', 3)]).boleh, 'tepat di jumlah keduanya boleh')
}

// Beberapa PO sekaligus: semuanya disebut, supaya tidak ada yang tertinggal.
{
  const r = req()
  const h = periksaUbahQty(r, 1, [po('draft', 3, 'PO/001'), po('disetujui', 2, 'PO/002')])
  assert(!h.boleh, 'dua PO tertunda ikut menahan')
  assert(/PO\/001/.test(h.alasan) && /PO\/002/.test(h.alasan), 'keduanya disebut')
}

// PO yang memuat request LAIN tidak ikut menahan.
{
  const h = periksaUbahQty(req(), 1, [po('draft', 9, 'PO/003', 'r2')])
  assert(h.boleh, 'PO untuk request lain tidak menahan')
}

// ── 4. Masukan yang tidak masuk akal ditolak lebih dulu ─────────────
{
  assert(!periksaUbahQty(req(), 0, []).boleh, 'nol ditolak')
  assert(!periksaUbahQty(req(), -3, []).boleh, 'negatif ditolak')
  assert(!periksaUbahQty(req(), Number.NaN, []).boleh, 'bukan angka ditolak')
  assert(/lebih besar dari nol/.test(periksaUbahQty(req(), 0, []).alasan), 'sebabnya dikatakan')

  const sama = periksaUbahQty(req(), 10, [])
  assert(!sama.boleh, 'jumlah yang sama tidak perlu disimpan')
  assert(/sama dengan yang sekarang/.test(sama.alasan), 'dikatakan apa adanya')

  assert(!periksaUbahQty(null, 5, []).boleh, 'permintaan kosong tidak meledak')
  assert(!periksaBatal(undefined, []).boleh, 'pembatalan tanpa permintaan tidak meledak')
}

// Satuan kosong tidak meninggalkan spasi ganda di kalimatnya.
{
  const h = periksaUbahQty(req({ satuan: '', qty_dipesan: 6 }), 5, [])
  assert(!/ {2}/.test(h.alasan), 'tidak ada spasi ganda saat satuannya kosong')
  assert(/^6 sudah terkirim/.test(h.alasan), 'angkanya tetap terbaca')
}

// Pecahan tetap pecahan — 2,5 Kotak bukan 3.
{
  const h = periksaUbahQty(req({ qty: 10 }), 2.5, [])
  assert(h.boleh, 'pecahan diterima')
  assert(/menjadi 2\.5 Kotak/.test(h.peringatan), 'tidak dibulatkan diam-diam')
}

// ── 5. Pembatalan tidak pernah dihalangi, tapi harus jujur ──────────
//
// Berhenti membeli sesuatu adalah keputusan orangnya. Yang wajib dilakukan
// aplikasi adalah mengatakan apa yang TIDAK ikut batal.
{
  const bersih = periksaBatal(req(), [])
  assert(bersih.boleh && !bersih.peringatan, 'yang belum dipesan sama sekali: batal bersih')

  const terkirim = periksaBatal(req({ qty_dipesan: 4 }), [])
  assert(terkirim.boleh, 'tetap boleh dibatalkan walau sebagian terkirim')
  assert(/4 Kotak sudah terkirim/.test(terkirim.peringatan), 'menyebut yang sudah terkirim')
  assert(/TIDAK ikut batal/.test(terkirim.peringatan), 'menegaskan itu tidak ikut batal')

  const tertunda = periksaBatal(req(), [po('draft', 3)])
  assert(tertunda.boleh, 'tetap boleh walau ada PO tertunda')
  assert(/PO\/020\/10\/2026/.test(tertunda.peringatan), 'PO-nya disebut')
  assert(/hapus atau revisi/i.test(tertunda.peringatan), 'langkah lanjutannya disebut')

  const dua = periksaBatal(req({ qty_dipesan: 4 }), [po('draft', 3)])
  assert(/sudah terkirim/.test(dua.peringatan) && /PO\//.test(dua.peringatan),
    'keduanya disebut sekaligus')
}

// ── 6. Kalimat konfirmasinya menyebut barangnya ─────────────────────
{
  const k = kalimatBatal(req({ qty_dipesan: 4 }), [])
  assert(/Paku beton 2,5/.test(k), 'namanya disebut, bukan "item ini"')
  assert(/10 Kotak/.test(k), 'jumlahnya disebut')
  assert(/⚠️/.test(k), 'peringatannya menonjol')
  assert(/tidak dihapus dari riwayat/.test(k), 'menenangkan: catatannya tetap ada')

  const bersih = kalimatBatal(req(), [])
  assert(!/⚠️/.test(bersih), 'tanpa risiko, tidak ada peringatan yang dibuat-buat')

  assert(/Permintaan ini/.test(kalimatBatal({ id: 'x', qty: 1, satuan: '' }, [])),
    'tanpa nama pun kalimatnya tetap utuh')
}

// ── 7. Catatan pembatalan membedakannya dari penolakan ──────────────
//
// Statusnya terpaksa memakai 'ditolak' — itu satu-satunya nilai berhenti yang
// diizinkan kolomnya, dan menambah 'dibatalkan' menuntut migrasi yang belum
// tentu dijalankan. Catatan inilah yang membedakan keduanya.
{
  const c = catatanBatal('Jumani', 'barangnya tidak jadi dipakai')
  assert(/^Dibatalkan oleh Jumani/.test(c), 'menyebut siapa yang membatalkan')
  assert(/barangnya tidak jadi dipakai/.test(c), 'sebabnya ikut tercatat')
  assert(/\d{4}-\d{2}-\d{2}/.test(c), 'tanggalnya tercatat')

  assert(/^Dibatalkan oleh pengguna/.test(catatanBatal('', '')), 'tanpa nama tetap terbaca')
  assert(!/: $/.test(catatanBatal('Jumani', '')), 'tanpa sebab tidak meninggalkan titik dua menggantung')
}

console.log(`sunting-permintaan: ${ok} assert lulus`)
