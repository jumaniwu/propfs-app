// ============================================================
// Reset yang tidak bisa dibatalkan, dan yang mengejar data ke perangkat lain.
//
// Tombol "Reset" di Realisasi Biaya menghapus SELURUH pengeluaran proyek
// dengan satu dialog yang mudah ditekan tanpa dibaca. Sekali tertekan, tidak
// ada jalan kembali.
//
// Yang membuatnya tidak bisa dibatalkan bukan penghapusannya, melainkan
// NISAN-nya: tiap id yang dibuang dicatat "sengaja dihapus", dan catatan itu
// ikut tersinkron. Nisan itu memang harus ada — tanpanya semuanya hidup lagi
// pada sinkronisasi berikutnya. Tetapi akibatnya, salinan yang masih ada di
// laptop pun IKUT TERHAPUS begitu laptop itu menyinkron.
//
// Karena itu memulihkan bukan sekadar menambahkan entrinya kembali. Nisannya
// harus diangkat pada saat yang sama — kalau tidak, entri yang baru dipulihkan
// lenyap lagi pada sinkronisasi berikutnya, dan yang memulihkannya mengira
// dirinya salah tekan untuk kedua kalinya.
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bacaEntriPulih, rencanaPulihRealisasi, kalimatPulihRealisasi,
} from '../src/lib/pulihRealisasi.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const e = (id, jumlah, extra = {}) => ({
  id, tipe: 'material', tanggal: '2026-09-01', jumlah,
  namaMaterial: `Barang ${id}`, ...extra,
})

// ── 1. Salinan bisa datang dalam tiga bentuk ────────────────────────
//
// Tiga-tiganya yang mungkin dipegang orang saat sedang panik: isi localStorage
// apa adanya, satu objek proyek, atau larik entri telanjang.
{
  const entri = [e('a', 100), e('b', 200)]
  assert(bacaEntriPulih(entri).length === 2, 'larik entri telanjang terbaca')
  assert(bacaEntriPulih({ realisasiEntries: entri }).length === 2, 'satu objek proyek terbaca')
  assert(bacaEntriPulih([{ info: { id: 'P1' }, realisasiEntries: entri }]).length === 2,
    'larik proyek (isi localStorage) terbaca')
}

// ── 2. Proyek yang salah TIDAK ikut terbawa ─────────────────────────
//
// Menggabungkan pengeluaran dua proyek jauh lebih merusak daripada tidak
// memulihkan apa pun: angkanya akan terlihat masuk akal dan tetap salah.
{
  const simpanan = [
    { info: { id: 'P1' }, realisasiEntries: [e('a', 100)] },
    { info: { id: 'P2' }, realisasiEntries: [e('z', 999)] },
  ]
  const hanyaP1 = bacaEntriPulih(simpanan, 'P1')
  assert(hanyaP1.length === 1 && hanyaP1[0].id === 'a', 'hanya proyek yang diminta')
  assert(bacaEntriPulih(simpanan).length === 2, 'tanpa id proyek, semuanya — pemanggilnya yang memilih')
}

// ── 3. NISAN DIANGKAT, dan hanya milik yang dipulihkan ──────────────
//
// Ini inti berkas ini. Tanpa mengangkat nisan, entrinya muncul sebentar lalu
// hilang sendiri pada sinkronisasi berikutnya.
{
  const r = rencanaPulihRealisasi(
    [e('a', 100), e('b', 200)],
    [],
    [{ id: 'a' }, { id: 'b' }, { id: 'lain' }],
  )
  assert(r.entri.length === 2, 'kedua entri dipulihkan')
  assert(r.nisanDiangkat.length === 2, 'nisan keduanya diangkat')
  assert(!r.nisanDiangkat.includes('lain'),
    'nisan milik entri LAIN tidak ikut diangkat — penghapusan yang disengaja tetap berlaku')
  assert(r.totalRupiah === 300, 'nominalnya bisa dicocokkan mata')
}

