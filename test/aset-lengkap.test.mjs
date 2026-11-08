// ============================================================
// Nomor aset, foto alat, dan kelengkapan yang diperiksa saat kembali.
//
// Lima gerinda bermerek sama — 008/NBI/XI/26, 009/NBI/XI/26, 010/NBI/XI/26 —
// hanya bisa dibedakan dari nomor yang tertulis di badannya. Yang diuji:
//
//   1. Nomor aset dirapikan, diusulkan, dan tidak boleh kembar.
//   2. Alat baru wajib bernomor dan berfoto.
//   3. Kelengkapan: yang diserahkan tetapi tidak kembali tercatat KURANG,
//      atas nama peminjamnya — dan tidak dibebankan ke peminjam berikutnya.
//   4. Migrasinya hanya menambah, dan aplikasi memakai kolom-kolomnya.
// ============================================================
import { readFileSync } from 'node:fs'
import {
  normalNomorAset, uraiNomorAset, romawi, singkatanDariNama, usulNomorAset, nomorAsetKembar,
  siapIdentitasAset, siapSimpanAset, normalKelengkapan, cocokCari, kurangDataAset, ASET_KOSONG,
} from '../src/lib/asetAlat.ts'
import {
  kelengkapanKurang, kembaliBermasalah, masalahKembali, siapKembali, pengembalianTerakhir,
  kelengkapanSiapSerah, pesanTandaTerima, saringanAlat, ringkasLacak, LABEL_SARINGAN,
} from '../src/lib/lacakAlat.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const baca = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const tanpaKomentar = t => t.split('\n').filter(b => !/^\s*(\/\/|\*|\/\*|--)/.test(b)).join('\n')

const FOTO = 'data:image/jpeg;base64,x'
const gerinda = (id, kode, o = {}) => ({
  ...ASET_KOSONG, id, kode, nama: 'Gerinda 4 inch', merek: 'Krisbow', foto: FOTO,
  tanggal_beli: '2026-11-01', harga: 450_000, created_at: '2026-11-05T08:00:00Z', ...o,
})
const TIGA = [
  gerinda('g8', '008/NBI/XI/26', { created_at: '2026-11-02T08:00:00Z' }),
  gerinda('g9', '009/NBI/XI/26', { created_at: '2026-11-03T08:00:00Z' }),
  gerinda('g0', '010/NBI/XI/26', { created_at: '2026-11-04T08:00:00Z' }),
]

