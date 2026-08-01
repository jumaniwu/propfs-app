// Test Cari Leads: nomor HP, pemeriksaan form, pesan WA, dan ringkasan pipeline.
import {
  rapikanHp, tampilHp, periksaForm, siapkanKiriman,
  pesanWaLead, pesanBalasLead, ringkasLeads, saringLeads, ringkasSatu,
  bacaStatus, URUT_STATUS, LABEL_STATUS, TONE_STATUS, STATUS_SELESAI, JENIS_PROYEK,
  tanggalHariIni, tanggalTambahBulan, tampilTanggal, tanggalSah, pilihanCepatMulai,
  rapikanSlug, periksaSlug, MIN_SLUG, MAKS_SLUG, SLUG_TERLARANG,
} from '../src/lib/leads.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── rapikanHp ──────────────────────────────────────────────────────────────
assert(rapikanHp('081234567890') === '6281234567890', '0 di depan jadi 62')
assert(rapikanHp('0812-3456-7890') === '6281234567890', 'tanda hubung dibuang')
assert(rapikanHp('0812 3456 7890') === '6281234567890', 'spasi dibuang')
assert(rapikanHp('(0812) 3456.7890') === '6281234567890', 'kurung & titik dibuang')
assert(rapikanHp('+6281234567890') === '6281234567890', 'plus dibuang')
assert(rapikanHp('6281234567890') === '6281234567890', 'sudah benar dibiarkan')
assert(rapikanHp('81234567890') === '6281234567890', 'tanpa 0 di depan tetap dimengerti')

// Yang tidak masuk akal DIKEMBALIKAN null, bukan ditebak.
assert(rapikanHp('') === null, 'kosong bukan nomor')
assert(rapikanHp(null) === null, 'null aman')
assert(rapikanHp('bukan nomor') === null, 'huruf bukan nomor')
assert(rapikanHp('0812345') === null, 'terlalu pendek ditolak')
assert(rapikanHp('08123456789012345') === null, 'terlalu panjang ditolak')
assert(rapikanHp('0217654321') === null, 'nomor rumah (bukan 08) ditolak')
assert(rapikanHp('0812-3456-78ab') === null, 'huruf di tengah ditolak')

// Nomor luar negeri diterima apa adanya selama panjangnya masuk akal.
assert(rapikanHp('+6591234567') === '6591234567', 'nomor Singapura diterima')
assert(rapikanHp('+1') === null, 'nomor luar negeri terlalu pendek ditolak')

// ── tampilHp ───────────────────────────────────────────────────────────────
assert(tampilHp('6281234567890') === '0812-3456-7890', 'ditampilkan dalam bentuk lokal')
assert(tampilHp('tidak jelas') === 'tidak jelas', 'yang tidak terbaca ditampilkan apa adanya')

// ── Tautan pilihan sendiri ─────────────────────────────────────────────────
// rapikanSlug: apa pun yang diketik dijadikan bentuk yang sah.
assert(rapikanSlug('NexBuild') === 'nexbuild', 'huruf besar jadi kecil')
assert(rapikanSlug('Nex Build Indonesia') === 'nex-build-indonesia', 'spasi jadi tanda hubung')
assert(rapikanSlug('nex_build') === 'nex-build', 'garis bawah jadi tanda hubung')
assert(rapikanSlug('nex.build') === 'nex-build', 'titik jadi tanda hubung')
assert(rapikanSlug('nex@#$build') === 'nexbuild', 'tanda baca lain dibuang')
assert(rapikanSlug('nex---build') === 'nex-build', 'tanda hubung berurutan dirapatkan')
assert(rapikanSlug('---nexbuild---') === 'nexbuild', 'tanda hubung di tepi dibuang')
assert(rapikanSlug('  nexbuild  ') === 'nexbuild', 'spasi di tepi tidak menyisakan tanda hubung')
assert(rapikanSlug('a'.repeat(50)).length === MAKS_SLUG, `dipotong ke ${MAKS_SLUG} karakter`)
assert(rapikanSlug('') === '' && rapikanSlug(null) === '', 'masukan kosong aman')
assert(rapikanSlug('日本語') === '', 'huruf non-latin dibuang seluruhnya')
// Sudah rapi berarti tidak berubah lagi bila dirapikan dua kali.
assert(rapikanSlug(rapikanSlug('Nex Build!')) === rapikanSlug('Nex Build!'), 'merapikan bersifat tetap')

