import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

export interface LibraryFile {
  id: number
  original_name: string
  content_type: string | null
  size_bytes: number | null
  status: string
  created_at: string
  deleted_at: string | null
  uploaded_by_user_id: number | null
}

interface PresignResult {
  file_id: number
  key: string
  upload: { url: string; fields: Record<string, string> }
}

const filesKey = (includeDeleted: boolean) => ['admin', 'library', 'files', includeDeleted]

export function useLibraryFiles(includeDeleted: boolean) {
  const { getToken } = useAuth()
  return useQuery<LibraryFile[]>({
    queryKey: filesKey(includeDeleted),
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, `/admin/library/files?include_deleted=${includeDeleted}`)
    },
  })
}

// Three-step direct-to-S3 upload: presign → POST file to S3 → confirm.
export function useUploadFile() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const token = await getToken()
      const presign: PresignResult = await apiFetch(token!, '/admin/library/presign', {
        method: 'POST',
        body: JSON.stringify({ original_name: file.name, content_type: file.type || null }),
      })

      // Browser → S3 (or MinIO) directly. Fields first, file last, no auth header
      // (the browser sets the multipart Content-Type with its boundary).
      const form = new FormData()
      for (const [k, v] of Object.entries(presign.upload.fields)) form.append(k, v)
      form.append('file', file)
      const s3res = await fetch(presign.upload.url, { method: 'POST', body: form })
      if (!s3res.ok) throw new Error(`upload failed: ${s3res.status}`)

      return apiFetch(token!, `/admin/library/${presign.file_id}/confirm`, { method: 'POST' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'library', 'files'] }),
  })
}

export function useDownloadFile() {
  const { getToken } = useAuth()
  return useMutation({
    mutationFn: async (fileId: number) => {
      const token = await getToken()
      const { url } = await apiFetch(token!, `/admin/library/files/${fileId}/download`)
      window.open(url, '_blank')
    },
  })
}

export function useDeleteFile() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fileId: number) => {
      const token = await getToken()
      return apiFetch(token!, `/admin/library/files/${fileId}`, { method: 'DELETE' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'library', 'files'] }),
  })
}

export function useRestoreFile() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fileId: number) => {
      const token = await getToken()
      return apiFetch(token!, `/admin/library/files/${fileId}/restore`, { method: 'POST' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'library', 'files'] }),
  })
}

export function usePurgeFile() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fileId: number) => {
      const token = await getToken()
      return apiFetch(token!, `/admin/library/files/${fileId}/purge`, { method: 'DELETE' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'library', 'files'] }),
  })
}
