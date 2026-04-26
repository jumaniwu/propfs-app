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
