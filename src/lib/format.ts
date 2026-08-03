export function formatRub(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function exportToExcel(filename: string, tables: { title: string; headers: string[]; rows: string[][] }[]) {
  // Build CSV (semicolon separator for RU Excel locale)
  let csv = '\uFEFF'; // BOM for UTF-8
  const escape = (v: string) => {
    const s = String(v);
    if (/^-?\d+([.,]\d+)?$/.test(s)) return s; // numeric -> no quotes
    return `"${s.replace(/"/g, '""')}"`;
  };

  for (const t of tables) {
    csv += `"${t.title}"\n`;
    csv += t.headers.map(escape).join(';') + '\n';
    for (const r of t.rows) {
      csv += r.map(escape).join(';') + '\n';
    }
    csv += '\n';
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
