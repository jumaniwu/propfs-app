import { useState } from 'react'
import { Stethoscope, CheckCircle2, XCircle, MinusCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { tesKunciAi, kesimpulanTes, type HasilTes } from '@/lib/tesAi'
import {
  flashTerbaik, lebihBaru, modelPilihan, simpanModelPilihan,
} from '@/lib/pilihanModel'
import { MODEL_UTAMA } from '@/lib/modelAi'

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
  const [dipakai, setDipakai] = useState<string | null>(modelPilihan())

  async function jalankan() {
    setJalan(true)
    try {
      setHasil(await tesKunciAi())
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

      {/* Kotak "kunci yang dipakai aplikasi" dan "uji kunci lain" dihapus
          bersama kuncinya. Keduanya berguna selama kunci masih ikut terbundel
          ke browser; sekarang browser memang tidak memegang apa pun, dan itulah
          perbaikannya. Yang diketuk di bawah ini adalah /api/ai — jalur yang
          benar-benar dipakai fiturnya, bukan tiruannya. */}
      <Button onClick={() => void jalankan()} disabled={jalan} variant="gold" className="font-bold gap-2">
        {jalan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
        {jalan ? 'Menguji…' : 'Tes Sekarang'}
      </Button>

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

          {/* Jawaban atas "bisa tidak naik ke model yang lebih pintar", diambil
              dari katalog Google saat itu juga — bukan dari ingatan siapa pun,
              dan bukan dengan menebak nama lalu menunggu 404. */}
          {hasil.ok && hasil.model.length > 0 && (
            <div data-model-tersedia className="rounded-xl bg-slate-50 border border-border p-3 space-y-2">
              <p className="text-sm font-bold text-navy">
                {hasil.model.length} model tersedia untuk kunci ini
              </p>
              <p className="text-xs text-muted-foreground">
                Aplikasi memakai <b className="text-navy">{dipakai ?? MODEL_UTAMA}</b> untuk
                percakapan dan membaca foto nota.
              </p>
              {/* Naik ke model terbaru TANPA menebak namanya.
                  Nama model tidak boleh ditebak — sudah dua kali tebakan itu
                  merugikan. Yang ditawarkan di sini hanya nama yang BARUSAN
                  dijawab Google untuk kunci ini, jadi memilihnya tidak pernah
                  menambah panggilan yang dijamin gagal. */}
              {(() => {
                const tersedia = hasil.model.map(m => m.nama)
                const terbaik = flashTerbaik(tersedia)
                const sekarang = dipakai ?? MODEL_UTAMA
                if (!terbaik) return null
                if (!lebihBaru(terbaik, sekarang)) {
                  return (
                    <p data-model-mutakhir className="text-xs text-emerald-700 bg-emerald-50
                      border border-emerald-200 rounded-lg p-2">
                      Sudah memakai Flash terbaru yang tersedia: <b>{sekarang}</b>.
                    </p>
                  )
                }
                return (
                  <div data-model-naik className="text-xs bg-gold/10 border border-gold/30
                    rounded-lg p-2 space-y-2">
                    <p>
                      Tersedia Flash yang lebih baru: <b>{terbaik}</b> (sekarang{' '}
                      <b>{sekarang}</b>). Nama ini barusan dijawab Google untuk kunci Anda,
                      jadi ia sudah pasti ada — bukan tebakan.
                    </p>
                    <Button
                      data-pakai-model
                      onClick={() => { simpanModelPilihan(terbaik); setDipakai(terbaik) }}
                      variant="gold" className="h-8 text-xs font-bold"
                    >
                      Pakai {terbaik}
                    </Button>
                  </div>
                )
              })()}
              {dipakai && dipakai !== MODEL_UTAMA && (
                <p className="text-[11px] text-muted-foreground">
                  Pilihan tersimpan di perangkat ini.{' '}
                  <button
                    onClick={() => { simpanModelPilihan(''); setDipakai(null) }}
                    className="underline font-bold"
                  >
                    Kembalikan ke {MODEL_UTAMA}
                  </button>
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {hasil.model.map(m => (
                  <span key={m.nama}
                    className={`text-[10px] font-mono rounded-md px-1.5 py-0.5 border ${
                      m.nama === (dipakai ?? MODEL_UTAMA) ? 'bg-navy text-white border-navy'
                        : m.gambar ? 'bg-gold/15 text-navy border-gold/40'
                        : 'bg-background text-muted-foreground border-border'}`}>
                    {m.nama}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Kotak emas = model gambar (jauh lebih mahal per panggilan).
              </p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">Diuji pukul {waktu}.</p>
        </div>
      )}
    </div>
  )
}
