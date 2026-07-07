import { useEffect, useMemo, useState, forwardRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { localModel } from '@virtuoso.dev/data-table'
import { useAdminUsers, useBanUser, useSetAdmin, type AdminUser } from '@/services/useAdminUsers'
import AdminTableToolbar from '@/components/admin/AdminTableToolbar'
import { DataTable, DataTableColumn, DataTableColumnHeader, DataTableCell } from '@/components/ui/data-table'

const ROW_HEIGHT = 52

const SEARCH_KEYS: (keyof AdminUser)[] = ['email', 'name']

export default function UsersList() {
  const navigate = useNavigate()
  const { data: users = [], isLoading, error } = useAdminUsers()
  const banUser = useBanUser()
  const setAdmin = useSetAdmin()
  const [search, setSearch] = useState('')

  // Client-side search
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return users
    return users.filter((u) =>
      SEARCH_KEYS.some((k) => String(u[k] ?? '').toLowerCase().includes(q)),
    )
  }, [users, search])

  // localModel bridge
  const [model] = useState(() => localModel<AdminUser>({ data: [] }))
  useEffect(() => {
    model.setData?.(filtered)
  }, [model, filtered])

  if (error) {
    return <p className="text-destructive text-sm">Failed to load users.</p>
  }

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <AdminTableToolbar
        count={filtered.length}
        total={users.length}
        noun="user"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search by email or name…"
      />

      {isLoading && users.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 relative">
          <DataTable
          className="bg-white/[0.03] border border-border/20 rounded-2xl overflow-hidden flex-1 min-h-0"
          model={model}
          computeRowKey={({ data }) => data.id}
          components={{
            Row: forwardRef<any, any>(({ style, ...props }: any, ref) => (
                <div ref={ref}
                {...props}
                className="flex items-center border-t border-border/20 transition-colors hover:bg-[rgba(26,30,42,0.4)]"
                style={{ ...style, height: ROW_HEIGHT }}
              />
            )) as any,
          }}
        >
          <DataTableColumn field="email" grow={1}>
            <DataTableColumnHeader className="px-5">User</DataTableColumnHeader>
            <DataTableCell className="px-5 cursor-pointer">
              {({ row }) => {
                const user = row.data as AdminUser
                return (
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-3 text-left w-full"
                    onClick={() => navigate(`/admin/users/${user.id}`)}
                  >
                    <span className="font-medium text-foreground text-sm truncate">{user.email}</span>
                    {user.name && (
                      <span className="text-muted-foreground text-xs shrink-0">{user.name}</span>
                    )}
                  </button>
                )
              }}
            </DataTableCell>
          </DataTableColumn>

          <DataTableColumn id="actions">
            <DataTableColumnHeader className="w-[220px] justify-end px-5">Actions</DataTableColumnHeader>
            <DataTableCell className="px-5">
              {({ row }) => {
                const user = row.data as AdminUser
                return (
                  <div className="flex items-center justify-end gap-2 w-full">
                    {user.is_banned ? (
                      <span className="px-3 py-1 rounded-full text-xs font-medium text-muted-foreground bg-muted/40 border border-border/40">
                        Banned
                      </span>
                    ) : (
                      <button
                        type="button"
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
                        type="button"
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
                        type="button"
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
                )
              }}
            </DataTableCell>
          </DataTableColumn>
        </DataTable>
          </div>
      )}
    </div>
  )
}
