import { COLORS, RADIUS } from '@/lib/designTokens';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';

export type AdminTableColumn<T> = {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  width?: string;
};

// Generic table shell reused by Users, Activities, Reports, Audit Log —
// each page just supplies its own columns and rows. Pagination is
// server-side (page/pageSize/totalCount passed in, onPageChange fetches
// the next page) rather than fetching everything and slicing client-side —
// this is what keeps large tables from ever loading thousands of rows at once.
export default function AdminTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  emptyMessage = 'Nothing here yet.',
  page,
  pageSize,
  totalCount,
  onPageChange,
  onRowClick
}: {
  columns: AdminTableColumn<T>[];
  rows: T[];
  loading?: boolean;
  emptyMessage?: string;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
}) {
  const totalPages = page !== undefined && pageSize && totalCount !== undefined ? Math.max(1, Math.ceil(totalCount / pageSize)) : undefined;

  return (
    <div style={{ background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg, overflow: 'hidden' }}>
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              {columns.map((col) => (
                <th key={col.key} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11.5, fontWeight: 700, color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '0.03em', width: col.width }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                style={{ borderBottom: `1px solid ${COLORS.borderLight}`, cursor: onRowClick ? 'pointer' : 'default' }}
              >
                {columns.map((col) => (
                  <td key={col.key} style={{ padding: '13px 16px', fontSize: 13.5, color: COLORS.ink, verticalAlign: 'middle' }}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages !== undefined && totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: `1px solid ${COLORS.border}` }}>
          <span style={{ fontSize: 12.5, color: COLORS.textFaint }}>Page {page! + 1} of {totalPages} · {totalCount} total</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => onPageChange?.(page! - 1)}
              disabled={page === 0}
              style={pageBtnStyle(page === 0)}
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange?.(page! + 1)}
              disabled={page! + 1 >= totalPages}
              style={pageBtnStyle(page! + 1 >= totalPages)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function pageBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`,
    background: '#fff', color: disabled ? COLORS.textFaint : COLORS.ink, fontSize: 12.5, fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1
  };
}
