// ============================================================
// Absensi pekerja.
//
// Angka yang keluar dari sini menjadi dasar orang dibayar. Jadi yang diuji
// bukan "fungsinya jalan", melainkan tiga hal yang kalau salah membuat
// seseorang dibayar keliru:
//
//   1. Satu orang, satu tanggal, satu hitungan — walau dua mandor melapor.
//   2. "Pak Yono" dan "Yono" adalah satu orang, bukan dua tukang paruh waktu.
//   3. Jam lembur TIDAK PERNAH menjelma jadi HOK dengan sendirinya.
// ============================================================
import {
  JAM_KERJA_HARIAN, LEMBUR_MAKS, STATUS_HADIR,
  hokStatus, labelStatus, kunciPekerja, rapikanNama, bacaAbsensi,
  siapKirimAbsensi, ringkasAbsensi, bulat,
  rekapAbsensi, totalRekap, daftarPekerja, cariPekerja,
} from '../src/lib/absensiPekerja.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const dekat = (a, b, m) => assert(Math.abs(a - b) < 1e-9, `${m} (dapat ${a}, harap ${b})`)

// ── 1. HOK per status ──────────────────────────────────────────────────────
dekat(hokStatus('hadir'), 1, 'hadir sehari penuh')
dekat(hokStatus('setengah'), 0.5, 'setengah hari')
dekat(hokStatus('izin'), 0, 'izin tidak dihitung hari kerja')
dekat(hokStatus('alpa'), 0, 'alpa tidak dihitung')
// Status asing bernilai NOL, bukan 1. Salah ketik di basis data tidak boleh
// diam-diam berubah menjadi upah sehari penuh.
dekat(hokStatus('cuti'), 0, 'status tak dikenal bernilai nol')
dekat(hokStatus(null), 0, 'null bernilai nol')
dekat(hokStatus(undefined), 0, 'undefined bernilai nol')
assert(labelStatus('hadir') === 'Hadir', 'label')
assert(labelStatus('ngawur') === '—', 'label tak dikenal')
assert(STATUS_HADIR.length === 4, 'empat status, cukup untuk dipilih di layar HP')
assert(JAM_KERJA_HARIAN === 8 && LEMBUR_MAKS === 12, 'tetapan')

// ── 2. Nama: gelar depan bukan orang yang berbeda ──────────────────────────
assert(kunciPekerja('Pak Yono') === 'yono', 'gelar "Pak" dibuang')
assert(kunciPekerja('pak yono') === 'yono', 'huruf besar tidak membedakan')
assert(kunciPekerja('  Yono  ') === 'yono', 'spasi ujung dibuang')
assert(kunciPekerja('Pak   Yono') === 'yono', 'spasi ganda dirapikan')
assert(kunciPekerja('Bapak Yono') === 'yono', 'bapak')
assert(kunciPekerja('Bpk. Yono') === 'yono', 'bpk dengan titik')
assert(kunciPekerja('Mas Adi') === 'adi', 'mas')
assert(kunciPekerja('Bu Sri') === 'sri', 'bu')
assert(kunciPekerja('Haji Umar') === 'umar', 'haji')
assert(kunciPekerja('Pak Haji Umar') === 'umar', 'dua gelar sekaligus')
// Yang HANYA gelar tidak boleh habis menjadi kosong — nama itu tetap milik
// seseorang, walau ditulis seadanya.
assert(kunciPekerja('Pak') === 'pak', 'nama yang hanya gelar tidak dihabiskan')
assert(kunciPekerja('') === '', 'kosong')
assert(kunciPekerja(null) === '', 'null aman')
// Nama yang MEMULAI dengan huruf gelar tapi bukan gelar tidak boleh terpotong.
assert(kunciPekerja('Hasan') === 'hasan', '"Hasan" bukan "h. asan"')
assert(kunciPekerja('Bangun') === 'bangun', '"Bangun" bukan gelar "bang"')
assert(rapikanNama('  Pak   Yono ') === 'Pak Yono', 'nama tampil dirapikan, gelarnya tetap')

// ── 3. Membaca jsonb apa adanya ────────────────────────────────────────────
assert(bacaAbsensi(null).length === 0, 'null jadi daftar kosong')
assert(bacaAbsensi(undefined).length === 0, 'kolom yang belum ada aman')
assert(bacaAbsensi('bukan array').length === 0, 'teks bukan absensi')
assert(bacaAbsensi([null, 5, 'x', {}]).length === 0, 'isi yang bukan baris dibuang')
assert(bacaAbsensi([{ nama: 'A' }]).length === 0, 'nama satu huruf ditolak')
{
  const b = bacaAbsensi([{ nama: ' Pak Yono ', peran: ' Mandor ', status: 'setengah', lembur: '3' }])
  assert(b.length === 1 && b[0].nama === 'Pak Yono' && b[0].peran === 'Mandor', 'dirapikan')
  assert(b[0].status === 'setengah' && b[0].lembur === 3, 'lembur dari teks angka')

  const c = bacaAbsensi([{ nama: 'Yono', status: 'ngawur' }])
  assert(c[0].status === 'hadir', 'status asing jatuh ke hadir — barisnya memang dicatat hadir')

  const d = bacaAbsensi([{ nama: 'Yono', lembur: 999 }])
  assert(d[0].lembur === LEMBUR_MAKS, 'lembur di luar akal dipangkas, bukan dipercaya')

  const e = bacaAbsensi([{ nama: 'Yono', lembur: -4 }, { nama: 'Adi', lembur: 'x' }])
  assert(e[0].lembur === undefined && e[1].lembur === undefined, 'lembur negatif/rusak diabaikan')
}

