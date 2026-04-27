import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useFSStore } from './store/fsStore'
import { useAuthStore } from './store/authStore'
import { Toaster } from './components/ui/toaster'
import { PrivateRoute, AuthRoute, OpenRoute, AdminRoute } from './components/auth/RouteGuards'

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
const PaymentPage = lazy(() => import('./pages/PaymentPage'))
const LegalPage   = lazy(() => import('./pages/LegalPage'))

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

  // Apply dark mode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

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

          {/* ── Protected Routes ── */}
          <Route path="/home"       element={<PrivateRoute><HomePage /></PrivateRoute>} />
          <Route path="/dashboard"  element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/input/:id?" element={<PrivateRoute><InputPage /></PrivateRoute>} />
          <Route path="/result/:id" element={<PrivateRoute><ResultPage /></PrivateRoute>} />
          <Route path="/report/:id" element={<PrivateRoute><ReportPage /></PrivateRoute>} />
          <Route path="/pricing"    element={<PrivateRoute><PricingPage /></PrivateRoute>} />
          <Route path="/profile"    element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
          <Route path="/payment/:id" element={<PrivateRoute><PaymentPage /></PrivateRoute>} />
          
          {/* Cost Control Module */}
          <Route path="/cost-control" element={<PrivateRoute><CostDashboard /></PrivateRoute>} />

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
    </BrowserRouter>
  )
}

