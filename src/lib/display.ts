export function visaKortNamn(namn?: string | null) {
  if (!namn) return 'Okänd personal';
  const delar = namn.trim().split(/\s+/).filter(Boolean);
  if (delar.length <= 1) return delar[0] ?? 'Okänd personal';
  return `${delar[0]} ${delar[delar.length - 1].slice(0, 1)}.`;
}

export function visaArskurs(grupper: Array<string | null | undefined>) {
  const text = grupper.filter(Boolean).join(' ').toLowerCase();

  if (!text.trim()) return 'Ej angiven årskurs';
  if (/fsk|förskoleklass|f-klass|fk/.test(text)) return 'FSK';

  const siffror = [...text.matchAll(/\b[1-6]\b/g)].map(m => Number(m[0]));
  if (siffror.some(n => n >= 1 && n <= 3)) return 'åk. 1-3';
  if (siffror.some(n => n >= 4 && n <= 6)) return 'åk. 4-6';

  return 'Ej angiven årskurs';
}

export function visaKommentar(anteckning?: string | null) {
  const text = anteckning?.trim();
  if (!text) return null;

  if (/^sammanhållet pass från/i.test(text)) return null;
  if (/\b\d+\s+lektioner\b/i.test(text) && /\d{2}:\d{2}/.test(text)) return null;

  return text;
}
