// ============================================================
// PropFS — Notifikasi apa yang terjadi di lapangan
//
// Pekerjaan lapangan masuk terus-menerus: laporan harian, pemakaian material,
// permintaan barang, surat jalan, tanda tangan SPK, opname. Semuanya sudah
// tercatat, tetapi tidak ada yang memberi tahu — pemakainya harus membuka satu
// per satu modul untuk tahu ada yang baru. Itu sebabnya permintaan material
// bisa menganggur berhari-hari.
//
// Notifikasi di sini DITURUNKAN dari tabel yang sudah ada, bukan ditulis ke
// tabel baru. Tiga alasannya:
//   1. Tidak ada migrasi, tidak ada trigger, tidak ada yang bisa gagal terpasang.
//   2. Berlaku surut — kejadian lama ikut muncul, bukan hanya yang setelah
//      fiturnya dipasang.
//   3. Tidak mungkin melenceng dari kenyataan: bila barisnya dihapus,
//      notifikasinya ikut hilang dengan sendirinya.
//
// Yang disimpan hanyalah KAPAN TERAKHIR DIBACA, satu tanda waktu per
// perangkat. Itu cukup untuk menghitung yang belum terbaca.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

export type JenisNotifikasi =
  | 'laporan'      // laporan harian dari pekerja
  | 'pakai'        // pemakaian material di lapangan
  | 'request'      // permintaan material — perlu approval
  | 'terima'       // barang datang (surat jalan)
  | 'ttd'          // dokumen ditandatangani pihak kedua
  | 'opname'       // form opname diisi petugas
  | 'invoice'      // vendor mengirim tagihan lewat tautannya — perlu diperiksa
  | 'chat'         // pesan baru dari anggota tim di Chat Tim

export const LABEL_JENIS: Record<JenisNotifikasi, string> = {
  laporan: 'Laporan Harian',
  pakai: 'Pemakaian Material',
  request: 'Permintaan Material',
  terima: 'Barang Datang',
  ttd: 'Tanda Tangan',
  opname: 'Opname',
  invoice: 'Tagihan Vendor',
  chat: 'Pesan Tim',
}

/** Jenis yang menunggu tindakan manusia, bukan sekadar kabar. */
/**
 * Jenis yang menunggu tindakan manusia, bukan sekadar kabar.
 *
 * Tagihan vendor termasuk: ia menahan pembayaran sampai ada yang
 * memeriksanya, dan tagihan yang menumpuk tanpa diperiksa berubah menjadi
 * hubungan yang rusak dengan pemasok — bukan sekadar catatan yang tertunda.
 */
export const PERLU_TINDAKAN: JenisNotifikasi[] = ['request', 'ttd', 'invoice']

export interface Notifikasi {
  id: string
  jenis: JenisNotifikasi
  judul: string
  rincian: string
  /** ISO. Dipakai mengurutkan dan menghitung yang belum dibaca. */
  waktu: string
  /** Route tujuan ketika notifikasinya diketuk. */
  tautan: string
  proyek?: string
  /** true bila masih menunggu tindakan (mis. request belum di-approve). */
  menunggu?: boolean
  /**
   * Nama orang yang menyebabkan kejadian ini, apa adanya dari barisnya.
   * Dipakai Chat Tim untuk menghubungkan kejadian ke anggota tim; dibiarkan
   * kosong bila barisnya memang tidak menyebut siapa pun — menebaknya dari
   * judul akan salah orang, dan salah orang lebih buruk daripada tidak tahu.
   */
  oleh?: string
}

// ── Bentuk masukan: sesempit mungkin, supaya modul ini tidak ikut berubah
//    setiap kali kolom tabelnya bertambah ────────────────────────────────────

