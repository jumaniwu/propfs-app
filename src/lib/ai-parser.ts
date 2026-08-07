import { BudgetComponent, CostCategory } from '../types/cost.types';
import { v4 as uuidv4 } from 'uuid';
import { panggilGemini } from './gemini'
import { MODEL_UTAMA, MODEL_CADANGAN } from './modelAi'

// ── GROQ API (FREE & FAST) ────────────────────────────────────────────────
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function buildPrompt(extractedText: string): string {
  return `Anda adalah asisten AI RAB (Rencana Anggaran Biaya) ahli konstruksi Indonesia.
Baca teks Excel berikut dan ubah SETIAP baris item pekerjaan ke dalam JSON array.

ATURAN KETAT:
1. HANYA ambil baris item pekerjaan murni yang memiliki NAMA, VOLUME, dan HARGA.
2. JANGAN MEMASUKKAN baris yang berisi kata "Total", "Subtotal", "Jumlah", "Pajak", atau rekapan section.
3. Jika ada upah dan material terpisah, masukkan "ul" (upah) dan "um" (material). Jika gabung, masukkan ke "um".
4. KEY WAJIB (singkatan):
   "gN" = groupName (Kelompokan items ke dalam: "Pekerjaan Struktur", "Pekerjaan Arsitektur", "Pekerjaan MEP", atau "Pekerjaan Persiapan". Jika tidak masuk ke sana, gunakan judul section dari RAB asalkan rapi)
   "cI" = categoryId: bg=bangunan, in=infrastruktur, lh=lahan, op=operasional, mk=marketing, ll=lainnya
   "n"  = name (nama spesifik item pekerjaan)
   "v"  = plannedVolume (angka desimal murni, WAJIB gunakan TITIK '.' sebagai desimal, DILARANG ada titik/koma pemisah ribuan)
   "u"  = unit (satuan: m3, m2, ls, kg, dll)
   "ul" = unitLaborCost (angka bulat murni TANPA titik/koma. Misal: 150000)
   "um" = unitMaterialCost (angka bulat murni TANPA titik/koma. Misal: 35000)
5. Pastikan semua harga (ul dan um) benar-benar ANGKA BULAT besar tanpa pemisah ribuan.
6. Abaikan baris yang tidak memiliki harga dan volume (misalnya baris judul). Baris judul JANGAN diubah jadi objek JSON.

CONTOH:
[{"gN":"Pekerjaan Persiapan","cI":"bg","n":"Pembersihan Lahan","v":15.5,"u":"m2","ul":0,"um":15000}]

DATA EXCEL:
${extractedText}`;
}

function parseSafeNum(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  // Handle Indonesian formatting like "1.500.000,00" or just plain strings
  let str = String(val).replace(/[^\d,\.-]/g, '');
  // If there are multiple periods, it's likely a thousands separator.
  // If we have a comma, it's likely a decimal separator.
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    // only comma, maybe decimal
    str = str.replace(',', '.');
  } else if ((str.match(/\./g) || []).length > 1) {
    // multiple dots, remove them
    str = str.replace(/\./g, '');
  }
  const num = Number(str);
  return isNaN(num) ? 0 : num;
}

