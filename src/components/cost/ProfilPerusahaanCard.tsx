// ============================================================
// Profil Perusahaan — nama PT, logo, dan kontak yang dipakai di SEMUA
// laporan Kontraktor AI. Bila diisi, identitas PropFS tidak lagi dicetak.
// ============================================================
import { useEffect, useRef, useState } from 'react'
import { Building2, Upload, Trash2, Loader2, Save, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { downscaleImage } from '@/lib/imageUtil'
import {
  brandingApi, getBrandingCache, identitasLaporan,
  PROFIL_KOSONG, type CompanyProfile,
} from '@/lib/branding'

export default function ProfilPerusahaanCard() {
  const { toast } = useToast()
  const [p, setP] = useState<CompanyProfile>(() => getBrandingCache())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyLogo, setBusyLogo] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const merek = identitasLaporan(p)

  useEffect(() => {
    brandingApi().load()
      .then(setP)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  const set = <K extends keyof CompanyProfile>(k: K, v: CompanyProfile[K]) =>
    setP(prev => ({ ...prev, [k]: v }))

  async function pilihLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusyLogo(true); setError('')
    try {
      // dikecilkan agar muat disimpan & cepat dicetak di PDF
      const kecil = await downscaleImage(file, 400, 0.9)
      set('logo', kecil)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setBusyLogo(false) }
  }

  async function simpan() {
    if (p.nama.trim().length < 2) { setError('Nama perusahaan wajib diisi.'); return }
    setSaving(true); setError('')
    try {
      await brandingApi().save({ ...p, nama: p.nama.trim() })
      toast({
        title: '✅ Profil perusahaan tersimpan',
        description: 'Semua laporan mulai sekarang memakai nama & logo perusahaan Anda.',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <div>
        <h3 className="font-bold text-navy text-sm flex items-center gap-2">
          <Building2 className="w-4 h-4" /> Profil Perusahaan (Kop Laporan)
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Nama dan logo di bawah ini dipakai pada <b>semua laporan</b> — Excel, SPK PDF, laporan
          proyek, dan halaman yang dibagikan ke pekerja/owner. Setelah diisi, identitas PropFS
          tidak lagi muncul di laporan Anda.
        </p>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Logo */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
              {p.logo
                ? <img src={p.logo} alt="Logo perusahaan" className="w-full h-full object-contain" />
                : <Building2 className="w-7 h-7 text-muted-foreground/40" />}
            </div>
            <div className="space-y-1.5">
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={busyLogo}
                  onClick={() => fileRef.current?.click()}>
                  {busyLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {p.logo ? 'Ganti Logo' : 'Unggah Logo'}
                </Button>
                {p.logo && (
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-red-600"
                    onClick={() => set('logo', '')}>
                    <Trash2 className="w-3.5 h-3.5" /> Hapus
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                PNG/JPG, sebaiknya berlatar transparan atau putih. Otomatis dikecilkan.
              </p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pilihLogo} />
          </div>

          {/* Identitas */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Nama Perusahaan / PT *</Label>
              <Input value={p.nama} onChange={e => set('nama', e.target.value)}
                placeholder="mis. PT Karya Utama Konstruksi" className="text-sm" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Alamat</Label>
              <Input value={p.alamat} onChange={e => set('alamat', e.target.value)}
                placeholder="mis. Jl. Merdeka No. 1, Bekasi" className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telepon</Label>
              <Input value={p.telepon} onChange={e => set('telepon', e.target.value)}
                placeholder="mis. 021-1234567" className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input value={p.email} onChange={e => set('email', e.target.value)}
                placeholder="mis. admin@perusahaan.co.id" className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Website</Label>
              <Input value={p.website} onChange={e => set('website', e.target.value)}
                placeholder="mis. perusahaan.co.id" className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">NPWP</Label>
              <Input value={p.npwp} onChange={e => set('npwp', e.target.value)}
                placeholder="mis. 01.234.567.8-901.000" className="text-sm" />
            </div>
          </div>

          {/* Pratinjau kop */}
          <div className="rounded-xl border border-border overflow-hidden">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground px-3 pt-2.5">
              Pratinjau kop laporan
            </p>
            <div className="bg-navy text-white px-4 py-3 flex items-center gap-3 mt-2">
              {merek.logo
                ? <img src={merek.logo} alt="" className="w-10 h-10 object-contain bg-white/10 rounded" />
                : <div className="w-10 h-10 rounded bg-gold text-navy font-black flex items-center justify-center">
                    {merek.nama.charAt(0)}
                  </div>}
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{merek.nama}</p>
                <p className="text-white/60 text-[10px] truncate">{merek.kontak || '—'}</p>
              </div>
            </div>
            {merek.bawaan && (
              <p className="text-[11px] text-amber-700 bg-amber-50 px-3 py-2">
                Profil belum diisi — laporan masih memakai identitas PropFS.
              </p>
            )}
          </div>

          {/* Setiap dokumen dicetak bersih atas nama perusahaan pemakainya.
              Tidak ada lagi penanda "Versi Gratis": sistem ini hanya bisa
              dipakai setelah berlangganan, jadi tidak ada versi lain untuk
              dibedakan — dan menempelkan iklan pada surat orang, di hadapan
              konsumen dan pemasoknya, tidak pernah pantas. */}
          <div className="rounded-xl p-3 flex items-start gap-2.5 bg-emerald-50
            border border-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <b className="text-emerald-800">Dokumen bersih:</b> seluruh laporan, SPK, PO,
              dan kwitansi dicetak atas nama perusahaan Anda, tanpa watermark apa pun.
            </p>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
            {error} — pastikan migrasi <code>migration_company_profile.sql</code> sudah dijalankan.
          </p>}

          <Button className="gap-2 font-bold bg-navy hover:bg-navy/90" disabled={saving} onClick={simpan}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Profil Perusahaan
          </Button>
        </>
      )}
    </div>
  )
}
