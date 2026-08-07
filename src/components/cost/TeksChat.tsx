import { uraikanMarkdown, potongGaya, type Bagian } from '@/lib/markdownChat'

/**
 * Menggambar balasan AI.
 *
 * SATU penggambar untuk semua chat. Sebelumnya ada dua: `MarkdownText` di tab
 * Realisasi yang bisa menggambar tabel, dan `Teks` di halaman Chat AI yang
 * tidak — sehingga tabel rekap yang dikirim model keluar sebagai deretan pipa
 * di halaman yang justru paling sering dipakai. Dua salinan untuk satu
 * pekerjaan selalu berakhir begitu; yang tertinggal tidak pernah ketahuan
 * sampai ada yang melaporkannya.
 *
 * Penguraiannya ada di `lib/markdownChat.ts` dan diuji di Node; berkas ini
 * sengaja hanya menggambar.
 */
function Isi({ teks }: { teks: string }) {
  return (
    <>
      {potongGaya(teks).map((s: Bagian, i) =>
        s.gaya === 'tebal' ? <b key={i} className="font-bold">{s.teks}</b>
        : s.gaya === 'kode' ? <code key={i} className="font-mono text-[11px] bg-black/5 rounded px-1 py-0.5">{s.teks}</code>
        : <span key={i}>{s.teks}</span>)}
    </>
  )
}

export default function TeksChat({ text }: { text: string }) {
  const blok = uraikanMarkdown(text)
  return (
    <div className="text-[13px] leading-relaxed space-y-1.5">
      {blok.map((b, i) => {
        switch (b.jenis) {
          case 'tabel':
            return (
              <div key={i} className="my-2">
                {/* Tabel nota tetap lebih lebar daripada layar ponsel meski
                    gelembungnya sudah dilebarkan. Ia digulung SENDIRI —
                    halamannya tidak ikut bergeser. */}
                <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
                  <table className="w-full text-[11px]">
                    <thead className="bg-navy/5 text-navy">
                      <tr>
                        {b.kepala.map((h, j) => (
                          <th key={j} className="px-2 py-1.5 text-left font-bold whitespace-nowrap">
                            <Isi teks={h} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {b.baris.map((r, j) => (
                        <tr key={j}>
                          {r.map((c, k) => (
                            // Angka rata kanan: kolom harga yang rata kiri
                            // membuat ribuan dan jutaan tidak bisa dibandingkan
                            // sekilas, dan itulah gunanya tabel ini ada.
                            <td key={k} className={`px-2 py-1.5 align-top ${
                              /^[Rp\s.,\d()%-]+$/.test(c) && /\d/.test(c)
                                ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>
                              <Isi teks={c} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Kolom yang tidak muat tidak akan pernah dicari orang yang
                    tidak tahu ia ada di sana. Pada rekap nota, kolom terjauh
                    justru Total. */}
                {b.kepala.length > 3 && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Geser tabel ke samping untuk melihat kolom {b.kepala[b.kepala.length - 1]}.
                  </p>
                )}
              </div>
            )
          case 'judul': {
            const ukuran = b.tingkat === 1 ? 'text-[15px]' : b.tingkat === 2 ? 'text-sm' : 'text-[13px]'
            return <p key={i} className={`font-bold text-navy mt-2 ${ukuran}`}><Isi teks={b.teks} /></p>
          }
          case 'daftar': {
            const Tag = b.urut ? 'ol' : 'ul'
            return (
              <Tag key={i} className={`ml-4 space-y-0.5 ${b.urut ? 'list-decimal' : 'list-disc'}`}>
                {b.butir.map((t, j) => <li key={j} className="pl-0.5"><Isi teks={t} /></li>)}
              </Tag>
            )
          }
          case 'kode':
            return (
              <pre key={i} className="overflow-x-auto rounded-lg bg-black/5 p-2 text-[11px] font-mono">
                {b.isi}
              </pre>
            )
          case 'jeda':
            return <div key={i} className="h-1.5" />
          default:
            return <p key={i} className="break-words"><Isi teks={b.teks} /></p>
        }
      })}
    </div>
  )
}
