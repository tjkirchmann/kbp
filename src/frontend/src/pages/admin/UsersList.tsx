import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAdminUsers, useBanUser, useSetAdmin } from '@/services/useAdminUsers'

const PAGE_SIZE = 20

export default function UsersList() {
  const navigate = useNavigate()
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
      <div className="bg-white/[0.03] border border-border/20 rounded-2xl overflow-hidden">
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
                onClick={() => navigate(`/admin/users/${user.id}`)}
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
                        onClick={e => { e.stopPropagation(); banUser.mutate(user.id) }}
                        disabled={banUser.isPending}
                        className="px-3 py-1 rounded-full text-xs font-medium text-destructive border border-destructive/40 hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      >
                        Ban
                      </button>
                    )}
                    {user.is_admin ? (
                      <button
                        onClick={e => { e.stopPropagation(); setAdmin.mutate({ userId: user.id, isAdmin: false }) }}
                        disabled={setAdmin.isPending}
                        className="px-3 py-1 rounded-full text-xs font-medium text-muted-foreground border border-border/50 hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
                      >
                        Remove Admin
                      </button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); setAdmin.mutate({ userId: user.id, isAdmin: true }) }}
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
