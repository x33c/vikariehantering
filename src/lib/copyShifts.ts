import type { Bemanning, NyttVikariepass } from '../types';

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function monday(date: string) {
  return shiftDate(date, 1 - (new Date(`${date}T12:00:00Z`).getUTCDay() || 7));
}

export type ShiftCopy = NyttVikariepass & { id: string };
export type ConflictShift = Pick<Bemanning, 'id' | 'datum' | 'tid_från' | 'tid_till' | 'personal_id' | 'vikarie_id' | 'grupp' | 'status'>;

export function planShiftCopies(source: Bemanning[], weeks: string[], retainSubstitute: boolean, today: string): ShiftCopy[] {
  if (!source.length || source.some(p => p.status === 'avbokat')) throw new Error('Markera aktiva pass att kopiera.');
  if (new Set(source.map(p => monday(p.datum))).size !== 1) throw new Error('Markera pass från en och samma källvecka.');
  if (!weeks.length || weeks.length > 12 || source.length * weeks.length > 100) throw new Error('Välj 1–12 målveckor, högst 100 nya pass åt gången.');
  const targets = [...new Set(weeks)].sort();
  if (targets.some(w => !/^\d{4}-\d{2}-\d{2}$/.test(w) || monday(w) !== w || w <= monday(source[0].datum))) throw new Error('Målveckorna måste ligga efter källveckan.');
  return targets.flatMap(week => source.map(p => {
    const weekday = new Date(`${p.datum}T12:00:00Z`).getUTCDay();
    const datum = shiftDate(week, weekday - 1);
    if (weekday < 1 || weekday > 5 || datum < today || !p.tid_från || !p.tid_till || p.tid_från >= p.tid_till) throw new Error('Kontrollera datum och tider. Endast kommande vardagspass kan skapas.');
    const vikarie_id = retainSubstitute && ['bokat', 'bekräftat'].includes(p.status) ? p.vikarie_id : null;
    return {
      id: crypto.randomUUID(), datum, tid_från: p.tid_från, tid_till: p.tid_till,
      personal_id: p.personal_id, grupp: p.grupp, ämne: p.ämne, sal: p.sal, typ: p.typ,
      vikarie_id, status: vikarie_id ? 'bokat' : 'obokat', publicerad: false,
      frånvaro_id: null, schemarad_id: null, riktad_till_vikarie_id: null,
      anteckning: null, skapad_av: null,
    };
  }));
}

export function copyConflicts(copies: ShiftCopy[], existing: ConflictShift[], locked: Set<string>): string[] {
  const errors = new Set<string>();
  copies.forEach((p, i) => {
    if (locked.has(p.datum)) errors.add(`${p.datum}: dagen är låst.`);
    for (const other of [...existing, ...copies.slice(0, i)]) {
      if (other.status === 'avbokat' || other.datum !== p.datum) continue;
      const overlap = p.tid_från.slice(0, 5) < other.tid_till.slice(0, 5) && p.tid_till.slice(0, 5) > other.tid_från.slice(0, 5);
      if (!overlap) continue;
      if (p.vikarie_id && p.vikarie_id === other.vikarie_id) errors.add(`${p.datum}: vikarien har redan ett överlappande pass.`);
      if (p.personal_id && p.personal_id === other.personal_id) errors.add(`${p.datum}: personalen har redan ett överlappande pass.`);
      if (!p.personal_id && !other.personal_id && p.grupp === other.grupp && p.tid_från.slice(0, 5) === other.tid_från.slice(0, 5) && p.tid_till.slice(0, 5) === other.tid_till.slice(0, 5)) errors.add(`${p.datum}: ett likadant fristående pass finns redan.`);
    }
  });
  return [...errors];
}
