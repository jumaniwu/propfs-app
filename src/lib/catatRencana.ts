// ============================================================
// PropFS — Menjalankan daftar periksa lintas modul
//
// `rencanaCatat.ts` menyusun APA yang akan tercatat; berkas ini yang benar-benar
// MENCATATNYA. Dipisah karena dua tempat sekarang memakai alur yang sama:
// tab Realisasi Biaya di dalam workspace proyek, dan halaman Chat AI yang bisa
// dibuka dari mana saja. Menyalin logikanya dua kali berarti suatu hari nanti
// yang satu diperbaiki dan yang lain tidak.
//
// Semua penulisan masuk lewat `AlatCatat` — tidak ada impor store maupun API di
// sini. Itu membuat urutan langkah, penanganan kegagalan, dan pelaporan hasilnya
// bisa diuji di Node tanpa jaringan sama sekali.
//
// SIFAT PENTING: kalau sebuah langkah gagal, langkah yang SUDAH berhasil tidak
// dibatalkan. Tidak ada transaksi lintas modul di sini, dan berpura-pura ada
// justru berbahaya — yang benar adalah melaporkan dengan jujur apa yang sudah
// tersimpan supaya pemakainya tidak mencatatnya dua kali.
// ============================================================

import { usulanDo } from './notaKePo.ts'
import type { Rencana } from './rencanaCatat.ts'

export interface AlatCatat {
  /** Catat uang masuk ke Akuntan → Pemasukan. */
  simpanPemasukan(p: {
    tanggal: string; sumber: string; kategori: string
    jumlah: number; keterangan?: string
  }): void | Promise<void>

  /** Nomor surat jalan berikutnya. */
  nomorDo(): string

  /** Buat surat jalan penerimaan barang; balikannya harus memuat id. */
  simpanDo(input: ReturnType<typeof usulanDo> & { nomor_do: string; foto: unknown[] }): Promise<{ id: string }>

  /** Tandai entri biaya agar stoknya tidak dihitung dua kali. */
  tandaiEntri(entryId: string, doId: string): void | Promise<void>

  /** Catat pembayaran ke Akuntan → Hutang Vendor. */
  simpanBayar(input: {
    po_id: string; tanggal: string; jumlah: number; metode: string
    referensi: string
    /**
     * Foto/PDF bukti transfernya, sebagai data URI.
     *
     * Dulu selalu `null`: lampiran yang dikirim ke Chat AI dibaca isinya lalu
     * DIBUANG. Yang tersisa hanya angka hasil bacaan, tanpa dokumen yang bisa
     * ditunjukkan ketika kelak dipertanyakan — dan bukti transfer justru
     * dokumen yang paling sering diminta kembali.
     */
    bukti: string | null
    catatan: string
  }): Promise<unknown>
}

export interface PilihanRencana {
  /** Indeks PO yang dipilih untuk penerimaan barang; -1 = tidak dicatat. */
  po?: number
  /** Indeks PO pilihan untuk tiap pembayaran, sejajar `rencana.pembayaran`. */
  bayar?: number[]
}

export interface HasilCatat {
  /** Ringkasan langkah yang berhasil, untuk ditampilkan ke pemakai. */
  selesai: string[]
  /** Pembayaran yang dilewati karena tidak ada PO yang cocok. */
  tanpaPo: number
}

/** Kegagalan yang tetap membawa kabar apa saja yang terlanjur tersimpan. */
export class GagalSebagian extends Error {
  readonly selesai: string[]
  constructor(pesan: string, selesai: string[]) {
    super(pesan)
    this.name = 'GagalSebagian'
    this.selesai = selesai
  }
}

const teks = (v: unknown) => String(v ?? '').trim()

/**
 * Jalankan seluruh langkah yang masih menunggu, dalam satu persetujuan.
 *
 * Urutannya disengaja: pemasukan lebih dulu karena tersimpan lokal dan tidak
 * bisa gagal karena jaringan, lalu penerimaan barang, lalu pembayaran. Dengan
 * begitu bagian yang paling mungkin gagal berada di belakang, dan kegagalannya
 * menyisakan keadaan yang paling mudah dimengerti.
 */
export async function catatRencana(
  rencana: Rencana | null,
  pilihan: PilihanRencana,
  alat: AlatCatat,
): Promise<HasilCatat> {
  const selesai: string[] = []
  let tanpaPo = 0
  if (!rencana) return { selesai, tanpaPo }

  try {
    // 1. Pemasukan → Akuntan.
    for (const p of rencana.pemasukan) {
      await alat.simpanPemasukan({
        tanggal: p.tanggal, sumber: p.sumber, kategori: p.kategori,
        jumlah: p.jumlah, keterangan: p.keterangan,
      })
    }
    if (rencana.pemasukan.length > 0) selesai.push(`${rencana.pemasukan.length} pemasukan`)

    // 2. Penerimaan barang → Procurement. Entri biayanya ditandai `doId` supaya
    //    stok tidak bertambah dua kali: yang menambah stok adalah surat jalan.
    const idxPo = pilihan.po ?? 0
    const cocok = idxPo >= 0 ? rencana.penerimaan[idxPo] : undefined
    if (cocok) {
      const sumber = rencana.biaya.find(e => e.tipe === 'material')
      const nota = teks(sumber?.nomorNota)
      const d = usulanDo(cocok, {
        nomorNota: nota,
        tanggalNota: sumber?.tanggal ?? null,
        tanggalTerima: sumber?.tanggal ?? undefined,
        catatan: `Otomatis dari nota di chat AI${nota ? ` (${nota})` : ''}`,
      })
      const baru = await alat.simpanDo({ ...d, nomor_do: alat.nomorDo(), foto: [] })
      for (const p of cocok.pasangan) {
        if (p.nota.id) await alat.tandaiEntri(p.nota.id, baru.id)
      }
      selesai.push(`${d.items.length} barang datang`)
    }

    // 3. Pembayaran → Hutang Vendor. Yang tidak menemukan PO DILEWATI, dan itu
    //    dilaporkan — mengarang PO tujuan jauh lebih buruk daripada melewatinya.
    let terbayar = 0
    for (let i = 0; i < rencana.pembayaran.length; i++) {
      const b = rencana.pembayaran[i]
      const po = b.calon[pilihan.bayar?.[i] ?? 0]
      if (!po) { tanpaPo++; continue }
      await alat.simpanBayar({
        po_id: po.id, tanggal: b.usul.tanggal, jumlah: b.usul.jumlah,
        metode: b.usul.metode, referensi: teks(b.usul.referensi),
        bukti: rencana.bukti ?? null,
        catatan: teks(b.usul.catatan) || 'Otomatis dari chat AI',
      })
      terbayar++
    }
    if (terbayar > 0) selesai.push(`${terbayar} pembayaran`)

    return { selesai, tanpaPo }
  } catch (e) {
    throw new GagalSebagian(e instanceof Error ? e.message : String(e), selesai)
  }
}

/** Kalimat hasil untuk ditampilkan di toast. */
export function ringkasHasil(hasil: HasilCatat): string {
  const bagian = [...hasil.selesai]
  if (hasil.tanpaPo > 0) {
    bagian.push(`${hasil.tanpaPo} pembayaran dilewati karena tidak ada PO yang cocok`)
  }
  return bagian.length > 0 ? bagian.join(' · ') : 'Tidak ada yang perlu dicatat.'
}