function mapToComponent(item: any): BudgetComponent {
  // LLM sometimes hallucinates keys, so we check all common variations
  const vol = parseSafeNum(item.v ?? item.plannedVolume ?? item.volume ?? item.Vol ?? item.vol ?? item.jumlah ?? 0);
  const ulc = parseSafeNum(item.ul ?? item.unitLaborCost ?? item.upah ?? item.harga_upah ?? 0);
  const umc = parseSafeNum(item.um ?? item.unitMaterialCost ?? item.material ?? item.harga_material ?? item.harga_satuan ?? item.harga ?? item.price ?? 0);
  let up = (ulc + umc) > 0 ? (ulc + umc) : parseSafeNum(item.unitPrice ?? item.harga_satuan ?? item.harga ?? item.p ?? 0);
  
  if (up === 0 && umc > 0) up = umc;

  const rawCat = String(item.cI || item.categoryId || item.kategori || '').toLowerCase();
  let cat: CostCategory = 'lainnya';
  if (rawCat.includes('lahan') || rawCat === 'lh') cat = 'lahan';
  else if (rawCat.includes('infra') || rawCat === 'in') cat = 'infrastruktur';
  else if (rawCat.includes('bangun') || rawCat === 'bg') cat = 'bangunan';
  else if (rawCat.includes('op') || rawCat === 'operasional') cat = 'operasional';
  else if (rawCat.includes('mark') || rawCat === 'mk') cat = 'marketing';

  const groupName = item.gN || item.groupName || item.grup || item.pekerjaan || 'Tanpa Kategori';
  const name = item.n || item.name || item.nama || item.uraian || item.item || 'Item Pekerjaan';
  const unit = item.u || item.unit || item.satuan || item.sat || 'ls';

  return {
    id: uuidv4(),
    groupName: groupName,
    categoryId: cat,
    name: name,
    plannedVolume: vol,
    unit: unit,
    unitLaborCost: ulc,
    unitMaterialCost: umc,
    unitPrice: up,
    totalPlannedCost: vol * up,
  };
}

// ── CHUNKING ───────────────────────────────────────────────────────────────
function chunkText(text: string, maxChars = 4000): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    if ((current + line).length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = line + '\n';
    } else {
      current += line + '\n';
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(c => c.length > 20);
}

