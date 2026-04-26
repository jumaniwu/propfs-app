import { useNavigate } from 'react-router-dom'
import { Calendar, MapPin, MoreVertical, Copy, Trash2, BarChart2, Edit } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import StatusBadge from './StatusBadge'
import { formatRupiah } from '@/engine/formatter'
import type { SavedProject } from '@/types/fs.types'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ProjectCardProps {
  project: SavedProject
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}

export default function ProjectCard({ project, onDelete, onDuplicate }: ProjectCardProps) {
  const navigate = useNavigate()
  
  if (!project) return null
  const r = project?.results || null

  try {
    return (
      <Card className="group hover:shadow-md transition-all duration-200 hover:border-gold/40 overflow-hidden">
        <div className="h-1 bg-gold-gradient" />
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-serif font-semibold text-base text-foreground truncate leading-tight">
                {project.name || 'Proyek Tanpa Nama'}
              </h3>
              {project.inputs?.alamatLokasi && (
                <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{project.inputs.alamatLokasi}</span>
                </div>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => navigate(`/input/${project.id}`)}>
                  <Edit className="h-4 w-4 mr-2" /> Edit Input
                </DropdownMenuItem>
                {r && (
                  <DropdownMenuItem onClick={() => navigate(`/result/${project.id}`)}>
                    <BarChart2 className="h-4 w-4 mr-2" /> Lihat Hasil
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onDuplicate(project.id)}>
                  <Copy className="h-4 w-4 mr-2" /> Duplikat
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(project.id)
                  }}
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Hapus
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {r ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/50 rounded-lg p-2.5">
                  <div className="text-xs text-muted-foreground mb-0.5">Gross Revenue</div>
                  <div className="font-mono font-semibold text-sm text-foreground">
                    {formatRupiah(Number(r.grossRevenue) || 0, true)}
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5">
                  <div className="text-xs text-muted-foreground mb-0.5">Net Margin</div>
                  <div className={`font-mono font-semibold text-sm ${(Number(r.netMargin) || 0) >= 20 ? 'text-green-700' : (Number(r.netMargin) || 0) >= 10 ? 'text-amber-700' : 'text-red-700'}`}>
                    {Number((Number(r.netMargin) || 0)).toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <StatusBadge status={r.statusKelayakan || 'tidak_layak'} size="sm" />
                <span className="text-xs text-muted-foreground">
                  {Number(r.totalUnit) || 0} unit
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Belum dikalkulasi</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{project.updatedAt ? new Date(project.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</span>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => navigate(`/input/${project.id}`)}>
                Edit
              </Button>
              {r && (
                <Button size="sm" variant="gold" className="h-7 text-xs px-2" onClick={() => navigate(`/result/${project.id}`)}>
                  Hasil FS
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  } catch (e) {
    return <Card className="bg-red-50 p-4 border-red-200">Error Rendering Project</Card>
  }
}
