// ============================================================
// Buku laporan yang kembar harus bisa digabungkan — bukan dihapus.
//
// Proyek Pak Soni berakhir dengan TIGA buku laporan. Isinya terpisah: tiap
// buku punya link pekerjanya sendiri, dan mandor yang menerima link berbeda
// mengisi ke buku berbeda. Tidak ada satu layar pun yang menampilkan
// keseluruhannya, dan rekap absensi — yang dipakai menghitung upah — hanya
// membaca satu buku.
//
// Buku lama yang "hilang" punya sebab yang sama sumbernya: keempat tabel
// yang menempel pada sebuah buku (laporan, pemakaian material, permintaan
// material, daftar pekerja) `on delete cascade`. Menghapus buku yang kembar
// tidak merapikan apa pun — ia menghanguskan isinya.
//
// Jadi yang diuji di sini: kembarnya ketahuan, buku yang dipertahankan
// dipilih dengan alasan, penggabungan yang tidak masuk akal ditolak sebelum
// dikerjakan, dan kalimat konfirmasinya menyebut apa yang HILANG.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  cariKembar, usulanTarget, rencanaGabung, kalimatGabung,
} from '../src/lib/gabungBuku.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Tiga buku untuk satu proyek ketahuan sebagai satu kelompok ───
{
  const k = cariKembar([
    { id: 'a', project_name: 'Ruko Pak Soni', created_at: '2026-01-01', jumlahLaporan: 4 },
    { id: 'b', project_name: 'Ruko Pak Soni', created_at: '2026-02-01', jumlahLaporan: 9 },
    { id: 'c', project_name: 'Ruko Pak Soni', created_at: '2026-03-01', jumlahLaporan: 1 },
    { id: 'd', project_name: 'Noble Cove', created_at: '2026-01-01', jumlahLaporan: 7 },
  ])
  assert(k.length === 1, 'hanya satu kelompok kembar')
  assert(k[0].buku.length === 3, 'ketiga bukunya masuk')
  assert(!k.some(g => g.buku.some(b => b.id === 'd')), 'proyek lain tidak ikut terseret')
}

// ── 2. Beda huruf besar & spasi tetap dianggap proyek yang sama ─────
//
// "Ruko Pak Soni" dan "ruko pak soni " lahir dari dua orang yang mengetik
// nama yang sama. Memperlakukannya sebagai dua proyek justru itulah yang
// membuat kembarnya tidak pernah ketahuan.
{
  const k = cariKembar([
    { id: 'a', project_name: 'Ruko Pak Soni', jumlahLaporan: 2 },
    { id: 'b', project_name: 'ruko pak soni ', jumlahLaporan: 1 },
    { id: 'c', project_name: '  RUKO PAK SONI', jumlahLaporan: 1 },
  ])
  assert(k.length === 1 && k[0].buku.length === 3, 'ketiganya satu kelompok')
  assert(k[0].nama === 'Ruko Pak Soni', 'namanya ditampilkan apa adanya dari buku pertama')
}

// ── 3. Buku TANPA nama proyek tidak pernah dianggap kembar ──────────
//
// Kita tidak tahu ia milik proyek mana. Menebaknya berarti menggabungkan
// laporan dua proyek yang berbeda, dan tidak ada tombol urung sesudahnya.
{
  const k = cariKembar([
    { id: 'a', project_name: '', jumlahLaporan: 3 },
    { id: 'b', project_name: '   ', jumlahLaporan: 2 },
    { id: 'c', project_name: null, jumlahLaporan: 1 },
    { id: 'd', jumlahLaporan: 1 },
  ])
  assert(k.length === 0, 'buku tanpa nama tidak digabungkan dengan apa pun')
}

// ── 4. Satu proyek satu buku bukan masalah ──────────────────────────
{
  assert(cariKembar([{ id: 'a', project_name: 'Noble Cove' }]).length === 0, 'satu buku bukan kembar')
  assert(cariKembar([]).length === 0, 'daftar kosong aman')
  assert(cariKembar(null).length === 0, 'null aman')
  assert(cariKembar([{ id: '', project_name: 'X' }, { id: '', project_name: 'X' }]).length === 0,
    'buku tanpa id diabaikan, bukan digabungkan secara buta')
}

