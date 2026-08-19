// ============================================================
// Lonceng notifikasi yang benar-benar memberi tahu.
//
// Yang dijaga di sini adalah satu cacat yang membuat fitur notifikasi nyaris
// tidak berarti: isinya baru dimuat KETIKA loncengnya dibuka, sehingga lencana
// — yang dihitung dari daftar itu — selalu nol sampai ada yang membuka lonceng
// untuk memeriksa. Notifikasi yang harus diperiksa manual bukan notifikasi.
//
// Perbaikannya menghadirkan bahaya kebalikannya: memuat di setiap layar berarti
// delapan permintaan jaringan setiap kali halaman berpindah, ditanggung
// pemakai yang sedang di lapangan dengan sinyal seadanya. Jadi yang diuji di
// sini adalah keseimbangan keduanya.
// ============================================================
import {
  perluMuat, batasDibaca, labelLonceng, JEDA_MUAT_MS,
} from '../src/lib/kabarBaru.ts'
import { susunNotifikasi, LABEL_JENIS, PERLU_TINDAKAN } from '../src/lib/notifikasi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// ── 1. Kapan boleh bertanya lagi ─────────────────────────────────────────
{
  const T = 1_000_000

  assert(perluMuat({ terakhirMuat: 0, sedangMuat: false, sekarang: T }) === true,
    'belum pernah dimuat: muat sekarang — inilah yang membuat lencana bisa menyala')

  assert(perluMuat({ terakhirMuat: T, sedangMuat: false, sekarang: T + 1000 }) === false,
    'baru sedetik lalu: jangan bertanya lagi')
  assert(perluMuat({ terakhirMuat: T, sedangMuat: false, sekarang: T + JEDA_MUAT_MS }) === true,
    'sudah lewat jedanya: boleh')
  assert(perluMuat({ terakhirMuat: T, sedangMuat: false, sekarang: T + JEDA_MUAT_MS - 1 }) === false,
    'kurang semilidetik pun belum boleh')

  // `sedangMuat` menang atas `paksa`, dan urutan itu yang penting: menekan
  // tombol muat ulang tiga kali tidak boleh melahirkan tiga permintaan yang
  // saling menyalip — yang terakhir selesai belum tentu yang terakhir dikirim.
  assert(perluMuat({ terakhirMuat: 0, sedangMuat: true, sekarang: T }) === false,
    'sedang berjalan: jangan menumpuk')
  assert(perluMuat({ terakhirMuat: 0, sedangMuat: true, sekarang: T, paksa: true }) === false,
    'paksa pun TIDAK menumpuk permintaan kedua di atas yang sedang berjalan')

  assert(perluMuat({ terakhirMuat: T, sedangMuat: false, sekarang: T + 1, paksa: true }) === true,
    'membuka lonceng memaksa penyegaran walau baru saja dimuat')

  // Jeda bisa disetel, dan nilai tak masuk akal jatuh ke bawaannya.
  assert(perluMuat({ terakhirMuat: T, sedangMuat: false, sekarang: T + 6000, jedaMs: 5000 }) === true,
    'jeda pendek dihormati')
  assert(perluMuat({ terakhirMuat: T, sedangMuat: false, sekarang: T + 1000, jedaMs: 0 }) === false,
    'jeda 0 tidak berarti "selalu muat" — ia jatuh ke bawaan')
  assert(perluMuat({ terakhirMuat: T, sedangMuat: false, sekarang: T + 1000, jedaMs: -5 }) === false,
    'jeda negatif juga jatuh ke bawaan')

  assert(JEDA_MUAT_MS >= 60_000, 'jedanya tidak boleh sependek itu sampai membebani jaringan lapangan')
}

// ── 2. Batas "sudah dibaca" diambil dari yang TAMPIL, bukan dari jam ─────
//
// Bedanya baru terasa ketika ada kabar yang datang selagi loncengnya terbuka:
// memakai jam sekarang akan menandai terbaca sesuatu yang belum pernah muncul
// di layar, dan kabar itu hilang tanpa pernah dilihat siapa pun.
{
  const daftar = [{ waktu: '2026-08-19T10:00:00Z' }, { waktu: '2026-08-18T09:00:00Z' }]
  assert(batasDibaca(daftar) === '2026-08-19T10:00:00Z', 'yang teratas yang dipakai')
  assert(batasDibaca([], '2026-01-01T00:00:00Z') === '2026-01-01T00:00:00Z',
    'daftar kosong: pakai cadangan')
  assert(batasDibaca([{ waktu: '' }], 'cadangan') === 'cadangan', 'waktu kosong: pakai cadangan')
  assert(batasDibaca(undefined, 'cadangan') === 'cadangan', 'daftar tidak ada: aman')
  assert(batasDibaca([{ waktu: 123 }], 'cadangan') === 'cadangan', 'waktu bukan teks: aman')
}