export interface SumberNotifikasi {
  laporan?: Array<{ id?: string; tanggal?: string; pelapor?: string; kegiatan?: string; created_at?: string; project_name?: string }>
  pakai?: Array<{ id?: string; tanggal?: string; pelapor?: string; nama?: string; qty?: number; satuan?: string; created_at?: string; project_name?: string }>
  request?: Array<{ id?: string; tanggal?: string; pemohon?: string; nama?: string; qty?: number; satuan?: string; status?: string; urgensi?: string; created_at?: string; project_name?: string }>
  terima?: Array<{ id?: string; nomor_do?: string; penerima?: string; tanggal_terima?: string; created_at?: string; items?: unknown }>
  ttd?: Array<{ id?: string; nomor?: string; vendor_name?: string; signed_at?: string | null; signed_name?: string | null; project_name?: string }>
  opname?: Array<{ id?: string; judul?: string; filled_by?: string | null; filled_at?: string | null; project_name?: string }>
  invoice?: Array<{ id?: string; po_nomor?: string; vendor_nama?: string; nomor_invoice?: string
                    total?: number; status?: string; dikirim_oleh?: string
                    created_at?: string; project_name?: string }>
  chat?: Array<{ id?: string; penulis_id?: string | null; penulis_nama?: string
                 teks?: string; foto?: string[] | null
                 created_at?: string; project_name?: string }>
  /**
   * Id pemakai yang sedang melihat. Dipakai MEMBUANG pesannya sendiri dari
   * daftar kabar.
   *
   * Tanpa ini, mengirim satu pesan ke tim langsung menyalakan lencana di
   * lonceng sendiri — dan lencana yang menyala karena perbuatan sendiri
   * mengajari orang untuk mengabaikan lencana. Sekali kebiasaan itu terbentuk,
   * kabar yang benar-benar penting ikut terabaikan.
   */
  sayaId?: string
}

const teks = (v: unknown) => String(v ?? '').trim()
const angka = (n: unknown) => Number(n) || 0

/**
 * Waktu kejadian. `created_at` didahulukan karena itu jam sebenarnya baris
 * tersebut masuk; `tanggal` hanyalah tanggal yang DIKETIK pelapor dan sering
 * mundur beberapa hari. Notifikasi harus mengikuti kapan kabarnya sampai,
 * bukan kapan pekerjaannya dilakukan.
 */
function waktuKejadian(created?: string, tanggal?: string): string {
  const c = teks(created)
  if (c) return c
  const t = teks(tanggal)
  // Tanggal tanpa jam dianggap akhir hari, supaya tidak selalu kalah urut
  // terhadap kejadian lain di hari yang sama.
  return t ? `${t}T23:59:59.000Z` : ''
}