// ── 5. Yang disarankan dipertahankan: paling banyak isinya ──────────
//
// Itu buku yang linknya paling lama beredar dan paling banyak dipakai —
// paling murah dipertahankan, karena link buku yang digabungkan berhenti
// berlaku dan harus dibagikan ulang.
{
  const k = cariKembar([
    { id: 'a', project_name: 'P', created_at: '2026-01-01', jumlahLaporan: 4 },
    { id: 'b', project_name: 'P', created_at: '2026-02-01', jumlahLaporan: 9 },
    { id: 'c', project_name: 'P', created_at: '2026-03-01', jumlahLaporan: 1 },
  ])[0]
  assert(usulanTarget(k) === 'b', 'yang isinya paling banyak yang disarankan')

  // Seri jumlah laporan → yang paling tua.
  const seri = cariKembar([
    { id: 'muda', project_name: 'P', created_at: '2026-05-01', jumlahLaporan: 3 },
    { id: 'tua', project_name: 'P', created_at: '2026-01-01', jumlahLaporan: 3 },
  ])[0]
  assert(usulanTarget(seri) === 'tua', 'kalau seri, yang paling tua')

  // Buku yang kosong sekalipun tidak pernah dipilih kalau ada yang berisi.
  const kosong = cariKembar([
    { id: 'kosong', project_name: 'P', created_at: '2026-01-01' },
    { id: 'isi', project_name: 'P', created_at: '2026-06-01', jumlahLaporan: 1 },
  ])[0]
  assert(usulanTarget(kosong) === 'isi', 'yang berisi menang atas yang tua tapi kosong')
  assert(usulanTarget(null) === '', 'tanpa kelompok tidak ada usulan')
}

// ── 6. Rencana: sumbernya semua buku selain yang dipertahankan ──────
{
  const k = cariKembar([
    { id: 'a', project_name: 'P', jumlahLaporan: 4 },
    { id: 'b', project_name: 'P', jumlahLaporan: 9 },
    { id: 'c', project_name: 'P', jumlahLaporan: 1 },
  ])[0]
  const r = rencanaGabung(k, 'b')
  assert(r.boleh === true, 'rencananya sah')
  assert(r.targetId === 'b', 'targetnya yang dipilih')
  assert(r.sumberId.length === 2 && !r.sumberId.includes('b'), 'target tidak ikut jadi sumber')
  assert(r.sumberId.includes('a') && r.sumberId.includes('c'), 'sisanya jadi sumber')
  assert(r.laporanPindah === 5, 'jumlah laporan yang pindah dihitung dari sumbernya saja')
}

// ── 7. Yang tidak masuk akal ditolak, dan penolakannya menyebut sebab ─
//
// Penggabungan tidak bisa dibatalkan. Satu-satunya perlindungan yang berarti
// adalah menolak lebih awal.
{
  const k = cariKembar([
    { id: 'a', project_name: 'P', jumlahLaporan: 1 },
    { id: 'b', project_name: 'P', jumlahLaporan: 1 },
  ])[0]

  const tanpaPilihan = rencanaGabung(k, '')
  assert(tanpaPilihan.boleh === false, 'tanpa target ditolak')
  assert(tanpaPilihan.alasan.length > 0, 'dan alasannya disebutkan')
  assert(tanpaPilihan.sumberId.length === 0, 'tidak ada sumber yang disiapkan diam-diam')

  const asing = rencanaGabung(k, 'buku-proyek-lain')
  assert(asing.boleh === false, 'buku dari luar kelompok ditolak')
  assert(/kelompok/i.test(asing.alasan), 'sebabnya jelas')

  const sendirian = rencanaGabung({ nama: 'P', buku: [{ id: 'a', project_name: 'P' }] }, 'a')
  assert(sendirian.boleh === false, 'satu buku tidak perlu digabungkan')

  assert(rencanaGabung(null, 'a').boleh === false, 'kelompok kosong ditolak')
}

