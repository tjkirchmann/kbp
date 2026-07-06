import { useNavigate } from 'react-router-dom'
import { useAdminUsers, useBanUser, useSetAdmin, type AdminUser } from '@/services/useAdminUsers'
import AdminListTable from '@/components/admin/AdminListTable'
import { type AdminTableColumn } from '@/components/admin/AdminVirtualTable'

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
    <AdminListTable<AdminUser>
      data={users}
      isLoading={isLoading}
      error={error as Error | null}
      columns={COLUMNS}
      rowKey={(u) => u.id}
      rowHeight={ROW_HEIGHT}
      renderRow={renderRow}
      noun="user"
      searchKeys={['email', 'name']}
      searchPlaceholder="Search by email or name…"
      emptyState={<p className="text-sm text-muted-foreground py-4">No users yet.</p>}
      noMatchState={
        <p className="text-sm text-muted-foreground py-4">No users match your search.</p>
      }
    />
  )
}
