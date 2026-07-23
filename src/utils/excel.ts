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

// ── Laporan rapi (sheet bergaya laporan: judul, tabel, format angka, TOTAL) ──

export interface ReportSheetSpec {
  title: string;
  subtitle: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  /** indeks kolom (0-based) yang dijumlahkan pada baris TOTAL dengan rumus SUM */
  sumCols: number[];
}

/**
 * Bangun worksheet bergaya laporan:
 * baris 1 judul (merge), baris 2 subjudul (merge), baris 4 header tabel,
 * lalu data, ditutup baris TOTAL berisi rumus =SUM(...) per kolom nilai.
 * Semua sel angka diberi format ribuan #,##0 dan lebar kolom otomatis.
 */
export function buildReportSheet(spec: ReportSheetSpec): xlsx.WorkSheet {
  const { title, subtitle, headers, rows, sumCols } = spec;
  const totalRow: Array<string | number> = headers.map(() => '');
  totalRow[0] = 'TOTAL';
  const aoa: Array<Array<string | number>> = [[title], [subtitle], [], headers, ...rows, totalRow];
  const ws = xlsx.utils.aoa_to_sheet(aoa);

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
    const col = xlsx.utils.encode_col(c);
    // nilai cache (v) wajib ada agar sel rumus ikut tertulis & langsung terbaca
    const sum = rows.reduce((s, r) => s + (typeof r[c] === 'number' ? (r[c] as number) : 0), 0);
    ws[`${col}${totalIdx}`] = rows.length
      ? { t: 'n', v: sum, f: `SUM(${col}${dataFirst}:${col}${dataLast})`, z: '#,##0' }
      : { t: 'n', v: 0, z: '#,##0' };
  }

  // format ribuan untuk semua sel angka pada area data
  if (ws['!ref']) {
    const range = xlsx.utils.decode_range(ws['!ref']);
    for (let r = 4; r <= range.e.r; r++) {
      for (let c = 0; c <= range.e.c; c++) {
        const cell = ws[xlsx.utils.encode_cell({ r, c })];
        if (cell && cell.t === 'n') cell.z = '#,##0';
      }
    }
  }

  // lebar kolom mengikuti isi terpanjang
  const widths = headers.map(h => h.length);
  for (const row of rows) {
    row.forEach((v, c) => {
      const len = String(v ?? '').length;
      if (c < widths.length && len > widths[c]) widths[c] = Math.min(len, 42);
    });
  }
  ws['!cols'] = widths.map(wch => ({ wch: wch + 3 }));
  return ws;
}
