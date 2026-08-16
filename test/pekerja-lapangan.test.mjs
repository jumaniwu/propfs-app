// ============================================================
// Pekerja lapangan terdaftar, dan upah mingguannya.
//
// Angka yang keluar dari sini dipakai membayar orang tiap Sabtu. Yang diuji
// karena itu bukan "fungsinya jalan", melainkan hal-hal yang kalau salah
// membuat seseorang menerima upah yang keliru — dan tidak ada yang tahu:
//
//   1. BORONGAN upahnya null, BUKAN nol. Nol berarti "bekerja tanpa dibayar".
//   2. Satu orang, satu tanggal, satu hitungan — walau dua mandor melapor.
//   3. Minggu tidak bergeser sehari di zona waktu mana pun.
//   4. Upah harian yang belum diisi DIKATAKAN, bukan diam-diam jadi nol.
// ============================================================
import {
  JENIS_UPAH, jenisUpah, bacaPekerja, bacaDaftarPekerja, siapDaftarPekerja,
  barisDariPekerja, belumDiabsen,
  awalMinggu, akhirMinggu, labelMinggu, rekapUpahMingguan, upahBelumDiisi,
} from '../src/lib/pekerjaLapangan.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const dekat = (a, b, m) => assert(Math.abs(a - b) < 1e-9, `${m} (dapat ${a}, harap ${b})`)

const YONO = { id: 'w1', nama: 'Pak Yono', peran: 'Mandor', no_hp: '0812', jenis: 'harian', upah_harian: 150000, foto: '', aktif: true }
const ADI = { id: 'w2', nama: 'Adi', peran: 'Tukang Batu', no_hp: '', jenis: 'harian', upah_harian: 120000, foto: '', aktif: true }
const BUDI = { id: 'w3', nama: 'Budi', peran: 'Borongan Keramik', no_hp: '', jenis: 'borongan', upah_harian: 0, foto: '', aktif: true }
const PEKERJA = [YONO, ADI, BUDI]

// ── 1. Jenis upah ──────────────────────────────────────────────────────────
assert(JENIS_UPAH.length === 2, 'dua jenis saja')
assert(jenisUpah({ jenis: 'borongan' }) === 'borongan', 'borongan')
assert(jenisUpah({ jenis: 'BORONGAN' }) === 'borongan', 'huruf besar')
assert(jenisUpah({ jenis: 'harian' }) === 'harian', 'harian')
// Baris lama tanpa kolom jenis harus jatuh ke 'harian' — itulah yang selama
// ini dianggap semua orang, dan menebaknya borongan akan MENGHILANGKAN
// upah orang dari rekap tanpa satu pun tanda.
assert(jenisUpah({}) === 'harian', 'tanpa jenis: harian')
assert(jenisUpah(null) === 'harian', 'null: harian')
assert(jenisUpah({ jenis: 'ngawur' }) === 'harian', 'nilai asing: harian')

// ── 2. Membaca dari server ─────────────────────────────────────────────────
{
  const p = bacaPekerja({ id: 'w1', nama: '  Pak   Yono ', peran: ' Mandor ', jenis: 'harian', upah_harian: '150000' })
  assert(p.nama === 'Pak Yono' && p.peran === 'Mandor', 'dirapikan')
  assert(p.upah_harian === 150000, 'upah dari teks angka')
  assert(p.aktif === true, 'aktif bawaan')

  assert(bacaPekerja({ nama: 'A' }) === null, 'nama satu huruf ditolak')
  assert(bacaPekerja(null) === null, 'null aman')
  assert(bacaPekerja('teks') === null, 'teks aman')
  assert(bacaPekerja({ nama: 'Yono', upah_harian: -5 }).upah_harian === 0, 'upah minus dijadikan nol')

  const d = bacaDaftarPekerja([{ nama: 'Zaki' }, null, { nama: 'Adi' }, 5])
  assert(d.length === 2 && d[0].nama === 'Adi', 'diurut nama, yang rusak dibuang')
  assert(bacaDaftarPekerja(null).length === 0, 'null aman')
}

