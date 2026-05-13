import { useEffect, useState } from 'react';
import { passApi, vikariApi, historikApi, notisApi } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import type { Vikariepass, Vikarie } from '../../types';
import { visaArskurs, visaKortNamn } from '../../lib/display';

interface Passgrupp {
  personal_id: string;
  personalNamn: string;
  arbetslagNamn?: string;
  datum: string;
  riktad: boolean;
  pass: Vikariepass[];
}


function bokningsFelText(message?: string) {
  const text = message ?? '';
  if (
    text.includes('överlappar') ||
    text.includes('redan bokad') ||
    text.includes('dubbelbokad')
  ) {
    return 'Du är redan bokad på ett pass som överlappar denna tid.';
  }

  return 'Passet kunde inte bokas. Det kan redan ha ändrats.';
}

function grupperaPasser(pass: Vikariepass[], minVikarieId?: string): Passgrupp[] {
  const grupper = new Map<string, Passgrupp>();

  for (const p of pass) {
    const riktad = !!minVikarieId && p.riktad_till_vikarie_id === minVikarieId;
    const nyckel = `${p.personal_id ?? 'okänd'}_${p.datum}_${riktad ? 'riktad' : 'ledig'}`;

    if (!grupper.has(nyckel)) {
      grupper.set(nyckel, {
        personal_id: p.personal_id ?? 'okänd',
        personalNamn: visaKortNamn(p.personal?.namn),
        arbetslagNamn: p.personal?.arbetslag?.namn,
        datum: p.datum,
        riktad,
        pass: [],
      });
    }

    grupper.get(nyckel)!.pass.push(p);
  }

  return [...grupper.values()].sort((a, b) =>
    a.datum !== b.datum ? a.datum.localeCompare(b.datum) : a.personalNamn.localeCompare(b.personalNamn)
  );
}

