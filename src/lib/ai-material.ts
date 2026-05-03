import { BudgetComponent, MaterialScheduleItem } from '../types/cost.types'
import { v4 as uuidv4 } from 'uuid'

// ── GROQ API (FREE & FAST) ────────────────────────────────────────────────
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function buildMaterialPrompt(rabSummaryChunk: string): string {
  return `Anda adalah Quantity Surveyor (QS) profesional ahli AHSP (Analisa Harga Satuan Pekerjaan) Indonesia.

Berdasarkan daftar pekerjaan RAB berikut, identifikasi SEMUA material/bahan bangunan yang diperlukan sesuai koefisien AHSP SNI standar Indonesia.

Aturan PENTING:
1. Nama material harus SPESIFIK (contoh: "Semen Portland Tipe I 50kg", "Bata Merah 23x11x5cm", "Besi Beton D10").
2. Volume dihitung berdasarkan koefisien AHSP yang relevan. WAJIB logis — jika anggaran hanya Rp5juta, volume semen TIDAK mungkin 10.000 sak.
3. Satuan tepat: sak, kg, m3, m2, lembar, batang, liter, buah, unit, dll.
4. Harga satuan adalah harga pasar Indonesia saat ini (2024-2026).
5. CROSSCHECK: eV (volume) × eUP (harga satuan) harus proporsional dengan Anggaran Material pekerjaan tersebut.
6. ABAIKAN: biaya upah, sewa alat, pekerjaan persiapan non-material (land clearing, dll).
7. Setiap material perlu mencantumkan pekerjaan yang membutuhkannya.

Format WAJIB: JSON Array murni tanpa markdown, tanpa komentar, tanpa karakter ribuan (titik/koma) pada angka:
[
  {
    "mN": "Semen Portland Tipe I 50kg",
    "eV": 120,
    "u": "sak",
    "eUP": 58000,
    "lT": ["Pekerjaan Beton Kolom K-225", "Pekerjaan Plester Dinding"]
  }
]

DAFTAR PEKERJAAN RAB:
${rabSummaryChunk}
`;
}

function parseSafeNum(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let str = String(val).replace(/[^\d,\.-]/g, '');
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  } else if ((str.match(/\./g) || []).length > 1) {
    str = str.replace(/\./g, '');
  }
  const num = Number(str);
  return isNaN(num) ? 0 : num;
}

function mapToMaterialItem(item: any): MaterialScheduleItem {
  const vol = parseSafeNum(item.eV ?? item.estimatedVolume ?? item.volume ?? 0);
  const up = parseSafeNum(item.eUP ?? item.estimatedUnitPrice ?? item.harga ?? 0);

  return {
    id: uuidv4(),
    materialName: item.mN || item.materialName || item.nama || 'Material Tidak Diketahui',
    estimatedVolume: vol,
    unit: item.u || item.unit || item.satuan || 'ls',
    estimatedUnitPrice: up,
    estimatedTotalCost: Number(item.estimatedTotalCost ?? (vol * up)),
    linkedTasks: Array.isArray(item.lT || item.linkedTasks) ? (item.lT || item.linkedTasks) : [],
  };
}

