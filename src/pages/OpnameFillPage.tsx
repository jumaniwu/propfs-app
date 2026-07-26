// Halaman PUBLIK (tanpa login): tukang/mandor membuka link form opname,
// mengisi volume realisasi pekerjaan, lalu mengirim.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { KopPublik, KakiPublik, useBrandingPublik } from '@/components/KopPublik'
import { Loader2, CheckCircle2, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import NumInput from '@/components/siteplan/NumInput'
import { spkApi, type OpnameDoc } from '@/lib/spkApi'
import { progresOpname, type OpnameItem } from '@/lib/akuntan'

type OpnameView = Omit<OpnameDoc, 'id' | 'fill_token'>

export default function OpnameFillPage() {
  const { token = '' } = useParams()
  const merek = useBrandingPublik(token)
  const [form, setForm] = useState<OpnameView | null>(null)
  const [items, setItems] = useState<OpnameItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    spkApi().getOpnameByToken(token)
      .then(d => {
        setForm(d)
        if (d) setItems(d.items.map(i => ({ ...i })))
        else setError('Form opname tidak ditemukan. Periksa kembali link Anda.')
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [token])

  const setItem = (idx: number, patch: Partial<OpnameItem>) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))

  async function handleSubmit() {
    if (name.trim().length < 2) return
    setSubmitting(true)
    setError('')
    try {
      const ok = await spkApi().fillOpnameByToken(token, items, name.trim())
      if (!ok) throw new Error('Form sudah dikunci/disetujui, atau link tidak berlaku.')
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const progres = progresOpname(items)
  const terkunci = form?.status === 'disetujui'

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-3">
      <div className="max-w-2xl mx-auto space-y-4">
        <KopPublik profil={merek} subjudul="Opname Lapangan" />

        {loading && (
          <div className="bg-white rounded-2xl p-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat form…
          </div>
        )}

        {!loading && !form && (
          <div className="bg-white rounded-2xl p-8 text-center text-sm text-red-600">{error || 'Form tidak ditemukan.'}</div>
        )}

        {form && (
          <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="bg-navy text-white px-6 py-5">
              <p className="font-serif font-bold text-lg flex items-center gap-2">
                <ClipboardList className="w-5 h-5" /> {form.judul}
              </p>
              <p className="text-white/80 text-xs mt-1">
                {form.project_name && <>Proyek: {form.project_name} · </>}Tanggal: {form.tanggal}
                {form.petugas && <> · Petugas: {form.petugas}</>}
              </p>
            </div>

            <div className="p-4 sm:p-6 space-y-4 text-sm">
              {done || form.status !== 'terbuka' ? (
                <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center space-y-1">
                  <p className="flex items-center justify-center gap-2 font-bold text-emerald-700">
                    <CheckCircle2 className="w-5 h-5" /> {terkunci ? 'OPNAME TELAH DISETUJUI' : 'OPNAME TELAH DIKIRIM'}
                  </p>
                  {(form.filled_by || done) && (
                    <p className="text-xs text-muted-foreground">
                      Diisi oleh: {done ? name : form.filled_by} · Progres {progres.toFixed(1)}%
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs bg-blue-lt border border-blue-200 rounded-xl p-3">
                  Isi <span className="font-bold">volume realisasi</span> tiap pekerjaan sesuai kondisi lapangan,
                  lalu tulis nama Anda dan kirim.
                </p>
              )}

              <div className="space-y-3">
                {items.map((it, i) => {
                  const pct = it.vol_rencana > 0 ? Math.min(100, (it.vol_realisasi / it.vol_rencana) * 100) : 0
                  return (
                    <div key={i} className="rounded-xl border border-border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-navy text-sm">{i + 1}. {it.uraian}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-navy/10 text-navy shrink-0">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs items-end">
                        <div>
                          <p className="text-muted-foreground mb-1">Rencana: {it.vol_rencana.toLocaleString('id-ID')} {it.satuan}</p>
                          <div className="w-full bg-muted rounded-full h-1.5">
                            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Realisasi ({it.satuan})</p>
                          <NumInput
                            value={it.vol_realisasi}
                            onValue={n => setItem(i, { vol_realisasi: n })}
                            min={0}
                            disabled={done || form.status !== 'terbuka'}
                          />
                        </div>
                      </div>
                      <input
                        value={it.catatan ?? ''}
                        onChange={e => setItem(i, { catatan: e.target.value })}
                        disabled={done || form.status !== 'terbuka'}
                        placeholder="Catatan lapangan (opsional)"
                        className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                      />
                    </div>
                  )
                })}
              </div>

              {!done && form.status === 'terbuka' && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between text-xs font-bold text-navy">
                    <span>Progres keseluruhan</span><span>{progres.toFixed(1)}%</span>
                  </div>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Nama pengisi (tukang/mandor)"
                    className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {error && <p className="text-xs text-red-600">{error}</p>}
                  <Button
                    className="w-full h-12 font-bold bg-navy hover:bg-navy/90"
                    disabled={name.trim().length < 2 || submitting}
                    onClick={handleSubmit}
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kirim Hasil Opname'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-[10px] text-muted-foreground">
          Dokumen digital ini diterbitkan melalui propfs.id · Kontraktor AI
        </p>
      </div>
    </div>
  )
}
