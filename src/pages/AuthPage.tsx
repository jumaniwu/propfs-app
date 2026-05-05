import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Building2, Mail, Lock, User, Briefcase, EyeOff, Eye, ArrowRight, AlertCircle, Phone, ShieldCheck, Loader2, CheckCircle2, Check } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Tab = 'login' | 'register'

export default function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, signUp, authError, clearError, isLoading } = useAuthStore()

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
  
  // Form State
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')

  const [regName, setRegName] = useState('')
  const [regCompany, setRegCompany] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regPass2, setRegPass2] = useState('')
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

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
      const plan = params.get('plan')
      if (plan && plan !== 'free') {
        navigate(`/home?create_invoice=${plan}`)
      } else {
        navigate('/home')
      }
    } catch (err: any) {
      console.error("Login Error:", err)
    }
  }

  async function handleRegisterSubmit() {
    if (regPass !== regPass2) {
      setRegError('Password konfirmasi tidak cocok.')
      return
    }
    if (regPass.length < 8) {
      setRegError('Password minimal 8 karakter.')
      return
    }
    if (!regEmail) {
      setRegError('Email wajib diisi.')
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
    try {
      await signUp(regEmail, regPass, regName, regCompany, regPhone)
      // Try to auto-login directly
      await signIn(regEmail, regPass)
      // After successful registration & login, always go to Pricing page
      // so user can choose their plan — don't auto-assign free
      navigate('/pricing')
    } catch (err: any) {
      const msg: string = err.message || ''
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('sudah terdaftar')) {
        setRegError('Email tersebut sudah terdaftar di sistem kami! Silakan gunakan email lain untuk mendaftar, atau klik tombol LOG IN di atas untuk masuk menggunakan email tersebut.')
      } else if (msg.toLowerCase().includes('confirm') || msg.toLowerCase().includes('email') || msg.includes('Pendaftaran berhasil')) {
        // Show clear success message — DO NOT switch to login tab silently
        setRegSuccess(true)
        setRegError('')
      } else {
        setRegError(err.message)
      }
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
                <div className="p-5 bg-emerald-50 border-2 border-emerald-200 rounded-[24px] space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex gap-3 items-start">
                    <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-600 mt-0.5" />
                    <div>
                      <p className="font-black text-emerald-800 text-sm mb-1">Pendaftaran Berhasil! 🎉</p>
                      <p className="text-xs text-emerald-700 leading-relaxed">Kami telah mengirim email konfirmasi ke <strong>{regEmail}</strong>. Silakan cek inbox (atau folder spam) Anda dan klik link konfirmasi, lalu login kembali untuk memilih paket.</p>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full h-12 rounded-xl border-emerald-300 font-bold text-emerald-700 hover:bg-emerald-100" onClick={() => { setRegSuccess(false); setTab('login') }}>
                    Sudah Konfirmasi? Login Sekarang →
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
              {regStep === 1 && (
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
                  <Button className="w-full h-16 bg-gold text-navy rounded-2xl font-black text-lg shadow-2xl shadow-gold/20" onClick={() => setRegStep(2)}>
                    LANJUTKAN <ArrowRight className="h-5 w-5 ml-2 inline" />
                  </Button>
                </div>
              )}

              {/* Step 2 */}
              {regStep === 2 && (
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
                      Saya telah membaca dan menyetujui <a href="/legal/terms" target="_blank" className="text-navy hover:text-gold font-bold transition-colors" onClick={e => e.stopPropagation()}>Syarat & Ketentuan</a> dan <a href="/legal/privacy" target="_blank" className="text-navy hover:text-gold font-bold transition-colors" onClick={e => e.stopPropagation()}>Kebijakan Privasi</a> PropFS.
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
        </div>
      </div>
    </div>
  )
}