// ── 1. Nomor aset ────────────────────────────────────────────────────
{
  assert(normalNomorAset(' 008 / nbi / xi / 26 ') === '008/NBI/XI/26', 'spasi & huruf kecil dirapikan')
  assert(normalNomorAset('a   b') === 'A B', 'spasi ganda dirapatkan')
  assert(normalNomorAset(null) === '' && normalNomorAset(undefined) === '', 'kosong tetap kosong')

  const u = uraiNomorAset('008/nbi/xi/26')
  assert(u && u.urut === 8 && u.singkatan === 'NBI' && u.bulan === 'XI' && u.tahun === '26', 'nomor baku terurai')
  for (const salah of ['GEN-01', '008/NBI/XIII/26', '008/NBI/XI/2026', 'NBI/008/XI/26', '', '008//XI/26']) {
    assert(uraiNomorAset(salah) === null, `bukan pola baku: ${salah}`)
  }
  assert(Array.from({ length: 12 }, (_, i) => romawi(i + 1)).join(',') === 'I,II,III,IV,V,VI,VII,VIII,IX,X,XI,XII', 'bulan romawi')
  assert(romawi(0) === '' && romawi(13) === '', 'bulan di luar 1–12 kosong')

  assert(singkatanDariNama('PT Nusa Bangun Indah') === 'NBI', 'singkatan tanpa PT')
  assert(singkatanDariNama('CV. Maju Jaya') === 'MJ', 'singkatan tanpa CV')
  assert(singkatanDariNama('') === 'AST' && singkatanDariNama(null) === 'AST', 'tanpa nama: AST')

  assert(usulNomorAset([], { singkatan: 'NBI', tanggal: '2026-11-08' }) === '001/NBI/XI/26', 'alat pertama: 001')
  assert(usulNomorAset(TIGA, { singkatan: 'XYZ', tanggal: '2026-11-08' }) === '011/NBI/XI/26',
    'melanjutkan nomor terbesar, singkatan mengikuti nomor yang sudah ada')
  assert(usulNomorAset(TIGA, { tanggal: '2026-12-02' }) === '011/NBI/XII/26', 'bulan mengikuti tanggal beli — urut tidak mulai ulang')
  assert(usulNomorAset(TIGA, { tanggal: '2027-01-05' }) === '011/NBI/I/27', 'ganti tahun')
  assert(usulNomorAset([...TIGA, gerinda('g5', 'GEN-01')], { tanggal: '2026-11-08' }) === '011/NBI/XI/26',
    'nomor bentuk lain tidak mengganggu usulan')
  assert(usulNomorAset([gerinda('g1', '005/ABC/X/26', { created_at: '2026-10-01' }), gerinda('g2', '002/NBI/XI/26', { created_at: '2026-11-02' })],
    { tanggal: '2026-11-08' }) === '003/NBI/XI/26', 'singkatan dari alat yang terakhir dicatat')

  const tz = process.env.TZ
  for (const z of ['America/New_York', 'Asia/Jakarta', 'Pacific/Kiritimati']) {
    process.env.TZ = z
    assert(usulNomorAset([], { singkatan: 'NBI', tanggal: '2026-11-01' }) === '001/NBI/XI/26',
      `tanggal 1 November tetap XI di zona ${z}`)
  }
  process.env.TZ = tz

  assert(nomorAsetKembar(TIGA, ' 009 / nbi / xi / 26')?.id === 'g9', 'kembar terdeteksi walau beda spasi & huruf')
  assert(nomorAsetKembar(TIGA, '009/NBI/XI/26', 'g9') === undefined, 'alat itu sendiri tidak dihitung kembar')
  assert(nomorAsetKembar(TIGA, '') === undefined, 'nomor kosong tidak kembar dengan apa pun')
  const dilepas = [...TIGA, gerinda('g7', '007/NBI/XI/26', { dilepas_at: '2026-11-05' })]
  assert(nomorAsetKembar(dilepas, '007/NBI/XI/26')?.id === 'g7', 'nomor alat yang sudah dilepas tidak boleh dipakai ulang')
}

// ── 2. Alat baru wajib bernomor & berfoto ────────────────────────────
{
  const baru = gerinda(undefined, '011/NBI/XI/26')
  delete baru.id
  assert(siapSimpanAset(baru, TIGA).boleh, 'alat lengkap boleh disimpan')
  let r = siapSimpanAset({ ...baru, kode: '  ' }, TIGA)
  assert(!r.boleh && /Nomor aset/.test(r.alasan), 'tanpa nomor aset ditolak')
  r = siapSimpanAset({ ...baru, kode: '010/nbi/xi/26' }, TIGA)
  assert(!r.boleh && /sudah dipakai/.test(r.alasan) && /010\/NBI\/XI\/26/.test(r.alasan), 'nomor kembar ditolak dan disebut')
  r = siapSimpanAset({ ...baru, foto: '' }, TIGA)
  assert(!r.boleh && /foto/i.test(r.alasan), 'tanpa foto ditolak')
  r = siapSimpanAset({ ...baru, nama: '' }, TIGA)
  assert(!r.boleh && /Nama/.test(r.alasan), 'nama tetap diperiksa pertama')
  r = siapSimpanAset({ ...baru, harga: 0 }, TIGA)
  assert(!r.boleh && /Harga/.test(r.alasan), 'aturan harga lama tetap berlaku')
  assert(siapIdentitasAset({ ...TIGA[1] }, TIGA).boleh, 'melengkapi alat sendiri: nomornya bukan kembar')
  assert(siapIdentitasAset({ ...TIGA[1], kode: '008/NBI/XI/26' }, TIGA).boleh === false, 'mengganti ke nomor alat lain ditolak')

  assert(kurangDataAset({ kode: '', foto: '' }).join() === 'nomor aset,foto', 'data lama: kurang nomor & foto')
  assert(kurangDataAset(TIGA[0]).length === 0, 'alat lengkap tidak kurang apa pun')
  assert(ASET_KOSONG.foto === '' && Array.isArray(ASET_KOSONG.kelengkapan), 'formulir kosong punya foto & kelengkapan')
}

