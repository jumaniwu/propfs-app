import { useState } from 'react';
import {
  UploadCloud, FileSpreadsheet, Loader2, CheckCircle2,
  Save, Trash2, PlusCircle, Edit2, X, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { extractTextFromExcel } from '@/utils/excel';
import { parseRABwithGemini } from '@/lib/ai-parser';
import { useCostStore } from '@/store/costStore';
import { useToast } from '@/hooks/use-toast';
import { BudgetComponent, CostCategory } from '@/types/cost.types';
import { v4 as uuidv4 } from 'uuid';

const CATEGORY_OPTIONS: { value: CostCategory; label: string }[] = [
  { value: 'bangunan', label: 'Bangunan' },
  { value: 'infrastruktur', label: 'Infrastruktur' },
  { value: 'lahan', label: 'Lahan' },
  { value: 'operasional', label: 'Operasional' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'lainnya', label: 'Lainnya' },
];

const EMPTY_NEW_ITEM = {
  groupName: '',
  categoryId: 'bangunan' as CostCategory,
  name: '',
  plannedVolume: 0,
  unit: 'm2',
  unitLaborCost: 0,
  unitMaterialCost: 0,
};

export default function RABUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ done: number, total: number } | null>(null);
  const { toast } = useToast();
  const {
    isProcessingUpload, setProcessingUpload,
    setDraftComponents, draftComponents, clearDraft, saveDraftToActivePlan
  } = useCostStore();

  // State untuk form tambah item baru
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({ ...EMPTY_NEW_ITEM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<BudgetComponent>>({});

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setProcessingUpload(true);
    setProgress(null);

    setTimeout(async () => {
      try {
        const text = await extractTextFromExcel(file);
        const components = await parseRABwithGemini(text, (done, total) => {
          setProgress({ done, total });
        });

        if (components.length === 0) {
          toast({ title: "Gagal memproses RAB", description: "AI tidak mendeteksi komponen RAB yang valid.", variant: "destructive" });
        } else {
          setDraftComponents(components);
          toast({ title: "RAB Berhasil diproses AI ✅", description: `Menemukan ${components.length} item pekerjaan. Periksa & tambah item jika ada yang kurang.` });
        }
      } catch (error: any) {
        toast({ title: "Terjadi Kesalahan", description: error.message || "Gagal memproses file RAB.", variant: "destructive" });
      } finally {
        setProcessingUpload(false);
        setProgress(null);
      }
    }, 50);
  };

  // ── Tambah item baru ──────────────────────────────────────────────
  const handleAddItem = () => {
    if (!newItem.name.trim()) {
      toast({ title: "Nama pekerjaan wajib diisi", variant: "destructive" });
      return;
    }
    const unitPrice = (newItem.unitLaborCost || 0) + (newItem.unitMaterialCost || 0);
    const component: BudgetComponent = {
      id: uuidv4(),
      groupName: newItem.groupName || 'Tambahan Manual',
      categoryId: newItem.categoryId,
      name: newItem.name,
      plannedVolume: newItem.plannedVolume,
      unit: newItem.unit,
      unitLaborCost: newItem.unitLaborCost,
      unitMaterialCost: newItem.unitMaterialCost,
      unitPrice,
      totalPlannedCost: newItem.plannedVolume * unitPrice,
    };
    setDraftComponents([...draftComponents, component]);
    setNewItem({ ...EMPTY_NEW_ITEM });
    setShowAddForm(false);
    toast({ title: "Item berhasil ditambahkan ✅" });
  };

  // ── Edit item existing ────────────────────────────────────────────
  const startEdit = (item: BudgetComponent) => {
    setEditingId(item.id);
    setEditData({
      name: item.name,
      groupName: item.groupName,
      categoryId: item.categoryId,
      plannedVolume: item.plannedVolume,
      unit: item.unit,
      unitLaborCost: item.unitLaborCost || 0,
      unitMaterialCost: item.unitMaterialCost || 0,
    });
  };

  const saveEdit = (id: string) => {
    const unitPrice = (Number(editData.unitLaborCost) || 0) + (Number(editData.unitMaterialCost) || 0);
    setDraftComponents(draftComponents.map(c => {
      if (c.id !== id) return c;
      return {
        ...c,
        ...editData,
        unitLaborCost: Number(editData.unitLaborCost) || 0,
        unitMaterialCost: Number(editData.unitMaterialCost) || 0,
        plannedVolume: Number(editData.plannedVolume) || 0,
        unitPrice,
        totalPlannedCost: (Number(editData.plannedVolume) || 0) * unitPrice,
      };
    }));
    setEditingId(null);
    setEditData({});
  };

  const handleRemove = (id: string) => {
    setDraftComponents(draftComponents.filter(c => c.id !== id));
  };

  // ── Review Draft ──────────────────────────────────────────────────
  if (draftComponents.length > 0) {
    const total = draftComponents.reduce((s, c) => s + c.totalPlannedCost, 0);
    const grouped = draftComponents.reduce((acc, c) => {
      const g = c.groupName || 'Lainnya';
      if (!acc[g]) acc[g] = [];
      acc[g].push(c);
      return acc;
    }, {} as Record<string, BudgetComponent[]>);

    return (
      <div className="bg-white rounded-2xl border border-border p-4 md:p-6 shadow-sm space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 text-green-600 rounded-xl flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Review Hasil AI</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {draftComponents.length} item · Total: <span className="font-bold text-navy">Rp {total.toLocaleString('id-ID')}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={clearDraft} className="flex-1 sm:flex-none text-sm">
              Batal
            </Button>
            <Button
              className="bg-navy hover:bg-navy/90 gap-2 flex-1 sm:flex-none text-sm"
              onClick={() => saveDraftToActivePlan()}
            >
              <Save className="h-4 w-4" /> Simpan RAB
            </Button>
          </div>
        </div>

        {/* Tombol Tambah Item */}
        <div>
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-navy hover:text-navy/80 transition-colors py-1"
          >
            <PlusCircle className="h-4 w-4" />
            {showAddForm ? 'Tutup Form Tambah' : 'Tambah Item Manual'}
          </button>

          {/* Form Tambah Item */}
          {showAddForm && (
            <div className="mt-3 border border-navy/20 bg-navy/5 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-navy uppercase tracking-wider">Form Tambah Item</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Nama Pekerjaan *</label>
                  <Input
                    placeholder="Contoh: Pasang Keramik Lantai 60x60"
                    value={newItem.name}
                    onChange={e => setNewItem(v => ({ ...v, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Grup Pekerjaan</label>
                  <Input
                    placeholder="Contoh: Pekerjaan Arsitektur"
                    value={newItem.groupName}
                    onChange={e => setNewItem(v => ({ ...v, groupName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Kategori</label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={newItem.categoryId}
                    onChange={e => setNewItem(v => ({ ...v, categoryId: e.target.value as CostCategory }))}
                  >
                    {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Volume</label>
                  <Input
                    type="number" placeholder="0"
                    value={newItem.plannedVolume || ''}
                    onChange={e => setNewItem(v => ({ ...v, plannedVolume: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Satuan</label>
                  <Input
                    placeholder="m2 / m3 / ls / unit"
                    value={newItem.unit}
                    onChange={e => setNewItem(v => ({ ...v, unit: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Harga Upah / Satuan (Rp)</label>
                  <Input
                    type="number" placeholder="0"
                    value={newItem.unitLaborCost || ''}
                    onChange={e => setNewItem(v => ({ ...v, unitLaborCost: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Harga Material / Satuan (Rp)</label>
                  <Input
                    type="number" placeholder="0"
                    value={newItem.unitMaterialCost || ''}
                    onChange={e => setNewItem(v => ({ ...v, unitMaterialCost: Number(e.target.value) }))}
                  />
                </div>
              </div>
              {/* Preview total */}
              <div className="flex items-center justify-between pt-1 border-t border-navy/10 text-sm">
                <span className="text-muted-foreground">Preview Total:</span>
                <span className="font-bold text-navy">
                  Rp {(newItem.plannedVolume * ((newItem.unitLaborCost || 0) + (newItem.unitMaterialCost || 0))).toLocaleString('id-ID')}
                </span>
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={handleAddItem} className="bg-navy hover:bg-navy/90 gap-2 text-sm">
                  <PlusCircle className="h-4 w-4" /> Tambah ke Daftar
                </Button>
                <Button variant="outline" onClick={() => setShowAddForm(false)} className="text-sm">
                  Batal
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Tabel per Grup */}
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {Object.entries(grouped).map(([grp, items]) => {
            const grpTotal = items.reduce((s, c) => s + c.totalPlannedCost, 0);
            return (
              <div key={grp} className="border border-border rounded-xl overflow-hidden">
                <div className="bg-muted px-4 py-2.5 flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{grp}</span>
                  <span className="text-xs font-bold text-navy">Rp {grpTotal.toLocaleString('id-ID')}</span>
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#fcfcfc] text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left">Nama Pekerjaan</th>
                        <th className="px-4 py-2 text-right">Vol</th>
                        <th className="px-4 py-2">Sat</th>
                        <th className="px-4 py-2 text-right">H. Upah</th>
                        <th className="px-4 py-2 text-right">H. Material</th>
                        <th className="px-4 py-2 text-right">H. Satuan</th>
                        <th className="px-4 py-2 text-right font-bold">Total</th>
                        <th className="px-4 py-2 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {items.map(item => {
                        const isEditing = editingId === item.id;
                        return (
                          <tr key={item.id} className="hover:bg-muted/30">
                            <td className="px-4 py-2.5 font-medium">
                              {isEditing
                                ? <Input className="h-7 text-sm" value={editData.name || ''} onChange={e => setEditData(v => ({ ...v, name: e.target.value }))} />
                                : item.name}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {isEditing
                                ? <Input type="number" className="h-7 text-sm w-20 text-right" value={editData.plannedVolume ?? item.plannedVolume} onChange={e => setEditData(v => ({ ...v, plannedVolume: Number(e.target.value) }))} />
                                : item.plannedVolume.toLocaleString('id-ID')}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{item.unit}</td>
                            <td className="px-4 py-2.5 text-right">
                              {isEditing
                                ? <Input type="number" className="h-7 text-sm w-28 text-right" value={editData.unitLaborCost ?? item.unitLaborCost ?? 0} onChange={e => setEditData(v => ({ ...v, unitLaborCost: Number(e.target.value) }))} />
                                : `Rp ${(item.unitLaborCost || 0).toLocaleString('id-ID')}`}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {isEditing
                                ? <Input type="number" className="h-7 text-sm w-28 text-right" value={editData.unitMaterialCost ?? item.unitMaterialCost ?? 0} onChange={e => setEditData(v => ({ ...v, unitMaterialCost: Number(e.target.value) }))} />
                                : `Rp ${(item.unitMaterialCost || 0).toLocaleString('id-ID')}`}
                            </td>
                            <td className="px-4 py-2.5 text-right">Rp {item.unitPrice.toLocaleString('id-ID')}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-navy">
                              Rp {item.totalPlannedCost.toLocaleString('id-ID')}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-center gap-1">
                                {isEditing ? (
                                  <>
                                    <button onClick={() => saveEdit(item.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                                      <Check className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:bg-muted rounded">
                                      <X className="h-4 w-4" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => startEdit(item)} className="p-1 text-muted-foreground hover:text-navy hover:bg-muted rounded">
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => handleRemove(item.id)} className="p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-border">
                  {items.map(item => {
                    const isEditing = editingId === item.id;
                    return (
                      <div key={item.id} className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          {isEditing
                            ? <Input className="h-8 text-sm flex-1" value={editData.name || ''} onChange={e => setEditData(v => ({ ...v, name: e.target.value }))} />
                            : <p className="font-medium text-sm flex-1">{item.name}</p>
                          }
                          <div className="flex gap-1 shrink-0">
                            {isEditing ? (
                              <>
                                <button onClick={() => saveEdit(item.id)} className="p-1.5 text-emerald-600 bg-emerald-50 rounded-lg">
                                  <Check className="h-4 w-4" />
                                </button>
                                <button onClick={() => setEditingId(null)} className="p-1.5 text-muted-foreground bg-muted rounded-lg">
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(item)} className="p-1.5 text-muted-foreground bg-muted rounded-lg">
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => handleRemove(item.id)} className="p-1.5 text-red-500 bg-red-50 rounded-lg">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {isEditing ? (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div><label className="text-muted-foreground">Volume</label>
                              <Input type="number" className="h-8 text-sm mt-0.5" value={editData.plannedVolume ?? item.plannedVolume} onChange={e => setEditData(v => ({ ...v, plannedVolume: Number(e.target.value) }))} />
                            </div>
                            <div><label className="text-muted-foreground">H. Upah</label>
                              <Input type="number" className="h-8 text-sm mt-0.5" value={editData.unitLaborCost ?? item.unitLaborCost ?? 0} onChange={e => setEditData(v => ({ ...v, unitLaborCost: Number(e.target.value) }))} />
                            </div>
                            <div><label className="text-muted-foreground">H. Material</label>
                              <Input type="number" className="h-8 text-sm mt-0.5" value={editData.unitMaterialCost ?? item.unitMaterialCost ?? 0} onChange={e => setEditData(v => ({ ...v, unitMaterialCost: Number(e.target.value) }))} />
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-x-4 text-xs">
                            <div><span className="text-muted-foreground">Volume: </span><span className="font-medium">{item.plannedVolume.toLocaleString('id-ID')} {item.unit}</span></div>
                            <div><span className="text-muted-foreground">H. Satuan: </span><span className="font-medium">Rp {item.unitPrice.toLocaleString('id-ID')}</span></div>
                          </div>
                        )}
                        <div className="flex justify-between items-center pt-1 border-t border-border/50 text-xs">
                          <span className="text-muted-foreground">Total</span>
                          <span className="font-bold text-navy">Rp {item.totalPlannedCost.toLocaleString('id-ID')}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Grand Total */}
        <div className="flex items-center justify-between border-t-2 border-navy pt-4">
          <span className="font-bold text-sm text-navy">GRAND TOTAL RAB</span>
          <span className="font-bold text-lg text-navy">Rp {total.toLocaleString('id-ID')}</span>
        </div>
      </div>
    );
  }

  // ── Upload Form ───────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl border border-border p-6 md:p-8 shadow-sm text-center">
      <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
        <UploadCloud className="h-8 w-8" />
      </div>
      <h3 className="font-serif font-bold text-xl mb-2">Upload RAB Excel</h3>
      <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
        Unggah file Excel (RAB) Anda. AI PropFS terintegrasi Gemini akan mengekstrak kategori dan angka-angkanya secara otomatis.
      </p>

      <div className="max-w-md mx-auto relative group">
        <div className="border-2 border-dashed border-border rounded-xl p-8 hover:bg-muted/30 transition-colors cursor-pointer group-hover:border-navy/50">
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={handleFileChange}
            disabled={isProcessingUpload}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3 text-foreground">
              <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
              <span className="font-medium truncate max-w-[200px]">{file.name}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <span className="font-medium text-navy">Klik atau seret file ke sini</span>
              <span className="text-xs">Mendukung .XLSX, .XLS, .CSV</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-4">
        <Button
          className="bg-navy hover:bg-navy/90 text-white min-w-[220px] h-12 text-base font-bold"
          onClick={handleUpload}
          disabled={!file || isProcessingUpload}
        >
          {isProcessingUpload ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Sedang Menganalisis...</span>
            </div>
          ) : 'Mulai Analisis AI'}
        </Button>

        {/* Progress Card */}
        {isProcessingUpload && (
          <div className="w-full bg-navy text-white rounded-2xl px-6 py-5 shadow-xl shadow-navy/20 space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-gold shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-base">
                  {progress
                    ? progress.done >= progress.total - 1
                      ? 'Finalisasi & Membersihkan Data...'
                      : `Memproses Bagian ${progress.done + 1} dari ${progress.total - 1}`
                    : 'Membaca File Excel...'}
                </p>
                <p className="text-white/60 text-sm mt-0.5">
                  {progress && progress.total > 1
                    ? 'AI sedang membaca data RAB secara bertahap. Harap tunggu...'
                    : 'Mempersiapkan data untuk dikirim ke AI...'}
                </p>
              </div>
              {progress && (
                <span className="text-gold font-bold text-lg shrink-0">
                  {Math.round((progress.done / progress.total) * 100)}%
                </span>
              )}
            </div>
            {progress && progress.total > 1 && (
              <div className="w-full bg-white/20 rounded-full h-2.5">
                <div
                  className="bg-gold h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
