// ============================================================
// PropFS — Biaya pokok tower apartemen (halaman Biaya Pembangunan)
//
// HPP apartemen = (GFA × biaya tower/m² + luas podium × biaya podium/m²)
//                 ÷ luas jual (NSA).
//
// Dulu tower ditampilkan dengan isian rumah tapak: "Biaya Konstruksi
// (Rp/m²)", "LB: 0 m² | 0 unit", dan "Rp 0/unit" di setiap fase. Isian itu
// tidak dibaca perhitungan apartemen sama sekali, sementara biaya tower &
// podium yang SEBENARNYA dipakai tidak punya isian di mana pun. Angka yang
// diketik pemakai diabaikan tanpa tanda.
//
// Di sini yang diisi adalah yang dihitung, dan HPP per m² yang ditampilkan
// berasal dari fungsi yang sama dengan yang dipakai halaman Harga Jual.
// ============================================================
import { AlertTriangle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import RupiahInput from '@/components/shared/RupiahInput'
import { formatRupiah } from '@/engine/formatter'
import { rincianBiayaTower, hppTowerFase, biayaKolomLamaTower } from '@/engine/biayaTower'
import type { TipeBangunan } from '@/types/fs.types'

const m2 = (n: number) => `${Math.round(n).toLocaleString('id-ID')} m²`

export default function BiayaTowerApartemen({ tipe, urutan, jumlahFase, onUbah }: {
  tipe: TipeBangunan
  urutan: number
  jumlahFase: number
  onUbah: (patch: Partial<TipeBangunan>) => void
}) {
  const r = rincianBiayaTower(tipe)
  const lama = biayaKolomLamaTower(tipe)

  return (
    <div data-biaya-tower className="border border-indigo-200 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h4 className="font-semibold text-sm">{tipe.nama || `Tower ${urutan + 1}`} <span className="text-xs font-normal text-indigo-700">· Apartemen</span></h4>
        <span className="text-xs text-muted-foreground">
          Luas jual {m2(r.nsa)} · GFA {m2(r.gfa)} · {r.unit} unit
        </span>
      </div>

      {/* Angka yang pernah diketik di kolom lama. Tidak dipindahkan diam-diam:
          bisa saja maksudnya per m² luas jual, bukan per m² GFA — pemakainya
          yang tahu. */}
      {lama > 0 && (
        <div data-kolom-lama className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
          <p className="flex items-start gap-1.5 text-xs text-amber-900">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Sebelumnya Anda mengisi <b>{formatRupiah(lama, true)}/m²</b> di kolom “Biaya Konstruksi” lama.
              Kolom itu <b>tidak dipakai</b> untuk apartemen — HPP dihitung dari biaya tower & podium di bawah,
              yang sekarang {formatRupiah(r.biayaTowerPerM2, true)}/m².
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" data-pakai-kolom-lama
              onClick={() => onUbah({ biayaKonstruksiTowerPerM2: lama, biayaKonstruksiPerM2: 0 })}
              className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white">
              Pakai {formatRupiah(lama, true)} sebagai biaya tower
            </Button>
            <Button type="button" size="sm" variant="outline" data-abaikan-kolom-lama
              onClick={() => onUbah({ biayaKonstruksiPerM2: 0 })}
              className="h-8 text-xs">
              Abaikan
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Biaya Konstruksi Tower (Rp/m² GFA)</Label>
          <RupiahInput value={r.biayaTowerPerM2}
            onChange={v => onUbah({ biayaKonstruksiTowerPerM2: v })} />
          <p className="text-[10px] text-muted-foreground leading-snug">
            Dikalikan GFA {m2(r.gfa)} = luas jual ÷ efisiensi {r.efisiensi}% (efisiensi diatur di Tipe Bangunan).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Biaya Podium & Parkiran (Rp/m²)</Label>
          <RupiahInput value={r.biayaPodiumPerM2}
            onChange={v => onUbah({ biayaKonstruksiPodiumPerM2: v })} />
          <p className="text-[10px] text-muted-foreground leading-snug">
            {r.luasPodium > 0
              ? `Dikalikan luas podium & parkiran ${m2(r.luasPodium)}.`
              : 'Luas podium & parkiran masih 0 m² — isi di Tipe Bangunan bila ada.'}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Kenaikan Biaya per Fase (%)</Label>
          <div className="relative">
            <input type="number" value={tipe.kenaikanBiayaPerFase}
              onChange={e => onUbah({ kenaikanBiayaPerFase: parseFloat(e.target.value) || 0 })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 pr-8 text-sm font-mono focus:ring-2 focus:ring-green-400 focus:outline-none"
              min={0} max={30} step={0.5} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 p-3 space-y-1 text-xs">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Biaya tower ({m2(r.gfa)} × {formatRupiah(r.biayaTowerPerM2, true)})</span>
          <span className="font-mono shrink-0">{formatRupiah(r.biayaTower, true)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Biaya podium ({m2(r.luasPodium)} × {formatRupiah(r.biayaPodiumPerM2, true)})</span>
          <span className="font-mono shrink-0">{formatRupiah(r.biayaPodium, true)}</span>
        </div>
        <div className="flex justify-between gap-3 border-t border-indigo-100 pt-1 font-semibold">
          <span>Total biaya pokok tower</span>
          <span className="font-mono shrink-0">{formatRupiah(r.total, true)}</span>
        </div>
        <div data-hpp-tower className="flex justify-between gap-3 font-bold text-indigo-900">
          <span>HPP / m² luas jual <span className="font-normal text-[10px]">(dipakai di Harga Jual)</span></span>
          <span className="font-mono shrink-0">{formatRupiah(r.hppPerM2, true)}</span>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {Array.from({ length: jumlahFase }, (_, f) => (
          <div key={f} className="bg-muted/40 rounded-lg px-3 py-1.5 text-center min-w-[110px]">
            <div className="text-xs text-muted-foreground">Fase {f + 1}</div>
            <div className="font-mono text-xs font-semibold mt-0.5">
              {formatRupiah(hppTowerFase(tipe, f + 1), true)}/m²
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
