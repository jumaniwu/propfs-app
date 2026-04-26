import { useState } from 'react'
import { X, FolderPlus, Building2, MapPin, User, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCostStore } from '@/store/costStore'
import { v4 as uuidv4 } from 'uuid'

interface Props {
  onClose: () => void
  onCreated: () => void
}

export default function CreateProjectModal({ onClose, onCreated }: Props) {
  const { initProject } = useCostStore()
  const [form, setForm] = useState({
    projectName: '',
    location: '',
    owner: '',
    startDate: new Date().toISOString().split('T')[0],
    targetDuration: '12',
    type: 'residential',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.projectName.trim()) return

    initProject({
      id: uuidv4(),
      projectName: form.projectName,
      location: form.location,
      owner: form.owner,
      startDate: form.startDate,
      targetDurationMonths: Number(form.targetDuration),
      type: form.type,
    })
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center">
              <FolderPlus className="h-5 w-5 text-navy" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-xl">Buat Proyek Baru</h2>
              <p className="text-sm text-muted-foreground">Isi informasi dasar proyek konstruksi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5">
          {/* Nama Proyek */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              <Building2 className="inline h-3.5 w-3.5 mr-1 text-navy" />
              Nama Proyek <span className="text-red-500">*</span>
            </label>
            <input
              name="projectName"
              value={form.projectName}
              onChange={handleChange}
              placeholder="cth: Proyek Hunian Griya Asri - Blok A"
              required
              className="w-full px-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
            />
          </div>

          {/* Lokasi & Owner */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                <MapPin className="inline h-3.5 w-3.5 mr-1 text-navy" />
                Lokasi Proyek
              </label>
              <input
                name="location"
                value={form.location}
                onChange={handleChange}
                placeholder="cth: Tangerang Selatan"
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                <User className="inline h-3.5 w-3.5 mr-1 text-navy" />
                Nama Owner
              </label>
              <input
                name="owner"
                value={form.owner}
                onChange={handleChange}
                placeholder="cth: PT Griya Nusantara"
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
              />
            </div>
          </div>

          {/* Tanggal Mulai & Durasi */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                <CalendarDays className="inline h-3.5 w-3.5 mr-1 text-navy" />
                Tanggal Mulai
              </label>
              <input
                type="date"
                name="startDate"
                value={form.startDate}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Target Durasi</label>
              <select
                name="targetDuration"
                value={form.targetDuration}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
              >
                {[3,6,9,12,18,24,36,48,60].map(m => (
                  <option key={m} value={m}>{m} Bulan</option>
                ))}
              </select>
            </div>
          </div>

          {/* Jenis Proyek */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Jenis Proyek</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'residential', label: '🏠 Residensial' },
                { value: 'commercial', label: '🏢 Komersial' },
                { value: 'infrastructure', label: '🛣️ Infrastruktur' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, type: opt.value }))}
                  className={[
                    'px-3 py-2 rounded-xl text-sm font-medium border transition-colors',
                    form.type === opt.value
                      ? 'bg-navy text-white border-navy'
                      : 'border-border hover:bg-muted/50',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Batal
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-navy hover:bg-navy/90 text-white gap-2"
              disabled={!form.projectName.trim()}
            >
              <FolderPlus className="h-4 w-4" /> Buat & Lanjut Upload RAB
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