// ── 3. Kelengkapan ───────────────────────────────────────────────────
{
  assert(normalKelengkapan([' Cover  pelindung ', 'cover pelindung', '', 'Kunci']).join('|') === 'Cover pelindung|Kunci',
    'rapi & tanpa kembar')
  assert(normalKelengkapan('Kabel, Kunci\nCover').join('|') === 'Kabel|Kunci|Cover', 'teks berpisah koma/baris terbaca')
  assert(normalKelengkapan(Array.from({ length: 30 }, (_, i) => `b${i}`)).length === 20, 'paling banyak 20 butir')
  assert(normalKelengkapan(['x'.repeat(100)])[0].length === 60, 'butir dipotong 60 huruf')
  assert(normalKelengkapan(null).length === 0 && normalKelengkapan(undefined).length === 0, 'kosong aman')

  assert(cocokCari(TIGA[1], '009') && !cocokCari(TIGA[0], '009'), 'cari lewat nomor aset')
  assert(cocokCari(TIGA[1], 'gerinda krisbow') && cocokCari(TIGA[1], '') && !cocokCari(TIGA[1], 'genset'), 'cari lewat nama & merek')

  const IKUT = ['Kabel power', 'Cover pelindung', 'Kunci']
  const p = (o = {}) => ({
    id: 'p1', aset_id: 'g8', aset_nama: 'Gerinda 4 inch', aset_kode: '008/NBI/XI/26', pemegang: 'Budi',
    pemegang_hp: '0812', project_nama: 'Ruko Pak Soni', pinjam_at: '2026-11-03T08:00:00+07:00',
    pinjam_kondisi: 'baik', pinjam_foto: FOTO, pinjam_kelengkapan: IKUT, ...o,
  })
  const kembali = (o = {}) => p({
    kembali_at: '2026-11-08T16:00:00+07:00', kembali_foto: FOTO, kembali_kondisi: 'baik',
    kembali_kelengkapan: IKUT, ...o,
  })

  assert(kelengkapanKurang(p()).length === 0, 'masih dipinjam: belum ada yang kurang')
  assert(kelengkapanKurang(kembali()).length === 0 && !kembaliBermasalah(kembali()), 'kembali lengkap & baik: tidak bermasalah')
  const kurang = kembali({ kembali_kelengkapan: ['kabel POWER', 'Kunci'] })
  assert(kelengkapanKurang(kurang).join() === 'Cover pelindung', 'yang tidak kembali tercatat kurang (huruf besar-kecil diabaikan)')
  assert(kembaliBermasalah(kurang) && /Kurang: Cover pelindung/.test(masalahKembali(kurang)), 'kurang = bermasalah, disebut namanya')
  const rusak = kembali({ kembali_kondisi: 'rusak' })
  assert(kembaliBermasalah(rusak) && /baik → rusak/.test(masalahKembali(rusak)), 'kondisi menurun = bermasalah')
  assert(!kembaliBermasalah(kembali({ pinjam_kondisi: 'rusak', kembali_kondisi: 'rusak' })), 'sudah rusak sejak dipinjam: bukan salah peminjam')
  const lama = { aset_id: 'g8', pemegang: 'Ujang', pinjam_at: '2026-10-01', kembali_at: '2026-10-02' }
  assert(kelengkapanKurang(lama).length === 0 && !kembaliBermasalah(lama), 'catatan lama tanpa daftar kelengkapan tidak pernah "kurang"')

  // Catatan wajib bila bermasalah.
  let r = siapKembali({ ...kurang, kembali_catatan: '' })
  assert(!r.boleh && /Cover pelindung/.test(r.alasan), 'ada yang kurang: catatan wajib, butirnya disebut')
  assert(siapKembali({ ...kurang, kembali_catatan: 'Cover patah di lokasi' }).boleh, 'dengan catatan: boleh')
  r = siapKembali({ ...rusak, kembali_catatan: ' ' })
  assert(!r.boleh && /catatan/i.test(r.alasan), 'rusak: catatan wajib')
  assert(siapKembali(kembali()).boleh, 'lengkap & baik: catatan tidak wajib')
  assert(!siapKembali({ ...kembali(), kembali_foto: '' }).boleh, 'foto kembali tetap wajib')

  // Peminjam berikutnya tidak menanggung yang sudah hilang.
  const riwayat = [kurang, p({ id: 'p0', pinjam_at: '2026-10-01T08:00:00+07:00', kembali_at: '2026-10-02T08:00:00+07:00',
    kembali_kelengkapan: IKUT })]
  assert(pengembalianTerakhir(riwayat, 'g8')?.id === 'p1', 'pengembalian terakhir = yang terbaru')
  assert(kelengkapanSiapSerah(IKUT, riwayat, 'g8').join('|') === 'Kabel power|Kunci',
    'yang hilang terakhir kali tidak dicentang untuk peminjam berikutnya')
  assert(kelengkapanSiapSerah(IKUT, [], 'g8').length === 3, 'tanpa riwayat: semua dicentang')

  const tt = pesanTandaTerima(p())
  assert(/Alat: Gerinda 4 inch \(No\. 008\/NBI\/XI\/26\)/.test(tt), 'tanda terima menyebut nomor aset')
  assert(/Kelengkapan: Kabel power, Cover pelindung, Kunci/.test(tt), 'tanda terima menyebut kelengkapan')
  assert(/KURANG: Cover pelindung/.test(pesanTandaTerima({ ...kurang, kembali_catatan: 'patah' })), 'tanda terima kembali menyebut yang kurang')
  assert(!/KURANG/.test(pesanTandaTerima(kembali())), 'yang lengkap tidak menyebut kurang')

  // Saringan daftar.
  const daftar = [kurang]
  assert(saringanAlat(TIGA[0], daftar).join() === 'semua,gudang,cek', 'kembali kurang: di gudang & perlu dicek')
  assert(saringanAlat(TIGA[1], [p({ id: 'p9', aset_id: 'g9' })]).join() === 'semua,dipinjam', 'sedang dipinjam')
  assert(saringanAlat(TIGA[2], []).join() === 'semua,gudang', 'di gudang, tidak ada masalah')
  assert(saringanAlat({ ...TIGA[2], foto: '' }, []).includes('cek'), 'tanpa foto: perlu dicek')
  assert(saringanAlat({ ...TIGA[2], kondisi: 'perlu_servis' }, []).includes('cek'), 'perlu servis: perlu dicek')
  assert(saringanAlat(TIGA[1], [p({ id: 'p9', aset_id: 'g9', janji_kembali: '2026-11-04' })], Date.parse('2026-11-08')).includes('cek'),
    'lewat janji kembali: perlu dicek')
  assert(saringanAlat({ ...TIGA[2], dilepas_at: '2026-11-05' }, []).join() === 'semua', 'yang sudah dilepas hanya di "Semua"')
  assert(Object.keys(LABEL_SARINGAN).join() === 'semua,dipinjam,gudang,cek', 'empat saringan')
  assert(ringkasLacak([kurang, rusak, kembali()]).bermasalah === 2, 'ringkasan menghitung pengembalian bermasalah')
}