// periksaSlug
{
  const b = periksaSlug('NexBuild Indonesia')
  assert(b.sah === true && b.slug === 'nexbuild-indonesia', 'dirapikan lalu diterima')
  assert(b.alasan === '', 'yang sah tidak membawa alasan')
}
assert(periksaSlug('ab').sah === false, `kurang dari ${MIN_SLUG} huruf ditolak`)
assert(/Minimal/.test(periksaSlug('ab').alasan), 'alasannya menyebut batasnya')
assert(periksaSlug('abc').sah === true, `tepat ${MIN_SLUG} huruf diterima`)
assert(periksaSlug('').sah === false && /belum diisi/.test(periksaSlug('').alasan), 'kosong ditolak')
assert(periksaSlug('!!!').sah === false, 'yang habis dirapikan jadi kosong ikut ditolak')

// Angka saja: mudah tertukar dengan nomor, dan tidak menjelaskan apa pun.
assert(periksaSlug('12345').sah === false, 'angka saja ditolak')
assert(/sertakan huruf/.test(periksaSlug('12345').alasan), 'alasannya menuntun, bukan sekadar menolak')
assert(periksaSlug('nex123').sah === true, 'huruf + angka diterima')

// Kata yang disimpan sistem.
for (const kata of SLUG_TERLARANG) {
  assert(periksaSlug(kata).sah === false, `"${kata}" ditolak`)
}
assert(periksaSlug('ADMIN').sah === false, 'huruf besar tidak menembus daftar terlarang')
assert(periksaSlug('administrasi').sah === true, 'yang sekadar berawalan sama tetap boleh')
assert(MIN_SLUG === 3 && MAKS_SLUG === 32, 'batas panjang')

// ── Tanggal rencana mulai ──────────────────────────────────────────────────
// Waktu SETEMPAT, bukan UTC: bagi pemakai di Indonesia (UTC+7) toISOString()
// masih menunjuk tanggal kemarin sampai pukul 07.00, dan batas "tidak boleh
// sebelum hari ini" akan meleset sehari.
{
  const dini = new Date(2026, 7, 1, 2, 48) // 1 Agustus 2026, 02:48 waktu setempat
  assert(tanggalHariIni(dini) === '2026-08-01',
    `dini hari tetap tanggal hari ini menurut waktu setempat (dapat ${tanggalHariIni(dini)})`)
  assert(tanggalHariIni(new Date(2026, 0, 9)) === '2026-01-09', 'bulan & tanggal diberi nol di depan')
}

// tanggalTambahBulan: dijepit ke akhir bulan supaya "bulan depan" tidak
// diam-diam melompat dua bulan.
assert(tanggalTambahBulan(1, new Date(2026, 0, 31)) === '2026-02-28',
  `31 Jan + 1 bulan = 28 Feb, bukan 3 Mar (dapat ${tanggalTambahBulan(1, new Date(2026, 0, 31))})`)
assert(tanggalTambahBulan(1, new Date(2024, 0, 31)) === '2024-02-29', 'tahun kabisat dihormati')
assert(tanggalTambahBulan(1, new Date(2026, 7, 15)) === '2026-09-15', 'bulan depan biasa')
assert(tanggalTambahBulan(3, new Date(2026, 7, 15)) === '2026-11-15', 'tiga bulan lagi')
assert(tanggalTambahBulan(6, new Date(2026, 7, 15)) === '2027-02-15', 'melewati pergantian tahun')
assert(tanggalTambahBulan(0, new Date(2026, 7, 15)) === '2026-08-15', 'nol bulan = hari ini')

// tampilTanggal: yang BUKAN tanggal dikembalikan apa adanya — itulah yang
// menjaga lead lama berisi teks bebas tetap terbaca.
assert(tampilTanggal('2026-09-15') === '15 Sep 2026', 'tanggal jadi enak dibaca')
assert(tampilTanggal('2026-01-05') === '5 Jan 2026', 'nol di depan tanggal dibuang')
assert(tampilTanggal('2026-12-31') === '31 Des 2026', 'Desember disingkat Des')
assert(tampilTanggal('setelah lebaran') === 'setelah lebaran', 'teks lama tetap terbaca apa adanya')
assert(tampilTanggal('bulan depan') === 'bulan depan', 'teks bebas tidak dirusak')
assert(tampilTanggal('') === '' && tampilTanggal(null) === '', 'kosong tetap kosong')
assert(tampilTanggal('2026-13-01') === '2026-13-01', 'bulan ke-13 bukan tanggal, dikembalikan utuh')

