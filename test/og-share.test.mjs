// Test pratinjau tautan: meta per jenis halaman diganti, sisanya utuh.
import {
  HALAMAN_BAGIKAN, terapkanMeta, rewritesVercel, ruteHalaman, SITUS,
} from '../src/lib/ogShare.ts'
import { POLA_TAUTAN } from '../src/lib/tautanPendek.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

// Tiruan index.html hasil build: aset sudah ber-hash, ada font & analytics.
const html = `<!DOCTYPE html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <title>PropFS — Feasibility Study Properti Berbasis AI</title>
    <meta name="description" content="Platform AI untuk developer properti Indonesia." />
    <meta name="robots" content="index, follow" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://propfs.id/" />
    <meta property="og:title" content="PropFS — Buat Laporan Feasibility Study" />
    <meta property="og:description" content="Platform AI untuk developer properti." />
    <meta property="og:image" content="https://propfs.id/og-image.jpg" />
    <meta property="og:image:alt" content="PropFS" />
    <meta name="twitter:title" content="PropFS" />
    <meta name="twitter:description" content="Hitung cashflow, IRR, NPV." />
    <meta name="twitter:image" content="https://propfs.id/og-image.jpg" />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans" rel="stylesheet" />
    <script type="module" crossorigin src="/assets/index-Ab3xY9.js"></script>
    <link rel="stylesheet" href="/assets/index-Zz12.css" />
  </head>
  <body><div id="root"></div></body>
</html>`

const po = HALAMAN_BAGIKAN.find(h => h.berkas === 'po')
const hasil = terapkanMeta(html, po)

// ── Yang harus berubah ─────────────────────────────────────────────────────
assert(hasil.includes(`<title>${po.judul}</title>`), 'judul halaman diganti')
assert(hasil.includes(`content="${po.deskripsi}"`), 'deskripsi diganti')
assert(hasil.includes(`property="og:title" content="${po.judul}"`), 'og:title diganti')
assert(hasil.includes(`property="og:description" content="${po.deskripsi}"`), 'og:description diganti')
assert(hasil.includes(`property="og:image" content="${SITUS}/og/${po.gambar}"`), 'og:image menunjuk gambar jenis ini')
assert(hasil.includes(`name="twitter:title" content="${po.judul}"`), 'twitter:title diganti')
assert(hasil.includes(`name="twitter:image" content="${SITUS}/og/${po.gambar}"`), 'twitter:image diganti')
assert(hasil.includes(`property="og:url" content="${SITUS}/po"`), 'og:url memakai rute tanpa bagian token')
assert(!hasil.includes('og-image.jpg'), 'tidak ada sisa gambar lama')

// Halaman bertoken bersifat pribadi
assert(hasil.includes('name="robots" content="noindex, nofollow"'),
  'halaman bertoken ditandai noindex supaya tidak terindeks mesin pencari')

// ── Yang HARUS tetap utuh ──────────────────────────────────────────────────
// Ini intinya: kalau aset ber-hash ikut tersentuh, aplikasinya tidak jalan.
assert(hasil.includes('/assets/index-Ab3xY9.js'), 'skrip aplikasi ber-hash tidak tersentuh')
assert(hasil.includes('/assets/index-Zz12.css'), 'stylesheet ber-hash tidak tersentuh')
assert(hasil.includes('fonts.googleapis.com'), 'tautan font tetap ada')
assert(hasil.includes('<div id="root"></div>'), 'wadah aplikasi tetap ada')
assert(hasil.includes('property="og:type" content="website"'), 'meta yang tidak diatur dibiarkan')
assert(hasil.startsWith('<!DOCTYPE html>'), 'struktur dokumen utuh')

// ── Ketahanan ──────────────────────────────────────────────────────────────
// HTML tanpa tag yang dicari tidak boleh melempar error atau merusak isi.
const minim = '<html><head></head><body>halo</body></html>'
const aman = terapkanMeta(minim, po)
assert(aman.includes('halo'), 'HTML tanpa meta tetap dikembalikan utuh')

// Karakter khusus pada judul tidak boleh memutus atribut.
const nakal = { ...po, judul: 'PO "A" & <B>', deskripsi: 'x "y" & z' }
const lolos = terapkanMeta(html, nakal)
assert(lolos.includes('&quot;') && lolos.includes('&amp;'), 'tanda kutip & ampersand di-escape')
assert(!lolos.includes('content="PO "A"'), 'atribut tidak terputus oleh tanda kutip')
assert(!lolos.includes('<B>'), 'kurung sudut di-escape')