export function susunNotifikasi(sumber: SumberNotifikasi = {}): Notifikasi[] {
  const hasil: Notifikasi[] = []

  for (const r of sumber.laporan ?? []) {
    const waktu = waktuKejadian(r.created_at, r.tanggal)
    if (!waktu) continue
    hasil.push({
      id: `laporan:${teks(r.id) || waktu}`, jenis: 'laporan', waktu,
      judul: `Laporan harian dari ${teks(r.pelapor) || 'lapangan'}`,
      rincian: teks(r.kegiatan) || 'Tanpa keterangan kegiatan.',
      tautan: '/kontraktor', proyek: teks(r.project_name) || undefined,
      oleh: teks(r.pelapor) || undefined,
    })
  }

  for (const u of sumber.pakai ?? []) {
    const waktu = waktuKejadian(u.created_at, u.tanggal)
    if (!waktu || !teks(u.nama)) continue
    hasil.push({
      id: `pakai:${teks(u.id) || waktu}`, jenis: 'pakai', waktu,
      judul: `${teks(u.pelapor) || 'Lapangan'} memakai ${teks(u.nama)}`,
      rincian: `${angka(u.qty).toLocaleString('id-ID')} ${teks(u.satuan)}`.trim(),
      tautan: '/kontraktor/material', proyek: teks(u.project_name) || undefined,
      oleh: teks(u.pelapor) || undefined,
    })
  }

  for (const q of sumber.request ?? []) {
    const waktu = waktuKejadian(q.created_at, q.tanggal)
    if (!waktu || !teks(q.nama)) continue
    const status = teks(q.status) || 'menunggu'
    const menunggu = status === 'menunggu'
    const urgen = teks(q.urgensi)
    hasil.push({
      id: `request:${teks(q.id) || waktu}`, jenis: 'request', waktu, menunggu,
      judul: `${teks(q.pemohon) || 'Lapangan'} minta ${teks(q.nama)}`,
      rincian: [
        `${angka(q.qty).toLocaleString('id-ID')} ${teks(q.satuan)}`.trim(),
        menunggu ? 'menunggu persetujuan' : status,
        urgen && urgen !== 'normal' ? urgen.toUpperCase() : '',
      ].filter(Boolean).join(' · '),
      tautan: '/kontraktor/material', proyek: teks(q.project_name) || undefined,
      oleh: teks(q.pemohon) || undefined,
    })
  }

  for (const d of sumber.terima ?? []) {
    const waktu = waktuKejadian(d.created_at, d.tanggal_terima)
    if (!waktu) continue
    const jml = Array.isArray(d.items) ? d.items.length : 0
    hasil.push({
      id: `terima:${teks(d.id) || waktu}`, jenis: 'terima', waktu,
      judul: `Barang datang ${teks(d.nomor_do) || ''}`.trim(),
      rincian: [
        jml > 0 ? `${jml} jenis barang` : 'Surat jalan tercatat',
        teks(d.penerima) ? `diterima ${teks(d.penerima)}` : '',
      ].filter(Boolean).join(' · '),
      tautan: '/kontraktor/procurement',
      oleh: teks(d.penerima) || undefined,
    })
  }

  for (const s of sumber.ttd ?? []) {
    // Hanya yang SUDAH ditandatangani yang jadi kabar. Dokumen yang baru
    // dikirim bukan kejadian baru bagi pengirimnya sendiri.
    const waktu = teks(s.signed_at)
    if (!waktu) continue
    hasil.push({
      id: `ttd:${teks(s.id) || waktu}`, jenis: 'ttd', waktu,
      judul: `${teks(s.signed_name) || teks(s.vendor_name) || 'Pihak kedua'} menandatangani ${teks(s.nomor) || 'dokumen'}`,
      rincian: 'Dokumen sudah lengkap tanda tangannya.',
      tautan: '/kontraktor', proyek: teks(s.project_name) || undefined,
      oleh: teks(s.signed_name) || undefined,
    })
  }

  for (const o of sumber.opname ?? []) {
    const waktu = teks(o.filled_at)
    if (!waktu) continue
    hasil.push({
      id: `opname:${teks(o.id) || waktu}`, jenis: 'opname', waktu,
      judul: `Opname "${teks(o.judul) || 'tanpa judul'}" sudah diisi`,
      rincian: teks(o.filled_by) ? `Diisi oleh ${teks(o.filled_by)}` : 'Menunggu persetujuan.',
      tautan: '/kontraktor', proyek: teks(o.project_name) || undefined,
      oleh: teks(o.filled_by) || undefined,
    })
  }

  for (const v of sumber.invoice ?? []) {
    const waktu = teks(v.created_at)
    if (!waktu) continue
    const status = teks(v.status) || 'masuk'
    // Yang sudah dibayar atau ditolak bukan lagi pekerjaan yang tertunda;
    // menandainya "menunggu" membuat lencana tidak pernah kembali ke nol, dan
    // lencana yang tidak pernah nol berhenti berarti apa-apa.
    const menunggu = status !== 'dibayar' && status !== 'ditolak' && status !== 'disetujui'
    hasil.push({
      id: `invoice:${teks(v.id) || waktu}`, jenis: 'invoice', waktu, menunggu,
      judul: `Tagihan dari ${teks(v.vendor_nama) || 'vendor'}`,
      rincian: [
        teks(v.nomor_invoice) && `No. ${teks(v.nomor_invoice)}`,
        angka(v.total) > 0 && `Rp ${Math.round(angka(v.total)).toLocaleString('id-ID')}`,
        teks(v.po_nomor) && `untuk ${teks(v.po_nomor)}`,
      ].filter(Boolean).join(' · ') || 'Tagihan baru masuk.',
      tautan: '/kontraktor/procurement', proyek: teks(v.project_name) || undefined,
      oleh: teks(v.dikirim_oleh) || undefined,
    })
  }

  // ── Pesan tim ──
  //
  // Pesan SENDIRI dibuang. Lencana yang menyala karena perbuatan sendiri
  // mengajari orang untuk mengabaikan lencana, dan sekali kebiasaan itu
  // terbentuk, kabar yang benar-benar penting ikut terabaikan.
  const sayaId = teks(sumber.sayaId)
  for (const c of sumber.chat ?? []) {
    const waktu = teks(c.created_at)
    if (!waktu) continue
    if (sayaId && teks(c.penulis_id) === sayaId) continue

    const isi = teks(c.teks)
    const foto = Array.isArray(c.foto) ? c.foto.length : 0
    hasil.push({
      id: `chat:${teks(c.id) || waktu}`, jenis: 'chat', waktu,
      judul: `Pesan dari ${teks(c.penulis_nama) || 'anggota tim'}`,
      // Foto tanpa teks tetap harus berbunyi sesuatu — "(kosong)" membuat
      // orang membuka aplikasinya hanya untuk mengetahui bahwa memang ada
      // isinya.
      rincian: isi || (foto > 0 ? `Mengirim ${foto} foto` : 'Pesan baru'),
      tautan: '/kontraktor/tim-chat', proyek: teks(c.project_name) || undefined,
      oleh: teks(c.penulis_nama) || undefined,
      // Pesan bukan pekerjaan yang menunggu persetujuan; ia kabar. Menandainya
      // "menunggu" akan membuat daftar tugas penuh oleh percakapan.
    })
  }

  // Terbaru di atas. Id dipakai sebagai pemecah seri supaya urutannya tetap
  // sama di setiap pemuatan — daftar yang berubah-ubah sendiri sulit dipercaya.
  return hasil.sort((a, b) => b.waktu.localeCompare(a.waktu) || a.id.localeCompare(b.id))
}

