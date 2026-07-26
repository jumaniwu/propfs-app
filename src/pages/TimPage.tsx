// ============================================================
// TIM & PENGGUNA — super admin perusahaan membuat User ID + password
// untuk karyawannya (nama, jabatan, nomor WA, email), lalu mengatur role.
// Tab kedua menampilkan matriks Role & Hak Akses.
// ============================================================
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Users, UserPlus, ShieldCheck, Loader2, RefreshCw, Trash2, Building2,
  Copy, Send, Eye, EyeOff, Shuffle, Check, X, KeyRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import KontraktorHeader from '@/components/cost/KontraktorHeader'
import { useToast } from '@/hooks/use-toast'
import { teamApi, passwordAcak, type TeamMember, type BuatPenggunaInput } from '@/lib/teamApi'
import { normalUsername, usernameValid } from '@/lib/teamLogin'
import { ROLES, ringkasIzin, IZIN_LABEL, MODUL_LABEL, type TeamRole, type Modul } from '@/lib/teamRoles'
import {
  waKe, pesanAkunBaru, pesanIngatkanAkun, pesanPasswordBaru, JALUR_LOGIN_TIM,
} from '@/lib/waLink'
import { getBrandingCache } from '@/lib/branding'

type Tab = 'anggota' | 'role'

const kosong: BuatPenggunaInput = {
  username: '', email: '', password: '', nama: '', jabatan: '', no_wa: '', role: 'pengawas',
}

