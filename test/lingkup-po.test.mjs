// ============================================================
// PO milik proyek mana.
//
// Buku pengeluaran dipegang PER PROYEK, tetapi PO disimpan satu kolam untuk
// seluruh workspace. Panel "Sudah ada di Procurement" karena itu menawarkan
// setiap surat jalan kepada setiap proyek: membuka Noble Cove menampilkan
// pembelian kayu milik proyek Pak Soni, lengkap dengan tombolnya.
//
// Yang terjadi berikutnya bukan sekadar salah tempat. Satu ketukan di proyek
// keliru membukukan biaya itu di sana; ketukan yang sama di proyek yang benar
// membukukannya lagi. Dua-duanya mengalir ke laba rugi dan ke neraca, dan
// tidak ada yang menyadarinya sampai seseorang menghitung ulang dengan tangan.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  poTanpaProyek, poMilikProyek, usulUntukProyek, peringatanTanpaProyek,
  pilihanProyekPo,
} from '../src/lib/lingkupPo.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const po = (nama) => ({ nomor: 'PO/008/08/2026', project_name: nama })

// ── 1. PO proyek lain TIDAK PERNAH ikut ──────────────────────────────
//
// Inilah seluruh keluhannya: kayu milik proyek Pak Soni muncul di Noble Cove.
{
  assert(poMilikProyek(po('Noble Cove'), 'Noble Cove') === true, 'proyeknya sendiri')
  assert(poMilikProyek(po('Rumah Pak Soni'), 'Noble Cove') === false,
    'proyek lain tidak ikut — ini bug yang diperbaiki')
  assert(poMilikProyek(po('  noble cove  '), 'Noble Cove') === true,
    'beda spasi & huruf besar tetap dianggap sama; nama diketik tangan di dua tempat')
}

// ── 2. Lingkup kosong berarti "semua proyek" ────────────────────────
//
// Dipakai konsolidasi, tempat memang semuanya boleh terlihat.
{
  assert(poMilikProyek(po('Rumah Pak Soni'), '') === true, 'konsolidasi: semua ikut')
  assert(poMilikProyek(po('Rumah Pak Soni'), null) === true, 'kosong aman')
  assert(poMilikProyek(po('Rumah Pak Soni'), '   ') === true, 'spasi saja = semua')
}

// ── 3. PO tanpa proyek TIDAK disembunyikan ──────────────────────────
//
// Menyembunyikannya membuatnya tidak bisa dicatat dari layar mana pun — jauh
// lebih merugikan daripada menampilkannya dengan peringatan. Data lama banyak
// yang begini.
{
  assert(poTanpaProyek(po('')) === true, 'kosong')
  assert(poTanpaProyek(po('   ')) === true, 'spasi saja tetap "tanpa proyek"')
  assert(poTanpaProyek(po(undefined)) === true, 'kolomnya belum ada: tanpa proyek')
  assert(poTanpaProyek(po('Noble Cove')) === false, 'ada proyeknya')
  assert(poTanpaProyek(null) === true, 'kosong aman')

  const usul = [
    { po: po('Noble Cove') }, { po: po('Rumah Pak Soni') }, { po: po('') },
  ]
  const hasil = usulUntukProyek(usul, 'Noble Cove')
  assert(hasil.length === 2, 'proyeknya sendiri + yang tanpa proyek')
  assert(!hasil.some(u => u.po.project_name === 'Rumah Pak Soni'), 'proyek lain benar-benar hilang')
  assert(hasil.some(u => u.po.project_name === ''),
    'yang tanpa proyek tetap terjangkau — kalau tidak, ia tidak bisa dicatat dari mana pun')

  assert(usulUntukProyek(usul, '').length === 3, 'konsolidasi: semuanya')
  assert(usulUntukProyek(null, 'X').length === 0, 'kosong aman')
}

