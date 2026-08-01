// ============================================================
// Daftar periksa lintas modul — apa yang akan tercatat, dan di mana.
//
// Sengaja TIDAK dijalankan otomatis: satu nama barang bisa muncul di beberapa
// PO, dan bukti transfer bisa menempel ke tagihan yang salah. Yang ditebak
// sistem harus bisa dilihat dan diperbaiki manusia sebelum tersimpan.
//
// Dipakai bersama oleh tab Realisasi Biaya (di dalam workspace proyek) dan
// halaman Chat AI (bisa dibuka dari mana saja), supaya keduanya menampilkan
// dan menanyakan hal yang persis sama.
// ============================================================
import { Loader2, PackageCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ringkasCocok } from '@/lib/notaKePo'
import { LABEL_MODUL, type Rencana } from '@/lib/rencanaCatat'

const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

interface Props {
  rencana: Rencana
  /** Indeks PO terpilih untuk penerimaan barang. */
  pilihPo: number
  onPilihPo: (i: number) => void
  /** Indeks PO terpilih untuk tiap pembayaran, sejajar `rencana.pembayaran`. */
  pilihBayar: number[]
  onPilihBayar: (indexPembayaran: number, indexPo: number) => void
  menyimpan: boolean
  onCatat: () => void
  onLewati: () => void
}

export default function PanelRencana({
  rencana, pilihPo, onPilihPo, pilihBayar, onPilihBayar, menyimpan, onCatat, onLewati,
}: Props) {
  return (
    <div className="bg-emerald-50 border-t-2 border-emerald-300 p-4 space-y-3 max-h-[52vh] overflow-y-auto">
      <div className="flex items-start gap-2">
        <PackageCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
        <p className="text-xs font-bold text-emerald-900">
          Masukan ini menyentuh {rencana.langkah.length} modul
        </p>
      </div>

      <div className="bg-white rounded-xl border border-emerald-200 divide-y divide-emerald-100">
        {rencana.langkah.map(l => (
          <div key={l.modul} className="px-3 py-2 space-y-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-bold text-navy truncate min-w-0">{LABEL_MODUL[l.modul]}</span>
              <span className={`text-[10px] font-black shrink-0 rounded-full px-2 py-0.5 ${
                l.sudah ? 'bg-slate-100 text-slate-600' : 'bg-emerald-700 text-white'}`}>
                {l.sudah ? (l.turunan ? 'otomatis' : 'sudah dicatat') : 'akan dicatat'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">{l.rincian}</p>
            {l.catatan && <p className="text-[10px] text-amber-800">{l.catatan}</p>}
          </div>
        ))}
      </div>

      {/* Penerimaan barang: pilih PO-nya bila lebih dari satu cocok. */}
      {rencana.penerimaan.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-emerald-900">
            Barang datang dari — {ringkasCocok(rencana.penerimaan[pilihPo] ?? rencana.penerimaan[0])}
          </p>
          {rencana.penerimaan.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {rencana.penerimaan.map((c, i) => (
                <button key={c.po.id} onClick={() => onPilihPo(i)}
                  className={`text-[11px] font-bold rounded-full px-2.5 py-1 border transition-colors ${
                    i === pilihPo
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-100'}`}>
                  {c.po.nomor ?? 'PO'}
                </button>
              ))}
            </div>
          )}
          <div className="bg-white rounded-xl border border-emerald-200 divide-y divide-emerald-100">
            {(rencana.penerimaan[pilihPo] ?? rencana.penerimaan[0]).pasangan.map(p => (
              <div key={p.po.nama} className="flex items-baseline justify-between gap-2 px-3 py-1.5">
                <span className="text-xs font-semibold text-navy truncate min-w-0">{p.po.nama}</span>
                <span className="text-xs font-black text-emerald-800 shrink-0">
                  {p.qty.toLocaleString('id-ID')} {p.po.satuan}
                  {p.qty < (p.nota.qty || 0) && (
                    <span className="font-medium text-muted-foreground"> (nota {p.nota.qty.toLocaleString('id-ID')}, sisa PO {p.po.sisa.toLocaleString('id-ID')})</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          {(rencana.penerimaan[pilihPo] ?? rencana.penerimaan[0]).takCocok.length > 0 && (
            <p className="text-[11px] text-amber-800">
              Di luar PO ini: {(rencana.penerimaan[pilihPo] ?? rencana.penerimaan[0]).takCocok.map(b => b.nama).join(', ')}.
              Tetap tercatat sebagai biaya, tapi tidak masuk penerimaan.
            </p>
          )}
        </div>
      )}

      {/* Pembayaran: tiap bukti bayar menempel ke satu PO. */}
      {rencana.pembayaran.map((b, i) => (
        <div key={i} className="space-y-1.5">
          <p className="text-[11px] font-bold text-emerald-900">
            Pembayaran {fmt(b.usul.jumlah)}
            {b.usul.referensi ? ` · ${b.usul.referensi}` : ''} — untuk PO
          </p>
          {b.calon.length === 0 ? (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2">
              Tidak ada PO yang cocok dan masih punya sisa tagihan. Pembayaran ini
              dilewati — catat manual di Akuntan → Hutang Vendor bila perlu.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {b.calon.slice(0, 4).map((po, j) => (
                <button key={po.id} onClick={() => onPilihBayar(i, j)}
                  className={`text-[11px] font-bold rounded-full px-2.5 py-1 border transition-colors ${
                    j === (pilihBayar[i] ?? 0)
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-100'}`}>
                  {po.nomor ?? 'PO'} · sisa {fmt(po.sisa)}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="flex gap-2">
        <Button onClick={onCatat} disabled={menyimpan}
          className="flex-1 gap-2 bg-emerald-700 hover:bg-emerald-800 font-bold h-10 text-xs">
          {menyimpan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5" />}
          Catat ke Semua Modul
        </Button>
        <Button variant="outline" onClick={onLewati} disabled={menyimpan}
          className="h-10 text-xs font-bold">
          Lewati
        </Button>
      </div>
      <p className="text-[10px] text-emerald-800/70 leading-relaxed">
        Biaya sudah tercatat begitu AI menjawab. Yang menunggu di sini hanya yang
        menyentuh modul lain — karena di situlah tebakan bisa salah, dan lebih baik
        Anda yang memutuskan.
      </p>
    </div>
  )
}
