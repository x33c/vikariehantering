import { useEffect, useMemo, useState } from 'react';
import { frånvaroApi, passApi } from '../../lib/api';
import type { Frånvaro, Vikariepass } from '../../types';
import { Button, LaddaSida } from '../../components/ui';

function iso(datum: Date) {
  return datum.toISOString().slice(0, 10);
}

function startPåVecka(datum: Date) {
  const d = new Date(datum);
  const veckodag = d.getDay() || 7;
  d.setDate(d.getDate() - veckodag + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

function läggTillDagar(datum: Date, dagar: number) {
  const d = new Date(datum);
  d.setDate(d.getDate() + dagar);
  return d;
}

function veckaNummer(datum: Date) {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const årStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - årStart.getTime()) / 86400000) + 1) / 7);
}

function kortDatum(datum: Date) {
  return datum.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

function långDatum(datum: Date) {
  return datum.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function tid(t?: string | null) {
  return t?.slice(0, 5) ?? '';
}

function ärSammaDag(a: string, b: string) {
  return a === b;
}

function frånvaroFörDag(frånvaro: Frånvaro[], dag: string) {
  return frånvaro.filter((f) => f.datum_från <= dag && f.datum_till >= dag);
}

function passFörDag(pass: Vikariepass[], dag: string) {
  return pass.filter((p) => p.datum === dag && p.status !== 'avbokat');
}

function vikarieText(pass: Vikariepass) {
  const vikarie = pass.vikarie?.namn ?? (pass.status === 'obokat' ? 'Ej tillsatt' : 'Vikarie saknas');
  const grupp = pass.grupp ? ` - ${pass.grupp}` : '';
  const ämne = pass.ämne ? ` (${pass.ämne})` : '';
  return `${vikarie}${grupp}${ämne}\n(${tid(pass.tid_från)}-${tid(pass.tid_till)})`;
}

function frånvaroText(f: Frånvaro) {
  const tidText = f.hel_dag ? '' : ` (${tid(f.tid_från)}-${tid(f.tid_till)})`;
  return `${f.personal?.namn ?? 'Okänd'}${tidText}`;
}

export default function Utskick() {
  const [veckaStart, setVeckaStart] = useState(() => iso(startPåVecka(new Date())));
  const [frånvaro, setFrånvaro] = useState<Frånvaro[]>([]);
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [kopierat, setKopierat] = useState(false);

  const start = useMemo(() => startPåVecka(new Date(veckaStart)), [veckaStart]);
  const dagar = useMemo(() => [0, 1, 2, 3, 4].map((i) => läggTillDagar(start, i)), [start]);
  const slut = iso(dagar[4]);

  useEffect(() => {
    async function ladda() {
      setLaddar(true);
      const [fRes, pRes] = await Promise.all([
        frånvaroApi.lista(iso(start), slut),
        passApi.lista({ datumFrån: iso(start), datumTill: slut }),
      ]);
      setFrånvaro((fRes.data ?? []) as Frånvaro[]);
      setPass((pRes.data ?? []) as Vikariepass[]);
      setLaddar(false);
    }
    ladda();
  }, [veckaStart]);

  const rubrikDatum = långDatum(new Date());
  const textUtskick = `God morgon,

här är frånvaron för ${rubrikDatum}.

Vi påminner om rutinen att medarbetares frånvaroanmälan vid VAB och sjukdom görs till Nima (+ närmsta chef) via sms till nummer: 070-087 63 05 före kl. 07.00. Du återkommer till mig senast kl. 14.00 dagen innan du beräknar vara i tjänst eller fortsatt sjuk.`;

  async function kopieraMejl() {
    const text = [
      textUtskick,
      '',
      ...dagar.map((dag) => {
        const nyckel = iso(dag);
        const frånvaroRader = frånvaroFörDag(frånvaro, nyckel).map(frånvaroText).join(', ') || '-';
        const vikarieRader = passFörDag(pass, nyckel).map(vikarieText).join('; ') || '-';
        return `${dag.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'numeric' })}\nFrånvaro: ${frånvaroRader}\nVikarie: ${vikarieRader}`;
      }),
      '',
      'Länkar:',
      'Anmälan - kränkning',
      'Rutin vid kränkning',
      'Schemavisare',
      'Anmälan EHT',
      'Ramtider - Fritids',
      'Felanmälan',
      'Schema - Ursviks IP',
    ].join('\n');

    await navigator.clipboard.writeText(text);
    setKopierat(true);
    setTimeout(() => setKopierat(false), 2000);
  }

  if (laddar) return <LaddaSida />;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>
            Kommunikation
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
            Utskick
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Veckosammanställning av frånvaro och vikariepass som mejlutkast.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={veckaStart}
            onChange={(e) => setVeckaStart(iso(startPåVecka(new Date(e.target.value))))}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <Button onClick={kopieraMejl}>{kopierat ? 'Kopierat' : 'Kopiera mejl'}</Button>
        </div>
      </div>

      <div className="mb-6 rounded-lg border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="whitespace-pre-line text-sm leading-6" style={{ color: 'var(--text)' }}>
          {textUtskick}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border" style={{ background: '#30302f', borderColor: '#5a5a56' }}>
        <table className="min-w-[960px] w-full border-collapse text-sm text-white">
          <thead>
            <tr>
              <th className="w-24 border px-3 py-3 text-left" style={{ borderColor: '#5a5a56' }}>Vecka</th>
              {dagar.map((dag) => (
                <th key={iso(dag)} className="border px-3 py-3 text-center" style={{ borderColor: '#5a5a56' }}>
                  {dag.toLocaleDateString('sv-SE', { weekday: 'long' })}
                </th>
              ))}
            </tr>
            <tr>
              <th className="border px-3 py-3 text-center" style={{ borderColor: '#5a5a56' }}>{veckaNummer(start)}</th>
              {dagar.map((dag) => (
                <th key={iso(dag)} className="border px-3 py-3 text-center" style={{ borderColor: '#5a5a56' }}>
                  {kortDatum(dag)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="border px-3 py-4 text-left align-middle" style={{ borderColor: '#5a5a56' }}>Frånvaro</th>
              {dagar.map((dag) => {
                const rader = frånvaroFörDag(frånvaro, iso(dag));
                return (
                  <td key={iso(dag)} className="h-36 border px-3 py-4 text-center align-middle" style={{ borderColor: '#5a5a56' }}>
                    {rader.length === 0 ? (
                      <span className="text-white/35">-</span>
                    ) : (
                      <div className="space-y-1">
                        {rader.map((f) => <div key={f.id}>{frånvaroText(f)}</div>)}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
            <tr>
              <th className="border px-3 py-4 text-left align-middle" style={{ borderColor: '#5a5a56' }}>Vikarie</th>
              {dagar.map((dag) => {
                const rader = passFörDag(pass, iso(dag));
                return (
                  <td key={iso(dag)} className="h-48 border px-3 py-4 text-center align-middle" style={{ borderColor: '#5a5a56' }}>
                    {rader.length === 0 ? (
                      <span className="text-white/35">-</span>
                    ) : (
                      <div className="space-y-3">
                        {rader.map((p) => (
                          <div key={p.id}>
                            <div className="font-semibold">{p.vikarie?.namn ?? (p.status === 'obokat' ? 'Ej tillsatt' : 'Vikarie saknas')}</div>
                            <div>{p.grupp}{p.ämne ? ` · ${p.ämne}` : ''}</div>
                            <div className="text-xs text-white/80">({tid(p.tid_från)}-{tid(p.tid_till)})</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
            <tr>
              <th className="border px-3 py-4 text-left align-middle" style={{ borderColor: '#5a5a56' }}>Övrigt</th>
              {dagar.map((dag) => (
                <td key={iso(dag)} className="h-28 border px-3 py-4 text-center align-middle text-white/45" style={{ borderColor: '#5a5a56' }}>
                  -
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-lg border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>Länkar</p>
        <div className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3" style={{ color: 'var(--accent)' }}>
          {['Anmälan - kränkning', 'Rutin vid kränkning', 'Schemavisare', 'Anmälan EHT', 'Ramtider - Fritids', 'Felanmälan', 'Schema - Ursviks IP'].map((länk) => (
            <span key={länk} className="underline">{länk}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