// tanggalSah
assert(tanggalSah('2026-09-15') === true, 'tanggal sah')
assert(tanggalSah('2026-02-29') === false, '29 Feb 2026 bukan tahun kabisat')
assert(tanggalSah('2024-02-29') === true, '29 Feb 2024 sah')
assert(tanggalSah('2026-04-31') === false, 'April tidak punya tanggal 31')
assert(tanggalSah('setelah lebaran') === false, 'teks bebas bukan tanggal')
assert(tanggalSah('15-09-2026') === false, 'urutan lain tidak diterima')

// pilihanCepatMulai
{
  const cepat = pilihanCepatMulai(new Date(2026, 7, 15))
  assert(cepat.length === 4, 'empat pilihan cepat')
  assert(cepat[0].label === 'Secepatnya' && cepat[0].nilai === '2026-08-15', 'Secepatnya = hari ini')
  assert(cepat[1].nilai === '2026-09-15', 'Bulan depan')
  assert(cepat[3].nilai === '2027-02-15', '6 bulan lagi melewati tahun')
  assert(cepat.every(c => tanggalSah(c.nilai)), 'semua pilihan menghasilkan tanggal yang sah')
  assert(new Set(cepat.map(c => c.nilai)).size === 4, 'tidak ada pilihan yang bertabrakan')
}

// ── periksaForm ────────────────────────────────────────────────────────────
{
  const p = periksaForm({ nama: 'Budi Santoso', no_hp: '081234567890' })
  assert(p.sah === true, 'nama + HP sudah cukup')
  assert(Object.keys(p.galat).length === 0, 'tidak ada galat')
}
{
  const p = periksaForm({})
  assert(p.sah === false, 'form kosong ditolak')
  assert(!!p.galat.nama && !!p.galat.no_hp, 'nama & HP disebut sebagai yang kurang')
  assert(!p.galat.email, 'email TIDAK wajib — memaksanya membuat calon berhenti mengisi')
}
{
  const p = periksaForm({ nama: 'B', no_hp: '081234567890' })
  assert(!!p.galat.nama, 'nama satu huruf ditolak')
}
{
  const p = periksaForm({ nama: 'Budi', no_hp: '0812345' })
  assert(/belum benar/.test(p.galat.no_hp), 'nomor tidak masuk akal diberi tahu, bukan didiamkan')
}
// Email opsional, tapi kalau diisi harus benar bentuknya.
assert(periksaForm({ nama: 'Budi', no_hp: '081234567890', email: 'budi@mail.com' }).sah === true,
  'email benar diterima')
assert(!!periksaForm({ nama: 'Budi', no_hp: '081234567890', email: 'budi@mail' }).galat.email,
  'email tanpa domain lengkap ditolak')
assert(!!periksaForm({ nama: 'Budi', no_hp: '081234567890', email: 'budi mail.com' }).galat.email,
  'email berspasi ditolak')
// Batas foto
assert(!!periksaForm({ nama: 'B', no_hp: '081234567890', foto: Array(7).fill('x') }).galat.foto,
  'lebih dari 6 foto ditolak')
assert(!periksaForm({ nama: 'Budi', no_hp: '081234567890', foto: Array(6).fill('x') }).galat.foto,
  'tepat 6 foto diterima')

// ── siapkanKiriman ─────────────────────────────────────────────────────────
{
  const s = siapkanKiriman({
    nama: '  Budi Santoso  ', no_hp: '0812-3456-7890', email: ' budi@mail.com ',
    jenis: 'Renovasi rumah', foto: ['a', '', '  ', 'b', 'c', 'd', 'e', 'f', 'g'],
  })
  assert(s.nama === 'Budi Santoso', 'spasi di tepi dirapikan')
  assert(s.no_hp === '6281234567890', 'nomor dibakukan sebelum dikirim')
  assert(s.email === 'budi@mail.com', 'email dirapikan')
  assert(s.foto.length === 6, `foto dipotong ke batas (dapat ${s.foto.length})`)
  assert(!s.foto.includes(''), 'foto kosong dibuang')
  assert(s.lokasi === '' && s.catatan === '', 'kolom yang tidak diisi jadi string kosong, bukan undefined')
}
// Nomor yang tidak terbaca tetap dikirim apa adanya, supaya datanya tidak hilang
// dan orangnya masih bisa dihubungi manual.
assert(siapkanKiriman({ nama: 'X', no_hp: '0812345' }).no_hp === '0812345',
  'nomor tak terbaca tetap dibawa apa adanya, bukan dibuang')

