import { useState, useRef } from 'react'
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

  const [tab, setTab] = useState<Tab>('login')
  const [regStep, setRegStep] = useState<1 | 2>(1)
  const [showPass, setShowPass] = useState(false)
  
  const [regName, setRegName] = useState('')
  const [regCompany, setRegCompany] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regPass2, setRegPass2] = useState('')
  const [regError, setRegError] = useState('')

  const [otpValue, setOtpValue] = useState(['', '', '', '', '', ''])
  const otpInputs = useRef<(HTMLInputElement | null)[]>([])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    try {
      await signIn((e.target as any).email.value, (e.target as any).password.value)
      navigate('/home')
    } catch (err) {}
  }

  // Klik "Daftar" -> Pindah ke layar OTP
  function handleRequestOTP(e: React.FormEvent) {
    e.preventDefault()
    if (regPass !== regPass2) {
      setRegError('Password tidak cocok')
      return
    }
    setTab('otp')
    console.log("OTP Sent to Email:", regEmail)
  }

  // Verifikasi OTP & Eksekusi Pendaftaran
  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault()
    const code = otpValue.join('')
    
    // Kode Simulasi (Ganti dengan integrasi Email Service nanti jika sudah siap)
    if (code !== '123456') {
      useAuthStore.setState({ authError: 'Kode OTP email salah. Gunakan 123456.' })
      return
    }

    try {
      await signUp(regEmail, regPass, regName, regCompany, regPhone)
      await signIn(regEmail, regPass)
      navigate('/home')
    } catch (err: any) {
      setRegError(err.message)
      setTab('register')
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    if (!/^[0-9]*$/.test(value)) return
    const newOtp = [...otpValue]
    newOtp[index] = value
    setOtpValue(newOtp)
    if (value && index < 5) otpInputs.current[index + 1]?.focus()
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Panel Kiri (Branding) */}
      <div className="hidden lg:flex lg:w-[45%] bg-navy flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gold/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-gold rounded-xl flex items-center justify-center">
            <Building2 className="h-5 w-5 text-navy" />
          </div>
          <span className="font-serif text-xl font-bold text-white">PropFS</span>
        </div>
        <div className="space-y-6 relative z-10 text-white">
          <h1 className="font-serif text-4xl font-bold leading-tight">Verifikasi Cepat<br /><span className="text-gold italic">Keamanan</span> Terjamin</h1>
          <p className="text-white/70">Kami memastikan setiap akun terverifikasi melalui email resmi perusahaan Anda.</p>
        </div>
        <p className="text-white/30 text-xs">© {new Date().getFullYear()} PropFS by PT. Mettaland Batam Sukses</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md">
          {tab !== 'otp' && (
            <div className="flex bg-muted rounded-xl p-1 mb-8">
              <button onClick={() => setTab('login')} className={`flex-1 py-2 text-sm font-bold rounded-lg ${tab === 'login' ? 'bg-background' : 'text-muted-foreground'}`}>Masuk</button>
              <button onClick={() => setTab('register')} className={`flex-1 py-2 text-sm font-bold rounded-lg ${tab === 'register' ? 'bg-background' : 'text-muted-foreground'}`}>Daftar</button>
            </div>
          )}

          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-6">
              <h2 className="font-serif text-3xl font-bold">Selamat Datang 👋</h2>
              {authError && <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm">{authError}</div>}
              <div className="space-y-4">
                <Input name="email" type="email" placeholder="Email Perusahaan" className="h-12 rounded-xl" required />
                <Input name="password" type="password" placeholder="Password" className="h-12 rounded-xl" required />
              </div>
              <Button type="submit" variant="gold" className="w-full h-12 font-bold" disabled={isLoading}>{isLoading ? 'Memuat...' : 'Masuk'}</Button>
            </form>
          )}

          {tab === 'register' && (
            <div className="space-y-6">
              <h2 className="font-serif text-3xl font-bold">Daftar Akun ✨</h2>
              {regError && <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm">{regError}</div>}
              {regStep === 1 ? (
                <div className="space-y-4">
                  <Input placeholder="Nama Lengkap" value={regName} onChange={e => setRegName(e.target.value)} className="h-12 rounded-xl" />
                  <Input placeholder="Nama Perusahaan" value={regCompany} onChange={e => setRegCompany(e.target.value)} className="h-12 rounded-xl" />
                  <Input placeholder="Email (Untuk OTP)" type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} className="h-12 rounded-xl" />
                  <Button className="w-full h-12 bg-navy text-white font-bold" onClick={() => setRegStep(2)}>Lanjutkan</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Input placeholder="Buat Password" type="password" value={regPass} onChange={e => setRegPass(e.target.value)} className="h-12 rounded-xl" />
                  <Input placeholder="Ulangi Password" type="password" value={regPass2} onChange={e => setRegPass2(e.target.value)} className="h-12 rounded-xl" />
                  <div className="flex gap-2">
                    <Button variant="outline" className="h-12" onClick={() => setRegStep(1)}>Batal</Button>
                    <Button className="flex-1 h-12 bg-gold text-navy font-bold" onClick={handleRequestOTP}>Minta OTP Email</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'otp' && (
            <div className="space-y-8 text-center pt-10">
              <div className="w-16 h-16 bg-gold/10 text-gold rounded-full flex items-center justify-center mx-auto"><Mail className="h-8 w-8" /></div>
              <div>
                <h2 className="font-serif text-3xl font-bold">Verifikasi Email</h2>
                <p className="text-muted-foreground text-sm mt-2">Kode dikirim ke: <br/><strong>{regEmail}</strong></p>
              </div>
              <div className="flex justify-center gap-2">
                {otpValue.map((v, i) => (
                  <input key={i} ref={el => otpInputs.current[i] = el} type="text" maxLength={1} value={v} onChange={e => handleOtpChange(i, e.target.value)} className="w-12 h-14 text-center text-2xl font-bold border-2 rounded-xl focus:border-gold outline-none" />
                ))}
              </div>
              <Button className="w-full h-12 bg-navy text-white font-bold" onClick={handleVerifyOTP}>Verifikasi & Selesaikan</Button>
              <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-100">Cek kotak masuk email Anda. (Gunakan 123456 untuk simulasi)</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
