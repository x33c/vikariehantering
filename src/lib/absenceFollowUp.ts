import type { Frånvaro } from '../types';

export function previousWorkday(date: string) {
  const day = new Date(`${date}T12:00:00`);
  do { day.setDate(day.getDate() - 1); } while (day.getDay() === 0 || day.getDay() === 6);
  return day.toLocaleDateString('sv-SE');
}

export function absencesToFollowUp(absences: Frånvaro[], date: string) {
  const previous = previousWorkday(date);
  const covers = (absence: Frånvaro, day: string) => absence.datum_från <= day && absence.datum_till >= day;
  const alreadyAbsent = new Set(absences.filter(a => covers(a, date)).map(a => a.personal_id));
  const seen = new Set<string>();
  return absences.filter(a => {
    // Staffing resolution/no-substitute markers do not mean someone has returned.
    if (!covers(a, previous) || alreadyAbsent.has(a.personal_id) || seen.has(a.personal_id)) return false;
    if (a.personal?.aktiv === false) return false;
    seen.add(a.personal_id);
    return true;
  }).sort((a, b) => (a.personal?.namn ?? '').localeCompare(b.personal?.namn ?? '', 'sv'));
}
