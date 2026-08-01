// ============================================================
// CARI LEADS — daftar calon konsumen beserta tautan formnya.
//
// Tiga hal di satu halaman: bagikan tautan form, lihat siapa yang masuk, dan
// tindak lanjuti. Sengaja tidak dipecah menjadi beberapa halaman — pekerjaan
// aslinya memang satu tarikan napas: buka daftar, lihat yang baru, hubungi.
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import {
  Link2, Copy, RefreshCw, Loader2, Search, MessageCircle, Phone, Mail,
  Trash2, ChevronDown, Info, Share2, Save, Users, Check,
} from 'lucide-react'
import KontraktorHeader from '@/components/cost/KontraktorHeader'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/store/authStore'
import { leadsApi } from '@/lib/leadsApi'
import {
  saringLeads, ringkasLeads, ringkasSatu, bacaStatus, tampilHp, rapikanHp,
  pesanBalasLead, URUT_STATUS, LABEL_STATUS, TONE_STATUS,
  type Lead, type StatusLead,
} from '@/lib/leads'
import { waKe } from '@/lib/waLink'
import { tautanPublik } from '@/lib/tautanPendek'
import { waktuLalu } from '@/lib/notifikasi'
import { teamApi, roleSaatIni, type Workspace } from '@/lib/teamApi'
import { can } from '@/lib/teamRoles'

