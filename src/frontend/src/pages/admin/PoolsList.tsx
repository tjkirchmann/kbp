import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trophy, Loader2, Trash2 } from 'lucide-react'
import { useAdminPools, useDeletePool, type AdminPool } from '@/services/useAdminPools'
import AdminListTable from '@/components/admin/AdminListTable'
import { type AdminTableColumn } from '@/components/admin/AdminVirtualTable'
import Modal from '@/components/ui/Modal'

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
  const { data: pools = [], isLoading, error } = useAdminPools()
  const deletePool = useDeletePool()
  const [confirmDelete, setConfirmDelete] = useState<AdminPool | null>(null)

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
    <AdminListTable<AdminPool>
      data={pools}
      isLoading={isLoading}
      error={error as Error | null}
      columns={COLUMNS}
      rowKey={(p) => p.id}
      rowHeight={ROW_HEIGHT}
      renderRow={renderRow}
      noun="pool"
      searchKeys={['name']}
      searchPlaceholder="Search pools…"
      emptyState={
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
          <Trophy className="size-8 opacity-30" />
          <p className="text-sm">No pools yet. Create one to get started.</p>
        </div>
      }
      noMatchState={
        <p className="text-sm text-muted-foreground py-4">No pools match your search.</p>
      }
      toolbarChildren={
        <button
          onClick={() => navigate('/admin/pools/new')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors"
        >
          <Plus className="size-4" />
          New Pool
        </button>
      }
    >
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this pool?"
        size="sm"
        footer={
          <>
            <button
              onClick={() => setConfirmDelete(null)}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!confirmDelete) return
                await deletePool.mutateAsync(confirmDelete.id)
                setConfirmDelete(null)
              }}
              disabled={deletePool.isPending}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/15 text-destructive text-sm font-medium hover:bg-destructive/25 transition-colors disabled:opacity-40"
            >
              {deletePool.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Delete'}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">{confirmDelete?.name}</span> and all its
          games will be permanently deleted. This cannot be undone.
        </p>
      </Modal>
    </AdminListTable>
  )
}
