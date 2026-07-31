// ============================================================
// Pemilih proyek di header — dipakai halaman modul yang isinya memang
// milik SATU proyek (RAB, Material Schedule, Kurva S, Realisasi, SPK,
// Procurement, Material Lapangan).
//
// Sebelum ini satu-satunya cara berpindah proyek adalah kembali ke Home lalu
// membuka proyek lain — tiga ketukan untuk sesuatu yang dilakukan berkali-kali
// sehari. Pemilihnya kini menempel di header, jadi berpindah tidak
// mengeluarkan pemakainya dari modul yang sedang dibuka.
//
// Memilih proyek juga MENGUBAH PROYEK AKTIF, bukan sekadar menyaring layar
// ini. Dengan begitu hanya ada satu jawaban untuk "saya sedang melihat proyek
// mana", dan jawabannya ikut terbawa saat pindah modul.
//
// Berpindah aman tanpa konfirmasi: setiap perubahan sudah langsung ditulis ke
// localStorage dan disinkronkan ke Supabase, jadi tidak ada yang menggantung.
// ============================================================
import { Building2, ChevronDown } from 'lucide-react'
import { useCostStore } from '@/store/costStore'
import { SEMUA_PROYEK } from '@/lib/lingkupProyek'

export { SEMUA_PROYEK, saringProyek } from '@/lib/lingkupProyek'

interface Props {
  terang?: boolean
  /**
   * Menambahkan pilihan "Semua Proyek". Hanya untuk halaman berupa DAFTAR;
   * halaman workspace proyek tidak punya arti tanpa satu proyek terpilih.
   */
  izinkanSemua?: boolean
  /** Lingkup yang sedang ditampilkan halaman ini. '' = semua proyek. */
  nilai?: string
  /** Dipanggil dengan id proyek, atau '' bila memilih semua. */
  onPilih?: (id: string) => void
}

export default function PilihProyek({ terang = true, izinkanSemua, nilai, onPilih }: Props) {
  const projectInfo = useCostStore(s => s.projectInfo)
  const savedProjects = useCostStore(s => s.savedProjects)
  const loadProject = useCostStore(s => s.loadProject)

  const daftar = savedProjects.map(p => p.info)
  // Proyek aktif belum tentu ada di daftar tersimpan (mis. baru dibuat dan
  // belum sempat tersinkron). Ia tetap harus bisa dipilih, kalau tidak
  // pemilihnya akan tampak melompat ke proyek lain.
  const adaDiDaftar = daftar.some(p => p.id === projectInfo?.id)
  const opsi = adaDiDaftar || !projectInfo ? daftar : [projectInfo, ...daftar]

  const terpilih = nilai !== undefined ? nilai : (projectInfo?.id ?? '')
  const proyekTerpilih = opsi.find(p => p.id === terpilih)
  const label = terpilih === SEMUA_PROYEK && izinkanSemua
    ? 'Semua Proyek'
    : proyekTerpilih
      ? proyekTerpilih.projectName + (proyekTerpilih.location ? ` · ${proyekTerpilih.location}` : '')
      : 'Pilih proyek'

  function pilih(id: string) {
    // Memilih proyek sungguhan sekalian menjadikannya proyek aktif, supaya
    // pilihannya ikut terbawa ke modul lain. "Semua" tidak mengubah apa pun —
    // ia hanya melebarkan tampilan halaman ini.
    if (id) loadProject(id)
    onPilih?.(id)
  }

  // Tidak ada yang bisa dipilih: cukup ditampilkan. Dropdown kosong hanya
  // memancing ketukan yang sia-sia.
  if (opsi.length <= 1 && !izinkanSemua) {
    return (
      <span className="inline-flex items-center gap-1 min-w-0">
        <Building2 className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
    )
  }

  return (
    <span className={`relative inline-flex items-center gap-1 rounded-lg pl-1.5 pr-6 py-0.5 max-w-full
      ${terang ? 'bg-white/10 hover:bg-white/20' : 'bg-black/5 hover:bg-black/10'} transition-colors`}>
      <Building2 className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
      <ChevronDown className="h-3 w-3 absolute right-1.5 pointer-events-none" />
      {/* <select> asli dipakai supaya daftar panjang memakai pemilih bawaan HP
          yang sudah bisa digulir — bukan menu buatan sendiri yang selalu kalah
          nyaman di layar kecil. */}
      <select
        aria-label="Pilih proyek"
        value={terpilih}
        onChange={e => pilih(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {izinkanSemua && <option value={SEMUA_PROYEK}>Semua Proyek</option>}
        {!izinkanSemua && !proyekTerpilih && <option value="">Pilih proyek…</option>}
        {opsi.map(p => (
          <option key={p.id} value={p.id}>
            {p.projectName}{p.location ? ` · ${p.location}` : ''}
          </option>
        ))}
      </select>
    </span>
  )
}
