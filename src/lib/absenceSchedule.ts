import type { Frånvaro, Schemarad } from '../types';

// Clip each lesson before grouping it into a shift, including partial lessons.
export function absenceSchedule(rows: Schemarad[], absence: Pick<Frånvaro, 'hel_dag' | 'tid_från' | 'tid_till'>): Schemarad[] {
  return rows.flatMap(row => {
    if (!row.tid_från || !row.tid_till) return [];
    const start = row.tid_från.slice(0, 5);
    const end = row.tid_till.slice(0, 5);
    const from = !absence.hel_dag && absence.tid_från ? absence.tid_från.slice(0, 5) : start;
    const to = !absence.hel_dag && absence.tid_till ? absence.tid_till.slice(0, 5) : end;
    const clippedStart = start > from ? start : from;
    const clippedEnd = end < to ? end : to;
    return clippedStart < clippedEnd ? [{ ...row, tid_från: clippedStart, tid_till: clippedEnd }] : [];
  });
}
