// ============================================================
// CHAT TIM — ruang percakapan per workspace, bercampur kabar sistem.
//
// Koordinasi tim selama ini terjadi di WhatsApp: keputusan lapangan tidak punya
// jejak yang bisa dirujuk, dan tidak ada dasar apa pun untuk menilai siapa
// mengerjakan apa. Di sini percakapan dan kabar sistem berada dalam satu aliran
// yang sama, jadi "besok cor kolom" duduk persis di sebelah "laporan harian dari
// Pak Yono masuk".
//
// Kabar sistem TIDAK disimpan ke tabel chat — ia diturunkan saat dibaca dari
// data yang sudah ada. Berlaku surut, tanpa trigger yang bisa gagal terpasang,
// dan bila barisnya dihapus kabarnya ikut hilang.
//
// Satu workspace = satu ruang. Anggota yang bekerja di dua perusahaan otomatis
// melihat dua ruang terpisah, karena `user_id` barisnya adalah pemilik workspace.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Send, Paperclip, Loader2, X, RefreshCw, Users, BarChart3,
  HardHat, PackageOpen, ShoppingCart, Truck, FileSignature, ClipboardList,
  MessageSquare, Info, Trash2, ReceiptText,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import KontraktorHeader from '@/components/cost/KontraktorHeader'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/store/authStore'
import { chatTimApi } from '@/lib/chatTimApi'
import {
  susunChat, kelompokHari, belumTerbaca, batasTerbaca, ringkasChat, proyekDiChat,
  type BarisChat, type PesanTim,
} from '@/lib/chatTim'
import { nilaiKpi, ringkasAnggota, LABEL_KEGIATAN, URUT_KEGIATAN, type AnggotaKpi } from '@/lib/kpiTim'
import { susunNotifikasi, waktuLalu, type Notifikasi, type JenisNotifikasi } from '@/lib/notifikasi'
import { teamApi, roleSaatIni, type Workspace } from '@/lib/teamApi'
import { ROLES } from '@/lib/teamRoles'
import { fieldApi } from '@/lib/fieldReports'
import { materialApi } from '@/lib/materialApi'
import { penerimaanApi } from '@/lib/penerimaanApi'
import { spkApi } from '@/lib/spkApi'
import { procurementApi } from '@/lib/procurementApi'
import { downscaleImage } from '@/lib/imageUtil'

const KUNCI_BACA = 'propfs-chattim-dibaca'
const SEMUA = '__semua__'

const IKON: Record<JenisNotifikasi, typeof HardHat> = {
  laporan: HardHat, pakai: PackageOpen, request: ShoppingCart,
  terima: Truck, ttd: FileSignature, opname: ClipboardList, invoice: ReceiptText,
}
const WARNA: Record<JenisNotifikasi, string> = {
  laporan: 'bg-amber-100 text-amber-700',
  pakai: 'bg-blue-100 text-blue-700',
  request: 'bg-rose-100 text-rose-700',
  terima: 'bg-emerald-100 text-emerald-700',
  ttd: 'bg-violet-100 text-violet-700',
  opname: 'bg-slate-100 text-slate-700',
  invoice: 'bg-sky-100 text-sky-700',
}

