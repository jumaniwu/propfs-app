// ============================================================
// Serah-terima alat kerja: dipinjam kapan, dibalikin kapan.
//
// Modul aset yang sudah ada tahu di mana alat BERADA SEKARANG. Yang tidak
// diketahuinya adalah bagaimana ia sampai di sana — dan itulah yang hilang
// justru ketika alatnya tidak ketemu.
//
// Yang diuji di sini bukan bentuk datanya melainkan keadaan-keadaan yang
// membuat catatan serah-terima tidak berguna: dua peminjaman berjalan atas
// satu alat, pengembalian yang waktunya mendahului peminjamannya, dan
// tanda terima tanpa nama atau tanpa foto — yaitu tanda terima yang tidak
// membuktikan apa pun.
// ============================================================
import {
  masihDipinjam, pinjamanBerjalan, bolehPinjam, siapPinjam, siapKembali,
  lamaHari, terlambat, kondisiMemburuk, keberadaanAlat, riwayatAlat,
  ringkasLacak, kalimatLacak, kondisiSah, LABEL_KONDISI_SERAH, pesanTandaTerima,
} from '../src/lib/lacakAlat.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const HARI = 86_400_000
const KINI = Date.parse('2026-08-28T10:00:00+07:00')
const lalu = (h) => new Date(KINI - h * HARI).toISOString()

const pinjam = (o = {}) => ({
  id: o.id ?? 'p1', aset_id: o.aset_id ?? 'genset',
  pemegang: o.pemegang ?? 'Ujang', pinjam_at: o.pinjam_at ?? lalu(3),
  pinjam_foto: 'data:image/jpeg;base64,x', pinjam_kondisi: 'baik', ...o,
})

// ── 1. `kembali_at` kosong adalah SATU-SATUNYA penentu ──────────────────
//
// Tidak ada medan "status" yang bisa berselisih dengannya. Dua tempat yang
// menyimpan jawaban atas pertanyaan yang sama pasti berselisih suatu hari,
// dan yang berselisih diam-diam lebih buruk daripada yang tidak ada.
{
  assert(masihDipinjam(pinjam()) === true, 'tanpa kembali_at: masih di luar')
  assert(masihDipinjam(pinjam({ kembali_at: lalu(1) })) === false, 'sudah kembali')
  assert(masihDipinjam(pinjam({ kembali_at: '' })) === true,
    'string kosong = belum kembali; kolom yang tidak terisi tidak boleh terbaca sebagai sudah pulang')
  assert(masihDipinjam(pinjam({ kembali_at: '   ' })) === true,
    'spasi saja tetap dianggap belum kembali — bukan "sudah kembali entah kapan"')
  assert(masihDipinjam(null) === false, 'kosong aman')
  assert(masihDipinjam(undefined) === false, 'undefined aman')
}

// ── 2. Alat yang masih dipegang orang tidak boleh dipinjamkan lagi ──────
//
// Dan penolakannya menyebut NAMA pemegangnya. "Alat sedang dipinjam" membuat
// orang bertanya-tanya kepada siapa; menyebut namanya membuatnya bisa
// langsung ditelepon — yang justru satu-satunya hal berguna saat itu.
{
  const daftar = [pinjam({ pemegang: 'Ujang', project_nama: 'Ruko Cimahi' })]
  const tolak = bolehPinjam(daftar, 'genset')
  assert(tolak.boleh === false, 'alat yang masih di luar ditolak')
  assert(/Ujang/.test(tolak.alasan), 'alasannya menyebut nama pemegangnya')
  assert(/Ruko Cimahi/.test(tolak.alasan), 'dan di mana alatnya')

  assert(bolehPinjam(daftar, 'molen').boleh === true, 'alat lain tidak ikut terkunci')
  assert(bolehPinjam([], 'genset').boleh === true, 'belum pernah dipinjam: boleh')
  assert(bolehPinjam([pinjam({ kembali_at: lalu(1) })], 'genset').boleh === true,
    'sudah dikembalikan: boleh dipinjam lagi')
  assert(bolehPinjam(null, 'genset').boleh === true, 'daftar kosong aman')
  assert(bolehPinjam([], '').boleh === true, 'tanpa id: tidak menghalangi')
}

