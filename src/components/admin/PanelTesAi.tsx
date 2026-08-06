import { useState } from 'react'
import { Stethoscope, CheckCircle2, XCircle, MinusCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { tesKunciAi, kesimpulanTes, sidikKunci, kunciTerpasang, type HasilTes } from '@/lib/tesAi'

/**
 * Memeriksa kunci AI, sekarang juga.
 *
 * Tanpa ini, satu-satunya cara mengetahui apakah kunci sudah pulih adalah
 * membuka Chat AI, mengetik pesan, melampirkan foto, lalu menunggu — mahal
 * untuk pertanyaan yang jawabannya "sudah" atau "belum", dan perubahan izin di
 * sisi Google sering baru berlaku beberapa saat setelah penagihan dibereskan,
 * sehingga pertanyaannya perlu diulang beberapa kali.
 */
export default function PanelTesAi() {
  const [jalan, setJalan] = useState(false)
  const [hasil, setHasil] = useState<HasilTes | null>(null)
  const [waktu, setWaktu] = useState<string>('')
  const [kunciCoba, setKunciCoba] = useState('')

  async function jalankan(manual?: string) {
    setJalan(true)
    try {
      setHasil(await tesKunciAi(manual))
      setWaktu(new Date().toLocaleTimeString('id-ID'))
    } finally { setJalan(false) }
  }

  const simpul = kesimpulanTes(hasil)
  const dg = hasil?.diagnosa ?? null

  return (
    <div data-tes-ai className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Stethoscope className="h-5 w-5 text-gold" />
        <h2 className="font-serif text-xl font-bold">Tes Koneksi Gemini</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Mengetuk Gemini dengan permintaan sekecil mungkin, lalu melaporkan apa yang
        dijawab — termasuk kalimat asli dari Google, yang biasanya menyebut sendiri
        apa yang harus diperbaiki.
      </p>

      {/* Kunci mana yang BENAR-BENAR dipakai build ini. Setelah membayar, sebab
          403 yang paling sering adalah kunci dari project lain — dan itu tidak
          bisa dibuktikan bila kuncinya tak terlihat sama sekali. */}
      <div className="rounded-xl bg-slate-50 border border-border p-3">
        <p className="text-[11px] text-muted-foreground">Kunci yang dipakai aplikasi saat ini</p>
        <p data-sidik-kunci className="text-sm font-mono font-bold text-navy break-all">
          {sidikKunci(kunciTerpasang())}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Cocokkan dengan kunci di Google AI Studio. Bila berbeda, aplikasi memakai kunci lain
          dari yang Anda kira — dan itu sudah cukup menjelaskan 403.
        </p>
      </div>

      <Button onClick={() => void jalankan()} disabled={jalan} variant="gold" className="font-bold gap-2">
        {jalan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
        {jalan ? 'Menguji…' : 'Tes Sekarang'}
      </Button>

      {/* Menguji kunci lain tanpa deploy.
          Tanpa ini, membuktikan satu kunci baru berarti mengubah environment
          variable, menunggu build, lalu menguji — beberapa menit untuk satu
          percobaan, padahal sebab 403 ada empat dan biasanya perlu dicoba
          bergantian. Kunci yang diketik di sini tidak disimpan ke mana pun. */}
      <details className="rounded-xl border border-border">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-bold text-navy">
          Uji kunci lain dulu (tanpa deploy)
        </summary>
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Buat kunci baru di project yang <b>dibayar</b>, tempel di sini, lalu uji. Kunci ini
            hanya dipakai untuk satu pengujian dan tidak disimpan.
          </p>
          <input
            data-kunci-coba
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={kunciCoba}
            onChange={e => setKunciCoba(e.target.value)}
            placeholder="AIzaSy…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
          />
          <Button
            onClick={() => void jalankan(kunciCoba)}
            disabled={jalan || !kunciCoba.trim()}
            variant="outline" className="font-bold gap-2 w-full"
          >
            <Stethoscope className="h-4 w-4" />
            Uji kunci ini
          </Button>
        </div>
      </details>

      {hasil && (
        <div className="space-y-3">
          <div data-tes-status={hasil.ok ? 'ok' : 'gagal'}
            className={`flex items-start gap-2.5 rounded-xl border p-3 ${
              hasil.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
            {!hasil.adaKunci ? <MinusCircle className="h-4 w-4 mt-0.5 shrink-0" />
              : hasil.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
            <div className="min-w-0">
              {/* Saat gagal, penjelasannya sudah dibawa kartu diagnosis di
                  bawah. Mengulangnya di sini hanya membuat kalimat yang sama
                  tercetak dua kali dan mengaburkan mana yang perlu dibaca. */}
              <p className="text-sm font-bold">{hasil.ok ? simpul.pesan : hasil.pesan}</p>
              {hasil.adaKunci && <p className="text-xs opacity-80">{hasil.ms} ms</p>}
              <p className="text-[11px] opacity-70 font-mono break-all mt-0.5">
                {hasil.sumberKunci === 'manual' ? 'Kunci yang diketik' : 'Kunci aplikasi'}: {hasil.sidik}
              </p>
            </div>
          </div>

          {/* Sebelumnya di sini hanya ada tiga kemungkinan yang harus ditebak
              sendiri. Sekarang sebabnya sudah dipersempit menjadi satu. */}
          {dg && !hasil.ok && (
            <div data-tes-diagnosa={dg.sebab}
              className="rounded-xl bg-slate-50 border border-border p-3 space-y-2">
              <p className="text-sm font-bold text-navy">{dg.apa}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{dg.perbaikan}</p>
              {dg.tautan && (
                <a href={dg.tautan} target="_blank" rel="noopener noreferrer"
                  className="inline-block text-xs font-bold text-gold underline break-all">
                  Buka halaman perbaikannya →
                </a>
              )}
              {dg.asli && (
                <p className="text-[11px] text-muted-foreground border-t border-border pt-2 break-words">
                  <b>Kata Google:</b> {dg.asli}
                </p>
              )}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">Diuji pukul {waktu}.</p>
        </div>
      )}
    </div>
  )
}