// ── 4. Nisan TIDAK menghalangi — di sini ia yang dibatalkan ─────────
//
// Berbeda dari pemulihan lain di aplikasi ini. Reset adalah penghapusan yang
// DISESALI; menghormati nisannya berarti menolak memulihkan apa pun.
{
  const r = rencanaPulihRealisasi([e('a', 100)], [], [{ id: 'a' }])
  assert(r.entri.length === 1, 'entri bernisan tetap dipulihkan')
}

// ── 5. Yang masih ada tidak diganggu ────────────────────────────────
{
  const r = rencanaPulihRealisasi([e('a', 100), e('b', 200)], [{ id: 'a' }], [])
  assert(r.entri.length === 1 && r.entri[0].id === 'b', 'hanya yang hilang')
  assert(r.sudahAda === 1, 'yang sudah ada dihitung, bukan ditimpa')
  assert(r.totalRupiah === 200, 'totalnya hanya yang benar-benar masuk')
}

// ── 6. Masukan rusak tidak merusak hasil ────────────────────────────
{
  assert(bacaEntriPulih(null).length === 0, 'null aman')
  assert(bacaEntriPulih('bukan objek').length === 0, 'teks aman')
  assert(rencanaPulihRealisasi(null, null, null).entri.length === 0, 'rencana dari null aman')

  const aneh = rencanaPulihRealisasi(
    [e('', 100), e('c', 0), e('d', 'bukan angka'), e('x', 50), e('x', 50)], [], [])
  assert(aneh.entri.length === 1 && aneh.entri[0].id === 'x',
    'tanpa id, nol, bukan angka, dan id kembar semuanya disaring')
  assert(aneh.dilewati.length === 3, 'dan yang ditolak dilaporkan beserta sebabnya')
  assert(!/NaN/.test(kalimatPulihRealisasi(aneh)), 'NaN tidak pernah sampai ke layar')
}

// ── 7. Kalimatnya menyebut nominal & nisan ──────────────────────────
{
  const s = kalimatPulihRealisasi(
    rencanaPulihRealisasi([e('a', 1_500_000), e('b', 500_000)], [], [{ id: 'a' }]))
  assert(/Rp 2\.000\.000/.test(s), 'nominal dalam format Indonesia')
  assert(/sudah dihapus/.test(s) && /sinkron/.test(s),
    'menjelaskan nisannya dibatalkan supaya tidak terhapus lagi')
}

// ── 8. Store & layar benar-benar memakainya ─────────────────────────
{
  const akar = new URL('../src', import.meta.url).pathname
  const tanpaKomentar = t => t.split('\n')
    .filter(b => { const x = b.trim(); return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*') })
    .join('\n')

  const store = tanpaKomentar(readFileSync(join(akar, 'store/costStore.ts'), 'utf8'))
  assert(/pulihkanRealisasi: \(entries\)/.test(store), 'store punya pemulihnya')
  assert(/nisanRealisasi: state\.nisanRealisasi\.filter\(n => !idBaru\.has/.test(store),
    'dan benar-benar MENGANGKAT nisannya')
  assert(/urungReset: \(\)/.test(store), 'ada jalan mengurungkan Reset')
  assert(/buanganReset = get\(\)\.realisasiEntries\.slice\(\)/.test(store),
    'Reset menyimpan buangannya lebih dulu')

  const tab = tanpaKomentar(readFileSync(join(akar, 'components/cost/TabRealisasiBiaya.tsx'), 'utf8'))
  assert(/Urungkan Reset/.test(tab), 'tombol urungkan ada di layar')
  assert(/baruDireset > 0/.test(tab), 'dan hanya muncul sesudah Reset ditekan')
  assert(/senilai Rp \$\{Math\.round\(total\)/.test(tab),
    'konfirmasi Reset menyebut NOMINALNYA — itu yang membuat orang berhenti sejenak')
  assert(/perangkat lain/.test(tab), 'dan menyebut jangkauannya ke perangkat lain')
  assert(/rencanaPulihRealisasi/.test(tab), 'pemulihan dari berkas ada di layar')
}

console.log(`pulih-realisasi: ${ok} assert lulus`)
