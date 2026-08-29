// ============================================================
// Alamat pengiriman harus SAMPAI ke vendor, bukan hanya tersimpan.
//
// Alamat kirim, nama penerima, nomornya, dan catatan arahan lokasi sudah
// tersimpan di `purchase_orders` sejak lama. Tetapi `po_get_by_token` — satu-
// satunya jalan data sampai ke halaman yang dibuka vendor — menyebutkan
// kolomnya SATU PER SATU, dan keempat kolom itu tidak ada di daftarnya.
//
// Akibatnya tidak terlihat dari mana pun. Di aplikasi alamatnya tampak
// tersimpan dengan benar; di halaman vendor ia tidak pernah ada, dan PDF yang
// diunduh vendor dari halaman itu ikut kosong. Sopir tetap menelepon
// menanyakan alamat — persis seperti sebelum kolomnya dibuat.
//
// Tidak ada galat yang muncul, karena tipe di sisi TypeScript menyatakan
// kolomnya ADA (`PoPublik = PurchaseOrder & …`). Yang berbohong justru bagian
// yang seharusnya menjaga. Uji ini membaca SQL-nya, karena hanya di sana
// kebenarannya.
// ============================================================
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { adaAlamatKirim } from '../src/lib/revisiPo.ts'

let ok = 0
const assert = (c, m) => { if (!c) { console.error('GAGAL:', m); process.exit(1) } ok++ }

const akarSql = new URL('../supabase/migrations', import.meta.url).pathname
const akarSrc = new URL('../src', import.meta.url).pathname
const baca = (d, f) => readFileSync(join(d, f), 'utf8')

// ── 1. Fungsi token vendor mengembalikan keempat kolom alamat ─────────
//
// Migrasi terakhir yang menulis ulang `po_get_by_token` yang menang, jadi
// yang diperiksa versi paling baru — bukan sekadar "ada di salah satu berkas".
{
  const berkas = readdirSync(akarSql)
    .filter(f => f.endsWith('.sql') && /po_get_by_token/.test(baca(akarSql, f)))
  assert(berkas.length > 0, 'ada migrasi yang mendefinisikan po_get_by_token')

  const terbaru = baca(akarSql, 'migration_po_token_alamat.sql')
  for (const kol of ['kirim_alamat', 'kirim_nama', 'kirim_wa', 'kirim_catatan']) {
    // Dua kali: sekali di daftar tipe kembalian, sekali di SELECT-nya.
    const jumlah = (terbaru.match(new RegExp(kol, 'g')) ?? []).length
    assert(jumlah >= 2, `${kol} ada di tipe kembalian DAN di select (ketemu ${jumlah}×)`)
  }
  assert(/drop function if exists public\.po_get_by_token/.test(terbaru),
    'fungsinya dibuang dulu — Postgres menolak mengubah tipe kembalian tanpa itu')
  assert(/grant execute on function public\.po_get_by_token\(text\) to anon/.test(terbaru),
    'vendor membuka halamannya tanpa login, jadi anon harus tetap boleh')
}

// ── 2. Nama proyek TIDAK ikut ke vendor ──────────────────────────────
//
// Ia catatan internal. Nama proyek sering nama pemiliknya, dan setiap vendor
// yang menerima PO jadi tahu siapa saja klien kita.
{
  const sql = baca(akarSql, 'migration_po_token_alamat.sql')
  assert(!/p\.project_name/.test(sql), 'project_name tidak ikut di-select')
  assert(!/^\s*nomor text, vendor_nama text, project_name text/m.test(sql),
    'dan tidak ada di tipe kembaliannya')

  const hal = baca(akarSrc, 'pages/PoViewPage.tsx')
  assert(!/\['Proyek', po\.project_name\]/.test(hal), 'halaman vendor tidak menampilkannya')

  const pdf = baca(akarSrc, 'lib/poPdf.ts')
  assert(!/\['Proyek',/.test(pdf), 'PDF vendor juga tidak')
}

// ── 3. Halaman vendor benar-benar menggambar blok alamatnya ─────────
//
// Kolomnya terkirim tetapi tidak dirender sama saja tidak ada. Keduanya harus
// dijaga, karena keduanya pernah menjadi sebabnya.
{
  const hal = baca(akarSrc, 'pages/PoViewPage.tsx')
  assert(/adaAlamatKirim\(po\)/.test(hal), 'blok alamat muncul bila datanya ada')
  assert(/data-alamat-kirim/.test(hal), 'blok itu bisa ditunjuk oleh uji peramban')
  assert(/po\.kirim_alamat/.test(hal), 'alamat ditampilkan')
  assert(/po\.kirim_nama/.test(hal) && /po\.kirim_wa/.test(hal), 'penerima & nomornya')
  assert(/po\.kirim_catatan/.test(hal), 'catatan arahan lokasi — itu yang ditanyakan sopir')
  assert(/whitespace-pre-wrap/.test(hal),
    'alamat berbaris-baris tetap terbaca berbaris-baris, bukan disambung jadi satu paragraf')

  // Letaknya SEBELUM rincian barang: yang membacanya orang gudang, dan ia
  // berhenti membaca begitu sampai di daftar barang.
  assert(hal.indexOf('data-alamat-kirim') < hal.indexOf('Rincian Barang'),
    'blok alamat berada di atas rincian barang')
}

// ── 4. Ambang "ada alamat" longgar dengan sengaja ──────────────────
//
// PO lama yang hanya sempat diisi catatannya tetap harus mencetak blok itu:
// sebagian alamat jauh lebih berguna daripada kotak yang hilang sama sekali.
{
  assert(adaAlamatKirim({ kirim_alamat: 'Perum Noble Cove D8' }) === true, 'alamat saja')
  assert(adaAlamatKirim({ kirim_nama: 'Suhanto' }) === true, 'nama saja')
  assert(adaAlamatKirim({ kirim_wa: '0815' }) === true, 'nomor saja')
  assert(adaAlamatKirim({ kirim_catatan: 'belok kanan' }) === true, 'catatan saja')
  assert(adaAlamatKirim({}) === false, 'benar-benar kosong')
  assert(adaAlamatKirim({ kirim_alamat: '   ' }) === false, 'spasi saja bukan alamat')
  assert(adaAlamatKirim(null) === false, 'kosong aman')
}

// ── 5. PDF menggambar ketiganya ───────────────────────────────────
{
  const pdf = baca(akarSrc, 'lib/poPdf.ts')
  assert(/DIKIRIM KE/.test(pdf), 'ada judul bloknya')
  assert(/kirim_catatan/.test(pdf), 'catatan arahan lokasi ikut dicetak')
  assert(/splitTextToSize/.test(pdf),
    'alamat panjang dipotong mengikuti lebar kertas, bukan menembus tepi')
  assert(pdf.indexOf('DIKIRIM KE') < pdf.indexOf('── Tabel barang'),
    'dicetak sebelum tabel barang')
}

console.log(`alamat-kirim-vendor: ${ok} assert lulus`)
