export function visaKortNamn(namn?: string | null) {
  if (!namn) return 'Okänd personal';
  const delar = namn.trim().split(/\s+/).filter(Boolean);
  if (delar.length <= 1) return delar[0] ?? 'Okänd personal';
  return `${delar[0]} ${delar[delar.length - 1].slice(0, 1)}.`;
}

export function visaArskurs(grupper: Array<string | null | undefined>) {
  const text = grupper
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o');

  if (!text.trim()) return 'Ej angiven årskurs';
  if (/\b(fsk|forskol|forskoleklass|f-klass|fk)\b/.test(text)) return 'FSK';

  const hittade = new Set<number>();

  for (const match of text.matchAll(/(?:ak|arskurs|klass)?\s*([1-6])\s*[-–]\s*([1-6])/g)) {
    const start = Number(match[1]);
    const slut = Number(match[2]);
    for (let n = Math.min(start, slut); n <= Math.max(start, slut); n++) hittade.add(n);
  }

  for (const match of text.matchAll(/(?:\bak\.?\s*|\barskurs\s*|\bklass\s*)?([1-6])\s*[a-z]?\b/g)) {
    hittade.add(Number(match[1]));
  }

  const låg = [...hittade].some(n => n >= 1 && n <= 3);
  const hög = [...hittade].some(n => n >= 4 && n <= 6);

  if (låg && hög) return 'åk. 1-6';
  if (låg) return 'åk. 1-3';
  if (hög) return 'åk. 4-6';

  return 'Ej angiven årskurs';
}

export function visaKommentar(anteckning?: string | null) {
  const text = anteckning?.trim();
  if (!text) return null;

  if (/^sammanhållet pass från/i.test(text)) return null;
  if (/\b\d+\s+lektioner\b/i.test(text) && /\d{2}:\d{2}/.test(text)) return null;

  return text;
}
