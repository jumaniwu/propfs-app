// ============================================================
// PropFS — Mengubah jumlah & membatalkan Material Request
//
// KENAPA BERKAS INI ADA.
//
// Permintaan material yang sudah disetujui selama ini tidak bisa disentuh
// lagi. Salah ketik "3 Kotak" padahal maksudnya 1, atau barangnya ternyata
// tidak jadi dibeli — keduanya hanya bisa diselesaikan dengan membiarkannya
// menggantung selamanya di panel "Menunggu Dipesan". Daftar itu lalu penuh
// oleh permintaan yang tidak ada yang berniat memesannya, dan yang benar-benar
// perlu dipesan tenggelam di antaranya.
//
// YANG BERBAHAYA DI SINI BUKAN MENGUBAHNYA, MELAINKAN URUTANNYA.
//
// Sebuah permintaan bisa SUDAH sebagian dipesan. Angkanya ada di dua tempat
// yang berbeda, dan keduanya harus ikut dihitung:
//
//   qty_dipesan          — sudah MASUK PO DAN PO-nya sudah dikirim ke vendor.
//                          Server yang menambahkannya, saat po_tandai_terkirim.
//   qtyDalamPoTertunda   — sudah masuk PO, tapi PO-nya belum dikirim.
//                          Belum tercatat di qty_dipesan sama sekali.
//
// Menurunkan jumlah permintaan di bawah salah satu angka itu menghasilkan
// keadaan yang tidak masuk akal: vendor dipesani lebih banyak daripada yang
// diminta. Tidak ada galat yang muncul — `sisaQty` menjepitnya ke nol, jadi
// layarnya tetap terlihat rapi sementara pembukuannya sudah salah.
//
// Maka: yang sudah terkirim MENGUNCI, yang masih di PO tertunda MENGHALANGI
// tapi bisa dibereskan sendiri oleh pemakainya dengan merevisi PO-nya.
// Pembatalan tidak pernah dihalangi — itu keputusan orangnya — tetapi ia
// harus mengatakan apa yang TIDAK ikut batal.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

import type { MaterialRequest } from './materialApi.ts'
import { STATUS_PO_BELUM_TERCATAT, type PurchaseOrder } from './procurement.ts'

/** Sepotong PO, secukupnya untuk menghitung dan menyebut nomornya. */
export type PoRingkas = Pick<PurchaseOrder, 'status'> & {
  nomor?: string
  items?: Array<{ request_id?: string | null; qty?: number }>
}

export type RequestRingkas = Pick<MaterialRequest, 'id' | 'qty' | 'satuan'> & {
  nama?: string
  qty_dipesan?: number
}

export interface HasilPeriksa {
  boleh: boolean
  /** Sebab tidak boleh. Kosong bila boleh. */
  alasan?: string
  /** Hal yang tetap perlu diketahui walau boleh diteruskan. */
  peringatan?: string
}

const bilangan = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Dibulatkan seperlunya saja — 2,5 Kotak tetap 2,5 di layar. */
const tampil = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)

/**
 * PO yang masih MENAHAN sebuah permintaan: sudah memuatnya, tapi belum
 * dikirim ke vendor. Nomornya dipakai di pesan, karena "ada di PO lain"
 * tanpa menyebut PO yang mana tidak bisa ditindaklanjuti siapa pun.
 */
export function poYangMenahan(requestId: string, pos: PoRingkas[] = []): Array<{ nomor: string; qty: number }> {
  if (!requestId) return []
  const hasil: Array<{ nomor: string; qty: number }> = []
  for (const po of pos ?? []) {
    if (!STATUS_PO_BELUM_TERCATAT.includes(po?.status)) continue
    let qty = 0
    for (const it of po?.items ?? []) {
      if (it?.request_id === requestId) qty += Math.max(0, bilangan(it.qty))
    }
    if (qty > 0) hasil.push({ nomor: po.nomor || '(tanpa nomor)', qty })
  }
  return hasil
}

