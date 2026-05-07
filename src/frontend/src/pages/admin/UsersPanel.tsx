import { useState } from 'react'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { useAdminUsers, useBanUser, useSetAdmin, type AdminUser } from '@/services/useAdminUsers'

const PAGE_SIZE = 20

const FIELD_LABELS: Record<keyof AdminUser, string> = {
  id: 'ID',
  clerk_id: 'Clerk ID',
  email: 'Email',
  name: 'Name',
  is_admin: 'Admin',
  is_banned: 'Banned',
  created_at: 'Created',
}

function formatValue(key: keyof AdminUser, value: AdminUser[keyof AdminUser]): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (key === 'created_at' && typeof value === 'string') return new Date(value).toLocaleString()
  return value === null ? '—' : String(value)
}

function UserDetail({ user, onBack }: { user: AdminUser; onBack: () => void }) {
  const banUser = useBanUser()
  const setAdmin = useSetAdmin()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  function copy(key: string, val: string) {
    navigator.clipboard.writeText(val)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 600)
  }

  const fields = Object.keys(FIELD_LABELS) as (keyof AdminUser)[]

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Users
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-foreground">{user.email}</span>
      </div>

      <div className="border-b border-border/40" />

      {/* Key-value grid */}
      <div className="rounded-xl overflow-hidden border border-border/30 bg-[rgba(13,15,19,0.6)]">
        {fields.map((key, i) => {
          const val = formatValue(key, user[key])
          return (
            <div
              key={key}
              className={`flex gap-4 px-4 py-2.5 text-sm ${i !== 0 ? 'border-t border-border/20' : ''}`}
            >
              <span className="text-muted-foreground font-medium shrink-0 w-1/4">{FIELD_LABELS[key]}</span>
              <button
                onClick={() => copy(key, val)}
                title="Click to copy"
                className="text-foreground break-all text-left hover:text-primary transition-colors flex items-center gap-1.5"
              >
                {val}
                {copiedKey === key ? (
                  <Check className="size-3.5 text-success shrink-0" />
                ) : null}
              </button>
            </div>
          )
        })}
      </div>

      <div className="border-b border-border/40 mt-1" />

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-foreground">Actions</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {user.is_banned ? (
            <span className="px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground bg-muted/40 border border-border/40">
              Banned
            </span>
          ) : (
            <button
              onClick={() => banUser.mutate(user.clerk_id)}
              disabled={banUser.isPending}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-destructive border border-destructive/40 hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              Ban User
            </button>
          )}
          {user.is_admin ? (
            <button
              onClick={() => setAdmin.mutate({ clerkId: user.clerk_id, isAdmin: false })}
              disabled={setAdmin.isPending}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground border border-border/50 hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
            >
              Remove Admin
            </button>
          ) : (
            <button
              onClick={() => setAdmin.mutate({ clerkId: user.clerk_id, isAdmin: true })}
              disabled={setAdmin.isPending}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-primary border border-primary/40 hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              Make Admin
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function UserList({ onSelect }: { onSelect: (user: AdminUser) => void }) {
  const { data: users = [], isLoading, error } = useAdminUsers()
  const banUser = useBanUser()
  const setAdmin = useSetAdmin()
  const [page, setPage] = useState(0)

  const pageCount = Math.ceil(users.length / PAGE_SIZE)
  const rows = users.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading...</p>
  if (error) return <p className="text-destructive text-sm">Failed to load users.</p>

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-foreground">Users</h2>
      <div className="border-b border-border/40" />
      <div className="glass-panel rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40">
              <th className="px-5 py-2.5 text-left text-muted-foreground font-medium">User</th>
              <th className="px-5 py-2.5 text-muted-foreground font-medium" style={{ width: '1%' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((user, i) => (
              <tr
                key={user.id}
                onClick={() => onSelect(user)}
                className={`${i !== 0 ? 'border-t border-border/20' : ''} hover:bg-[rgba(26,30,42,0.4)] transition-colors cursor-pointer`}
              >
                <td className="px-5 py-2">
                  <span className="font-medium text-foreground">{user.email}</span>
                  {user.name && (
                    <span className="ml-3 text-muted-foreground text-xs">{user.name}</span>
                  )}
                </td>
                <td className="px-5 py-2" style={{ width: '1%', whiteSpace: 'nowrap' }}>
                  <div className="flex items-center gap-2">
                    {user.is_banned ? (
                      <span className="px-3 py-1 rounded-full text-xs font-medium text-muted-foreground bg-muted/40 border border-border/40">
                        Banned
                      </span>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); banUser.mutate(user.clerk_id) }}
                        disabled={banUser.isPending}
                        className="px-3 py-1 rounded-full text-xs font-medium text-destructive border border-destructive/40 hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      >
                        Ban
                      </button>
                    )}
                    {user.is_admin ? (
                      <button
                        onClick={e => { e.stopPropagation(); setAdmin.mutate({ clerkId: user.clerk_id, isAdmin: false }) }}
                        disabled={setAdmin.isPending}
                        className="px-3 py-1 rounded-full text-xs font-medium text-muted-foreground border border-border/50 hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
                      >
                        Remove Admin
                      </button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); setAdmin.mutate({ clerkId: user.clerk_id, isAdmin: true }) }}
                        disabled={setAdmin.isPending}
                        className="px-3 py-1 rounded-full text-xs font-medium text-primary border border-primary/40 hover:bg-primary/10 transition-colors disabled:opacity-50"
                      >
                        Make Admin
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pageCount > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border/40">
            <span className="text-xs text-muted-foreground">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, users.length)} of {users.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => p - 1)}
                disabled={page === 0}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-xs text-muted-foreground px-2">{page + 1} / {pageCount}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= pageCount - 1}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[rgba(26,30,42,0.6)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function UsersPanel() {
  const [selected, setSelected] = useState<AdminUser | null>(null)

  if (selected) {
    return <UserDetail user={selected} onBack={() => setSelected(null)} />
  }
  return <UserList onSelect={setSelected} />
}
