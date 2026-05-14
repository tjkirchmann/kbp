import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { Plus, Trophy, Loader2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAdminPools, useDeletePool, type AdminPool } from '@/services/useAdminPools'

const PAGE_SIZE = 20

export default function PoolsList() {
  const navigate = useNavigate()
  const { data: pools = [], isLoading } = useAdminPools()
  const deletePool = useDeletePool()
  const [confirmDelete, setConfirmDelete] = useState<AdminPool | null>(null)
  const [page, setPage] = useState(0)

  const pageCount = Math.ceil(pools.length / PAGE_SIZE)
  const rows = pools.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{pools.length} pool{pools.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => navigate('/admin/pools/new')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors"
        >
          <Plus className="size-4" />
          New Pool
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : pools.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Trophy className="size-8 opacity-30" />
          <p className="text-sm">No pools yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-5 py-2.5 text-left text-muted-foreground font-medium">Pool</th>
                <th className="px-5 py-2.5 text-left text-muted-foreground font-medium">Year</th>
                <th className="px-5 py-2.5 text-left text-muted-foreground font-medium">Games</th>
                <th className="px-5 py-2.5 text-left text-muted-foreground font-medium">Status</th>
                <th className="px-5 py-2.5 text-muted-foreground font-medium" style={{ width: '1%' }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((pool, i) => (
                <tr
                  key={pool.id}
                  onClick={() => navigate(`/admin/pools/${pool.id}`)}
                  className={`${i !== 0 ? 'border-t border-border/20' : ''} hover:bg-[rgba(26,30,42,0.4)] transition-colors cursor-pointer`}
                >
                  <td className="px-5 py-2.5">
                    <span className="font-medium text-foreground">{pool.name}</span>
                  </td>
                  <td className="px-5 py-2.5 text-muted-foreground">{pool.season_year}</td>
                  <td className="px-5 py-2.5 text-muted-foreground">{pool.game_count}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {pool.is_featured && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary">Featured</span>
                      )}
                      {pool.submissions_open && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success">Open</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-2.5" style={{ width: '1%', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDelete(pool) }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pageCount > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border/40">
              <span className="text-xs text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, pools.length)} of {pools.length}
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
      )}

      {confirmDelete && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="glass-panel rounded-2xl p-7 max-w-sm w-full mx-4 space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-foreground">Delete this pool?</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <span className="text-foreground font-medium">{confirmDelete.name}</span> and all its games will be permanently deleted. This cannot be undone.
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
        document.body
      )}
    </div>
  )
}
