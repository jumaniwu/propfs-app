import { Building2, Calendar, FileText, Trash2, MapPin, MoreVertical, LayoutDashboard } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SavedCostProject } from '@/store/costStore'

interface CostProjectCardProps {
  project: SavedCostProject
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}

export default function CostProjectCard({ project, onOpen, onDelete }: CostProjectCardProps) {
  const { info, plan, updatedAt } = project

  return (
    <Card className="group relative overflow-hidden flex flex-col hover:border-gold/50 transition-all hover:shadow-xl hover:shadow-gold/5 hover:-translate-y-1">
      {/* Decorative top border */}
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-gold/50 to-navy opacity-0 group-hover:opacity-100 transition-opacity" />

      <CardContent className="p-0 flex flex-col h-full bg-white dark:bg-card">
        <div className="p-5 pb-4 flex-1">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-navy/5 dark:bg-gold/10 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-navy dark:text-gold" />
              </div>
              <div className="min-w-0">
                <h3 className="font-serif font-bold text-base truncate text-foreground pr-2" title={info.projectName}>
                  {info.projectName}
                </h3>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                  <MapPin className="w-3 h-3" />
                  <span className="truncate">{info.location || 'Lokasi belum diset'}</span>
                </div>
              </div>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 text-muted-foreground hover:text-foreground">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 rounded-xl">
                <DropdownMenuItem className="text-destructive gap-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); onDelete(info.id) }}>
                  <Trash2 className="h-4 w-4" /> Hapus Proyek
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-4 mt-5">
            {/* Budget Info */}
            <div className="p-3 bg-muted/40 rounded-xl border border-border">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Total RAB Proyek</p>
              <p className="font-mono text-lg font-bold text-navy dark:text-gold tracking-tight">
                Rp {plan ? plan.totalBaselineBudget.toLocaleString('id-ID') : '0'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 shrink-0" />
                <span>{plan?.components.length || 0} Pekerjaan</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 shrink-0" />
                <span>Durasi: {info.targetDurationMonths} Bln</span>
              </div>
            </div>
          </div>
        </div>

        <div className="py-3 px-5 border-t border-border bg-muted/20 flex items-center justify-between mt-auto">
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            Diperbarui: {new Date(updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <Button size="sm" variant="gold" onClick={() => onOpen(info.id)} className="h-8 gap-1.5 rounded-lg font-bold px-4 hover:scale-105 transition-transform">
            <LayoutDashboard className="w-3.5 h-3.5" /> Buka
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
