// ============================================================
// Dua cacat yang bertemu di satu tempat: daftar pekerja yang tidak lengkap.
//
// ── 1. Upah tersimpan, rekapnya tetap nol ──────────────────────────────
//
// Upah Mario diisi lewat rekap, server menjawab berhasil ("Upah diperbarui:
// Rp 130.000/hari"), dan barisnya TETAP berbunyi "upah belum diisi" Rp 0.
//
// Rekap upah membaca daftar pekerja lewat field_workers_by_token, yang
// menyaring `where w.aktif`. Yang sudah dinonaktifkan tidak terbaca, jadi
// tarifnya tidak ditemukan dan jatuh ke nol — berapa kali pun diperbarui,
// tanpa satu pun galat.
//
// Itu bertentangan dengan alasan kolom `aktif` dibuat, yang tertulis di
// migrasinya sendiri: absensi yang sudah lewat masih harus bisa dibaca DAN
// DIBAYAR.
//
// ── 2. Pekerja terkunci di satu proyek ─────────────────────────────────
//
// Tukang berpindah proyek di tengah bulan — kejadian biasa. Memindahkannya
// dengan mengubah log_id akan MENGHANGUSKAN gaji proyek lama: absensi lama
// menunjuk id itu, dan begitu barisnya pindah buku, rekap proyek lama tidak
// menemukannya lagi. Karena itu pemindahan MENYALIN, bukan memindahkan.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rekapUpahMingguan } from '../src/lib/pekerjaLapangan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const akarSql = new URL('../supabase/migrations', import.meta.url).pathname
const akarSrc = new URL('../src', import.meta.url).pathname
const tanpaKomentarSql = t => t.split('\n').filter(b => !b.trim().startsWith('--')).join('\n')
const tanpaKomentarTs = t => t.split('\n')
  .filter(b => { const x = b.trim(); return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*') })
  .join('\n')

const pekerja = (o) => ({
  id: o.id, nama: o.nama, peran: '', no_hp: '', jenis: o.jenis ?? 'harian',
  upah_harian: o.upah ?? 0, foto: '', aktif: o.aktif ?? true, catatan: '',
})
const hari = (tgl, absensi) => ({ tanggal: tgl, absensi })

// ── 1. Tarif orang nonaktif tetap terhitung bila ia ada di daftar ───
{
  const laporan = [hari('2026-09-07', [{ pekerja_id: 'w-mario', nama: 'Mario', status: 'hadir' }])]

  // Daftar LENGKAP (termasuk nonaktif) — upahnya terhitung.
  const lengkap = rekapUpahMingguan(laporan, [pekerja({ id: 'w-mario', nama: 'Mario', upah: 130000, aktif: false })])
  assert(lengkap[0].baris[0].upahHarian === 130000, 'tarif orang nonaktif ikut terbaca')
  assert(lengkap[0].baris[0].upah === 130000, 'dan upahnya benar-benar dihitung')

  // Daftar yang menyaring yang aktif saja — inilah gejala yang dilaporkan.
  const disaring = rekapUpahMingguan(laporan, [])
  assert(disaring[0].baris[0].upahHarian === 0, 'tanpa daftar lengkap, tarifnya nol — persis gejalanya')
  assert(disaring[0].baris[0].upah === 0, 'dan upahnya nol')
}

// ── 2. sumberId: baris mana yang benar-benar memasok tarifnya ───────
//
// Tanpa ini, penyuntingan memakai `pekerja_id` mentah dari absensi — yang bisa
// menunjuk baris lain, atau tidak ada sama sekali. Server menjawab berhasil,
// dan rekapnya tidak berubah sedikit pun.
{
  // Absensi lama tanpa pekerja_id; tarif ditemukan lewat kecocokan NAMA.
  const lewatNama = rekapUpahMingguan(
    [hari('2026-09-07', [{ nama: 'Mario', status: 'hadir' }])],
    [pekerja({ id: 'w-mario', nama: 'Mario', upah: 130000 })],
  )
  assert(lewatNama[0].baris[0].pekerja_id === '', 'absensinya memang tidak punya id')
  assert(lewatNama[0].baris[0].sumberId === 'w-mario',
    'sumberId menunjuk baris yang memasok tarifnya, walau absensinya tanpa id')
  assert(lewatNama[0].baris[0].upahHarian === 130000, 'tarifnya tetap ketemu lewat nama')

  // Orang yang sama sekali tidak terdaftar: tidak ada yang bisa disunting.
  const asing = rekapUpahMingguan(
    [hari('2026-09-07', [{ pekerja_id: 'w-hantu', nama: 'Randi', status: 'hadir' }])], [])
  assert(asing[0].baris[0].sumberId === '', 'tanpa sumber, sumberId kosong — tombol suntingnya tidak ditawarkan')
  assert(asing[0].baris[0].pekerja_id === 'w-hantu', 'pekerja_id mentahnya tetap disimpan apa adanya')
}

// ── 3. Migrasi: daftar lengkap TIDAK menggantikan daftar aktif ──────
//
// Halaman absensi mandor harus tetap menawarkan yang aktif saja. Orang yang
// sudah berhenti tidak boleh muncul di daftar centang hari ini.
{
  const sql = tanpaKomentarSql(readFileSync(join(akarSql, 'migration_pekerja_pindah.sql'), 'utf8'))
  assert(/create or replace function public\.field_workers_semua_by_token/.test(sql), 'ada fungsi daftar lengkap')
  assert(!/field_workers_by_token/.test(sql), 'fungsi lama tidak disentuh sama sekali')

  const lama = readFileSync(join(akarSql, 'migration_pekerja_lapangan.sql'), 'utf8')
  assert(/from field_workers w[\s\S]{0,200}and w\.aktif/.test(lama), 'daftar absen harian tetap menyaring yang aktif')
}

// ── 4. Pemindahan MENYALIN, dan gaji proyek lama tidak hangus ───────
{
  const sql = tanpaKomentarSql(readFileSync(join(akarSql, 'migration_pekerja_pindah.sql'), 'utf8'))
  assert(/insert into field_workers \(log_id, nama/.test(sql), 'baris baru dibuat di proyek tujuan')
  assert(!/update field_workers set log_id/.test(sql),
    'log_id baris lama TIDAK pernah dipindahkan — itu yang menghanguskan gaji proyek lama')
  assert(!/delete\s+from\s+field_workers/i.test(sql), 'tidak ada baris pekerja yang dihapus')
  assert(/set aktif = false where id = p_id and log_id = v_asal/.test(sql),
    'baris asal hanya dinonaktifkan, dan hanya di buku asalnya')

  assert(/v_pemilik_asal is distinct from v_pemilik_tujuan/.test(sql),
    'lintas perusahaan ditolak — nama, no HP, dan TARIF tidak bocor')
  assert(/v_asal = v_tujuan/.test(sql), 'asal = tujuan ditolak')
  assert(/lower\(btrim\(nama\)\) = lower\(btrim\(w\.nama\)\)/.test(sql),
    'dipanggil dua kali tidak melahirkan orang kedua — sinyal lambat itu biasa di lapangan')
  assert(/to authenticated;/.test(sql) && !/field_worker_pindah\(text, uuid, text, boolean\) to anon/.test(sql),
    'pemindahan hanya untuk yang sudah login, tidak pernah lewat token publik')
}

// ── 5. Layarnya memakai semuanya ────────────────────────────────────
{
  const fr = tanpaKomentarTs(readFileSync(join(akarSrc, 'lib/fieldReports.ts'), 'utf8'))
  assert(/field_workers_semua_by_token/.test(fr), 'API punya daftar lengkap')
  assert(/field_worker_pindah/.test(fr), 'API punya pemindahan')

  const tab = tanpaKomentarTs(readFileSync(join(akarSrc, 'components/cost/TabLaporanLapangan.tsx'), 'utf8'))
  assert(/listPekerjaSemua\(log\.report_token\)/.test(tab), 'rekap kantor memakai daftar lengkap')
  assert(!/listPekerja\(log\.report_token\)/.test(tab), 'dan tidak lagi memakai yang menyaring aktif saja')
  assert(/pindahPekerja\(openLog\.report_token/.test(tab), 'pemindahan dipanggil dengan token asal')
  assert(/TIDAK hilang/.test(tab), 'konfirmasinya menyebut apa yang TIDAK hilang')

  const panel = tanpaKomentarTs(readFileSync(join(akarSrc, 'components/cost/PanelRekapAbsensi.tsx'), 'utf8'))
  assert(/const idSunting = baris\.sumberId/.test(panel), 'penyuntingan memakai sumberId')
  assert(/ubahUpah\(token, idSunting/.test(panel), 'dan mengirimnya ke server')
  assert(!/ubahUpah\(token, baris\.pekerja_id/.test(panel), 'pekerja_id mentah tidak lagi dipakai menyunting')
}

console.log(`pekerja-pindah: ${ok} assert lulus`)
