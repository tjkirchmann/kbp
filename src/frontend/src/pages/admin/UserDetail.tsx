import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useAdminUsers, useBanUser, useSetAdmin, type AdminUser } from '@/services/admin/useAdminUsers'

const FIELD_LABELS: Record<keyof AdminUser, string> = {
  id: 'ID',
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

export default function UserDetail() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { data: users = [] } = useAdminUsers()
  const banUser = useBanUser()
  const setAdmin = useSetAdmin()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const user = users.find((u) => String(u.id) === userId)

  if (!user) {
    return (
      <div className="text-sm text-muted-foreground py-8">
        User not found.{' '}
        <button onClick={() => navigate('/admin/users')} className="text-primary hover:underline">
          Back to users
        </button>
      </div>
    )
  }

  function copy(key: string, val: string) {
    navigator.clipboard.writeText(val)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 600)
  }

  const fields = Object.keys(FIELD_LABELS) as (keyof AdminUser)[]

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl overflow-hidden bg-white/[0.03] border border-border/20">
        {fields.map((key, i) => {
          const val = formatValue(key, user[key])
          return (
            <div
              key={key}
              className={`flex gap-4 px-4 py-2.5 text-sm ${i !== 0 ? 'border-t border-border/20' : ''}`}
            >
              <span className="text-muted-foreground font-medium shrink-0 w-1/4">
                {FIELD_LABELS[key]}
              </span>
              <button
                onClick={() => copy(key, val)}
                title="Click to copy"
                className="text-foreground break-all text-left hover:text-primary transition-colors flex items-center gap-1.5"
              >
                {val}
                {copiedKey === key ? <Check className="size-3.5 text-success shrink-0" /> : null}
              </button>
            </div>
          )
        })}
      </div>

      <div className="border-b border-border/40 mt-1" />

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-foreground">Actions</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {user.is_banned ? (
            <span className="px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground bg-muted/40 border border-border/40">
              Banned
            </span>
          ) : (
            <button
              onClick={() => banUser.mutate(user.id)}
              disabled={banUser.isPending}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-destructive border border-destructive/40 hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              Ban User
            </button>
          )}
          {user.is_admin ? (
            <button
              onClick={() => setAdmin.mutate({ userId: user.id, isAdmin: false })}
              disabled={setAdmin.isPending}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground border border-border/50 hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
            >
              Remove Admin
            </button>
          ) : (
            <button
              onClick={() => setAdmin.mutate({ userId: user.id, isAdmin: true })}
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
