import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { Plus, Trophy, Loader2, Trash2 } from 'lucide-react'
import { useAdminPools, useDeletePool, type AdminPool } from '@/services/useAdminPools'
import AdminTableToolbar from '@/components/admin/AdminTableToolbar'
import AdminVirtualTable, { type AdminTableColumn } from '@/components/admin/AdminVirtualTable'

const ROW_HEIGHT = 48

const COLUMNS: AdminTableColumn[] = [
  { key: 'pool', header: 'Pool', className: 'flex-[3]' },
  { key: 'year', header: 'Year', className: 'flex-[1]' },
  { key: 'games', header: 'Games', className: 'flex-[1]' },
  { key: 'status', header: 'Status', className: 'flex-[2]' },
  { key: 'actions', header: '', className: 'shrink-0 w-16 text-right' },
]

export default function PoolsList() {
  const navigate = useNavigate()
  const { data: pools = [], isLoading } = useAdminPools()
  const deletePool = useDeletePool()
  const [confirmDelete, setConfirmDelete] = useState<AdminPool | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return pools
    const q = search.toLowerCase()
    return pools.filter((p) => p.name.toLowerCase().includes(q))
  }, [pools, search])

  function renderRow(pool: AdminPool) {
    return (
      <div
        onClick={() => navigate(`/admin/pools/${pool.id}`)}
        className="flex items-center h-full border-t border-border/20 hover:bg-[rgba(26,30,42,0.4)] transition-colors cursor-pointer"
      >
        <div className="px-5 flex-[3] min-w-0">
          <span className="font-medium text-foreground text-sm truncate block">{pool.name}</span>
        </div>
        <div className="px-5 flex-[1] text-sm text-muted-foreground">{pool.season_year}</div>
        <div className="px-5 flex-[1] text-sm text-muted-foreground">{pool.game_count}</div>
        <div className="px-5 flex-[2]">
          <div className="flex items-center gap-1.5">
            {pool.is_featured && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary">
                Featured
              </span>
            )}
            {pool.submissions_open && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success">
                Open
              </span>
            )}
          </div>
        </div>
        <div className="px-5 shrink-0 w-16 flex justify-end">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setConfirmDelete(pool)
            }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-3">
      <AdminTableToolbar
        count={filtered.length}
        total={pools.length}
        noun="pool"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search pools…"
      >
        <button
          onClick={() => navigate('/admin/pools/new')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors"
        >
          <Plus className="size-4" />
          New Pool
        </button>
      </AdminTableToolbar>

      <AdminVirtualTable
        columns={COLUMNS}
        rows={filtered}
        rowKey={(p) => p.id}
        rowHeight={ROW_HEIGHT}
        isLoading={isLoading}
        isFiltered={search !== ''}
        renderRow={renderRow}
        emptyState={
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
            <Trophy className="size-8 opacity-30" />
            <p className="text-sm">No pools yet. Create one to get started.</p>
          </div>
        }
        noMatchState={
          <p className="text-sm text-muted-foreground py-4">No pools match your search.</p>
        }
      />

      {confirmDelete &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <div className="bg-white/[0.03] border border-border/20 rounded-2xl p-7 max-w-sm w-full mx-4 space-y-5">
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-foreground">Delete this pool?</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <span className="text-foreground font-medium">{confirmDelete.name}</span> and all
                  its games will be permanently deleted. This cannot be undone.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await deletePool.mutateAsync(confirmDelete.id)
                    setConfirmDelete(null)
                  }}
                  disabled={deletePool.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-destructive/15 text-destructive text-sm font-medium hover:bg-destructive/25 transition-colors disabled:opacity-40"
                >
                  {deletePool.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Delete'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