// ── 4. Migrasi & pemakaiannya ────────────────────────────────────────
{
  const sql = baca('supabase/migrations/migration_aset_lengkap.sql')
  const kode = tanpaKomentar(sql)
  for (const k of ['aset_alat\n  add column if not exists foto', 'aset_alat\n  add column if not exists kelengkapan',
    'aset_pinjam\n  add column if not exists aset_kode', 'aset_pinjam\n  add column if not exists pinjam_kelengkapan',
    'aset_pinjam\n  add column if not exists kembali_kelengkapan']) {
    assert(kode.includes(k), `migrasi menambah ${k.split(' ').pop()}`)
  }
  assert(!/\b(delete\s+from|truncate|drop\s+table|drop\s+column|update\s+public\.|insert\s+into)\b/i.test(kode),
    'migrasi tidak menghapus atau mengubah data')
  assert(/if kembar is not null then\s+raise notice/.test(kode) && /create unique index aset_alat_nomor_unik/.test(kode),
    'indeks nomor unik hanya dibuat bila belum ada yang kembar — migrasi tidak gagal karena data lama')
  assert(/migration_aset_lengkap\.sql/.test(baca('supabase/migrations/CEK_MIGRASI.sql')), 'CEK_MIGRASI mengenali migrasinya')

  const form = tanpaKomentar(baca('src/components/cost/FormAset.tsx'))
  assert(/<AmbilFoto/.test(form) && /downscaleWithStamp\(/.test(form), 'formulir mengambil foto bercap')
  assert(/data-aset-kode/.test(form) && /usulNomorAset/.test(form) && /nomorAsetKembar/.test(form), 'formulir nomor aset: usulan & cek kembar')
  assert(/siapIdentitasAset/.test(form), 'mode lengkapi memeriksa identitas')

  const panel = tanpaKomentar(baca('src/components/cost/SubNonProyek.tsx'))
  const ubahIdentitas = panel.slice(panel.indexOf("await asetApi().ubah(d.id, {"), panel.indexOf("toast({ title: 'Data alat diperbarui'"))
  assert(ubahIdentitas.length > 0 && !/harga|tanggal_beli|umur_bulan|nilai_residu/.test(ubahIdentitas),
    'melengkapi data tidak mengubah angka penyusutan')
  assert(/cocokCari\(a, cari\)/.test(panel) && /saringanAlat\(a, pinjaman\)/.test(panel), 'daftar bisa dicari & disaring')

  const serah = tanpaKomentar(baca('src/components/cost/SerahAlat.tsx'))
  for (const k of ['aset_kode:', 'pinjam_kelengkapan:', 'kembali_kelengkapan:', 'pinjam_oleh:', 'kembali_oleh:']) {
    assert(serah.includes(k), `serah-terima menyimpan ${k.replace(':', '')}`)
  }
  assert(/kelengkapanSiapSerah\(/.test(serah) && /kelengkapanKurang\(/.test(serah), 'centang bawaan & kurang dihitung')

  const kartu = tanpaKomentar(baca('src/components/cost/KartuAset.tsx'))
  assert(/berjalan\.pemegang/.test(kartu) && /berjalan\.project_nama/.test(kartu) && /tanggalJam\(berjalan\.pinjam_at\)/.test(kartu),
    'kartu menampilkan siapa, proyek mana, sejak kapan')
  assert(/masalahKembali\(masalah\)/.test(kartu), 'kartu menampilkan masalah pengembalian terakhir')
  assert(/bolehUbah && !a\.kode && !berjalan/.test(kartu),
    'alat lama tanpa nomor yang sedang dipinjam tetap bisa dicatat kembali')

  assert(/migration_aset_lengkap\.sql/.test(baca('src/lib/asetApi.ts')) && /migration_aset_lengkap\.sql/.test(baca('src/lib/asetPinjamApi.ts')),
    'kolom yang belum ada dijelaskan dengan nama migrasinya')
}

console.log(`aset-lengkap: ${ok} pemeriksaan lolos`)