function PassKort({
  grupp,
  knappText,
  onKlick,
}: {
  grupp: Passgrupp;
  knappText: string;
  onKlick: () => void;
}) {
  const tidFrån = grupp.pass[0].tid_från.slice(0, 5);
  const tidTill = grupp.pass[grupp.pass.length - 1].tid_till.slice(0, 5);
  const arskurs = visaArskurs(grupp.pass.map(p => p.grupp));

  return (
    <div
      className="rounded-xl border p-3 shadow-sm sm:p-4"
      style={{ background: 'var(--bg-card)', borderColor: grupp.riktad ? 'var(--blue)' : 'var(--border)' }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {new Date(grupp.datum).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{tidFrån}-{tidTill}</p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{
            background: grupp.riktad ? 'color-mix(in srgb, var(--blue) 18%, transparent)' : 'var(--hover)',
            color: grupp.riktad ? 'var(--blue)' : 'var(--text-muted)',
          }}
        >
          {grupp.riktad ? 'Förfrågan' : 'Ledigt'}
        </span>
      </div>

      <div className="mb-3 grid gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        <p>Vikarierar för: <span className="font-medium" style={{ color: 'var(--text)' }}>{grupp.personalNamn}</span></p>
        <p>Årskurs: <span className="font-medium" style={{ color: 'var(--text)' }}>{arskurs}</span></p>
        <p>Tid: <span className="font-medium" style={{ color: 'var(--text)' }}>{tidFrån}-{tidTill}</span></p>
      </div>
      <button
        onClick={onKlick}
        className="mt-3 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        style={{ background: 'var(--blue)' }}
      >
        {knappText}
      </button>
    </div>
  );
}

export default function LedigaPass() {
  const { användare } = useAuth();
  const [förfrågningar, setFörfrågningar] = useState<Vikariepass[]>([]);
  const [ledigaPass, setLedigaPass] = useState<Vikariepass[]>([]);
  const [minVikarie, setMinVikarie] = useState<Vikarie | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [valdGrupp, setValdGrupp] = useState<Passgrupp | null>(null);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState('');
  const [bekräftelse, setBekräftelse] = useState('');

  useEffect(() => { ladda(); }, [användare]);

  async function ladda() {
    if (!användare) return;

    const vRes = await vikariApi.hämtaViaProfilId(användare.id);
    const vikarie = vRes.data as Vikarie | null;
    setMinVikarie(vikarie);

    if (!vikarie) {
      setLaddar(false);
      return;
    }

    const pRes = await passApi.lista({ status: ['obokat', 'notifierat'] });
    const alla = (pRes.data ?? []) as Vikariepass[];

    setFörfrågningar(
      alla.filter((p) => p.status === 'notifierat' && p.riktad_till_vikarie_id === vikarie.id)
    );

    setLedigaPass(
      alla.filter((p) => p.status === 'obokat' && p.publicerad && !p.riktad_till_vikarie_id)
    );

    setLaddar(false);
  }

  async function tackaJa(grupp: Passgrupp) {
    if (!minVikarie || sparar) return;

    setSparar(true);
    setFel('');

    let lyckades = 0;
    let senasteFel: unknown = null;

    try {
      for (const p of grupp.pass) {
        const { data, error } = grupp.riktad
          ? await passApi.tackaJa(p.id, minVikarie.id)
          : await passApi.bokaPass(p.id, minVikarie.id);

        if (error) {
          senasteFel = error;
          continue;
        }

        if (data) {
          await historikApi.skapa(p.id, 'vikarie_bokat', {
            vikarie_id: minVikarie.id,
            svar: grupp.riktad ? 'ja' : 'bokad',
          });
          if (grupp.riktad) await notisApi.skapaAdminSvar(p.id, minVikarie.id, 'ja');
          lyckades++;
        }
      }

      if (lyckades === 0) {
        setFel(bokningsFelText(senasteFel));
        return;
      }

      await ladda();
      setValdGrupp(null);
      setBekräftelse(`Du tackade ja: ${grupp.personalNamn} ${grupp.datum}`);
      setTimeout(() => setBekräftelse(''), 5000);
    } catch (error) {
      setFel(bokningsFelText(error));
    } finally {
      setSparar(false);
    }
  }


  async function tackaNej(grupp: Passgrupp) {
    if (!minVikarie) return;
    setSparar(true);
    setFel('');

    for (const p of grupp.pass) {
      await passApi.tackaNej(p.id, minVikarie.id);
      await historikApi.skapa(p.id, 'vikarie_borttagen', { vikarie_id: minVikarie.id, svar: 'nej' });
      await notisApi.skapaAdminSvar(p.id, minVikarie.id, 'nej');
    }

    setSparar(false);
    await ladda();
    setValdGrupp(null);
    setBekräftelse(`Du tackade nej: ${grupp.personalNamn} ${grupp.datum}`);
    setTimeout(() => setBekräftelse(''), 5000);
  }

  if (laddar) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--blue)', borderTopColor: 'transparent' }} />
    </div>
  );

  const förfrågningsGrupper = grupperaPasser(förfrågningar, minVikarie?.id);
  const ledigaGrupper = grupperaPasser(ledigaPass, minVikarie?.id);

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-4 sm:mb-5">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Pass</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Svara på förfrågningar och boka publicerade pass.</p>
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
          Din vikarieprofil är inte konfigurerad. Kontakta administratören.
        </div>
      )}

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Förfrågningar</h2>
          <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}>
            {förfrågningsGrupper.length}
          </span>
        </div>

        {förfrågningsGrupper.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed py-10 text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Inga riktade förfrågningar just nu.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {förfrågningsGrupper.map(grupp => (
              <PassKort
                key={`${grupp.personal_id}_${grupp.datum}_förfrågan`}
                grupp={grupp}
                knappText="Svara"
                onKlick={() => { setFel(''); setValdGrupp(grupp); }}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Lediga pass</h2>
          <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}>
            {ledigaGrupper.length}
          </span>
        </div>

        {ledigaGrupper.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed py-10 text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Inga lediga pass just nu. Bokade pass finns under Mina pass.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ledigaGrupper.map(grupp => (
              <PassKort
                key={`${grupp.personal_id}_${grupp.datum}_ledig`}
                grupp={grupp}
                knappText="Boka passet"
                onKlick={() => { setFel(''); setValdGrupp(grupp); }}
              />
            ))}
          </div>
        )}
      </section>

      {valdGrupp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setValdGrupp(null)} />
          <div className="relative w-full rounded-t-2xl p-6 shadow-xl sm:max-w-sm sm:rounded-xl" style={{ background: 'var(--bg-card)' }}>
            <h2 className="mb-4 text-base font-semibold" style={{ color: 'var(--text)' }}>
              {valdGrupp.riktad ? 'Svara på förfrågan' : 'Bekräfta bokning'}
            </h2>

            <div className="mb-4 space-y-1 rounded-lg p-3 text-sm" style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>
              <p>Datum: <strong style={{ color: 'var(--text)' }}>{valdGrupp.datum}</strong></p>
              <p>Vikarierar för: <strong style={{ color: 'var(--text)' }}>{valdGrupp.personalNamn}</strong></p>
              <p>Årskurs: <strong style={{ color: 'var(--text)' }}>{visaArskurs(valdGrupp.pass.map(p => p.grupp))}</strong></p>
              <p>Tid: <strong style={{ color: 'var(--text)' }}>{valdGrupp.pass[0].tid_från.slice(0, 5)}-{valdGrupp.pass[valdGrupp.pass.length - 1].tid_till.slice(0, 5)}</strong></p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setValdGrupp(null)}
                className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium sm:w-auto"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              >
                Avbryt
              </button>
              {valdGrupp.riktad && (
                <button
                  onClick={() => tackaNej(valdGrupp)}
                  disabled={sparar}
                  className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium sm:w-auto"
                  style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                >
                  Tacka nej
                </button>
              )}
              <button
                onClick={() => tackaJa(valdGrupp)}
                disabled={sparar}
                className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 sm:w-auto"
                style={{ background: 'var(--blue)' }}
              >
                {sparar ? 'Sparar...' : valdGrupp.riktad ? 'Tacka ja' : 'Bekräfta bokning'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