// ── 8. Kalimat konfirmasi menyebut yang HILANG ──────────────────────
//
// Yang hilang bukan datanya melainkan LINK-nya. Mandor yang masih memegang
// link buku lama akan menemukan halamannya kosong, dan tidak ada yang
// memberitahunya kecuali orang yang menekan tombol ini.
{
  const k = cariKembar([
    { id: 'a', project_name: 'Ruko Pak Soni', jumlahLaporan: 4 },
    { id: 'b', project_name: 'Ruko Pak Soni', jumlahLaporan: 9 },
    { id: 'c', project_name: 'Ruko Pak Soni', jumlahLaporan: 1 },
  ])[0]
  const kalimat = kalimatGabung(rencanaGabung(k, 'b'), k.nama)
  assert(/Link pekerja/i.test(kalimat), 'menyebut link pekerja berhenti berlaku')
  assert(/bagikan ulang/i.test(kalimat), 'dan apa yang harus dilakukan sesudahnya')
  assert(/tidak ada yang dihapus/i.test(kalimat), 'menegaskan laporannya tidak dihapus')
  assert(/5 laporan/.test(kalimat), 'menyebut berapa laporan yang pindah')
  assert(/Ruko Pak Soni/.test(kalimat), 'menyebut proyeknya')
  assert(kalimatGabung(rencanaGabung(k, ''), k.nama) === '',
    'rencana yang ditolak tidak punya kalimat konfirmasi')
}

// ── 9. Angka yang tidak masuk akal tidak merusak hitungan ───────────
{
  const k = cariKembar([
    { id: 'a', project_name: 'P', jumlahLaporan: Number.NaN },
    { id: 'b', project_name: 'P', jumlahLaporan: undefined },
    { id: 'c', project_name: 'P', jumlahLaporan: 3 },
  ])[0]
  const r = rencanaGabung(k, 'c')
  assert(r.laporanPindah === 0, 'NaN dan undefined dibaca sebagai nol, bukan menular')
  assert(!/NaN/.test(kalimatGabung(r, 'P')), 'NaN tidak pernah sampai ke layar')
}

// ── 10. Migrasinya memang mengerjakan yang dijanjikan ───────────────
//
// Keempat tabel harus ikut pindah. Yang paling mudah terlupa adalah
// `pekerja_id` di dalam absensi: kalau ia tidak ikut disatukan, buku yang
// tergabung terlihat rapi sementara rekap upahnya tetap memecah satu orang
// menjadi dua — kegagalan yang tidak menampakkan diri.
{
  const akar = new URL('../supabase/migrations', import.meta.url).pathname
  const sql = readFileSync(join(akar, 'migration_gabung_buku.sql'), 'utf8')
  const kode = sql.split('\n').filter(b => !b.trim().startsWith('--')).join('\n')

  for (const t of ['field_reports', 'material_usage', 'material_requests', 'field_workers']) {
    assert(new RegExp(`update ${t}`).test(kode), `${t} ikut dipindahkan`)
  }
  assert(/auth\.uid\(\)/.test(kode) && /is_team_member/.test(kode),
    'hak akses diperiksa di dalam fungsi security definer')
  assert(/user_id = v_owner/.test(kode), 'buku milik orang lain tidak ikut digabungkan')
  assert(/id <> p_target/.test(kode), 'buku tujuan tidak bisa jadi sumbernya sendiri')
  assert(/jsonb_set\(e\.a, '\{pekerja_id\}'/.test(kode),
    'pekerja_id di dalam absensi dialihkan ke pekerja yang dipertahankan')
  assert(/peta_pekerja/.test(kode), 'ada peta id lama ke id yang dipertahankan')
  assert(!/delete from field_reports/.test(kode), 'tidak ada laporan yang dihapus')
}

// ── 11. Aplikasinya benar-benar memanggil fungsi itu ────────────────
{
  const akar = new URL('../src', import.meta.url).pathname
  const fr = readFileSync(join(akar, 'lib/fieldReports.ts'), 'utf8')
  assert(/field_log_gabung/.test(fr), 'fieldReports memanggil field_log_gabung')

  const tab = readFileSync(join(akar, 'components/cost/TabLaporanLapangan.tsx'), 'utf8')
  assert(/cariKembar/.test(tab), 'layarnya memakai cariKembar, bukan mendeteksi ulang sendiri')
  assert(/kalimatGabung/.test(tab), 'dan memakai kalimat konfirmasi yang sama')
}

console.log(`gabung-buku: ${ok} assert lulus`)
