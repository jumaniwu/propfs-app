// ============================================================
// Cubit untuk memperbesar, seret untuk menggeser.
//
// Denah dibaca dengan cara berbeda dari dokumen: yang dicari bukan kalimat
// melainkan ANGKA di sudut gambar — dimensi kolom, jarak as, elevasi. Angka
// itu ditulis untuk kertas A1; di layar 390 piksel ia setinggi satu-dua
// piksel. Bukan kecil, melainkan tidak ada.
//
// Jadi yang diuji di sini bukan "zoom-nya jalan", melainkan dua hal yang
// membuat zoom terasa melawan pemakainya kalau salah:
//
//   1. Titik yang dicubit HARUS TETAP DI TEMPATNYA.
//   2. Gambar tidak boleh bisa diseret keluar layar.
// ============================================================
import {
  SKALA_MIN, SKALA_MAKS, SKALA_KETUK, ZOOM_AWAL,
  batasSkala, geserTerbatas, zoomKeTitik, skalaKetukGanda,
  jarak, tengah, skalaCubit, sedangDiperbesar, tangkapSeretan,
} from '../src/lib/zoomGeser.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }
const dekat = (a, b, toleransi = 0.001) => Math.abs(a - b) <= toleransi

// Layar HP 390x700, denah A1 lanskap yang dirender selebar layar.
const U = { lebarLayar: 390, tinggiLayar: 700, lebarKonten: 390, tinggiKonten: 275 }

// ── 1. Batas skala ───────────────────────────────────────────────────────
assert(batasSkala(1) === 1, 'skala 1 diterima')
assert(batasSkala(0.2) === SKALA_MIN, 'lebih kecil dari utuh dikembalikan ke utuh')
assert(batasSkala(-5) === SKALA_MIN, 'negatif tidak menghasilkan gambar terbalik')
assert(batasSkala(999) === SKALA_MAKS, 'dibatasi di atas')
assert(batasSkala('ngawur') === SKALA_MIN, 'bukan angka jatuh ke utuh')
assert(batasSkala(NaN) === SKALA_MIN, 'NaN aman')
assert(batasSkala(undefined) === SKALA_MIN, 'tanpa nilai aman')
assert(SKALA_MAKS > SKALA_KETUK && SKALA_KETUK > SKALA_MIN, 'urutannya masuk akal')

// ── 2. TITIK YANG DICUBIT TETAP DI TEMPATNYA — inti seluruh modul ────────
//
// Kalau pusatnya selalu tengah layar, gambar yang sedang dilihat MELOMPAT
// PERGI tepat ketika orangnya mencoba memperbesarnya. Rasanya seperti alat
// yang melawan.
{
  // Memperbesar 2x dengan jari di 100px kanan dari tengah.
  const pusat = { x: 100, y: 50 }
  const z = zoomKeTitik({ skala: 1, x: 0, y: 0 }, 2, pusat)

  // Titik konten yang tadi ada di bawah jari harus tetap ada di bawah jari.
  // Sebelum: layar 100 → konten (100 - 0) / 1 = 100.
  // Sesudah: konten 100 harus mendarat kembali di layar 100.
  const kontenSetelah = (pusat.x - z.x) / z.skala
  assert(dekat(kontenSetelah, 100), `titik konten di bawah jari tidak bergeser (${kontenSetelah})`)
  const kontenY = (pusat.y - z.y) / z.skala
  assert(dekat(kontenY, 50), `begitu pula pada sumbu tegak (${kontenY})`)

  // Memperkecil kembali ke 1 dengan pusat yang sama mengembalikan keadaannya.
  const balik = zoomKeTitik(z, 1, pusat)
  assert(dekat(balik.skala, 1) && dekat(balik.x, 0) && dekat(balik.y, 0),
    'kembali ke skala 1 dengan pusat sama memulihkan posisi semula')

  // Pusat di tengah persis: tidak ada geseran yang timbul.
  const tengahLayar = zoomKeTitik({ skala: 1, x: 0, y: 0 }, 3, { x: 0, y: 0 })
  assert(dekat(tengahLayar.x, 0) && dekat(tengahLayar.y, 0),
    'memperbesar dari tengah tidak menggeser apa pun')

  // Skala di luar batas tetap dijepit, dan hitungannya memakai skala yang
  // SUDAH dijepit — kalau tidak, geserannya dihitung untuk perbesaran yang
  // tidak pernah terjadi, dan gambarnya melompat.
  const mentok = zoomKeTitik({ skala: 1, x: 0, y: 0 }, 999, pusat)
  assert(mentok.skala === SKALA_MAKS, 'skala dijepit')
  const kontenMentok = (pusat.x - mentok.x) / mentok.skala
  assert(dekat(kontenMentok, 100), 'dan titiknya TETAP di tempatnya walau skalanya dijepit')
}