// ── pesanWaLead ────────────────────────────────────────────────────────────
{
  const pesan = pesanWaLead({
    nama: 'Budi', jenis: 'Renovasi rumah', lokasi: 'Bandung',
    luas: '100 m2', kondisi: 'Atap bocor, dinding lembab',
    anggaran: '150-200 juta', catatan: 'Tolong dibalas sore',
    target_mulai: '2026-09-15', foto: ['a', 'b'],
  }, 'PT Contoh Jaya')

  assert(/^Halo PT Contoh Jaya, saya Budi\./.test(pesan), 'menyapa perusahaan & menyebut diri')
  assert(/Renovasi rumah/.test(pesan) && /Bandung/.test(pesan), 'kebutuhan & lokasi ikut')
  assert(/Atap bocor/.test(pesan), 'kondisi ikut')
  assert(/150-200 juta/.test(pesan), 'anggaran ikut')
  assert(/2 foto/.test(pesan), 'jumlah foto disebut')
  assert(/Tolong dibalas sore/.test(pesan), 'catatan ikut')
  // Yang membaca pesan ini orang di ujung WhatsApp, bukan mesin.
  assert(/Rencana mulai: 15 Sep 2026/.test(pesan),
    'tanggal dicetak enak dibaca, bukan 2026-09-15')
  assert(!/2026-09-15/.test(pesan), 'ISO mentah tidak bocor ke pesan')
}
// Lead lama yang target_mulai-nya masih teks bebas tetap tercetak apa adanya.
assert(/Rencana mulai: setelah lebaran/.test(
  pesanWaLead({ nama: 'X', target_mulai: 'setelah lebaran' })),
  'teks lama tetap terbawa ke pesan')
// Kolom kosong tidak menyisakan baris hampa.
{
  const pesan = pesanWaLead({ nama: 'Budi' })
  assert(!/Lokasi:/.test(pesan), 'kolom kosong tidak dicetak')
  assert(!/foto/.test(pesan), 'tanpa foto tidak menyebut foto')
  assert(/saya Budi/.test(pesan), 'nama tetap ada')
}
assert(/saya calon konsumen/.test(pesanWaLead({})), 'tanpa nama tetap berbunyi wajar')
assert(/^Halo, saya/.test(pesanWaLead({ nama: 'X' })), 'tanpa nama perusahaan tidak menyisakan spasi ganda')

// ── pesanBalasLead ─────────────────────────────────────────────────────────
{
  const p = pesanBalasLead({ id: '1', nama: 'Budi', jenis: 'Renovasi rumah', lokasi: 'Bandung' }, 'PT Contoh')
  assert(/Halo Budi/.test(p), 'menyapa calon dengan namanya')
  assert(/PT Contoh/.test(p), 'menyebut perusahaan pengirim')
  assert(/Renovasi rumah di Bandung/.test(p), 'menyebut pekerjaan & lokasinya')
  assert(/survei lokasi/.test(p), 'mengajak ke langkah berikutnya')
}
assert(/Bapak\/Ibu/.test(pesanBalasLead({ id: '1' })), 'tanpa nama tetap sopan')
assert(/survei lokasi/.test(pesanBalasLead({ id: '1' })), 'tanpa data proyek tetap mengajak survei')

// ── bacaStatus ─────────────────────────────────────────────────────────────
assert(bacaStatus('deal') === 'deal', 'status dikenali')
assert(bacaStatus('DEAL') === 'deal', 'huruf besar dikenali')
assert(bacaStatus('entah') === 'baru', 'status asing dianggap baru masuk')
assert(bacaStatus(undefined) === 'baru', 'tanpa status dianggap baru masuk')

