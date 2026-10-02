import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type Decline = { id: string; text: string };
export async function loadDeclines(dates: string[]): Promise<Decline[]> {
  const days = [...new Set(dates.filter(Boolean))];
  if (!days.length) return [];
  const res = await supabase.from('pass_forfragningar')
    .select('vikarie_id, pass:vikariepass!inner(datum, "tid_från", tid_till, grupp)')
    .eq('status', 'nej').in('pass.datum', days);
  const history = await supabase.from('passhistorik').select('metadata')
    .eq('metadata->>svar', 'nej').in('metadata->>datum', days);
  if (res.error || history.error) throw new Error('Tidigare nej-svar kunde inte kontrolleras. Försök igen.');
  const rows: Decline[] = (history.data ?? []).flatMap(({ metadata: m }) => typeof m?.vikarie_id === 'string'
    ? [{ id: m.vikarie_id, text: `${m.datum} ${m.tid ?? ''} ${m.personal_namn ?? ''}`.trim() }] : []);
  for (const r of res.data ?? []) {
    const p = Array.isArray(r.pass) ? r.pass[0] : r.pass;
    if (p) rows.push({ id: r.vikarie_id, text: `${p.datum} ${p.tid_från.slice(0, 5)}-${p.tid_till.slice(0, 5)} ${p.grupp ?? ''}`.trim() });
  }
  return rows;
}
export function declineText(rows: Decline[], id: string) {
  return [...new Set(rows.filter(r => r.id === id).map(r => r.text))].join('; ');
}
export async function confirmDeclines(dates: string[], id: string) {
  const text = declineText(await loadDeclines(dates), id);
  return !text || window.confirm(`Vikarien har tackat nej till pass denna dag:\n${text}\n\nSkicka ändå en ny förfrågan? Ett nej behöver inte gälla hela dagen.`);
}
export function useDeclinedShifts(dates: string[]) {
  const key = [...new Set(dates.filter(Boolean))].sort().join(',');
  const [state, setState] = useState({ key: '', rows: [] as Decline[], error: '' });
  useEffect(() => {
    let active = true;
    loadDeclines(key ? key.split(',') : []).then(rows => { if (active) setState({ key, rows, error: '' }); })
      .catch(() => { if (active) setState({ key, rows: [], error: 'Tidigare nej-svar kunde inte hämtas.' }); });
    return () => { active = false; };
  }, [key]);
  return state.key === key ? state : { key, rows: [], error: '' };
}
