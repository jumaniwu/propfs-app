import { useState, useEffect } from 'react'
import { Users, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase, type AppFeature } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'

const AVAILABLE_FEATURES: { key: AppFeature; label: string; desc: string }[] = [
  { key: 'fs_module', label: 'Feasibility Study (FS)', desc: 'Modul utama analisa kelayakan proyek properti.' },
  { key: 'cost_control', label: 'Cost Control & RAB', desc: 'Modul pelacakan anggaran dan Kurva S.' },
  { key: 'ai_solver', label: 'AI Target Profit Solver', desc: 'Fitur optimasi harga otomatis berbasis AI.' },
  { key: 'pdf_export', label: 'PDF Report Export', desc: 'Kemampuan ekspor hasil analisa ke PDF.' },
  { key: 'scurve', label: 'Kurva S Visualization', desc: 'Visualisasi grafik progres pembangunan.' },
  { key: 'dashboard_admin', label: 'Admin Dashboard', desc: 'Akses ke panel admin ini.' },
]

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState<any | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (data) setUsers(data)
  }

  async function updateUserFlag(userId: string, key: AppFeature, val: boolean) {
    const user = users.find(u => u.id === userId)
    if (!user) return

    const nextFeatures = { ...(user.custom_features || {}), [key]: val }
    
    const { error } = await supabase
      .from('profiles')
      .update({ custom_features: nextFeatures })
      .eq('id', userId)
    
    if (!error) {
      setUsers(users.map(u => u.id === userId ? { ...u, custom_features: nextFeatures } : u))
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, custom_features: nextFeatures })
      }
      toast({ title: `Akses fitur pengguna diperbarui`, variant: 'default' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
           <h1 className="text-2xl font-serif font-bold text-navy">Manajemen Perusahaan & Pengguna</h1>
           <p className="text-sm text-muted-foreground mt-1">Daftar pengguna yang mendaftar dan kontrol akses bypass fitur.</p>
        </div>
      </div>

      <div className="bg-card border border-border shadow-sm rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
           <div className="relative flex-1 max-w-sm">
              <Users className="h-5 w-5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input className="pl-10 h-10 w-full bg-muted border-none rounded-xl text-sm focus:ring-2 focus:ring-gold focus:outline-none" placeholder="Cari perusahaan atau nama..." />
           </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left border-b border-border">
                <th className="px-4 py-3 font-medium">Perusahaan & Pendaftar</th>
                <th className="px-4 py-3 font-medium">Kontak (WhatsApp/Email)</th>
                <th className="px-4 py-3 font-medium text-center">Role</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-4">
                    <div className="font-bold text-navy">{u.company || '-'}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{u.full_name || 'Tanpa Nama'}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-medium">{u.phone || '-'}</div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide inline-flex items-center gap-1 ${u.role === 'superadmin' ? 'bg-gold/20 text-yellow-800' : 'bg-slate-100 text-slate-600'}`}>
                      {u.role === 'superadmin' && <ShieldAlert className="h-3 w-3" />}
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Button variant="outline" size="sm" onClick={() => setSelectedUser(u)} className="hover:bg-navy hover:text-white border-navy/20">Akses Bypass</Button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                   <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground italic">Memuat pengguna dari database...</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Access Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-serif font-bold text-navy mb-1">{selectedUser.company || selectedUser.full_name}</h3>
            <p className="text-sm text-muted-foreground mb-6">Bypass: Aktifkan fitur khusus untuk perusahaan ini yang mengabaikan setting paket umum berlangganan mereka.</p>
            
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
              {AVAILABLE_FEATURES.map(f => (
                <label key={f.key} className="flex items-start gap-4 p-4 rounded-xl border border-border border-b-2 hover:border-gold cursor-pointer transition-all">
                  <div className="pt-0.5">
                     <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${selectedUser.custom_features?.[f.key] ? 'border-gold bg-gold' : 'border-muted-foreground/30'}`}>
                        {selectedUser.custom_features?.[f.key] && <CheckCircle2 className="h-3.5 w-3.5 text-navy" />}
                     </div>
                     <input 
                       type="checkbox" 
                       className="hidden"
                       checked={!!(selectedUser.custom_features && selectedUser.custom_features[f.key])}
                       onChange={(e) => updateUserFlag(selectedUser.id, f.key, e.target.checked)}
                     />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-navy">{f.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{f.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            
            <div className="mt-8 flex gap-3">
               <Button className="flex-1 bg-navy text-white hover:bg-navy/90 h-11 text-base shadow-lg shadow-navy/20" onClick={() => setSelectedUser(null)}>
                 Selesai & Tutup
               </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