// ── 4. Layak kirim ─────────────────────────────────────────────────────────
assert(siapKirimAbsensi([]).ok, 'absensi kosong SAH — laporan harian tetap bisa dikirim')
assert(siapKirimAbsensi([{ nama: 'Yono', status: 'hadir' }]).ok, 'satu baris wajar')
assert(!siapKirimAbsensi([{ nama: 'A', status: 'hadir' }]).ok, 'nama terlalu pendek ditolak')
{
  // Nama kembar di SATU pengiriman: inilah yang membuat satu orang terhitung
  // dua hari kerja dalam sehari.
  const kembar = siapKirimAbsensi([
    { nama: 'Pak Yono', status: 'hadir' }, { nama: 'yono', status: 'hadir' },
  ])
  assert(!kembar.ok, 'nama kembar ditolak walau ditulis berbeda')
  assert(kembar.pesan.includes('yono'), `pesannya menyebut namanya: ${kembar.pesan}`)

  assert(!siapKirimAbsensi([{ nama: 'Yono', status: 'hadir', lembur: 20 }]).ok, 'lembur 20 jam ditolak')
  assert(!siapKirimAbsensi([{ nama: 'Yono', status: 'hadir', lembur: -1 }]).ok, 'lembur negatif ditolak')
  assert(siapKirimAbsensi([{ nama: 'Yono', status: 'hadir', lembur: LEMBUR_MAKS }]).ok, 'tepat di batas boleh')
}

// ── 5. Ringkasan sebaris ───────────────────────────────────────────────────
assert(ringkasAbsensi([]) === '', 'tanpa absensi tanpa ringkasan')
{
  const s = ringkasAbsensi([
    { nama: 'A A', status: 'hadir' }, { nama: 'B B', status: 'hadir' },
    { nama: 'C C', status: 'izin' }, { nama: 'D D', status: 'hadir', lembur: 2 },
  ])
  assert(s.includes('3 hadir') && s.includes('1 izin') && s.includes('2 jam lembur'), s)
  assert(!s.includes('0 '), `status yang nihil tidak disebut: ${s}`)
}
assert(bulat(0.5) === '0,5' && bulat(3) === '3', 'angka Indonesia')

// ── 6. REKAP — inti perkaranya ─────────────────────────────────────────────
{
  const laporan = [
    { tanggal: '2026-08-03', absensi: [
      { nama: 'Pak Yono', peran: 'Mandor', status: 'hadir', lembur: 2 },
      { nama: 'Adi', status: 'hadir' },
    ] },
    { tanggal: '2026-08-02', absensi: [
      { nama: 'Yono', status: 'setengah' },
      { nama: 'Adi', status: 'izin' },
    ] },
  ]
  const r = rekapAbsensi(laporan)
  assert(r.length === 2, `dua orang, bukan tiga: ${r.map(x => x.nama).join(', ')}`)

  const yono = r.find(x => x.kunci === 'yono')
  dekat(yono.hok, 1.5, 'sehari penuh + setengah hari')
  dekat(yono.jamLembur, 2, 'lembur terkumpul')
  assert(yono.hadir === 1 && yono.setengah === 1, 'cacah per status')
  // Nama TERPANJANG yang ditampilkan — "Pak Yono" lebih dikenali di daftar upah.
  assert(yono.nama === 'Pak Yono', `nama tampil terpanjang, dapat ${yono.nama}`)
  assert(yono.peran === 'Mandor', 'peran ikut walau hanya ditulis sekali')
  assert(yono.tanggal.join() === '2026-08-03,2026-08-02', 'tanggal terbaru dulu')

  const adi = r.find(x => x.kunci === 'adi')
  dekat(adi.hok, 1, 'izin tidak menambah hari kerja')
  assert(adi.izin === 1, 'izinnya tetap tercatat — bukan dibuang, hanya tidak dibayar')

  // Urut menurun: yang paling banyak bekerja di atas.
  assert(r[0].kunci === 'yono', 'urut HOK menurun')
}

