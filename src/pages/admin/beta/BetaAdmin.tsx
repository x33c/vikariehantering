import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { frånvaroApi, historikApi, passApi, vikariApi } from '../../../lib/api';
import type { DashboardStatistik, Frånvaro, PassStatus, Vikarie, Vikariepass } from '../../../types';
import { Button, LaddaSida } from '../../../components/ui';

const statusText: Record<PassStatus, string> = {
  obokat: 'Behöver vikarie',
  notifierat: 'Förfrågan skickad',
  bokat: 'Vikarie bokad',
  bekräftat: 'Klart',
  avbokat: 'Avbokad',
};

const betaNav = [
  { to: '/admin/beta/start', label: 'Start' },
  { to: '/admin/beta/franvaro', label: 'Frånvaro' },
  { to: '/admin/beta/bemanning', label: 'Bemanning' },
  { to: '/admin/beta/utskick', label: 'Utskick' },
];

function idagIso() {
  return new Date().toISOString().slice(0, 10);
}

function iso(datum: Date) {
  return datum.toISOString().slice(0, 10);
}

function läggTillDagar(datum: Date, dagar: number) {
  const d = new Date(datum);
  d.setDate(d.getDate() + dagar);
  return d;
}

function startPåVecka(datum: Date) {
  const d = new Date(datum);
  const veckodag = d.getDay() || 7;
  d.setDate(d.getDate() - veckodag + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

function tid(tid?: string | null) {
  return tid?.slice(0, 5) ?? '';
}

function kortDatum(datum: string) {
  return new Date(`${datum}T12:00:00`).toLocaleDateString('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function dagNamn(datum: Date) {
  return datum.toLocaleDateString('sv-SE', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase());
}

function veckaNummer(datum: Date) {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const årStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - årStart.getTime()) / 86400000 + 1) / 7));
}

function personNamn(pass?: Vikariepass | null, frånvaro?: Frånvaro | null) {
  return pass?.personal?.namn ?? frånvaro?.personal?.namn ?? 'Ej kopplad person';
}

function gruppText(pass?: Vikariepass | null, frånvaro?: Frånvaro | null) {
  return pass?.grupp ?? pass?.personal?.arbetslag?.namn ?? frånvaro?.personal?.arbetslag?.namn ?? '';
}

