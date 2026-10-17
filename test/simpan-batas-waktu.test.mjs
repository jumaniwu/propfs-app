// ============================================================
// Penyimpanan yang MENGGANTUNG adalah kegagalan yang paling sulit dikenali.
//
// Tombol "Simpan & Publish Hitungan" tetap tidak berbuat apa-apa walau
// tata letaknya sudah diperbaiki. Petunjuknya ada di header: penanda
// "Menyimpan…" menyala dan tidak pernah padam.
//
// Sebabnya upsert ke Supabase tidak punya batas waktu sama sekali. Di
// jaringan seluler yang tersendat, `await`-nya tidak pernah selesai DAN
// tidak pernah menolak — jadi `try/catch` pun tidak pernah dijalankan,
// `isSaving` menyala selamanya, dan handleCalculate menunggu tanpa batas.
// Tidak ada galat, tidak ada toast, tidak ada perpindahan halaman.
//
// Yang diuji di sini perilakunya, bukan hanya kelasnya: sebuah janji yang
// memang tidak pernah selesai dijalankan lewat pola yang sama, dan
// dituntut berakhir.
// ============================================================
import { readFileSync } from 'node:fs'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const store = readFileSync(new URL('../src/store/fsStore.ts', import.meta.url), 'utf8')
const hal = readFileSync(new URL('../src/pages/InputPage.tsx', import.meta.url), 'utf8')

// ── 1. Perilaku: permintaan menggantung HARUS berakhir ──────────────
//
// Meniru bentuk yang dipakai fsStore: AbortController + setTimeout, lalu
// sebuah janji yang tidak pernah selesai sendiri.
{
  const BATAS = 60
  const mulai = Date.now()
  let isSaving = true
  let pesan = ''

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), BATAS)

  // Janji yang MENGGANTUNG: tidak pernah selesai, tidak pernah menolak —
  // persis permintaan jaringan yang tersendat.
  const menggantung = new Promise(() => {})
  const denganSinyal = new Promise((selesai, gagal) => {
    ctrl.signal.addEventListener('abort', () => {
      const e = new Error('The user aborted a request.')
      e.name = 'AbortError'
      gagal(e)
    })
    menggantung.then(selesai, gagal)
  })

  try {
    await denganSinyal
    assert(false, 'seharusnya tidak pernah sampai ke sini')
  } catch (e) {
    pesan = e.name
  } finally {
    clearTimeout(timer)
    isSaving = false
  }

  const lama = Date.now() - mulai
  assert(pesan === 'AbortError', 'permintaan yang menggantung akhirnya dibatalkan')
  assert(isSaving === false, 'penanda "sedang menyimpan" akhirnya padam')
  assert(lama >= BATAS - 20, `tidak berakhir terlalu cepat (${lama}ms)`)
  assert(lama < BATAS + 2000, `berakhir dalam batas waktunya (${lama}ms)`)
}

// ── 2. Kalimat untuk waktu habis bisa ditindaklanjuti ───────────────
//
// Fungsinya diambil dari sumbernya supaya yang diuji benar-benar yang
// dipakai, bukan salinan yang bisa menyimpang diam-diam.
{
  const src = store.match(/function pesanSimpanGagal\(e: unknown\): string \{[\s\S]*?\n\}/)[0]
  const js = src.replace(/: unknown/g, '').replace(/: string/g, '')
  const pesanSimpanGagal = new Function(`${js}; return pesanSimpanGagal`)()

  const batal = new Error('The user aborted a request.')
  batal.name = 'AbortError'
  const p = pesanSimpanGagal(batal)
  assert(/[Ww]aktu habis/.test(p), 'waktu habis disebut apa adanya')
  assert(/koneksi/i.test(p), 'penyebabnya disebut: koneksinya')
  assert(/tetap aman di perangkat/i.test(p), 'menenangkan soal isiannya')

  // Kegagalan biasa TIDAK boleh disamarkan menjadi waktu habis.
  const biasa = pesanSimpanGagal(new Error('new row violates row-level security policy'))
  assert(/row-level security/.test(biasa), 'pesan server yang sebenarnya diteruskan')
  assert(!/[Ww]aktu habis/.test(biasa), 'bukan waktu habis, jadi tidak disebut begitu')

  assert(pesanSimpanGagal(null) === 'Gagal menyimpan ke server.', 'masukan kosong tetap berpesan')
}

// ── 3. Batas waktunya memang terpasang di penyimpanan ───────────────
{
  const blok = store.match(/saveCurrentProject: async \(\) => \{[\s\S]*?\n  \},/)[0]
  assert(/new AbortController\(\)/.test(blok), 'ada pembatal permintaan')
  assert(/setTimeout\(\(\) => ctrl\.abort\(\), BATAS_SIMPAN_MS\)/.test(blok), 'batas waktunya dipasang')
  assert(/\.abortSignal\(ctrl\.signal\)/.test(blok), 'sinyalnya benar-benar diberikan ke permintaannya')
  assert(/clearTimeout\(timer\)/.test(blok), 'pengatur waktunya dibersihkan')
  assert(/pesanSimpanGagal\(e\)/.test(blok), 'kegagalannya diterjemahkan, bukan dilempar mentah')

  // Dibersihkan di `finally`, bukan di jalur sukses saja — kalau tidak,
  // setiap kegagalan meninggalkan satu timer hidup.
  const ekor = blok.match(/\} finally \{[\s\S]*?\n    \}/)[0]
  assert(/clearTimeout\(timer\)/.test(ekor), 'dibersihkan di finally')
  assert(/isSaving: false/.test(ekor), 'penandanya dipadamkan di finally')

  const batas = Number(store.match(/const BATAS_SIMPAN_MS = (\d+)/)[1])
  assert(batas >= 10000 && batas <= 60000, `batasnya masuk akal (${batas}ms)`)
}

// ── 4. Tombolnya mengatakan bahwa ia sedang bekerja ─────────────────
//
// Tanpa ini, tombol yang sedang menunggu tidak bisa dibedakan dari tombol
// yang rusak — dan yang menekannya menekannya berkali-kali.
{
  assert(/const \[menghitung, setMenghitung\] = useState\(false\)/.test(hal), 'ada penanda sedang bekerja')
  assert(/if \(menghitung\) return/.test(hal), 'tekanan kedua tidak memulai penyimpanan baru')
  assert(/setMenghitung\(true\)/.test(hal), 'dinyalakan saat mulai')

  const blok = hal.match(/async function handleCalculate\(\)[\s\S]*?\n  \}/)[0]
  assert(/\} finally \{\s*\n\s*setMenghitung\(false\)/.test(blok),
    'dipadamkan di finally — kalau hanya di jalur sukses, kegagalan mengunci tombolnya selamanya')

  assert(/disabled=\{menghitung\}/.test(hal), 'tombolnya dimatikan selagi bekerja')
  assert(/Menyimpan…/.test(hal), 'dan mengatakan apa yang sedang dikerjakannya')
  assert(/animate-spin/.test(hal), 'disertai penanda yang bergerak')
}

console.log(`simpan-batas-waktu: ${ok} assert lulus`)