// ── 7. Dua mandor, hari yang sama, tukang yang sama ────────────────────────
//
// Ini cacat yang paling mahal: dua laporan di tanggal yang sama sama-sama
// menyebut Yono, dan rekapnya membayarnya dua hari untuk satu hari kerja.
{
  const r = rekapAbsensi([
    { tanggal: '2026-08-03', absensi: [{ nama: 'Yono', status: 'hadir', lembur: 3 }] },
    { tanggal: '2026-08-03', absensi: [{ nama: 'Pak Yono', status: 'hadir', lembur: 3 }] },
  ])
  assert(r.length === 1, 'satu orang')
  dekat(r[0].hok, 1, 'SATU hari kerja, bukan dua')
  dekat(r[0].jamLembur, 3, 'lemburnya pun tidak berlipat')
  assert(r[0].tanggal.length === 1, 'tanggalnya tidak tercatat dua kali')
}
{
  // Yang PERTAMA menang. Pemanggilnya mengurutkan laporan dari yang terbaru,
  // jadi ralat yang dikirim belakangan itulah yang dipakai.
  const r = rekapAbsensi([
    { tanggal: '2026-08-03', absensi: [{ nama: 'Yono', status: 'setengah' }] },  // ralat
    { tanggal: '2026-08-03', absensi: [{ nama: 'Yono', status: 'hadir' }] },     // asli
  ])
  dekat(r[0].hok, 0.5, 'ralat yang menang, bukan catatan pertama yang keliru')
}

// ── 8. Lembur tidak pernah menjelma jadi HOK ───────────────────────────────
{
  const r = rekapAbsensi([
    { tanggal: '2026-08-03', absensi: [{ nama: 'Yono', status: 'hadir', lembur: 8 }] },
  ])
  dekat(r[0].hok, 1, 'lembur 8 jam TETAP 1 HOK — tarif lembur bukan urusan fungsi ini')
  dekat(r[0].jamLembur, 8, 'jamnya disimpan utuh, terpisah')
}

// ── 9. Masukan rusak tidak menjatuhkan rekap ───────────────────────────────
{
  assert(rekapAbsensi([]).length === 0, 'tanpa laporan')
  assert(rekapAbsensi(null).length === 0, 'null aman')
  assert(rekapAbsensi(undefined).length === 0, 'undefined aman')
  const r = rekapAbsensi([
    { tanggal: '2026-08-03' },                          // kolom absensi belum ada
    { tanggal: '2026-08-03', absensi: null },
    { tanggal: '', absensi: [{ nama: 'Yono', status: 'hadir' }] },
    null,
  ])
  assert(r.length === 1 && r[0].kunci === 'yono', 'baris lama tanpa absensi dilewati')
  // Tanggal kosong tidak boleh masuk daftar tanggal sebagai baris hampa.
  assert(r[0].tanggal.length === 0, 'tanggal kosong tidak dicatat')
}
{
  // Tanggal bercap waktu dipangkas ke harinya — kalau tidak, laporan pagi dan
  // sore di hari yang sama terhitung dua hari kerja.
  const r = rekapAbsensi([
    { tanggal: '2026-08-03T01:00:00Z', absensi: [{ nama: 'Yono', status: 'hadir' }] },
    { tanggal: '2026-08-03T09:00:00Z', absensi: [{ nama: 'Yono', status: 'hadir' }] },
  ])
  dekat(r[0].hok, 1, 'pagi dan sore tetap satu hari')
}

// ── 10. Total ──────────────────────────────────────────────────────────────
{
  const t = totalRekap(rekapAbsensi([
    { tanggal: '2026-08-03', absensi: [
      { nama: 'Yono', status: 'hadir', lembur: 2 },
      { nama: 'Adi', status: 'setengah' },
      { nama: 'Budi', status: 'alpa' },
    ] },
  ]))
  assert(t.pekerja === 3, 'tiga orang')
  dekat(t.hok, 1.5, 'total HOK')
  dekat(t.jamLembur, 2, 'total lembur')
  assert(t.alpa === 1, 'alpa terhitung')
  assert(totalRekap([]).pekerja === 0, 'total dari kosong')
}

// ── 11. Saran nama ─────────────────────────────────────────────────────────
{
  const daftar = daftarPekerja([
    { tanggal: '2026-08-03', absensi: [
      { nama: 'Pak Yono', peran: 'Mandor', status: 'hadir' },
      { nama: 'Adi', peran: 'Tukang Batu', status: 'hadir' },
    ] },
  ])
  assert(daftar.length === 2, 'dua nama pernah tercatat')

  assert(cariPekerja(daftar, '').length === 2, 'ketikan kosong menawarkan semuanya')
  assert(cariPekerja(daftar, 'yon')[0].nama === 'Pak Yono', 'dicari tanpa gelar')
  assert(cariPekerja(daftar, 'Pak Yon')[0].nama === 'Pak Yono', 'dicari dengan gelar juga ketemu')
  assert(cariPekerja(daftar, 'batu')[0].nama === 'Adi', 'perannya ikut dicari')
  // Yang sudah ada di absensi hari ini tidak ditawarkan lagi — menawarkannya
  // hanya mengundang baris kembar yang lalu ditolak saat kirim.
  assert(cariPekerja(daftar, '', ['yono']).length === 1, 'yang sudah dipakai tidak ditawarkan')
  assert(cariPekerja(daftar, '', ['Pak Yono'])[0].nama === 'Adi', 'dikenali walau ditulis dengan gelar')
  assert(cariPekerja(null, 'x').length === 0, 'daftar null aman')
}

console.log(`absensi-pekerja: ${ok} assert lulus`)
