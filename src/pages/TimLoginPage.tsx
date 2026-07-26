// ============================================================
// LOGIN TIM — pintu masuk terpisah untuk karyawan perusahaan.
// Kode Perusahaan + User ID + password. Tidak memakai email pribadi, jadi
// akun kerja tidak bercampur dengan akun PropFS pribadi karyawan.
// Setelah masuk, sesi dikunci ke perusahaan itu dan langsung ke /kontraktor.
// ============================================================
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, KeyRound, Loader2, User, Eye, EyeOff, ArrowRight, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  normalKode, kodeValid, normalUsername, usernameValid, emailInternal,
} from '@/lib/teamLogin'
import { perusahaanByKode, teamApi, setWorkspaceOwner, setSesiTim } from '@/lib/teamApi'

const KODE_TERAKHIR = 'propfs-kode-perusahaan-terakhir'

export default function TimLoginPage() {
  const navigate = useNavigate()
  const [kode, setKode] = useState(() => {
    try { return localStorage.getItem(KODE_TERAKHIR) ?? '' } catch { return '' }
  })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [lihatPw, setLihatPw] = useState(false)
  const [perusahaan, setPerusahaan] = useState('')
  const [cekKode, setCekKode] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Cari nama perusahaan begitu kodenya lengkap — konfirmasi visual bahwa
  // karyawan mengetik kode yang benar sebelum repot mengisi password.
  useEffect(() => {
    if (!kodeValid(kode)) { setPerusahaan(''); return }
    let batal = false
    setCekKode(true)
    perusahaanByKode(normalKode(kode))
      .then(n => { if (!batal) setPerusahaan(n) })
      .finally(() => { if (!batal) setCekKode(false) })
    return () => { batal = true }
  }, [kode])

  async function masuk() {
    setError('')
    if (!kodeValid(kode)) return setError('Kode Perusahaan tidak lengkap. Contoh: PFS-4K7M.')
    if (!usernameValid(username)) return setError('User ID minimal 3 karakter.')
    if (!password) return setError('Password wajib diisi.')

    const email = emailInternal(username, kode)
    if (!email) return setError('Kode Perusahaan atau User ID tidak sah.')

    setSubmitting(true)
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      if (authErr) {
        // Supabase sengaja tidak membedakan "user tidak ada" dan "password
        // salah". Kita terjemahkan ke bahasa yang berguna bagi karyawan.
        throw new Error(
          /invalid login/i.test(authErr.message)
            ? 'Kode Perusahaan, User ID, atau password salah. Periksa kembali pesan dari admin Anda.'
            : authErr.message,
        )
      }

      // Kunci sesi ini ke perusahaan pemilik kodenya.
      const ws = await teamApi().myWorkspaces().catch(() => [])
      const cocok = ws.find(w => (w.kode ?? '').toUpperCase() === normalKode(kode)) ?? ws[0]
      if (!cocok) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
        throw new Error('Akun ini belum terdaftar sebagai anggota tim aktif. Hubungi admin perusahaan Anda.')
      }
      setWorkspaceOwner(cocok.owner_id)
      setSesiTim(true)
      try { localStorage.setItem(KODE_TERAKHIR, normalKode(kode)) } catch { /* ignore */ }

      // Muat ulang penuh agar seluruh store menarik data workspace perusahaan.
      window.location.replace('/kontraktor')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full h-12 rounded-xl border border-input bg-white pl-11 pr-3 text-sm text-navy placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold'

  return (
    <div className="min-h-screen bg-navy flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <p className="font-serif text-2xl font-bold text-white">PropFS</p>
            <p className="text-gold text-xs font-black uppercase tracking-[0.2em] mt-1">Kontraktor AI</p>
          </div>

          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
            <div>
              <h1 className="font-serif text-2xl font-bold text-navy">Login Tim</h1>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Masuk memakai <b>Kode Perusahaan</b> dan <b>User ID</b> dari admin perusahaan Anda —
                bukan email pribadi.
              </p>
            </div>

            {/* Kode Perusahaan */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Kode Perusahaan
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={kode}
                  onChange={e => setKode(e.target.value.toUpperCase())}
                  onBlur={() => setKode(k => normalKode(k) || k)}
                  placeholder="PFS-4K7M" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                  className={`${inputCls} font-mono tracking-widest uppercase`}
                />
              </div>
              {cekKode ? (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Memeriksa kode…
                </p>
              ) : perusahaan ? (
                <p className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {perusahaan}
                </p>
              ) : kodeValid(kode) ? (
                <p className="text-[11px] text-rose-600">Kode ini tidak terdaftar.</p>
              ) : null}
            </div>

            {/* User ID */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                User ID
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onBlur={() => setUsername(u => normalUsername(u) || u)}
                  placeholder="mis. budi" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={lihatPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') masuk() }}
                  placeholder="••••••••"
                  className={`${inputCls} pr-12`}
                />
                <button type="button" onClick={() => setLihatPw(v => !v)}
                  aria-label={lihatPw ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-navy">
                  {lihatPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 leading-relaxed">
                {error}
              </p>
            )}

            <button onClick={masuk} disabled={submitting}
              className="w-full h-12 rounded-xl bg-gold text-navy font-black text-sm flex items-center justify-center gap-2 hover:bg-gold/90 disabled:opacity-60 transition-colors">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              MASUK
            </button>

            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              Lupa password? Akun tim dikelola perusahaan — minta admin Anda mengatur ulang
              password dari menu <b>Tim &amp; Pengguna</b>.
            </p>
          </div>

          <p className="text-center text-[11px] text-white/60 mt-5">
            Punya akun PropFS pribadi?{' '}
            <Link to="/auth" className="text-gold font-bold hover:underline">Login di sini</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
