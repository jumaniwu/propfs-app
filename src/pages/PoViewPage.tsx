// ============================================================
// PURCHASE ORDER — TAMPILAN UNTUK VENDOR (publik, tanpa login)
// Inilah tujuan tautan WhatsApp: WhatsApp klik-untuk-chat tidak bisa
// melampirkan berkas, jadi vendor diarahkan ke halaman ini untuk melihat
// PO dan mengunduh PDF-nya.
//
// RPC po_get_by_token hanya mengembalikan PO berstatus terkirim/selesai,
// jadi draft dan PO yang belum disetujui tidak bocor walau tautannya tersebar.
// ============================================================
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Loader2, FileText, CheckCircle2 } from 'lucide-react'
import { procurementApi } from '@/lib/procurementApi'
import { downloadPoPdf } from '@/lib/poPdf'
import { teksTerm, type PurchaseOrder } from '@/lib/procurement'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`
const tglPanjang = (s?: string | null) => {
  if (!s) return '-'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? String(s)
    : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function PoViewPage() {
  const { token = '' } = useParams()
  const [po, setPo] = useState<PurchaseOrder | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    procurementApi().poByToken(token)
      .then(setPo)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setMemuat(false))
  }, [token])

  if (memuat) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!po) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center space-y-3 shadow-lg">
          <FileText className="w-12 h-12 mx-auto opacity-30" />
          <h1 className="font-serif text-xl font-bold text-navy">Pesanan Tidak Ditemukan</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {error || 'Tautan ini tidak dikenali, atau pesanannya belum dikirim. Silakan hubungi perusahaan yang mengirim tautan ini.'}
          </p>
        </div>
      </div>
    )
  }

  const items = po.items ?? []

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <div className="bg-navy text-white px-4 pt-8 pb-12">
        <div className="max-w-2xl mx-auto">
          <p className="text-gold text-[11px] font-black uppercase tracking-[0.2em]">Purchase Order</p>
          <h1 className="font-serif text-2xl font-bold mt-1">{po.nomor}</h1>
          <p className="text-white/70 text-xs mt-2">
            Untuk {po.vendor_nama || 'Vendor'} · {tglPanjang(po.tanggal)}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-6 space-y-4">
        <button onClick={() => downloadPoPdf(po)}
          className="w-full h-12 rounded-xl bg-gold text-navy font-black text-sm inline-flex items-center justify-center gap-2 hover:bg-gold/90">
          <Download className="w-4 h-4" /> UNDUH PDF
        </button>

        {/* ── Ringkasan pesanan ── */}
        <div className="bg-white rounded-2xl border border-border p-5 space-y-2.5">
          <h2 className="font-bold text-navy text-sm">Data Pesanan</h2>
          {([
            ['Nomor', po.nomor],
            ['Tanggal', tglPanjang(po.tanggal)],
            ['Dibutuhkan', tglPanjang(po.butuh_tanggal)],
            ['Pembayaran', teksTerm(po.term, po.term_hari)],
            ...(po.project_name ? [['Proyek', po.project_name]] : []),
          ] as Array<[string, string]>).map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs">
              <span className="text-muted-foreground w-28 shrink-0">{k}</span>
              <span className="font-semibold text-navy">{v}</span>
            </div>
          ))}
        </div>

        {/* ── Rincian barang ── */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <h2 className="font-bold text-navy text-sm p-5 pb-3">Rincian Barang ({items.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] min-w-[460px]">
              <thead className="bg-slate-50 text-muted-foreground">
                <tr>
                  <th className="text-left font-bold px-4 py-2">Barang</th>
                  <th className="text-right font-bold px-2 py-2">Qty</th>
                  <th className="text-left font-bold px-2 py-2">Satuan</th>
                  <th className="text-right font-bold px-2 py-2">Harga</th>
                  <th className="text-right font-bold px-4 py-2">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-4 py-2 font-semibold text-navy">{it.nama}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{it.qty}</td>
                    <td className="px-2 py-2">{it.satuan || '-'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt(it.harga)}</td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums">{fmt(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-border space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold text-navy tabular-nums">{fmt(po.subtotal)}</span>
            </div>
            {po.ppn_pct > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">PPN {po.ppn_pct}%</span>
                <span className="font-semibold text-navy tabular-nums">{fmt(po.ppn)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 border-t border-border">
              <span className="font-bold text-navy text-sm">TOTAL</span>
              <span className="font-black text-navy text-base tabular-nums">{fmt(po.total)}</span>
            </div>
          </div>
        </div>

        {po.catatan && (
          <div className="bg-white rounded-2xl border border-border p-5">
            <h2 className="font-bold text-navy text-sm mb-1.5">Catatan</h2>
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{po.catatan}</p>
          </div>
        )}

        {/* ── Bukti persetujuan ── */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <h2 className="font-bold text-navy text-sm mb-3">Disahkan Oleh</h2>
          <div className="grid grid-cols-2 gap-4">
            {([
              ['Dibuat oleh', po.pembuat_nama, po.pembuat_jabatan, po.pembuat_signature, po.pembuat_signed_at],
              ['Disetujui oleh', po.approver_nama, po.approver_jabatan, po.approver_signature, po.approver_signed_at],
            ] as Array<[string, string, string, string | null, string | null]>).map(([judul, nama, jabatan, tanda, kapan]) => (
              <div key={judul} className="text-center">
                <p className="text-[11px] text-muted-foreground">{judul}</p>
                <div className="h-16 flex items-center justify-center">
                  {tanda
                    ? <img src={tanda} alt={`Tanda tangan ${nama}`} className="max-h-16 object-contain" />
                    : <span className="text-[10px] text-muted-foreground">—</span>}
                </div>
                <p className="text-xs font-bold text-navy">{nama || '—'}</p>
                <p className="text-[10px] text-muted-foreground">{jabatan}</p>
                {kapan && (
                  <p className="text-[9px] text-emerald-700 font-semibold mt-0.5 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    {new Date(kapan).toLocaleString('id-ID')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          Dokumen digital · Dikelola dengan PropFS · Kontraktor AI
        </p>
      </div>
    </div>
  )
}