async function callAIChunk(chunk: string, retries = 3): Promise<any[]> {
  const systemMsg = 'You are a JSON-only API. Respond ONLY with a valid JSON array. No markdown, no explanation, no code fences.';
  const userPrompt = buildPrompt(chunk);
  
  // Kunci tidak lagi ada di sisi klien: panggilannya lewat /api/ai, dan
  // servernyalah yang menyimpan kunci. Cabang OpenRouter/Groq ikut hilang
  // karena keduanya sudah dihapus dari aplikasi.
  const body: any = {
    contents: [{ parts: [{ text: `${systemMsg}\n\n${userPrompt}` }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await panggilGemini(MODEL_UTAMA, body);

      if (res.status === 429 || res.status === 503) {
        const waitMs = attempt * 10000; // 10s, 20s, 30s
        console.warn(`[AI Chunk] Rate limit/Busy 429/503. Waiting ${waitMs}ms (attempt ${attempt}/${retries})...`);
        if (attempt === retries) {
          throw new Error(`Gagal memproses bagian RAB setelah ${retries} percobaan (Rate Limit).`);
        }
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (res.status === 400 || res.status === 401 || res.status === 403) {
        const errBody = await res.text();
        throw new Error(`API Error ${res.status}: API Key salah atau request tidak valid. (${errBody.substring(0, 50)})`);
      }

      if (!res.ok) {
        if (res.status === 404) {
          const errText = await res.text()
          console.warn(`[AI Chunk] Model 404 - response: ${errText.substring(0, 200)}. Trying fallback model gemini-2.0-flash...`)
          const fallbackRes = await panggilGemini(MODEL_CADANGAN, body)
          if (!fallbackRes.ok) {
            const fb404 = await fallbackRes.text()
            throw new Error(`Gagal memproses RAB: Model utama dan fallback gagal (${fallbackRes.status}). Detail: ${fb404.substring(0, 100)}`)
          }
          const fallbackData = await fallbackRes.json()
          const fallbackText = fallbackData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
          if (!fallbackText) return []
          const cleaned = fallbackText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
          try {
            const parsed = JSON.parse(cleaned)
            if (Array.isArray(parsed)) return parsed
            const keys = Object.keys(parsed)
            for (const key of keys) {
              if (Array.isArray(parsed[key]) && parsed[key].length > 0) return parsed[key]
            }
            return []
          } catch { return [] }
        }

        const errBody = await res.text();
        console.error(`[AI Chunk] HTTP ${res.status}: ${errBody.substring(0, 300)}`);
        if (attempt === retries) {
          throw new Error(`Gagal memproses bagian RAB API Error ${res.status}`);
        }
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }

      const data = await res.json();
      const responseText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      
      console.log(`[AI Chunk] attempt:${attempt} len:${responseText.length} preview: ${responseText.substring(0, 120)}`);

      if (!responseText) return [];
      const cleaned = responseText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

      try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) return parsed;
        const keys = Object.keys(parsed);
        for (const key of keys) {
          if (Array.isArray(parsed[key]) && parsed[key].length > 0) return parsed[key];
        }
        return [];
      } catch {
        const start = cleaned.indexOf('[');
        const end = cleaned.lastIndexOf(']');
        if (start !== -1 && end !== -1 && end > start) {
          try {
            const arr = JSON.parse(cleaned.substring(start, end + 1));
            if (Array.isArray(arr) && arr.length > 0) return arr;
          } catch {
            try {
              const partial = cleaned.substring(start);
              const fixed = partial.replace(/,\s*$/, '').replace(/,\s*\{[^}]*$/, '') + ']';
              const arr = JSON.parse(fixed);
              if (Array.isArray(arr)) return arr;
            } catch {}
          }
        }
        return [];
      }
    } catch (err: any) {
      console.error('[AI Chunk] Network error:', err);
      if (attempt === retries) {
        throw new Error(`Gagal (Network Error): ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  return [];
}

async function validateRABWithAI(components: BudgetComponent[]): Promise<BudgetComponent[]> {
  console.log('[RAB Validator] Memulai proses validasi silang...');
  const systemMsg = 'You are a JSON-only API. Respond ONLY with a valid JSON array.';
  const userPrompt = `Saya punya hasil ekstraksi RAB berformat JSON kotor. Tolong bersihkan dengan aturan ketat:
1. HAPUS item yang merupakan "Total", "Subtotal", "Pajak", "PPN", "Jasa Pemborong", "Uang Muka", atau baris rekapitulasi.
2. PERIKSA MATEMATIKANYA: totalPlannedCost HARUS SAMA DENGAN (plannedVolume * unitPrice). Jika ada angka harga satuan yang tidak masuk akal (sangat besar) dan salah posisi koma/titiknya, tolong perbaiki logikanya. Harga material atau unit tidak mungkin ber-desimal, bulatkan.
3. Kembalikan HANYA array JSON rapi berisi item RAB murni.

JSON KOTOR:
${JSON.stringify(components)}
`;

  const body = {
    contents: [{ parts: [{ text: `${systemMsg}\n\n${userPrompt}` }] }],
    generationConfig: { temperature: 0.05, responseMimeType: 'application/json' },
  };

  try {
    const res = await panggilGemini(MODEL_UTAMA, body);
    if (!res.ok) {
      if (res.status === 404) {
        console.warn(`[RAB Validator] Model 404 - trying fallback model gemini-2.0-flash...`)
        const fallbackRes = await panggilGemini(MODEL_CADANGAN, body)
        if (!fallbackRes.ok) return components;
        const fallbackData = await fallbackRes.json()
        const fallbackText = fallbackData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        if (!fallbackText) return components;
        const cleaned = fallbackText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
        const parsed = JSON.parse(cleaned)
        let validated = []
        if (Array.isArray(parsed)) validated = parsed
        else {
          const keys = Object.keys(parsed)
          for (const k of keys) {
            if (Array.isArray(parsed[k])) {
              validated = parsed[k]; break;
            }
          }
        }
        if (validated.length > 0) return validated.map(mapToComponent).filter(c => c.totalPlannedCost > 0);
        return components;
      }
      return components; // fallback jika validasi error
    }
    const data = await res.json();
    
    const responseText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!responseText) return components;

    const cleaned = responseText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const parsed = JSON.parse(cleaned);

    let validated = [];
    if (Array.isArray(parsed)) validated = parsed;
    else {
      const keys = Object.keys(parsed);
      for (const k of keys) {
        if (Array.isArray(parsed[k])) {
          validated = parsed[k]; break;
        }
      }
    }

    if (validated.length > 0) {
      console.log(`[RAB Validator] Validasi selesai: ${components.length} -> ${validated.length}`);
      return validated.map(mapToComponent).filter(c => c.totalPlannedCost > 0);
    }
  } catch (err) {
    console.error('[RAB Validator] Gagal memvalidasi:', err);
  }
  return components;
}

// ── MAIN EXPORT ────────────────────────────────────────────────────────────
export async function parseRABwithGemini(
  extractedText: string,
  onProgress?: (done: number, total: number) => void
): Promise<BudgetComponent[]> {
  // Gemini saja. OpenRouter & Groq dulu terdaftar sebagai cadangan, tetapi
  // hanya terpakai bila kunci Gemini kosong — dan keduanya kini menolak semua
  // panggilan (model gratis OpenRouter tertutup kebijakan data, model Groq yang
  // terdaftar sudah dihentikan). Menyimpannya cuma menukar pesan "kunci Gemini
  // belum dipasang" yang jelas dengan kegagalan yang membingungkan.
  // Tidak ada lagi kunci yang bisa diperiksa dari sini — dan itulah
  // perbaikannya. Bila kunci server belum dipasang, /api/ai menjawabnya sendiri
  // dengan kalimat yang jelas.

  if (!extractedText || extractedText.trim().length < 20) {
    throw new Error("File Excel kosong atau konten tidak bisa dibaca. Pastikan file berisi tabel RAB.");
  }

  // Gemini 2.0 Flash punya context window besar, chunk lebih besar = lebih sedikit request = lebih akurat
  const chunkSize = 12000;
  const chunks = chunkText(extractedText, chunkSize);
  const totalChunks = chunks.length;
  console.log(`[RAB Parser] Total: ${extractedText.length} chars → ${totalChunks} chunks`);

  // Extra step for validation, we pass total progress with +1 steps for UI pacing
  onProgress?.(0, totalChunks + 1);

  const allItems: any[] = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`[RAB Parser] Processing chunk ${i + 1}/${totalChunks}...`);
    
    // Pass retries=4 to ensure it tries properly
    const items = await callAIChunk(chunks[i], 4);
    allItems.push(...items);
    onProgress?.(i + 1, totalChunks + 1);

    if (i < chunks.length - 1) {
      // Delay for rate limits (Gemini punya 15 RPM = max 1 req tiap 4 detik)
      // Karena proses parsing + fetch sudah memakan 2-3 detik, kita tambah 2 detik lagi aman
      await new Promise(r => setTimeout(r, 2500));
    }
  }

  if (allItems.length === 0) {
    throw new Error('AI tidak berhasil mengekstrak item RAB dari file ini. Pastikan file Excel berisi kolom Uraian, Satuan, dan Harga.');
  }

  let components = allItems.map(mapToComponent).filter(c => {
    // Hanya buang jika nama benar-benar kosong/default DAN tidak ada harga sama sekali
    if (c.name === 'Item Pekerjaan' && c.totalPlannedCost === 0 && c.unitPrice === 0) return false;
    if (c.name.trim() === '') return false;
    // Izinkan item yang punya nama meski harga 0 (mungkin item persiapan/ls)
    return true;
  });

  // Lewati validasi AI agar tidak ada item yang hilang — validasi manual dilakukan user di UI
  // components = await validateRABWithAI(components);
  onProgress?.(totalChunks + 1, totalChunks + 1);

  console.log(`[RAB Parser] ✅ Total item bersih final: ${components.length}`);
  return components;
}
