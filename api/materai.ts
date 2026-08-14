// ============================================================
// PropFS — Pembubuhan e-Meterai, lewat distributor resmi Peruri
//
// APA YANG BISA DAN TIDAK BISA DIKERJAKAN BERKAS INI.
//
// e-Meterai hanya sah bila dibubuhkan lewat sistem Peruri, dan aksesnya hanya
// dijual oleh distributor resmi yang ditunjuk Peruri — antara lain Peruri
// Digital Security, Mitra Pajakku, Mitracomm Ekasarana, Pos Indonesia, dan
// penyedia yang menjual API di atasnya seperti Mekari Sign dan OnlinePajak.
// Meterainya dibeli oleh PERUSAHAAN PENERBIT DOKUMEN atas namanya sendiri;
// tidak ada jalan sah untuk membubuhkan meterai tanpa kontrak itu.
//
// Jadi berkas ini bukan "penyedia e-Meterai". Ia sambungan ke penyedia yang
// dipilih perusahaan, dan sengaja ditulis agar:
//
//   • ketika penyedianya BELUM dipasang, keadaan itu dilaporkan dengan jelas
//     beserta langkah nyatanya — bukan gagal diam-diam, dan bukan pula
//     berpura-pura berhasil;
//   • ketika penyedianya diganti, yang berubah hanya variabel lingkungan dan
//     satu pemetaan di bawah, bukan halaman atau basis datanya;
//   • kuota yang sudah dipotong DIKEMBALIKAN bila pembubuhannya gagal — tanpa
//     itu, tiap gangguan jaringan memakan satu meterai yang sudah dibayar.
//
// Yang HARUS diisi saat berlangganan:
//   MATERAI_BASE_URL   — alamat API distributornya
//   MATERAI_API_KEY    — kunci/secret dari distributornya (TANPA awalan VITE_)
//   MATERAI_JALUR      — jalur pembubuhan, mis. "/api/stamp"  (opsional)
//
// Nama medan pada badan permintaan berbeda antar distributor. Pemetaannya ada
// di `susunPermintaan`/`bacaJawaban` di bawah, dalam satu tempat, supaya
// menyesuaikannya tidak menyentuh apa pun yang lain.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 60 }

/** Batas ukuran PDF. Distributor umumnya menolak di kisaran 800 KB – 2 MB. */
const BATAS_PDF = 2_000_000

interface Setelan { base: string; kunci: string; jalur: string }

function setelan(): Setelan | null {
  const base = (process.env.MATERAI_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const kunci = (process.env.MATERAI_API_KEY ?? '').trim()
  if (!base || !kunci) return null
  return { base, kunci, jalur: (process.env.MATERAI_JALUR ?? '/stamp').trim() }
}

/**
 * Badan permintaan ke distributor.
 *
 * SATU-SATUNYA tempat yang perlu disesuaikan ketika distributornya dipilih.
 * Bentuk di bawah mengikuti pola yang lazim (dokumen base64 + metadata
 * dokumen); yang berbeda antar penyedia biasanya hanya nama medannya.
 */
function susunPermintaan(d: {
  pdfBase64: string; nomor: string; tanggal: string; namaDokumen: string
}): unknown {
  return {
    document: d.pdfBase64,
    document_name: d.namaDokumen,
    document_number: d.nomor,
    document_date: d.tanggal,
  }
}

/** Membaca jawaban distributor menjadi bentuk yang dipakai aplikasi. */
function bacaJawaban(j: unknown): { pdfBase64: string; sn: string } | null {
  const o = (j ?? {}) as Record<string, unknown>
  const isi = (o.document ?? o.file ?? o.data ?? o.stamped_document) as unknown
  const sn = (o.serial_number ?? o.sn ?? o.serialNumber ?? '') as unknown
  const pdf = typeof isi === 'string' ? isi : ''
  if (!pdf) return null
  return { pdfBase64: pdf, sn: String(sn ?? '') }
}

/** Verifikasi sesi pengguna, sama seperti /api/ai. */
async function penggunaSah(token: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon || !token) return false
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    })
    return r.ok
  } catch { return false }
}

