import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import RupiahInput from '@/components/shared/RupiahInput'
import { formatRupiah, formatPct } from '@/engine/formatter'
import type { FSInputs, MetodeBunga } from '@/types/fs.types'

interface Props {
  inputs: FSInputs
  onChange: (partial: Partial<FSInputs>) => void
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
    <h3 className="font-serif font-semibold text-navy dark:text-gold text-base">{children}</h3>
  </div>
)

const PctInput = ({ label, value, onChange, hint }: {
  label: string; value: number; onChange: (v: number) => void; hint?: string
}) => (
  <div className="flex items-center justify-between gap-4 py-2">
    <div>
      <Label className="text-sm">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
    <div className="relative w-28 shrink-0">
      <Input
        type="number"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        step={0.5}
        min={0}
        max={100}
        className="text-right pr-7 focus-visible:ring-green-400"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
    </div>
  </div>
)

export default function Step7PotongandanBagiHasil({ inputs, onChange }: Props) {
  const p  = inputs.potongan
  const pinjaman = p.riba
  const isKerjasama = inputs.lahan.statusKerjasama ?? true

  const updateP = (field: string, value: unknown) =>
    onChange({ potongan: { ...p, [field]: value } })

  const updatePinjaman = (field: string, value: unknown) =>
    onChange({ potongan: { ...p, riba: { ...(p.riba ?? { pokokPinjaman: 0, bungaPerTahun: 0, periodeBulan: 12, metode: 'flat' as MetodeBunga }), [field]: value } } })

  const updateSkenario = (id: 'A' | 'B' | 'C', pct: number) =>
    onChange({
      potongan: {
        ...p,
        skenarioBagiHasil: p.skenarioBagiHasil.map(s =>
          s.id === id ? { ...s, pctPemilik: pct } : s
        ),
      },
    })

  // Hitung total bunga preview
  const totalRibaPreview = (() => {
    if (!pinjaman || pinjaman.pokokPinjaman <= 0) return 0
    const { pokokPinjaman, bungaPerTahun, periodeBulan, metode } = pinjaman
    const bpb = bungaPerTahun / 12 / 100
    if (metode === 'flat') return pokokPinjaman * bpb * periodeBulan
    if (bpb <= 0) return 0
    const angsuran = pokokPinjaman * bpb / (1 - Math.pow(1 + bpb, -periodeBulan))
    return angsuran * periodeBulan - pokokPinjaman
  })()

  const SKENARIO_COLORS = ['bg-blue-50 border-blue-200 text-blue-800', 'bg-green-50 border-green-200 text-green-800', 'bg-red-50 border-red-200 text-red-800']

  return (
    <div className="space-y-8">

      {/* A. PPh Final */}
      <div>
        <SectionTitle>A. PPh Final</SectionTitle>
        <PctInput
          label="PPh Final"
          value={p.pphFinal}
          onChange={v => updateP('pphFinal', v)}
          hint="Pajak penghasilan atas penjualan properti"
        />
      </div>

      {/* B. Riba / Bunga Pinjaman */}
      <div>
        <SectionTitle>B. Riba / Bunga Pinjaman (Opsional)</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Pokok Pinjaman</Label>
            <RupiahInput
              value={pinjaman?.pokokPinjaman ?? 0}
              onChange={v => updatePinjaman('pokokPinjaman', v)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Bunga per Tahun (%)</Label>
            <div className="relative">
              <Input
                type="number"
                value={pinjaman?.bungaPerTahun ?? 0}
                onChange={e => updatePinjaman('bungaPerTahun', parseFloat(e.target.value) || 0)}
                step={0.5}
                className="pr-7 focus-visible:ring-green-400"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%/thn</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Periode (bulan)</Label>
            <Input
              type="number"
              value={pinjaman?.periodeBulan ?? 12}
              onChange={e => updatePinjaman('periodeBulan', parseInt(e.target.value) || 12)}
              min={1}
              className="focus-visible:ring-green-400"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Metode Bunga</Label>
            <div className="flex gap-2">
              {(['flat', 'anuitas', 'efektif'] as MetodeBunga[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => updatePinjaman('metode', m)}
                  className={`flex-1 py-2 rounded-md text-xs font-medium border capitalize transition-all ${
                    (pinjaman?.metode ?? 'flat') === m
                      ? 'bg-navy text-white border-navy'
                      : 'bg-background border-input hover:border-navy/40'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
        {totalRibaPreview > 0 && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 flex justify-between items-center">
            <span className="text-sm text-amber-800">Total Bunga ({pinjaman?.metode})</span>
            <span className="font-mono font-semibold text-amber-900">{formatRupiah(totalRibaPreview, true)}</span>
          </div>
        )}
      </div>

      {/* C. Fee Pemasaran */}
      <div>
        <SectionTitle>C. Fee Pemasaran</SectionTitle>
        <div className="divide-y divide-border/60">
          <PctInput
            label="Fee Penjualan Langsung"
            value={p.feePenjualanLangsung}
            onChange={v => updateP('feePenjualanLangsung', v)}
            hint="Komisi agen / marketing"
          />
          <PctInput
            label="Bonus Tutup Tahun"
            value={p.bonusTutupTahun}
            onChange={v => updateP('bonusTutupTahun', v)}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <span className="text-sm text-muted-foreground">
            Total fee marketing: <strong className="text-foreground">{(p.feePenjualanLangsung + p.bonusTutupTahun).toFixed(1)}%</strong> dari Gross Revenue
          </span>
        </div>
      </div>

      {/* D. Bagi Hasil */}
      {isKerjasama ? (
        <div>
          <SectionTitle>D. Bagi Hasil ke Pemilik Lahan</SectionTitle>
          <p className="text-xs text-muted-foreground mb-4">
            Bagi hasil dihitung dari <strong>Gross Revenue</strong> (bukan net profit).
            Atur 3 skenario untuk perbandingan side-by-side di halaman hasil.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {p.skenarioBagiHasil.map((sk, i) => (
              <div key={sk.id} className={`rounded-xl border-2 p-4 ${SKENARIO_COLORS[i]}`}>
                <div className="font-semibold text-sm mb-3">{sk.label}</div>
                <Label className="text-xs">% ke Pemilik Lahan</Label>
                <div className="relative mt-1">
                  <Input
                    type="number"
                    value={sk.pctPemilik}
                    onChange={e => updateSkenario(sk.id, parseFloat(e.target.value) || 0)}
                    min={0}
                    max={80}
                    step={5}
                    className="bg-white/60 pr-7"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold">%</span>
                </div>
                <p className="text-xs mt-2 opacity-80">
                  Developer: {(100 - sk.pctPemilik).toFixed(0)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <SectionTitle>D. Bagi Hasil (Lahan Milik Sendiri)</SectionTitle>
          <div className="bg-muted p-4 rounded-xl text-sm text-muted-foreground">
            Lahan diatur sebagai <strong>Milik Sendiri</strong> pada langkah ke-2. Karena lahan telah dimiliki Developer, tidak ada persentase bagi hasil. Seluruh profit (100%) menjadi milik Developer.
          </div>
        </div>
      )}

      {/* E. CSR & Lain-lain */}
      <div>
        <SectionTitle>E. CSR & Lain-lain</SectionTitle>
        <div className="flex items-center justify-between gap-4">
          <Label className="text-sm">CSR & Biaya Lain-lain (lump sum)</Label>
          <div className="w-52 shrink-0">
            <RupiahInput
              value={p.csrDanLainLain}
              onChange={v => updateP('csrDanLainLain', v)}
            />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-muted/30 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ringkasan Potongan</p>
        <SummaryRow label={`PPh Final ${p.pphFinal}%`} value={`${p.pphFinal}% × GR`} />
        <SummaryRow label={`Fee Marketing ${(p.feePenjualanLangsung + p.bonusTutupTahun).toFixed(1)}%`} value={`${(p.feePenjualanLangsung + p.bonusTutupTahun).toFixed(1)}% × GR`} />
        {totalRibaPreview > 0 && <SummaryRow label="Total Bunga Pinjaman" value={formatRupiah(totalRibaPreview, true)} />}
        {p.csrDanLainLain > 0 && <SummaryRow label="CSR & Lain-lain" value={formatRupiah(p.csrDanLainLain, true)} />}
        {isKerjasama ? (
          <div className="border-t border-border mt-2 pt-2">
            <SummaryRow
              label="Bagi Hasil (Skenario B)"
              value={`${p.skenarioBagiHasil.find(s => s.id === 'B')?.pctPemilik ?? 30}% × GR`}
              highlight
            />
          </div>
        ) : (
          <div className="border-t border-border mt-2 pt-2">
            <SummaryRow
              label="Hak Developer"
              value="100%"
              highlight
            />
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${highlight ? 'font-semibold' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}