// ── 3. Pendaftaran ─────────────────────────────────────────────────────────
assert(siapDaftarPekerja({ nama: 'Wawan' }).boleh, 'nama saja sudah cukup')
assert(!siapDaftarPekerja({ nama: 'W' }).boleh, 'satu huruf ditolak')
assert(!siapDaftarPekerja({ nama: '  ' }).boleh, 'spasi ditolak')
{
  // Upah BOLEH nol walau harian: sering baru disepakati beberapa hari setelah
  // orangnya mulai bekerja. Menolaknya berarti absensinya hilang justru di
  // hari-hari yang paling mudah dilupakan.
  assert(siapDaftarPekerja({ nama: 'Wawan', jenis: 'harian', upah_harian: 0 }).boleh,
    'upah belum disepakati tetap boleh didaftarkan')

  const kembar = siapDaftarPekerja({ nama: 'pak yono' }, PEKERJA)
  assert(!kembar.boleh && kembar.alasan.includes('Pak Yono'),
    `nama kembar ditolak dan disebut: ${kembar.alasan}`)
  // Menyunting orang yang sama tidak boleh dianggap kembar dengan dirinya.
  assert(siapDaftarPekerja({ id: 'w1', nama: 'Pak Yono', upah_harian: 160000 }, PEKERJA).boleh,
    'menyunting dirinya sendiri bukan kembar')

  assert(!siapDaftarPekerja({ nama: 'Wawan', upah_harian: -1 }).boleh, 'upah minus ditolak')
  const nolBerlebih = siapDaftarPekerja({ nama: 'Wawan', upah_harian: 150000000 })
  assert(!nolBerlebih.boleh && nolBerlebih.alasan.includes('nol'), 'salah ketik nol tertangkap')
}

// ── 4. Dari daftar ke baris absen ──────────────────────────────────────────
{
  const b = barisDariPekerja(YONO)
  assert(b.pekerja_id === 'w1' && b.nama === 'Pak Yono', 'membawa id DAN salinan nama')
  assert(b.status === 'hadir', 'bawaannya hadir — kebanyakan orang memang datang')

  const sisa = belumDiabsen(PEKERJA, [barisDariPekerja(YONO)])
  assert(sisa.length === 2 && !sisa.some(p => p.id === 'w1'), 'yang sudah diabsen tidak ditawarkan lagi')

  // Baris lama tanpa pekerja_id tetap dikenali lewat namanya.
  const lama = belumDiabsen(PEKERJA, [{ nama: 'pak yono', status: 'hadir' }])
  assert(!lama.some(p => p.id === 'w1'), 'baris lama tanpa id tetap dikenali lewat nama')

  assert(belumDiabsen(PEKERJA, []).length === 3, 'belum ada yang diabsen')
  assert(belumDiabsen(null, null).length === 0, 'null aman')
  assert(belumDiabsen([{ ...ADI, aktif: false }], []).length === 0, 'yang nonaktif tidak ditawarkan')
}

// ── 5. Batas minggu ────────────────────────────────────────────────────────
//
// 2026-08-16 adalah hari Minggu; 2026-08-10 hari Senin.
assert(awalMinggu('2026-08-16') === '2026-08-10', 'Minggu masuk ke minggu yang SAMA, bukan yang berikutnya')
assert(awalMinggu('2026-08-10') === '2026-08-10', 'Senin adalah awalnya sendiri')
assert(awalMinggu('2026-08-13') === '2026-08-10', 'Kamis')
assert(awalMinggu('2026-08-17') === '2026-08-17', 'Senin berikutnya mulai minggu baru')
assert(akhirMinggu('2026-08-10') === '2026-08-16', 'akhir minggu')
// Cap waktu ikut dipotong ke harinya.
assert(awalMinggu('2026-08-13T09:00:00Z') === '2026-08-10', 'cap waktu dipotong')
assert(awalMinggu('') === '' && awalMinggu('bukan tanggal') === '', 'yang tidak terbaca aman')
assert(awalMinggu(null) === '', 'null aman')

