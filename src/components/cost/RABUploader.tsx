import { useState } from 'react';
import { UploadCloud, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { extractTextFromExcel } from '@/utils/excel';
import { parseRABwithGemini } from '@/lib/ai-parser';
import { useCostStore } from '@/store/costStore';
import { useToast } from '@/hooks/use-toast';

export default function RABUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ done: number, total: number } | null>(null);
  const { toast } = useToast();
  const { isProcessingUpload, setProcessingUpload, setDraftComponents, draftComponents, clearDraft, saveDraftToActivePlan } = useCostStore();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleRemoveDraftItem = (id: string) => {
    setDraftComponents(draftComponents.filter(c => c.id !== id));
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
          toast({
            title: "Gagal memproses RAB",
            description: "AI tidak mendeteksi komponen RAB yang valid di dalam file.",
            variant: "destructive"
          })
        } else {
          setDraftComponents(components);
          toast({
            title: "RAB Berhasil diproses AI",
            description: `Menemukan ${components.length} item pekerjaan.`,
          })
        }

      } catch (error: any) {
        console.error(error);
        toast({
          title: "Terjadi Kesalahan",
          description: error.message || "Gagal memproses file RAB dengan AI.",
          variant: "destructive",
        });
      } finally {
        setProcessingUpload(false);
        setProgress(null);
      }
    }, 50);
  };

  if (draftComponents.length > 0) {
    // Tampilkan Tabel Review
    const total = draftComponents.reduce((s, c) => s + c.totalPlannedCost, 0);

    return (
      <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Review Hasil AI</h3>
              <p className="text-sm text-muted-foreground">Periksa dan hapus baris jika ada AI membaca "Subtotal" menjadi item.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={clearDraft}>Batalkan</Button>
            <Button className="bg-navy hover:bg-navy/90 gap-2" onClick={() => saveDraftToActivePlan()}>
              <Save className="h-4 w-4" /> Simpan RAB
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border max-h-[400px]">
          <table className="w-full text-sm text-left relative">
            <thead className="bg-muted text-muted-foreground sticky top-0 font-medium">
              <tr>
                <th className="px-4 py-3">Nama Pekerjaan</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3 text-right">Vol</th>
                <th className="px-4 py-3">Satuan</th>
                <th className="px-4 py-3 text-right">Harga Satuan</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {draftComponents.map((item) => (
                <tr key={item.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3 capitalize">
                    <span className="bg-muted px-2 py-1 rounded-md text-xs">{item.categoryId}</span>
                  </td>
                  <td className="px-4 py-3 text-right">{item.plannedVolume.toLocaleString('id-ID')}</td>
                  <td className="px-4 py-3">{item.unit}</td>
                  <td className="px-4 py-3 text-right">Rp {item.unitPrice.toLocaleString('id-ID')}</td>
                  <td className="px-4 py-3 text-right font-medium text-navy">Rp {item.totalPlannedCost.toLocaleString('id-ID')}</td>
                  <td className="px-4 py-3 text-center">
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveDraftItem(item.id)} className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted font-bold sticky bottom-0">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-right">Total RAB Keseluruhan</td>
                <td className="px-4 py-3 text-right text-navy">Rp {total.toLocaleString('id-ID')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-border p-8 shadow-sm text-center">
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
          ) : (
            'Mulai Analisis AI'
          )}
        </Button>

        {/* Progress Card - Besar & Jelas */}
        {isProcessingUpload && (
          <div className="w-full bg-navy text-white rounded-2xl px-6 py-5 shadow-xl shadow-navy/20 space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-gold shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-base">
                  {progress
                    ? progress.done >= progress.total - 1
                      ? 'Melakukan Validasi Silang (Self-Correction)...'
                      : `Memproses Bagian ${progress.done + 1} dari ${progress.total - 1}`
                    : 'Membaca File Excel...'}
                </p>
                <p className="text-white/60 text-sm mt-0.5">
                  {progress && progress.total > 1
                    ? progress.done >= progress.total - 1
                      ? 'AI sedang mendeteksi anomali angka dan membersihkan PPN/Subtotal...'
                      : 'AI sedang membaca data RAB secara bertahap. Harap tunggu...'
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
