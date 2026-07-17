import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useFSStore } from './store/fsStore'
import { useAuthStore } from './store/authStore'
import { Toaster } from './components/ui/toaster'
import { toast } from './hooks/use-toast'
import { PrivateRoute, AuthRoute, OpenRoute, AdminRoute, FeatureRoute } from './components/auth/RouteGuards'
import { supabase } from './lib/supabase'
import { Button } from './components/ui/button'

// Code-split routes
const Dashboard   = lazy(() => import('./pages/Dashboard'))
const InputPage   = lazy(() => import('./pages/InputPage'))
const ResultPage  = lazy(() => import('./pages/ResultPage'))
const ReportPage  = lazy(() => import('./pages/ReportPage'))
const AuthPage    = lazy(() => import('./pages/AuthPage'))
const PricingPage = lazy(() => import('./pages/PricingPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const AdminLayout     = lazy(() => import('./components/layout/AdminLayout'))
const AdminDashboard  = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminUsers      = lazy(() => import('./pages/admin/AdminUsers'))
const AdminSettings   = lazy(() => import('./pages/admin/AdminSettings'))
const AdminLandingCMS = lazy(() => import('./pages/admin/AdminLandingCMS'))
const AdminAIBilling  = lazy(() => import('./pages/admin/AdminAIBilling'))
const AdminInvoices   = lazy(() => import('./pages/admin/AdminInvoices'))
const AdminPlans      = lazy(() => import('./pages/admin/AdminPlans'))
const AdminStaff      = lazy(() => import('./pages/admin/AdminEmployeeManager'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const HomePage    = lazy(() => import('./pages/HomePage'))
const CostDashboard = lazy(() => import('./pages/CostDashboard'))
const SiteplanPage = lazy(() => import('./pages/SiteplanPage'))
const CostReportPage = lazy(() => import('./pages/CostReportPage'))
const PaymentPage = lazy(() => import('./pages/PaymentPage'))
const LegalPage   = lazy(() => import('./pages/LegalPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto">
          <svg viewBox="0 0 64 64" className="w-full h-full animate-spin" fill="none">
            <circle cx="32" cy="32" r="28" stroke="#C9A84C" strokeWidth="4" strokeOpacity="0.2"/>
            <path d="M32 4 A28 28 0 0 1 60 32" stroke="#C9A84C" strokeWidth="4" strokeLinecap="round"/>
          </svg>
        </div>
        <p className="text-muted-foreground font-sans text-sm">Memuat PropFS…</p>
      </div>
    </div>
  )
}

export default function App() {
  const isDarkMode = useFSStore(s => s.isDarkMode)
  const initialize = useAuthStore(s => s.initialize)
  const faviconUrl = useAuthStore(s => s.landingContent.branding.faviconUrl)

  const siteName = useAuthStore(s => s.landingContent.branding.siteName)

  // Apply dark mode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

  // Apply custom favicon and site name
  useEffect(() => {
    if (siteName) document.title = siteName

    if (!faviconUrl) return
    const existingLinks = document.querySelectorAll("link[rel~='icon']")
    existingLinks.forEach(l => l.remove())

    const link = document.createElement('link')
    link.rel = 'icon'
    link.type = faviconUrl.includes('image/png') || faviconUrl.endsWith('.png') ? 'image/png' : 'image/x-icon'
    link.href = faviconUrl
    document.head.appendChild(link)
  }, [faviconUrl, siteName])

  // Initialize auth (check session, load profile, load feature flags)
  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* ── Public Routes ── */}
          <Route path="/" element={<OpenRoute><LandingPage /></OpenRoute>} />
          <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
          <Route path="/legal/:type" element={<OpenRoute><LegalPage /></OpenRoute>} />
          <Route path="/reset-password" element={<OpenRoute><ResetPasswordPage /></OpenRoute>} />

          {/* ── Protected Routes ── */}
          <Route path="/home"       element={<PrivateRoute><HomePage /></PrivateRoute>} />
          <Route path="/dashboard"  element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/input/:id?" element={<PrivateRoute><InputPage /></PrivateRoute>} />
          <Route path="/result/:id" element={<PrivateRoute><ResultPage /></PrivateRoute>} />
          <Route path="/report/:id" element={<PrivateRoute><ReportPage /></PrivateRoute>} />
          <Route path="/pricing"    element={<PrivateRoute><PricingPage /></PrivateRoute>} />
          <Route path="/profile"    element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
          <Route path="/siteplan"   element={<PrivateRoute><SiteplanPage /></PrivateRoute>} />
          <Route path="/payment/:id" element={<PrivateRoute><PaymentPage /></PrivateRoute>} />
          
          {/* Cost Control Module — blocked for free plan */}
          <Route path="/cost-control" element={<FeatureRoute feature="cost_control"><CostDashboard /></FeatureRoute>} />
          <Route path="/cost-report/:id" element={<FeatureRoute feature="cost_control"><CostReportPage /></FeatureRoute>} />

          {/* ── Super Admin Only ── */}
          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
             <Route index element={<AdminDashboard />} />
             <Route path="billing" element={<AdminAIBilling />} />
             <Route path="plans" element={<AdminPlans />} />
             <Route path="invoices" element={<AdminInvoices />} />
             <Route path="users" element={<AdminUsers />} />
             <Route path="settings" element={<AdminSettings />} />
             <Route path="cms" element={<AdminLandingCMS />} />
             <Route path="staff" element={<AdminStaff />} />
          </Route>

          {/* ── Fallback ── */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
      <PasswordRecoveryModal />
    </BrowserRouter>
  )
}

function PasswordRecoveryModal() {
  const { isPasswordRecovery, user } = useAuthStore()
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isPasswordRecovery || !user) return null

  async function handleUpdate() {
    if (newPassword.length < 8) {
      toast({ title: 'Password minimal 8 karakter', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast({ title: 'Password berhasil diubah!' })
      // Reload page to clear hash and reset state
      window.location.href = '/home'
    } catch (e: any) {
      toast({ title: 'Gagal mengubah password', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl">
        <h3 className="text-2xl font-serif font-black text-navy mb-2">Set Password Baru</h3>
        <p className="text-sm text-slate-500 mb-6">Silakan masukkan password baru untuk akun Anda.</p>
        <div className="space-y-4">
          <div>
             <input type="password" placeholder="Min. 8 karakter" className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 font-medium text-navy focus:ring-4 focus:ring-gold/10 outline-none" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
          <Button onClick={handleUpdate} disabled={loading} className="w-full h-14 bg-gold text-navy font-bold rounded-2xl hover:scale-[1.02] active:scale-95 transition-transform">
            {loading ? 'Memproses...' : 'Simpan Password'}
          </Button>
        </div>
      </div>
    </div>
  )
}