// Dibaca sebagai UTC: pergeseran sehari akan memindahkan upah Senin ke minggu
// sebelumnya, dan orang dibayar di minggu yang salah.
{
  const tz = process.env.TZ
  for (const zona of ['UTC', 'Asia/Jakarta', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    process.env.TZ = zona
    assert(awalMinggu('2026-08-10') === '2026-08-10', `Senin tetap Senin di ${zona}`)
    assert(awalMinggu('2026-08-16') === '2026-08-10', `Minggu tetap di minggunya di ${zona}`)
  }
  if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz
}

assert(labelMinggu('2026-08-10') === '10 – 16 Agu 2026', `label: ${labelMinggu('2026-08-10')}`)
assert(labelMinggu('2026-08-31') === '31 Agu – 6 Sep 2026', `lintas bulan: ${labelMinggu('2026-08-31')}`)
assert(labelMinggu('2026-12-28') === '28 Des 2026 – 3 Jan 2027', `lintas tahun: ${labelMinggu('2026-12-28')}`)
assert(labelMinggu('') === 'Tanpa tanggal', 'kosong')

// ── 6. REKAP UPAH — inti perkaranya ────────────────────────────────────────
{
  const laporan = [
    { tanggal: '2026-08-10', absensi: [
      { pekerja_id: 'w1', nama: 'Pak Yono', status: 'hadir', lembur: 2 },
      { pekerja_id: 'w2', nama: 'Adi', status: 'hadir' },
      { pekerja_id: 'w3', nama: 'Budi', status: 'hadir' },
    ] },
    { tanggal: '2026-08-11', absensi: [
      { pekerja_id: 'w1', nama: 'Pak Yono', status: 'setengah' },
      { pekerja_id: 'w2', nama: 'Adi', status: 'izin' },
      { pekerja_id: 'w3', nama: 'Budi', status: 'hadir' },
    ] },
  ]
  const m = rekapUpahMingguan(laporan, PEKERJA)
  assert(m.length === 1, 'satu minggu')
  assert(m[0].awal === '2026-08-10' && m[0].label === '10 – 16 Agu 2026', 'mingguanya benar')

  const yono = m[0].baris.find(r => r.kunci === 'w1')
  dekat(yono.hok, 1.5, 'Yono 1,5 HOK')
  dekat(yono.upah, 225000, 'upah = 1,5 × 150.000')
  dekat(yono.jamLembur, 2, 'lembur terkumpul')

  const adi = m[0].baris.find(r => r.kunci === 'w2')
  dekat(adi.hok, 1, 'izin tidak menambah hari kerja')
  dekat(adi.upah, 120000, 'Adi dibayar sehari')

  // INTI: borongan upahnya NULL, bukan nol.
  const budi = m[0].baris.find(r => r.kunci === 'w3')
  assert(budi.jenis === 'borongan', 'Budi borongan')
  assert(budi.upah === null, `upah borongan null, dapat ${budi.upah}`)
  assert(budi.upah !== 0, 'BUKAN nol — nol berarti "bekerja tanpa dibayar"')
  dekat(budi.hok, 2, 'absensinya tetap dihitung penuh')

  // Total hanya menjumlahkan yang bisa dihitung.
  dekat(m[0].totalUpah, 345000, 'total upah = 225.000 + 120.000, borongan tidak ikut')
  assert(m[0].jumlahBorongan === 1, 'jumlah borongan disebut, supaya totalnya punya penjelasan')
  dekat(m[0].totalHok, 4.5, 'total HOK menghitung semua orang')
}

// ── 7. Dua mandor, hari sama, orang sama ───────────────────────────────────
{
  const m = rekapUpahMingguan([
    { tanggal: '2026-08-10', absensi: [{ pekerja_id: 'w2', nama: 'Adi', status: 'hadir' }] },
    { tanggal: '2026-08-10', absensi: [{ pekerja_id: 'w2', nama: 'Adi', status: 'hadir' }] },
  ], PEKERJA)
  dekat(m[0].baris[0].hok, 1, 'SATU hari kerja, bukan dua')
  dekat(m[0].baris[0].upah, 120000, 'dan dibayar sekali')
}

// ── 8. Minggu terpisah ─────────────────────────────────────────────────────
{
  const m = rekapUpahMingguan([
    { tanggal: '2026-08-16', absensi: [{ pekerja_id: 'w2', nama: 'Adi', status: 'hadir' }] },  // Minggu
    { tanggal: '2026-08-17', absensi: [{ pekerja_id: 'w2', nama: 'Adi', status: 'hadir' }] },  // Senin
  ], PEKERJA)
  assert(m.length === 2, 'Minggu dan Senin masuk minggu yang berbeda')
  assert(m[0].awal === '2026-08-17', 'minggu terbaru lebih dulu — upah yang belum dibayar di atas')
}

// ── 9. Pekerja yang sudah dihapus dari daftar ──────────────────────────────
//
// Absensinya HARUS tetap terbaca. Orang yang berhenti minggu lalu tetap harus
// dibayar untuk hari-hari yang sudah ia kerjakan.
{
  const m = rekapUpahMingguan(
    [{ tanggal: '2026-08-10', absensi: [{ pekerja_id: 'w9', nama: 'Wawan', peran: 'Kenek', status: 'hadir' }] }],
    PEKERJA,
  )
  assert(m[0].baris.length === 1, 'tetap muncul walau tidak ada di daftar')
  assert(m[0].baris[0].nama === 'Wawan', 'namanya dari salinan di absensi')
  assert(m[0].baris[0].peran === 'Kenek', 'perannya juga')
  dekat(m[0].baris[0].upah, 0, 'upahnya nol karena tarifnya tidak diketahui')
}

// ── 10. Upah harian yang belum diisi DIKATAKAN ─────────────────────────────
//
// Angka nol yang diam jauh lebih berbahaya daripada peringatan yang berisik:
// yang dibayar akan kurang, dan yang membayar tidak akan tahu.
{
  const belum = [{ ...ADI, upah_harian: 0 }]
  const m = rekapUpahMingguan(
    [{ tanggal: '2026-08-10', absensi: [{ pekerja_id: 'w2', nama: 'Adi', status: 'hadir' }] }],
    belum,
  )
  const p = upahBelumDiisi(m[0])
  assert(p.length === 1 && p[0].nama === 'Adi', 'yang belum ada tarifnya disebut')

  // Borongan TIDAK ikut diperingatkan — memang tidak punya upah harian.
  const mb = rekapUpahMingguan(
    [{ tanggal: '2026-08-10', absensi: [{ pekerja_id: 'w3', nama: 'Budi', status: 'hadir' }] }],
    PEKERJA,
  )
  assert(upahBelumDiisi(mb[0]).length === 0, 'borongan tidak diperingatkan')

  // Yang tidak datang sama sekali juga tidak perlu diperingatkan.
  const ma = rekapUpahMingguan(
    [{ tanggal: '2026-08-10', absensi: [{ pekerja_id: 'w2', nama: 'Adi', status: 'alpa' }] }],
    belum,
  )
  assert(upahBelumDiisi(ma[0]).length === 0, 'yang alpa tidak perlu tarif')
  assert(upahBelumDiisi(null).length === 0, 'null aman')
}

// ── 11. Masukan rusak tidak menjatuhkan hari gajian ────────────────────────
assert(rekapUpahMingguan(null, null).length === 0, 'null aman')
assert(rekapUpahMingguan([], PEKERJA).length === 0, 'tanpa laporan')
assert(rekapUpahMingguan([{ tanggal: '', absensi: [] }], PEKERJA).length === 0, 'tanggal kosong dilewati')
assert(rekapUpahMingguan([{ tanggal: '2026-08-10' }], PEKERJA).length === 0, 'tanpa absensi')
assert(rekapUpahMingguan([{ tanggal: '2026-08-10', absensi: [{ nama: '' }] }], PEKERJA).length === 0,
  'baris tanpa nama dilewati')

console.log(`pekerja-lapangan: ${ok} assert lulus`)