// ── 4. Peringatannya menyebut AKIBATNYA ─────────────────────────────
//
// "Proyek kosong" tidak memberi tahu apa pun tentang mengapa itu berbahaya.
{
  const p = peringatanTanpaProyek('PO/008/08/2026')
  assert(/PO\/008\/08\/2026/.test(p), 'menyebut PO-nya')
  assert(/dua kali|ganda/i.test(p), 'menerangkan akibatnya: biaya terhitung dua kali')
  assert(/satu proyek/i.test(p), 'dan memberi aturannya')
  assert(typeof peringatanTanpaProyek(null) === 'string', 'kosong aman')
  assert(!/undefined|null/.test(peringatanTanpaProyek(undefined)), 'tidak membocorkan nilai kosong')
}

// ── 5. Pilihan proyek: "Tanpa proyek" PALING BAWAH ─────────────────
//
// Ia jalan keluar untuk pembelian yang memang bukan milik proyek mana pun,
// bukan bawaan yang dipilih orang karena letaknya paling dekat dengan jari.
{
  const opsi = pilihanProyekPo([{ projectName: 'Noble Cove' }, { projectName: 'Rumah Pak Soni' }])
  assert(opsi.length === 3, 'dua proyek + satu jalan keluar')
  assert(opsi[0].nilai === 'Noble Cove', 'proyek lebih dulu')
  assert(opsi[opsi.length - 1].nilai === '', 'tanpa proyek di paling bawah')
  assert(/[Tt]anpa proyek/.test(opsi[opsi.length - 1].label), 'labelnya jelas')

  // Nama yang sama dari dua sumber tidak boleh muncul dua kali di dropdown.
  const kembar = pilihanProyekPo([
    { projectName: 'Noble Cove' }, { nama: 'noble cove' }, { nama: '' },
  ])
  assert(kembar.length === 2, 'nama kembar (beda huruf besar) digabung, yang kosong dibuang')
  assert(pilihanProyekPo(null).length === 1, 'tanpa proyek sama sekali: hanya jalan keluarnya')
}

// ── 6. Aturannya dijaga di sumbernya, bukan hanya di komentar ───────
//
// Ketiga hal di bawah ini gampang sekali dikembalikan tanpa sengaja oleh
// perubahan berikutnya, dan tak satu pun akan terlihat sampai ada yang
// menghitung ulang laporan keuangannya dengan tangan.
{
  const akar = new URL('../src', import.meta.url).pathname
  const baca = (rel) => readFileSync(join(akar, rel), 'utf8')

  // a. Panel usulan WAJIB menyaring menurut proyek.
  const panel = baca('components/cost/PanelDariProcurement.tsx')
  assert(/usulUntukProyek\(/.test(panel),
    'panel menyaring usulan menurut proyek — tanpa ini PO proyek lain muncul lagi')
  assert(/namaProyek/.test(panel), 'dan menerima proyek yang sedang dibuka')

  // b. Pemanggilnya wajib benar-benar mengirimkan proyeknya. Prop yang lupa
  //    diisi membuat penyaringnya diam-diam berarti "semua proyek" — persis
  //    keadaan sebelum perbaikan ini, tanpa satu pun tanda bahwa ia kembali.
  const tab = baca('components/cost/TabRealisasiBiaya.tsx')
  assert(/namaProyek=\{projectInfo/.test(tab),
    'buku pengeluaran mengirim nama proyeknya ke panel usulan')

  // c. PDF vendor TIDAK BOLEH mencetak nama proyek. Ia catatan internal, dan
  //    nama proyek sering nama pemiliknya — setiap vendor yang menerima PO
  //    akan tahu siapa saja klien kita.
  const pdf = baca('lib/poPdf.ts')
  assert(!/\['Proyek',/.test(pdf), 'baris "Proyek" tidak dicetak di PDF vendor')
  assert(/kirim_alamat/.test(pdf), 'yang dicetak alamat kirimnya — itu yang vendor perlukan')
}

console.log(`lingkup-po: ${ok} assert lulus`)