// ── ringkasLeads ───────────────────────────────────────────────────────────
const KINI = new Date('2026-08-01T00:00:00Z')
const DAFTAR = [
  { id: 'a', nama: 'Budi', status: 'baru', created_at: '2026-07-30T08:00:00Z', jenis: 'Renovasi rumah', lokasi: 'Bandung' },
  { id: 'b', nama: 'Citra', status: 'dihubungi', created_at: '2026-07-29T08:00:00Z', lokasi: 'Jakarta' },
  { id: 'c', nama: 'Dedi', status: 'deal', created_at: '2026-07-01T08:00:00Z', jenis: 'Interior' },
  { id: 'd', nama: 'Eka', status: 'batal', created_at: '2026-06-01T08:00:00Z' },
  { id: 'e', nama: 'Fajar', status: 'survei', created_at: '2026-07-31T08:00:00Z' },
]
{
  const r = ringkasLeads(DAFTAR, KINI)
  assert(r.total === 5, 'total lead')
  assert(r.perStatus.baru === 1 && r.perStatus.deal === 1 && r.perStatus.batal === 1, 'hitungan per status')
  assert(r.perStatus.penawaran === 0, 'status tanpa isi tetap dicantumkan sebagai nol')
  assert(Object.keys(r.perStatus).length === 6, 'semua status selalu ada')
  assert(r.perluTindakan === 3, `yang belum ditutup: baru + dihubungi + survei (dapat ${r.perluTindakan})`)
  assert(r.mingguIni === 3, `masuk 7 hari terakhir (dapat ${r.mingguIni})`)
  assert(r.persenDeal === 50, `1 deal dari 2 yang ditutup = 50% (dapat ${r.persenDeal})`)
}
// Persen dihitung terhadap yang SUDAH ditutup, bukan seluruh lead — kalau tidak,
// angkanya jatuh setiap ada lead baru masuk, seolah kinerjanya memburuk.
{
  const r = ringkasLeads([...DAFTAR, { id: 'f', status: 'baru', created_at: '2026-08-01T00:00:00Z' }], KINI)
  assert(r.persenDeal === 50, 'lead baru masuk TIDAK menurunkan persen deal')
}
assert(ringkasLeads([], KINI).persenDeal === null, 'belum ada yang ditutup: persennya null, bukan 0')
assert(ringkasLeads().total === 0, 'tanpa masukan aman')

// ── saringLeads ────────────────────────────────────────────────────────────
assert(saringLeads(DAFTAR).map(l => l.id).join() === 'e,a,b,c,d', 'terbaru di atas')
assert(saringLeads(DAFTAR, { status: 'semua' }).length === 5, '"semua" tidak menyaring')
assert(saringLeads(DAFTAR, { status: 'deal' }).map(l => l.id).join() === 'c', 'saring per status')
assert(saringLeads(DAFTAR, { cari: 'budi' }).map(l => l.id).join() === 'a', 'cari nama')
assert(saringLeads(DAFTAR, { cari: 'BANDUNG' }).map(l => l.id).join() === 'a', 'cari tidak peka huruf besar')
assert(saringLeads(DAFTAR, { cari: 'renovasi bandung' }).map(l => l.id).join() === 'a',
  'kata dicari terpisah, urutannya tidak mengikat')
assert(saringLeads(DAFTAR, { cari: 'zzz' }).length === 0, 'kata tak ditemukan')
assert(saringLeads(DAFTAR, { status: 'baru', cari: 'budi' }).length === 1, 'status & cari digabung')
assert(saringLeads([], {}).length === 0, 'daftar kosong aman')
// Urutan tetap sama di pemuatan berikutnya.
assert(saringLeads(DAFTAR).map(l => l.id).join() === saringLeads(DAFTAR).map(l => l.id).join(),
  'urutannya tetap')

// ── ringkasSatu ────────────────────────────────────────────────────────────
assert(ringkasSatu(DAFTAR[0]) === 'Renovasi rumah · Bandung', 'ringkasan satu lead')
assert(ringkasSatu({ id: 'x' }) === 'Belum ada keterangan proyek', 'lead tanpa data berbunyi wajar')

// ── Label & konstanta ──────────────────────────────────────────────────────
assert(URUT_STATUS.length === 6, 'enam tahapan')
assert(URUT_STATUS[0] === 'baru' && URUT_STATUS[URUT_STATUS.length - 1] === 'batal',
  'baru di depan, batal di belakang')
assert(URUT_STATUS.every(s => LABEL_STATUS[s] && TONE_STATUS[s]), 'tiap status punya label & warna')
assert(STATUS_SELESAI.join() === 'deal,batal', 'yang tergolong selesai')
assert(JENIS_PROYEK.length >= 5 && JENIS_PROYEK.includes('Renovasi rumah'), 'pilihan jenis proyek')

console.log(`leads: ${ok} assert lulus`)