// ── 3. Lencana berbunyi untuk yang tidak melihatnya ─────────────────────
assert(labelLonceng(0) === 'Notifikasi — tidak ada kabar baru', 'nol disebut apa adanya')
assert(labelLonceng(1) === 'Notifikasi — 1 kabar baru', 'satu')
assert(labelLonceng(5) === 'Notifikasi — 5 kabar baru', 'banyak')
assert(labelLonceng(-3) === 'Notifikasi — tidak ada kabar baru', 'negatif tidak menghasilkan kalimat aneh')
assert(labelLonceng('x') === 'Notifikasi — tidak ada kabar baru', 'bukan angka aman')

// ── 4. Pesan tim ikut jadi kabar — dan pesan SENDIRI tidak ──────────────
//
// Lencana yang menyala karena perbuatan sendiri mengajari orang untuk
// mengabaikan lencana. Sekali kebiasaan itu terbentuk, kabar yang benar-benar
// penting ikut terabaikan.
{
  const chat = [
    { id: 'p1', penulis_id: 'u-lain', penulis_nama: 'Suhanto', teks: 'Besok cor kolom',
      created_at: '2026-08-19T08:00:00Z', project_name: 'Noble Cove' },
    { id: 'p2', penulis_id: 'u-saya', penulis_nama: 'Jumani', teks: 'Siap',
      created_at: '2026-08-19T08:05:00Z' },
    { id: 'p3', penulis_id: 'u-lain', penulis_nama: 'Suhanto', teks: '', foto: ['a', 'b'],
      created_at: '2026-08-19T09:00:00Z' },
  ]

  const punyaSaya = susunNotifikasi({ chat, sayaId: 'u-saya' })
  assert(punyaSaya.length === 2, 'pesan sendiri dibuang')
  assert(!punyaSaya.some(n => n.rincian === 'Siap'), 'yang dibuang memang pesan sendiri')

  const tanpaId = susunNotifikasi({ chat })
  assert(tanpaId.length === 3, 'tanpa sayaId semuanya masuk — tidak menebak siapa yang sedang melihat')

  const fotoSaja = punyaSaya.find(n => n.id === 'chat:p3')
  assert(fotoSaja.rincian === 'Mengirim 2 foto',
    'foto tanpa teks tetap berbunyi sesuatu, bukan baris kosong')

  const biasa = punyaSaya.find(n => n.id === 'chat:p1')
  assert(biasa.judul === 'Pesan dari Suhanto', 'judulnya menyebut pengirimnya')
  assert(biasa.rincian === 'Besok cor kolom', 'isinya ditampilkan')
  assert(biasa.tautan === '/kontraktor/tim-chat', 'diketuk membawa ke Chat Tim')
  assert(biasa.proyek === 'Noble Cove', 'proyeknya ikut')
  assert(biasa.oleh === 'Suhanto', 'penulisnya tercatat untuk KPI')

  // Pesan bukan pekerjaan yang menunggu persetujuan; menandainya "menunggu"
  // akan membuat daftar tugas penuh oleh percakapan.
  assert(!biasa.menunggu, 'pesan tidak ditandai perlu tindakan')
  assert(!PERLU_TINDAKAN.includes('chat'), 'dan chat memang bukan jenis yang menunggu tindakan')

  assert(LABEL_JENIS.chat === 'Pesan Tim', 'punya label yang bisa dibaca')

  // Pesan tanpa waktu tidak bisa diurutkan maupun dihitung baru — dilewati.
  assert(susunNotifikasi({ chat: [{ id: 'x', teks: 'a' }] }).length === 0,
    'pesan tanpa created_at dilewati, bukan diberi waktu karangan')
}

// ── 5. Semua kabar bercampur dalam satu urutan waktu ───────────────────
{
  const semua = susunNotifikasi({
    chat: [{ id: 'c1', penulis_id: 'u2', penulis_nama: 'Budi', teks: 'halo', created_at: '2026-08-19T12:00:00Z' }],
    laporan: [{ id: 'l1', pelapor: 'Yono', kegiatan: 'Cor kolom', created_at: '2026-08-19T15:00:00Z' }],
    invoice: [{ id: 'i1', vendor_nama: 'CV Barus', total: 5_800_000, created_at: '2026-08-19T09:00:00Z', status: 'masuk' }],
  })
  assert(semua.length === 3, 'ketiganya masuk')
  assert(semua[0].jenis === 'laporan', 'terbaru di atas')
  assert(semua[2].jenis === 'invoice', 'terlama di bawah')
  assert(semua.find(n => n.jenis === 'invoice').menunggu === true, 'tagihan tetap menunggu tindakan')
}

console.log(`kabar-baru: ${ok} assert lulus`)
