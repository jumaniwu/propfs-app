import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useFSStore } from '@/store/fsStore'
import { useAuthStore } from '@/store/authStore'
import { Toaster } from '@/components/ui/toaster'
import { PrivateRoute, AuthRoute, OpenRoute, AdminRoute } from '@/components/auth/RouteGuards'

// Code-split routes
const Dashboard   = lazy(() => import('@/pages/Dashboard'))
const InputPage   = lazy(() => import('@/pages/InputPage'))
const ResultPage  = lazy(() => import('@/pages/ResultPage'))
const ReportPage  = lazy(() => import('@/pages/ReportPage'))
const AuthPage    = lazy(() => import('@/pages/AuthPage'))
const PricingPage = lazy(() => import('@/pages/PricingPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const AdminLayout     = lazy(() => import('@/components/layout/AdminLayout'))
const AdminDashboard  = lazy(() => import('@/pages/admin/AdminDashboard'))
const AdminUsers      = lazy(() => import('@/pages/admin/AdminUsers'))
const AdminSettings   = lazy(() => import('@/pages/admin/AdminSettings'))
const AdminLandingCMS = lazy(() => import('@/pages/admin/AdminLandingCMS'))
const AdminInvoices   = lazy(() => import('@/pages/admin/AdminInvoices'))
const AdminAlBilling  = lazy(() => import('@/pages/admin/AdminAIBilling'))
const AdminPlans      = lazy(() => import('@/pages/admin/AdminPlans'))
const LandingPage     = lazy(() => import('@/pages/LandingPage'))
const HomePage        = lazy(() => import('@/pages/HomePage'))
const PaymentPage     = lazy(() => import('@/pages/PaymentPage'))
const CostDashboard   = lazy(() => import('@/pages/CostDashboard'))

export default function App() {
  const { initialize } = useAuthStore()
  const { initialize: initFS } = useFSStore()

  useEffect(() => {
    initialize()
    initFS()
  }, [])

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex h-screen items-center justify-center font-serif italic text-navy/40">PropFS is loading...</div>}>
        <Routes>
          {/* Public Landing & Auth */}
          <Route path="/" element={<OpenRoute><LandingPage /></OpenRoute>} />
          <Route path="/login" element={<AuthRoute><AuthPage /></AuthRoute>} />
          <Route path="/pricing" element={<PricingPage />} />
          
          {/* Dashboard & FS Engine */}
          <Route path="/home" element={<PrivateRoute><HomePage /></PrivateRoute>} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/input" element={<PrivateRoute><InputPage /></PrivateRoute>} />
          <Route path="/result" element={<PrivateRoute><ResultPage /></PrivateRoute>} />
          <Route path="/report" element={<PrivateRoute><ReportPage /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
          <Route path="/payment/:id" element={<PrivateRoute><PaymentPage /></PrivateRoute>} />
          <Route path="/cost-dashboard" element={<PrivateRoute><CostDashboard /></PrivateRoute>} />
          
          {/* Admin Panel */}
          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="landing" element={<AdminLandingCMS />} />
            <Route path="invoices" element={<AdminInvoices />} />
            <Route path="billing" element={<AdminAlBilling />} />
            <Route path="plans" element={<AdminPlans />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  )
}
