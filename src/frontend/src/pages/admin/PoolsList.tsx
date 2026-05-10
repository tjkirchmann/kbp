import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Plus, Trophy, Loader2, Trash2 } from 'lucide-react'
import { useAdminPools, useDeletePool, type AdminPool } from '@/services/useAdminPools'

const ROW_HEIGHT = 64

export default function PoolsList() {
  const navigate = useNavigate()
  const { data: pools = [], isLoading } = useAdminPools()
  const deletePool = useDeletePool()
  const [confirmDelete, setConfirmDelete] = useState<AdminPool | null>(null)
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: pools.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  })

  return (
    <div className="space-y-4">
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
        <div
          ref={parentRef}
          className="overflow-y-auto -mr-6"
          style={{ height: 'calc(100vh - 16rem)', scrollbarGutter: 'stable' }}
        >
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(vRow => {
              const pool = pools[vRow.index]
              return (
                <div
                  key={pool.id}
                  style={{ position: 'absolute', top: vRow.start, left: 0, right: 0, height: ROW_HEIGHT }}
                  onClick={() => navigate(`/admin/pools/${pool.id}`)}
                  className="rounded-lg px-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{pool.name}</span>
                      {pool.is_featured && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary">
                          Featured
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{pool.season_year} season</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm text-foreground">{pool.game_count} game{pool.game_count !== 1 ? 's' : ''}</p>
                    <p className="text-xs text-muted-foreground">{new Date(pool.created_at).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDelete(pool) }}
                    className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              )
            })}
          </div>
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