/** Notifikasi yang lebih baru daripada tanda waktu terakhir dibaca. */
export function belumDibaca(daftar: Notifikasi[], terakhirDibaca?: string | null): Notifikasi[] {
  const batas = teks(terakhirDibaca)
  if (!batas) return daftar
  return daftar.filter(n => n.waktu.localeCompare(batas) > 0)
}

/**
 * Angka untuk lencana lonceng. Dibatasi supaya tidak menampilkan "247" yang
 * tidak menolong siapa pun — di atas batas ditulis "99+".
 */
export function lencana(jumlah: number, maks = 99): string {
  const n = Math.max(0, Math.floor(jumlah))
  if (n === 0) return ''
  return n > maks ? `${maks}+` : String(n)
}

/** Jarak waktu yang enak dibaca orang, bukan tanggal penuh. */
export function waktuLalu(iso: string, sekarang = new Date()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const detik = Math.floor((sekarang.getTime() - t) / 1000)
  if (detik < 0) return 'baru saja'
  if (detik < 60) return 'baru saja'
  const menit = Math.floor(detik / 60)
  if (menit < 60) return `${menit} menit lalu`
  const jam = Math.floor(menit / 60)
  if (jam < 24) return `${jam} jam lalu`
  const hari = Math.floor(jam / 24)
  if (hari < 7) return `${hari} hari lalu`
  const minggu = Math.floor(hari / 7)
  if (minggu < 5) return `${minggu} minggu lalu`
  const bulan = Math.floor(hari / 30)
  return bulan < 12 ? `${bulan} bulan lalu` : `${Math.floor(hari / 365)} tahun lalu`
}

/** Ringkasan sebaris untuk judul panel, mis. "3 perlu tindakan · 12 kabar baru". */
export function ringkasNotifikasi(daftar: Notifikasi[]): string {
  const tindakan = daftar.filter(n => n.menunggu).length
  const bagian: string[] = []
  if (tindakan > 0) bagian.push(`${tindakan} perlu tindakan`)
  bagian.push(daftar.length === 0 ? 'belum ada kabar' : `${daftar.length} kabar`)
  return bagian.join(' · ')
}
