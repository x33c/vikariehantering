import { useEffect, useMemo, useState } from 'react';
import { historikApi, passApi } from '../../lib/api';
import type { PassStatus, Vikariepass } from '../../types';
import { Button, LaddaSida, StatusBadge } from '../../components/ui';

type ProblemTyp = 'overlapp' | 'helg' | 'utan_franvaro' | 'orimlig_tid';

interface ProblemPass {
  pass: Vikariepass;
  typer: Set<ProblemTyp>;
  detaljer: string[];
}

const PROBLEM_LABEL: Record<ProblemTyp, string> = {
  overlapp: 'Överlapp',
  helg: 'Helg',
  utan_franvaro: 'Utan frånvaro',
  orimlig_tid: 'Orimlig tid',
};

function minuter(tid?: string | null) {
  const [h, m] = (tid?.slice(0, 5) ?? '00:00').split(':').map(Number);
  return h * 60 + m;
}

function ärHelg(datum: string) {
  const dag = new Date(`${datum}T12:00:00`).getDay();
  return dag === 0 || dag === 6;
}

function svenskDatum(datum: string) {
  return new Date(`${datum}T12:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function läggTillProblem(map: Map<string, ProblemPass>, pass: Vikariepass, typ: ProblemTyp, detalj: string) {
  const rad = map.get(pass.id) ?? { pass, typer: new Set<ProblemTyp>(), detaljer: [] };
  rad.typer.add(typ);
  if (!rad.detaljer.includes(detalj)) rad.detaljer.push(detalj);
  map.set(pass.id, rad);
}

function analyseraPass(pass: Vikariepass[]) {
  const problem = new Map<string, ProblemPass>();
  const aktiva = pass.filter((p) => p.status !== 'avbokat');

  for (const rad of aktiva) {
    const start = minuter(rad.tid_från);
    const slut = minuter(rad.tid_till);
    const längd = slut - start;

    if (ärHelg(rad.datum)) läggTillProblem(problem, rad, 'helg', 'Passet ligger på en helg.');
    if (!rad.frånvaro_id) läggTillProblem(problem, rad, 'utan_franvaro', 'Passet saknar kopplad frånvaro.');
    if (längd <= 0 || längd > 510 || start < 360 || slut > 1080) {
      läggTillProblem(problem, rad, 'orimlig_tid', `Tiden ${rad.tid_från.slice(0, 5)}-${rad.tid_till.slice(0, 5)} behöver kontrolleras.`);
    }
  }

  const perPersonDag = new Map<string, Vikariepass[]>();
  for (const rad of aktiva) {
    if (!rad.personal_id) continue;
    const key = `${rad.personal_id}:${rad.datum}`;
    perPersonDag.set(key, [...(perPersonDag.get(key) ?? []), rad]);
  }

  for (const rader of perPersonDag.values()) {
    const sorterade = [...rader].sort((a, b) => minuter(a.tid_från) - minuter(b.tid_från));
    for (let i = 0; i < sorterade.length; i += 1) {
      for (let j = i + 1; j < sorterade.length; j += 1) {
        const a = sorterade[i];
        const b = sorterade[j];
        if (minuter(a.tid_från) < minuter(b.tid_till) && minuter(a.tid_till) > minuter(b.tid_från)) {
          const detalj = `Överlappar med ${b.tid_från.slice(0, 5)}-${b.tid_till.slice(0, 5)}.`;
          läggTillProblem(problem, a, 'overlapp', detalj);
          läggTillProblem(problem, b, 'overlapp', `Överlappar med ${a.tid_från.slice(0, 5)}-${a.tid_till.slice(0, 5)}.`);
        }
      }
    }
  }

  return [...problem.values()].sort((a, b) =>
    a.pass.datum.localeCompare(b.pass.datum) ||
    a.pass.tid_från.localeCompare(b.pass.tid_från) ||
    (a.pass.personal?.namn ?? '').localeCompare(b.pass.personal?.namn ?? '')
  );
}

export default function Datastadning() {
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [markerade, setMarkerade] = useState<Set<string>>(new Set());
  const [aktivTyp, setAktivTyp] = useState<ProblemTyp | 'alla'>('alla');
  const [arkiverar, setArkiverar] = useState(false);
  const [meddelande, setMeddelande] = useState('');
  const [fel, setFel] = useState('');

  async function ladda() {
    setLaddar(true);
    setFel('');
    const res = await passApi.lista();
    if (res.error) setFel(res.error.message);
    setPass((res.data ?? []) as Vikariepass[]);
    setLaddar(false);
  }

  useEffect(() => { ladda(); }, []);

  const problem = useMemo(() => analyseraPass(pass), [pass]);
  const filtrerade = aktivTyp === 'alla' ? problem : problem.filter((rad) => rad.typer.has(aktivTyp));
  const counts = useMemo(() => {
    const next: Record<ProblemTyp | 'alla', number> = { alla: problem.length, overlapp: 0, helg: 0, utan_franvaro: 0, orimlig_tid: 0 };
    for (const rad of problem) {
      for (const typ of rad.typer) next[typ] += 1;
    }
    return next;
  }, [problem]);

  function toggle(id: string, aktiv?: boolean) {
    setMarkerade((prev) => {
      const next = new Set(prev);
      const skaMarkera = aktiv ?? !next.has(id);
      if (skaMarkera) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function arkiveraMarkerade() {
    setArkiverar(true);
    setFel('');
    setMeddelande('');

    const ids = [...markerade];
    for (const id of ids) {
      const res = await passApi.radera(id);
      if (res.error) {
        setFel(res.error.message);
        setArkiverar(false);
        return;
      }
      await historikApi.skapa(id, 'pass_avbokat', { åtgärd: 'datastadning' }, 'Pass arkiverat via datastädning.');
    }

    setPass((prev) => prev.map((p) => ids.includes(p.id) ? { ...p, status: 'avbokat' as PassStatus } : p));
    setMarkerade(new Set());
    setMeddelande(`${ids.length} pass arkiverades. Data finns kvar i historik och export.`);
    setArkiverar(false);
  }

  if (laddar) return <LaddaSida />;

  return (
    <div className="p-3 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Underhåll</p>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Datastädning</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Hitta gamla felpass och arkivera dem utan att radera historik.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={ladda}>Uppdatera</Button>
          <Button variant="danger" onClick={arkiveraMarkerade} loading={arkiverar} disabled={markerade.size === 0}>
            Arkivera markerade ({markerade.size})
          </Button>
        </div>
      </div>

      {fel && <div className="mb-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#ef4444', color: '#fca5a5', background: 'rgba(239,68,68,0.10)' }}>{fel}</div>}
      {meddelande && <div className="mb-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#22c55e', color: '#86efac', background: 'rgba(34,197,94,0.10)' }}>{meddelande}</div>}

      <div className="mb-4 flex flex-wrap gap-2">
        {(['alla', 'overlapp', 'helg', 'utan_franvaro', 'orimlig_tid'] as const).map((typ) => {
          const aktiv = aktivTyp === typ;
          const label = typ === 'alla' ? 'Alla problem' : PROBLEM_LABEL[typ];
          return (
            <button
              key={typ}
              type="button"
              onClick={() => setAktivTyp(typ)}
              className="rounded-full border px-3 py-2 text-sm font-semibold"
              style={{
                borderColor: aktiv ? 'var(--accent)' : 'var(--border)',
                background: aktiv ? 'var(--accent)' : 'var(--bg-card)',
                color: aktiv ? '#061512' : 'var(--text)',
              }}
            >
              {label} <span className="ml-1 opacity-75">{counts[typ]}</span>
            </button>
          );
        })}
      </div>

      <section className="rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Problem hittade</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{filtrerade.length} pass visas</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setMarkerade(new Set(filtrerade.map((rad) => rad.pass.id)))}>
            Markera alla
          </Button>
        </div>

        {filtrerade.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Inga pass matchar filtret.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {filtrerade.map(({ pass: rad, typer, detaljer }) => (
              <article key={rad.id} className="grid gap-3 px-4 py-3 md:grid-cols-[auto_1fr_auto] md:items-center">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={markerade.has(rad.id)}
                    onChange={(e) => toggle(rad.id, e.target.checked)}
                    className="h-5 w-5 accent-teal-400"
                  />
                  <span className="sr-only">Markera pass</span>
                </label>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold" style={{ color: 'var(--text)' }}>
                      {rad.personal?.namn ?? 'Fristående pass'}
                    </p>
                    <StatusBadge status={rad.status} />
                    {[...typer].map((typ) => (
                      <span key={typ} className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color: '#fb923c', background: 'rgba(249,115,22,0.14)' }}>
                        {PROBLEM_LABEL[typ]}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                    {svenskDatum(rad.datum)} · {rad.tid_från.slice(0, 5)}-{rad.tid_till.slice(0, 5)} · {rad.grupp ?? 'Ingen grupp'}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-subtle)' }}>
                    {detaljer.join(' ')}
                  </p>
                </div>

                <Button size="sm" variant="secondary" onClick={() => toggle(rad.id)}>
                  {markerade.has(rad.id) ? 'Avmarkera' : 'Markera'}
                </Button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