export default function TimPage() {
  const { toast } = useToast()
  const [params] = useSearchParams()

  const [tab, setTab] = useState<Tab>(() => (params.get('tab') === 'role' ? 'role' : 'anggota'))
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(() => params.get('aksi') === 'undang')
  /** Kredensial pengguna yang baru dibuat — password hanya ada di memori ini. */
  const [akunBaru, setAkunBaru] = useState<(BuatPenggunaInput & { kode: string }) | null>(null)
  const [kode, setKode] = useState('')
  const perusahaan = getBrandingCache().nama

  function muat() {
    setLoading(true); setError('')
    teamApi().listMembers()
      .then(setMembers)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    muat()
    // Kode Perusahaan dibuatkan otomatis pada panggilan pertama.
    teamApi().kodePerusahaan().then(setKode).catch(() => setKode(''))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Buat password baru untuk anggota yang lupa password, lalu kirim via WA. */
  async function resetPassword(m: TeamMember) {
    const pw = passwordAcak()
    if (!window.confirm(`Atur ulang password ${m.nama}?\n\nPassword baru: ${pw}\n\nPassword lama langsung tidak berlaku.`)) return
    try {
      await teamApi().resetPassword(m.id, pw)
      const pesan = pesanPasswordBaru({
        nama: m.nama, username: m.username ?? '', kode,
        password: pw, origin: window.location.origin,
      })
      window.open(waKe(m.no_wa, pesan), '_blank')
      toast({ title: 'Password diatur ulang', description: `Kirim password baru ke ${m.nama} sekarang.` })
    } catch (e) {
      toast({ title: 'Gagal mengatur password', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  async function ubahRole(m: TeamMember, role: TeamRole) {
    try {
      await teamApi().updateMember(m.id, { role })
      setMembers(prev => prev.map(x => x.id === m.id ? { ...x, role } : x))
      toast({ title: `Role ${m.nama} diubah menjadi ${ROLES.find(r => r.key === role)?.label}` })
    } catch (e) {
      toast({ title: 'Gagal mengubah role', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  async function ubahStatus(m: TeamMember) {
    const status = m.status === 'aktif' ? 'nonaktif' : 'aktif'
    try {
      await teamApi().updateMember(m.id, { status })
      setMembers(prev => prev.map(x => x.id === m.id ? { ...x, status } : x))
      toast({ title: status === 'aktif' ? 'Pengguna diaktifkan' : 'Pengguna dinonaktifkan' })
    } catch (e) {
      toast({ title: 'Gagal', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  async function hapus(m: TeamMember) {
    if (!window.confirm(`Keluarkan ${m.nama} dari tim? Akun login-nya tidak dihapus.`)) return
    try {
      await teamApi().deleteMember(m.id)
      setMembers(prev => prev.filter(x => x.id !== m.id))
      toast({ title: 'Pengguna dikeluarkan dari tim' })
    } catch (e) {
      toast({ title: 'Gagal menghapus', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  return (
    <div className="min-h-screen bg-slate-100/70 pb-10">
      <KontraktorHeader
        judul="Tim & Pengguna"
        subjudul={`${members.length} pengguna terdaftar`}
        kembaliKe="/kontraktor"
        aksi={
          <div className="flex gap-2">
            <Button onClick={muat} variant="outline" size="sm"
              className="gap-1.5 bg-white/10 text-white border-white/20 hover:bg-white/20">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat Ulang
            </Button>
            <Button onClick={() => { setTab('anggota'); setFormOpen(true) }} size="sm"
              className="gap-1.5 font-bold bg-gold text-navy hover:bg-gold/90">
              <UserPlus className="w-3.5 h-3.5" /> Buat Pengguna
            </Button>
          </div>
        }
      />

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        <div className="flex gap-1.5">
          {([['anggota', 'Daftar Pengguna', <Users key="i" className="w-3.5 h-3.5" />],
            ['role', 'Role & Hak Akses', <ShieldCheck key="i" className="w-3.5 h-3.5" />]] as Array<[Tab, string, JSX.Element]>)
            .map(([key, label, icon]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all ${
                  tab === key ? 'bg-navy text-white shadow' : 'bg-white text-muted-foreground border border-border hover:bg-slate-50'}`}>
                {icon} {label}
              </button>
            ))}
        </div>

        {tab === 'anggota' && (
          <>
            <KartuKodePerusahaan kode={kode} perusahaan={perusahaan} />

            {/* Kartu kredensial setelah pengguna dibuat — password hanya ada di
                sini, sistem tidak menyimpannya, jadi jangan ditutup otomatis. */}
            {akunBaru && (
              <KartuAkunBaru akun={akunBaru} perusahaan={perusahaan} onTutup={() => setAkunBaru(null)} />
            )}

            {formOpen && (
              <FormBuatPengguna
                kode={kode}
                onBatal={() => setFormOpen(false)}
                onSukses={(m, input, kodePakai) => {
                  setMembers(prev => [m, ...prev])
                  setFormOpen(false)
                  setKode(kodePakai)
                  setAkunBaru({ ...input, kode: kodePakai })
                  toast({
                    title: '✅ Pengguna dibuat!',
                    description: 'Kirim Kode Perusahaan, User ID, dan password ke karyawan Anda sekarang.',
                  })
                }}
              />
            )}

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
                {error} — pastikan migrasi <code>migration_team.sql</code> sudah dijalankan di Supabase.
              </p>
            )}

            {loading ? (
              <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : members.length === 0 ? (
              <div className="bg-white rounded-2xl border border-border p-12 text-center">
                <Users className="w-10 h-10 mx-auto opacity-30 mb-3" />
                <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                  Belum ada pengguna. Buat User ID &amp; password untuk karyawan Anda, lalu tentukan jabatan
                  dan role aksesnya.
                </p>
                <Button onClick={() => setFormOpen(true)} className="gap-2 bg-navy hover:bg-navy/90 font-bold">
                  <UserPlus className="w-4 h-4" /> Buat Pengguna Pertama
                </Button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                {members.map(m => (
                  <div key={m.id} className="bg-white rounded-2xl border border-border p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-10 h-10 rounded-full bg-navy text-white font-black flex items-center justify-center shrink-0">
                          {(m.nama || m.member_email).charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-navy text-sm truncate">{m.nama || '(tanpa nama)'}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{m.jabatan || 'Jabatan belum diisi'}</p>
                        </div>
                      </div>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${
                        m.status === 'aktif' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                        {m.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                      <p className="flex items-center gap-1 truncate">
                        <KeyRound className="w-3 h-3 shrink-0" />
                        User ID: <b className="text-navy font-mono">{m.username || '—'}</b>
                      </p>
                      <p className="truncate">✉️ {m.member_email}</p>
                      {m.no_wa && (
                        <p className="flex items-center gap-1">
                          📱 {m.no_wa}
                          <button
                            title="Kirim pengingat Kode Perusahaan & User ID (password tidak disimpan sistem)"
                            onClick={() => window.open(waKe(m.no_wa, pesanIngatkanAkun({
                              nama: m.nama, jabatan: m.jabatan, username: m.username ?? '',
                              kode, origin: window.location.origin, perusahaan,
                            })), '_blank')}
                            className="text-navy hover:underline font-semibold">kirim data akun</button>
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Role Akses</label>
                      <select value={m.role} onChange={e => ubahRole(m, e.target.value as TeamRole)}
                        className="w-full h-9 rounded-lg border border-input bg-white px-2 text-xs font-semibold text-navy">
                        {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                      <p className="text-[10px] text-muted-foreground">
                        {ROLES.find(r => r.key === m.role)?.deskripsi}
                      </p>
                    </div>

                    <div className="flex gap-1.5 pt-1 border-t border-border flex-wrap">
                      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                        onClick={() => ubahStatus(m)}>
                        {m.status === 'aktif' ? <><X className="w-3 h-3" /> Nonaktifkan</> : <><Check className="w-3 h-3" /> Aktifkan</>}
                      </Button>
                      {/* Akun tim dikelola perusahaan — tidak ada "Lupa Password"
                          lewat email, jadi admin yang mengatur ulang. */}
                      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                        onClick={() => resetPassword(m)}>
                        <KeyRound className="w-3 h-3" /> Reset Password
                      </Button>
                      <button onClick={() => hapus(m)}
                        className="ml-auto text-muted-foreground hover:text-red-600 self-center">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'role' && <TabelRole />}
      </div>
    </div>
  )
}

// ── Kartu Kode Perusahaan ───────────────────────────────────────────────────
// Kode ini yang membedakan login karyawan dari login akun PropFS pribadi.
// Tanpa kode, karyawan tidak bisa masuk — jadi ditampilkan besar dan mudah
// disalin, bukan disembunyikan di halaman pengaturan.
function KartuKodePerusahaan({ kode, perusahaan }: { kode: string; perusahaan: string }) {
  const { toast } = useToast()
  const tautan = `${window.location.origin}${JALUR_LOGIN_TIM}`

  return (
    <div className="bg-navy rounded-2xl p-5 text-white">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-gold" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-white/60 font-bold">Kode Perusahaan</p>
          <p className="font-mono font-black text-2xl tracking-[0.2em] text-gold mt-0.5">
            {kode || '••••••••'}
          </p>
          <p className="text-[11px] text-white/70 mt-1.5 leading-relaxed">
            Karyawan {perusahaan || 'perusahaan Anda'} masuk lewat <b className="text-white">{tautan}</b> memakai
            kode ini + User ID masing-masing. Akun tim terpisah dari akun PropFS pribadi mereka.
          </p>
        </div>
      </div>
      {kode && (
        <div className="flex gap-2 mt-3 flex-wrap">
          <button
            onClick={() => { navigator.clipboard?.writeText(kode); toast({ title: 'Kode Perusahaan disalin' }) }}
            className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5">
            <Copy className="w-3.5 h-3.5" /> Salin Kode
          </button>
          <button
            onClick={() => { navigator.clipboard?.writeText(tautan); toast({ title: 'Tautan login tim disalin' }) }}
            className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5">
            <Copy className="w-3.5 h-3.5" /> Salin Tautan Login
          </button>
        </div>
      )}
    </div>
  )
}

// ── Kartu kredensial pengguna baru ──────────────────────────────────────────
// Password TIDAK disimpan di database. Kartu ini satu-satunya kesempatan
// mengirimkannya, jadi hanya hilang bila ditutup sendiri oleh admin.
function KartuAkunBaru({ akun, perusahaan, onTutup }: {
  akun: BuatPenggunaInput & { kode: string }
  perusahaan: string
  onTutup: () => void
}) {
  const { toast } = useToast()
  const origin = window.location.origin
  const pesan = pesanAkunBaru({
    nama: akun.nama, jabatan: akun.jabatan, username: akun.username,
    kode: akun.kode, password: akun.password, origin, perusahaan,
  })

  return (
    <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-bold text-emerald-900 text-sm flex items-center gap-2">
            <Check className="w-4 h-4" /> Akun {akun.nama} siap dikirim
          </h2>
          <p className="text-[11px] text-emerald-800/80 mt-1">
            Password hanya tampil sekali di sini — sistem tidak menyimpannya. Kirim sekarang
            sebelum menutup kartu ini.
          </p>
        </div>
        <button onClick={onTutup} className="text-emerald-700/60 hover:text-emerald-900 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-emerald-200 p-3 text-xs space-y-1.5">
        {[
          ['Nama', akun.nama],
          ['Jabatan', akun.jabatan],
          ['Nomor WA', akun.no_wa],
          ['Kode Perusahaan', akun.kode],
          ['User ID', akun.username],
          ['Password', akun.password],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-muted-foreground w-32 shrink-0">{k}</span>
            <span className={`font-bold text-navy break-all ${
              k === 'Password' || k === 'Kode Perusahaan' || k === 'User ID' ? 'font-mono' : ''}`}>{v}</span>
          </div>
        ))}
        <div className="flex gap-2 pt-1 border-t border-emerald-100 mt-1">
          <span className="text-muted-foreground w-32 shrink-0">Login di</span>
          <span className="font-bold text-navy break-all">{origin}{JALUR_LOGIN_TIM}</span>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button className="font-bold bg-emerald-600 hover:bg-emerald-700 gap-2"
          onClick={() => window.open(waKe(akun.no_wa, pesan), '_blank')}>
          <Send className="w-4 h-4" /> Kirim ke WhatsApp {akun.no_wa}
        </Button>
        <Button variant="outline" className="gap-2"
          onClick={() => { navigator.clipboard?.writeText(pesan); toast({ title: 'Data akun disalin' }) }}>
          <Copy className="w-4 h-4" /> Salin Data Akun
        </Button>
        <Button variant="ghost" onClick={onTutup}>Sudah dikirim</Button>
      </div>
    </div>
  )
}

// ── Form buat pengguna baru ─────────────────────────────────────────────────
function FormBuatPengguna({ kode, onBatal, onSukses }: {
  kode: string
  onBatal: () => void
  onSukses: (m: TeamMember, input: BuatPenggunaInput, kode: string) => void
}) {
  const { toast } = useToast()
  const [f, setF] = useState<BuatPenggunaInput>({ ...kosong, password: passwordAcak() })
  const [lihatPw, setLihatPw] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = <K extends keyof BuatPenggunaInput>(k: K, v: BuatPenggunaInput[K]) =>
    setF(prev => ({ ...prev, [k]: v }))

  const pesanAkun = () => pesanAkunBaru({
    nama: f.nama, jabatan: f.jabatan, username: normalUsername(f.username),
    kode, password: f.password, origin: window.location.origin,
  })
  const salinAkun = () => {
    navigator.clipboard?.writeText(pesanAkun())
    toast({ title: 'Data akun disalin' })
  }

  async function submit() {
    setError('')
    if (f.nama.trim().length < 2) return setError('Nama wajib diisi.')
    if (f.jabatan.trim().length < 2) return setError('Jabatan wajib diisi.')
    if (f.no_wa.trim().length < 8) return setError('Nomor WhatsApp wajib diisi.')
    if (!usernameValid(f.username)) return setError('User ID minimal 3 karakter (huruf, angka, titik, strip).')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return setError('Email tidak valid.')
    if (f.password.length < 8) return setError('Password minimal 8 karakter.')

    setSubmitting(true)
    try {
      const bersih = {
        ...f, username: normalUsername(f.username),
        email: f.email.trim().toLowerCase(), nama: f.nama.trim(),
        jabatan: f.jabatan.trim(), no_wa: f.no_wa.trim(),
      }
      const { member, kode: kodePakai } = await teamApi().createUser(bersih)
      onSukses(member, bersih, kodePakai || kode)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSubmitting(false) }
  }

  const inputCls = 'w-full h-10 rounded-lg border border-input bg-background px-3 text-sm'

  return (
    <div className="bg-white rounded-2xl border-2 border-gold/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-navy text-sm flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Buat Pengguna Baru
        </h2>
        <button onClick={onBatal} className="text-muted-foreground hover:text-navy"><X className="w-4 h-4" /></button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Anda membuatkan akun kerja untuk karyawan. Mereka masuk lewat <b>halaman login tim</b> memakai
        <b> Kode Perusahaan {kode || '(dibuat otomatis)'}</b> + <b>User ID</b> + password — bukan email
        pribadi, jadi akun kerja ini tidak bercampur dengan akun PropFS pribadi mereka.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nama Lengkap *</label>
          <input value={f.nama} onChange={e => set('nama', e.target.value)}
            placeholder="mis. Suhanto Wijaya" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Jabatan *</label>
          <input value={f.jabatan} onChange={e => set('jabatan', e.target.value)}
            placeholder="mis. Site Manager" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nomor WhatsApp *</label>
          <input value={f.no_wa} onChange={e => set('no_wa', e.target.value)}
            placeholder="mis. 081234567890" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">User ID untuk login *</label>
          <input value={f.username}
            onChange={e => set('username', e.target.value)}
            onBlur={() => set('username', normalUsername(f.username))}
            placeholder="mis. suhanto" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            className={`${inputCls} font-mono`} />
          <p className="text-[10px] text-muted-foreground">
            Cukup unik di perusahaan Anda. Karyawan mengetik ini bersama Kode Perusahaan.
          </p>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Email karyawan (data kontak) *</label>
          <input type="email" value={f.email} onChange={e => set('email', e.target.value)}
            placeholder="mis. suhanto@perusahaan.com" className={inputCls} />
          <p className="text-[10px] text-muted-foreground">
            Disimpan sebagai data kontak saja — tidak dipakai untuk login.
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Password *</label>
        <div className="flex gap-2">
          <input type={lihatPw ? 'text' : 'password'} value={f.password}
            onChange={e => set('password', e.target.value)} className={`flex-1 ${inputCls} font-mono`} />
          <Button variant="outline" size="icon" className="h-10 w-10 shrink-0"
            title={lihatPw ? 'Sembunyikan' : 'Tampilkan'} onClick={() => setLihatPw(v => !v)}>
            {lihatPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
          <Button variant="outline" size="icon" className="h-10 w-10 shrink-0"
            title="Acak ulang password" onClick={() => set('password', passwordAcak())}>
            <Shuffle className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">Minimal 8 karakter. Karyawan dapat menggantinya sendiri setelah login.</p>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Role Akses *</label>
        <select value={f.role} onChange={e => set('role', e.target.value as TeamRole)}
          className="w-full h-10 rounded-lg border border-input bg-white px-3 text-sm font-semibold text-navy">
          {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <p className="text-[10px] text-muted-foreground">{ROLES.find(r => r.key === f.role)?.deskripsi}</p>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{error}</p>}

      <div className="flex gap-2 flex-wrap">
        <Button className="font-bold bg-navy hover:bg-navy/90 gap-2" disabled={submitting} onClick={submit}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Buat Pengguna
        </Button>
        <Button variant="outline" className="gap-2" onClick={salinAkun}>
          <Copy className="w-4 h-4" /> Salin Data Akun
        </Button>
        <Button variant="outline" className="gap-2"
          onClick={() => window.open(waKe(f.no_wa, pesanAkun()), '_blank')}>
          <Send className="w-4 h-4" /> Kirim via WhatsApp
        </Button>
        <Button variant="ghost" onClick={onBatal}>Batal</Button>
      </div>
    </div>
  )
}

// ── Tabel matriks role ──────────────────────────────────────────────────────
function TabelRole() {
  const moduls = Object.keys(MODUL_LABEL) as Modul[]
  const warna: Record<string, string> = {
    '-': 'bg-slate-100 text-slate-400',
    r: 'bg-blue-50 text-blue-700',
    rw: 'bg-emerald-50 text-emerald-700',
    rwa: 'bg-gold-lt text-[#8A6D1F]',
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="p-4 pb-3">
          <h2 className="font-bold text-navy text-sm">Matriks Hak Akses per Jabatan</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Menu di halaman Home dan sidebar otomatis menyesuaikan role tiap pengguna.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[820px]">
            <thead className="bg-slate-50 text-muted-foreground">
              <tr>
                <th className="text-left font-bold px-4 py-2.5">Modul</th>
                {ROLES.map(r => (
                  <th key={r.key} className="font-bold px-2 py-2.5 text-center whitespace-nowrap">
                    {r.label.split(' / ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {moduls.map(m => (
                <tr key={m} className="border-t border-border">
                  <td className="px-4 py-2 font-semibold text-navy whitespace-nowrap">{MODUL_LABEL[m]}</td>
                  {ROLES.map(r => {
                    const izin = ringkasIzin(r.key).find(x => x.modul === m)!.izin
                    return (
                      <td key={r.key} className="px-2 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full font-bold ${warna[izin]}`}>
                          {izin === '-' ? '—' : izin === 'r' ? 'Lihat' : izin === 'rw' ? 'Ubah' : 'Setujui'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-3 flex-wrap px-4 py-3 border-t border-border text-[10px] text-muted-foreground">
          {(['-', 'r', 'rw', 'rwa'] as const).map(k => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-full ${warna[k]}`} /> {IZIN_LABEL[k]}
            </span>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ROLES.map(r => (
          <div key={r.key} className="bg-white rounded-2xl border border-border p-4">
            <p className="font-bold text-navy text-sm">{r.label}</p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{r.deskripsi}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