// ── 3. Tidak bisa diseret keluar layar ──────────────────────────────────
{
  // Skala 1: konten lebih pendek daripada layar pada sumbu tegak → terkunci.
  const kunci = geserTerbatas({ skala: 1, x: 500, y: 500 }, U)
  assert(kunci.x === 0 && kunci.y === 0,
    'pada skala 1 tidak ada yang bisa digeser — tidak ada yang tersembunyi di luar')

  // Skala 2: lebar konten 780 pada layar 390 → boleh geser ±195.
  const luas = geserTerbatas({ skala: 2, x: 9999, y: 0 }, U)
  assert(dekat(luas.x, 195), `geseran mentok di tepi konten (${luas.x})`)
  const kiri = geserTerbatas({ skala: 2, x: -9999, y: 0 }, U)
  assert(dekat(kiri.x, -195), 'begitu pula ke arah sebaliknya')

  // Tinggi konten pada skala 2 = 550, masih lebih pendek dari layar 700 →
  // sumbu tegak tetap terkunci. Denah lanskap memang tidak punya apa pun di
  // atas dan bawah; membiarkannya bergeser membuat orang menyangka gambarnya
  // "lari".
  assert(geserTerbatas({ skala: 2, x: 0, y: 300 }, U).y === 0,
    'sumbu yang kontennya lebih pendek dari layar dikunci ke nol')

  // Pada skala 4 tingginya 1100 > 700 → baru boleh naik-turun ±200.
  const tegak = geserTerbatas({ skala: 4, x: 0, y: 9999 }, U)
  assert(dekat(tegak.y, 200), `sumbu tegak terbuka setelah cukup besar (${tegak.y})`)

  // Geseran yang masih di dalam batas tidak diubah.
  const wajar = geserTerbatas({ skala: 2, x: 100, y: 0 }, U)
  assert(wajar.x === 100, 'yang wajar dibiarkan apa adanya')

  // Masukan rusak tidak menghasilkan NaN yang membekukan tampilannya.
  const rusak = geserTerbatas({ skala: NaN, x: 'x', y: undefined }, U)
  assert(Number.isFinite(rusak.x) && Number.isFinite(rusak.y) && Number.isFinite(rusak.skala),
    'masukan rusak tetap menghasilkan angka')
  const tanpaUkuran = geserTerbatas({ skala: 2, x: 50, y: 50 }, {})
  assert(tanpaUkuran.x === 0 && tanpaUkuran.y === 0, 'tanpa ukuran: dikunci, bukan melempar')
}

// ── 4. zoomKeTitik dengan batas sekaligus ───────────────────────────────
{
  // Memperbesar di tepi kanan jauh tidak boleh melempar konten keluar layar.
  const z = zoomKeTitik({ skala: 1, x: 0, y: 0 }, 2, { x: 195, y: 0 }, U)
  assert(Math.abs(z.x) <= 195.001, `geserannya ikut dibatasi (${z.x})`)
  assert(z.y === 0, 'sumbu tegak tetap terkunci pada skala ini')
}

