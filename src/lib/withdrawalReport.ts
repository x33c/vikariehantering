import type { Vikariepass } from '../types';

export interface WithdrawalRow {
  id?: string;
  pass_id: string;
  metadata: { åtgärd?: string; återbud_ids?: string[]; vikarie_id?: string; datum?: string; tid_från?: string; tid_till?: string; grupp?: string | null; vikarie_namn?: string } | null;
}

export function activeWithdrawals(rows: WithdrawalRow[]) {
  const hidden = new Set(rows.filter(row => row.metadata?.åtgärd === 'dolde_aterbud_i_utskick')
    .flatMap(row => row.metadata?.återbud_ids ?? []));
  return rows.filter(row => row.metadata?.åtgärd !== 'dolde_aterbud_i_utskick' && (!row.id || !hidden.has(row.id)));
}

export function withdrawalBookings(rows: WithdrawalRow[], shifts: Vikariepass[]) {
  const byId = new Map(shifts.map(shift => [shift.id, shift]));
  const unique = new Map<string, Vikariepass>();
  for (const row of activeWithdrawals(rows)) {
    const shift = byId.get(row.pass_id);
    const m = row.metadata;
    if (!m?.vikarie_id) continue;
    const date = m.datum ?? shift?.datum;
    const start = m.tid_från ?? shift?.tid_från;
    const end = m.tid_till ?? shift?.tid_till;
    if (!date || !start || !end) continue;
    const key = `${row.pass_id}:${m.vikarie_id}:${date}`;
    if (unique.has(key)) continue;
    unique.set(key, {
      ...shift, id: row.pass_id, datum: date, vikarie_id: m.vikarie_id,
      tid_från: start, tid_till: end,
      grupp: m.grupp !== undefined ? m.grupp : shift?.grupp,
    } as Vikariepass);
  }
  return [...unique.values()];
}

export function appendWithdrawnNames(staff: string, bookings: Vikariepass[], name: (id: string) => string) {
  const ids = [...new Set(bookings.map(p => p.vikarie_id).filter((id): id is string => !!id))];
  const names = ids.map(name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'sv'));
  return [staff, names.join('\n')].filter(Boolean).join('\n\n');
}
