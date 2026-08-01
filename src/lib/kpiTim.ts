// ============================================================
// PropFS — Bahan penilaian KPI dari aliran Chat Tim
//
// Yang dihitung di sini adalah KEAKTIFAN YANG TERCATAT, bukan nilai seseorang.
// Angka-angkanya menjawab satu pertanyaan saja: "apa yang tercatat dari orang
// ini dalam periode tertentu?" — bukan "orang ini bagus atau tidak".
//
// Perbedaan itu penting sampai perlu disebut di sini, karena angka yang
// diperlakukan sebagai vonis akan mendorong tim mengisi sistem demi angkanya.
// Karena itu modul ini sengaja TIDAK memberi peringkat, TIDAK memberi nilai
// A/B/C, dan TIDAK menjumlahkan segalanya menjadi satu skor tunggal. Yang
// disajikan adalah hitungan mentah per jenis kegiatan; penilaiannya tetap
// pekerjaan manusia yang tahu konteksnya.
//
// Penghubungan kejadian ke orang dilakukan lewat NAMA, karena tabel lapangan
// menyimpan nama pelapor sebagai teks, bukan id pengguna. Nama yang tidak
// cocok dengan anggota mana pun TIDAK dibuang diam-diam melainkan dikumpulkan
// terpisah — kejadian yang hilang dari laporan lebih berbahaya daripada
// kejadian yang belum terhubung.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

import { namaKunci, type BarisChat } from './chatTim.ts'
import type { JenisNotifikasi } from './notifikasi.ts'

export interface AnggotaKpi {
  /** id pengguna bila ada; kalau tidak, namanya dipakai sebagai kunci. */
  id: string
  nama: string
  role?: string
}

export interface SkorKpi {
  id: string
  nama: string
  role: string
  /** Pesan yang ia tulis di Chat Tim. */
  pesan: number
  /** Kejadian sistem yang tercatat atas namanya, dipilah per jenis. */
  kegiatan: Record<JenisNotifikasi, number>
  /** Jumlah seluruh kejadian sistem atas namanya. */
  totalKegiatan: number
  /** Hari berbeda yang padanya ia meninggalkan jejak apa pun. */
  hariAktif: number
  /** ISO jejak terakhir; kosong bila tidak ada apa pun. */
  terakhir: string
}

export interface HasilKpi {
  /** Satu baris per anggota, termasuk yang tidak meninggalkan jejak sama sekali. */
  anggota: SkorKpi[]
  /**
   * Kejadian yang namanya tidak cocok dengan anggota mana pun, dikelompokkan
   * per nama. Ditampilkan supaya pemakainya tahu ada yang perlu dirapikan —
   * biasanya karena nama di lapangan ditulis berbeda dari nama akun.
   */
  belumTerhubung: Array<{ nama: string; jumlah: number }>
  /** Rentang yang dihitung, untuk dicetak apa adanya di layar. */
  hari: number
  sejak: string
}

const JENIS: JenisNotifikasi[] = ['laporan', 'pakai', 'request', 'terima', 'ttd', 'opname']

function kegiatanKosong(): Record<JenisNotifikasi, number> {
  return { laporan: 0, pakai: 0, request: 0, terima: 0, ttd: 0, opname: 0 }
}

const teks = (v: unknown) => String(v ?? '').trim()

/**
 * Hitung keaktifan tiap anggota dari aliran Chat Tim.
 *
 * `hari` membatasi periodenya. Anggota yang tidak meninggalkan jejak apa pun
 * tetap muncul dengan angka nol — justru itulah yang paling perlu terlihat,
 * dan menyembunyikannya membuat daftar ini menipu.
 */