// ── 3. Kalau entah bagaimana ada dua yang berjalan, yang TERBARU dipakai ─
//
// Keadaan ini dicegah indeks unik parsial di database, tetapi kalau ia
// tembus juga, menampilkan yang paling lama akan menunjuk orang yang sudah
// mengembalikan alatnya berminggu-minggu lalu.
{
  const daftar = [
    pinjam({ id: 'lama', pemegang: 'Ujang', pinjam_at: lalu(30) }),
    pinjam({ id: 'baru', pemegang: 'Deden', pinjam_at: lalu(2) }),
  ]
  assert(pinjamanBerjalan(daftar, 'genset').pemegang === 'Deden',
    'yang terakhir dicatat yang paling mungkin benar')
}

// ── 4. Tanda terima tanpa nama atau tanpa foto tidak membuktikan apa pun ─
{
  assert(siapPinjam({}).boleh === false, 'kosong ditolak')
  assert(/[Aa]lat/.test(siapPinjam({}).alasan), 'menyebut yang kurang')

  const tanpaNama = siapPinjam({ aset_id: 'genset', pinjam_at: lalu(0), pinjam_foto: 'x' })
  assert(tanpaNama.boleh === false, 'tanpa nama pemegang: ditolak')
  assert(/hilang|ditagih/i.test(tanpaNama.alasan),
    'alasannya menerangkan AKIBATNYA, bukan cuma "wajib diisi"')

  const tanpaFoto = siapPinjam({ aset_id: 'genset', pemegang: 'Ujang', pinjam_at: lalu(0) })
  assert(tanpaFoto.boleh === false, 'tanpa foto: ditolak')
  assert(/kondisi/i.test(tanpaFoto.alasan), 'alasannya: fotonya bukti kondisi')

  assert(siapPinjam({
    aset_id: 'genset', pemegang: 'Ujang', pinjam_at: lalu(0), pinjam_foto: 'x',
  }).boleh === true, 'lengkap: diterima')
  assert(siapPinjam({
    aset_id: 'genset', pemegang: '   ', pinjam_at: lalu(0), pinjam_foto: 'x',
  }).boleh === false, 'nama berisi spasi saja tetap ditolak')
}

// ── 5. Kembali sebelum dipinjam adalah salah ketik, bukan data ─────────
//
// Selisih waktu negatif membuat "lama pinjam" menjadi angka minus yang
// mengalir ke seluruh ringkasan, dan tidak ada yang tahu dari mana asalnya.
{
  const p = { pinjam_at: lalu(3), kembali_at: lalu(5), kembali_foto: 'x' }
  const hasil = siapKembali(p)
  assert(hasil.boleh === false, 'kembali mendahului pinjam ditolak')
  assert(/lebih awal|Periksa/i.test(hasil.alasan), 'alasannya menunjuk kekeliruannya')

  assert(siapKembali({ pinjam_at: lalu(3), kembali_at: lalu(1) }).boleh === false,
    'tanpa foto pengembalian: ditolak')
  assert(siapKembali({ pinjam_at: lalu(3), kembali_at: lalu(1), kembali_foto: 'x' }).boleh === true,
    'lengkap dan urut: diterima')
}

// ── 6. Lama pinjam: berjalan terus selama belum kembali ────────────────
{
  assert(lamaHari(pinjam({ pinjam_at: lalu(3) }), KINI) === 3, 'masih di luar: sampai sekarang')
  assert(lamaHari(pinjam({ pinjam_at: lalu(10), kembali_at: lalu(4) }), KINI) === 6,
    'sudah kembali: berhenti di tanggal kembalinya, bukan hari ini')
  assert(lamaHari(pinjam({ pinjam_at: lalu(0) }), KINI) === 0, 'hari ini: nol, bukan satu')
  assert(lamaHari({}, KINI) === 0, 'tanpa tanggal aman')
  assert(lamaHari(null, KINI) === 0, 'kosong aman')
}

