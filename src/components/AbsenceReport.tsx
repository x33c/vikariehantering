import { useEffect, useMemo, useState } from 'react';
import type { Frånvaro, Vikariepass } from '../types';
import { supabase } from '../lib/supabase';
import { buildAbsenceReport, reportDate, REPORT_STATUSES, validReportRange } from '../lib/absenceReport';
import { Alert, Button, Input, Select } from './ui';

export function AbsenceReport({ week, search, revision }: { week: string; search: string; revision: string }) {
  const [mode, setMode] = useState('week');
  const [month, setMonth] = useState(week.slice(0, 7));
  const [from, setFrom] = useState(week);
  const [to, setTo] = useState(reportDate(week, 4));
  const [refresh, setRefresh] = useState(0);
  const [details, setDetails] = useState(false);
  const [limit, setLimit] = useState(50);
  const [snapshot, setSnapshot] = useState<{ key: string; absences: Frånvaro[]; shifts: Vikariepass[] } | null>(null);
  const [error, setError] = useState('');
  const start = mode === 'week' ? week : mode === 'month' ? `${month}-01` : from;
  const end = mode === 'week' ? reportDate(week, 4) : mode === 'month' && /^\d{4}-\d{2}$/.test(month) && Number.isFinite(Date.parse(`${month}-01`))
    ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 12)).toISOString().slice(0, 10) : to;
  const valid = validReportRange(start, end);
  const key = JSON.stringify([start, end, refresh, revision]);
  const ready = valid && snapshot?.key === key;

  useEffect(() => {
    const controller = new AbortController();
    setError(''); setLimit(50);
    if (!valid) return () => controller.abort();
    async function load() {
      try {
        const absences: Frånvaro[] = [], shifts: Vikariepass[] = [];
        // Each query is period-bounded and paged to avoid silently truncated totals.
        for (let offset = 0; ; offset += 500) {
          const result = await supabase.from('frånvaro')
            .select('id,personal_id,"datum_från",datum_till,hel_dag,"tid_från",tid_till,anteckning,personal(namn,arbetslag(namn))')
            .lte('datum_från', end).gte('datum_till', start).order('id').range(offset, offset + 499).abortSignal(controller.signal);
          if (result.error) throw result.error;
          absences.push(...(result.data as unknown as Frånvaro[]));
          if (result.data.length < 500) break;
        }
        for (let offset = 0; ; offset += 500) {
          const result = await supabase.from('vikariepass')
            .select('id,personal_id,"frånvaro_id",datum,"tid_från",tid_till,vikarie_id,status')
            .gte('datum', start).lte('datum', end).neq('status', 'avbokat').order('id').range(offset, offset + 499).abortSignal(controller.signal);
          if (result.error) throw result.error;
          shifts.push(...(result.data as unknown as Vikariepass[]));
          if (result.data.length < 500) break;
        }
        if (!controller.signal.aborted) setSnapshot({ key, absences, shifts });
      } catch { if (!controller.signal.aborted) setError('Rapporten kunde inte hämtas. Försök igen.'); }
    }
    void load();
    return () => controller.abort();
  }, [key, start, end, valid]);

  const report = useMemo(() => ready && snapshot ? buildAbsenceReport(snapshot.absences, snapshot.shifts, start, end, search) : null, [ready, snapshot, start, end, search]);
  useEffect(() => { setLimit(50); }, [search]);
  return <section aria-label="Frånvarorapport" className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Frånvarorapport</h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{valid ? `${start} – ${end} · Mån–fre` : 'Datumintervall saknas'}{search ? ` · Sökning: ${search}` : ''}</p>
      </div>
      <div className="w-full sm:w-40"><Select label="Rapportperiod" value={mode} onChange={e => setMode(e.target.value)}>
        <option value="week">Vald vecka</option><option value="month">Månad</option><option value="custom">Eget intervall</option>
      </Select></div>
      {mode === 'month' && <div className="min-w-0 w-full sm:w-44"><Input label="Månad" type="month" value={month} onChange={e => setMonth(e.target.value)} /></div>}
      {mode === 'custom' && <div className="grid w-full min-w-0 gap-2 sm:w-auto sm:grid-cols-2">
        <Input label="Från datum" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <Input label="Till datum" type="date" value={to} onChange={e => setTo(e.target.value)} />
      </div>}
      <Button size="sm" variant="secondary" onClick={() => setRefresh(n => n + 1)}>Uppdatera rapport</Button>
    </div>
    {!valid ? <div className="mt-3"><Alert typ="warning">Välj ett giltigt datumintervall på högst 366 dagar.</Alert></div> : error ? <div className="mt-3"><Alert typ="error">{error}</Alert></div> : !report ? <p role="status" className="py-3 text-sm">Hämtar rapport…</p> : <>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {[
          ['Personer', report.people], ['Persondagar', report.rows.length], ['Heldagar', report.fullDays], ['Deldagar', report.partialDays],
          ...REPORT_STATUSES.map(status => [status, report.rows.filter(r => r.status === status).length]),
        ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</dt><dd className="text-lg font-semibold">{value}</dd></div>)}
      </dl>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{report.records} frånvaroposter i perioden · Bemanning per persondag</span>
        <Button size="sm" variant="secondary" aria-expanded={details} onClick={() => setDetails(v => !v)}>{details ? 'Dölj rapportdetaljer' : 'Visa rapportdetaljer'}</Button>
      </div>
      {details && <div className="mt-3" aria-label="Rapportdetaljer">
        {!report.rows.length ? <p className="py-3 text-sm">Ingen frånvaro matchar perioden och sökningen.</p> : <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {report.rows.slice(0, limit).map(row => <li key={row.key} className="grid min-w-0 gap-1 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0 break-words"><p className="font-semibold">{row.name}</p><p className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.team}</p></div>
            <div><p>{row.date}</p><p>{row.time}</p></div><p>{row.status}</p>
          </li>)}
        </ul>}
        {report.rows.length > limit && <Button size="sm" variant="secondary" onClick={() => setLimit(n => n + 50)}>Visa fler ({report.rows.length - limit} kvar)</Button>}
      </div>}
    </>}
  </section>;
}
