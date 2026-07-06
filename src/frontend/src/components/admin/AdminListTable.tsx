import { useMemo, useState } from 'react'
import AdminTableToolbar from '@/components/admin/AdminTableToolbar'
import AdminVirtualTable, { type AdminTableColumn } from '@/components/admin/AdminVirtualTable'

interface AdminListTableProps<T> {
  // Data
  data: T[]
  isLoading: boolean
  error?: Error | null

  // Table
  columns: AdminTableColumn[]
  rowKey: (item: T) => string | number
  rowHeight: number
  renderRow: (item: T) => React.ReactNode

  // Search
  noun: string
  searchKeys: (keyof T)[]
  searchPlaceholder?: string

  // States
  emptyState?: React.ReactNode
  noMatchState?: React.ReactNode

  // Slots
  toolbarChildren?: React.ReactNode
  children?: React.ReactNode
}

function pluralize(noun: string): string {
  return noun.endsWith('s') ? noun : `${noun}s`
}

export default function AdminListTable<T>({
  data,
  isLoading,
  error,
  columns,
  rowKey,
  rowHeight,
  renderRow,
  noun,
  searchKeys,
  searchPlaceholder,
  emptyState,
  noMatchState,
  toolbarChildren,
  children,
}: AdminListTableProps<T>) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return data

    return data.filter((item) =>
      searchKeys.some((key) =>
        String(item[key] ?? '')
          .toLowerCase()
          .includes(q),
      ),
    )
  }, [data, search, searchKeys])

  if (error) {
    return <p className="text-destructive text-sm">Failed to load {pluralize(noun)}.</p>
  }

  return (
    <div className="h-full flex flex-col gap-3">
      <AdminTableToolbar
        count={filtered.length}
        total={data.length}
        noun={noun}
        search={search}
        onSearch={setSearch}
        searchPlaceholder={searchPlaceholder}
      >
        {toolbarChildren}
      </AdminTableToolbar>

      <AdminVirtualTable
        columns={columns}
        rows={filtered}
        rowKey={rowKey}
        rowHeight={rowHeight}
        isLoading={isLoading}
        isFiltered={search.trim() !== ''}
        renderRow={renderRow}
        emptyState={emptyState}
        noMatchState={noMatchState}
      />

      {children}
    </div>
  )
}
