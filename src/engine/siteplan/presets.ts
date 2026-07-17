import type { Point } from './geometry.ts'

export interface SiteplanPreset {
  name: string
  coords: Point[]
}

export const SITEPLAN_PRESETS: SiteplanPreset[] = [
  {
    name: 'Contoh Lahan 1 (Trapesium ±1 ha)',
    coords: [[0, 0], [120, 0], [115, 85], [5, 80]],
  },
  {
    name: 'Contoh Lahan 2 (Tidak Beraturan ±1,2 ha)',
    coords: [[0, 0], [150, 10], [160, 90], [90, 100], [80, 60], [0, 70]],
  },
]