// ── 7. Tanpa janji kembali, tidak pernah "terlambat" ──────────────────
//
// Menandainya begitu akan membuat setiap alat yang memang dipakai
// berbulan-bulan di proyek panjang tampak seperti masalah — dan peringatan
// yang selalu menyala berhenti dibaca.
{
  assert(terlambat(pinjam({ pinjam_at: lalu(90) }), KINI) === false,
    'dipinjam 90 hari tanpa janji: bukan keterlambatan')
  assert(terlambat(pinjam({ janji_kembali: lalu(2) }), KINI) === true, 'lewat janji')
  assert(terlambat(pinjam({ janji_kembali: new Date(KINI + 5 * HARI).toISOString() }), KINI) === false,
    'janjinya belum sampai')
  assert(terlambat(pinjam({ janji_kembali: lalu(2), kembali_at: lalu(1) }), KINI) === false,
    'sudah kembali: tidak terlambat lagi, meski dulu lewat')
}

// ── 8. Kondisi memburuk — inilah yang jadi perselisihan ───────────────
{
  const p = (a, b) => pinjam({ pinjam_kondisi: a, kembali_kondisi: b, kembali_at: lalu(1) })
  assert(kondisiMemburuk(p('baik', 'rusak')) === true, 'baik → rusak')
  assert(kondisiMemburuk(p('baik', 'perlu_servis')) === true, 'baik → perlu servis')
  assert(kondisiMemburuk(p('rusak', 'rusak')) === false, 'sudah rusak sejak dipinjam: bukan salahnya')
  assert(kondisiMemburuk(p('rusak', 'baik')) === false, 'diperbaiki: jelas bukan memburuk')
  assert(kondisiMemburuk(pinjam({ pinjam_kondisi: 'baik' })) === false,
    'belum kembali: belum bisa dibandingkan')
}

// ── 9. Keberadaan alat menyebut ORANG lebih dulu ──────────────────────
//
// Ketika alat dicari, yang ditelepon orangnya. Proyek tidak mengangkat
// telepon.
{
  assert(keberadaanAlat([], 'genset', KINI) === 'Di gudang', 'tidak dipinjam: di gudang')

  const kal = keberadaanAlat([pinjam({ pemegang: 'Ujang', project_nama: 'Ruko Cimahi' })], 'genset', KINI)
  assert(kal.indexOf('Ujang') < kal.indexOf('Ruko Cimahi'), 'nama orang lebih dulu daripada proyek')
  assert(/3 hari/.test(kal), 'menyebut sudah berapa lama')

  const telat = keberadaanAlat([pinjam({ janji_kembali: lalu(5) })], 'genset', KINI)
  assert(/LEWAT JANJI/.test(telat), 'yang lewat janji ditandai terang-terangan')

  assert(/hari ini/.test(keberadaanAlat([pinjam({ pinjam_at: lalu(0) })], 'genset', KINI)),
    'baru hari ini: "hari ini", bukan "0 hari"')
}

// ── 10. Riwayat: terbaru lebih dulu, dan hanya alat yang diminta ──────
{
  const daftar = [
    pinjam({ id: 'a', pinjam_at: lalu(30), kembali_at: lalu(28) }),
    pinjam({ id: 'b', pinjam_at: lalu(5), kembali_at: lalu(4) }),
    pinjam({ id: 'c', aset_id: 'molen', pinjam_at: lalu(1) }),
  ]
  const r = riwayatAlat(daftar, 'genset')
  assert(r.length === 2, 'alat lain tidak ikut')
  assert(r[0].id === 'b', 'terbaru lebih dulu')
  assert(riwayatAlat(daftar, '').length === 0, 'tanpa id: kosong')
}

