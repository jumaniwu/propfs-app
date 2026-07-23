// ============================================================
// Tab SPK — Kontraktor AI
// Buat Surat Perintah Kerja untuk vendor/pemborong, kirim link
// tanda tangan digital via WhatsApp/Email, pantau status, cetak PDF.
// ============================================================
import { useEffect, useState } from 'react'
import {
  FileSignature, Plus, Trash2, Link2, Loader2, RefreshCw, Send,
  Mail, FileDown, CheckCircle2, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import NumInput from '@/components/siteplan/NumInput'
import { useCostStore } from '@/store/costStore'
import { useToast } from '@/hooks/use-toast'
import {
  spkApi, spkSignLink, waShareLink, nomorSpkOtomatis,
  type SpkDoc, type SpkLingkupItem, type SpkTermin,
} from '@/lib/spkApi'
import { downloadSpkPdf } from '@/lib/spkPdf'

const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

const STATUS_BADGE: Record<SpkDoc['status'], string> = {
  draft: 'bg-slate-100 text-slate-600',
  terkirim: 'bg-amber-100 text-amber-700',
  ditandatangani: 'bg-emerald-100 text-emerald-700',
}

export default function TabSPK() {
  const { toast } = useToast()
  const { projectInfo } = useCostStore()
  const [docs, setDocs] = useState<SpkDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  const load = () => {
    setLoading(true)
    setError('')
    spkApi().listSpk()
      .then(setDocs)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pesanWa = (spk: SpkDoc) => {
    const link = spkSignLink(spk.sign_token)
    return `Selamat siang Bapak/Ibu *${spk.vendor_name}*.\n\nKami menerbitkan Surat Perintah Kerja:\n📄 ${spk.nomor}${spk.project_name ? `\n🏗️ ${spk.project_name}` : ''}\n💰 Nilai: ${fmt(spk.nilai_kontrak)}\n\nMohon baca & tanda tangani secara digital lewat link berikut (buka dari HP, tanda tangan pakai jari):\n👉 ${link}\n\nTerima kasih.`
  }

  async function tandaiTerkirim(spk: SpkDoc) {
    if (spk.status === 'draft') {
      try { await spkApi().updateSpkStatus(spk.id, 'terkirim'); load() } catch { /* abaikan */ }
    }
  }

  const kirimWa = (spk: SpkDoc) => {
    const target = spk.vendor_wa
      ? waShareLink(spk.vendor_wa, pesanWa(spk))
      : `https://wa.me/?text=${encodeURIComponent(pesanWa(spk))}`
    window.open(target, '_blank')
    void tandaiTerkirim(spk)
  }

  async function kirimEmail(spk: SpkDoc) {
    try {
      await spkApi().sendSpkEmail(spk, spkSignLink(spk.sign_token))
      toast({ title: '✅ Email terkirim!', description: `Link tanda tangan dikirim ke ${spk.vendor_email}.` })
      void tandaiTerkirim(spk)
    } catch (e) {
      // fallback: buka aplikasi email dengan isi siap kirim
      const subject = `SPK ${spk.nomor} — mohon tanda tangan digital`
      window.open(`mailto:${spk.vendor_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(pesanWa(spk))}`)
      toast({
        title: 'Email otomatis gagal — dibuka lewat aplikasi email',
        description: e instanceof Error ? e.message : String(e),
      })
      void tandaiTerkirim(spk)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl md:text-2xl font-serif font-bold text-navy flex items-center gap-2">
          <FileSignature className="w-6 h-6" /> SPK — Surat Perintah Kerja
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat Ulang
          </Button>
          <Button size="sm" className="gap-1.5 bg-navy hover:bg-navy/90 font-bold" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" /> Buat SPK
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground max-w-2xl">
        Tunjuk vendor/pemborong → SPK dibuat otomatis → kirim link lewat WhatsApp/Email →
        vendor tanda tangan digital dari HP (tanpa login) → status berubah <b>Ditandatangani</b> dan PDF siap dicetak.
      </p>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
          {error} — pastikan migrasi SQL <code>migration_kontraktor_spk_opname.sql</code> sudah dijalankan di Supabase.
        </p>
      )}

      {loading ? (
        <div className="py-12 flex justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : docs.length === 0 && !error ? (
        <div className="py-12 text-center bg-white rounded-3xl border border-border">
          <FileSignature className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm text-muted-foreground">Belum ada SPK. Klik "Buat SPK" untuk menunjuk vendor pertama.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {docs.map(spk => (
            <div key={spk.id} className="bg-white rounded-2xl border border-border p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-navy text-sm truncate">{spk.nomor}</p>
                  <p className="text-xs text-muted-foreground truncate">👷 {spk.vendor_name}{spk.project_name && <> · 🏗️ {spk.project_name}</>}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 flex items-center gap-1 ${STATUS_BADGE[spk.status]}`}>
                  {spk.status === 'ditandatangani' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  {spk.status}
                </span>
              </div>
              <p className="text-base font-black text-navy">{fmt(spk.nilai_kontrak)}</p>
              {spk.status === 'ditandatangani' && spk.signed_name && (
                <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1">
                  ✅ Ditandatangani {spk.signed_name} · {spk.signed_at ? new Date(spk.signed_at).toLocaleString('id-ID') : ''}
                </p>
              )}
              <div className="flex gap-1.5 flex-wrap">
                <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => kirimWa(spk)}>
                  <Send className="w-3 h-3" /> WhatsApp
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                  disabled={!spk.vendor_email} onClick={() => kirimEmail(spk)}>
                  <Mail className="w-3 h-3" /> Email
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                  onClick={() => {
                    navigator.clipboard?.writeText(spkSignLink(spk.sign_token))
                    toast({ title: 'Link tanda tangan disalin!' })
                    void tandaiTerkirim(spk)
                  }}>
                  <Link2 className="w-3 h-3" /> Salin Link
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => downloadSpkPdf(spk)}>
                  <FileDown className="w-3 h-3" /> PDF
                </Button>
                <button
                  onClick={async () => {
                    if (window.confirm(`Hapus SPK ${spk.nomor}?`)) { await spkApi().deleteSpk(spk.id); load() }
                  }}
                  className="h-7 px-2 text-muted-foreground hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateSpkDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => { setOpen(false); load() }}
        defaultProject={projectInfo?.projectName ?? ''}
        count={docs.length}
      />
    </div>
  )
}

// ── Dialog Buat SPK ─────────────────────────────────────────────────────────
function CreateSpkDialog({ open, onClose, onCreated, defaultProject, count }: {
  open: boolean
  onClose: () => void
  onCreated: () => void
  defaultProject: string
  count: number
}) {
  const { toast } = useToast()
  const [vendor, setVendor] = useState('')
  const [wa, setWa] = useState('')
  const [email, setEmail] = useState('')
  const [proyek, setProyek] = useState(defaultProject)
  const [tglMulai, setTglMulai] = useState(() => new Date().toISOString().slice(0, 10))
  const [durasi, setDurasi] = useState(30)
  const [denda, setDenda] = useState(1)
  const [catatan, setCatatan] = useState('')
  const [lingkup, setLingkup] = useState<SpkLingkupItem[]>([
    { uraian: '', volume: 1, satuan: 'ls', harga: 0 },
  ])
  const [termin, setTermin] = useState<SpkTermin[]>([
    { nama: 'DP', pct: 30 }, { nama: 'Progres 50%', pct: 40 }, { nama: 'Pelunasan (BAST)', pct: 30 },
  ])
  const [saving, setSaving] = useState(false)

  useEffect(() => { setProyek(defaultProject) }, [defaultProject])

  const setL = (i: number, patch: Partial<SpkLingkupItem>) =>
    setLingkup(prev => prev.map((it, j) => j === i ? { ...it, ...patch } : it))
  const setT = (i: number, patch: Partial<SpkTermin>) =>
    setTermin(prev => prev.map((it, j) => j === i ? { ...it, ...patch } : it))

  const nilai = lingkup.reduce((s, l) => s + l.volume * l.harga, 0)
  const totalPct = termin.reduce((s, t) => s + t.pct, 0)
  const validLingkup = lingkup.filter(l => l.uraian.trim() && l.harga > 0)

  async function handleCreate() {
    if (!vendor.trim() || validLingkup.length === 0) return
    setSaving(true)
    try {
      const doc = await spkApi().createSpk({
        nomor: nomorSpkOtomatis(count),
        project_name: proyek.trim(),
        vendor_name: vendor.trim(),
        vendor_email: email.trim(),
        vendor_wa: wa.trim(),
        lingkup: validLingkup,
        nilai_kontrak: validLingkup.reduce((s, l) => s + l.volume * l.harga, 0),
        termin,
        tgl_mulai: tglMulai,
        durasi_hari: durasi,
        denda_permil: denda,
        catatan: catatan.trim(),
      })
      toast({ title: `✅ ${doc.nomor} dibuat!`, description: 'Kirim link tanda tangan lewat tombol WhatsApp/Email.' })
      onCreated()
    } catch (e) {
      toast({ title: 'Gagal membuat SPK', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buat SPK Baru</DialogTitle>
          <DialogDescription>
            Nomor otomatis: <b>{nomorSpkOtomatis(count)}</b> — vendor menandatangani lewat link digital.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nama Vendor / Pemborong *</Label>
              <Input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="mis. CV Karya Mandiri" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Proyek</Label>
              <Input value={proyek} onChange={e => setProyek(e.target.value)} placeholder="Nama proyek" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">No. WhatsApp Vendor</Label>
              <Input value={wa} onChange={e => setWa(e.target.value)} placeholder="08xxxxxxxxxx" inputMode="tel" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email Vendor</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="vendor@email.com" type="email" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Lingkup Pekerjaan *</Label>
            {lingkup.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_64px_64px_110px_32px] gap-2 items-center">
                <Input value={l.uraian} onChange={e => setL(i, { uraian: e.target.value })}
                  placeholder={`Uraian pekerjaan ${i + 1}`} className="text-sm" />
                <NumInput value={l.volume} onValue={n => setL(i, { volume: n })} min={0} placeholder="vol" />
                <Input value={l.satuan} onChange={e => setL(i, { satuan: e.target.value })} placeholder="sat" className="text-sm" />
                <NumInput value={l.harga} onValue={n => setL(i, { harga: n })} min={0} placeholder="harga (Rp)" />
                <button onClick={() => setLingkup(prev => prev.filter((_, j) => j !== i))}
                  disabled={lingkup.length <= 1}
                  className="text-muted-foreground hover:text-red-600 disabled:opacity-30">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                onClick={() => setLingkup(prev => [...prev, { uraian: '', volume: 1, satuan: 'ls', harga: 0 }])}>
                <Plus className="w-3.5 h-3.5" /> Tambah Baris
              </Button>
              <p className="text-sm font-black text-navy">Nilai: {fmt(nilai)}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tanggal Mulai</Label>
              <Input type="date" value={tglMulai} onChange={e => setTglMulai(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Durasi (hari)</Label>
              <NumInput value={durasi} onValue={setDurasi} min={1} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Denda (permil/hari)</Label>
              <NumInput value={denda} onValue={setDenda} min={0} step={0.5} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Termin Pembayaran</Label>
              <span className={`text-[11px] font-bold ${totalPct === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                Total: {totalPct}% {totalPct !== 100 && '(harus 100%)'}
              </span>
            </div>
            {termin.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_32px] gap-2 items-center">
                <Input value={t.nama} onChange={e => setT(i, { nama: e.target.value })} className="text-sm" />
                <NumInput value={t.pct} onValue={n => setT(i, { pct: n })} min={0} max={100} placeholder="%" />
                <button onClick={() => setTermin(prev => prev.filter((_, j) => j !== i))}
                  disabled={termin.length <= 1}
                  className="text-muted-foreground hover:text-red-600 disabled:opacity-30">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1.5 text-xs"
              onClick={() => setTermin(prev => [...prev, { nama: `Termin ${prev.length + 1}`, pct: 0 }])}>
              <Plus className="w-3.5 h-3.5" /> Tambah Termin
            </Button>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Catatan Tambahan</Label>
            <Input value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="mis. material disediakan pemberi kerja" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button className="bg-navy hover:bg-navy/90 font-bold gap-2"
            disabled={saving || !vendor.trim() || validLingkup.length === 0 || totalPct !== 100}
            onClick={handleCreate}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileSignature className="w-4 h-4" /> Buat SPK</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
