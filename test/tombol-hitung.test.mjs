// ============================================================
// Tombol "Simpan & Publish Hitungan" harus bisa disentuh, dan harus
// mengerjakan apa yang dijanjikannya.
//
// DUA CACAT YANG BERBEDA, KEDUANYA TERLIHAT SAMA DARI LUAR:
// "tombolnya tidak bisa diklik".
//
// 1. BARISNYA LEBIH LEBAR DARIPADA LAYAR. Dijejer dengan `justify-between`
//    dan label sepanjang "Simpan & Publish Hitungan", baris tombolnya
//    menjulur 56 piksel ke luar layar 390 — dan pada langkah 6, tombol
//    "Selanjutnya" menjulur 105 piksel. Halamannya memang bisa digeser ke
//    samping, tapi tidak ada yang menyangka harus menggesernya: yang
//    terlihat hanya tombol terpotong yang setengahnya di luar layar.
//    Angka-angka itu diukur dengan Playwright di lebar 360/390/412.
//
// 2. SUKSES YANG TIDAK MELAKUKAN APA-APA. Perpindahan ke halaman hasil
//    berada di balik `if (currentProjectId)` tanpa cabang lain, sementara
//    toast di atasnya sudah menjanjikan "Navigasi ke halaman hasil FS".
//    Ketika id-nya kosong: pesan hijau, lalu halamannya diam di tempat.
//
// Yang diuji di sini kelasnya, bukan pikselnya — pengukuran pikselnya
// dikerjakan Playwright saat perbaikan dibuat, dan kelas-kelas inilah yang
// membuat hasilnya bertahan.
// ============================================================
import { readFileSync } from 'node:fs'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const hal = readFileSync(new URL('../src/pages/InputPage.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store/fsStore.ts', import.meta.url), 'utf8')

// ── 1. Baris tombol menumpuk di ponsel ──────────────────────────────
{
  assert(/flex flex-col-reverse gap-3 pt-2 sm:flex-row/.test(hal),
    'baris tombolnya menumpuk di layar kecil, menjejer mulai sm')
  assert(!/className="flex items-center justify-between gap-3 pt-2"/.test(hal),
    'tata letak lama yang menjejer tanpa syarat sudah tidak ada')

  // Tertumpuk saja tidak cukup: tombolnya harus MELEBAR, kalau tidak ia
  // tetap selebar isinya dan tetap bisa melewati tepi layar.
  assert(/onClick=\{handleBack\}[\s\S]{0,160}w-full sm:w-auto/.test(hal),
    'tombol Sebelumnya melebar penuh di ponsel')
  assert(/<div className="flex gap-2 w-full sm:w-auto">/.test(hal),
    'kelompok tombol kanan melebar penuh di ponsel')
}

// ── 2. Setiap tombol aksi ikut melebar ──────────────────────────────
//
// Yang tertinggal satu pun akan menahan lebar barisnya sendiri.
{
  for (const [nama, pola] of [
    // `[^>]*` TIDAK bisa dipakai di sini: onClick-nya memuat arrow function,
    // dan tanda `>` miliknya menghentikan pencocokan sebelum sampai className.
    ['Simpan & Publish Hitungan', /variant="gold"[\s\S]{0,200}?flex-1 sm:flex-none/],
    ['Hitung Sekarang', /className="gap-2 text-sm flex-1 sm:flex-none"/],
    ['Simpan Draft', /className="gap-2 text-sm text-navy flex-1 sm:flex-none"/],
    ['Selanjutnya', /onClick=\{handleNext\} className="gap-2 flex-1 sm:flex-none"/],
  ]) {
    assert(pola.test(hal), `tombol ${nama} ikut melebar di ponsel`)
  }
}

// ── 3. Janji perpindahan selalu ditepati, atau dikatakan ────────────
{
  // Polanya harus mencakup cabang else-nya sekalian: berhenti di `}` yang
  // pertama justru memotong tepat sebelum bagian yang sedang diperiksa.
  const blok = hal.match(/if \(currentProjectId\) \{[\s\S]*?\n      \} else \{[\s\S]*?\n      \}/)[0]
  assert(/navigate\(`\/result\/\$\{currentProjectId\}`\)/.test(blok), 'masih berpindah seperti dulu')
  assert(/\} else \{/.test(blok), 'ada cabang untuk keadaan id kosong')
  assert(/Halaman hasil belum bisa dibuka/.test(hal),
    'id yang kosong dikatakan, bukan didiamkan')
  assert(/variant: 'destructive'/.test(blok), 'disampaikan sebagai kegagalan, bukan kabar biasa')
  assert(/isian Anda tetap tersimpan di perangkat/i.test(hal),
    'menenangkan soal isiannya, karena yang gagal cuma pindah halamannya')
}

// ── 4. Penyimpanan tanpa id tidak lagi pulang diam-diam ─────────────
//
// Pemanggilnya memeriksa `simpanGagal` untuk tahu berhasil atau tidak.
// Pulang diam-diam membuat kegagalan itu terbaca sebagai keberhasilan.
{
  const blok = store.match(/saveCurrentProject: async \(\) => \{[\s\S]*?set\(\{ isSaving: true \}\)/)[0]
  assert(/if \(!currentProjectId\) \{/.test(blok), 'penjaganya punya badan, bukan return telanjang')
  assert(/simpanGagal:/.test(blok), 'kegagalannya dicatat supaya pemanggilnya tahu')
  assert(!/if \(!currentProjectId\) return\b/.test(blok), 'return diam-diam sudah tidak ada')
}

// ── 5. Tidak ada berkas pratinjau yang tertinggal ───────────────────
//
// Pengukurannya memakai halaman pratinjau sementara. Kalau ikut terbawa,
// ia menjadi halaman yang bisa dibuka siapa saja di produksi.
{
  const { readdirSync } = await import('node:fs')
  const src = readdirSync(new URL('../src', import.meta.url).pathname)
  const akar = readdirSync(new URL('..', import.meta.url).pathname)
  assert(!src.some(f => f.startsWith('preview-')), 'tidak ada src/preview-* yang tertinggal')
  assert(!akar.some(f => f.startsWith('preview-')), 'tidak ada preview-*.html yang tertinggal')
}

console.log(`tombol-hitung: ${ok} assert lulus`)
