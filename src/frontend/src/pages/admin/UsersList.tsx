import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useAdminUsers,
  useBanUser,
  useSetAdmin,
  type AdminUser,
} from '@/services/useAdminUsers'
import AdminTableToolbar from '@/components/admin/AdminTableToolbar'
import AdminVirtualTable, { type AdminTableColumn } from '@/components/admin/AdminVirtualTable'

const ROW_HEIGHT = 52

const COLUMNS: AdminTableColumn[] = [
  { key: 'user', header: 'User', className: 'flex-1' },
  { key: 'actions', header: 'Actions', className: 'shrink-0 w-[220px] text-right' },
]

export default function UsersList() {
  const navigate = useNavigate()
  const { data: users = [], isLoading, error } = useAdminUsers()
  const banUser = useBanUser()
  const setAdmin = useSetAdmin()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return users
    const q = search.toLowerCase()
    return users.filter(
      (u) => u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q),
    )
  }, [users, search])

  if (error) return <p className="text-destructive text-sm">Failed to load users.</p>

  function renderRow(user: AdminUser) {
    return (
      <div
        onClick={() => navigate(`/admin/users/${user.id}`)}
        className="flex items-center h-full border-t border-border/20 hover:bg-[rgba(26,30,42,0.4)] transition-colors cursor-pointer"
      >
        <div className="px-5 flex-1 min-w-0">
          <span className="font-medium text-foreground text-sm">{user.email}</span>
          {user.name && <span className="ml-3 text-muted-foreground text-xs">{user.name}</span>}
        </div>
        <div className="px-5 shrink-0 w-[220px] flex items-center justify-end gap-2">
          {user.is_banned ? (
            <span className="px-3 py-1 rounded-full text-xs font-medium text-muted-foreground bg-muted/40 border border-border/40">
              Banned
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation()
                banUser.mutate(user.id)
              }}
              disabled={banUser.isPending}
              className="px-3 py-1 rounded-full text-xs font-medium text-destructive border border-destructive/40 hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              Ban
            </button>
          )}
          {user.is_admin ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setAdmin.mutate({ userId: user.id, isAdmin: false })
              }}
              disabled={setAdmin.isPending}
              className="px-3 py-1 rounded-full text-xs font-medium text-muted-foreground border border-border/50 hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
            >
              Remove Admin
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setAdmin.mutate({ userId: user.id, isAdmin: true })
              }}
              disabled={setAdmin.isPending}
              className="px-3 py-1 rounded-full text-xs font-medium text-primary border border-primary/40 hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              Make Admin
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-3">
      <AdminTableToolbar
        count={filtered.length}
        total={users.length}
        noun="user"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search by email or name…"
      />
      <AdminVirtualTable
        columns={COLUMNS}
        rows={filtered}
        rowKey={(u) => u.id}
        rowHeight={ROW_HEIGHT}
        isLoading={isLoading}
        isFiltered={search !== ''}
        renderRow={renderRow}
        emptyState={<p className="text-sm text-muted-foreground py-4">No users yet.</p>}
        noMatchState={
          <p className="text-sm text-muted-foreground py-4">No users match your search.</p>
        }
      />
    </div>
  )
}