const jam = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatTimPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { profile, user } = useAuthStore()

  const [pesan, setPesan] = useState<PesanTim[]>([])
  const [kabar, setKabar] = useState<Notifikasi[]>([])
  const [anggota, setAnggota] = useState<AnggotaKpi[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [teks, setTeks] = useState('')
  const [foto, setFoto] = useState<string[]>([])
  const [mengirim, setMengirim] = useState(false)
  const [proyek, setProyek] = useState<string>(SEMUA)
  const [tab, setTab] = useState<'chat' | 'kpi'>('chat')
  const [hariKpi, setHariKpi] = useState(30)
  const [terakhir, setTerakhir] = useState<string>(() => {
    try { return localStorage.getItem(KUNCI_BACA) ?? '' } catch { return '' }
  })

  const akhirRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function muat(diam = false) {
    if (!diam) setMemuat(true)
    try {
      // Kegagalan satu sumber tidak boleh mengosongkan seluruh ruang — kabar
      // dari modul lain tetap layak ditampilkan. Hanya kegagalan tabel chat
      // sendiri yang dilaporkan, karena itulah yang benar-benar menghalangi.
      const [pesanBaru, laporan, pakai, request, terima, spk, opname, member, ws, invoice] = await Promise.all([
        chatTimApi().list(300),
        fieldApi().listReportsTerbaru(50).catch(() => []),
        materialApi().listUsage().catch(() => []),
        materialApi().listRequests().catch(() => []),
        penerimaanApi().listDo().catch(() => []),
        spkApi().listSpk().catch(() => []),
        spkApi().listOpname().catch(() => []),
        teamApi().listMembers().catch(() => []),
        teamApi().myWorkspaces().catch(() => []),
        procurementApi().listInvoice().catch(() => []),
      ])
      setPesan(pesanBaru)
      setKabar(susunNotifikasi({
        laporan: laporan as never, pakai, request, terima,
        ttd: spk as never, opname: opname as never, invoice: invoice as never,
      }))
      setWorkspaces(ws)

      // Pemilik workspace tidak tercatat sebagai anggota tim, tetapi jejaknya
      // ikut terhitung — jadi ia ditambahkan sendiri di depan daftar.
      const daftar: AnggotaKpi[] = member
        .filter(m => m.status === 'aktif')
        .map(m => ({ id: m.member_user_id ?? m.id, nama: m.nama, role: m.role }))
      if (user?.id && !daftar.some(a => a.id === user.id)) {
        daftar.unshift({ id: user.id, nama: profile?.full_name || 'Saya', role: 'pemilik' })
      }
      setAnggota(daftar)
      setGalat('')
    } catch (e) {
      setGalat(e instanceof Error ? e.message : String(e))
    } finally { setMemuat(false) }
  }

  useEffect(() => { void muat() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const semua = useMemo(() => susunChat(pesan, kabar), [pesan, kabar])
  const aliran = useMemo(
    () => (proyek === SEMUA ? semua : susunChat(pesan, kabar, { proyek })),
    [semua, pesan, kabar, proyek],
  )
  const hari = useMemo(() => kelompokHari(aliran), [aliran])
  const daftarProyek = useMemo(() => proyekDiChat(semua), [semua])
  const kpi = useMemo(() => nilaiKpi(semua, anggota, { hari: hariKpi }), [semua, anggota, hariKpi])

  // Dihitung SEKALI saat ruangnya dibuka, lalu dibekukan. Kalau dihitung terus
  // dari `terakhir`, angkanya jatuh ke nol pada render berikutnya — persis
  // setelah efek di bawah menandainya terbaca — dan pemakainya cuma melihat
  // angka berkedip sekejap tanpa sempat terbaca.
  const [baru, setBaru] = useState(0)
  const [sudahHitung, setSudahHitung] = useState(false)

  // Digulirkan ke bawah setiap aliran berubah — ruang chat yang membuka di
  // tengah riwayat membuat orang mengira pesannya belum terkirim.
  useEffect(() => {
    if (tab === 'chat') akhirRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aliran.length, tab])

  // Ditandai terbaca begitu ruangnya dibuka: pemakainya memang sedang melihatnya.
  useEffect(() => {
    if (memuat || semua.length === 0) return
    if (!sudahHitung) {
      setBaru(belumTerbaca(semua, terakhir, user?.id).length)
      setSudahHitung(true)
    }
    const batas = batasTerbaca(semua)
    try { localStorage.setItem(KUNCI_BACA, batas) } catch { /* mode privat */ }
    setTerakhir(batas)
  }, [memuat, semua, sudahHitung, terakhir, user?.id])

  const role = roleSaatIni(workspaces)
  const namaSaya = profile?.full_name || 'Saya'

  async function pilihFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const berkas = Array.from(e.target.files ?? [])
    for (const f of berkas) {
      try {
        const kecil = await downscaleImage(f)
        setFoto(v => [...v, kecil])
      } catch {
        toast({ title: `${f.name} gagal dibaca`, variant: 'destructive' })
      }
    }
    e.target.value = ''
  }

  async function kirim() {
    const isi = teks.trim()
    if ((!isi && foto.length === 0) || mengirim) return
    setMengirim(true)
    try {
      const baris = await chatTimApi().kirim({
        teks: isi, foto,
        // Pesan mewarisi proyek yang sedang disaring: kalau pemakainya membuka
        // ruang "Ruko Pak Soni", yang ia tulis memang tentang proyek itu.
        project_name: proyek === SEMUA ? '' : proyek,
        penulis_nama: namaSaya,
        penulis_role: role,
      })
      setPesan(v => [baris, ...v])
      setTeks('')
      setFoto([])
    } catch (e) {
      toast({
        title: 'Pesan tidak terkirim',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally { setMengirim(false) }
  }

  async function hapus(id: string) {
    if (!window.confirm('Hapus pesan ini?')) return
    const asli = pesan
    setPesan(v => v.filter(p => p.id !== id))
    try {
      await chatTimApi().hapus(id)
    } catch (e) {
      setPesan(asli)
      toast({
        title: 'Gagal menghapus',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  function barisChat(b: BarisChat) {
    if (b.jenis === 'sistem') {
      const Ikon = IKON[b.kategori]
      return (
        <button key={b.id} onClick={() => navigate(b.tautan)}
          className="w-full text-left flex gap-2.5 px-3 py-2 rounded-2xl bg-slate-50 border border-border hover:border-navy/30 transition-colors">
          <span className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${WARNA[b.kategori]}`}>
            <Ikon className="w-3.5 h-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-bold text-navy truncate">{b.judul}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{jam(b.waktu)}</span>
            </span>
            <span className="block text-[11px] text-muted-foreground truncate">{b.rincian}</span>
            {b.menunggu && <span className="text-[10px] font-bold text-rose-700">• perlu tindakan</span>}
          </span>
        </button>
      )
    }

    const saya = !!user?.id && b.penulisId === user.id
    return (
      <div key={b.id} className={`flex ${saya ? 'justify-end' : 'justify-start'}`}>
        <div className={`group max-w-[85%] min-w-0 rounded-2xl px-3 py-2 ${
          saya ? 'bg-navy text-white rounded-br-sm' : 'bg-white border border-border text-navy rounded-bl-sm'}`}>
          {!saya && (
            <p className="text-[10px] font-bold text-[#8A6D1F] mb-0.5 truncate">
              {b.nama}
              {b.role && <span className="font-medium opacity-70"> · {ROLES.find(r => r.key === b.role)?.label ?? b.role}</span>}
            </p>
          )}
          {b.foto.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {b.foto.map((f, i) => (
                <img key={i} src={f} alt="Foto lapangan"
                  className="w-24 h-24 object-cover rounded-xl border border-white/20" />
              ))}
            </div>
          )}
          {b.teks && <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{b.teks}</p>}
          <p className={`text-[10px] mt-0.5 flex items-center justify-end gap-1.5 ${saya ? 'text-white/50' : 'text-muted-foreground'}`}>
            {b.proyek && <span className="truncate max-w-[120px]">{b.proyek}</span>}
            {jam(b.waktu)}
            {saya && (
              <button onClick={() => void hapus(b.id.replace(/^pesan:/, ''))}
                aria-label="Hapus pesan"
                className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-300">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100/70 flex flex-col">
      <KontraktorHeader
        judul="Chat Tim"
        subjudul={`${ringkasChat(semua)}${baru > 0 ? ` · ${baru} baru` : ''}`}
        kembaliKe="/kontraktor"
        aksi={
          <div className="flex gap-2">
            <button onClick={() => void muat(true)}
              aria-label="Muat ulang"
              className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 text-white flex items-center justify-center">
              <RefreshCw className={`w-4 h-4 ${memuat ? 'animate-spin' : ''}`} />
            </button>
            {daftarProyek.length > 0 && (
              <select value={proyek} onChange={e => setProyek(e.target.value)}
                aria-label="Saring proyek"
                className="h-9 max-w-[190px] bg-white/10 text-white text-xs font-bold rounded-xl px-3 border border-white/20">
                <option value={SEMUA} className="text-navy">Semua proyek</option>
                {daftarProyek.map(p => <option key={p} value={p} className="text-navy">{p}</option>)}
              </select>
            )}
          </div>
        }
      />

      <div className="flex-1 max-w-3xl w-full mx-auto px-4 -mt-2 pb-4 flex flex-col">
        <div className="flex gap-1.5 mb-2">
          {([['chat', 'Percakapan', MessageSquare], ['kpi', 'Keaktifan Tim', BarChart3]] as const).map(([k, l, I]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                tab === k ? 'bg-navy text-white' : 'bg-white text-muted-foreground border border-border hover:border-navy'}`}>
              <I className="w-3.5 h-3.5" /> {l}
            </button>
          ))}
        </div>

        {galat && (
          <div className="mb-2 rounded-2xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-900 leading-relaxed">{galat}</p>
          </div>
        )}

        {tab === 'chat' ? (
          <div className="flex-1 bg-white rounded-2xl border border-border flex flex-col overflow-hidden min-h-[58vh]">
            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50/60">
              {memuat && aliran.length === 0 && (
                <div className="py-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Memuat percakapan…
                </div>
              )}
              {!memuat && aliran.length === 0 && (
                <p className="py-10 px-6 text-center text-xs text-muted-foreground leading-relaxed">
                  Belum ada percakapan. Mulai dari sini — dan setiap kabar dari lapangan
                  (laporan harian, permintaan material, barang datang) akan muncul di
                  ruang ini dengan sendirinya.
                </p>
              )}
              {hari.map(k => (
                <div key={k.hari} className="space-y-2">
                  <div className="flex justify-center py-1">
                    <span className="text-[10px] font-bold text-muted-foreground bg-white border border-border rounded-full px-3 py-1">
                      {k.label}
                    </span>
                  </div>
                  {k.baris.map(barisChat)}
                </div>
              ))}
              <div ref={akhirRef} />
            </div>

            <div className="border-t border-border p-3 space-y-2">
              {foto.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {foto.map((f, i) => (
                    <div key={i} className="relative">
                      <img src={f} alt="" className="w-14 h-14 object-cover rounded-xl border border-border" />
                      <button onClick={() => setFoto(v => v.filter((_, j) => j !== i))}
                        aria-label="Buang foto"
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-navy text-white flex items-center justify-center">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <input ref={fileRef} type="file" multiple accept="image/*" onChange={pilihFoto} className="hidden" />
                <button onClick={() => fileRef.current?.click()} disabled={mengirim}
                  aria-label="Lampirkan foto"
                  className="w-10 h-10 shrink-0 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-navy hover:border-navy disabled:opacity-50">
                  <Paperclip className="w-4 h-4" />
                </button>
                <textarea
                  value={teks} onChange={e => setTeks(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void kirim() } }}
                  rows={1}
                  placeholder={proyek === SEMUA ? 'Tulis pesan ke tim…' : `Tulis pesan tentang ${proyek}…`}
                  className="flex-1 min-w-0 resize-none rounded-xl border border-border px-3 py-2.5 text-sm max-h-32 focus:outline-none focus:ring-2 focus:ring-gold"
                />
                <button onClick={() => void kirim()} disabled={mengirim || (!teks.trim() && foto.length === 0)}
                  aria-label="Kirim pesan"
                  className="w-10 h-10 shrink-0 rounded-xl bg-navy text-white flex items-center justify-center disabled:opacity-40">
                  {mengirim ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ── Keaktifan tim ─────────────────────────────────────────────── */
          <div className="flex-1 space-y-3">
            <div className="rounded-2xl bg-white border border-border p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold text-navy text-sm flex items-center gap-1.5">
                  <Users className="w-4 h-4" /> Keaktifan {kpi.hari} hari terakhir
                </h2>
                <div className="flex gap-1">
                  {[7, 30, 90].map(d => (
                    <button key={d} onClick={() => setHariKpi(d)}
                      className={`text-[11px] font-bold rounded-full px-2.5 py-1 border transition-colors ${
                        hariKpi === d ? 'bg-navy text-white border-navy' : 'bg-white text-muted-foreground border-border hover:border-navy'}`}>
                      {d}h
                    </button>
                  ))}
                </div>
              </div>

              {/* Disebut apa adanya. Angka yang diperlakukan sebagai vonis akan
                  mendorong tim mengisi sistem demi angkanya, bukan demi kerjanya. */}
              <p className="text-[11px] text-muted-foreground leading-relaxed bg-slate-50 rounded-xl p-2.5">
                Yang dihitung di sini adalah <b>jejak yang tercatat di sistem</b>, bukan nilai
                seseorang. Pekerjaan yang tidak melewati sistem ini tidak akan terlihat —
                jadi pakai angkanya sebagai bahan bertanya, bukan sebagai kesimpulan.
              </p>

              {kpi.anggota.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  Belum ada anggota tim terdaftar. Tambahkan lewat menu User Team.
                </p>
              ) : (
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full text-[11px] min-w-[520px]">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border">
                        <th className="py-1.5 pr-2 font-bold">Anggota</th>
                        <th className="py-1.5 px-1 font-bold text-right">Pesan</th>
                        {URUT_KEGIATAN.map(j => (
                          <th key={j} className="py-1.5 px-1 font-bold text-right whitespace-nowrap">{LABEL_KEGIATAN[j]}</th>
                        ))}
                        <th className="py-1.5 pl-1 font-bold text-right whitespace-nowrap">Hari aktif</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {kpi.anggota.map(a => (
                        <tr key={a.id} className={a.pesan + a.totalKegiatan === 0 ? 'text-muted-foreground' : 'text-navy'}>
                          <td className="py-2 pr-2 min-w-0">
                            <p className="font-bold truncate max-w-[150px]">{a.nama}</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                              {ROLES.find(r => r.key === a.role)?.label ?? a.role}
                              {a.terakhir ? ` · ${waktuLalu(a.terakhir)}` : ''}
                            </p>
                          </td>
                          <td className="py-2 px-1 text-right tabular-nums font-bold">{a.pesan || '–'}</td>
                          {URUT_KEGIATAN.map(j => (
                            <td key={j} className="py-2 px-1 text-right tabular-nums">{a.kegiatan[j] || '–'}</td>
                          ))}
                          <td className="py-2 pl-1 text-right tabular-nums font-bold">{a.hariAktif || '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {kpi.belumTerhubung.length > 0 && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-1.5">
                <p className="text-xs font-bold text-amber-900">Belum terhubung ke akun</p>
                <p className="text-[11px] text-amber-900/80 leading-relaxed">
                  Kegiatan berikut tercatat atas nama orang yang tidak cocok dengan anggota
                  mana pun — biasanya karena nama yang ditulis di lapangan berbeda dari nama
                  akunnya. Samakan namanya di menu User Team agar ikut terhitung.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {kpi.belumTerhubung.map(b => (
                    <span key={b.nama} className="text-[11px] font-bold bg-white border border-amber-300 text-amber-900 rounded-full px-2.5 py-1">
                      {b.nama} · {b.jumlah}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-white border border-border p-4 space-y-2">
              <h3 className="font-bold text-navy text-sm">Ringkasan</h3>
              {kpi.anggota.map(a => (
                <div key={a.id} className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-navy truncate min-w-0">{a.nama}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{ringkasAnggota(a)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
