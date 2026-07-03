import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { ApiError } from '@/lib/apiError'

const API = import.meta.env.VITE_API_URL

export function useMe() {
  const { getToken, isSignedIn } = useAuth()

  return useQuery({
    queryKey: ['me'],
    enabled: !!isSignedIn,
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(`${API}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new ApiError(res.status)
      return res.json() as Promise<{
        id: number
        email: string
        name: string | null
        is_admin: boolean
      }>
    },
  })
}
