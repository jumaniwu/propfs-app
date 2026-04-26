import { useMemo } from 'react'
import { Label } from '@/components/ui/label'
import RupiahInput from '@/components/shared/RupiahInput'
import { formatRupiah } from '@/engine/formatter'
import { calcBiayaPersiapan, calcBiayaOperasional } from '@/engine/calculator'
import type { FSInputs } from '@/types/fs.types'

interface Props {
  inputs: FSInputs
  onChange: (partial: Partial<FSInputs>) => void
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
    <h3 className="font-serif font-semibold text-navy dark:text-gold text-base">{children}</h3>
  </div>
)

const RowInput = ({ label, value, onChange, hint }: {
  label: string; value: number; onChange: (v: number) => void; hint?: string
}) => (
  <div className="flex items-center justify-between gap-4 py-2">
    <div className="min-w-0">
      <Label className="text-sm">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
    <div className="w-52 shrink-0">
      <RupiahInput value={value} onChange={onChange} />
    </div>
  </div>
)

const ToggleRowInput = ({ 
  label, valueLumsum, valuePerM2, gunakanPerM2, 
  onChangeLumsum, onChangePerM2, onToggle, 
  hint, luasMultiplier = 1, suffix = 'm²'
}: {
  label: string; valueLumsum: number; valuePerM2: number; gunakanPerM2: boolean;
  onChangeLumsum: (v: number) => void; onChangePerM2: (v: number) => void; onToggle: (perM2: boolean) => void;
  hint?: React.ReactNode; luasMultiplier?: number; suffix?: string;
}) => {
  const calculatedTotal = gunakanPerM2 ? (valuePerM2 * luasMultiplier) : valueLumsum;
  
  return (
    <div className="py-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <Label className="text-sm font-semibold">{label}</Label>
          {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground mb-1">Subtotal</div>
          <div className="font-mono font-bold text-navy dark:text-gold text-sm">{formatRupiah(calculatedTotal, true)}</div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/20 p-3 rounded-lg border border-border/50">
        <label className="flex items-start gap-3 cursor-pointer">
          <input 
            type="radio" name={`${label}-mode`}
            checked={gunakanPerM2} onChange={() => onToggle(true)}
            className="mt-1 outline-none text-green-600 focus:ring-green-400"
          />
          <div className="flex-1 space-y-1.5">
            <span className="text-sm font-medium">Berdasarkan Harga per {suffix}</span>
            <div className={!gunakanPerM2 ? "opacity-50 pointer-events-none" : ""}>
              <RupiahInput value={valuePerM2 || 0} onChange={onChangePerM2} />
            </div>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input 
            type="radio" name={`${label}-mode`}
            checked={!gunakanPerM2} onChange={() => onToggle(false)}
            className="mt-1 outline-none text-green-600 focus:ring-green-400"
          />
          <div className="flex-1 space-y-1.5">
            <span className="text-sm font-medium">Lumsum Biaya Penuh</span>
            <div className={gunakanPerM2 ? "opacity-50 pointer-events-none" : ""}>
              <RupiahInput value={valueLumsum} onChange={onChangeLumsum} />
            </div>
          </div>
        </label>
      </div>
    </div>
  )
}

export default function Step4BiayaPembangunan({ inputs, onChange }: Props) {
  const bp  = inputs.biayaPersiapan  || {} as any
  const bo  = inputs.biayaOperasional || {} as any

  const totalBiayaPersiapan   = useMemo(() => calcBiayaPersiapan(inputs), [inputs])
  const totalBiayaOperasional = useMemo(() => calcBiayaOperasional(inputs), [inputs])

  const totalBiayaBangun = useMemo(() => {
    let total = 0
    for (const tipe of inputs.tipeBangunan) {
      for (let fase = 1; fase <= inputs.jumlahFase; fase++) {
        const kenaikan    = Math.pow(1 + tipe.kenaikanBiayaPerFase / 100, fase - 1)
        const biayaPerUnit = tipe.biayaKonstruksiPerM2 * kenaikan * tipe.luasBangunan
        const unitTerjual  = inputs.penjualan.find(p => p.tipeId === tipe.id && p.fase === fase)?.unitTerjual ?? 0
        total += biayaPerUnit * (unitTerjual || tipe.jumlahUnit / inputs.jumlahFase)
      }
    }
    return total
  }, [inputs])

  const updateBP = (field: string, value: number | boolean) =>
    onChange({ biayaPersiapan: { ...bp, [field]: value } })

  const updateBO = (field: string, value: any) =>
    onChange({ biayaOperasional: { ...bo, [field]: value } })

  const updateBODetail = (parentField: 'biayaMarketingDetail' | 'biayaUmumDetail', field: string, value: any) => {
    onChange({ 
      biayaOperasional: { 
        ...bo, 
        [parentField]: { 
          ...(bo[parentField] as any), 
          [field]: value 
        } 
      } 
    })
  }

  const updateGaji = (role: string, field: 'org' | 'gaji', value: number) => {
    const prevGaji = bo.biayaUmumDetail.gaji
    
    if (role === 'lainLainGaji') {
      onChange({
        biayaOperasional: {
          ...bo,
          biayaUmumDetail: {
            ...bo.biayaUmumDetail,
            gaji: { ...prevGaji, lainLainGaji: value }
          }
        }
      })
      return
    }

    onChange({
      biayaOperasional: {
        ...bo,
        biayaUmumDetail: {
          ...bo.biayaUmumDetail,
          gaji: {
            ...prevGaji,
            [role]: {
              ...(prevGaji as any)[role],
              [field]: value
            }
          }
        }
      }
    })
  }

  const updateTipeBiaya = (tipeId: string, field: string, value: number) =>
    onChange({
      tipeBangunan: inputs.tipeBangunan.map(t =>
        t.id === tipeId ? { ...t, [field]: value } : t
      )
    })

  return (
    <div className="space-y-8">

      {/* A. Biaya Persiapan */}
      <div>
        <SectionTitle>A. Biaya Persiapan Proyek</SectionTitle>
        <div className="space-y-0 divide-y divide-border/60">
          <ToggleRowInput
            label="1. Harga Beli Lahan"
            valueLumsum={bp.hargaBeliLahan || 0}
            valuePerM2={bp.hargaBeliLahanPerM2 || 0}
            gunakanPerM2={!!bp.gunakanPerM2}
            onChangeLumsum={v => updateBP('hargaBeliLahan', v)}
            onChangePerM2={v => updateBP('hargaBeliLahanPerM2', v)}
            onToggle={v => updateBP('gunakanPerM2', v)}
            luasMultiplier={inputs.lahan?.luasLahanTotal || 0}
            hint={`Total Luas Lahan: ${(inputs.lahan?.luasLahanTotal || 0).toLocaleString('id-ID')} m²`}
          />
          <ToggleRowInput
            label="2. Biaya Perizinan & Legalitas Lahan"
            valueLumsum={bp.biayaPerizinan || 0}
            valuePerM2={bp.biayaPerizinanPerM2 || 0}
            gunakanPerM2={!!bp.gunakanPerizinanPerM2}
            onChangeLumsum={v => updateBP('biayaPerizinan', v)}
            onChangePerM2={v => updateBP('biayaPerizinanPerM2', v)}
            onToggle={v => updateBP('gunakanPerizinanPerM2', v)}
            luasMultiplier={inputs.lahan?.luasLahanTotal || 0}
            hint={`Dihitung per Total Luas Lahan (${(inputs.lahan?.luasLahanTotal || 0).toLocaleString('id-ID')} m²)`}
          />
          <ToggleRowInput
            label="3. Biaya Pengolahan Lahan"
            valueLumsum={bp.biayaPengolahanLahan || 0}
            valuePerM2={bp.biayaPengolahanPerM2 || 0}
            gunakanPerM2={!!bp.gunakanPengolahanPerM2}
            onChangeLumsum={v => updateBP('biayaPengolahanLahan', v)}
            onChangePerM2={v => updateBP('biayaPengolahanPerM2', v)}
            onToggle={v => updateBP('gunakanPengolahanPerM2', v)}
            luasMultiplier={inputs.lahan?.luasLahanTotal || 0}
            hint={`Dihitung per Total Luas Lahan (${(inputs.lahan?.luasLahanTotal || 0).toLocaleString('id-ID')} m²)`}
          />
          
          {(() => {
            // Infrastructure area calculation for UI
            const pctEfektif = inputs.lahan?.pctLahanEfektif ?? 0;
            const luasTotal  = inputs.lahan?.luasLahanTotal || 0;
            const luasEfektif = (luasTotal * pctEfektif) / 100;
            const luasInfrastruktur = luasTotal - luasEfektif;
            return (
              <ToggleRowInput
                label="4. Biaya Sarana & Prasarana"
                valueLumsum={bp.biayaSaranadanPrasarana || 0}
                valuePerM2={bp.biayaSarprasPerM2 || 0}
                gunakanPerM2={!!bp.gunakanSarprasPerM2}
                onChangeLumsum={v => updateBP('biayaSaranadanPrasarana', v)}
                onChangePerM2={v => updateBP('biayaSarprasPerM2', v)}
                onToggle={v => updateBP('gunakanSarprasPerM2', v)}
                luasMultiplier={luasInfrastruktur}
                hint={
                  <span>
                    Infrastruktur = Total Lahan ({luasTotal.toLocaleString()} m²)
                    - Lahan Efektif ({luasEfektif.toLocaleString()} m²)
                    <br/><strong className="text-navy dark:text-gold">= Luasan Infrastruktur {luasInfrastruktur.toLocaleString()} m²</strong>
                  </span>
                }
              />
            )
          })()}

          <ToggleRowInput
            label="5. Biaya Inventaris Proyek"
            valueLumsum={bp.biayaInventarisProyek || 0}
            valuePerM2={bp.biayaInventarisPerM2 || 0}
            gunakanPerM2={!!bp.gunakanInventarisPerM2}
            onChangeLumsum={v => updateBP('biayaInventarisProyek', v)}
            onChangePerM2={v => updateBP('biayaInventarisPerM2', v)}
            onToggle={v => updateBP('gunakanInventarisPerM2', v)}
            luasMultiplier={inputs.lahan?.luasLahanTotal || 0}
            hint={`Dihitung per Total Luas Lahan (${(inputs.lahan?.luasLahanTotal || 0).toLocaleString('id-ID')} m²)`}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <div className="bg-navy/5 dark:bg-navy/20 rounded-lg px-4 py-2.5 text-right">
            <div className="text-xs text-muted-foreground">Total Biaya Persiapan</div>
            <div className="font-mono font-bold text-navy dark:text-gold text-lg">
              {formatRupiah(totalBiayaPersiapan, true)}
            </div>
          </div>
        </div>
      </div>

      {/* B1. Biaya Pemasaran */}
      <div>
        <SectionTitle>B. Biaya Pemasaran</SectionTitle>
        <p className="text-sm text-muted-foreground mb-4">Biaya pemasaran adalah biaya yang diperlukan untuk kegiatan pemasaran dan penyediaan alat bantu pemasaran.</p>
        
        <div className="border border-border p-4 rounded-xl space-y-4">
          <div className="text-sm font-semibold mb-2">Biaya Pemasaran Anda:</div>
          
          <div className="space-y-3">
            {/* Mode 1 */}
            <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/30">
              <input 
                type="radio" 
                checked={bo.biayaMarketingMode === 'per_bulan'} 
                onChange={() => updateBO('biayaMarketingMode', 'per_bulan')}
                className="focus:ring-green-400"
              />
              <span className="flex-1 text-sm font-medium">LUMSUM BIAYA PER BULAN</span>
              <div className="w-48">
                <RupiahInput 
                  value={bo.biayaMarketingPerBulan} 
                  onChange={v => updateBO('biayaMarketingPerBulan', v)} 
                  disabled={bo.biayaMarketingMode !== 'per_bulan'} 
                />
              </div>
              <span className="text-xs text-muted-foreground w-10">/BLN</span>
            </label>

            {/* Mode 2 */}
            <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/30">
              <input 
                type="radio" 
                checked={bo.biayaMarketingMode === 'lumpsum_periode'} 
                onChange={() => updateBO('biayaMarketingMode', 'lumpsum_periode')}
                className="focus:ring-green-400"
              />
              <span className="flex-1 text-sm font-medium">LUMSUM BIAYA DALAM 1 PERIODE OPERASIONAL</span>
              <div className="w-48">
                <RupiahInput 
                  value={bo.biayaMarketingLumpsum} 
                  onChange={v => updateBO('biayaMarketingLumpsum', v)} 
                  disabled={bo.biayaMarketingMode !== 'lumpsum_periode'} 
                />
              </div>
              <span className="text-xs text-muted-foreground w-10"></span>
            </label>

            {/* Mode 3 */}
            <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/30">
              <input 
                type="radio" 
                checked={bo.biayaMarketingMode === 'detail_item'} 
                onChange={() => updateBO('biayaMarketingMode', 'detail_item')}
                className="focus:ring-green-400"
              />
              <span className="flex-1 text-sm font-medium">BERDASARKAN PERHITUNGAN DETAIL ITEM BIAYA PEMASARAN</span>
              <div className="w-48">
                <div className="h-10 px-3 bg-muted/40 rounded-md border border-input flex items-center text-sm font-mono opacity-80 cursor-not-allowed">
                  {formatRupiah(
                    Object.values(bo.biayaMarketingDetail || {}).reduce((s, v) => s + (Number(v)||0), 0), 
                    true
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground w-10"></span>
            </label>
          </div>

          {/* Expanded Detail Pemasaran */}
          {bo.biayaMarketingMode === 'detail_item' && bo.biayaMarketingDetail && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 pl-8">
              <div className="col-span-full text-xs text-muted-foreground mb-1 uppercase">Detail item biaya pemasaran:</div>
              <RowInput label="BROSUR & PAMFLET" value={bo.biayaMarketingDetail.brosur || 0} onChange={v => updateBODetail('biayaMarketingDetail', 'brosur', v)} />
              <RowInput label="SPANDUK & UMBUL-UMBUL" value={bo.biayaMarketingDetail.spanduk || 0} onChange={v => updateBODetail('biayaMarketingDetail', 'spanduk', v)} />
              <RowInput label="PAPAN REKLAME" value={bo.biayaMarketingDetail.papanReklame || 0} onChange={v => updateBODetail('biayaMarketingDetail', 'papanReklame', v)} />
              <RowInput label="SPONSOR & BRANDING" value={bo.biayaMarketingDetail.sponsor || 0} onChange={v => updateBODetail('biayaMarketingDetail', 'sponsor', v)} />
              <RowInput label="IKLAN MEDIA" value={bo.biayaMarketingDetail.iklanMedia || 0} onChange={v => updateBODetail('biayaMarketingDetail', 'iklanMedia', v)} />
              <RowInput label="PAMERAN" value={bo.biayaMarketingDetail.pameran || 0} onChange={v => updateBODetail('biayaMarketingDetail', 'pameran', v)} />
              <RowInput label="BIAYA LAIN-LAIN" value={bo.biayaMarketingDetail.biayaLainLain || 0} onChange={v => updateBODetail('biayaMarketingDetail', 'biayaLainLain', v)} />
            </div>
          )}
        </div>
      </div>

      {/* B2. Biaya Umum Kantor */}
      <div>
        <SectionTitle>C. Biaya Umum Kantor</SectionTitle>
        <p className="text-sm text-muted-foreground mb-4">Biaya umum kantor adalah biaya-biaya operasional harian penyelenggaraan proyek.</p>
        
        <div className="border border-border p-4 rounded-xl space-y-4">
          <div className="text-sm font-semibold mb-2">Biaya Umum Kantor Anda:</div>
          
          <div className="space-y-3">
            {/* Mode 1 */}
            <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/30">
              <input 
                type="radio" 
                checked={bo.biayaUmumMode === 'per_bulan'} 
                onChange={() => updateBO('biayaUmumMode', 'per_bulan')}
                className="focus:ring-green-400"
              />
              <span className="flex-1 text-sm font-medium">LUMSUM BIAYA PER BULAN</span>
              <div className="w-48">
                <RupiahInput 
                  value={bo.biayaUmumKantorPerBulan} 
                  onChange={v => updateBO('biayaUmumKantorPerBulan', v)} 
                  disabled={bo.biayaUmumMode !== 'per_bulan'} 
                />
              </div>
              <span className="text-xs text-muted-foreground w-10">/BLN</span>
            </label>

            {/* Mode 2 */}
            <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/30">
              <input 
                type="radio" 
                checked={bo.biayaUmumMode === 'lumpsum_periode'} 
                onChange={() => updateBO('biayaUmumMode', 'lumpsum_periode')}
                className="focus:ring-green-400"
              />
              <span className="flex-1 text-sm font-medium">LUMSUM BIAYA DALAM 1 PERIODE OPERASIONAL</span>
              <div className="w-48">
                <RupiahInput 
                  value={bo.biayaUmumLumpsum} 
                  onChange={v => updateBO('biayaUmumLumpsum', v)} 
                  disabled={bo.biayaUmumMode !== 'lumpsum_periode'} 
                />
              </div>
              <span className="text-xs text-muted-foreground w-10"></span>
            </label>

            {/* Mode 3 */}
            <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/30">
              <input 
                type="radio" 
                checked={bo.biayaUmumMode === 'detail_item'} 
                onChange={() => updateBO('biayaUmumMode', 'detail_item')}
                className="focus:ring-green-400"
              />
              <span className="flex-1 text-sm font-medium">BERDASARKAN PERHITUNGAN DETAIL ITEM BIAYA UMUM KANTOR</span>
              <div className="w-48">
                <div className="h-10 px-3 bg-muted/40 rounded-md border border-input flex items-center text-sm font-mono opacity-80 cursor-not-allowed">
                  {formatRupiah(
                     (Object.values(bo.biayaUmumDetail?.gaji || {}).reduce((sum, item) => sum + (typeof item === 'object' && item !== null ? item.org * item.gaji : Number(item)||0), 0)) +
                     (bo.biayaUmumDetail?.atk||0) + (bo.biayaUmumDetail?.konsumsi||0) + (bo.biayaUmumDetail?.akomodasi||0) + (bo.biayaUmumDetail?.transportasi||0) + 
                     (bo.biayaUmumDetail?.komunikasi||0) + (bo.biayaUmumDetail?.biayaLainLain||0), 
                    true
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground w-10">/BLN</span>
            </label>
          </div>

          {/* Expanded Detail Umum Kantor */}
          {bo.biayaUmumMode === 'detail_item' && bo.biayaUmumDetail && bo.biayaUmumDetail.gaji && (
            <div className="mt-4 pt-4 border-t border-border pl-8">
              <div className="text-xs text-muted-foreground mb-3 uppercase">Detail item biaya umum kantor (/Bln):</div>
              
              <div className="space-y-6">
                <div>
                  <div className="text-sm font-semibold mb-2">GAJI KANTOR :</div>
                  <div className="space-y-2 max-w-2xl">
                    {[
                      { key: 'komisaris', label: 'KOMISARIS' },
                      { key: 'direktur', label: 'DIREKTUR' },
                      { key: 'keuangan', label: 'KEUANGAN' },
                      { key: 'logistik', label: 'LOGISTIK' },
                      { key: 'legal', label: 'LEGAL' },
                      { key: 'administrasi', label: 'ADMINISTRASI' },
                      { key: 'pemasaran', label: 'PEMASARAN' },
                      { key: 'arsitek', label: 'ARSITEK' },
                      { key: 'engineer', label: 'ENGINEER' },
                      { key: 'pengawas', label: 'PENGAWAS' },
                      { key: 'penjaga', label: 'PENJAGA' },
                    ].map(role => {
                      const gajiData = (bo.biayaUmumDetail.gaji as any)[role.key] || { org: 0, gaji: 0 }
                      return (
                      <div key={role.key} className="flex items-center gap-3">
                        <Label className="w-40 text-xs">{role.label}</Label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            value={gajiData.org} 
                            onChange={e => updateGaji(role.key, 'org', Number(e.target.value))}
                            className="w-16 h-9 rounded-md border border-input bg-background px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400"
                            min={0}
                          />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">ORG @</span>
                        </div>
                        <div className="w-48 ml-auto flex items-center gap-2">
                          <RupiahInput 
                            value={gajiData.gaji} 
                            onChange={v => updateGaji(role.key, 'gaji', v)} 
                          />
                        </div>
                      </div>
                    )})}
                    <div className="flex items-center gap-3 mt-4 pt-2 border-t border-border/50">
                        <Label className="w-56 text-xs pl-0">LAIN-LAIN GAJI KANTOR</Label>
                        <div className="w-48 ml-auto">
                          <RupiahInput 
                            value={bo.biayaUmumDetail.gaji.lainLainGaji || 0} 
                            onChange={v => updateGaji('lainLainGaji', 'gaji', v)} 
                          />
                        </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 max-w-2xl pt-2">
                  <div className="flex items-center gap-3">
                    <Label className="w-56 text-xs uppercase">ATK Kantor</Label>
                    <div className="w-48 ml-auto"><RupiahInput value={bo.biayaUmumDetail.atk || 0} onChange={v => updateBODetail('biayaUmumDetail', 'atk', v)} /></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-56 text-xs uppercase">Konsumsi</Label>
                    <div className="w-48 ml-auto"><RupiahInput value={bo.biayaUmumDetail.konsumsi || 0} onChange={v => updateBODetail('biayaUmumDetail', 'konsumsi', v)} /></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-56 text-xs uppercase">Akomodasi</Label>
                    <div className="w-48 ml-auto"><RupiahInput value={bo.biayaUmumDetail.akomodasi || 0} onChange={v => updateBODetail('biayaUmumDetail', 'akomodasi', v)} /></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-56 text-xs uppercase">Transportasi</Label>
                    <div className="w-48 ml-auto"><RupiahInput value={bo.biayaUmumDetail.transportasi || 0} onChange={v => updateBODetail('biayaUmumDetail', 'transportasi', v)} /></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-56 text-xs uppercase">Komunikasi</Label>
                    <div className="w-48 ml-auto"><RupiahInput value={bo.biayaUmumDetail.komunikasi || 0} onChange={v => updateBODetail('biayaUmumDetail', 'komunikasi', v)} /></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-56 text-xs uppercase">Biaya Lain-Lain</Label>
                    <div className="w-48 ml-auto"><RupiahInput value={bo.biayaUmumDetail.biayaLainLain || 0} onChange={v => updateBODetail('biayaUmumDetail', 'biayaLainLain', v)} /></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Ops Summary */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[1, 2, 3].map(fase => {
            // we use the actual calc functions to get correct numbers now
            const totalFase = (bo.biayaUmumMode === 'per_bulan' ? bo.biayaUmumKantorPerBulan : 0) // ... this is getting complex to fake per fase, let's just use calcBiayaOps
            return null;
          })}
          <div className="col-span-3 bg-navy/5 dark:bg-navy/20 rounded-lg p-4 text-right">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Total Biaya Pemasaran & Operasional</div>
            <div className="font-mono font-bold text-navy dark:text-gold text-2xl">
              {formatRupiah(totalBiayaOperasional, true)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Dikalikan akumulasi durasi waktu atau lumpsum</div>
          </div>
        </div>
      </div>

      {/* C. Biaya Pokok Bangunan */}
      {inputs.tipeBangunan.length > 0 && (
        <div>
          <SectionTitle>C. Biaya Pokok Bangunan (per tipe)</SectionTitle>
          <div className="space-y-4">
            {inputs.tipeBangunan.map((tipe, i) => (
              <div key={tipe.id} className="border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">{tipe.nama || `Tipe ${i + 1}`}</h4>
                  <span className="text-xs text-muted-foreground">
                    LB: {tipe.luasBangunan} m² | {tipe.jumlahUnit} unit
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Biaya Konstruksi (Rp/m²)</Label>
                    <RupiahInput
                      value={tipe.biayaKonstruksiPerM2}
                      onChange={v => updateTipeBiaya(tipe.id, 'biayaKonstruksiPerM2', v)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Kenaikan Biaya per Fase (%)</Label>
                    <div className="relative">
                      <input
                        type="number"
                        value={tipe.kenaikanBiayaPerFase}
                        onChange={e => updateTipeBiaya(tipe.id, 'kenaikanBiayaPerFase', parseFloat(e.target.value) || 0)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 pr-8 text-sm font-mono focus:ring-2 focus:ring-green-400 focus:outline-none"
                        min={0}
                        max={30}
                        step={0.5}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>

                {/* Per-fase preview */}
                <div className="flex gap-2 flex-wrap">
                  {Array.from({ length: inputs.jumlahFase }, (_, f) => {
                    const kenaikan    = Math.pow(1 + tipe.kenaikanBiayaPerFase / 100, f)
                    const biayaPerUnit = tipe.biayaKonstruksiPerM2 * kenaikan * tipe.luasBangunan
                    return (
                      <div key={f} className="bg-muted/40 rounded-lg px-3 py-1.5 text-center min-w-[90px]">
                        <div className="text-xs text-muted-foreground">Fase {f + 1}</div>
                        <div className="font-mono text-xs font-semibold mt-0.5">
                          {formatRupiah(biayaPerUnit, true)}/unit
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex justify-end">
            <div className="bg-navy/5 dark:bg-navy/20 rounded-lg px-4 py-2.5 text-right">
              <div className="text-xs text-muted-foreground">Estimasi Total Biaya Bangun</div>
              <div className="font-mono font-bold text-navy dark:text-gold text-lg">
                {formatRupiah(totalBiayaBangun, true)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">(berdasarkan unit terjual)</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