/** Distributor resmi, disebutkan pada pesan galat supaya langkahnya jelas. */
const DISTRIBUTOR = [
  'Peruri Digital Security', 'Mitra Pajakku', 'Mitracomm Ekasarana',
  'Pos Indonesia', 'Mekari Sign', 'OnlinePajak',
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!(await penggunaSah(token))) {
    return res.status(401).json({
      error: { code: 401, status: 'UNAUTHENTICATED', message: 'Silakan masuk dulu.' },
    })
  }

  const cfg = setelan()
  if (!cfg) {
    // Keadaan yang PALING MUNGKIN terjadi, dan karena itu diberi jawaban paling
    // lengkap. Kegagalan yang tidak menjelaskan dirinya sendiri akan dikira
    // kerusakan, lalu orang mengirim kwitansinya tanpa meterai — persis akibat
    // yang seluruh fitur ini dibuat untuk mencegahnya.
    return res.status(503).json({
      error: {
        code: 503,
        status: 'MATERAI_BELUM_DIPASANG',
        message: 'Penyedia e-Meterai belum dihubungkan di server ini.',
        langkah: 'Berlangganan API e-Meterai ke salah satu distributor resmi Peruri, lalu '
          + 'pasang MATERAI_BASE_URL dan MATERAI_API_KEY di Vercel → Settings → Environment '
          + 'Variables (TANPA awalan VITE_, supaya kuncinya tidak ikut terbundel ke browser), '
          + 'lalu redeploy.',
        distributor: DISTRIBUTOR,
      },
    })
  }

  const { pdfBase64, nomor, tanggal, namaDokumen } = (req.body ?? {}) as {
    pdfBase64?: string; nomor?: string; tanggal?: string; namaDokumen?: string
  }
  const pdf = String(pdfBase64 ?? '')
  if (!pdf) {
    return res.status(400).json({
      error: { code: 400, status: 'PDF_KOSONG', message: 'Berkas PDF-nya tidak terkirim.' },
    })
  }
  if (pdf.length > BATAS_PDF) {
    return res.status(413).json({
      error: {
        code: 413, status: 'PDF_TERLALU_BESAR',
        message: 'PDF-nya melebihi batas yang diterima distributor e-Meterai. '
          + 'Kecilkan logo pada kop perusahaan, lalu coba lagi.',
      },
    })
  }

  try {
    const r = await fetch(`${cfg.base}${cfg.jalur}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.kunci}`,
      },
      body: JSON.stringify(susunPermintaan({
        pdfBase64: pdf,
        nomor: String(nomor ?? ''),
        tanggal: String(tanggal ?? ''),
        namaDokumen: String(namaDokumen ?? 'Kwitansi'),
      })),
    })

    const teks = await r.text()
    if (!r.ok) {
      // Kalimat distributor diteruskan apa adanya. Ia yang tahu sebabnya —
      // kuota habis di sisi mereka, dokumen ditolak, akun belum aktif — dan
      // menggantinya dengan kalimat kami sendiri menghapus satu-satunya
      // keterangan yang bisa ditindaklanjuti.
      return res.status(r.status).json({
        error: {
          code: r.status, status: 'MATERAI_DITOLAK',
          message: 'Distributor e-Meterai menolak pembubuhan.',
          asli: teks.slice(0, 1000),
        },
      })
    }

    let j: unknown
    try { j = JSON.parse(teks) } catch { j = null }
    const hasil = j ? bacaJawaban(j) : null
    if (!hasil) {
      return res.status(502).json({
        error: {
          code: 502, status: 'MATERAI_TAK_TERBACA',
          message: 'Jawaban distributor tidak memuat dokumen bermeterai. '
            + 'Sesuaikan pemetaan medan di api/materai.ts dengan dokumentasi distributornya.',
          asli: teks.slice(0, 1000),
        },
      })
    }

    return res.status(200).json({ pdfBase64: hasil.pdfBase64, sn: hasil.sn })
  } catch (e) {
    console.error('[materai] gagal menghubungi distributor:', e)
    return res.status(502).json({
      error: {
        code: 502, status: 'MATERAI_TAK_TERHUBUNG',
        message: 'Tidak bisa menghubungi distributor e-Meterai. Kuota Anda tidak terpakai.',
      },
    })
  }
}
