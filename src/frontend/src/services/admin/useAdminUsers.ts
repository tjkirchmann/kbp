import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../../lib/api'

export interface AdminUser {
  id: number
  email: string
  name: string | null
  is_admin: boolean
  is_banned: boolean
  created_at: string
}

export function useAdminUsers() {
  const { getToken } = useAuth()
  return useQuery<AdminUser[]>({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, '/admin/users')
    },
  })
}

export function useBanUser() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: number) => {
      const token = await getToken()
      return apiFetch(token!, `/admin/users/${userId}/ban`, { method: 'POST' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })
}

export function useSetAdmin() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: number; isAdmin: boolean }) => {
      const token = await getToken()
      return apiFetch(token!, `/admin/users/${userId}/set-admin`, {
        method: 'POST',
        body: JSON.stringify({ is_admin: isAdmin }),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })
}
