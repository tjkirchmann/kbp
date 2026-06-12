import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'

const API = import.meta.env.VITE_API_URL

async function authFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

/** A tag applied to an entity. `color` is a .tag-* CSS class derived server-side. */
export interface Tag {
  name: string
  color: string
}

const tagsKey = (et: string, id: string) => ['admin', 'tags', et, id] as const
const suggestionsKey = (et: string, id: string) => ['admin', 'tags', et, id, 'suggestions'] as const

/** Tags currently applied to one entity. */
export function useTags(entityType: string, entityId: string) {
  const { getToken } = useAuth()
  return useQuery<Tag[]>({
    queryKey: tagsKey(entityType, entityId),
    enabled: !!entityId,
    queryFn: async () => {
      const token = await getToken()
      return authFetch(token!, `/admin/tags/${entityType}/${encodeURIComponent(entityId)}`)
    },
  })
}

/**
 * Tags for many entities of one type at once, as a map of entityId -> Tag[].
 * Shares cache keys with useTags, so edits in a TagBar reflect here immediately.
 * Used by list views to filter rows by tag.
 */
export function useEntityTagsBatch(entityType: string, entityIds: string[]) {
  const { getToken } = useAuth()
  const results = useQueries({
    queries: entityIds.map(id => ({
      queryKey: tagsKey(entityType, id),
      queryFn: async (): Promise<Tag[]> => {
        const token = await getToken()
        return authFetch(token!, `/admin/tags/${entityType}/${encodeURIComponent(id)}`)
      },
    })),
  })
  const byId: Record<string, Tag[]> = {}
  entityIds.forEach((id, i) => { byId[id] = results[i]?.data ?? [] })
  return byId
}

/** Distinct tag names used across this entity type, minus those already applied here. */
export function useTagSuggestions(entityType: string, entityId: string, enabled: boolean) {
  const { getToken } = useAuth()
  return useQuery<string[]>({
    queryKey: suggestionsKey(entityType, entityId),
    enabled: enabled && !!entityId,
    queryFn: async () => {
      const token = await getToken()
      return authFetch(token!, `/admin/tags/${entityType}/${encodeURIComponent(entityId)}/suggestions`)
    },
  })
}

/** Apply a tag (idempotent). Refreshes this entity's tags + suggestions. */
export function useAddTag(entityType: string, entityId: string) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation<Tag, Error, string>({
    mutationFn: async (name) => {
      const token = await getToken()
      return authFetch(token!, `/admin/tags/${entityType}/${encodeURIComponent(entityId)}`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tagsKey(entityType, entityId) })
      qc.invalidateQueries({ queryKey: suggestionsKey(entityType, entityId) })
    },
  })
}

/** Remove a tag from this entity. */
export function useRemoveTag(entityType: string, entityId: string) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: async (name) => {
      const token = await getToken()
      return authFetch(
        token!,
        `/admin/tags/${entityType}/${encodeURIComponent(entityId)}?name=${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tagsKey(entityType, entityId) })
      qc.invalidateQueries({ queryKey: suggestionsKey(entityType, entityId) })
    },
  })
}
