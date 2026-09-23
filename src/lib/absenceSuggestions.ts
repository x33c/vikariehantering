import type { Bemanning, Frånvaro, Vikariepass } from '../types';

export function absenceNeedsSubstitute(absence: Frånvaro) {
  return !absence.ingen_vikarie_behövs && !(absence.anteckning ?? '').split('\n')
    .some(line => line.trim().toLowerCase() === 'ingen vikarie behövs');
}

export function shiftMatchesAbsence(shift: Vikariepass, absence: Frånvaro) {
  if (shift.status === 'avbokat' || shift.datum < absence.datum_från || shift.datum > absence.datum_till) return false;
  if (shift.personal_id !== absence.personal_id) return false;
  if (shift.frånvaro_id === absence.id) return true;
  // A shift can belong to an older absence record for the same person.
  return absence.hel_dag || !absence.tid_från || !absence.tid_till ||
    (shift.tid_från.slice(0, 5) < absence.tid_till.slice(0, 5) &&
      shift.tid_till.slice(0, 5) > absence.tid_från.slice(0, 5));
}

export function absenceSuggestions(absences: Frånvaro[], shifts: Bemanning[], date: string) {
  const seen = new Set<string>();
  return absences.filter(absence => {
    if (absence.datum_från > date || absence.datum_till < date || !absenceNeedsSubstitute(absence)) return false;
    const notes = (absence.anteckning ?? '').split('\n').map(line => line.trim());
    if (notes.includes(`[admin:franvaro-lost:${date}]`) ||
      (absence.datum_från === absence.datum_till && notes.includes('[admin:franvaro-lost]'))) return false;

    const covered = shifts.some(shift => shift.datum === date && shiftMatchesAbsence(shift, absence));
    if (covered) return false;

    // Keep separate partial-day periods, but never repeat the same suggestion.
    const key = JSON.stringify([absence.personal_id, absence.hel_dag ? 'day' :
      [absence.tid_från?.slice(0, 5), absence.tid_till?.slice(0, 5)]]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