// ── 11. Ringkasan menyebut yang mendesak lebih dulu ───────────────────
{
  const daftar = [
    pinjam({ id: 'a', aset_id: 'genset', janji_kembali: lalu(3) }),
    pinjam({ id: 'b', aset_id: 'molen' }),
    pinjam({ id: 'c', aset_id: 'las', kembali_at: lalu(1),
      pinjam_kondisi: 'baik', kembali_kondisi: 'rusak' }),
  ]
  const r = ringkasLacak(daftar, KINI)
  assert(r.diLuar === 2, 'dua alat di luar')
  assert(r.terlambat === 1, 'satu lewat janji')
  assert(r.rusakSaatKembali === 1, 'satu pulang dalam keadaan lebih buruk')

  const kal = kalimatLacak(r)
  assert(/2 alat di luar/.test(kal) && /1 lewat janji/.test(kal), 'keduanya disebut')
  assert(kalimatLacak(ringkasLacak([], KINI)) === 'Semua alat ada di gudang',
    'tidak ada yang di luar: kalimatnya menenangkan, bukan "0 alat di luar"')
  assert(typeof kalimatLacak(null) === 'string', 'kosong aman')
}

// ── 12. Kondisi yang tidak dikenal jatuh ke 'baik', bukan ke undefined ─
{
  assert(kondisiSah('rusak') === 'rusak', 'dikenal')
  assert(kondisiSah('PERLU_SERVIS') === 'perlu_servis', 'huruf besar tetap dikenali')
  assert(kondisiSah('entah') === 'baik', 'tak dikenal: baik')
  assert(kondisiSah(null) === 'baik', 'kosong: baik')
  assert(Object.keys(LABEL_KONDISI_SERAH).length === 3, 'tiga kondisi, tidak lebih')
}

// ── 13. Tanda terima yang bisa dikirim ────────────────────────────────
//
// Seluruh serah-terima alat sudah berlangsung di WhatsApp sejak dulu; yang
// tidak ada hanya bentuk bakunya, sehingga yang tersimpan di riwayat obrolan
// adalah "genset dibawa dulu ya pak" — tanpa tanggal, tanpa kondisi, tanpa
// nama lengkap.
{
  const p = pinjam({
    aset_nama: 'Genset 5000W', pemegang: 'Ujang Supriadi',
    project_nama: 'Ruko Cimahi', pinjam_kondisi: 'baik',
  })
  const t = pesanTandaTerima(p)
  assert(/Genset 5000W/.test(t), 'menyebut alatnya')
  assert(/Ujang Supriadi/.test(t), 'menyebut yang memegang')
  assert(/Ruko Cimahi/.test(t), 'menyebut lokasinya')
  assert(/kondisi baik/.test(t), 'menyebut kondisi saat diserahkan')
  assert(!/undefined|null|NaN|Invalid/.test(t), 'tidak membocorkan nilai kosong')
  assert(!/Janji kembali/.test(t),
    'tanpa janji: barisnya tidak ditulis sama sekali, bukan "Janji kembali: -" '
    + 'yang membuat tanda terimanya tampak belum selesai')

  const pulang = pesanTandaTerima(pinjam({
    aset_nama: 'Genset 5000W', kembali_at: lalu(1),
    pinjam_kondisi: 'baik', kembali_kondisi: 'rusak',
  }))
  assert(/SUDAH KEMBALI/.test(pulang), 'yang sudah kembali dibedakan judulnya')
  assert(/Dikembalikan:/.test(pulang), 'menyebut kapan kembalinya')
  assert(/menurun/i.test(pulang), 'kondisi yang memburuk disebut terang-terangan — '
    + 'inilah yang jadi perselisihan')

  assert(pesanTandaTerima(null) === '', 'kosong aman')
  assert(!/NaN|Invalid/.test(pesanTandaTerima({ pinjam_at: 'ngawur', pemegang: 'X' })),
    'tanggal rusak tidak menghasilkan NaN di pesan yang dikirim ke orang')
}

console.log(`lacak-alat: ${ok} assert lulus`)
