/**
 * Generator DXF teks murni (format R12/AC1009: POLYLINE/VERTEX/SEQEND +
 * TEXT label, layer per kategori, satuan meter). R12 dipilih karena tidak
 * membutuhkan handle/subclass sehingga diterima semua CAD.
 */
import { centroid, type Point } from './geometry.ts'
import { simpanBerkas } from '../../lib/unduhBerkas.ts'
import type { ParcelType, SiteplanResult } from './layout.ts'

// [nama layer, warna ACI]
export const DXF_LAYERS: Array<[string, number]> = [
  ['BOUNDARY', 7],
  ['JALAN', 8],
  ['KAVLING', 30],
  ['RTH', 3],
  ['FASUM', 5],
  ['KOMERSIAL', 6],
  ['TOWER', 4],
  ['PARKIR', 9],
  ['PLAZA', 40],
  ['LABEL', 2],
]

const TYPE_TO_LAYER: Record<ParcelType, string> = {
  jalan: 'JALAN',
  kavling: 'KAVLING',
  rth: 'RTH',
  fasum: 'FASUM',
  komersial: 'KOMERSIAL',
  tower: 'TOWER',
  parkir: 'PARKIR',
  plaza: 'PLAZA',
}

const n = (v: number) => v.toFixed(3)

export function buildDxf(result: SiteplanResult): string {
  const out: string[] = []
  const w = (...args: string[]) => { out.push(...args) }

  // HEADER
  w('0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '9', '$INSUNITS', '70', '6',
    '0', 'ENDSEC')

  // TABLES → LAYER
  w('0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', String(DXF_LAYERS.length))
  for (const [name, color] of DXF_LAYERS) {
    w('0', 'LAYER', '2', name, '70', '0', '62', String(color), '6', 'CONTINUOUS')
  }
  w('0', 'ENDTAB', '0', 'ENDSEC')

  // ENTITIES
  w('0', 'SECTION', '2', 'ENTITIES')

  const polyline = (layer: string, pts: Point[]) => {
    w('0', 'POLYLINE', '8', layer, '66', '1', '70', '1')
    for (const p of pts) {
      w('0', 'VERTEX', '8', layer, '10', n(p[0]), '20', n(p[1]), '30', '0')
    }
    w('0', 'SEQEND')
  }

  const text = (layer: string, pos: Point, height: number, str: string) => {
    w('0', 'TEXT', '8', layer,
      '10', n(pos[0]), '20', n(pos[1]),
      '40', n(height), '1', str,
      '72', '1', '73', '2',
      '11', n(pos[0]), '21', n(pos[1]))
  }

  polyline('BOUNDARY', result.boundary)

  for (const p of result.parcels) {
    polyline(TYPE_TO_LAYER[p.type], p.polygon)
    if (p.label) text('LABEL', centroid(p.polygon), 1.2, p.label)
  }

  w('0', 'ENDSEC', '0', 'EOF')
  return out.join('\n') + '\n'
}

export function downloadDxf(result: SiteplanResult, filenameBase = 'siteplan'): void {
  const blob = new Blob([buildDxf(result)], { type: 'application/dxf' })
  void simpanBerkas(blob, `${filenameBase}.dxf`, 'application/dxf')
}
