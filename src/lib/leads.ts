// ============================================================
// PropFS — Cari Leads (logika murni, tanpa DOM & tanpa jaringan)
//
// Calon konsumen yang mencari kontraktor renovasi selama ini masuk lewat DM
// WhatsApp: datanya tercecer di gelembung chat, tidak ada yang tahu berapa
// yang masuk bulan ini, dan yang belum sempat dibalas menghilang tertimbun
// percakapan lain.
//
// Modul ini memegang tiga hal yang harus benar dan tidak boleh berbeda antara
// halaman form publik dan halaman pengelolaannya: apa yang wajib diisi,
// bagaimana nomor HP dirapikan, dan pesan apa yang dibawa ke WhatsApp.
// ============================================================

export type StatusLead = 'baru' | 'dihubungi' | 'survei' | 'penawaran' | 'deal' | 'batal'

/**
 * Tahapan sengaja sedikit. Pipeline yang terlalu rinci tidak pernah
 * diperbarui, dan pipeline yang tidak diperbarui menipu orang yang membacanya.
 */
export const URUT_STATUS: StatusLead[] = ['baru', 'dihubungi', 'survei', 'penawaran', 'deal', 'batal']

export const LABEL_STATUS: Record<StatusLead, string> = {
  baru: 'Baru masuk',
  dihubungi: 'Sudah dihubungi',
  survei: 'Survei lokasi',
  penawaran: 'Penawaran dikirim',
  deal: 'Deal',
  batal: 'Batal',
}

export const TONE_STATUS: Record<StatusLead, string> = {
  baru: 'bg-rose-100 text-rose-700',
  dihubungi: 'bg-amber-100 text-amber-700',
  survei: 'bg-blue-100 text-blue-700',
  penawaran: 'bg-violet-100 text-violet-700',
  deal: 'bg-emerald-100 text-emerald-700',
  batal: 'bg-slate-100 text-slate-600',
}

/** Status yang berarti urusannya sudah selesai — tidak perlu ditindaklanjuti lagi. */
export const STATUS_SELESAI: StatusLead[] = ['deal', 'batal']

export const JENIS_PROYEK = [
  'Renovasi rumah',
  'Renovasi ruko / kantor',
  'Interior',
  'Bangun baru',
  'Perbaikan / maintenance',
  'Lainnya',
]

export interface IsiFormLead {
  nama?: string
  no_hp?: string
  email?: string
  jenis?: string
  lokasi?: string
  luas?: string
  kondisi?: string
  anggaran?: string
  target_mulai?: string
  catatan?: string
  foto?: string[]
  sumber?: string
}

export interface Lead extends IsiFormLead {
  id: string
  user_id?: string
  status?: string
  catatan_internal?: string
  created_at?: string
  updated_at?: string
}

const teks = (v: unknown) => String(v ?? '').trim()

/** Status apa adanya bila dikenali; selain itu dianggap baru masuk. */
export function bacaStatus(v: unknown): StatusLead {
  const s = teks(v).toLowerCase()
  return (URUT_STATUS as string[]).includes(s) ? s as StatusLead : 'baru'
}

// ── Nomor HP ────────────────────────────────────────────────────────────────

/**
 * Rapikan nomor HP Indonesia menjadi bentuk internasional tanpa tanda apa pun.
 *
 * "0812-3456-7890" → "6281234567890". Dirapikan karena calon konsumen menulis
 * nomornya dengan segala macam bentuk, dan tautan WhatsApp hanya menerima satu.
 *
 * Nomor yang jelas tidak masuk akal dikembalikan null, BUKAN ditebak: nomor
 * salah yang terlihat benar jauh lebih merepotkan daripada kolom kosong.
 */
export function rapikanHp(input: unknown): string | null {
  let n = teks(input).replace(/[\s\-().]/g, '')
  if (!n) return null
  if (n.startsWith('+')) n = n.slice(1)
  if (!/^\d+$/.test(n)) return null

  if (n.startsWith('62')) {
    // biarkan
  } else if (n.startsWith('0')) {
    n = `62${n.slice(1)}`
  } else if (n.startsWith('8')) {
    // Ditulis tanpa 0 di depan — lazim saat orang mengetik cepat.
    n = `62${n}`
  } else {
    // Nomor luar negeri: diterima apa adanya selama panjangnya masuk akal.
    return n.length >= 8 && n.length <= 15 ? n : null
  }

  // Nomor seluler Indonesia: 62 + 8xx… Total 11–15 digit menutup semua operator.
  if (!n.startsWith('628')) return null
  return n.length >= 11 && n.length <= 15 ? n : null
}