/**
 * Boleh atau tidak mengubah jumlah sebuah permintaan menjadi `qtyBaru`.
 *
 * MENAIKKAN jumlah selalu boleh: sisanya bertambah, dan tidak ada PO yang
 * jadi salah karenanya. Yang diperiksa ketat hanya penurunan.
 */
export function periksaUbahQty(
  r: RequestRingkas | null | undefined,
  qtyBaru: number,
  pos: PoRingkas[] = [],
): HasilPeriksa {
  if (!r) return { boleh: false, alasan: 'Permintaannya tidak ditemukan.' }

  const satuan = (r.satuan || '').trim()
  const sat = satuan ? ` ${satuan}` : ''
  const baru = bilangan(qtyBaru)
  const lama = bilangan(r.qty)

  if (!Number.isFinite(Number(qtyBaru)) || baru <= 0) {
    return { boleh: false, alasan: 'Jumlahnya harus lebih besar dari nol.' }
  }
  if (baru === lama) {
    return { boleh: false, alasan: 'Jumlahnya sama dengan yang sekarang.' }
  }

  const terkirim = Math.max(0, bilangan(r.qty_dipesan))
  if (baru < terkirim) {
    return {
      boleh: false,
      alasan: `${tampil(terkirim)}${sat} sudah terkirim ke vendor.`
        + ` Jumlah permintaan tidak bisa turun di bawah itu —`
        + ` yang sudah dipesan tidak bisa ditarik kembali dari sini.`,
    }
  }

  const tertahan = poYangMenahan(r.id, pos)
  const qtyTertahan = tertahan.reduce((s, p) => s + p.qty, 0)
  if (baru < terkirim + qtyTertahan) {
    const daftar = tertahan.map(p => `${p.nomor} (${tampil(p.qty)}${sat})`).join(', ')
    return {
      boleh: false,
      alasan: `Sudah ada di PO yang belum dikirim: ${daftar}.`
        + ` Turunkan jumlahnya di PO itu dulu, atau hapus PO-nya —`
        + ` kalau tidak, vendor dipesani lebih banyak daripada yang diminta.`,
    }
  }

  if (baru < lama) {
    return {
      boleh: true,
      peringatan: `Jumlahnya turun dari ${tampil(lama)}${sat} menjadi ${tampil(baru)}${sat}.`,
    }
  }
  return {
    boleh: true,
    peringatan: `Jumlahnya naik dari ${tampil(lama)}${sat} menjadi ${tampil(baru)}${sat}.`,
  }
}

/**
 * Boleh atau tidak membatalkan sebuah permintaan.
 *
 * Pembatalan TIDAK PERNAH dihalangi — berhenti membeli sesuatu adalah
 * keputusan orangnya, bukan keputusan aplikasi. Tapi ia harus mengatakan apa
 * yang tidak ikut batal, karena membatalkan permintaan tidak membatalkan PO
 * yang sudah terlanjur dibuat atau dikirim.
 */
export function periksaBatal(
  r: RequestRingkas | null | undefined,
  pos: PoRingkas[] = [],
): HasilPeriksa {
  if (!r) return { boleh: false, alasan: 'Permintaannya tidak ditemukan.' }

  const satuan = (r.satuan || '').trim()
  const sat = satuan ? ` ${satuan}` : ''
  const terkirim = Math.max(0, bilangan(r.qty_dipesan))
  const tertahan = poYangMenahan(r.id, pos)

  const bagian: string[] = []
  if (terkirim > 0) {
    bagian.push(`${tampil(terkirim)}${sat} sudah terkirim ke vendor dan TIDAK ikut batal`)
  }
  if (tertahan.length > 0) {
    const daftar = tertahan.map(p => `${p.nomor} (${tampil(p.qty)}${sat})`).join(', ')
    bagian.push(`masih tercantum di PO yang belum dikirim: ${daftar}`
      + ' — hapus atau revisi PO itu kalau memang tidak jadi dibeli')
  }

  return bagian.length > 0
    ? { boleh: true, peringatan: `${bagian.join('; ')}.` }
    : { boleh: true }
}