// ── Bentuk daftar halaman ──────────────────────────────────────────────────
assert(HALAMAN_BAGIKAN.length >= 8, 'seluruh jenis tautan yang dikirim punya pratinjau')
const berkas = HALAMAN_BAGIKAN.map(h => h.berkas)
assert(new Set(berkas).size === berkas.length, 'nama berkas tidak kembar')
const rute = HALAMAN_BAGIKAN.map(h => h.rute)
assert(new Set(rute).size === rute.length, 'rute tidak kembar')

for (const h of HALAMAN_BAGIKAN) {
  assert(h.judul.length > 10 && h.judul.length <= 70, `judul ${h.berkas} panjangnya wajar (terbaca di WhatsApp)`)
  assert(h.deskripsi.length > 30 && h.deskripsi.length <= 200, `deskripsi ${h.berkas} panjangnya wajar`)
  assert(h.rute.startsWith('/'), `rute ${h.berkas} absolut`)
  assert(/\.png$/.test(h.gambar), `gambar ${h.berkas} berupa png`)
  assert(!h.judul.includes('Feasibility Study'),
    `judul ${h.berkas} tidak memakai judul umum Feasibility Study`)
}

// Rute yang dikirim lewat WhatsApp harus punya pratinjau
for (const r of ['/tim/masuk', '/vendor/daftar/:token', '/po/:token', '/lapor/:token', '/spk/sign/:token']) {
  assert(rute.includes(r), `rute ${r} punya pratinjau sendiri`)
}

// ── ruteHalaman: jalur pendek DAN lama sama-sama dapat pratinjau ───────────
for (const h of HALAMAN_BAGIKAN) {
  const jalur = ruteHalaman(h)
  assert(jalur.length >= 1, `${h.berkas}: punya rute`)
  if (!h.jenis) {
    assert(jalur.length === 1 && jalur[0] === h.rute, `${h.berkas}: halaman tanpa token punya satu rute`)
    continue
  }
  const { pendek, lama } = POLA_TAUTAN[h.jenis]
  assert(jalur.includes(`${pendek}/:token`), `${h.berkas}: jalur pendek dapat pratinjau`)
  assert(jalur.includes(`${lama}/:token`), `${h.berkas}: jalur LAMA tetap dapat pratinjau`)
}
assert(ruteHalaman(HALAMAN_BAGIKAN.find(h => h.jenis === 'po')).length === 1,
  'po tidak didaftarkan dua kali karena jalurnya memang sama')

// ── rewritesVercel ─────────────────────────────────────────────────────────
const rw = rewritesVercel()
const jumlahRute = HALAMAN_BAGIKAN.reduce((n, h) => n + ruteHalaman(h).length, 0)
assert(rw.length === jumlahRute, 'tiap rute punya rewrite')
assert(rw.every(r => r.destination.startsWith('/share/') && r.destination.endsWith('.html')),
  'tujuan rewrite mengarah ke berkas share hasil build')
assert(new Set(rw.map(r => r.source)).size === rw.length, 'tidak ada rewrite kembar')

const poRw = rw.find(r => r.source === '/po/:token')
assert(poRw.destination === '/share/po.html', 'rewrite PO menunjuk berkas yang benar')

// Jalur pendek dan lama harus menunjuk berkas pratinjau yang SAMA.
for (const [pendek, lama, berkas] of [
  ['/v/:token', '/vendor/daftar/:token', '/share/vendor-daftar.html'],
  ['/i/:token', '/vendor/item/:token', '/share/vendor-item.html'],
  ['/l/:token', '/lapor/:token', '/share/lapor.html'],
  ['/p/:token', '/progress/:token', '/share/progress.html'],
  ['/s/:token', '/spk/sign/:token', '/share/spk-sign.html'],
  ['/o/:token', '/opname/isi/:token', '/share/opname.html'],
]) {
  assert(rw.find(r => r.source === pendek)?.destination === berkas, `${pendek} → ${berkas}`)
  assert(rw.find(r => r.source === lama)?.destination === berkas, `${lama} → ${berkas} (tautan lama)`)
}

console.log(`✅ ogShare: ${ok} assertion lolos`)