/** Bentuk yang enak dibaca di layar: "0812-3456-7890". */
export function tampilHp(input: unknown): string {
  const n = rapikanHp(input)
  if (!n) return teks(input)
  const lokal = `0${n.slice(2)}`
  return lokal.replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3')
}

// ── Pemeriksaan form ────────────────────────────────────────────────────────

export interface HasilPeriksa {
  sah: boolean
  /** Pesan galat per kolom; kosong berarti kolomnya benar. */
  galat: Record<string, string>
}

/**
 * Periksa isian form publik.
 *
 * Hanya nama dan nomor HP yang WAJIB. Memaksa email membuat sebagian calon
 * berhenti mengisi, dan calon yang berhenti mengisi jauh lebih mahal daripada
 * satu kolom yang kosong. Email tetap diperiksa bentuknya bila diisi — salah
 * ketik yang didiamkan baru ketahuan saat penawaran gagal terkirim.
 */
export function periksaForm(isi: IsiFormLead, maksFoto = 6): HasilPeriksa {
  const galat: Record<string, string> = {}

  const nama = teks(isi?.nama)
  if (!nama) galat.nama = 'Nama wajib diisi.'
  else if (nama.length < 2) galat.nama = 'Nama terlalu pendek.'

  const hp = teks(isi?.no_hp)
  if (!hp) galat.no_hp = 'Nomor HP wajib diisi — ini satu-satunya cara kami menghubungi Anda.'
  else if (!rapikanHp(hp)) galat.no_hp = 'Nomor HP belum benar. Contoh: 0812-3456-7890'

  const email = teks(isi?.email)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    galat.email = 'Alamat email belum benar.'
  }

  const foto = Array.isArray(isi?.foto) ? isi.foto.filter(f => teks(f)) : []
  if (foto.length > maksFoto) galat.foto = `Maksimal ${maksFoto} foto.`

  return { sah: Object.keys(galat).length === 0, galat }
}

/** Bersihkan isian sebelum dikirim: spasi dirapikan, nomor dibakukan. */
export function siapkanKiriman(isi: IsiFormLead, maksFoto = 6): IsiFormLead {
  return {
    nama: teks(isi?.nama),
    no_hp: rapikanHp(isi?.no_hp) ?? teks(isi?.no_hp),
    email: teks(isi?.email),
    jenis: teks(isi?.jenis),
    lokasi: teks(isi?.lokasi),
    luas: teks(isi?.luas),
    kondisi: teks(isi?.kondisi),
    anggaran: teks(isi?.anggaran),
    target_mulai: teks(isi?.target_mulai),
    catatan: teks(isi?.catatan),
    foto: (Array.isArray(isi?.foto) ? isi.foto.filter(f => teks(f)) : []).slice(0, maksFoto),
    sumber: teks(isi?.sumber),
  }
}

// ── Antar ke WhatsApp ───────────────────────────────────────────────────────

/**
 * Pesan pembuka yang sudah terisi, dibawa calon konsumen ke WhatsApp.
 *
 * Ditulis dari sudut pandang CALON, bukan perusahaan — yang menekan tombol
 * kirim di WhatsApp adalah dia. Isinya mengulang data yang baru saja ia isi
 * supaya orang yang menerima di seberang tidak perlu bertanya dari nol.
 */
export function pesanWaLead(isi: IsiFormLead, perusahaan = ''): string {
  const b: string[] = []
  b.push(`Halo${perusahaan ? ` ${perusahaan}` : ''}, saya ${teks(isi?.nama) || 'calon konsumen'}.`)
  b.push('Saya baru mengisi form konsultasi renovasi. Ringkasannya:')
  b.push('')
  const baris: Array<[string, string]> = [
    ['Kebutuhan', teks(isi?.jenis)],
    ['Lokasi', teks(isi?.lokasi)],
    ['Luas', teks(isi?.luas)],
    ['Kondisi saat ini', teks(isi?.kondisi)],
    ['Perkiraan anggaran', teks(isi?.anggaran)],
    ['Rencana mulai', teks(isi?.target_mulai)],
  ]
  for (const [label, nilai] of baris) if (nilai) b.push(`• ${label}: ${nilai}`)
  if (teks(isi?.catatan)) b.push(`• Catatan: ${teks(isi.catatan)}`)
  const foto = Array.isArray(isi?.foto) ? isi.foto.filter(f => teks(f)).length : 0
  if (foto > 0) b.push(`• Saya sudah melampirkan ${foto} foto di form.`)
  b.push('')
  b.push('Mohon informasi langkah selanjutnya. Terima kasih.')
  return b.join('\n')
}

