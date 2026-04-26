import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts'
import { Building2 } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { formatRupiah, formatRupiahAxis, formatPct } from '@/engine/formatter'
import { calcBagiHasil } from '@/engine/calculator'
import StatusBadge from '@/components/shared/StatusBadge'
import type { FSResults } from '@/types/fs.types'

interface Props { results: FSResults }

const CARD_STYLES = [
  { bg: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200', header: 'bg-blue-600', val: 'text-blue-700' },
  { bg: 'bg-green-50 dark:bg-green-950/30 border-green-200', header: 'bg-green-700', val: 'text-green-700' },
  { bg: 'bg-red-50 dark:bg-red-950/30 border-red-200', header: 'bg-red-700', val: 'text-red-700' },
]

export default function TabBagiHasil({ results: r }: Props) {
  const [sliderPct, setSliderPct] = useState(30)

  const sliderResult = calcBagiHasil(r.grossRevenue, r.grossProfit, r.totalPotongan, sliderPct, 'A')

  const chartData = (r?.bagiHasil || []).map(bh => ({
    name: `Skenario ${bh.skenarioId}\n(${bh.pctPemilik}% pemilik)`,
    'Net Developer': Math.max(bh.netDevProfit, 0),
    'Bagi Pemilik': bh.nilaiPemilik,
    'Potongan': r.totalPotongan,
  }))

  // Minimum harga jual agar dev ≥ target margin
  const totalUnit = r.totalUnit || 1
  const calcMinHarga = (targetMargin: number) => {
    const pctPemilik    = sliderPct / 100
    const pctPotongan   = r.totalPotongan / r.grossRevenue
    const faktor        = 1 - pctPemilik - pctPotongan - (targetMargin / 100)
    if (faktor <= 0) return Infinity
    return (r.totalInvestment / faktor) / totalUnit
  }

  const isMilikSendiri = (r?.bagiHasil || []).length === 1 && (r?.bagiHasil || [])[0].pctPemilik === 0

  if (isMilikSendiri) {
    return (
      <div className="space-y-6">
        <div className="bg-muted/40 p-8 rounded-2xl text-center space-y-4 border border-border">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-navy/10 text-navy mb-2">
            <Building2 className="h-8 w-8" />
          </div>
          <h3 className="font-serif text-2xl font-bold">Lahan Milik Sendiri</h3>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto leading-relaxed">
            Skenario pengerjaan ini menggunakan lahan milik sendiri oleh pihak developer. 
            <strong>100% margin keuntungan</strong> menjadi hak dari Developer tanpa adanya pembagian porsi dengan pihak lain.
          </p>
          <div className="flex justify-center pt-4">
            <div className="bg-background border-2 border-green-500/20 rounded-xl p-5 w-full max-w-md shadow-sm">
              <Row label="Net Profit (100% Developer)" value={formatRupiah(r.netProfit, true)} highlight="text-green-700 text-2xl mt-1 block" />
              <div className="mt-4 pt-3 border-t border-border flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Net Margin</span>
                <span className="font-mono font-bold text-lg">{formatPct(r.netMargin)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 3 skenario cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(r?.bagiHasil || []).map((bh, i) => {
          const style = CARD_STYLES[i]
          return (
            <div key={bh.skenarioId} className={`rounded-xl border-2 overflow-hidden ${style.bg}`}>
              <div className={`${style.header} text-white px-4 py-3`}>
                <div className="font-bold">Skenario {bh.skenarioId}</div>
                <div className="text-sm opacity-90">{bh.pctPemilik}% → pemilik lahan</div>
              </div>
              <div className="p-4 space-y-3">
                <Row label="Nilai Bagi Pemilik" value={formatRupiah(bh.nilaiPemilik, true)} />
                <Row label="Net Developer" value={formatRupiah(bh.netDevProfit, true)} />
                <Row label="Net Margin Dev" value={formatPct(bh.netDevMargin)} highlight={style.val} />
                <div className="pt-1">
                  <StatusBadge status={bh.status} size="sm" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bar chart perbandingan */}
      <div>
        <h3 className="section-title text-sm">Perbandingan Net Profit Developer (3 Skenario)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={v => formatRupiahAxis(v)} tick={{ fontSize: 10 }} width={90} />
            <Tooltip formatter={(v: number) => [formatRupiah(v, true)]} />
            <Legend />
            <Bar dataKey="Net Developer" fill="#1B5E20" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Bagi Pemilik" fill="#C9A84C" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Potongan" fill="#B71C1C" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Interactive slider */}
      <div className="bg-muted/30 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="section-title text-sm mb-0">Simulasi Interaktif</h3>
          <span className="font-mono font-bold text-lg text-navy dark:text-gold">{sliderPct}% → pemilik</span>
        </div>

        <Slider
          min={5}
          max={60}
          step={1}
          value={[sliderPct]}
          onValueChange={([v]) => setSliderPct(v)}
          className="my-2"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>5% (minimal)</span>
          <span>60% (maksimal)</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
          <SliderCard label="Bagi Pemilik" value={formatRupiah(sliderResult.nilaiPemilik, true)} color="text-yellow-700" />
          <SliderCard label="Net Developer" value={formatRupiah(sliderResult.netDevProfit, true)} color={sliderResult.netDevProfit >= 0 ? 'text-green-700' : 'text-red-700'} />
          <SliderCard label="Net Margin" value={formatPct(sliderResult.netDevMargin)} color={sliderResult.netDevMargin >= 20 ? 'text-green-700' : 'text-red-700'} />
          <div className="bg-background rounded-xl p-3 border border-border text-center">
            <div className="text-xs text-muted-foreground mb-1">Status</div>
            <StatusBadge status={sliderResult.status} size="sm" />
          </div>
        </div>
      </div>

      {/* Minimum harga jual */}
      <div>
        <h3 className="section-title text-sm">Minimum Harga Jual per Unit</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Agar developer mendapat target margin tertentu (asumsi {sliderPct}% bagi hasil)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[15, 20, 25, 30].map(targetMargin => {
            const minHarga = calcMinHarga(targetMargin)
            const feasible = isFinite(minHarga) && minHarga > 0
            return (
              <div key={targetMargin} className={`rounded-xl p-4 border ${feasible ? 'border-border bg-muted/20' : 'border-red-200 bg-red-50'}`}>
                <div className="text-sm text-muted-foreground">Target Margin {targetMargin}%</div>
                <div className={`font-mono font-bold text-base mt-1 ${feasible ? 'text-foreground' : 'text-red-600'}`}>
                  {feasible ? `${formatRupiah(minHarga, true)}/unit` : 'Tidak Tercapai'}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-mono font-semibold text-sm ${highlight ?? ''}`}>{value}</span>
    </div>
  )
}

function SliderCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-background rounded-xl p-3 border border-border text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-mono font-bold text-sm mt-1 ${color}`}>{value}</div>
    </div>
  )
}