/** Kalimat konfirmasi pembatalan — menyebut barangnya, bukan "item ini". */
export function kalimatBatal(r: RequestRingkas | null | undefined, pos: PoRingkas[] = []): string {
  const nama = (r?.nama || '').trim() || 'Permintaan ini'
  const satuan = (r?.satuan || '').trim()
  const sat = satuan ? ` ${satuan}` : ''
  const jumlah = tampil(bilangan(r?.qty))
  const h = periksaBatal(r, pos)

  const awal = `Batalkan permintaan "${nama}" sebanyak ${jumlah}${sat}?`
  const ekor = 'Ia akan hilang dari daftar Menunggu Dipesan. Catatannya tetap tersimpan,'
    + ' tidak dihapus dari riwayat.'
  return h.peringatan ? `${awal}\n\n⚠️ ${h.peringatan}\n\n${ekor}` : `${awal}\n\n${ekor}`
}

/**
 * Catatan baru DITAMBAHKAN di bawah yang sudah ada, bukan menggantikannya.
 *
 * `catatan_approval` berisi tulisan orang yang menyetujui permintaan itu —
 * sering satu-satunya keterangan kenapa barangnya disetujui. Menimpanya saat
 * membatalkan atau memperbaiki jumlah akan menghapus isian yang dimasukkan
 * orang lain, dan penghapusan seperti itu tidak akan pernah disadari siapa
 * pun sampai catatannya dicari dan ternyata sudah tidak ada.
 */
export function catatanTambah(sebelumnya: string | null | undefined, baris: string): string {
  const lama = (sebelumnya || '').trim()
  const baru = (baris || '').trim()
  if (!baru) return lama
  return lama ? `${lama}\n${baru}` : baru
}

/**
 * Catatan yang ditulis saat membatalkan.
 *
 * Statusnya memakai 'ditolak' karena itulah satu-satunya nilai berhenti yang
 * diizinkan kolomnya — menambah 'dibatalkan' menuntut migrasi, dan migrasi
 * yang belum dijalankan membuat pembatalan gagal dengan galat constraint yang
 * tidak bisa dibaca siapa pun. Supaya "ditolak saat approval" tetap bisa
 * dibedakan dari "dibatalkan setelah disetujui", sebabnya ditulis di sini.
 */
export function catatanBatal(oleh: string, sebab = ''): string {
  const nama = (oleh || '').trim() || 'pengguna'
  const alasan = (sebab || '').trim()
  const tanggal = new Date().toISOString().slice(0, 10)
  return alasan
    ? `Dibatalkan oleh ${nama} pada ${tanggal}: ${alasan}`
    : `Dibatalkan oleh ${nama} pada ${tanggal}`
}

/**
 * Catatan yang ditulis saat jumlahnya diperbaiki.
 *
 * Angka lamanya DICATAT. Tanpa ini, memperbaiki 10 Kotak menjadi 2 membuat
 * angka 10 hilang tanpa jejak — dan ketika kemudian ada yang bertanya kenapa
 * yang datang cuma 2, tidak ada satu pun tempat untuk melihat bahwa dulu
 * memang diminta 10.
 */
export function catatanUbahQty(
  oleh: string, lama: number, baru: number, satuan = '',
): string {
  const nama = (oleh || '').trim() || 'pengguna'
  const sat = (satuan || '').trim()
  const s = sat ? ` ${sat}` : ''
  const tanggal = new Date().toISOString().slice(0, 10)
  return `Jumlah diubah oleh ${nama} pada ${tanggal}:`
    + ` ${tampil(bilangan(lama))}${s} → ${tampil(bilangan(baru))}${s}`
}
