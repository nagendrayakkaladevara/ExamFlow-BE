import { Decimal } from '@prisma/client/runtime/library';

export function decimalToNumber(value: Decimal | null | undefined): number | null {
  if (value == null) return null;
  return Number(value);
}

export function parseCursor(cursor?: string): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const [iso, id] = decoded.split('|');
    if (!iso || !id) return null;
    return { createdAt: new Date(iso), id };
  } catch {
    return null;
  }
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}
