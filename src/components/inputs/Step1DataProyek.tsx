import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, MapPin, User, Calendar, Layers, Image as ImageIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { FSInputs } from '@/types/fs.types'
import { useAuthStore } from '@/store/authStore'

const schema = z.object({
  namaProyek:    z.string().min(2, 'Nama proyek minimal 2 karakter'),
  alamatLokasi:  z.string().min(5, 'Alamat minimal 5 karakter'),
  namaDeveloper: z.string().min(2, 'Nama developer minimal 2 karakter'),
  tahunMulai:    z.number().min(2020).max(2050),
  jumlahFase:    z.number().min(1).max(6),
  durasiPerFase: z.number().min(6, 'Durasi minimal 6 bulan').max(120, 'Durasi maksimal 120 bulan'),
  jenisProyek:   z.enum(['perumahan', 'ruko', 'mixed']),
})

type FormData = z.infer<typeof schema>

interface Props {
  inputs: FSInputs
  onChange: (partial: Partial<FSInputs>) => void
}

const FieldWrapper = ({ label, error, children, hint }: {
  label: string; error?: string; children: React.ReactNode; hint?: string
}) => (
  <div className="space-y-1.5">
    <Label className="text-sm font-medium">{label}</Label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
)

export default function Step1DataProyek({ inputs, onChange }: Props) {

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      namaProyek:    inputs.namaProyek,
      alamatLokasi:  inputs.alamatLokasi,
      namaDeveloper: inputs.namaDeveloper,
      tahunMulai:    inputs.tahunMulai,
      jumlahFase:    inputs.jumlahFase,
      durasiPerFase: inputs.durasiPerFase,
      jenisProyek:   inputs.jenisProyek,
    },
  })

  const profile = useAuthStore(s => s.profile)
  
  const watchAll = watch()

  // Auto-fill company from profile if field is empty
  useEffect(() => {
    const currentVal = watchAll.namaDeveloper
    if (!currentVal && profile?.company) {
      setValue('namaDeveloper', profile.company)
      onChange({ namaDeveloper: profile.company })
    }
  }, [profile?.company])

  useEffect(() => {
    const sub = watch((values) => {
      onChange(values as Partial<FSInputs>)
    })
    return () => sub.unsubscribe()
  }, [watch, onChange])

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = reader.result as string
        onChange({ logoUrl: base64 })
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Nama Proyek */}
        <FieldWrapper label="Nama Proyek *" error={errors.namaProyek?.message}>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              {...register('namaProyek')}
              className="pl-9 focus-visible:ring-green-400"
              placeholder="Contoh: Grand Residence Boulevard"
            />
          </div>
        </FieldWrapper>

        {/* Nama Developer */}
        <FieldWrapper label="Nama Developer / Perusahaan *" error={errors.namaDeveloper?.message}>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              {...register('namaDeveloper')}
              className="pl-9 focus-visible:ring-green-400"
              placeholder="Contoh: PT. Cipta Properti Nusantara"
            />
          </div>
        </FieldWrapper>

        {/* Logo Developer */}
        <FieldWrapper label="Logo Perusahaan / Developer">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="pl-9 file:mr-4 file:py-1.5 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-gold file:text-navy hover:file:bg-gold/80"
              />
            </div>
            {inputs.logoUrl && (
              <div className="h-10 w-10 shrink-0 rounded-md border border-border overflow-hidden bg-white/50">
                <img src={inputs.logoUrl} alt="Logo" className="w-full h-full object-contain" />
              </div>
            )}
          </div>
        </FieldWrapper>

        {/* Alamat */}
        <FieldWrapper label="Alamat / Lokasi *" error={errors.alamatLokasi?.message}>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              {...register('alamatLokasi')}
              className="pl-9 focus-visible:ring-green-400"
              placeholder="Contoh: Jakarta Selatan, DKI Jakarta"
            />
          </div>
        </FieldWrapper>

        {/* Tahun Mulai */}
        <FieldWrapper label="Tahun Mulai *" error={errors.tahunMulai?.message}>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              {...register('tahunMulai', { valueAsNumber: true })}
              type="number"
              className="pl-9 focus-visible:ring-green-400"
              min={2020}
              max={2050}
            />
          </div>
        </FieldWrapper>

        {/* Jenis Proyek */}
        <FieldWrapper label="Jenis Proyek *">
          <Select
            defaultValue={inputs.jenisProyek}
            onValueChange={(v) => {
              setValue('jenisProyek', v as 'perumahan' | 'ruko' | 'mixed')
              onChange({ jenisProyek: v as 'perumahan' | 'ruko' | 'mixed' })
            }}
          >
            <SelectTrigger className="focus:ring-green-400">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="perumahan">🏘 Perumahan Landed</SelectItem>
              <SelectItem value="ruko">🏢 Ruko Komersial</SelectItem>
              <SelectItem value="mixed">🏗 Mixed-Use</SelectItem>
            </SelectContent>
          </Select>
        </FieldWrapper>

        {/* Jumlah Fase */}
        <FieldWrapper
          label="Jumlah Fase"
          hint="Berapa fase pembangunan? (1–6)"
          error={errors.jumlahFase?.message}
        >
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setValue('jumlahFase', n)
                  onChange({ jumlahFase: n })
                }}
                className={`w-10 h-10 rounded-lg border-2 text-sm font-semibold transition-all ${
                  watchAll.jumlahFase === n
                    ? 'border-gold bg-gold text-navy'
                    : 'border-input bg-background hover:border-gold/60'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </FieldWrapper>

        {/* Durasi per Fase */}
        <FieldWrapper
          label="Durasi per Fase (bulan)"
          hint="Berapa bulan setiap fase berlangsung?"
          error={errors.durasiPerFase?.message}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                {...register('durasiPerFase', { valueAsNumber: true })}
                type="number"
                className="pl-9 focus-visible:ring-green-400"
                min={6}
                max={120}
              />
            </div>
            <div className="text-sm text-muted-foreground whitespace-nowrap">
              = {((watchAll.durasiPerFase || 24) * (watchAll.jumlahFase || 3) / 12).toFixed(1)} tahun total
            </div>
          </div>
        </FieldWrapper>
      </div>

      {/* Preview summary */}
      {watchAll.namaProyek && (
        <div className="bg-navy/5 dark:bg-navy/30 rounded-xl p-4 border border-navy/10">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Preview Proyek</p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Durasi Total:</span>
              <div className="font-semibold">{(watchAll.durasiPerFase || 24) * (watchAll.jumlahFase || 3)} bulan</div>
            </div>
            <div>
              <span className="text-muted-foreground">Fase:</span>
              <div className="font-semibold">{watchAll.jumlahFase || 3} fase × {watchAll.durasiPerFase || 24} bln</div>
            </div>
            <div>
              <span className="text-muted-foreground">Selesai ~</span>
              <div className="font-semibold">
                {(watchAll.tahunMulai || new Date().getFullYear()) + Math.ceil(((watchAll.durasiPerFase || 24) * (watchAll.jumlahFase || 3)) / 12)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
