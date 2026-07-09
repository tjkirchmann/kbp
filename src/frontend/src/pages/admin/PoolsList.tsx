import { useEffect, useMemo, useState, forwardRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trophy, Loader2, Trash2, Pencil } from 'lucide-react'
import { localModel } from '@virtuoso.dev/data-table'
import { useAdminPools, useDeletePool, type AdminPool } from '@/services/admin/useAdminPools'
import AdminTableToolbar from '@/components/admin/AdminTableToolbar'
import {
  DataTable,
  DataTableColumn,
  DataTableColumnHeader,
  DataTableCell,
} from '@/components/ui/data-table'
import Modal from '@/components/ui/Modal'
import PoolEditModal from './PoolEditModal'

const ROW_HEIGHT = 48

const SEARCH_KEYS: (keyof AdminPool)[] = ['name']

export default function PoolsList() {
  const navigate = useNavigate()
  const { data: pools = [], isLoading, error } = useAdminPools()
  const deletePool = useDeletePool()
  const [confirmDelete, setConfirmDelete] = useState<AdminPool | null>(null)
  const [editPoolId, setEditPoolId] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return pools
    return pools.filter((p) =>
      SEARCH_KEYS.some((k) =>
        String(p[k] ?? '')
          .toLowerCase()
          .includes(q),
      ),
    )
  }, [pools, search])

  const [model] = useState(() => localModel<AdminPool>({ data: [] }))
  useEffect(() => {
    model.setData?.(filtered)
  }, [model, filtered])

  if (error) {
    return <p className="text-destructive text-sm">Failed to load pools.</p>
  }

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <AdminTableToolbar
        count={filtered.length}
        total={pools.length}
        noun="pool"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search pools…"
      >
        <button
          type="button"
          onClick={() => navigate('/admin/pools/new')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors"
        >
          <Plus className="size-4" />
          New Pool
        </button>
      </AdminTableToolbar>

      {isLoading && pools.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : filtered.length === 0 && search.trim() ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground py-4">No pools match your search.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Trophy className="size-8 opacity-30" />
          <p className="text-sm">No pools yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col [&>*]:flex-1 [&>*]:min-h-0">
          <DataTable
            className="bg-white/[0.03] border border-border/20 rounded-2xl overflow-hidden flex-1 min-h-0"
            model={model}
            computeRowKey={({ data }) => data.id}
            components={{
              Row: forwardRef<any, any>(({ style, ...props }: any, ref) => (
                <div
                  ref={ref}
                  {...props}
                  className="flex items-center border-t border-border/20 transition-colors hover:bg-[rgba(26,30,42,0.4)] cursor-pointer"
                  style={{ ...style, height: ROW_HEIGHT }}
                />
              )) as any,
            }}
          >
            <DataTableColumn field="name" grow={3}>
              <DataTableColumnHeader className="px-5">Pool</DataTableColumnHeader>
              <DataTableCell className="px-5">
                {({ row }) => {
                  const pool = row.data as AdminPool
                  return (
                    <button
                      type="button"
                      className="min-w-0 text-left w-full"
                      onClick={() => navigate(`/admin/pools/${pool.id}`)}
                    >
                      <span className="font-medium text-foreground text-sm truncate block">
                        {pool.name}
                      </span>
                    </button>
                  )
                }}
              </DataTableCell>
            </DataTableColumn>

            <DataTableColumn field="season_year">
              <DataTableColumnHeader className="px-5">Year</DataTableColumnHeader>
              <DataTableCell className="px-5 text-sm text-muted-foreground">
                {({ cellValue }) => String(cellValue)}
              </DataTableCell>
            </DataTableColumn>

            <DataTableColumn field="game_count">
              <DataTableColumnHeader className="px-5">Games</DataTableColumnHeader>
              <DataTableCell className="px-5 text-sm text-muted-foreground">
                {({ cellValue }) => String(cellValue)}
              </DataTableCell>
            </DataTableColumn>

            <DataTableColumn id="status">
              <DataTableColumnHeader className="px-5">Status</DataTableColumnHeader>
              <DataTableCell className="px-5">
                {({ row }) => {
                  const pool = row.data as AdminPool
                  return (
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
                  )
                }}
              </DataTableCell>
            </DataTableColumn>

            <DataTableColumn id="actions">
              <DataTableColumnHeader className="w-16 justify-end px-5" />
              <DataTableCell className="px-5">
                {({ row }) => {
                  const pool = row.data as AdminPool
                  return (
                    <div className="flex justify-end w-full gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditPoolId(pool.id)
                        }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                        title="Edit pool"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDelete(pool)
                        }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )
                }}
              </DataTableCell>
            </DataTableColumn>
          </DataTable>
        </div>
      )}

      {/* ── Edit modal ──────────────────────────────────────────── */}
      {editPoolId !== null && (
        <PoolEditModal
          poolId={editPoolId}
          open={true}
          onClose={() => setEditPoolId(null)}
        />
      )}

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this pool?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
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
    </div>
  )
}
