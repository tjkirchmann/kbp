import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'

const API = import.meta.env.VITE_API_URL

export interface AdminUser {
  id: number
  email: string
  name: string | null
  is_admin: boolean
  is_banned: boolean
  created_at: string
}

async function authFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

export function useAdminUsers() {
  const { getToken } = useAuth()
  return useQuery<AdminUser[]>({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const token = await getToken()
      return authFetch(token!, '/admin/users')
    },
  })
}

export function useBanUser() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: number) => {
      const token = await getToken()
      return authFetch(token!, `/admin/users/${userId}/ban`, { method: 'POST' })
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
      return authFetch(token!, `/admin/users/${userId}/set-admin`, {
        method: 'POST',
        body: JSON.stringify({ is_admin: isAdmin }),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })
}
