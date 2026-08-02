import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LegalModal } from '@/components/ui/LegalModal'
import { Building2, Mail, Lock, User, Briefcase, EyeOff, Eye, ArrowRight, AlertCircle, Phone, ShieldCheck, Loader2, CheckCircle2, Check } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { rutaSetelahMasukSaatIni } from '@/hooks/useRutaMasuk'

type Tab = 'login' | 'register' | 'forgot-password'

export default function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, signUp, resetPassword, authError, clearError, isLoading } = useAuthStore()

  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('tab')
    const p = params.get('plan')
    return (t === 'register' || p ? 'register' : 'login')
  })
  
  // Read selected plan from URL
  const [selectedPlan, setSelectedPlan] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('plan') || 'free'
  })
  const [selectedMonths, setSelectedMonths] = useState<number>(1)

  const planLabel: Record<string, string> = {
    free: 'Gratis',
    basic: 'Starter',
    pro: 'Pro',
    starter: 'Starter',
  }
  const displayedPlan = planLabel[selectedPlan] || selectedPlan
  
  const [regStep, setRegStep] = useState<1 | 2>(1)
  const [showPass, setShowPass] = useState(false)
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null)
  
  // Form State
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)

  const [regName, setRegName] = useState('')
  const [regCompany, setRegCompany] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regPass2, setRegPass2] = useState('')
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  
  const [referralCode, setReferralCode] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('ref') || ''
  })

  // CAPTCHA State
  const [captchaNum1, setCaptchaNum1] = useState(0)
  const [captchaNum2, setCaptchaNum2] = useState(0)
  const [captchaAnswer, setCaptchaAnswer] = useState('')

  function generateCaptcha() {
    setCaptchaNum1(Math.floor(Math.random() * 10) + 1)
    setCaptchaNum2(Math.floor(Math.random() * 10) + 1)
    setCaptchaAnswer('')
  }

  useEffect(() => {
    generateCaptcha()
  }, [])

  useEffect(() => {
    clearError()
  }, [tab])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    try {
      await signIn(loginEmail, loginPass)
      const params = new URLSearchParams(location.search)
      // Beranda dihitung SETELAH signIn supaya langganan yang baru dimuat ikut
      // terbaca — kalau dibaca sebelumnya, pelanggan Kontraktor AI akan
      // dianggap belum berlangganan dan dilempar ke halaman paket.
      navigate(rutaSetelahMasukSaatIni(params.get('plan')))
    } catch (err: any) {
      console.error("Login Error:", err)
    }
  }

  function handleStep1Next() {
    if (!regName.trim()) {
      setRegError('Nama Lengkap wajib diisi.')
      return
    }
    if (!regCompany.trim()) {
      setRegError('Nama Perusahaan wajib diisi.')
      return
    }
    if (!regPhone.trim()) {
      setRegError('Nomor WhatsApp wajib diisi.')
      return
    }
    setRegError('')
    setRegStep(2)
  }

  async function handleRegisterSubmit() {
    if (!regEmail.trim()) {
      setRegError('Email wajib diisi.')
      return
    }
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) {
      setRegError('Format email tidak valid. Gunakan email yang benar, contoh: nama@gmail.com')
      return
    }
    if (regPass.length < 8) {
      setRegError('Password minimal 8 karakter.')
      return
    }
    if (regPass !== regPass2) {
      setRegError('Password konfirmasi tidak cocok.')
      return
    }
    if (parseInt(captchaAnswer) !== captchaNum1 + captchaNum2) {
      setRegError('Jawaban keamanan (CAPTCHA) salah. Silakan coba lagi.')
      generateCaptcha()
      return
    }
    if (!agreedToTerms) {
      setRegError('Anda harus menyetujui Syarat & Ketentuan dan Kebijakan Privasi.')
      return
    }

    setRegError('')

    // Check for duplicate email and phone number directly to prevent fake success response
    try {
      const { supabase: sb } = await import('@/lib/supabase')
      
      const { data: existingEmail } = await sb
        .from('profiles')
        .select('id')
        .eq('email', regEmail.trim())
        .maybeSingle()
        
      if (existingEmail) {
        setRegError('Email tersebut sudah terdaftar. Silakan login atau gunakan email lain.')
        return
      }

      const { data: existingPhone } = await sb
        .from('profiles')
        .select('id')
        .eq('phone', regPhone.trim())
        .maybeSingle()
        
      if (existingPhone) {
        setRegError('Nomor WhatsApp tersebut sudah terdaftar. Gunakan nomor lain.')
        return
      }
    } catch {
      // If check fails (e.g. network), proceed anyway
    }

    try {
      const result = await signUp(regEmail, regPass, regName, regCompany, regPhone, referralCode)
      
      if (result.needsConfirmation) {
        // Email confirmation required — store plan so it persists after login
        if (selectedPlan && selectedPlan !== 'free') {
          localStorage.setItem('propfs_pending_plan', JSON.stringify({ plan: selectedPlan, months: selectedMonths }))
        }
        setRegSuccess(true)
        setRegError('')
      } else {
        // No email confirmation required — auto login
        try {
          await signIn(regEmail, regPass)
          navigate(rutaSetelahMasukSaatIni(selectedPlan, selectedMonths))
        } catch {
          // Auto-login failed but account was created — show success
          setRegSuccess(true)
        }
      }
    } catch (err: any) {
      const msg: string = err.message || ''
      const lower = msg.toLowerCase()
      
      if (lower.includes('already registered') || lower.includes('user already registered') || lower.includes('email already') || lower.includes('sudah terdaftar')) {
        setRegError('Email tersebut sudah terdaftar. Klik LOG IN di atas untuk masuk dengan email tersebut.')
      } else if (lower.includes('email not confirmed') || lower.includes('not confirmed')) {
        setRegError('Akun dengan email ini sudah ada tapi belum dikonfirmasi. Silakan cek email Anda dan klik link konfirmasi.')
      } else if (lower.includes('invalid email') || lower.includes('email format')) {
        setRegError('Format email tidak valid. Gunakan email yang aktif dan benar.')
      } else {
        setRegError(`Pendaftaran gagal: ${msg || 'Terjadi kesalahan, coba beberapa saat lagi.'}`)
      }
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    setRegError('')
    
    if (!resetEmail) {
      setRegError('Masukkan email Anda')
      return
    }

    try {
      await resetPassword(resetEmail)
      setResetSuccess(true)
    } catch (err: any) {
      setRegError(err.message || 'Gagal mengirim link reset password.')
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row font-sans">
      {/* ── Left panel: branding ── */}
      <div className="lg:w-[40%] bg-[#0f172a] relative overflow-hidden p-10 lg:p-20 flex flex-col justify-between text-white shrink-0">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gold/5 rounded-full blur-[140px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 bg-gold rounded-2xl flex items-center justify-center shadow-2xl shadow-gold/20">
            <Building2 className="h-7 w-7 text-navy" />
          </div>
          <span className="text-3xl font-serif font-black tracking-tighter text-white">PropFS</span>
        </div>

        <div className="relative z-10 py-12 lg:py-0">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold/10 border border-gold/20 text-gold text-[11px] font-black uppercase tracking-widest mb-8">
            <ShieldCheck className="w-4 h-4" /> Professional Real Estate Tool
          </div>
          <h1 className="font-serif text-4xl lg:text-6xl font-bold leading-[1.05] mb-8">
            Analisa <br />
            <span className="text-gold italic">Kelayakan</span> <br />
            Tanpa Batas.
          </h1>
          <p className="text-white/60 text-lg max-w-sm leading-relaxed font-medium">
            Sistem otentikasi aman untuk melindungi data finansial dan kalkulasi proyek properti Anda.
          </p>
        </div>

        <div className="relative z-10 p-6 bg-white/5 rounded-[32px] border border-white/10 backdrop-blur">
          <p className="text-sm font-bold text-gold mb-2">Verified Security</p>
          <p className="text-xs text-white/40 leading-relaxed">Seluruh data Anda dienkripsi secara end-to-end menggunakan standar keamanan perbankan global.</p>
        </div>
      </div>

      {/* ── Right panel: form ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-24 bg-slate-50/50 relative overflow-hidden">
        <div className="lg:hidden absolute top-0 left-0 w-64 h-64 bg-gold/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

        <div className="w-full max-w-[440px] relative z-10">
          
          <div className="flex bg-slate-200/50 p-2 rounded-2xl mb-12 w-full backdrop-blur">
            <button onClick={() => setTab('login')} className={`flex-1 py-4 text-sm font-black rounded-xl transition-all duration-300 ${tab === 'login' ? 'bg-white text-navy shadow-xl shadow-navy/5' : 'text-slate-500 hover:text-navy/60'}`}>LOG IN</button>
            <button onClick={() => setTab('register')} className={`flex-1 py-4 text-sm font-black rounded-xl transition-all duration-300 ${tab === 'register' ? 'bg-white text-navy shadow-xl shadow-navy/5' : 'text-slate-500 hover:text-navy/60'}`}>REGISTER</button>
          </div>

          {/* LOGIN */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="space-y-2">
                <h2 className="text-4xl font-serif font-black text-navy leading-none">Selamat Datang 👋</h2>
                <p className="text-slate-500 font-medium">Masuk untuk mengelola Dashboard Anda.</p>
              </div>

              {authError && (
                 <div className="p-5 bg-red-50 border-2 border-red-100 rounded-[24px] flex gap-4 text-xs text-red-700 leading-relaxed shadow-sm">
                   <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
                   <div>
                     <p className="font-black text-[13px] mb-1">Gagal Terhubung</p>
                     <p>Pesan: {authError}. Pastikan internet stabil dan akun sudah terverifikasi.</p>
                   </div>
                 </div>
              )}

              <div className="space-y-5">
                <div className="space-y-2.5">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Email Perusahaan</Label>
                  <div className="relative">
                    <Mail className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                    <Input className="pl-14 h-16 rounded-2xl bg-white border-slate-200 focus:border-gold focus:ring-4 focus:ring-gold/5 transition-all text-lg font-medium" type="email" placeholder="name@company.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-2.5">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Password Access</Label>
                  <div className="relative">
                    <Lock className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                    <Input className="pl-14 pr-14 h-16 rounded-2xl bg-white border-slate-200 focus:border-gold focus:ring-4 focus:ring-gold/5 transition-all text-lg font-medium" type={showPass ? 'text' : 'password'} placeholder="••••••••" value={loginPass} onChange={e => setLoginPass(e.target.value)} required />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-5 top-5 text-slate-400 p-1 hover:text-navy transition-colors">{showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end">
                <button type="button" onClick={() => { setTab('forgot-password'); clearError(); setRegError(''); setResetSuccess(false); }} className="text-sm font-bold text-navy/60 hover:text-gold transition-colors">
                  Lupa Password?
                </button>
              </div>
              
              <Button type="submit" variant="gold" className="w-full h-16 rounded-[22px] text-xl font-black shadow-2xl shadow-gold/20 hover:scale-[1.02] active:scale-95 transition-all" disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin h-6 w-6 mr-3" /> : <><span>MASUK SEKARANG</span> <ArrowRight className="h-5 w-5 ml-3" /></>}
              </Button>
            </form>
          )}

          {/* REGISTER */}
          {tab === 'register' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="space-y-2">
                <h2 className="text-4xl font-serif font-black text-navy leading-none">Buat Akun Baru</h2>
                <p className="text-slate-500 font-medium">
                  Paket dipilih: <span className="text-gold font-black">{displayedPlan}</span>
                </p>
              </div>

              {regSuccess && (
                <div className="p-5 bg-emerald-50 border-2 border-emerald-200 rounded-[24px] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex gap-3 items-start">
                    <CheckCircle2 className="w-7 h-7 shrink-0 text-emerald-600 mt-0.5" />
                    <div>
                      <p className="font-black text-emerald-800 text-base mb-2">🎉 Registrasi Sukses!</p>
                      {selectedPlan && selectedPlan !== 'free' ? (
                        <p className="text-xs text-emerald-700 leading-relaxed">
                          Akun Anda berhasil dibuat untuk paket <strong className="text-emerald-800">{displayedPlan}</strong>.<br/><br/>
                          Kami mengirim email konfirmasi ke <strong>{regEmail}</strong>.<br/>
                          Klik link konfirmasi, lalu login — Anda akan langsung diarahkan ke halaman <strong>pembayaran</strong>.
                        </p>
                      ) : (
                        <p className="text-xs text-emerald-700 leading-relaxed">
                          Akun Anda berhasil dibuat.<br/><br/>
                          Kami mengirim email konfirmasi ke <strong>{regEmail}</strong>.<br/>
                          Silakan klik link konfirmasi lalu login untuk masuk ke dashboard.
                        </p>
                      )}
                    </div>
                  </div>
                  <Button variant="outline" className="w-full h-12 rounded-xl border-emerald-300 font-bold text-emerald-700 hover:bg-emerald-100" onClick={() => { setRegSuccess(false); setTab('login') }}>
                    Ke Menu Login →
                  </Button>
                </div>
              )}

              {regError && !regSuccess && (
                <div className="p-5 bg-red-50 border-2 border-red-100 rounded-[24px] flex gap-4 text-xs text-red-700 leading-relaxed">
                  <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
                  <p>{regError}</p>
                </div>
              )}

              {/* Step 1 */}
              {regStep === 1 && !regSuccess && (
                <div className="space-y-5">
                  <div className="space-y-2.5">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Nama Lengkap</Label>
                    <div className="relative">
                      <User className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                      <Input className="pl-14 h-16 rounded-2xl bg-white" type="text" placeholder="Nama Anda" value={regName} onChange={e => setRegName(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Perusahaan</Label>
                    <div className="relative">
                      <Briefcase className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                      <Input className="pl-14 h-16 rounded-2xl bg-white" type="text" placeholder="Nama Perusahaan" value={regCompany} onChange={e => setRegCompany(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">No. WhatsApp</Label>
                    <div className="relative">
                      <Phone className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                      <Input className="pl-14 h-16 rounded-2xl bg-white" type="tel" placeholder="0812-xxxx-xxxx" value={regPhone} onChange={e => setRegPhone(e.target.value)} />
                    </div>
                  </div>
                  <Button className="w-full h-16 bg-gold text-navy rounded-2xl font-black text-lg shadow-2xl shadow-gold/20" onClick={handleStep1Next}>
                    LANJUTKAN <ArrowRight className="h-5 w-5 ml-2 inline" />
                  </Button>
                </div>
              )}

              {/* Step 2 */}
              {regStep === 2 && !regSuccess && (
                <div className="space-y-5">
                  <div className="space-y-2.5">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Email Aktif</Label>
                    <div className="relative">
                      <Mail className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                      <Input className="pl-14 h-16 rounded-2xl bg-white" type="email" placeholder="email@perusahaan.com" value={regEmail} onChange={e => setRegEmail(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Buat Sandi</Label>
                    <div className="relative">
                       <Lock className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                       <Input className="pl-14 h-16 rounded-2xl bg-white" type="password" placeholder="Min. 8 karakter" value={regPass} onChange={e => setRegPass(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Ulangi Sandi</Label>
                    <div className="relative">
                       <Lock className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                       <Input className="pl-14 h-16 rounded-2xl bg-white" type="password" placeholder="Konfirmasi sandi Anda" value={regPass2} onChange={e => setRegPass2(e.target.value)} />
                    </div>
                  </div>

                  {/* Plan & Duration Selectors */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2.5">
                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Pilih Paket</Label>
                      <select 
                        className="w-full h-16 px-4 rounded-2xl bg-white border border-slate-200 text-navy font-bold focus:ring-4 focus:ring-gold/20 outline-none transition-all appearance-none"
                        value={selectedPlan}
                        onChange={e => setSelectedPlan(e.target.value)}
                      >
                        <option value="free">Gratis</option>
                        <option value="starter">Starter</option>
                        <option value="pro">Pro</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                    </div>
                    {selectedPlan !== 'free' && (
                      <div className="space-y-2.5">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Durasi</Label>
                        <select 
                          className="w-full h-16 px-4 rounded-2xl bg-white border border-slate-200 text-navy font-bold focus:ring-4 focus:ring-gold/20 outline-none transition-all appearance-none"
                          value={selectedMonths}
                          onChange={e => setSelectedMonths(Number(e.target.value))}
                        >
                          <option value={1}>1 Bulan</option>
                          <option value={3}>3 Bulan (Hemat 10%)</option>
                          <option value={12}>1 Tahun (Hemat 20%)</option>
                        </select>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2.5">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Kode Referral (Opsional)</Label>
                    <div className="relative">
                      <Input 
                        className="pl-4 h-16 rounded-2xl bg-white uppercase placeholder:normal-case font-bold" 
                        type="text" 
                        placeholder="Masukkan kode referral jika ada" 
                        value={referralCode} 
                        onChange={e => setReferralCode(e.target.value.toUpperCase())} 
                      />
                    </div>
                    {referralCode && <p className="text-[10px] text-emerald-600 ml-1 mt-1 font-medium">Kode terdeteksi. Bonus referral akan aktif jika kode valid.</p>}
                  </div>

                  {/* Math CAPTCHA */}
                  <div className="space-y-2.5 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Verifikasi Keamanan</Label>
                      <button 
                        type="button" 
                        onClick={generateCaptcha}
                        className="text-[10px] font-bold text-navy hover:text-gold"
                      >
                        Ganti Soal
                      </button>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="h-14 px-6 bg-white border border-slate-200 rounded-xl flex items-center justify-center font-black text-lg text-navy shadow-inner w-32 shrink-0">
                        {captchaNum1} + {captchaNum2} =
                      </div>
                      <Input 
                        className="h-14 rounded-xl bg-white text-lg font-bold text-center flex-1" 
                        type="number" 
                        placeholder="?" 
                        value={captchaAnswer} 
                        onChange={e => setCaptchaAnswer(e.target.value)} 
                        onKeyDown={e => e.key === 'Enter' && handleRegisterSubmit()}
                      />
                    </div>
                  </div>

                  {/* Terms & Privacy Agreement */}
                  <div 
                    className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setAgreedToTerms(!agreedToTerms)}
                  >
                    <div className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${agreedToTerms ? 'bg-gold border-gold' : 'bg-white border-slate-300'}`}>
                      {agreedToTerms && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                    </div>
                    <p className="text-sm text-slate-600 leading-snug">
                      Saya telah membaca dan menyetujui{' '}
                      <button type="button" onClick={(e) => { e.stopPropagation(); setLegalModal('terms') }} className="text-gold underline font-semibold hover:text-gold/80">Syarat & Ketentuan</button>
                      {' '}dan{' '}
                      <button type="button" onClick={(e) => { e.stopPropagation(); setLegalModal('privacy') }} className="text-gold underline font-semibold hover:text-gold/80">Kebijakan Privasi</button>
                      {' '}PropFS.
                    </p>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <Button variant="outline" className="h-16 rounded-2xl px-10 border-slate-200 font-bold" onClick={() => setRegStep(1)}>BACK</Button>
                    <Button className="flex-1 h-16 bg-gold text-navy rounded-2xl font-black text-lg shadow-2xl shadow-gold/20 active:scale-95 transition-all" onClick={handleRegisterSubmit} disabled={isLoading}>
                      {isLoading ? <Loader2 className="animate-spin w-6 h-6" /> : 'DAFTAR SEKARANG'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FORGOT PASSWORD */}
          {tab === 'forgot-password' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="space-y-2">
                <button onClick={() => setTab('login')} className="text-sm font-bold text-navy/60 hover:text-gold transition-colors mb-2 inline-flex items-center gap-1">
                  ← Kembali ke Login
                </button>
                <h2 className="text-4xl font-serif font-black text-navy leading-none">Reset Password</h2>
                <p className="text-slate-500 font-medium">Masukkan email Anda untuk menerima tautan pemulihan.</p>
              </div>

              {resetSuccess ? (
                <div className="p-5 bg-emerald-50 border-2 border-emerald-200 rounded-[24px] space-y-3">
                  <div className="flex gap-3 items-start">
                    <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-600 mt-0.5" />
                    <div>
                      <p className="font-black text-emerald-800 text-sm mb-1">Link Terkirim!</p>
                      <p className="text-xs text-emerald-700 leading-relaxed">Periksa kotak masuk email <strong>{resetEmail}</strong> (dan folder spam) untuk petunjuk mengatur ulang kata sandi Anda.</p>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full h-12 rounded-xl border-emerald-300 font-bold text-emerald-700 hover:bg-emerald-100" onClick={() => setTab('login')}>
                    Kembali ke Halaman Login
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleResetSubmit} className="space-y-6">
                  {regError && (
                    <div className="p-5 bg-red-50 border-2 border-red-100 rounded-[24px] flex gap-4 text-xs text-red-700 leading-relaxed">
                      <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
                      <p>{regError}</p>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Email Terdaftar</Label>
                    <div className="relative">
                      <Mail className="absolute left-5 top-5 h-5 w-5 text-slate-400" />
                      <Input className="pl-14 h-16 rounded-2xl bg-white border-slate-200 focus:border-gold focus:ring-4 focus:ring-gold/5 transition-all text-lg font-medium" type="email" placeholder="name@company.com" value={resetEmail} onChange={e => setResetEmail(e.target.value)} required />
                    </div>
                  </div>

                  <Button type="submit" variant="gold" className="w-full h-16 rounded-[22px] text-xl font-black shadow-2xl shadow-gold/20 hover:scale-[1.02] active:scale-95 transition-all" disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin h-6 w-6 mr-3" /> : <><span>KIRIM LINK RESET</span> <ArrowRight className="h-5 w-5 ml-3" /></>}
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
      
      <LegalModal
        type={legalModal!}
        isOpen={legalModal !== null}
        onClose={() => setLegalModal(null)}
      />
    </div>
  )
}
