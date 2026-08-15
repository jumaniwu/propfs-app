import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { siapkanNative } from './lib/jembatanNative'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Perilaku khusus APK Android: tombol kembali perangkat, warna bilah status,
// splash. Di web seluruhnya tidak berbuat apa-apa dan tidak menyeret satu
// paket pun ke dalam bundel. Dipanggil SETELAH render supaya kegagalan apa
// pun di dalamnya tidak pernah bisa menahan aplikasinya tampil.
void siapkanNative()
