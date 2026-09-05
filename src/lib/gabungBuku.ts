// ============================================================
// PropFS — Menggabungkan buku laporan yang terlanjur kembar
//
// Satu proyek bisa berakhir dengan beberapa buku laporan. Tombol "Buat Buku
// Laporan" dulu tidak memeriksa apa pun, dan penjagaannya baru ditambahkan
// belakangan — di sisi aplikasi saja, sehingga dua orang yang menekannya di
// dua perangkat tetap bisa melahirkan dua buku.
//
// Akibatnya tidak terlihat sebagai galat. Setiap buku punya link pekerjanya
// sendiri, dan mandor yang menerima link berbeda mengisi ke buku yang
// berbeda. Laporannya utuh — hanya terpecah, dan tidak ada satu layar pun
// yang menunjukkan keseluruhannya. Rekap absensi ikut terbelah, dan upah
// dihitung dari separuh datanya.
//
// EMPAT tabel menempel pada sebuah buku: laporan harian, pemakaian material,
// permintaan material, dan daftar pekerja. Keempatnya `on delete cascade` —
// jadi menghapus buku yang kembar TIDAK menyelesaikan apa pun, ia
// menghanguskan isinya. Itu pula yang paling mungkin menjelaskan buku lama
// yang "hilang".
//
// Karena itu penggabungannya memindahkan isi, bukan menghapus; dan
// dikerjakan di server dalam SATU transaksi, sebab penggabungan yang gagal
// separuh jalan meninggalkan data terpecah dengan cara baru — lebih buruk
// daripada sebelum dimulai.
//
// Tanpa DOM & tanpa jaringan supaya bisa diuji di Node.
// ============================================================

const teks = (v: unknown): string => String(v ?? '').trim()
const kunci = (v: unknown): string => teks(v).toLowerCase()
const angka = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface BukuRingkas {
  id: string
  project_name?: string | null
  created_at?: string | null
  /** Berapa laporan yang sudah masuk ke buku ini. */
  jumlahLaporan?: number
}

export interface KelompokKembar {
  /** Nama proyeknya, apa adanya dari buku pertama. */
  nama: string
  buku: BukuRingkas[]
}

/**
 * Buku yang kembar: lebih dari satu buku untuk nama proyek yang SAMA.
 *
 * Dicocokkan tanpa peduli huruf besar dan spasi berlebih — "Ruko Pak Soni"
 * dan "ruko pak soni " lahir dari dua orang yang mengetik nama yang sama, dan
 * memperlakukannya sebagai dua proyek berbeda justru yang membuat kembarnya
 * tidak pernah ketahuan.
 *
 * Buku TANPA nama proyek tidak pernah dianggap kembar dengan apa pun. Kita
 * tidak tahu ia milik proyek mana, dan menebaknya berarti menggabungkan
 * laporan dua proyek yang berbeda — kerusakan yang tidak bisa dibatalkan.
 */
export function cariKembar(
  daftar: BukuRingkas[] | null | undefined,
): KelompokKembar[] {
  const peta = new Map<string, BukuRingkas[]>()
  for (const b of daftar ?? []) {
    const k = kunci(b?.project_name)
    if (!k || !teks(b?.id)) continue
    const isi = peta.get(k)
    if (isi) isi.push(b); else peta.set(k, [b])
  }
  const hasil: KelompokKembar[] = []
  for (const [, buku] of peta) {
    if (buku.length < 2) continue
    hasil.push({ nama: teks(buku[0].project_name), buku: [...buku].sort(urutBuku) })
  }
  return hasil.sort((a, b) => a.nama.localeCompare(b.nama, 'id-ID'))
}

/**
 * Urutan usulan: yang paling banyak isinya lebih dulu, lalu yang paling tua.
 *
 * Keduanya menunjuk hal yang sama — buku yang linknya sudah paling lama
 * beredar dan paling banyak dipakai. Itulah yang paling murah dipertahankan,
 * karena link buku yang digabungkan akan berhenti berlaku.
 */
function urutBuku(a: BukuRingkas, b: BukuRingkas): number {
  const selisih = angka(b.jumlahLaporan) - angka(a.jumlahLaporan)
  if (selisih !== 0) return selisih
  return teks(a.created_at).localeCompare(teks(b.created_at))
}

/** Buku yang disarankan dipertahankan. */
export function usulanTarget(k: KelompokKembar | null | undefined): string {
  return k?.buku?.[0]?.id ?? ''
}

export interface RencanaGabung {
  targetId: string
  sumberId: string[]
  /** Berapa laporan yang akan pindah. */
  laporanPindah: number
  boleh: boolean
  alasan: string
}

/**
 * Susun rencana penggabungan, dan tolak yang tidak masuk akal.
 *
 * Penolakannya menyebut sebabnya. Penggabungan tidak bisa dibatalkan, jadi
 * satu-satunya perlindungan yang berarti adalah menolak lebih awal —
 * sesudahnya tidak ada tombol urung.
 */
export function rencanaGabung(
  k: KelompokKembar | null | undefined, targetId: unknown,
): RencanaGabung {
  const buku = k?.buku ?? []
  const t = teks(targetId)
  const kosong: RencanaGabung = {
    targetId: t, sumberId: [], laporanPindah: 0, boleh: false, alasan: '',
  }
  if (buku.length < 2) {
    return { ...kosong, alasan: 'Tidak ada buku kembar untuk digabungkan.' }
  }
  if (!t) return { ...kosong, alasan: 'Pilih dulu buku mana yang dipertahankan.' }
  if (!buku.some(b => b.id === t)) {
    return { ...kosong, alasan: 'Buku yang dipilih bukan bagian dari kelompok ini.' }
  }
  const sumber = buku.filter(b => b.id !== t)
  return {
    targetId: t,
    sumberId: sumber.map(b => b.id),
    laporanPindah: sumber.reduce((s, b) => s + angka(b.jumlahLaporan), 0),
    boleh: true,
    alasan: '',
  }
}

/**
 * Kalimat konfirmasi — menyebut yang HILANG, bukan hanya yang didapat.
 *
 * Yang hilang di sini bukan datanya melainkan LINK-nya: tiap buku punya link
 * pekerja sendiri, dan link buku yang digabungkan berhenti berlaku. Mandor
 * yang masih memegangnya akan menemukan halamannya kosong, dan tidak ada
 * yang memberitahunya kecuali orang yang menggabungkan.
 */
export function kalimatGabung(r: RencanaGabung | null | undefined, nama = ''): string {
  if (!r?.boleh) return ''
  const n = r.sumberId.length
  const bagian = [
    `${n} buku${nama ? ` proyek ${nama}` : ''} akan digabung ke buku yang dipertahankan.`,
  ]
  if (r.laporanPindah > 0) bagian.push(`${r.laporanPindah} laporan ikut pindah, tidak ada yang dihapus.`)
  bagian.push(
    `Link pekerja dari ${n} buku itu berhenti berlaku —`
    + ' bagikan ulang link buku yang dipertahankan kepada mandor.',
  )
  return bagian.join(' ')
}
