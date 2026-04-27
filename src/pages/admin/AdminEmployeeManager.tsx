import { useState } from 'react'
import { Plus, UserPlus, Mail, Shield, Trash2, Search, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'

interface Employee {
  id: string
  name: string
  email: string
  role: 'admin' | 'staff'
  joinedAt: string
}

export default function AdminEmployeeManager() {
  const [employees, setEmployees] = useState<Employee[]>([
    { id: '1', name: 'Jumani Wu', email: 'jumani.wu@gmail.com', role: 'admin', joinedAt: '2026-04-20' },
    { id: '2', name: 'Staff Support', email: 'support@propfs.id', role: 'staff', joinedAt: '2026-04-21' }
  ])

  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'staff'>('staff')

  function handleAdd() {
    if (!newName || !newEmail) return
    const newEmp: Employee = {
      id: Math.random().toString(),
      name: newName,
      email: newEmail,
      role: newRole,
      joinedAt: new Date().toISOString().split('T')[0]
    }
    setEmployees([...employees, newEmp])
    setShowAdd(false)
    setNewName('')
    setNewEmail('')
    toast({ title: 'Karyawan Berhasil Ditambahkan', description: 'Silakan minta karyawan melakukan pendaftaran dengan email tersebut.' })
  }

  function removeEmployee(id: string) {
    setEmployees(employees.filter(e => e.id !== id))
    toast({ title: 'Akses Dicabut', description: 'Akun karyawan telah dinonaktifkan.' })
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 sticky top-0 bg-slate-50/90 backdrop-blur-xl pt-4 pb-6 z-10 border-b border-navy/5">
        <div className="space-y-1">
          <h2 className="font-serif text-3xl font-black text-navy tracking-tight">Manajemen Tim & Admin</h2>
          <p className="text-sm text-slate-500 font-medium">Tambahkan akun admin atau staff tambahan untuk membantu operasional PropFS.</p>
        </div>
        <Button className="w-full md:w-auto gap-3 h-14 px-10 text-lg font-black bg-navy text-white shadow-2xl active:scale-95 transition-all rounded-2xl" onClick={() => setShowAdd(true)}>
          <UserPlus className="h-6 w-6" /> TAMBAH ADMIN
        </Button>
      </div>

      {showAdd && (
        <div className="bg-white border-2 border-gold/30 rounded-[32px] p-6 sm:p-10 shadow-2xl animate-in zoom-in-95 duration-300">
          <h3 className="text-xl font-black text-navy mb-6 flex items-center gap-2">
            <Plus className="text-gold" /> Konfigurasi Akses Baru
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Nama Lengkap</label>
              <div className="relative">
                <Shield className="absolute left-4 top-4 h-5 w-5 text-slate-400" />
                <Input className="pl-12 h-14 bg-slate-50 border-none rounded-2xl font-bold" placeholder="Contoh: Rian Pratama" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Email Resmi</label>
              <div className="relative">
                <Mail className="absolute left-4 top-4 h-5 w-5 text-slate-400" />
                <Input className="pl-12 h-14 bg-slate-50 border-none rounded-2xl font-bold" placeholder="staff@propfs.id" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Level Akses</label>
              <select className="w-full h-14 bg-slate-50 border-none rounded-2xl font-bold px-4" value={newRole} onChange={e => setNewRole(e.target.value as any)}>
                <option value="staff">Staff (Limited)</option>
                <option value="admin">Full Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-4">
             <Button variant="outline" className="h-14 rounded-2xl px-10 font-bold" onClick={() => setShowAdd(false)}>BATAL</Button>
             <Button className="h-14 rounded-2xl px-10 bg-gold text-navy font-black shadow-xl" onClick={handleAdd}>KONFIRMASI & TAMBAH</Button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex flex-col sm:flex-row gap-4 items-center justify-between">
           <div className="relative w-full sm:w-96">
              <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
              <Input className="pl-12 rounded-xl bg-white border-slate-200" placeholder="Cari nama atau email..." />
           </div>
           <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{employees.length} Total Personil</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-50">
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400">Profil</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400">Level</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400">Tgl Bergabung</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50/30 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-navy/5 text-navy flex items-center justify-center font-black">
                        {emp.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-black text-navy">{emp.name}</p>
                        <p className="text-xs text-slate-400 font-medium">{emp.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${emp.role === 'admin' ? 'bg-gold/10 text-gold border border-gold/20' : 'bg-slate-100 text-slate-500'}`}>
                      <UserCheck className="w-3 h-3" /> {emp.role}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-sm font-bold text-slate-500">{emp.joinedAt}</td>
                  <td className="px-8 py-6 text-right">
                    <button className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all" onClick={() => removeEmployee(emp.id)}>
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
