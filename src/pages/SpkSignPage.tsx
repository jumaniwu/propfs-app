// Halaman PUBLIK (tanpa login): vendor membuka link, membaca SPK,
// lalu menandatangani secara digital.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, CheckCircle2, FileSignature } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SignaturePad from '@/components/cost/SignaturePad'
import { spkApi, type SpkDoc } from '@/lib/spkApi'

type SpkView = Omit<SpkDoc, 'id' | 'sign_token' | 'vendor_email' | 'vendor_wa'>

const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

export default function SpkSignPage() {
  const { token = '' } = useParams()
  const [spk, setSpk] = useState<SpkView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    spkApi().getSpkByToken(token)
      .then(d => { setSpk(d); if (!d) setError('SPK tidak ditemukan. Periksa kembali link Anda.') })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSign() {
    if (!signature || name.trim().length < 2) return
    setSubmitting(true)
    setError('')
    try {
      const ok = await spkApi().signSpkByToken(token, signature, name.trim())
      if (!ok) throw new Error('SPK sudah ditandatangani atau link tidak berlaku.')
      setDone(true)
      setSpk(s => s ? { ...s, status: 'ditandatangani', signed_name: name.trim(), signature_data: signature, signed_at: new Date().toISOString() } : s)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const sudahTtd = done || spk?.status === 'ditandatangani'

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-3">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center">
          <p className="font-serif font-bold text-xl text-navy">PropFS · Kontraktor AI</p>
          <p className="text-xs text-muted-foreground">Penandatanganan Surat Perintah Kerja Digital</p>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl p-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat SPK…
          </div>
        )}

        {!loading && !spk && (
          <div className="bg-white rounded-2xl p-8 text-center text-sm text-red-600">{error || 'SPK tidak ditemukan.'}</div>
        )}

        {spk && (
          <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
            {/* Kop dokumen */}
            <div className="bg-navy text-white px-6 py-5 text-center">
              <p className="font-serif font-bold text-lg tracking-wide">SURAT PERINTAH KERJA</p>
              <p className="text-white/80 text-sm mt-0.5">Nomor: {spk.nomor}</p>
            </div>

            <div className="p-5 sm:p-7 space-y-5 text-sm">
              <p>
                Dengan ini memberikan perintah kerja kepada <span className="font-bold">{spk.vendor_name}</span>
                {spk.project_name && <> untuk proyek <span className="font-bold">{spk.project_name}</span></>} dengan ketentuan berikut:
              </p>

              {/* Lingkup pekerjaan */}
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-navy text-white">
                    <tr>
                      <th className="px-3 py-2 text-left">No</th>
                      <th className="px-3 py-2 text-left">Uraian Pekerjaan</th>
                      <th className="px-3 py-2 text-right">Volume</th>
                      <th className="px-3 py-2 text-left">Satuan</th>
                      <th className="px-3 py-2 text-right">Harga (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {spk.lingkup.map((l, i) => (
                      <tr key={i} className={i % 2 ? 'bg-slate-50' : ''}>
                        <td className="px-3 py-2">{i + 1}</td>
                        <td className="px-3 py-2">{l.uraian}</td>
                        <td className="px-3 py-2 text-right">{l.volume.toLocaleString('id-ID')}</td>
                        <td className="px-3 py-2">{l.satuan}</td>
                        <td className="px-3 py-2 text-right">{l.harga.toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                    <tr className="bg-gold-lt/50 font-bold">
                      <td colSpan={4} className="px-3 py-2">NILAI KONTRAK</td>
                      <td className="px-3 py-2 text-right">{spk.nilai_kontrak.toLocaleString('id-ID')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-slate-50 p-3 space-y-1">
                  <p className="font-bold text-navy">Waktu Pelaksanaan</p>
                  <p>Mulai: {spk.tgl_mulai || '-'}</p>
                  <p>Durasi: {spk.durasi_hari} hari kalender</p>
                  <p>Denda keterlambatan: {spk.denda_permil}‰ per hari (maks 5%)</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 space-y-1">
                  <p className="font-bold text-navy">Termin Pembayaran</p>
                  {spk.termin.length === 0 && <p>-</p>}
                  {spk.termin.map((t, i) => (
                    <p key={i}>{t.nama}: {t.pct}% ({fmt((spk.nilai_kontrak * t.pct) / 100)})</p>
                  ))}
                </div>
              </div>

              {spk.catatan && (
                <p className="text-xs bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <span className="font-bold">Catatan:</span> {spk.catatan}
                </p>
              )}

              {/* Area tanda tangan */}
              {sudahTtd ? (
                <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center space-y-2">
                  <p className="flex items-center justify-center gap-2 font-bold text-emerald-700">
                    <CheckCircle2 className="w-5 h-5" /> SPK TELAH DITANDATANGANI
                  </p>
                  {spk.signature_data && (
                    <img src={spk.signature_data} alt="Tanda tangan" className="mx-auto max-h-28 bg-white rounded-lg border border-border" />
                  )}
                  <p className="text-sm font-bold text-navy">{spk.signed_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {spk.signed_at ? new Date(spk.signed_at).toLocaleString('id-ID') : ''}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-border p-4 space-y-3">
                  <p className="font-bold text-navy flex items-center gap-2">
                    <FileSignature className="w-4 h-4" /> Tanda Tangan Persetujuan
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Dengan menandatangani, Anda menyetujui seluruh ketentuan SPK di atas.
                    Tanda tangan digital ini tercatat beserta tanggal dan waktunya.
                  </p>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Nama lengkap penandatangan"
                    className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <SignaturePad onChange={setSignature} />
                  {error && <p className="text-xs text-red-600">{error}</p>}
                  <Button
                    className="w-full h-12 font-bold bg-navy hover:bg-navy/90"
                    disabled={!signature || name.trim().length < 2 || submitting}
                    onClick={handleSign}
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tandatangani SPK Sekarang'}
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
