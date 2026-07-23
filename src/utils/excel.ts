import * as xlsx from 'xlsx';

export interface RowData {
  [key: string]: any;
}

export async function extractTextFromExcel(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("Gagal membaca file");

        const workbook = xlsx.read(new Uint8Array(data as ArrayBuffer), { type: 'array' });

        // ── SMART SHEET HEURISTIC SCORING ──
        // Alih-alih hanya menebak dari nama sheet, kita memindai isi setiap sheet
        // untuk mencari kata kunci krusial dalam dunia RAB (Harga, Satuan, Total, dll).
        
        const sheetScores = workbook.SheetNames.map(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          const jsonArr: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
          
          let score = 0;
          const lowerName = sheetName.toLowerCase();
          
          // Penalti Besar untuk sheet perhitungan/backup/analisa
          if (lowerName.includes('vol') || lowerName.includes('hit') || lowerName.includes('backup') || lowerName.includes('ahsp') || lowerName.includes('analisa')) {
            score -= 50;
          }
          // Bonus untuk nama sheet yang eksplisit
          if (lowerName.includes('rab') || lowerName.includes('rekap') || lowerName.includes('anggaran') || lowerName.includes('bq')) {
            score += 20;
          }

          // Scan isi 50 baris pertama untuk mencari kolom tabel RAB
          const scanLimit = Math.min(jsonArr.length, 50);
          let contentText = "";
          for (let i = 0; i < scanLimit; i++) {
            if (jsonArr[i]) contentText += jsonArr[i].join(" ").toLowerCase() + " ";
          }

          if (contentText.includes('harga')) score += 10;
          if (contentText.includes('satuan')) score += 10;
          if (contentText.includes('uraian') || contentText.includes('pekerjaan')) score += 10;
          if (contentText.includes('total') || contentText.includes('jumlah')) score += 5;
          if (contentText.includes('upah')) score += 5;
          if (contentText.includes('bahan') || contentText.includes('material')) score += 5;

          return {
            name: sheetName,
            score,
            jsonArr
          };
        });

        // Urutkan dari skor tertinggi ke terendah
        sheetScores.sort((a, b) => b.score - a.score);

        // Filter sheet yang skornya positif (layak dibaca sebagai RAB)
        // Ambil maksimal 3 sheet terbaik agar tidak membebani limit token AI
        let bestSheets = sheetScores.filter(s => s.score > 0).slice(0, 3);
        
        // Fallback: Jika tidak ada sheet berpola RAB, paksakan ambil 1 sheet pertama
        if (bestSheets.length === 0 && sheetScores.length > 0) {
          bestSheets = [sheetScores[0]];
        }
        
        let combinedText = "";

        for (const sheetData of bestSheets) {
          combinedText += `\n--- Sheet: ${sheetData.name} ---\n`;
          for (const row of sheetData.jsonArr) {
            // Abaikan baris yang benar-benar kosong
            if (!row || row.length === 0 || row.every(cell => cell == null || cell === '')) {
              continue;
            }
            // Gabungkan elemen baris menjadi teks (Pembersihan format)
            combinedText += row.map(cell => cell != null ? String(cell).trim().replace(/\n/g, ' ') : "").join("\t") + "\n";
          }
        }

        resolve(combinedText);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

// ── Laporan rapi & berwarna (judul, tabel berformat, TOTAL ber-SUM) ─────────
// Memakai xlsx-js-style agar warna/border sel ikut tertulis ke file .xlsx
// (SheetJS community membuang style saat menulis).
import * as reportXlsxNs from 'xlsx-js-style';

// interop CJS: di Node namespace bisa terbungkus di .default, di Vite tidak
const reportXlsx: typeof reportXlsxNs = (reportXlsxNs as unknown as { utils?: unknown }).utils
  ? reportXlsxNs
  : (reportXlsxNs as unknown as { default: typeof reportXlsxNs }).default;

export { reportXlsx };

