import { useEffect, useState } from 'react';
import { passApi, vikariApi, historikApi } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import type { Vikariepass, Vikarie } from '../../types';

interface Passgrupp {
  personal_id: string;
  personalNamn: string;
  arbetslagNamn?: string;
  datum: string;
  pass: Vikariepass[];
}

function grupperaPasser(pass: Vikariepass[]): Passgrupp[] {
  const grupper = new Map<string, Passgrupp>();

  for (const p of pass) {
    const nyckel = `${p.personal_id ?? 'okänd'}_${p.datum}`;
    if (!grupper.has(nyckel)) {
      grupper.set(nyckel, {
        personal_id: p.personal_id ?? 'okänd',
        personalNamn: p.personal?.namn ?? 'Okänd personal',
        arbetslagNamn: p.personal?.arbetslag?.namn,
        datum: p.datum,
        pass: [],
      });
    }
    grupper.get(nyckel)!.pass.push(p);
  }

  return [...grupper.values()].sort((a, b) => {
    if (a.datum !== b.datum) return a.datum.localeCompare(b.datum);
    return a.personalNamn.localeCompare(b.personalNamn);
  });
}

export default function LedigaPass() {
  const { användare } = useAuth();
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [minVikarie, setMinVikarie] = useState<Vikarie | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [valdGrupp, setValdGrupp] = useState<Passgrupp | null>(null);
  const [bokar, setBokar] = useState(false);
  const [fel, setFel] = useState('');
  const [bekräftelse, setBekräftelse] = useState('');

  useEffect(() => {
    async function ladda() {
      if (!användare) return;
      const vRes = await vikariApi.hämtaViaProfilId(användare.id);
      setMinVikarie(vRes.data as Vikarie | null);
      const pRes = await passApi.lista({ status: ['obokat', 'notifierat'] });
      setPass((pRes.data ?? []) as Vikariepass[]);
      setLaddar(false);
    }
    ladda();
  }, [användare]);

  async function bokaGrupp(grupp: Passgrupp) {
    if (!minVikarie) return;
    setBokar(true);
    setFel('');

    let lyckades = 0;
    for (const p of grupp.pass) {
      const { data, error } = await passApi.bokaPass(p.id, minVikarie.id);
      if (!error && data) {
        await historikApi.skapa(p.id, 'vikarie_bokat', { vikarie_id: minVikarie.id });
        lyckades++;
      }
    }

    setBokar(false);

    if (lyckades === 0) {
      setFel('Passen kunde inte bokas – de kan redan ha tagits av någon annan.');
      return;
    }

    setPass(prev => prev.filter(p => !(p.personal_id === grupp.personal_id && p.datum === grupp.datum)));
    setValdGrupp(null);
    setBekräftelse(`Bokat: ${grupp.personalNamn} ${grupp.datum} (${lyckades} pass)`);
    setTimeout(() => setBekräftelse(''), 5000);
  }

  if (laddar) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--blue)', borderTopColor: 'transparent' }} />
    </div>
  );

  const grupper = grupperaPasser(pass);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Lediga pass</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Pass tillgängliga för bokning.</p>
      </div>

      {bekräftelse && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800">
          {bekräftelse}
        </div>
      )}
      {fel && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800">
          {fel}
        </div>
      )}
      {!minVikarie && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800">
          Ditt vikarieprofil är inte konfigurerad. Kontakta administratören.
        </div>
      )}

      {grupper.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-16" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Inga lediga pass för tillfället.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grupper.map(grupp => {
            const tidFrån = grupp.pass[0].tid_från.slice(0, 5);
            const tidTill = grupp.pass[grupp.pass.length - 1].tid_till.slice(0, 5);
            const ämnen = [...new Set(grupp.pass.map(p => p.ämne).filter(Boolean))];

            return (
              <div key={`${grupp.personal_id}_${grupp.datum}`}
                className="rounded-xl border p-4 shadow-sm"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      {new Date(grupp.datum).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {tidFrån}–{tidTill}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    {grupp.pass.length} pass
                  </span>
                </div>

                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  Ersätter: <span className="font-medium" style={{ color: 'var(--text)' }}>{grupp.personalNamn}</span>
                  {grupp.arbetslagNamn && <> · {grupp.arbetslagNamn}</>}
                </p>
                {ämnen.length > 0 && (
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    {ämnen.join(', ')}
                  </p>
                )}

                <button
                  disabled={!minVikarie}
                  onClick={() => { setFel(''); setValdGrupp(grupp); }}
                  className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--blue)' }}
                >
                  Boka passet
                </button>
              </div>
            );
          })}
        </div>
      )}

      {valdGrupp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setValdGrupp(null)} />
          <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl p-6 shadow-xl" style={{ background: 'var(--bg-card)' }}>
            <h2 className="mb-4 text-base font-semibold" style={{ color: 'var(--text)' }}>Bekräfta bokning</h2>
            <div className="mb-4 rounded-lg p-3 text-sm space-y-1" style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>
              <p><span>Datum:</span> <strong style={{ color: 'var(--text)' }}>{valdGrupp.datum}</strong></p>
              <p><span>Ersätter:</span> <strong style={{ color: 'var(--text)' }}>{valdGrupp.personalNamn}</strong></p>
              <p><span>Antal pass:</span> <strong style={{ color: 'var(--text)' }}>{valdGrupp.pass.length}</strong></p>
              <div className="mt-2 space-y-1">
                {valdGrupp.pass.map(p => (
                  <p key={p.id} className="text-xs">
                    {p.tid_från.slice(0, 5)}–{p.tid_till.slice(0, 5)}
                    {p.ämne && <> · {p.ämne}</>}
                    {p.grupp && <> · {p.grupp}</>}
                  </p>
                ))}
              </div>
            </div>
            {fel && (
              <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{fel}</p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button onClick={() => setValdGrupp(null)}
                className="w-full sm:w-auto rounded-lg border px-4 py-2.5 text-sm font-medium"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                Avbryt
              </button>
              <button onClick={() => bokaGrupp(valdGrupp)} disabled={bokar}
                className="w-full sm:w-auto rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--blue)' }}>
                {bokar ? 'Bokar…' : 'Bekräfta bokning'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}