export function escapeCsvValue(value: string | number | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(headers: string[], rows: Record<string, string | number | null>[]): string {
  const lines = [headers.map(escapeCsvValue).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvValue(row[h] ?? null)).join(','));
  }
  return lines.join('\n');
}
