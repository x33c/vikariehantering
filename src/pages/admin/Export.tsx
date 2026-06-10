import { useEffect, useMemo, useState } from 'react';
import { frånvaroApi, passApi, vikariApi } from '../../lib/api';
import type { Frånvaro, PassStatus, Vikarie, Vikariepass } from '../../types';
import { PASS_STATUS_LABELS } from '../../types';
import { Alert, Button, Input, LaddaSida } from '../../components/ui';

const LOST_FRANVARO_MARKER = '[admin:franvaro-lost]';
const LOST_FRANVARO_DATUM_PREFIX = '[admin:franvaro-lost:';

function datumIdag() {
  return new Date().toISOString().slice(0, 10);
}

function läggTillDagar(datum: string, dagar: number) {
  const d = new Date(`${datum}T12:00:00`);
  d.setDate(d.getDate() + dagar);
  return d.toISOString().slice(0, 10);
}

function startPåVecka(datum: string) {
  const d = new Date(`${datum}T12:00:00`);
  const dag = d.getDay() || 7;
  d.setDate(d.getDate() - dag + 1);
  return d.toISOString().slice(0, 10);
}

function slutPåVecka(datum: string) {
  return läggTillDagar(startPåVecka(datum), 4);
}

function datumIntervall(start: string, slut: string) {
  const datum: string[] = [];
  const aktuell = new Date(`${start}T12:00:00`);
  const sista = new Date(`${slut}T12:00:00`);

  while (aktuell <= sista) {
    datum.push(aktuell.toISOString().slice(0, 10));
    aktuell.setDate(aktuell.getDate() + 1);
  }

  return datum;
}

