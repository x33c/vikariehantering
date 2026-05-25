import { useEffect, useMemo, useState } from 'react';
import { frånvaroApi, passApi, vikariApi } from '../../lib/api';
import type { Frånvaro, PassStatus, Vikarie, Vikariepass } from '../../types';
import { PASS_STATUS_LABELS } from '../../types';
import { Alert, Button, Input, LaddaSida } from '../../components/ui';

type ExportTyp = 'franvaro' | 'pass';
type ExportFormat = 'csv' | 'json';

const EXPORT_TYPER: { id: ExportTyp; titel: string; text: string }[] = [
  { id: 'franvaro', titel: 'Frånvaro', text: 'Personal, datum, typ, orsak och anteckningar.' },
  { id: 'pass', titel: 'Vikariepass', text: 'Datum, tider, grupp, status och tillsatt vikarie.' },
];

function datumIdag() {
  return new Date().toISOString().slice(0, 10);
}

function läggTillDagar(datum: string, dagar: number) {
  const d = new Date(`${datum}T12:00:00`);
  d.setDate(d.getDate() + dagar);
  return d.toISOString().slice(0, 10);
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

function laddaNerFil(namn: string, innehåll: string, mime: string) {
  const blob = new Blob([innehåll], { type: `${mime};charset=utf-8` });
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

function personalNamn(frånvaro: Frånvaro) {
  return frånvaro.personal?.namn ?? 'Okänd personal';
}

function passPersonal(pass: Vikariepass) {
  return pass.personal?.namn ?? 'Fristående pass';
}

function passVikarie(pass: Vikariepass, vikarier: Vikarie[]) {
  if (!pass.vikarie_id) return '';
  return vikarier.find((v) => v.id === pass.vikarie_id)?.namn ?? pass.vikarie_id;
}

function frånvaroCsv(frånvaro: Frånvaro[]) {
  return byggCsv(
    ['Personal', 'Arbetslag', 'Från', 'Till', 'Typ', 'Tid', 'Orsak', 'Anteckning'],
    frånvaro.map((f) => [
      personalNamn(f),
      f.personal?.arbetslag?.namn ?? '',
      f.datum_från,
      f.datum_till,
      f.hel_dag ? 'Heldag' : 'Del av dag',
      f.hel_dag ? 'Heldag' : `${tid(f.tid_från)}-${tid(f.tid_till)}`,
      f.orsak ?? '',
      f.anteckning ?? '',
    ])
  );
}

function passCsv(pass: Vikariepass[], vikarier: Vikarie[]) {
  return byggCsv(
    ['Datum', 'Tid', 'Ersätter', 'Grupp', 'Ämne', 'Vikarie', 'Status', 'Publicerad', 'Anteckning'],
    pass.map((p) => [
      p.datum,
      `${tid(p.tid_från)}-${tid(p.tid_till)}`,
      passPersonal(p),
      p.grupp ?? p.personal?.arbetslag?.namn ?? '',
      p.ämne ?? '',
      passVikarie(p, vikarier),
      statusText(p.status),
      p.publicerad ? 'Ja' : 'Nej',
      p.anteckning ?? '',
    ])
  );
}

export default function Export() {
  const [datumFrån, setDatumFrån] = useState(() => datumIdag());
  const [datumTill, setDatumTill] = useState(() => läggTillDagar(datumIdag(), 14));
  const [valdaTyper, setValdaTyper] = useState<Set<ExportTyp>>(() => new Set(['franvaro', 'pass']));
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [frånvaro, setFrånvaro] = useState<Frånvaro[]>([]);
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [exporterar, setExporterar] = useState(false);
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

  const grupperat = useMemo(() => {
    const dagar = new Map<string, { frånvaro: Frånvaro[]; pass: Vikariepass[] }>();

    function säkerDag(datum: string) {
      if (!dagar.has(datum)) dagar.set(datum, { frånvaro: [], pass: [] });
      return dagar.get(datum)!;
    }

    frånvaro.forEach((f) => {
      säkerDag(f.datum_från).frånvaro.push(f);
    });

    pass.forEach((p) => {
      säkerDag(p.datum).pass.push(p);
    });

    return [...dagar.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [frånvaro, pass]);

  const exportNamn = `export_${datumFrån}_${datumTill}`;
  const ingaVal = valdaTyper.size === 0;

  function växlaTyp(typ: ExportTyp) {
    setValdaTyper((prev) => {
      const nästa = new Set(prev);
      if (nästa.has(typ)) nästa.delete(typ);
      else nästa.add(typ);
      return nästa;
    });
  }

  async function exportera() {
    if (ingaVal) {
      setFel('Välj minst en exporttyp.');
      return;
    }

    setExporterar(true);
    setFel('');

    try {
      if (format === 'json') {
        const data = {
          datum_från: datumFrån,
          datum_till: datumTill,
          frånvaro: valdaTyper.has('franvaro') ? frånvaro : undefined,
          vikariepass: valdaTyper.has('pass') ? pass : undefined,
        };
        laddaNerFil(`${exportNamn}.json`, JSON.stringify(data, null, 2), 'application/json');
      } else {
        if (valdaTyper.has('franvaro')) {
          laddaNerFil(`${exportNamn}_franvaro.csv`, frånvaroCsv(frånvaro), 'text/csv');
        }
        if (valdaTyper.has('pass')) {
          laddaNerFil(`${exportNamn}_vikariepass.csv`, passCsv(pass, vikarier), 'text/csv');
        }
      }
    } catch (error) {
      setFel(error instanceof Error ? error.message : 'Exporten kunde inte skapas.');
    } finally {
      setExporterar(false);
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
            Hämta ut frånvaro och vikariepass som organiserade filer för arkiv, uppföljning eller vidare bearbetning.
          </p>
        </div>
        <Button onClick={exportera} loading={exporterar} disabled={ingaVal}>
          Exportera
        </Button>
      </div>

      {fel && <div className="mb-4"><Alert typ="error">{fel}</Alert></div>}

      <section className="mb-4 rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Från datum" type="date" value={datumFrån} onChange={(e) => setDatumFrån(e.target.value)} />
            <Input label="Till datum" type="date" value={datumTill} onChange={(e) => setDatumTill(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--text)' }}>Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            >
              <option value="csv">CSV för Excel</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <Button variant="secondary" onClick={() => { setDatumFrån(datumIdag()); setDatumTill(läggTillDagar(datumIdag(), 14)); }}>
            Återställ datum
          </Button>
        </div>
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-2">
        {EXPORT_TYPER.map((typ) => {
          const aktiv = valdaTyper.has(typ.id);
          const antal = typ.id === 'franvaro' ? frånvaro.length : pass.length;

          return (
            <button
              key={typ.id}
              type="button"
              onClick={() => växlaTyp(typ.id)}
              className="rounded-2xl border p-4 text-left transition"
              style={{
                borderColor: aktiv ? 'var(--blue)' : 'var(--border)',
                background: aktiv ? 'color-mix(in srgb, var(--blue) 9%, var(--bg-card))' : 'var(--bg-card)',
                color: 'var(--text)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{typ.titel}</p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{typ.text}</p>
                </div>
                <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'var(--hover)', color: aktiv ? 'var(--blue)' : 'var(--text-muted)' }}>
                  {antal}
                </span>
              </div>
            </button>
          );
        })}
      </section>

      <section className="rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Förhandsvisning</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {svDatum(datumFrån)} till {svDatum(datumTill)}
          </p>
        </div>

        {grupperat.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Ingen frånvaro eller bemanning hittades för perioden.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {grupperat.map(([datum, dag]) => (
              <div key={datum} className="grid gap-3 px-4 py-4 xl:grid-cols-[180px_1fr_1fr]">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{svDatum(datum)}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {dag.frånvaro.length} frånvaro · {dag.pass.length} pass
                  </p>
                </div>

                <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Frånvaro</p>
                  {dag.frånvaro.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-subtle)' }}>Ingen frånvaro.</p>
                  ) : (
                    <div className="space-y-2">
                      {dag.frånvaro.slice(0, 6).map((f) => (
                        <div key={f.id} className="text-sm">
                          <p className="font-semibold" style={{ color: 'var(--text)' }}>{personalNamn(f)}</p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {f.hel_dag ? 'Heldag' : `${tid(f.tid_från)}-${tid(f.tid_till)}`} {f.orsak ? `· ${f.orsak}` : ''}
                          </p>
                        </div>
                      ))}
                      {dag.frånvaro.length > 6 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>+ {dag.frånvaro.length - 6} fler</p>}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Vikariepass</p>
                  {dag.pass.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-subtle)' }}>Inga pass.</p>
                  ) : (
                    <div className="space-y-2">
                      {dag.pass.slice(0, 6).map((p) => (
                        <div key={p.id} className="text-sm">
                          <p className="font-semibold" style={{ color: 'var(--text)' }}>
                            {passVikarie(p, vikarier) || 'Ingen vikarie'}
                            <span className="font-normal" style={{ color: 'var(--text-muted)' }}> · {passPersonal(p)}</span>
                          </p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {tid(p.tid_från)}-{tid(p.tid_till)} · {p.grupp ?? 'Ingen grupp'} · {statusText(p.status)}
                          </p>
                        </div>
                      ))}
                      {dag.pass.length > 6 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>+ {dag.pass.length - 6} fler</p>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
