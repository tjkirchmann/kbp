# Skill: Frontend Data & State Logic

You are implementing data fetching, state management, or business logic for the frontend.

## Data fetching — TanStack Query
- All server state goes through TanStack Query
- Query hooks live in `src/frontend/src/services/`
- One file per backend domain (e.g., `useUsers.ts`, `useItems.ts`)
- Always type the response with a TypeScript interface matching the backend Pydantic schema
- Use `queryKey` factories for cache invalidation

```ts
// src/frontend/src/services/useExample.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export const exampleKeys = {
  all: ['examples'] as const,
  detail: (id: string) => ['examples', id] as const,
}

export function useExamples() {
  return useQuery({
    queryKey: exampleKeys.all,
    queryFn: () => axios.get(`${API}/examples`).then(r => r.data),
  })
}
```

## Client state — Zustand
- Only use Zustand for UI state that is NOT server data (modals, filters, workspace state)
- Slices live in `src/frontend/src/store/`
- Keep slices small and focused

```ts
// src/frontend/src/store/useUIStore.ts
import { create } from 'zustand'

interface UIState {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>(set => ({
  sidebarOpen: false,
  setSidebarOpen: open => set({ sidebarOpen: open }),
}))
```

## Auth
- Use Clerk hooks: `useUser()`, `useAuth()`, `useClerk()`
- Pass Bearer token to API: `const { getToken } = useAuth(); const token = await getToken()`
- Protect routes with `<SignedIn>` / `<SignedOut>` from `@clerk/react`
