// Test Cari Leads: nomor HP, pemeriksaan form, pesan WA, dan ringkasan pipeline.
import {
  rapikanHp, tampilHp, periksaForm, siapkanKiriman,
  pesanWaLead, pesanBalasLead, ringkasLeads, saringLeads, ringkasSatu,
  bacaStatus, URUT_STATUS, LABEL_STATUS, TONE_STATUS, STATUS_SELESAI, JENIS_PROYEK,
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
    foto: ['a', 'b'],
  }, 'PT Contoh Jaya')

  assert(/^Halo PT Contoh Jaya, saya Budi\./.test(pesan), 'menyapa perusahaan & menyebut diri')
  assert(/Renovasi rumah/.test(pesan) && /Bandung/.test(pesan), 'kebutuhan & lokasi ikut')
  assert(/Atap bocor/.test(pesan), 'kondisi ikut')
  assert(/150-200 juta/.test(pesan), 'anggaran ikut')
  assert(/2 foto/.test(pesan), 'jumlah foto disebut')
  assert(/Tolong dibalas sore/.test(pesan), 'catatan ikut')
}
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