function svDatum(datum?: string | null) {
  if (!datum) return '-';
  return new Date(`${datum}T12:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function tid(t?: string | null) {
  return t ? t.slice(0, 5) : '';
}

function csvCell(value: unknown) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return /[";,\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function byggCsv(headers: string[], rows: unknown[][]) {
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(';'))
    .join('\n');
}

function laddaNerFil(namn: string, innehåll: string) {
  const blob = new Blob([`\uFEFF${innehåll}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namn;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function statusText(status: PassStatus) {
  return PASS_STATUS_LABELS[status] ?? status;
}

function frånvaroÄrLöstFörDag(frånvaro: Frånvaro, dag: string) {
  const rader = (frånvaro.anteckning ?? '').split('\n').map((rad) => rad.trim());
  if (rader.includes(`${LOST_FRANVARO_DATUM_PREFIX}${dag}]`)) return true;

  const helArkiverad = rader.includes(LOST_FRANVARO_MARKER);
  if (!helArkiverad) return false;

  return datumIntervall(frånvaro.datum_från, frånvaro.datum_till).every((datum) =>
    rader.includes(`${LOST_FRANVARO_DATUM_PREFIX}${datum}]`)
  );
}

function frånvaroFörPeriod(frånvaro: Frånvaro[], datumFrån: string, datumTill: string) {
  const dagar = datumIntervall(datumFrån, datumTill);
  return frånvaro.flatMap((f) =>
    dagar
      .filter((dag) => f.datum_från <= dag && f.datum_till >= dag && !frånvaroÄrLöstFörDag(f, dag))
      .map((dag) => ({ ...f, exportDatum: dag }))
  );
}

function personalNamn(frånvaro: Frånvaro) {
  return frånvaro.personal?.namn ?? 'Okänd personal';
}

function passPersonal(pass: Vikariepass) {
  return pass.personal?.namn ?? 'Fristående pass';
}

function passVikarie(pass: Vikariepass, vikarier: Vikarie[]) {
  if (!pass.vikarie_id) return '';
  return vikarier.find((v) => v.id === pass.vikarie_id)?.namn ?? pass.vikarie?.namn ?? '';
}

function passGrupp(pass: Vikariepass) {
  return pass.grupp ?? pass.personal?.arbetslag?.namn ?? '';
}

function arbetslagSortIndex(value?: string | null) {
  const text = (value ?? '').toLowerCase().replace(/\s+/g, '');
  if (!text) return 99;
  if (text.includes('fsk') || text.includes('förskole') || text.includes('forskole')) return 0;
  const match = text.match(/(?:åk\.?|ak\.?)?([1-6])/) ?? text.match(/^([1-6])/);
  if (match) return Number(match[1]);
  if (text.includes('prest')) return 7;
  return 99;
}

function sorteraFrånvaro(a: Frånvaro & { exportDatum: string }, b: Frånvaro & { exportDatum: string }) {
  return a.exportDatum.localeCompare(b.exportDatum)
    || arbetslagSortIndex(a.personal?.arbetslag?.namn) - arbetslagSortIndex(b.personal?.arbetslag?.namn)
    || personalNamn(a).localeCompare(personalNamn(b), 'sv');
}

function sorteraPass(a: Vikariepass, b: Vikariepass) {
  return a.datum.localeCompare(b.datum)
    || arbetslagSortIndex(passGrupp(a)) - arbetslagSortIndex(passGrupp(b))
    || tid(a.tid_från).localeCompare(tid(b.tid_från))
    || passPersonal(a).localeCompare(passPersonal(b), 'sv');
}

function frånvaroCsv(frånvaro: Array<Frånvaro & { exportDatum: string }>) {
  return byggCsv(
    ['Datum', 'Personal', 'Arbetslag', 'Omfattning', 'Tid'],
    frånvaro.sort(sorteraFrånvaro).map((f) => [
      f.exportDatum,
      personalNamn(f),
      f.personal?.arbetslag?.namn ?? '',
      f.hel_dag ? 'Heldag' : 'Del av dag',
      f.hel_dag ? '' : `${tid(f.tid_från)}-${tid(f.tid_till)}`,
    ])
  );
}

function passCsv(pass: Vikariepass[], vikarier: Vikarie[]) {
  return byggCsv(
    ['Datum', 'Tid', 'Ersätter', 'Grupp', 'Vikarie', 'Status'],
    pass.sort(sorteraPass).map((p) => [
      p.datum,
      `${tid(p.tid_från)}-${tid(p.tid_till)}`,
      passPersonal(p),
      passGrupp(p),
      passVikarie(p, vikarier),
      statusText(p.status),
    ])
  );
}

export default function Export() {
  const [datumFrån, setDatumFrån] = useState(() => startPåVecka(datumIdag()));
  const [datumTill, setDatumTill] = useState(() => slutPåVecka(datumIdag()));
  const [frånvaro, setFrånvaro] = useState<Frånvaro[]>([]);
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [exporterar, setExporterar] = useState<'franvaro' | 'pass' | null>(null);
  const [fel, setFel] = useState('');

  useEffect(() => {
    let aktiv = true;

    async function ladda() {
      setLaddar(true);
      setFel('');

      const [fRes, pRes, vRes] = await Promise.all([
        frånvaroApi.lista(datumFrån, datumTill),
        passApi.lista({ datumFrån, datumTill }),
        vikariApi.lista(),
      ]);

      if (!aktiv) return;

      if (fRes.error || pRes.error || vRes.error) {
        setFel(fRes.error?.message ?? pRes.error?.message ?? vRes.error?.message ?? 'Kunde inte hämta exportdata.');
      }

      setFrånvaro((fRes.data ?? []) as Frånvaro[]);
      setPass((pRes.data ?? []) as Vikariepass[]);
      setVikarier((vRes.data ?? []) as Vikarie[]);
      setLaddar(false);
    }

    ladda();
    return () => { aktiv = false; };
  }, [datumFrån, datumTill]);

  const aktivFrånvaro = useMemo(
    () => frånvaroFörPeriod(frånvaro, datumFrån, datumTill).sort(sorteraFrånvaro),
    [frånvaro, datumFrån, datumTill]
  );
  const aktivaPass = useMemo(
    () => pass.filter((p) => p.status !== 'avbokat').sort(sorteraPass),
    [pass]
  );
  const bokadePass = useMemo(() => aktivaPass.filter((p) => !!p.vikarie_id), [aktivaPass]);
  const saknarVikarie = aktivaPass.length - bokadePass.length;
  const exportNamn = `export_${datumFrån}_${datumTill}`;

  const dagar = useMemo(() => {
    const map = new Map<string, { frånvaro: number; pass: number }>();
    for (const dag of datumIntervall(datumFrån, datumTill)) map.set(dag, { frånvaro: 0, pass: 0 });
    for (const f of aktivFrånvaro) {
      const nu = map.get(f.exportDatum) ?? { frånvaro: 0, pass: 0 };
      map.set(f.exportDatum, { ...nu, frånvaro: nu.frånvaro + 1 });
    }
    for (const p of aktivaPass) {
      const nu = map.get(p.datum) ?? { frånvaro: 0, pass: 0 };
      map.set(p.datum, { ...nu, pass: nu.pass + 1 });
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [aktivFrånvaro, aktivaPass, datumFrån, datumTill]);

  function väljDennaVecka() {
    const start = startPåVecka(datumIdag());
    setDatumFrån(start);
    setDatumTill(slutPåVecka(start));
  }

  function väljNästaVecka() {
    const start = läggTillDagar(startPåVecka(datumIdag()), 7);
    setDatumFrån(start);
    setDatumTill(slutPåVecka(start));
  }

  function exporteraFrånvaro() {
    setExporterar('franvaro');
    setFel('');
    try {
      laddaNerFil(`${exportNamn}_franvaro.csv`, frånvaroCsv([...aktivFrånvaro]));
    } catch (error) {
      setFel(error instanceof Error ? error.message : 'Frånvaroexporten kunde inte skapas.');
    } finally {
      setExporterar(null);
    }
  }

  function exporteraPass() {
    setExporterar('pass');
    setFel('');
    try {
      laddaNerFil(`${exportNamn}_bemanning.csv`, passCsv([...aktivaPass], vikarier));
    } catch (error) {
      setFel(error instanceof Error ? error.message : 'Bemanningsexporten kunde inte skapas.');
    } finally {
      setExporterar(null);
    }
  }

  if (laddar) return <LaddaSida />;

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Mer</p>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Export</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Exportera det som behövs: frånvaro eller bemanning som CSV för Excel.
          </p>
        </div>
      </div>

      {fel && <div className="mb-4"><Alert typ="error">{fel}</Alert></div>}

      <section className="mb-4 rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-end">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Från datum" type="date" value={datumFrån} onChange={(e) => setDatumFrån(e.target.value)} />
            <Input label="Till datum" type="date" value={datumTill} onChange={(e) => setDatumTill(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="secondary" onClick={väljDennaVecka}>Denna vecka</Button>
            <Button variant="secondary" onClick={väljNästaVecka}>Nästa vecka</Button>
          </div>
        </div>
      </section>

      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Frånvaro</p>
          <p className="mt-1 text-3xl font-semibold" style={{ color: 'var(--text)' }}>{aktivFrånvaro.length}</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Bemannade pass</p>
          <p className="mt-1 text-3xl font-semibold" style={{ color: '#22c55e' }}>{bokadePass.length}</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Saknar vikarie</p>
          <p className="mt-1 text-3xl font-semibold" style={{ color: saknarVikarie > 0 ? '#f97316' : 'var(--text)' }}>{saknarVikarie}</p>
        </div>
      </section>

      <section className="mb-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Frånvaro</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Datum, personal, arbetslag och omfattning. Löst/arkiverat tas inte med.
          </p>
          <div className="mt-4">
            <Button onClick={exporteraFrånvaro} loading={exporterar === 'franvaro'}>
              Exportera frånvaro
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Bemanning</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Datum, tid, ersätter, grupp, vikarie och status. Avbokade pass tas inte med.
          </p>
          <div className="mt-4">
            <Button onClick={exporteraPass} loading={exporterar === 'pass'}>
              Exportera bemanning
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Period</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {svDatum(datumFrån)} till {svDatum(datumTill)}
          </p>
        </div>

        {dagar.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Ingen frånvaro eller bemanning hittades för perioden.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {dagar.map(([datum, dag]) => (
              <div key={datum} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{svDatum(datum)}</p>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full px-2.5 py-1" style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}>
                    {dag.frånvaro} frånvaro
                  </span>
                  <span className="rounded-full px-2.5 py-1" style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}>
                    {dag.pass} pass
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}