async function callAIMaterialChunk(provider: string, apiKey: string, chunk: string, retries = 3): Promise<any[]> {
  const systemMsg = 'You are a JSON-only API. You MUST respond with ONLY a valid JSON array, no markdown, no explanation.';
  const userPrompt = buildMaterialPrompt(chunk);
  
  let url = '';
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: any = {};

  if (provider === 'gemini') {
    url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    body = {
      contents: [{ parts: [{ text: systemMsg + '\n\n' + userPrompt }] }],
      generationConfig: { 
        temperature: 0.1, 
        responseMimeType: 'application/json'
      }
    };
  } else {
    url = provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions';
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    body = {
      model: provider === 'openrouter' ? 'meta-llama/llama-3.3-70b-instruct' : 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.05,
      response_format: { type: 'json_object' }
    };
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

      if (res.status === 429 || res.status === 503) {
        const waitMs = attempt * 8000;
        console.warn(`[AI Material] Rate limit/Busy processing chunk. Waiting ${waitMs}ms (attempt ${attempt}/${retries})...`);
        if (attempt === retries) return [];
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (!res.ok) {
        const errBody = await res.text();
        console.error(`[AI Material] HTTP ${res.status}: ${errBody.substring(0, 300)}`);
        if (attempt === retries) throw new Error(`API Error: ${errBody.substring(0, 50)}...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      const data = await res.json();
      let responseText = '';
      if (provider === 'gemini') {
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      } else {
        responseText = data.choices?.[0]?.message?.content ?? '';
      }

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
            if (Array.isArray(arr)) return arr;
          } catch {
            try {
              const partial = cleaned.substring(start);
              const fixed = partial.replace(/,\s*$/, '').replace(/,\s*\{[^}]*$/, '') + ']';
              const arr = JSON.parse(fixed);
              if (Array.isArray(arr)) return arr;
            } catch {
              console.warn('[AI Material] JSON repair failed.');
            }
          }
        }
        return [];
      }
    } catch (err) {
      console.error('[AI Material] Network error:', err);
      if (attempt === retries) {
          if (err instanceof Error) throw err;
          return [];
      }
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return [];
}

export async function predictMaterialSchedule(
  components: BudgetComponent[]
): Promise<MaterialScheduleItem[]> {
  const geminiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
  const groqKey = (import.meta as any).env.VITE_GROQ_API_KEY;
  const orKey = (import.meta as any).env.VITE_OPENROUTER_API_KEY;
  
  // Prioritas: Gemini (terbaik untuk reasoning AHSP) → OpenRouter → Groq
  let provider = '';
  let activeKey = '';

  if (geminiKey) {
    provider = 'gemini';
    activeKey = geminiKey;
  } else if (orKey) {
    provider = 'openrouter';
    activeKey = orKey;
  } else if (groqKey) {
    provider = 'groq';
    activeKey = groqKey;
  }

  if (!activeKey) throw new Error('API Key tidak ditemukan di .env.local');

  // Filter pekerjaan fisik (termasuk yang unitMaterialCost == 0 karena mungkin ada material quant)
  const validComponents = components.filter(c => 
    ['bangunan', 'infrastruktur', 'lahan'].includes(c.categoryId) &&
    c.plannedVolume > 0
  );

  // Chunking: Gemini bisa handle lebih besar, Groq lebih kecil
  const CHUNK_SIZE = provider === 'gemini' ? 50 : 30;
  const rabChunks: string[] = [];
  
  for (let i = 0; i < validComponents.length; i += CHUNK_SIZE) {
    const slice = validComponents.slice(i, i + CHUNK_SIZE);
    const chunkText = slice.map(c => {
      const budgetMaterial = (c.unitMaterialCost ?? 0) > 0
        ? `Rp${((c.unitMaterialCost ?? 0) * c.plannedVolume).toLocaleString('id-ID')}`
        : `Rp${(c.totalPlannedCost * 0.6).toFixed(0)} (estimasi 60% dari total)`;
      return `- ${c.name} | Vol: ${c.plannedVolume} ${c.unit} | Anggaran Material: ${budgetMaterial}`;
    }).join('\n');
    rabChunks.push(chunkText);
  }

  const allMaterials: any[] = [];

  for (let i = 0; i < rabChunks.length; i++) {
    console.log(`[Material AI] Memproses Part ${i + 1}/${rabChunks.length}`);
    const items = await callAIMaterialChunk(provider, activeKey, rabChunks[i]);
    allMaterials.push(...items);
    
    if (i < rabChunks.length - 1) {
      await new Promise(r => setTimeout(r, provider === 'groq' ? 2000 : 1500));
    }
  }

  if (allMaterials.length === 0) {
    throw new Error('AI tidak berhasil mengalkulasi schedule material.');
  }

  // Merge identical materials (Case Insensitive + fuzzy matching could be better, but exact match for now)
  const mergedMap = new Map<string, MaterialScheduleItem>();

  for (const raw of allMaterials) {
    const item = mapToMaterialItem(raw);
    const key = item.materialName.trim().toLowerCase();
    
    if (mergedMap.has(key)) {
      const existing = mergedMap.get(key)!;
      existing.estimatedVolume += item.estimatedVolume;
      existing.estimatedTotalCost += item.estimatedTotalCost;
      // Merge unique tasks
      existing.linkedTasks = Array.from(new Set([...existing.linkedTasks, ...item.linkedTasks]));
    } else {
      mergedMap.set(key, item);
    }
  }

  const finalList = Array.from(mergedMap.values());
  // Sort by highest cost impact
  return finalList.sort((a, b) => b.estimatedTotalCost - a.estimatedTotalCost);
}
