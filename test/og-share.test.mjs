// Test pratinjau tautan: meta per jenis halaman diganti, sisanya utuh.
import {
  HALAMAN_BAGIKAN, terapkanMeta, rewritesVercel, SITUS,
} from '../src/lib/ogShare.ts'

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

// ── rewritesVercel ─────────────────────────────────────────────────────────
const rw = rewritesVercel()
assert(rw.length === HALAMAN_BAGIKAN.length, 'tiap halaman punya rewrite')
assert(rw.every(r => r.destination.startsWith('/share/') && r.destination.endsWith('.html')),
  'tujuan rewrite mengarah ke berkas share hasil build')
const poRw = rw.find(r => r.source === '/po/:token')
assert(poRw.destination === '/share/po.html', 'rewrite PO menunjuk berkas yang benar')

console.log(`✅ ogShare: ${ok} assertion lolos`)