// ── 5. Ketukan ganda: dua keadaan, bukan tangga ─────────────────────────
//
// Tangga bertingkat yang mengharuskan mengetuk empat kali untuk kembali utuh
// membuat orang menutup gambarnya lalu membukanya lagi — lebih lambat
// daripada seluruh yang hendak dihemat.
assert(skalaKetukGanda(1) === SKALA_KETUK, 'dari utuh: mendekat')
assert(skalaKetukGanda(SKALA_KETUK) === SKALA_MIN, 'dari dekat: kembali utuh')
assert(skalaKetukGanda(8) === SKALA_MIN, 'dari sangat dekat: langsung utuh, bukan turun setingkat')
assert(skalaKetukGanda(1.005) === SKALA_KETUK, 'sisa pembulatan tetap dihitung sebagai utuh')

// ── 6. Cubitan dihitung dari jarak AWAL, bukan bertahap ─────────────────
//
// Menghitung bertahap membuat galat pembulatan menumpuk sepanjang gerakan:
// jari kembali ke jarak semula, tetapi gambarnya tidak kembali ke ukuran
// semula — dan orang tidak bisa mengembalikannya selain dengan menutupnya.
{
  assert(dekat(skalaCubit(1, 100, 200), 2), 'jari direnggangkan dua kali: skala dua kali')
  assert(dekat(skalaCubit(2, 100, 50), 1), 'dirapatkan setengah: kembali ke satu')
  assert(skalaCubit(1, 100, 99999) === SKALA_MAKS, 'tetap dibatasi di atas')
  assert(skalaCubit(1, 100, 1) === SKALA_MIN, 'dan di bawah')
  assert(skalaCubit(2, 0, 100) === 2, 'jarak awal nol: skala tidak berubah, bukan tak hingga')
  assert(Number.isFinite(skalaCubit('x', 'y', 'z')), 'masukan rusak tetap menghasilkan angka')

  // Bolak-balik ke jarak semula mengembalikan skala semula, persis.
  const awal = 1.7
  assert(dekat(skalaCubit(awal, 120, 120), awal), 'jarak kembali: skala kembali persis')
}

// ── 7. Jarak & titik tengah dua jari ────────────────────────────────────
assert(jarak({ x: 0, y: 0 }, { x: 3, y: 4 }) === 5, 'jarak 3-4-5')
assert(jarak({ x: 5, y: 5 }, { x: 5, y: 5 }) === 0, 'dua jari di titik sama: nol')
assert(Number.isFinite(jarak(null, undefined)), 'masukan kosong tidak melempar')
{
  const t = tengah({ x: 0, y: 0 }, { x: 10, y: 20 })
  assert(t.x === 5 && t.y === 10, 'titik tengah benar')
  const kosong = tengah(null, null)
  assert(kosong.x === 0 && kosong.y === 0, 'masukan kosong aman')
}

// ── 8. Siapa yang menerima seretan ──────────────────────────────────────
//
// Selama belum diperbesar, satu-satunya gerakan yang masuk akal adalah
// menggulung daftar halaman — merebutnya membuat daftar terasa macet. Begitu
// diperbesar, seretan berarti menggeser gambar; membiarkannya lolos membuat
// gambar yang sedang diperiksa hanyut pergi.
assert(sedangDiperbesar({ skala: 1 }) === false, 'skala 1 bukan diperbesar')
assert(sedangDiperbesar({ skala: 1.005 }) === false, 'sisa pembulatan bukan diperbesar')
assert(sedangDiperbesar({ skala: 2 }) === true, 'skala 2 diperbesar')
assert(tangkapSeretan({ skala: 1 }) === false, 'belum diperbesar: biarkan halaman menggulung')
assert(tangkapSeretan({ skala: 2 }) === true, 'sudah diperbesar: seretan menggeser gambar')

// ── 9. Keadaan awal ─────────────────────────────────────────────────────
assert(ZOOM_AWAL.skala === SKALA_MIN && ZOOM_AWAL.x === 0 && ZOOM_AWAL.y === 0,
  'mulai dari gambar utuh di tengah')

console.log(`zoom-geser: ${ok} assert lulus`)
