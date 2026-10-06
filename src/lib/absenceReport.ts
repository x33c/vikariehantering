import type { Frånvaro, Vikariepass } from '../types';
import { absenceNeedsSubstitute, shiftMatchesAbsence } from './absenceSuggestions';

export const REPORT_STATUSES = ['Alla pass bokade', 'Delvis bemannat', 'Pass utan vikarie', 'Saknar pass', 'Vikarie behövs ej', 'Markerat löst'] as const;
export type ReportStatus = typeof REPORT_STATUSES[number];
export type AbsenceReportRow = {
  key: string; personId: string; name: string; team: string; date: string;
  fullDay: boolean; time: string; status: ReportStatus;
};
export function reportDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function validReportRange(start: string, end: string) {
  return [start, end].every(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d) && start <= end &&
    (Date.parse(end) - Date.parse(start)) / 86400000 < 366;
}
export function buildAbsenceReport(absences: Frånvaro[], shifts: Vikariepass[], start: string, end: string, search: string) {
  if (!validReportRange(start, end)) throw new Error('Välj ett giltigt datumintervall på högst 366 dagar.');
  const term = search.trim().toLocaleLowerCase('sv-SE');
  const groups = new Map<string, { date: string; absences: Frånvaro[] }>();
  const recordIds = new Set<string>();
  for (const absence of absences) {
    const notes = (absence.anteckning ?? '').split('\n').filter(l => !/^\[admin:franvaro-lost(?::\d{4}-\d{2}-\d{2})?\]$/.test(l.trim())).join('\n');
    if (term && ![absence.personal?.namn, absence.personal?.arbetslag?.namn, notes].some(s => s?.toLocaleLowerCase('sv-SE').includes(term))) continue;
    const from = absence.datum_från > start ? absence.datum_från : start;
    const to = absence.datum_till < end ? absence.datum_till : end;
    for (let date = from; date <= to; date = reportDate(date, 1)) {
      const day = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (day === 0 || day === 6) continue;
      recordIds.add(absence.id);
      const key = `${absence.personal_id}:${date}`;
      const group = groups.get(key) ?? { date, absences: [] };
      group.absences.push(absence);
      groups.set(key, group);
    }
  }
  const byPersonDay = new Map<string, Vikariepass[]>();
  for (const shift of shifts) {
    const key = `${shift.personal_id}:${shift.datum}`;
    byPersonDay.set(key, [...(byPersonDay.get(key) ?? []), shift]);
  }
  const rows: AbsenceReportRow[] = [];
  for (const [key, group] of groups) {
    const first = group.absences[0];
    const unresolved = group.absences.filter(a => {
      const lines = (a.anteckning ?? '').split('\n').map(l => l.trim());
      return !lines.includes(`[admin:franvaro-lost:${group.date}]`) && !(a.datum_från === a.datum_till && lines.includes('[admin:franvaro-lost]'));
    });
    const needed = unresolved.filter(absenceNeedsSubstitute);
    const matches = needed.map(a => (byPersonDay.get(key) ?? []).filter(p => shiftMatchesAbsence(p, a)));
    const all = matches.flat();
    const booked = (p: Vikariepass) => !!p.vikarie_id && ['bokat', 'bekräftat'].includes(p.status);
    const status: ReportStatus = !unresolved.length ? 'Markerat löst' : !needed.length ? 'Vikarie behövs ej' :
      matches.every(p => p.length > 0 && p.every(booked)) ? 'Alla pass bokade' :
      all.some(booked) ? 'Delvis bemannat' : matches.some(p => !p.length) ? 'Saknar pass' : 'Pass utan vikarie';
    const fullDay = group.absences.some(a => a.hel_dag);
    const time = fullDay ? 'Heldag' : [...new Set(group.absences.map(a => a.tid_från && a.tid_till ? `${a.tid_från.slice(0, 5)}–${a.tid_till.slice(0, 5)}` : 'Tid saknas'))].sort().join(', ');
    rows.push({ key, personId: first.personal_id, name: first.personal?.namn ?? 'Okänd personal', team: first.personal?.arbetslag?.namn ?? 'Inget arbetslag', date: group.date, fullDay, time, status });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'sv'));
  const bookedShifts = [...new Map(shifts.filter(p => {
    if (!p.vikarie_id || !['bokat', 'bekräftat'].includes(p.status) || p.datum < start || p.datum > end) return false;
    const weekday = new Date(`${p.datum}T12:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) return false;
    return !term || groups.has(`${p.personal_id}:${p.datum}`) ||
      [p.personal?.namn, p.personal?.arbetslag?.namn, p.grupp].some(s => s?.toLocaleLowerCase('sv-SE').includes(term));
  }).map(p => [p.id, p])).values()];
  const daily = [];
  for (let date = start; date <= end; date = reportDate(date, 1)) {
    if ([0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) continue;
    const dayShifts = bookedShifts.filter(p => p.datum === date);
    daily.push({ date, people: rows.filter(r => r.date === date).length,
      substitutes: new Set(dayShifts.map(p => p.vikarie_id)).size, shifts: dayShifts.length });
  }
  const substitutes = [...new Set(bookedShifts.map(p => p.vikarie_id!))].map(id => {
    const bookings = bookedShifts.filter(p => p.vikarie_id === id);
    return { id, name: bookings[0].vikarie?.namn ?? 'Okänd vikarie', days: new Set(bookings.map(p => p.datum)).size, shifts: bookings.length };
  }).sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  const peopleDetails = [...new Set(rows.map(r => r.personId))].map(id => {
    const days = rows.filter(r => r.personId === id);
    return { id, name: days[0].name, team: days[0].team, days: days.length, fullDays: days.filter(r => r.fullDay).length, partialDays: days.filter(r => !r.fullDay).length };
  }).sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  return { rows, people: new Set(rows.map(r => r.personId)).size, records: recordIds.size,
    daily, substitutes, peopleDetails, bookedShifts: bookedShifts.length,
    substituteDays: daily.reduce((sum, d) => sum + d.substitutes, 0),
    fullDays: rows.filter(r => r.fullDay).length, partialDays: rows.filter(r => !r.fullDay).length };
}