export default function LeadsPage() {
  const { toast } = useToast()
  const { profile } = useAuthStore()

  const [daftar, setDaftar] = useState<Lead[]>([])
  const [token, setToken] = useState('')
  const [waOfficial, setWaOfficial] = useState('')
  const [waDraf, setWaDraf] = useState('')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState<StatusLead | 'semua'>('semua')
  const [buka, setBuka] = useState<string | null>(null)
  const [simpanWa, setSimpanWa] = useState(false)

  async function muat() {
    setMemuat(true)
    try {
      const [leads, tok, wa, ws] = await Promise.all([
        leadsApi().list(),
        leadsApi().tokenSaya().catch(() => ''),
        leadsApi().bacaWaOfficial().catch(() => ''),
        teamApi().myWorkspaces().catch(() => [] as Workspace[]),
      ])
      setDaftar(leads)
      setToken(tok)
      setWaOfficial(wa)
      setWaDraf(wa)
      setWorkspaces(ws)
      setGalat('')
    } catch (e) {
      setGalat(e instanceof Error ? e.message : String(e))
    } finally { setMemuat(false) }
  }
  useEffect(() => { void muat() }, [])

  const role = roleSaatIni(workspaces)
  const bolehUbah = can(role, 'leads', 'tulis')
  const perusahaan = profile?.company || ''

  const tautan = token ? tautanPublik('lead', token, window.location.origin) : ''
  const tersaring = useMemo(() => saringLeads(daftar, { status, cari }), [daftar, status, cari])
  const ringkas = useMemo(() => ringkasLeads(daftar), [daftar])

  async function salin(teks: string, apa: string) {
    try {
      await navigator.clipboard.writeText(teks)
      toast({ title: `${apa} disalin` })
    } catch {
      toast({ title: 'Gagal menyalin', description: teks, variant: 'destructive' })
    }
  }

  async function gantiTautan() {
    if (!window.confirm(
      'Ganti tautan form?\n\nTautan lama akan MATI seketika. Yang sudah tercetak di '
      + 'kartu nama atau bio media sosial harus diperbarui. Lakukan hanya bila tautan '
      + 'lama terlanjur tersebar ke tempat yang salah.')) return
    try {
      setToken(await leadsApi().gantiToken())
      toast({ title: 'Tautan form diganti', description: 'Sebarkan tautan yang baru.' })
    } catch (e) {
      toast({ title: 'Gagal mengganti tautan', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  async function simpanNomorWa() {
    const rapi = rapikanHp(waDraf)
    if (waDraf.trim() && !rapi) {
      toast({ title: 'Nomor belum benar', description: 'Contoh: 0812-3456-7890', variant: 'destructive' })
      return
    }
    setSimpanWa(true)
    try {
      await leadsApi().simpanWaOfficial(rapi ?? '')
      setWaOfficial(rapi ?? '')
      toast({ title: 'Nomor WhatsApp tersimpan' })
    } catch (e) {
      toast({ title: 'Gagal menyimpan', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally { setSimpanWa(false) }
  }

  async function ubahStatus(l: Lead, baru: StatusLead) {
    const asli = daftar
    setDaftar(v => v.map(x => x.id === l.id ? { ...x, status: baru } : x))
    try {
      await leadsApi().ubahStatus(l.id, baru)
    } catch (e) {
      setDaftar(asli)
      toast({ title: 'Gagal memperbarui', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  async function hapus(l: Lead) {
    if (!window.confirm(`Hapus lead ${l.nama || 'ini'}? Tidak bisa dikembalikan.`)) return
    const asli = daftar
    setDaftar(v => v.filter(x => x.id !== l.id))
    try {
      await leadsApi().hapus(l.id)
    } catch (e) {
      setDaftar(asli)
      toast({ title: 'Gagal menghapus', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  return (
    <div className="min-h-screen bg-slate-100/70">
      <KontraktorHeader
        judul="Cari Leads"
        subjudul={memuat
          ? 'Memuat…'
          : `${ringkas.total} calon konsumen · ${ringkas.perluTindakan} perlu ditindaklanjuti`}
        kembaliKe="/kontraktor"
        aksi={
          <button onClick={() => void muat()} aria-label="Muat ulang"
            className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 text-white flex items-center justify-center">
            <RefreshCw className={`w-4 h-4 ${memuat ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      <div className="max-w-3xl mx-auto px-4 -mt-2 pb-10 space-y-4">
        {galat && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-900 leading-relaxed">{galat}</p>
          </div>
        )}

        {/* ── Tautan form ─────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-border p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Share2 className="w-4 h-4 text-navy shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-bold text-navy text-sm">Tautan form konsultasi</h2>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Sebar di bio Instagram, iklan, atau kartu nama. Yang mengisi langsung
                masuk ke daftar di bawah, lalu diantar ke WhatsApp Anda.
              </p>
            </div>
          </div>

          {tautan ? (
            <>
              <div className="flex gap-2">
                <input readOnly value={tautan} aria-label="Tautan form"
                  onFocus={e => e.currentTarget.select()}
                  className="flex-1 min-w-0 h-10 rounded-xl border border-border px-3 text-xs font-mono bg-slate-50" />
                <button onClick={() => void salin(tautan, 'Tautan')}
                  aria-label="Salin tautan"
                  className="h-10 px-3 shrink-0 rounded-xl bg-navy text-white text-xs font-bold flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5" /> Salin
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={tautan} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] font-bold text-navy border border-border rounded-full px-3 py-1.5 hover:border-navy flex items-center gap-1.5">
                  <Link2 className="w-3 h-3" /> Buka form
                </a>
                <a href={waKe('', `Halo, silakan isi form konsultasi renovasi kami di sini:\n${tautan}`)}
                  target="_blank" rel="noopener noreferrer"
                  className="text-[11px] font-bold text-emerald-700 border border-emerald-300 rounded-full px-3 py-1.5 hover:bg-emerald-50 flex items-center gap-1.5">
                  <MessageCircle className="w-3 h-3" /> Bagikan via WA
                </a>
                {bolehUbah && (
                  <button onClick={() => void gantiTautan()}
                    className="text-[11px] font-bold text-muted-foreground border border-border rounded-full px-3 py-1.5 hover:border-rose-400 hover:text-rose-600">
                    Ganti tautan
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {memuat ? 'Menyiapkan tautan…' : 'Tautan belum bisa dibuat — periksa pesan di atas.'}
            </p>
          )}
        </div>

        {/* ── Nomor WhatsApp official ─────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-border p-4 space-y-2">
          <h2 className="font-bold text-navy text-sm">WhatsApp official</h2>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Nomor tujuan calon konsumen setelah mereka mengisi form. Kosong pun tidak
            apa-apa — datanya tetap tersimpan, hanya tidak ada tombol lanjut ke WhatsApp.
          </p>
          <div className="flex gap-2">
            <input value={waDraf} onChange={e => setWaDraf(e.target.value)}
              placeholder="0812-3456-7890" aria-label="Nomor WhatsApp official"
              disabled={!bolehUbah}
              className="flex-1 min-w-0 h-10 rounded-xl border border-border px-3 text-sm disabled:bg-slate-50" />
            {bolehUbah && (
              <button onClick={() => void simpanNomorWa()} disabled={simpanWa || waDraf === waOfficial}
                className="h-10 px-4 shrink-0 rounded-xl bg-navy text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-40">
                {simpanWa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Simpan
              </button>
            )}
          </div>
        </div>

        {/* ── Ringkasan pipeline ──────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Masuk 7 hari', String(ringkas.mingguIni)],
            ['Perlu tindakan', String(ringkas.perluTindakan)],
            // Persen dihitung terhadap yang SUDAH ditutup, bukan seluruh lead —
            // kalau tidak, angkanya jatuh setiap ada lead baru masuk.
            ['Jadi deal', ringkas.persenDeal === null ? '–' : `${ringkas.persenDeal.toFixed(0)}%`],
          ].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-white border border-border p-3 text-center">
              <p className="text-xl font-bold text-navy tabular-nums">{v}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{l}</p>
            </div>
          ))}
        </div>

        {/* ── Pencarian & saringan ────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={cari} onChange={e => setCari(e.target.value)}
              placeholder="Cari nama, nomor, lokasi…" aria-label="Cari lead"
              className="w-full h-10 pl-10 pr-3 rounded-xl border border-border text-sm bg-white" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
            {(['semua', ...URUT_STATUS] as const).map(s => (
              <button key={s} onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${
                  status === s ? 'bg-navy text-white' : 'bg-white text-muted-foreground border border-border hover:border-navy'}`}>
                {s === 'semua' ? 'Semua' : LABEL_STATUS[s]}
                {s !== 'semua' && ringkas.perStatus[s] > 0 && ` (${ringkas.perStatus[s]})`}
              </button>
            ))}
          </div>
        </div>

        {/* ── Daftar lead ─────────────────────────────────────────────── */}
        <div className="space-y-2">
          {memuat && daftar.length === 0 && (
            <div className="py-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat…
            </div>
          )}
          {!memuat && tersaring.length === 0 && (
            <div className="rounded-2xl bg-white border border-border p-8 text-center space-y-2">
              <Users className="w-9 h-9 mx-auto opacity-25" />
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                {daftar.length === 0
                  ? 'Belum ada yang mengisi form. Sebarkan tautannya, lalu yang masuk akan muncul di sini.'
                  : 'Tidak ada yang cocok dengan pencarian atau saringan ini.'}
              </p>
            </div>
          )}

          {tersaring.map(l => {
            const st = bacaStatus(l.status)
            const terbuka = buka === l.id
            const hp = rapikanHp(l.no_hp)
            return (
              <div key={l.id} className="rounded-2xl bg-white border border-border overflow-hidden">
                <button onClick={() => setBuka(terbuka ? null : l.id)}
                  className="w-full text-left p-3.5 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-navy text-sm truncate min-w-0">{l.nama || 'Tanpa nama'}</p>
                      <span className={`text-[9px] font-black uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ${TONE_STATUS[st]}`}>
                        {LABEL_STATUS[st]}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{ringkasSatu(l)}</p>
                    <p className="text-[10px] text-muted-foreground/80 truncate">
                      {tampilHp(l.no_hp)}
                      {l.created_at ? ` · ${waktuLalu(l.created_at)}` : ''}
                      {l.sumber ? ` · dari ${l.sumber}` : ''}
                    </p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${terbuka ? 'rotate-180' : ''}`} />
                </button>

                {terbuka && (
                  <div className="border-t border-border p-3.5 space-y-3 bg-slate-50/60">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                      {([
                        ['Kebutuhan', l.jenis], ['Lokasi', l.lokasi], ['Luas', l.luas],
                        ['Anggaran', l.anggaran], ['Rencana mulai', l.target_mulai], ['Email', l.email],
                      ] as Array<[string, string | undefined]>)
                        .filter(([, v]) => (v ?? '').trim())
                        .map(([k, v]) => (
                          <div key={k} className="min-w-0">
                            <p className="text-muted-foreground">{k}</p>
                            <p className="font-semibold text-navy break-words">{v}</p>
                          </div>
                        ))}
                    </div>
                    {(l.kondisi ?? '').trim() && (
                      <div className="text-[11px]">
                        <p className="text-muted-foreground">Kondisi saat ini</p>
                        <p className="text-navy whitespace-pre-wrap break-words">{l.kondisi}</p>
                      </div>
                    )}
                    {(l.catatan ?? '').trim() && (
                      <div className="text-[11px]">
                        <p className="text-muted-foreground">Catatan</p>
                        <p className="text-navy whitespace-pre-wrap break-words">{l.catatan}</p>
                      </div>
                    )}
                    {(l.foto?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {l.foto!.map((f, i) => (
                          <a key={i} href={f} target="_blank" rel="noopener noreferrer">
                            <img src={f} alt={`Foto ${i + 1}`}
                              className="w-20 h-20 object-cover rounded-xl border border-border" />
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {hp && (
                        <>
                          <a href={waKe(hp, pesanBalasLead(l, perusahaan))}
                            target="_blank" rel="noopener noreferrer"
                            className="text-[11px] font-bold text-emerald-700 border border-emerald-300 rounded-full px-3 py-1.5 hover:bg-emerald-50 flex items-center gap-1.5">
                            <MessageCircle className="w-3 h-3" /> WhatsApp
                          </a>
                          <a href={`tel:+${hp}`}
                            className="text-[11px] font-bold text-navy border border-border rounded-full px-3 py-1.5 hover:border-navy flex items-center gap-1.5">
                            <Phone className="w-3 h-3" /> Telepon
                          </a>
                        </>
                      )}
                      {(l.email ?? '').trim() && (
                        <a href={`mailto:${l.email}`}
                          className="text-[11px] font-bold text-navy border border-border rounded-full px-3 py-1.5 hover:border-navy flex items-center gap-1.5">
                          <Mail className="w-3 h-3" /> Email
                        </a>
                      )}
                      {bolehUbah && (
                        <button onClick={() => void hapus(l)}
                          className="text-[11px] font-bold text-muted-foreground border border-border rounded-full px-3 py-1.5 hover:border-rose-400 hover:text-rose-600 flex items-center gap-1.5">
                          <Trash2 className="w-3 h-3" /> Hapus
                        </button>
                      )}
                    </div>

                    {bolehUbah && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-bold text-navy">Tahapan</p>
                        <div className="flex flex-wrap gap-1.5">
                          {URUT_STATUS.map(s => (
                            <button key={s} onClick={() => void ubahStatus(l, s)}
                              className={`text-[11px] font-bold rounded-full px-2.5 py-1 border transition-colors flex items-center gap-1 ${
                                st === s ? 'bg-navy text-white border-navy' : 'bg-white text-muted-foreground border-border hover:border-navy'}`}>
                              {st === s && <Check className="w-3 h-3" />}
                              {LABEL_STATUS[s]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
