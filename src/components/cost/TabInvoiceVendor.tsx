import { useMemo, useState } from 'react'
import {
  ReceiptText, AlertTriangle, CheckCircle2, XCircle, Loader2, ChevronDown, Paperclip,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { procurementApi, type BarisInvoice } from '@/lib/procurementApi'
import type { PurchaseOrder } from '@/lib/procurement'
import {
  bandingkanDenganPo, LABEL_STATUS_INVOICE, TONE_STATUS_INVOICE, statusDariSelisih,
  type StatusInvoice,
} from '@/lib/invoiceVendor'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`
const tgl = (s?: string | null) => {
  if (!s) return '-'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? String(s)
    : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Tagihan yang dikirim vendor lewat tautannya.
 *
 * Yang dikerjakan tab ini bukan sekadar menampilkan daftar — itu bisa
 * dilakukan tabel apa pun. Yang berarti di sini adalah SELISIH terhadap PO:
 * tagihan yang jumlahnya persis sama bisa diteruskan tanpa dibaca satu per
 * satu, dan yang berbeda harus berhenti di meja orang. Tanpa penanda itu
 * keduanya terlihat sama, dan satu-satunya pengaman adalah ketelitian orang
 * yang sedang buru-buru.
 */
export default function TabInvoiceVendor({ invoices, pos, bolehUbah, namaSaya, onUbah }: {
  invoices: BarisInvoice[]
  pos: PurchaseOrder[]
  bolehUbah: boolean
  namaSaya: string
  onUbah: () => void
}) {
  const poById = useMemo(() => new Map(pos.map(p => [p.id, p])), [pos])

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-border p-8 text-center space-y-2">
        <ReceiptText className="w-8 h-8 text-muted-foreground mx-auto" />
        <p className="font-bold text-navy text-sm">Belum ada tagihan masuk</p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Tautan kirim tagihan ikut otomatis di pesan WhatsApp setiap kali sebuah PO dikirim.
          Vendor cukup memotret invoicenya — kolomnya terisi sendiri, lalu masuk ke sini.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {invoices.map(inv => (
        <KartuInvoice key={inv.id} inv={inv} po={poById.get(inv.po_id) ?? null}
          bolehUbah={bolehUbah} namaSaya={namaSaya} onUbah={onUbah} />
      ))}
    </div>
  )
}

function KartuInvoice({ inv, po, bolehUbah, namaSaya, onUbah }: {
  inv: BarisInvoice
  po: PurchaseOrder | null
  bolehUbah: boolean
  namaSaya: string
  onUbah: () => void
}) {
  const { toast } = useToast()
  const [buka, setBuka] = useState(false)
  const [proses, setProses] = useState(false)

  // Dihitung ulang di sini, bukan dibaca dari kolom status.
  //
  // Status tersimpan menjawab "sudah diputuskan apa"; selisih menjawab "apa
  // yang berbeda". Menyimpan selisih akan membuatnya basi begitu PO-nya
  // disunting, dan selisih basi lebih buruk daripada tidak ada — ia meyakinkan
  // orang bahwa sudah diperiksa padahal yang diperiksa keadaan yang lama.
  const selisih = useMemo(
    () => (po ? bandingkanDenganPo(inv, po.items, po.total) : []),
    [inv, po],
  )
  const status: StatusInvoice = inv.status === 'masuk' && po ? statusDariSelisih(selisih) : inv.status

  async function putuskan(baru: StatusInvoice) {
    setProses(true)
    try {
      await procurementApi().updateInvoice(inv.id, {
        status: baru,
        diperiksa_oleh: namaSaya,
        diperiksa_at: new Date().toISOString(),
      })
      toast({ title: baru === 'disetujui' ? 'Tagihan disetujui' : 'Tagihan ditolak' })
      onUbah()
    } catch (e) {
      toast({
        title: 'Gagal menyimpan',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally { setProses(false) }
  }

  return (
    <div data-invoice-kartu className="bg-white rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-navy text-sm truncate">
            {inv.nomor_invoice || '(tanpa nomor)'}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {inv.vendor_nama} · untuk {inv.po_nomor} · {tgl(inv.tanggal)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${TONE_STATUS_INVOICE[status]}`}>
            {LABEL_STATUS_INVOICE[status]}
          </span>
          <p className="font-bold text-navy text-sm mt-1">{fmt(inv.total)}</p>
        </div>
      </div>

      {/* Selisihnya ditaruh di muka, bukan disembunyikan di balik "lihat
          rincian". Inilah satu-satunya hal pada kartu ini yang menuntut
          keputusan; menyembunyikannya berarti ia terlewat. */}
      {selisih.length > 0 && (
        <div data-invoice-selisih className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
            <AlertTriangle className="w-3.5 h-3.5" /> Berbeda dengan PO
          </p>
          {selisih.map((s, i) => (
            <p key={i} className="text-[11px] text-amber-900 leading-relaxed">• {s.pesan}</p>
          ))}
        </div>
      )}
      {selisih.length === 0 && po && (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" /> Cocok dengan {po.nomor}.
        </p>
      )}
      {!po && (
        <p className="text-[11px] text-muted-foreground">
          PO-nya tidak ditemukan lagi, jadi tagihannya tidak bisa dibandingkan.
        </p>
      )}

      <button onClick={() => setBuka(v => !v)}
        className="flex items-center gap-1 text-[11px] font-bold text-navy">
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${buka ? 'rotate-180' : ''}`} />
        {buka ? 'Tutup rincian' : `Lihat ${inv.items?.length ?? 0} baris`}
      </button>

      {buka && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-[11px]">
              <thead className="bg-navy/5 text-navy">
                <tr>
                  <th className="px-2 py-1.5 text-left font-bold">Barang</th>
                  <th className="px-2 py-1.5 text-right font-bold">Qty</th>
                  <th className="px-2 py-1.5 text-right font-bold">Harga</th>
                  <th className="px-2 py-1.5 text-right font-bold">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(inv.items ?? []).map((it, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">{it.nama}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                      {it.qty} {it.satuan}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmt(it.harga)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmt(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>Subtotal: <b className="text-navy">{fmt(inv.subtotal)}</b></span>
            <span>PPN: <b className="text-navy">{fmt(inv.ppn)}</b></span>
            <span>Jatuh tempo: <b className="text-navy">{tgl(inv.jatuh_tempo)}</b></span>
            <span>Dikirim: <b className="text-navy">{inv.dikirim_oleh || '-'}</b></span>
          </div>
          {inv.catatan && (
            <p className="text-[11px] text-muted-foreground">Catatan vendor: {inv.catatan}</p>
          )}
          {inv.berkas_nama && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Paperclip className="w-3 h-3" /> {inv.berkas_nama} tersimpan bersama tagihannya.
            </p>
          )}
          {inv.diperiksa_oleh && (
            <p className="text-[11px] text-muted-foreground">
              Diperiksa {inv.diperiksa_oleh} · {tgl(inv.diperiksa_at)}
            </p>
          )}
        </div>
      )}

      {bolehUbah && inv.status !== 'disetujui' && inv.status !== 'ditolak' && inv.status !== 'dibayar' && (
        <div className="flex gap-2 pt-1">
          <Button data-setujui-invoice onClick={() => void putuskan('disetujui')} disabled={proses}
            variant="gold" className="h-8 text-xs font-bold gap-1.5">
            {proses ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Setujui untuk dibayar
          </Button>
          <Button onClick={() => void putuskan('ditolak')} disabled={proses}
            variant="outline" className="h-8 text-xs font-bold gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> Tolak
          </Button>
        </div>
      )}
    </div>
  )
}
