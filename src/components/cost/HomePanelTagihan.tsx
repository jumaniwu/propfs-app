import { useEffect, useMemo, useState } from 'react'
import { ReceiptText, AlertTriangle, ChevronRight } from 'lucide-react'
import { procurementApi, type BarisInvoice } from '@/lib/procurementApi'
import type { PurchaseOrder } from '@/lib/procurement'
import { bandingkanDenganPo } from '@/lib/invoiceVendor'
import { can, type TeamRole } from '@/lib/teamRoles'

const fmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`

/**
 * Tagihan vendor yang menunggu diperiksa, di halaman depan.
 *
 * Notifikasi saja tidak cukup: lonceng dibaca sekali lalu ditandai terbaca,
 * dan setelah itu tagihan yang belum diputuskan tidak terlihat di mana pun
 * sampai vendornya menelepon. Panel ini menampilkan KEADAAN, bukan kejadian —
 * ia tetap ada selama masih ada yang tertunda, dan hilang sendiri begitu
 * semuanya sudah diputuskan.
 */
export default function HomePanelTagihan({ role, onBuka }: {
  role: TeamRole
  onBuka: () => void
}) {
  const [invoices, setInvoices] = useState<BarisInvoice[]>([])
  const [pos, setPos] = useState<PurchaseOrder[]>([])

  // Hanya yang berhak memutuskan pembayaran yang perlu melihatnya. Bagi yang
  // lain ia cuma angka yang tidak bisa ditindaklanjuti.
  const bolehLihat = can(role, 'procurement', 'baca')

  useEffect(() => {
    if (!bolehLihat) return
    let hidup = true
    Promise.all([
      procurementApi().listInvoice().catch(() => [] as BarisInvoice[]),
      procurementApi().listPo().catch(() => [] as PurchaseOrder[]),
    ]).then(([inv, p]) => {
      if (!hidup) return
      setInvoices(inv); setPos(p)
    })
    return () => { hidup = false }
  }, [bolehLihat])

  const tertunda = useMemo(
    () => invoices.filter(v => v.status !== 'disetujui' && v.status !== 'ditolak' && v.status !== 'dibayar'),
    [invoices],
  )
  const poById = useMemo(() => new Map(pos.map(p => [p.id, p])), [pos])
  const berselisih = useMemo(
    () => tertunda.filter(v => {
      const po = poById.get(v.po_id)
      return po ? bandingkanDenganPo(v, po.items, po.total).length > 0 : false
    }).length,
    [tertunda, poById],
  )
  const nilai = tertunda.reduce((s, v) => s + (Number(v.total) || 0), 0)

  if (!bolehLihat || tertunda.length === 0) return null

  return (
    <button data-panel-tagihan onClick={onBuka}
      className="w-full text-left rounded-2xl bg-white border border-border p-4 hover:border-gold/50
        transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 grid place-items-center shrink-0">
          <ReceiptText className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-navy text-sm">
            {tertunda.length} tagihan vendor menunggu diperiksa
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            Senilai {fmt(nilai)} · dari {new Set(tertunda.map(v => v.vendor_nama)).size} vendor
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>

      {/* Yang berselisih disebut terpisah. Sepuluh tagihan yang semuanya cocok
          adalah pekerjaan sepuluh menit; satu yang berselisih adalah keputusan
          yang perlu dipikirkan, dan angka gabungan menyembunyikan bedanya. */}
      {berselisih > 0 && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] font-bold text-amber-800
          bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {berselisih} di antaranya berbeda dengan PO-nya.
        </p>
      )}
    </button>
  )
}
