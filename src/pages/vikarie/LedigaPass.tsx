import { useEffect, useState } from 'react';
import { passApi, vikariApi, historikApi, notisApi } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
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
  secondaryText,
  onSecondary,
  disabled,
}: {
  grupp: Passgrupp;
  knappText: string;
  onKlick: () => void;
  secondaryText?: string;
  onSecondary?: () => void;
  disabled?: boolean;
}) {
  const tidFrån = grupp.pass[0].tid_från.slice(0, 5);
  const tidTill = grupp.pass[grupp.pass.length - 1].tid_till.slice(0, 5);
  const arskurs = visaArskurs(grupp.pass.map(p => p.grupp));

  return (
    <article
      className="rounded-2xl border p-4 shadow-sm"
      style={{
        background: grupp.riktad ? 'color-mix(in srgb, var(--blue) 7%, var(--bg-card))' : 'var(--bg-card)',
        borderColor: grupp.riktad ? 'var(--blue)' : 'var(--border)',
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold capitalize" style={{ color: 'var(--text)' }}>
            {new Date(`${grupp.datum}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <p className="mt-1 text-2xl font-semibold" style={{ color: 'var(--text)' }}>{tidFrån}-{tidTill}</p>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{
            background: grupp.riktad ? 'color-mix(in srgb, var(--blue) 18%, transparent)' : 'var(--hover)',
            color: grupp.riktad ? 'var(--blue)' : 'var(--text-muted)',
          }}>
          {grupp.riktad ? 'Förfrågan' : 'Ledigt'}
        </span>
      </div>

      <div className="mb-4 grid gap-2 rounded-xl px-3 py-3 text-sm" style={{ background: 'var(--bg)' }}>
        {grupp.personalNamn !== 'Okänd personal' && grupp.personalNamn !== 'Fristående pass' && (
          <div className="flex justify-between gap-3">
            <span style={{ color: 'var(--text-muted)' }}>Vikarierar för</span>
            <span className="text-right font-semibold" style={{ color: 'var(--text)' }}>{grupp.personalNamn}</span>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <span style={{ color: 'var(--text-muted)' }}>Årskurs</span>
          <span className="text-right font-semibold" style={{ color: 'var(--text)' }}>{arskurs}</span>
        </div>
      </div>

      <div className={secondaryText ? 'grid gap-2 sm:grid-cols-2' : ''}>
        <button type="button" onClick={onKlick} disabled={disabled}
          className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--blue)' }}>
          {knappText}
        </button>
        {secondaryText && onSecondary && (
          <button type="button" onClick={onSecondary} disabled={disabled}
            className="w-full rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
            {secondaryText}
          </button>
        )}
      </div>
    </article>
  );
}

export default function LedigaPass() {
  const { användare } = useAuth();
  const [förfrågningar, setFörfrågningar] = useState<Vikariepass[]>([]);
  const [ledigaPass, setLedigaPass] = useState<Vikariepass[]>([]);
  const [minVikarie, setMinVikarie] = useState<Vikarie | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState('');
  const [bekräftelse, setBekräftelse] = useState('');

  useEffect(() => { ladda(); }, [användare]);
  useRealtimeRefresh(!!minVikarie, ladda, ['vikariepass', 'notiser']);

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
    if (!minVikarie) {
      const text = 'Din vikarieprofil är inte kopplad till kontot.';
      setFel(text);
      return;
    }

    setSparar(true);
    setFel('');

    let lyckades = 0;
    let senasteFel: unknown = null;

    try {
      for (const passrad of grupp.pass) {
        const svar = grupp.riktad
          ? await passApi.tackaJa(passrad.id, minVikarie.id)
          : await passApi.bokaPass(passrad.id, minVikarie.id);

        if (svar.error) {
          senasteFel = svar.error;
          break;
        }

        if (!svar.data) {
          senasteFel = 'Passet kunde inte bokas.';
          break;
        }

        await historikApi.skapa(passrad.id, 'vikarie_bokat', {
          vikarie_id: minVikarie.id,
          svar: grupp.riktad ? 'ja' : 'bokad',
        });

        if (grupp.riktad) {
          await notisApi.skapaAdminSvar(passrad.id, minVikarie.id, 'ja');
        }

        lyckades++;
      }

      if (lyckades === 0) {
        const text = bokningsFelText(senasteFel);
        setFel(text);
        return;
      }

      if (lyckades < grupp.pass.length) {
        const text = 'En del av passet kunde inte bokas. Du kan vara dubbelbokad. Kontrollera Mina pass eller kontakta administratör.';
        setFel(text);
        await ladda();
        return;
      }

      await ladda();
      setBekräftelse(`Du tackade ja: ${grupp.personalNamn} ${grupp.datum}`);
      setTimeout(() => setBekräftelse(''), 5000);
    } catch (error) {
      const text = bokningsFelText(error);
      setFel(text);
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
  const förstaNamn = minVikarie?.namn?.split(' ')[0];

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-5 rounded-2xl border p-4 sm:p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{förstaNamn ? `Hej ${förstaNamn}` : 'Vikarie'}</p>
        <h1 className="mt-1 text-2xl font-semibold" style={{ color: 'var(--text)' }}>Pass</h1>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl px-3 py-2" style={{ background: 'var(--bg)' }}>
            <p className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>{förfrågningsGrupper.length}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Förfrågningar</p>
          </div>
          <div className="rounded-xl px-3 py-2" style={{ background: 'var(--bg)' }}>
            <p className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>{ledigaGrupper.length}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Lediga pass</p>
          </div>
        </div>
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
                knappText="Tacka ja"
                secondaryText="Tacka nej"
                disabled={sparar}
                onKlick={() => { setFel(''); tackaJa(grupp); }}
                onSecondary={() => { setFel(''); tackaNej(grupp); }}
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
                disabled={sparar}
                onKlick={() => { setFel(''); tackaJa(grupp); }}
              />
            ))}
          </div>
        )}
      </section>


    </div>
  );
}
