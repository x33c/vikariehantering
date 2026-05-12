export function visaKortNamn(namn?: string | null) {
  if (!namn) return 'Okänd personal';
  const delar = namn.trim().split(/\s+/).filter(Boolean);
  if (delar.length <= 1) return delar[0] ?? 'Okänd personal';
  return `${delar[0]} ${delar[delar.length - 1].slice(0, 1)}.`;
}
