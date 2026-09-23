import type { Bemanning, Frånvaro } from '../types';

export function absenceSuggestions(absences: Frånvaro[], shifts: Bemanning[], date: string) {
  const seen = new Set<string>();
  return absences.filter(absence => {
    if (absence.datum_från > date || absence.datum_till < date || absence.ingen_vikarie_behövs) return false;
    const notes = (absence.anteckning ?? '').split('\n').map(line => line.trim());
    if (notes.includes(`[admin:franvaro-lost:${date}]`) ||
      (absence.datum_från === absence.datum_till && notes.includes('[admin:franvaro-lost]')) ||
      notes.some(line => line.toLowerCase() === 'ingen vikarie behövs')) return false;

    const covered = shifts.some(shift => {
      if (shift.status === 'avbokat' || shift.datum !== date) return false;
      if (shift.frånvaro_id === absence.id) return true;
      if (shift.personal_id !== absence.personal_id) return false;
      // Match the person even when an older absence record owns the shift.
      return absence.hel_dag || !absence.tid_från || !absence.tid_till ||
        (shift.tid_från.slice(0, 5) < absence.tid_till.slice(0, 5) &&
          shift.tid_till.slice(0, 5) > absence.tid_från.slice(0, 5));
    });
    if (covered) return false;

    // Keep separate partial-day periods, but never repeat the same suggestion.
    const key = JSON.stringify([absence.personal_id, absence.hel_dag ? 'day' :
      [absence.tid_från?.slice(0, 5), absence.tid_till?.slice(0, 5)]]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