function BetaShell({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>
            Beta · {eyebrow}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--text-muted)' }}>
            {description}
          </p>
        </div>
        {action}
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border p-1" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        {betaNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className="shrink-0 rounded-xl px-4 py-2 text-sm font-semibold"
            style={({ isActive }) => ({
              background: isActive ? 'var(--accent)' : 'transparent',
              color: isActive ? '#fff' : 'var(--text-muted)',
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      {children}
    </div>
  );
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border p-4 ${className}`} style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed px-4 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}>
      {text}
    </div>
  );
}

function StatusPill({ status }: { status: PassStatus }) {
  const color = status === 'obokat' ? '#dc2626' :
    status === 'notifierat' ? '#2563eb' :
    status === 'bokat' ? '#b45309' :
    status === 'bekräftat' ? '#059669' : '#6b7280';

  return (
    <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color, background: 'color-mix(in srgb, currentColor 10%, transparent)' }}>
      {statusText[status]}
    </span>
  );
}

function PassCard({
  pass,
  vikarier,
  onBemanna,
  disabled,
}: {
  pass: Vikariepass;
  vikarier?: Vikarie[];
  onBemanna?: (pass: Vikariepass, vikarieId: string) => void;
  disabled?: boolean;
}) {
  return (
    <article className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold" style={{ color: 'var(--text)' }}>{personNamn(pass)}</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {kortDatum(pass.datum)} · {tid(pass.tid_från)}-{tid(pass.tid_till)}
            {gruppText(pass) && <> · {gruppText(pass)}</>}
          </p>
          {pass.vikarie?.namn && (
            <p className="mt-2 text-sm" style={{ color: 'var(--text)' }}>
              Vikarie: <span className="font-semibold">{pass.vikarie.namn}</span>
            </p>
          )}
        </div>
        <StatusPill status={pass.status} />
      </div>

      {pass.status === 'obokat' && vikarier && onBemanna && (
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
          <select
            className="min-h-11 rounded-xl border px-3 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
            disabled={disabled}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onBemanna(pass, e.target.value);
              e.currentTarget.value = '';
            }}
          >
            <option value="">Välj vikarie</option>
            {vikarier.map((vikarie) => (
              <option key={vikarie.id} value={vikarie.id}>{vikarie.namn}</option>
            ))}
          </select>
          <span className="flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            Boka direkt
          </span>
        </div>
      )}
    </article>
  );
}

export function BetaStart() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardStatistik | null>(null);
  const [frånvaro, setFrånvaro] = useState<Frånvaro[]>([]);
  const [laddar, setLaddar] = useState(true);

  useEffect(() => {
    const idag = idagIso();
    const omSju = iso(läggTillDagar(new Date(), 7));

    Promise.all([
      passApi.dashboardStatistik(),
      frånvaroApi.lista(idag, omSju),
    ]).then(([statistik, frånvaroRes]) => {
      setData(statistik);
      setFrånvaro((frånvaroRes.data ?? []) as Frånvaro[]);
      setLaddar(false);
    });
  }, []);

  if (laddar) return <LaddaSida />;
  if (!data) return null;

  const idag = idagIso();
  const idagFrånvaro = frånvaro.filter((f) => f.datum_från <= idag && f.datum_till >= idag);
  const kommandeFrånvaro = frånvaro.filter((f) => f.datum_från > idag || f.datum_till > idag).slice(0, 5);

  return (
    <BetaShell
      eyebrow="Start"
      title="Dagens arbete"
      description="En enklare arbetsyta där frånvaro, bemanning och utskick ligger i samma ordning som arbetsdagen."
      action={<Button onClick={() => navigate('/admin/franvaro')}>Registrera frånvaro</Button>}
    >
      <div className="grid gap-3 lg:grid-cols-3">
        {[
          { label: 'Behöver vikarie', value: data.obokade, to: '/admin/beta/bemanning' },
          { label: 'Vikarie bokad', value: data.bokade, to: '/admin/beta/bemanning' },
          { label: 'Frånvaro idag', value: idagFrånvaro.length, to: '/admin/beta/franvaro' },
        ].map((card) => (
          <button
            key={card.label}
            onClick={() => navigate(card.to)}
            className="rounded-2xl border p-5 text-left"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{card.label}</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>{card.value}</p>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>Att lösa idag</h2>
            <Button size="sm" variant="secondary" onClick={() => navigate('/admin/beta/bemanning')}>Visa bemanning</Button>
          </div>
          <div className="space-y-2">
            {data.dagensPass.filter((p) => p.status === 'obokat').slice(0, 6).map((pass) => (
              <PassCard key={pass.id} pass={pass} />
            ))}
            {data.dagensPass.filter((p) => p.status === 'obokat').length === 0 && <Empty text="Inga pass som behöver vikarie idag." />}
          </div>
        </Panel>

        <Panel>
          <h2 className="mb-3 font-semibold" style={{ color: 'var(--text)' }}>Kommande frånvaro</h2>
          <div className="space-y-2">
            {kommandeFrånvaro.map((f) => (
              <div key={f.id} className="rounded-2xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                <p className="font-semibold" style={{ color: 'var(--text)' }}>{f.personal?.namn ?? 'Ej kopplad person'}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{kortDatum(f.datum_från)}-{kortDatum(f.datum_till)}</p>
              </div>
            ))}
            {kommandeFrånvaro.length === 0 && <Empty text="Ingen kommande frånvaro i veckan." />}
          </div>
        </Panel>
      </div>
    </BetaShell>
  );
}

export function BetaFranvaro() {
  const navigate = useNavigate();
  const [frånvaro, setFrånvaro] = useState<Frånvaro[]>([]);
  const [laddar, setLaddar] = useState(true);

  useEffect(() => {
    frånvaroApi.lista(idagIso(), iso(läggTillDagar(new Date(), 7))).then((res) => {
      setFrånvaro((res.data ?? []) as Frånvaro[]);
      setLaddar(false);
    });
  }, []);

  if (laddar) return <LaddaSida />;

  return (
    <BetaShell
      eyebrow="Frånvaro"
      title="Enklare frånvarolista"
      description="Beta-idén är att frånvaro först visas som personer och dagar. Lektioner blir en detalj först när ett pass ska skapas."
      action={<Button onClick={() => navigate('/admin/franvaro')}>Öppna originalformulär</Button>}
    >
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel>
          <h2 className="mb-3 font-semibold" style={{ color: 'var(--text)' }}>Föreslaget nytt flöde</h2>
          <ol className="space-y-3 text-sm" style={{ color: 'var(--text)' }}>
            <li className="rounded-2xl border p-3" style={{ borderColor: 'var(--border)' }}>
              <span className="font-semibold">1. Välj person och datum.</span>
              <p className="mt-1" style={{ color: 'var(--text-muted)' }}>Appen varnar direkt om personen redan har frånvaro samma dag.</p>
            </li>
            <li className="rounded-2xl border p-3" style={{ borderColor: 'var(--border)' }}>
              <span className="font-semibold">2. Välj om vikarie behövs.</span>
              <p className="mt-1" style={{ color: 'var(--text-muted)' }}>Standard: ett sammanhållet pass per dag, inte ett pass per lektion.</p>
            </li>
            <li className="rounded-2xl border p-3" style={{ borderColor: 'var(--border)' }}>
              <span className="font-semibold">3. Bemanna direkt eller senare.</span>
              <p className="mt-1" style={{ color: 'var(--text-muted)' }}>Val av lektioner göms som avancerat val.</p>
            </li>
          </ol>
        </Panel>

        <Panel>
          <h2 className="mb-3 font-semibold" style={{ color: 'var(--text)' }}>Frånvaro kommande dagar</h2>
          <div className="space-y-2">
            {frånvaro.map((f) => (
              <div key={f.id} className="grid gap-2 rounded-2xl border p-4 sm:grid-cols-[1fr_auto]" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text)' }}>{f.personal?.namn ?? 'Ej kopplad person'}</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {kortDatum(f.datum_från)}-{kortDatum(f.datum_till)}
                    {!f.hel_dag && <> · {tid(f.tid_från)}-{tid(f.tid_till)}</>}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => navigate('/admin/franvaro')}>Hantera</Button>
              </div>
            ))}
            {frånvaro.length === 0 && <Empty text="Ingen frånvaro registrerad kommande dagar." />}
          </div>
        </Panel>
      </div>
    </BetaShell>
  );
}

export function BetaBemanning() {
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [bemannar, setBemannar] = useState<string | null>(null);

  function ladda() {
    setLaddar(true);
    Promise.all([
      passApi.lista({ datumFrån: idagIso(), datumTill: iso(läggTillDagar(new Date(), 7)) }),
      vikariApi.lista(),
    ]).then(([passRes, vikarieRes]) => {
      setPass((passRes.data ?? []) as Vikariepass[]);
      setVikarier((vikarieRes.data ?? []) as Vikarie[]);
      setLaddar(false);
    });
  }

  useEffect(ladda, []);

  async function bemannaDirekt(passRad: Vikariepass, vikarieId: string) {
    setBemannar(passRad.id);
    const res = await passApi.tilldelVikarie(passRad.id, vikarieId);
    if (!res.error) {
      await historikApi.skapa(passRad.id, 'vikarie_bokat', { vikarie_id: vikarieId });
      ladda();
      return;
    }
    setBemannar(null);
  }

  if (laddar) return <LaddaSida />;

  const behöverVikarie = pass.filter((p) => p.status === 'obokat');
  const bokade = pass.filter((p) => p.status === 'bokat' || p.status === 'bekräftat');

  return (
    <BetaShell
      eyebrow="Bemanning"
      title="Bemanna utan sidospår"
      description="Beta-vyn visar först pass som kräver beslut. Det går att välja vikarie direkt på raden."
      action={<Button variant="secondary" onClick={ladda}>Uppdatera</Button>}
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <h2 className="mb-3 font-semibold" style={{ color: 'var(--text)' }}>Behöver vikarie</h2>
          <div className="space-y-3">
            {behöverVikarie.map((p) => (
              <PassCard key={p.id} pass={p} vikarier={vikarier} onBemanna={bemannaDirekt} disabled={bemannar === p.id} />
            ))}
            {behöverVikarie.length === 0 && <Empty text="Inga obokade pass kommande dagar." />}
          </div>
        </Panel>

        <Panel>
          <h2 className="mb-3 font-semibold" style={{ color: 'var(--text)' }}>Redan bemannat</h2>
          <div className="space-y-3">
            {bokade.slice(0, 8).map((p) => <PassCard key={p.id} pass={p} />)}
            {bokade.length === 0 && <Empty text="Inga bokade pass i perioden." />}
          </div>
        </Panel>
      </div>
    </BetaShell>
  );
}

export function BetaUtskick() {
  const navigate = useNavigate();
  const [frånvaro, setFrånvaro] = useState<Frånvaro[]>([]);
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [laddar, setLaddar] = useState(true);
  const veckaStart = useMemo(() => startPåVecka(new Date()), []);
  const dagar = useMemo(() => [0, 1, 2, 3, 4].map((i) => läggTillDagar(veckaStart, i)), [veckaStart]);

  useEffect(() => {
    const start = iso(dagar[0]);
    const slut = iso(dagar[4]);
    Promise.all([
      frånvaroApi.lista(start, slut),
      passApi.lista({ datumFrån: start, datumTill: slut }),
    ]).then(([fRes, pRes]) => {
      setFrånvaro((fRes.data ?? []) as Frånvaro[]);
      setPass((pRes.data ?? []) as Vikariepass[]);
      setLaddar(false);
    });
  }, [dagar]);

  if (laddar) return <LaddaSida />;

  function frånvaroFörDag(datum: string) {
    return frånvaro.filter((f) => f.datum_från <= datum && f.datum_till >= datum);
  }

  function passFörDag(datum: string) {
    return pass.filter((p) => p.datum === datum && p.status !== 'avbokat');
  }

  return (
    <BetaShell
      eyebrow="Utskick"
      title="Renare veckoutskick"
      description="Beta-vyn separerar förhandsvisning från redigering. Originalvyn används fortfarande för faktisk textredigering och mejl."
      action={<Button onClick={() => navigate('/admin/utskick')}>Öppna originalutskick</Button>}
    >
      <Panel>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>Vecka {veckaNummer(veckaStart)}</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Förhandsvisning av data från frånvaro och bemanning.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/admin/utskick')}>Redigera text</Button>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          {dagar.map((dag) => {
            const datum = iso(dag);
            const dagFrånvaro = frånvaroFörDag(datum);
            const dagPass = passFörDag(datum);

            return (
              <section key={datum} className="rounded-2xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                <p className="font-semibold" style={{ color: 'var(--text)' }}>{dagNamn(dag)}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{kortDatum(datum)}</p>

                <div className="mt-4">
                  <p className="mb-1 text-xs font-semibold uppercase" style={{ color: 'var(--text-subtle)' }}>Frånvaro</p>
                  {dagFrånvaro.length ? dagFrånvaro.map((f) => (
                    <p key={f.id} className="text-sm" style={{ color: 'var(--text)' }}>{f.personal?.namn?.split(' ')[0] ?? 'Okänd'}</p>
                  )) : <p className="text-sm" style={{ color: 'var(--text-subtle)' }}>-</p>}
                </div>

                <div className="mt-4">
                  <p className="mb-1 text-xs font-semibold uppercase" style={{ color: 'var(--text-subtle)' }}>Vikarie</p>
                  {dagPass.length ? dagPass.slice(0, 5).map((p) => (
                    <p key={p.id} className="mb-2 text-sm leading-tight" style={{ color: 'var(--text)' }}>
                      <span className="font-semibold">{p.vikarie?.namn?.split(' ')[0] ?? 'Vikarie saknas'}</span>
                      {gruppText(p) && <> · {gruppText(p)}</>}
                      <br />
                      <span style={{ color: 'var(--text-muted)' }}>{tid(p.tid_från)}-{tid(p.tid_till)}</span>
                    </p>
                  )) : <p className="text-sm" style={{ color: 'var(--text-subtle)' }}>-</p>}
                </div>
              </section>
            );
          })}
        </div>
      </Panel>
    </BetaShell>
  );
}