export interface ReportSheetSpec {
  title: string;
  subtitle: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  /** indeks kolom (0-based) yang dijumlahkan pada baris TOTAL dengan rumus SUM */
  sumCols: number[];
}

const NAVY = '0D1B2A';
const GOLD_LT = 'F0E6CE';
const BORDER = { style: 'thin', color: { rgb: 'C9CFD6' } };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

/**
 * Bangun worksheet bergaya laporan berwarna:
 * baris 1 judul (merge, tebal), baris 2 subjudul (merge), baris 4 header
 * tabel (putih di atas navy), data berbingkai dengan baris selang-seling,
 * ditutup baris TOTAL (tebal, latar emas muda) berisi rumus =SUM(...).
 * Sel angka diberi format ribuan #,##0 dan lebar kolom otomatis.
 */
export function buildReportSheet(spec: ReportSheetSpec): reportXlsxNs.WorkSheet {
  const { title, subtitle, headers, rows, sumCols } = spec;
  const totalRow: Array<string | number> = headers.map(() => '');
  totalRow[0] = 'TOTAL';
  const aoa: Array<Array<string | number>> = [[title], [subtitle], [], headers, ...rows, totalRow];
  const ws = reportXlsx.utils.aoa_to_sheet(aoa);

  const nCols = headers.length;
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, nCols - 1) } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(0, nCols - 1) } },
  ];

  // baris (1-indexed): header=4, data=5..4+n, TOTAL=5+n
  const dataFirst = 5;
  const dataLast = 4 + rows.length;
  const totalIdx = dataLast + 1;
  for (const c of sumCols) {
    const col = reportXlsx.utils.encode_col(c);
    // nilai cache (v) wajib ada agar sel rumus ikut tertulis & langsung terbaca
    const sum = rows.reduce((s, r) => s + (typeof r[c] === 'number' ? (r[c] as number) : 0), 0);
    ws[`${col}${totalIdx}`] = rows.length
      ? { t: 'n', v: sum, f: `SUM(${col}${dataFirst}:${col}${dataLast})`, z: '#,##0' }
      : { t: 'n', v: 0, z: '#,##0' };
  }

  // gaya sel: judul, subjudul, header, data (zebra), TOTAL
  ws['A1'].s = { font: { bold: true, sz: 14, color: { rgb: NAVY } } };
  ws['A2'].s = { font: { sz: 10, color: { rgb: '5A6673' } } };
  for (let c = 0; c < nCols; c++) {
    const head = ws[reportXlsx.utils.encode_cell({ r: 3, c })];
    if (head) {
      head.s = {
        font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid', fgColor: { rgb: NAVY } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: BORDERS,
      };
    }
    for (let r = 4; r <= totalIdx - 1; r++) {
      const cell = ws[reportXlsx.utils.encode_cell({ r, c })];
      if (!cell) continue;
      cell.s = {
        border: BORDERS,
        fill: r % 2 === 0
          ? { patternType: 'solid', fgColor: { rgb: 'F5F7FA' } }
          : { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
        font: { sz: 10 },
      };
      if (cell.t === 'n') cell.z = '#,##0';
    }
    const tot = ws[reportXlsx.utils.encode_cell({ r: totalIdx - 1, c })];
    if (tot) {
      tot.s = {
        font: { bold: true, sz: 10, color: { rgb: NAVY } },
        fill: { patternType: 'solid', fgColor: { rgb: GOLD_LT } },
        border: BORDERS,
      };
      if (tot.t === 'n') tot.z = '#,##0';
    }
  }

  // lebar kolom mengikuti isi terpanjang
  const widths = headers.map(h => Math.min(h.length, 22));
  for (const row of rows) {
    row.forEach((v, c) => {
      const len = String(v ?? '').length;
      if (c < widths.length && len > widths[c]) widths[c] = Math.min(len, 42);
    });
  }
  ws['!cols'] = widths.map(wch => ({ wch: wch + 3 }));
  ws['!rows'] = [{ hpt: 20 }, { hpt: 14 }, { hpt: 6 }, { hpt: 24 }];
  return ws;
}
