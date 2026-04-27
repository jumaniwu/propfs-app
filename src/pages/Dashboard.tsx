import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, SortAsc, Building2, FileJson,
  Upload, AlertCircle, CheckCircle2, X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Header from '@/components/layout/Header'

import ProjectCard from '@/components/shared/ProjectCard'
import { useFSStore } from '@/store/fsStore'
import { useAuthStore } from '@/store/authStore'
import { useSubscription } from '@/hooks/useSubscription'
import { toast } from '@/hooks/use-toast'
import { importFromJSON, exportToJSON } from '@/utils/export'
import { hasLocalProjects, migrateLocalToSupabase, clearLocalStorage } from '@/utils/migrate'
import { supabase } from '@/lib/supabase'
import type { SavedProject } from '@/types/fs.types'

type SortKey = 'date' | 'name' | 'status' | 'revenue'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const projects        = useFSStore(s => s.projects)
  const fetchProjects   = useFSStore(s => s.fetchProjects)
  const createProject   = useFSStore(s => s.createProject)
  const loadProject     = useFSStore(s => s.loadProject)
  const deleteProject   = useFSStore(s => s.deleteProject)
  const duplicateProject = useFSStore(s => s.duplicateProject)

  const { canCreateProject, isSubscriptionEnabled, currentPlan, maxProjects, freeProjectsUsed, projectSlotPermanent } = useSubscription()

  const [search, setSearch]             = useState('')
  const [sortKey, setSortKey]           = useState<SortKey>('date')
  const [showMigrate, setShowMigrate]   = useState(false)
  const [migrating, setMigrating]       = useState(false)
  const [migResult, setMigResult]       = useState<{ migrated: number; errors: number } | null>(null)
  const [loading, setLoading]           = useState(true)
  const [projectToDelete, setProjectToDelete] = useState<SavedProject | null>(null)

  // Load projects from Supabase on mount
  useEffect(() => {
    if (user) {
      // Supabase mode: fetch from DB
      fetchProjects().finally(() => setLoading(false))
      if (hasLocalProjects()) setShowMigrate(true)
    } else {
      // DEV mode (no user): load from localStorage immediately
      fetchProjects().finally(() => setLoading(false))
    }
  }, [user])

  const filtered = useMemo(() => {
    try {
      const q = search.toLowerCase()
      return projects.filter(p => !p ? false : (
        !q ||
        (p?.name || '').toLowerCase().includes(q) ||
        (p?.inputs?.alamatLokasi || '').toLowerCase().includes(q)
      ))
        .sort((a, b) => {
          switch (sortKey) {
            case 'name':    return (a?.name || '').localeCompare(b?.name || '')
            case 'date':    return new Date(b?.updatedAt || 0).getTime() - new Date(a?.updatedAt || 0).getTime()
            case 'status':  return (a?.results?.statusKelayakan || 'z').localeCompare(b?.results?.statusKelayakan || 'z')
            case 'revenue': return (b?.results?.grossRevenue || 0) - (a?.results?.grossRevenue || 0)
            default:        return 0
          }
        })
    } catch (e) {
      console.error("Error sorting projects", e);
      return [];
    }
  }, [projects, search, sortKey])

  // Check project creation limit
  const activeCount = projects.length
  const canAdd = canCreateProject(activeCount)

  async function handleNewProject() {
    if (!canAdd) {
      toast({
        title: 'Batas proyek tercapai',
        description: isSubscriptionEnabled
          ? `Upgrade plan untuk membuat lebih banyak proyek.`
          : 'Anda sudah mencapai batas proyek.',
        variant: 'destructive',
      })
      return
    }
    try {
      const id = await createProject()
      navigate(`/input/${id}`)
    } catch (e: any) {
      toast({ title: 'Gagal membuat proyek', description: e.message, variant: 'destructive' })
    }
  }

  async function handleDuplicate(id: string) {
    if (!canAdd) {
      toast({
        title: 'Batas proyek tercapai',
        description: 'Hapus proyek lain atau upgrade plan terlebih dahulu.',
        variant: 'destructive',
      })
      return
    }
    try {
      await duplicateProject(id)
      toast({ title: 'Proyek diduplikat', variant: 'success' as any })
    } catch (e: any) {
      console.error("Duplicate error:", e)
      toast({ 
        title: 'Gagal menduplikat proyek', 
        description: e.message || 'Terjadi kesalahan sistem', 
        variant: 'destructive' 
      })
    }
  }

  async function handleDelete(id: string) {
    const project = projects.find(p => p.id === id)
    if (project) setProjectToDelete(project)
  }

  async function confirmDelete() {
    if (!projectToDelete) return
    const id = projectToDelete.id
    
    try {
      await deleteProject(id)
      setProjectToDelete(null)
      toast({ title: 'Proyek berhasil dihapus' })
    } catch (e: any) {
      console.error("Delete error:", e)
      toast({ 
        title: 'Gagal menghapus proyek', 
        description: e.message || 'Terjadi kesalahan pada server', 
        variant: 'destructive' 
      })
    }
  }

  async function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      if (!canAdd) {
        toast({ title: 'Batas proyek tercapai', variant: 'destructive' })
        return
      }
      try {
        const project = await importFromJSON(file)
        // Insert directly to Supabase
        await supabase.from('projects').upsert({
          id:         project.id,
          user_id:    user!.id,
          name:       project.name,
          inputs:     project.inputs,
          results:    project.results,
          version:    project.version,
          created_at: project.createdAt,
          updated_at: project.updatedAt,
        }, { onConflict: 'id', ignoreDuplicates: true })
        await fetchProjects()
        toast({ title: 'Proyek berhasil diimport', variant: 'success' as any })
      } catch {
        toast({ title: 'Gagal mengimport file', variant: 'destructive' })
      }
    }
    input.click()
  }

  async function handleMigrate() {
    if (!user) return
    setMigrating(true)
    try {
      const result = await migrateLocalToSupabase(user.id)
      setMigResult({ migrated: result.migrated, errors: result.errors })
      if (result.migrated > 0) {
        await fetchProjects()
        clearLocalStorage()
      }
    } finally {
      setMigrating(false)
    }
  }

  // Project limit indicator helper
  const limitLabel = isSubscriptionEnabled
    ? projectSlotPermanent
      ? `${Math.max(0, maxProjects - freeProjectsUsed)} slot tersisa (Free)`
      : `${activeCount}/${maxProjects} proyek`
    : null

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* ── Migration Banner ── */}
      {showMigrate && !migResult && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Kami menemukan data proyek lama di perangkat ini. Mau dipindahkan ke akun Anda?
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" className="border-amber-400 text-amber-800 hover:bg-amber-100 gap-1.5"
                onClick={handleMigrate} disabled={migrating}>
                <Upload className="h-3.5 w-3.5" />
                {migrating ? 'Memindahkan...' : 'Ya, Pindahkan'}
              </Button>
              <button onClick={() => setShowMigrate(false)} className="text-amber-600 hover:text-amber-800">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Migration Success ── */}
      {showMigrate && migResult && (
        <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-700 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              <p className="text-sm text-green-800 dark:text-green-300">
                {migResult.migrated} proyek berhasil dipindahkan ke akun Anda.
                {migResult.errors > 0 && ` (${migResult.errors} gagal)`}
              </p>
            </div>
            <button onClick={() => setShowMigrate(false)} className="text-green-600 hover:text-green-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-8 space-y-8">
        {/* Hero */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl lg:text-3xl font-bold text-navy dark:text-gold">
              Dashboard Proyek
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {projects.length} proyek tersimpan
              {limitLabel && <span className="ml-2 text-xs text-muted-foreground">· {limitLabel}</span>}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleImport} className="gap-2">
              <FileJson className="h-4 w-4" />
              Import JSON
            </Button>
            <Button
              variant="gold"
              onClick={() => {
                if (!canAdd) {
                  if (isSubscriptionEnabled) navigate('/pricing')
                  else toast({ title: 'Batas proyek tercapai', variant: 'destructive' })
                } else {
                  handleNewProject()
                }
              }}
              className="gap-2"
              title={!canAdd ? 'Batas proyek tercapai' : 'Buat proyek baru'}
            >
              <Plus className="h-4 w-4" />
              Buat Proyek Baru
              {!canAdd && isSubscriptionEnabled && <span className="text-xs opacity-75 ml-1">— Upgrade</span>}
            </Button>
          </div>
        </div>

        {/* Search & Sort */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama proyek atau lokasi…"
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground whitespace-nowrap">
              <SortAsc className="h-4 w-4" /> Urutkan:
            </span>
            {([['date', 'Terbaru'], ['name', 'Nama'], ['revenue', 'Revenue'], ['status', 'Status']] as [SortKey, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                  sortKey === key
                    ? 'bg-navy text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-10 h-10 mx-auto border-4 border-gold border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-muted-foreground text-sm">Memuat proyek...</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onCreate={() => canAdd ? handleNewProject() : navigate('/pricing')} search={search} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
              />
            ))}
          </div>
        )}

        {/* Subscription limit notice */}
        {isSubscriptionEnabled && !canAdd && (
          <div className="rounded-2xl border-2 border-gold/30 bg-gold/5 p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-sm text-foreground">
                {currentPlan === 'free' ? '🔒 Batas Free Plan Tercapai' : '🔒 Batas Proyek Tercapai'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentPlan === 'free'
                  ? `Anda sudah membuat ${freeProjectsUsed} proyek (maks Free: 2). Upgrade untuk melanjutkan.`
                  : `Anda sudah mencapai batas ${maxProjects} proyek. Hapus proyek atau upgrade plan.`}
              </p>
            </div>
            <Button variant="gold" size="sm" onClick={() => navigate('/pricing')} className="shrink-0">
              Upgrade Plan
            </Button>
          </div>
        )}
      </main>

      {/* Template dialog removed — project created immediately */}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Hapus Proyek
            </DialogTitle>
            <DialogDescription className="pt-2">
              Apakah Anda yakin ingin menghapus proyek <strong>"{projectToDelete?.name}"</strong>?
              <br />
              Tindakan ini tidak dapat dibatalkan.
              {projectSlotPermanent && (
                <div className="mt-3 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-100 italic">
                  ⚠ Untuk plan Free, slot proyek yang dihapus tidak akan kembali.
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setProjectToDelete(null)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Ya, Hapus Sekarang
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EmptyState({ onCreate, search }: { onCreate: () => void; search: string }) {
  if (search) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Tidak ada proyek yang cocok dengan "<strong>{search}</strong>"</p>
      </div>
    )
  }
  return (
    <div className="py-24 text-center space-y-4">
      <div className="w-20 h-20 mx-auto bg-muted rounded-2xl flex items-center justify-center">
        <Building2 className="h-10 w-10 text-muted-foreground" />
      </div>
      <div>
        <h3 className="font-serif font-semibold text-lg">Belum Ada Proyek</h3>
        <p className="text-muted-foreground text-sm mt-1">Buat proyek FS pertama Anda untuk memulai</p>
      </div>
      <Button variant="gold" onClick={onCreate} className="gap-2">
        <Plus className="h-4 w-4" />
        Buat Proyek Baru
      </Button>
    </div>
  )
}
