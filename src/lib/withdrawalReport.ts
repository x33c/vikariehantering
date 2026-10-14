import type { Vikariepass } from '../types';

export interface WithdrawalRow {
  pass_id: string;
  metadata: { vikarie_id?: string; datum?: string; tid_från?: string; tid_till?: string; grupp?: string | null; vikarie_namn?: string } | null;
}

export function withdrawalBookings(rows: WithdrawalRow[], shifts: Vikariepass[]) {
  const byId = new Map(shifts.map(shift => [shift.id, shift]));
  const unique = new Map<string, Vikariepass>();
  for (const row of rows) {
    const shift = byId.get(row.pass_id);
    const m = row.metadata;
    if (!shift || !m?.vikarie_id) continue;
    const date = m.datum ?? shift.datum;
    const key = `${row.pass_id}:${m.vikarie_id}:${date}`;
    if (unique.has(key)) continue;
    unique.set(key, {
      ...shift, datum: date, vikarie_id: m.vikarie_id,
      tid_från: m.tid_från ?? shift.tid_från, tid_till: m.tid_till ?? shift.tid_till,
      grupp: m.grupp !== undefined ? m.grupp : shift.grupp,
    });
  }
  return [...unique.values()];
}

export function appendWithdrawnNames(staff: string, bookings: Vikariepass[], name: (id: string) => string) {
  const ids = [...new Set(bookings.map(p => p.vikarie_id).filter((id): id is string => !!id))];
  const names = ids.map(name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'sv'));
  return [staff, names.join('\n')].filter(Boolean).join('\n\n');
}
