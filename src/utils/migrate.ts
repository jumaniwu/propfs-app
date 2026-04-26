// ============================================================
// PropFS — Migrate localStorage projects → Supabase
// Called after user first signs in, if localStorage has projects
// ============================================================

import { supabase } from '../lib/supabase'
import type { SavedProject } from '../types/fs.types'

const LS_KEY = 'propfs-storage'

export interface MigrateResult {
  migrated: number
  skipped:  number
  errors:   number
}

/**
 * Check if there are legacy projects in localStorage
 */
export function hasLocalProjects(): boolean {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.state?.projects) && parsed.state.projects.length > 0
  } catch {
    return false
  }
}

/**
 * Read projects from old localStorage format
 */
export function getLocalProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return parsed?.state?.projects ?? []
  } catch {
    return []
  }
}

/**
 * Migrate local projects to Supabase.
 * Already-migrated projects (same id) are skipped via ON CONFLICT DO NOTHING.
 */
export async function migrateLocalToSupabase(userId: string): Promise<MigrateResult> {
  const projects = getLocalProjects()
  if (projects.length === 0) return { migrated: 0, skipped: 0, errors: 0 }

  let migrated = 0, skipped = 0, errors = 0

  for (const p of projects) {
    const { error } = await supabase.from('projects').upsert({
      id:         p.id,
      user_id:    userId,
      name:       p.name,
      inputs:     p.inputs,
      results:    p.results,
      version:    p.version ?? '1.0.0',
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    }, { onConflict: 'id', ignoreDuplicates: true })

    if (error) {
      errors++
    } else {
      migrated++
    }
  }

  // Update total_projects_created to at least cover migrated count
  if (migrated > 0) {
    await supabase.rpc('set_min_project_counter', {
      uid: userId,
      min_count: migrated,
    })
  }

  return { migrated, skipped, errors }
}

/**
 * Clear localStorage after successful migration
 */
export function clearLocalStorage() {
  localStorage.removeItem(LS_KEY)
}
