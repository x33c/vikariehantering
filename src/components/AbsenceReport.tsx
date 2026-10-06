import { useEffect, useMemo, useState } from 'react';
import type { Frånvaro, Vikariepass } from '../types';
import { supabase } from '../lib/supabase';
import { buildAbsenceReport, reportDate, REPORT_STATUSES, validReportRange } from '../lib/absenceReport';
import { Alert, Button, Input, Select } from './ui';

export function AbsenceReport({ week, search, revision }: { week: string; search: string; revision: string }) {
  const [mode, setMode] = useState('week');
  const [expanded, setExpanded] = useState(false);
  const [day, setDay] = useState(week);
  const [detailView, setDetailView] = useState('daily');
  const [month, setMonth] = useState(week.slice(0, 7));
  const [from, setFrom] = useState(week);
  const [to, setTo] = useState(reportDate(week, 4));
  const [refresh, setRefresh] = useState(0);
  const [details, setDetails] = useState(false);
  const [limit, setLimit] = useState(50);
  const [snapshot, setSnapshot] = useState<{ key: string; absences: Frånvaro[]; shifts: Vikariepass[] } | null>(null);
  const [error, setError] = useState('');
  const start = mode === 'day' ? day : mode === 'week' ? week : mode === 'month' ? `${month}-01` : from;
  const end = mode === 'day' ? day : mode === 'week' ? reportDate(week, 4) : mode === 'month' && /^\d{4}-\d{2}$/.test(month) && Number.isFinite(Date.parse(`${month}-01`))
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
            .select('id,personal_id,"frånvaro_id",datum,"tid_från",tid_till,vikarie_id,status,grupp,personal(namn,arbetslag(namn)),vikarie:vikarier!vikariepass_vikarie_id_fkey(namn)')
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
    <button type="button" aria-expanded={expanded} aria-controls="absence-report-content" onClick={() => setExpanded(v => !v)}
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded py-1 text-left text-xs focus-visible:outline focus-visible:outline-2">
      <span className="font-semibold">{expanded ? '▾' : '▸'} Frånvaro och bemanning</span>
      <span style={{ color: 'var(--text-muted)' }}>{valid ? `${start} – ${end}` : 'Välj period'}</span>
      <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>{error ? 'Rapporten kunde inte hämtas' : report ? `${report.people} unika frånvarande · ${report.substitutes.length} bokade vikarier` : valid ? 'Hämtar…' : ''}</span>
    </button>
    <div id="absence-report-content" hidden={!expanded} className="mt-3">
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Frånvarorapport</h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{valid ? `${start} – ${end} · Mån–fre` : 'Datumintervall saknas'}{search ? ` · Sökning: ${search}` : ''}</p>
      </div>
      <div className="w-full sm:w-40"><Select label="Rapportperiod" value={mode} onChange={e => setMode(e.target.value)}>
        <option value="day">Dag</option><option value="week">Vald vecka</option><option value="month">Månad</option><option value="custom">Eget intervall</option>
      </Select></div>
      {mode === 'day' && <div className="min-w-0 w-full sm:w-44"><Input label="Rapportdatum" type="date" value={day} onChange={e => setDay(e.target.value)} /></div>}
      {mode === 'month' && <div className="min-w-0 w-full sm:w-44"><Input label="Månad" type="month" value={month} onChange={e => setMonth(e.target.value)} /></div>}
      {mode === 'custom' && <div className="grid w-full min-w-0 gap-2 sm:w-auto sm:grid-cols-2">
        <Input label="Från datum" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <Input label="Till datum" type="date" value={to} onChange={e => setTo(e.target.value)} />
      </div>}
      <Button size="sm" variant="secondary" onClick={() => setRefresh(n => n + 1)}>Uppdatera rapport</Button>
    </div>
    {!valid ? <div className="mt-3"><Alert typ="warning">Välj ett giltigt datumintervall på högst 366 dagar.</Alert></div> : error ? <div className="mt-3"><Alert typ="error">{error}</Alert></div> : !report ? <p role="status" className="py-3 text-sm">Hämtar rapport…</p> : <>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 xl:grid-cols-6">
        {[
          ['Unika frånvarande', report.people], ['Persondagar', report.rows.length], ['Heldagar', report.fullDays], ['Deldagar', report.partialDays],
          ['Unika bokade vikarier', report.substitutes.length], ['Bokade pass', report.bookedShifts], ['Vikariedagar', report.substituteDays],
          ...REPORT_STATUSES.map(status => [status, report.rows.filter(r => r.status === status).length]),
        ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</dt><dd className="text-sm font-semibold">{value}</dd></div>)}
      </dl>
      <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{search ? 'Vikarier: bokade pass som matchar sökningen.' : 'Vikarier: samtliga bokade pass i perioden, även fristående.'} Vikariedagar: en vikarie räknas en gång per vardag.</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{report.records} frånvaroposter i perioden · Bemanning per persondag</span>
        <Button size="sm" variant="secondary" aria-expanded={details} onClick={() => setDetails(v => !v)}>{details ? 'Dölj rapportdetaljer' : 'Visa rapportdetaljer'}</Button>
      </div>
      {details && <div className="mt-3" aria-label="Rapportdetaljer">
        <div className="mb-3 w-full sm:w-52"><Select label="Detaljvy" value={detailView} onChange={e => { setDetailView(e.target.value); setLimit(50); }}>
          <option value="daily">Per dag</option><option value="people">Frånvarande personer</option><option value="substitutes">Bokade vikarier</option><option value="absences">Frånvarodetaljer</option>
        </Select></div>
        {detailView === 'daily' && <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>
          <th className="py-2 pr-2">Datum</th><th className="px-1">Unika frånvarande</th><th className="px-1">Unika vikarier</th><th className="pl-1">Bokade pass</th>
        </tr></thead><tbody>{report.daily.slice(0, limit).map(d => <tr key={d.date} className="border-t" style={{ borderColor: 'var(--border)' }}>
          <td className="whitespace-nowrap py-2 pr-2">{d.date}</td><td className="px-1">{d.people}</td><td className="px-1">{d.substitutes}</td><td className="pl-1">{d.shifts}</td>
        </tr>)}</tbody></table></div>}
        {detailView === 'people' && <ul>{report.peopleDetails.slice(0, limit).map(p => <li key={p.id} className="flex flex-wrap justify-between gap-1 border-t py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
          <span className="min-w-0 break-words font-semibold">{p.name} · {p.team}</span><span>{p.days} dagar · {p.fullDays} hel / {p.partialDays} del</span>
        </li>)}</ul>}
        {detailView === 'substitutes' && <ul>{report.substitutes.slice(0, limit).map(p => <li key={p.id} className="flex flex-wrap justify-between gap-1 border-t py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
          <span className="min-w-0 break-words font-semibold">{p.name}</span><span>{p.days} dagar · {p.shifts} pass</span>
        </li>)}</ul>}
        {detailView === 'absences' && (!report.rows.length ? <p className="py-3 text-sm">Ingen frånvaro matchar perioden och sökningen.</p> : <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {report.rows.slice(0, limit).map(row => <li key={row.key} className="grid min-w-0 gap-1 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0 break-words"><p className="font-semibold">{row.name}</p><p className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.team}</p></div>
            <div><p>{row.date}</p><p>{row.time}</p></div><p>{row.status}</p>
          </li>)}
        </ul>)}
        {((detailView === 'daily' ? report.daily : detailView === 'people' ? report.peopleDetails : detailView === 'substitutes' ? report.substitutes : report.rows).length === 0) && detailView !== 'absences' && <p className="py-3 text-sm">Inga matchande poster i perioden.</p>}
        {(detailView === 'daily' ? report.daily : detailView === 'people' ? report.peopleDetails : detailView === 'substitutes' ? report.substitutes : report.rows).length > limit && <Button size="sm" variant="secondary" onClick={() => setLimit(n => n + 50)}>Visa fler</Button>}
      </div>}
    </>}
    </div>
  </section>;
}