/** Pesan untuk MENGHUBUNGI calon dari sisi perusahaan (tombol di daftar lead). */
export function pesanBalasLead(lead: Lead, perusahaan = ''): string {
  const b: string[] = []
  b.push(`Halo ${teks(lead?.nama) || 'Bapak/Ibu'},`)
  b.push(`Saya dari ${perusahaan || 'tim kontraktor'}, menindaklanjuti form konsultasi renovasi yang Anda isi.`)
  const apa = teks(lead?.jenis)
  const di = teks(lead?.lokasi)
  if (apa || di) {
    b.push(`Untuk ${apa || 'pekerjaan'}${di ? ` di ${di}` : ''}, boleh kami jadwalkan survei lokasi?`)
  } else {
    b.push('Boleh kami jadwalkan survei lokasi untuk menghitung kebutuhannya?')
  }
  return b.join('\n')
}

// ── Ringkasan untuk layar pengelolaan ───────────────────────────────────────

export interface RingkasLead {
  total: number
  /** Jumlah per status, semua status selalu ada (nol pun tetap dicantumkan). */
  perStatus: Record<StatusLead, number>
  /** Yang belum ditutup — ini yang sebenarnya menuntut tindakan. */
  perluTindakan: number
  /** Masuk dalam 7 hari terakhir. */
  mingguIni: number
  /** Persen deal dari yang sudah ditutup; null bila belum ada yang ditutup. */
  persenDeal: number | null
}

export function ringkasLeads(daftar: Lead[] = [], sekarang = new Date()): RingkasLead {
  const perStatus = URUT_STATUS.reduce((a, s) => { a[s] = 0; return a }, {} as Record<StatusLead, number>)
  const batas = new Date(sekarang.getTime() - 7 * 86_400_000).toISOString()
  let mingguIni = 0

  for (const l of daftar ?? []) {
    perStatus[bacaStatus(l?.status)]++
    if (teks(l?.created_at) >= batas) mingguIni++
  }

  const ditutup = perStatus.deal + perStatus.batal
  return {
    total: (daftar ?? []).length,
    perStatus,
    perluTindakan: (daftar ?? []).length - ditutup,
    mingguIni,
    // Persen dihitung terhadap yang SUDAH ditutup saja. Menghitungnya
    // terhadap seluruh lead akan membuat angkanya jatuh setiap ada lead baru
    // masuk — seolah kinerjanya memburuk padahal justru sebaliknya.
    persenDeal: ditutup > 0 ? (perStatus.deal / ditutup) * 100 : null,
  }
}

/** Saring & urutkan daftar untuk ditampilkan. */
export function saringLeads(
  daftar: Lead[] = [],
  opsi: { status?: StatusLead | 'semua'; cari?: string } = {},
): Lead[] {
  const status = opsi.status && opsi.status !== 'semua' ? opsi.status : null
  const kata = teks(opsi.cari).toLowerCase().split(/\s+/).filter(Boolean)

  return (daftar ?? [])
    .filter(l => {
      if (status && bacaStatus(l?.status) !== status) return false
      if (kata.length === 0) return true
      const isi = [l?.nama, l?.no_hp, l?.email, l?.jenis, l?.lokasi, l?.kondisi, l?.sumber]
        .map(teks).join(' ').toLowerCase()
      return kata.every(k => isi.includes(k))
    })
    // Terbaru di atas; id dipakai pemecah seri supaya urutannya tetap.
    .sort((a, b) => teks(b.created_at).localeCompare(teks(a.created_at))
      || teks(a.id).localeCompare(teks(b.id)))
}

/** Kalimat sebaris tentang satu lead, untuk baris daftar. */
export function ringkasSatu(l: Lead): string {
  const bagian = [teks(l?.jenis), teks(l?.lokasi), teks(l?.anggaran)].filter(Boolean)
  return bagian.length > 0 ? bagian.join(' · ') : 'Belum ada keterangan proyek'
}
