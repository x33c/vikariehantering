import { useRef, useState } from 'react';
import type { Bemanning, Personal, Vikarie } from '../types';
import { supabase } from '../lib/supabase';
import { copyConflicts, monday, planShiftCopies, shiftDate, type ShiftCopy, type ConflictShift } from '../lib/copyShifts';
import { Alert, Button, Modal } from './ui';

export function CopyShiftsModal({ source, personal, substitutes, locked, onClose, onSaved }: {
  source: Bemanning[]; personal: Personal[]; substitutes: Vikarie[]; locked: Set<string>;
  onClose: () => void; onSaved: (count: number, warning: string) => void;
}) {
  const today = new Date().toLocaleDateString('sv-SE');
  const sourceWeek = monday(source[0].datum);
  const firstWeek = shiftDate(sourceWeek > monday(today) ? sourceWeek : monday(today), 7);
  const [weeks, setWeeks] = useState<string[]>([firstWeek]);
  const [retain, setRetain] = useState(false);
  const [preview, setPreview] = useState<ShiftCopy[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function check(copies: ShiftCopy[]) {
    const existing: ConflictShift[] = [];
    const days = [...new Set(copies.map(p => p.datum))];
    // Fetch only conflict fields and page all results; a truncated response could miss a booking.
    for (let offset = 0; ; offset += 500) {
      const result = await supabase.from('vikariepass')
        .select('id,datum,"tid_från",tid_till,personal_id,vikarie_id,grupp,status')
        .in('datum', days).neq('status', 'avbokat').order('id').range(offset, offset + 499);
      if (result.error) throw new Error('Kunde inte kontrollera befintliga pass. Försök igen.');
      existing.push(...(result.data as ConflictShift[]));
      if (result.data.length < 500) break;
    }
    const substituteIds = [...new Set(copies.map(p => p.vikarie_id).filter((id): id is string => !!id))];
    if (substituteIds.length) {
      const result = await supabase.from('vikarier').select('id').in('id', substituteIds).eq('aktiv', true);
      if (result.error) throw new Error('Kunde inte kontrollera vikarierna. Försök igen.');
      if (result.data.length !== substituteIds.length) throw new Error('En vald vikarie är inte längre aktiv. Kopiera utan bemanning.');
    }
    return copyConflicts(copies, existing, locked);
  }

  async function run(save: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setErrors([]);
    try {
      const copies = save ? preview : planShiftCopies(source, weeks, retain, today);
      if (!copies.length) return;
      const conflicts = await check(copies);
      if (conflicts.length) { setErrors(conflicts); setPreview([]); return; }
      if (!save) { setPreview(copies); return; }
      const user = await supabase.auth.getUser();
      if (user.error || !user.data.user) throw new Error('Logga in igen innan du kopierar pass.');
      // One INSERT is atomic. Preview IDs remain stable if a request is retried.
      const result = await supabase.from('vikariepass').insert(copies.map(p => ({ ...p, skapad_av: user.data.user!.id })));
      if (result.error) throw new Error(`Kopieringen kunde inte bekräftas. Kontrollera målveckorna innan du försöker igen. ${result.error.message}`);
      let warning = '';
      try {
        const history = await supabase.from('passhistorik').insert(copies.map(p => ({
          pass_id: p.id, händelse: 'pass_skapat' as const, utförd_av: user.data.user!.id,
          metadata: { typ: 'kopierat_veckopass', kallvecka: sourceWeek, kallpass: source.map(s => s.id) },
        })));
        if (history.error) warning = 'Passen skapades, men historiken kunde inte sparas.';
      } catch { warning = 'Passen skapades, men historiken kunde inte sparas.'; }
      onSaved(copies.length, warning);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Kunde inte kopiera passen.']);
    } finally { setBusy(false); inFlight.current = false; }
  }

  return <Modal öppen onStäng={() => { if (!inFlight.current) onClose(); }} titel="Kopiera till fler veckor" bredd="lg">
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{source.length} valda pass · Källvecka {sourceWeek}</p>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="mb-2 text-sm font-semibold">Målveckor</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Array.from({ length: 12 }, (_, i) => shiftDate(firstWeek, i * 7)).map(week =>
            <label key={week} className="flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
              <input type="checkbox" checked={weeks.includes(week)} onChange={e => {
                setWeeks(e.target.checked ? [...weeks, week] : weeks.filter(w => w !== week)); setPreview([]); setErrors([]);
              }} />
              {week} – {shiftDate(week, 4)}
            </label>)}
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={retain} onChange={e => { setRetain(e.target.checked); setPreview([]); setErrors([]); }} />
          Boka samma vikarier direkt
        </label>
      </fieldset>
      {errors.length > 0 && <Alert typ="error"><ul>{errors.map(e => <li key={e}>{e}</li>)}</ul></Alert>}
      {preview.length > 0 && <section aria-label="Förhandsgranskning" className="space-y-2">
        <h3 className="text-sm font-semibold">{preview.length} nya pass · Ej publicerade · Inga utskick</h3>
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>{preview.map(p => <li key={p.id} className="py-2 text-sm">
          <p className="font-semibold">{p.datum} · {p.tid_från.slice(0, 5)}–{p.tid_till.slice(0, 5)}</p>
          <p className="break-words">{personal.find(s => s.id === p.personal_id)?.namn ?? 'Fristående pass'}{p.grupp ? ` · ${p.grupp}` : ''}</p>
          <p style={{ color: 'var(--text-muted)' }}>{p.vikarie_id ? `Bokas: ${substitutes.find(v => v.id === p.vikarie_id)?.namn ?? p.vikarie_id}` : 'Obokat'}</p>
        </li>)}</ul>
      </section>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onClose}>Avbryt</Button>
        <Button loading={busy} disabled={!weeks.length} onClick={() => run(preview.length > 0)}>{preview.length ? `Skapa ${preview.length} pass` : 'Förhandsgranska'}</Button>
      </div>
    </div>
  </Modal>;
}