export function nilaiKpi(
  baris: BarisChat[] = [],
  anggota: AnggotaKpi[] = [],
  opsi: { hari?: number; sekarang?: Date } = {},
): HasilKpi {
  const hari = Math.max(1, Math.floor(opsi.hari ?? 30))
  const sekarang = opsi.sekarang ?? new Date()
  const sejak = new Date(sekarang.getTime() - hari * 86_400_000).toISOString()

  // Peta nama → anggota. Dibangun sekali; nama yang sama muncul berkali-kali
  // di aliran dan mencocokkannya berulang kali membuang waktu tanpa alasan.
  const perNama = new Map<string, AnggotaKpi>()
  for (const a of anggota ?? []) {
    const kunci = namaKunci(a?.nama)
    if (kunci && !perNama.has(kunci)) perNama.set(kunci, a)
  }
  const perId = new Map<string, AnggotaKpi>()
  for (const a of anggota ?? []) if (teks(a?.id)) perId.set(teks(a.id), a)

  const skor = new Map<string, SkorKpi>()
  const hariPer = new Map<string, Set<string>>()
  const kunciAnggota = (a: AnggotaKpi) => teks(a.id) || namaKunci(a.nama) || teks(a.nama)

  for (const a of anggota ?? []) {
    const k = kunciAnggota(a)
    if (!k || skor.has(k)) continue
    skor.set(k, {
      id: k, nama: teks(a.nama) || 'Tanpa nama', role: teks(a.role),
      pesan: 0, kegiatan: kegiatanKosong(), totalKegiatan: 0, hariAktif: 0, terakhir: '',
    })
    hariPer.set(k, new Set())
  }

  const belum = new Map<string, number>()

  for (const b of baris ?? []) {
    const waktu = teks(b?.waktu)
    if (!waktu || waktu < sejak) continue
    const tanggal = waktu.slice(0, 10)

    if (b.jenis === 'orang') {
      // Pesan diikat lewat id penulisnya — itu yang dijamin RLS, jadi tidak
      // bisa dipalsukan atas nama orang lain.
      const a = perId.get(b.penulisId) ?? perNama.get(namaKunci(b.nama))
      const k = a ? kunciAnggota(a) : (b.penulisId || namaKunci(b.nama))
      if (!k) continue
      let s = skor.get(k)
      if (!s) {
        s = {
          id: k, nama: teks(a?.nama) || teks(b.nama), role: teks(a?.role) || teks(b.role),
          pesan: 0, kegiatan: kegiatanKosong(), totalKegiatan: 0, hariAktif: 0, terakhir: '',
        }
        skor.set(k, s)
        hariPer.set(k, new Set())
      }
      s.pesan++
      if (waktu > s.terakhir) s.terakhir = waktu
      hariPer.get(k)!.add(tanggal)
      continue
    }

    // Kejadian sistem: hanya yang menyebut siapa yang bisa dihubungkan.
    const nama = teks(b.oleh)
    if (!nama) continue
    const a = perNama.get(namaKunci(nama))
    if (!a) {
      belum.set(nama, (belum.get(nama) ?? 0) + 1)
      continue
    }
    const k = kunciAnggota(a)
    const s = skor.get(k)
    if (!s) continue
    s.kegiatan[b.kategori] = (s.kegiatan[b.kategori] ?? 0) + 1
    s.totalKegiatan++
    if (waktu > s.terakhir) s.terakhir = waktu
    hariPer.get(k)!.add(tanggal)
  }

  for (const [k, set] of hariPer) {
    const s = skor.get(k)
    if (s) s.hariAktif = set.size
  }

  return {
    // Yang paling banyak jejaknya di atas; seri diputus nama supaya urutannya
    // tetap sama di setiap pemuatan.
    anggota: [...skor.values()].sort((a, b) =>
      (b.pesan + b.totalKegiatan) - (a.pesan + a.totalKegiatan)
      || a.nama.localeCompare(b.nama)),
    belumTerhubung: [...belum.entries()]
      .map(([nama, jumlah]) => ({ nama, jumlah }))
      .sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama)),
    hari, sejak,
  }
}

/** Label pendek jenis kegiatan untuk kolom tabel KPI. */
export const LABEL_KEGIATAN: Record<JenisNotifikasi, string> = {
  laporan: 'Laporan', pakai: 'Pakai bahan', request: 'Request',
  terima: 'Terima barang', ttd: 'Tanda tangan', opname: 'Opname',
}

/** Jenis kegiatan dalam urutan tetap, supaya kolom tabelnya tidak berpindah. */
export const URUT_KEGIATAN = JENIS

/**
 * Kalimat apa adanya tentang seorang anggota. Sengaja deskriptif, bukan
 * penilaian: "belum ada jejak" bukan berarti tidak bekerja, bisa saja
 * pekerjaannya memang tidak melewati sistem ini.
 */
export function ringkasAnggota(s: SkorKpi): string {
  if (s.pesan === 0 && s.totalKegiatan === 0) return 'Belum ada jejak di periode ini'
  const bagian: string[] = []
  if (s.pesan > 0) bagian.push(`${s.pesan} pesan`)
  if (s.totalKegiatan > 0) bagian.push(`${s.totalKegiatan} kegiatan`)
  bagian.push(`${s.hariAktif} hari aktif`)
  return bagian.join(' · ')
}
