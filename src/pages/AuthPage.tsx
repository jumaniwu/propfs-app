// ============================================================
// PropFS — Auth Page (Login, Register & OTP)
// ============================================================

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Mail, Lock, User, Briefcase, EyeOff, Eye, ArrowRight, AlertCircle, Phone, Smartphone, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Tab = 'login' | 'register' | 'forgot' | 'otp'

export default function AuthPage() {
  const navigate = useNavigate()
  const { signIn, signUp, resetPassword, authError, clearError, isLoading } = useAuthStore()

  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('tab')
    return (t === 'register' || t === 'forgot' || t === 'otp') ? t : 'login'
  })
  const [regStep, setRegStep]       = useState<1 | 2>(1)
  const [showPass, setShowPass]     = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  // Login form
  const [loginEmail, setLoginEmail]   = useState('')
  const [loginPass, setLoginPass]     = useState('')

  // Register form
  const [regName, setRegName]         = useState('')
  const [regCompany, setRegCompany]   = useState('')
  const [regPhone, setRegPhone]       = useState('')
  const [regEmail, setRegEmail]       = useState('')
  const [regPass, setRegPass]         = useState('')
  const [regPass2, setRegPass2]       = useState('')
  const [regError, setRegError]       = useState('')

  // OTP State
  const [otpMode, setOtpMode] = useState<'register' | 'login'>('register')
  const [otpValue, setOtpValue] = useState(['', '', '', '', '', ''])
  const otpInputs = useRef<(HTMLInputElement | null)[]>([])

  // Forgot password
  const [forgotEmail, setForgotEmail] = useState('')

  function switchTab(t: Tab) {
    setTab(t)
    clearError()
    setRegError('')
    setForgotSent(false)
    if (t === 'register') setRegStep(1)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    try {
      await signIn(loginEmail, loginPass)
      const urlParams = new URLSearchParams(window.location.search)
      const planParam = urlParams.get('plan')
      if (planParam && planParam !== 'free') {
        navigate(`/home?create_invoice=${planParam}`)
      } else {
        navigate('/home')
      }
    } catch { /* error shown from store */ }
  }

  // Lanjut Step 1 ke Step 2 Registrasi
  function nextRegStep(e: React.FormEvent) {
    e.preventDefault()
    setRegError('')
    if (!regName || !regEmail || !regPhone || !regCompany) {
      setRegError('Mohon isi semua data perusahaan yang diwajibkan.')
      return
    }
    setRegStep(2)
  }

  // Handle final Submit Registrasi -> go to OTP
  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    setRegError('')
    if (regPass !== regPass2) {
      setRegError('Password tidak cocok')
      return
    }
    if (regPass.length < 8) {
      setRegError('Password minimal 8 karakter')
      return
    }
    
    // Simulate sending OTP before actually creating the DB account
    setOtpMode('register')
    setTab('otp')
    console.log(`[DEV ONLY] OTP dikirim ke ${regPhone} / ${regEmail}: 123456`)
  }

  // Verify OTP
  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    const code = otpValue.join('')
    if (code.length < 6) return
    
    // Simulasi pengecekan OTP (Bisa integrasi Firebase/Supabase Phone OTP di masa mendatang)
    if (code !== '123456' && code !== '000000') {
      useAuthStore.setState({ authError: 'Kode OTP tidak valid. Gunakan 123456 untuk simulasi dev.' })
      return
    }

    try {
      if (otpMode === 'register') {
        // Eksekusi signup sesungguhnya
        await signUp(regEmail, regPass, regName, regCompany, regPhone)
        useAuthStore.setState({ authError: null })
        alert("Pendaftaran berhasil! Silakan masuk.")
        
        const urlParams = new URLSearchParams(window.location.search)
        const planParam = urlParams.get('plan')
        if (planParam && planParam !== 'free') {
          navigate(`/home?create_invoice=${planParam}`)
        } else {
          setTab('login')
        }
      }
    } catch (err) {
      // jika gagal, error muncul dari state
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    if (!/^[0-9]*$/.test(value)) return
    const newOtp = [...otpValue]
    newOtp[index] = value
    setOtpValue(newOtp)
    
    if (value && index < 5) {
      otpInputs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpValue[index] && index > 0) {
      otpInputs.current[index - 1]?.focus()
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    try {
      await resetPassword(forgotEmail)
      setForgotSent(true)
    } catch { /* error shown from store */ }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Left panel: branding ── */}
      <div className="hidden lg:flex lg:w-[45%] bg-navy flex-col justify-between p-12 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gold/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3" />
        
        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gold rounded-xl flex items-center justify-center shadow-lg shadow-gold/20">
              <Building2 className="h-5 w-5 text-navy" />
            </div>
            <span className="font-serif text-xl font-bold text-white">PropFS</span>
          </div>
        </div>

        {/* Hero text */}
        <div className="space-y-6 relative z-10">
          <div>
            <div className="w-16 h-1 bg-gold rounded mb-6" />
            <h1 className="font-serif text-4xl font-bold text-white leading-tight">
              Sistem Terpadu<br />
              <span className="text-gold italic pr-2">Kelayakan</span> & <br />
              Kontrol Proyek
            </h1>
          </div>
          <p className="text-white/70 text-lg leading-relaxed max-w-sm">
            Tinggalkan spreadsheet rumit. Hitung HPP, RAB, Cashflow, NPV, IRR, dan Kurva S dalam satu dashboard otomatis.
          </p>
          
          <div className="flex flex-col gap-4 mt-8 pt-8 border-t border-white/10 max-w-sm">
            <div className="flex items-start gap-4">
              <div className="bg-white/10 p-2 rounded-full mt-1"><CheckCircle2 className="w-4 h-4 text-gold" /></div>
              <div><p className="font-bold text-white">Akurasi Berstandar</p><p className="text-sm text-white/50">Rumus properti terverifikasi perbankan</p></div>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-white/10 p-2 rounded-full mt-1"><CheckCircle2 className="w-4 h-4 text-gold" /></div>
              <div><p className="font-bold text-white">Kolaborasi Tim</p><p className="text-sm text-white/50">Akses bersama tim surveyor & keuangan</p></div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-white/30 text-xs relative z-10">
          © {new Date().getFullYear()} PropFS by PT. Mettaland Batam Sukses
        </p>
      </div>

      {/* ── Right panel: form ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-8 absolute top-8 left-8">
          <div className="w-9 h-9 bg-navy dark:bg-gold rounded-xl flex items-center justify-center">
            <Building2 className="h-5 w-5 text-white dark:text-navy" />
          </div>
          <span className="font-serif text-xl font-bold text-navy dark:text-gold">PropFS</span>
        </div>

        <div className="w-full max-w-md">
          {/* Tab switcher */}
          {(tab === 'login' || tab === 'register') && (
            <div className="flex bg-muted rounded-xl p-1 mb-8">
              {(['login', 'register'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                    tab === t
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'login' ? 'Masuk' : 'Daftar Baru'}
                </button>
              ))}
            </div>
          )}

          {/* ── LOGIN FORM ── */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="mb-2">
                <h2 className="font-serif text-3xl font-bold text-foreground">Selamat Datang 👋</h2>
                <p className="text-muted-foreground text-sm mt-2">Masuk ke ruang kerja Anda.</p>
              </div>

              {authError && <ErrorBanner message={authError} />}

              <div className="space-y-4">
                <FormField label="Email Perusahaan" id="login-email" icon={<Mail className="h-5 w-5" />}>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="email@perusahaan.com"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    required
                    className="pl-11 h-12 rounded-xl focus-visible:ring-gold"
                    autoComplete="email"
                  />
                </FormField>

                <FormField label="Password" id="login-pass" icon={<Lock className="h-5 w-5" />}>
                  <div className="relative">
                    <Input
                      id="login-pass"
                      type={showPass ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={loginPass}
                      onChange={e => setLoginPass(e.target.value)}
                      required
                      className="pl-11 pr-10 h-12 rounded-xl focus-visible:ring-gold"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </FormField>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => switchTab('forgot')}
                  className="text-sm font-bold text-gold hover:text-gold/80 transition-colors"
                >
                  Lupa kata sandi?
                </button>
              </div>

              <Button type="submit" variant="gold" className="w-full h-12 text-lg font-bold shadow-lg shadow-gold/20 hover:scale-[1.02] transition-transform" disabled={isLoading}>
                {isLoading ? 'Memuat...' : <>Masuk <ArrowRight className="h-5 w-5 ml-2" /></>}
              </Button>
            </form>
          )}

          {/* ── REGISTER FORM ── */}
          {tab === 'register' && (
            <div className="space-y-6">
              <div className="mb-2">
                <h2 className="font-serif text-3xl font-bold text-foreground">Buat Akun Perusahaan ✨</h2>
                <div className="flex items-center gap-2 mt-3 mb-6">
                  <div className={`h-1.5 flex-1 rounded-full ${regStep >= 1 ? 'bg-gold' : 'bg-muted'}`} />
                  <div className={`h-1.5 flex-1 rounded-full ${regStep >= 2 ? 'bg-gold' : 'bg-muted'}`} />
                </div>
                <p className="text-muted-foreground text-sm font-medium">Langkah {regStep} dari 2 — {regStep === 1 ? 'Informasi Perusahaan' : 'Keamanan Akun'}</p>
              </div>

              {(authError || regError) && <ErrorBanner message={authError || regError} />}

              {regStep === 1 ? (
                <form onSubmit={nextRegStep} className="space-y-4 animate-in slide-in-from-right-4">
                  <FormField label="Nama Lengkap PJ" id="reg-name" icon={<User className="h-5 w-5" />}>
                    <Input
                      id="reg-name"
                      placeholder="Budi Santoso"
                      value={regName}
                      onChange={e => setRegName(e.target.value)}
                      required
                      className="pl-11 h-12 rounded-xl"
                    />
                  </FormField>
                  <FormField label="Nama Perusahaan (PT/CV)" id="reg-company" icon={<Briefcase className="h-5 w-5" />}>
                    <Input
                      id="reg-company"
                      placeholder="PT. Graha Maju Konstruksi"
                      value={regCompany}
                      onChange={e => setRegCompany(e.target.value)}
                      required
                      className="pl-11 h-12 rounded-xl"
                    />
                  </FormField>
                  <FormField label="Nomor WhatsApp" id="reg-phone" icon={<Phone className="h-5 w-5" />}>
                     <div className="relative flex items-center">
                        <span className="absolute left-11 text-muted-foreground font-medium border-r pr-2 z-10">+62</span>
                        <Input
                          id="reg-phone"
                          type="tel"
                          placeholder="812-3456-7890"
                          value={regPhone.replace(/^\+62/, '')}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            setRegPhone(val ? `+62${val}` : '')
                          }}
                          required
                          className="pl-24 h-12 rounded-xl focus-visible:ring-gold"
                        />
                     </div>
                  </FormField>
                  <FormField label="Email Perusahaan" id="reg-email" icon={<Mail className="h-5 w-5" />}>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="email@perusahaan.com"
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                      required
                      className="pl-11 h-12 rounded-xl"
                    />
                  </FormField>
                  <Button type="submit" className="w-full h-12 bg-navy hover:bg-navy/90 text-white font-bold text-lg mt-4">
                    Lanjutkan <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="space-y-4 animate-in slide-in-from-right-4">
                  <div className="p-4 bg-muted/50 rounded-xl mb-4 border border-border">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Email Terdaftar</p>
                    <p className="font-bold flex items-center justify-between">
                      {regEmail} 
                      <button type="button" onClick={() => setRegStep(1)} className="text-gold text-xs underline">Ubah</button>
                    </p>
                  </div>
                  <FormField label="Buat Password" id="reg-pass" icon={<Lock className="h-5 w-5" />}>
                    <Input
                      id="reg-pass"
                      type={showPass ? 'text' : 'password'}
                      placeholder="Minimal 8 karakter"
                      value={regPass}
                      onChange={e => setRegPass(e.target.value)}
                      required
                      className="pl-11 h-12 rounded-xl"
                    />
                  </FormField>
                  <FormField label="Ulangi Password" id="reg-pass2" icon={<Lock className="h-5 w-5" />}>
                    <Input
                      id="reg-pass2"
                      type={showPass ? 'text' : 'password'}
                      placeholder="Ulangi password di atas"
                      value={regPass2}
                      onChange={e => setRegPass2(e.target.value)}
                      required
                      className="pl-11 h-12 rounded-xl"
                    />
                  </FormField>
                  
                  <button type="button" onClick={() => setShowPass(!showPass)} className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2">
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showPass ? 'Sembunyikan' : 'Tampilkan'} password
                  </button>

                  <div className="flex gap-3 pt-4">
                    <Button type="button" variant="outline" className="w-1/3 h-12" onClick={() => setRegStep(1)}>
                      Kembali
                    </Button>
                    <Button type="submit" variant="gold" className="w-2/3 h-12 font-bold text-lg shadow-lg shadow-gold/20" disabled={isLoading}>
                      Minta OTP <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ── OTP FORM ── */}
          {tab === 'otp' && (
            <div className="space-y-6 pt-4 animate-in zoom-in-95">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-gold/10 text-gold rounded-full flex items-center justify-center mx-auto mb-4 border border-gold/20 shadow-lg shadow-gold/10">
                  <Smartphone className="h-8 w-8" />
                </div>
                <h2 className="font-serif text-3xl font-bold text-foreground">Verifikasi OTP</h2>
                <p className="text-muted-foreground text-sm mt-3 leading-relaxed">
                  Kami telah mengirimkan 6-digit kode OTP ke<br/>
                  <span className="font-bold text-foreground">{regPhone}</span> dan <span className="font-bold text-foreground">{regEmail}</span>
                </p>
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-xs rounded-lg border border-amber-200 dark:border-amber-800">
                  <strong>Simulasi Dev:</strong> Karena gateway SMS belum aktif di Supabase propfs, harap masukkan kode statis <strong>123456</strong> untuk melanjutkan.
                </div>
              </div>

              {authError && <ErrorBanner message={authError} />}

              <form onSubmit={handleVerifyOTP} className="space-y-8">
                <div className="flex justify-between gap-2 px-2">
                  {[...Array(6)].map((_, i) => (
                    <input
                      key={i}
                      ref={el => otpInputs.current[i] = el}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={otpValue[i]}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                      className="w-12 h-14 text-center text-2xl font-bold rounded-xl border-2 border-border focus:border-gold focus:ring-4 focus:ring-gold/20 transition-all outline-none bg-background shadow-inner"
                    />
                  ))}
                </div>

                <Button type="submit" className="w-full h-14 bg-navy hover:bg-navy/90 text-white text-lg font-bold shadow-xl shadow-navy/20" disabled={isLoading || otpValue.join('').length < 6}>
                  {isLoading ? 'Memverifikasi...' : 'Verifikasi & Selesai'}
                </Button>

                <p className="text-center text-sm font-medium text-muted-foreground">
                  Belum menerima kode?{' '}
                  <button type="button" className="text-gold font-bold hover:underline">Kirim Ulang</button>
                </p>
              </form>
            </div>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {tab === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-6">
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => switchTab('login')}
                  className="text-sm font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6 transition-colors"
                >
                  ← Kembali ke Login
                </button>
                <h2 className="font-serif text-3xl font-bold text-foreground">Reset Sandi</h2>
                <p className="text-muted-foreground text-sm mt-2">
                  Masukkan email terdaftar dan kami akan mengirimkan link untuk memulihkan akses Anda.
                </p>
              </div>

              {forgotSent ? (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-6 text-center shadow-lg">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <p className="text-emerald-800 dark:text-emerald-400 font-bold text-lg">
                    Email berhasil dikirim!
                  </p>
                  <p className="text-emerald-600 dark:text-emerald-500 text-sm mt-2 leading-relaxed">
                    Silakan periksa kotak masuk (dan folder spam) untuk link reset password Anda.
                  </p>
                </div>
              ) : (
                <>
                  {authError && <ErrorBanner message={authError} />}
                  <FormField label="Email Valid" id="forgot-email" icon={<Mail className="h-5 w-5" />}>
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="email@perusahaan.com"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      required
                      className="pl-11 h-12 rounded-xl"
                    />
                  </FormField>
                  <Button type="submit" variant="gold" className="w-full h-12 font-bold text-lg" disabled={isLoading}>
                    {isLoading ? 'Menghubungi Server...' : 'Kirim Link Pemulihan'}
                  </Button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────

function FormField({ label, id, icon, children }: {
  label: string; id: string; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="space-y-2 relative">
      <Label htmlFor={id} className="text-sm font-bold ml-1 text-muted-foreground">{label}</Label>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60">
          {icon}
        </span>
        {children}
      </div>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 shadow-sm animate-in fade-in slide-in-from-top-2">
      <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-500 shrink-0 mt-0.5" />
      <p className="text-red-800 dark:text-red-400 text-sm font-medium leading-relaxed">{message}</p>
    </div>
  )
}
