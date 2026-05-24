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
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:mb-3 focus:block focus:rounded-xl focus:px-4 focus:py-3 focus:text-sm focus:font-semibold"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        Skip to main content / Hoppa till beta-innehåll
      </a>
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

      <nav
        aria-label="Beta-vyer"
        className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border p-1"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
      >
        {betaNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className="shrink-0 rounded-xl px-4 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={({ isActive }) => ({
              background: isActive ? 'var(--accent)' : 'transparent',
              color: isActive ? '#fff' : 'var(--text-muted)',
              boxShadow: isActive ? 'var(--nav-active-shadow)' : 'none',
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div id="main" role="main">
        {children}
      </div>
    </div>
  );
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${className}`} style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
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
    <article className="rounded-2xl border p-4 transition-colors" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
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
          <label className="sr-only" htmlFor={`beta-vikarie-${pass.id}`}>
            Välj vikarie för {personNamn(pass)}
          </label>
          <select
            id={`beta-vikarie-${pass.id}`}
            aria-label={`Välj vikarie för ${personNamn(pass)}`}
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
          <span className="flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-card)' }}>
            Välj för att boka
          </span>
        </div>
      )}
    </article>
  );
}

function passStartSort(a: Vikariepass, b: Vikariepass) {
  return (
    a.datum.localeCompare(b.datum) ||
    tid(a.tid_från).localeCompare(tid(b.tid_från)) ||
    personNamn(a).localeCompare(personNamn(b), 'sv')
  );
}

function StepCard({
  number,
  title,
  text,
  status,
  action,
}: {
  number: string;
  title: string;
  text: string;
  status: 'klar' | 'väntar' | 'arbete';
  action: React.ReactNode;
}) {
  const tone = status === 'klar'
    ? { bg: '#ecfdf5', text: '#047857', label: 'Klart' }
    : status === 'arbete'
      ? { bg: '#fef2f2', text: '#b91c1c', label: 'Behöver göras' }
      : { bg: '#fffbeb', text: '#b45309', label: 'Nästa steg' };

  return (
    <article className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm font-bold" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
            {number}
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
            <p className="mt-1 text-sm leading-5" style={{ color: 'var(--text-muted)' }}>{text}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: tone.bg, color: tone.text }}>
          {tone.label}
        </span>
      </div>
      <div className="mt-4">{action}</div>
    </article>
  );
}

function MetricTile({
  label,
  value,
  hint,
  intent = 'neutral',
  onClick,
}: {
  label: string;
  value: number | string;
  hint: string;
  intent?: 'danger' | 'success' | 'warning' | 'neutral';
  onClick?: () => void;
}) {
  const color = intent === 'danger' ? '#dc2626' : intent === 'success' ? '#059669' : intent === 'warning' ? '#b45309' : 'var(--text-muted)';

  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-28 rounded-2xl border p-4 text-left transition hover:shadow-sm"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      </div>
      <p className="mt-3 text-4xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>{value}</p>
      <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-subtle)' }}>{hint}</p>
    </button>
  );
}

function CompactPassRow({
  pass,
  onOpen,
}: {
  pass: Vikariepass;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full gap-2 rounded-2xl border p-4 text-left transition hover:shadow-sm sm:grid-cols-[1fr_auto]"
      style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
    >
      <div className="min-w-0">
        <p className="truncate font-semibold" style={{ color: 'var(--text)' }}>{personNamn(pass)}</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          {kortDatum(pass.datum)} · {tid(pass.tid_från)}-{tid(pass.tid_till)}
          {gruppText(pass) && <> · {gruppText(pass)}</>}
        </p>
      </div>
      <StatusPill status={pass.status} />
    </button>
  );
}

export function BetaStart() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardStatistik | null>(null);
  const [frånvaro, setFrånvaro] = useState<Frånvaro[]>([]);
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [bemannarPassId, setBemannarPassId] = useState<string | null>(null);
  const [laddar, setLaddar] = useState(true);

  function laddaStart() {
    setLaddar(true);
    const idag = idagIso();
    const omSju = iso(läggTillDagar(new Date(), 7));

    Promise.all([
      passApi.dashboardStatistik(),
      frånvaroApi.lista(idag, omSju),
      passApi.lista({ datumFrån: idag, datumTill: omSju }),
      vikariApi.lista(),
    ]).then(([statistik, frånvaroRes, passRes, vikarierRes]) => {
      setData(statistik);
      setFrånvaro((frånvaroRes.data ?? []) as Frånvaro[]);
      setPass((passRes.data ?? []) as Vikariepass[]);
      setVikarier((vikarierRes.data ?? []) as Vikarie[]);
      setLaddar(false);
    });
  }

  useEffect(() => {
    laddaStart();
  }, []);

  async function bemannaDirekt(passRad: Vikariepass, vikarieId: string) {
    setBemannarPassId(passRad.id);
    const res = await passApi.tilldelVikarie(passRad.id, vikarieId);
    if (!res.error) {
      await historikApi.skapa(passRad.id, 'vikarie_bokat', { vikarie_id: vikarieId });
      laddaStart();
      return;
    }
    setBemannarPassId(null);
  }

  if (laddar) return <LaddaSida />;
  if (!data) return null;

  const idag = idagIso();
  const idagFrånvaro = frånvaro.filter((f) => f.datum_från <= idag && f.datum_till >= idag);
  const kommandeFrånvaro = frånvaro
    .filter((f) => f.datum_från > idag || f.datum_till > idag)
    .sort((a, b) => a.datum_från.localeCompare(b.datum_från) || personNamn(null, a).localeCompare(personNamn(null, b), 'sv'))
    .slice(0, 6);
  const obokadePass = pass.filter((p) => p.status === 'obokat').sort(passStartSort);
  const dagensObokade = obokadePass.filter((p) => p.datum === idag);
  const förfrågningar = pass.filter((p) => p.status === 'notifierat').sort(passStartSort);
  const bokade = pass.filter((p) => p.status === 'bokat' || p.status === 'bekräftat').sort(passStartSort);
  const nästaPass = dagensObokade[0] ?? obokadePass[0] ?? null;
  const dagensKlart = data.obokade === 0 && idagFrånvaro.length > 0;
  const utskickRedo = data.obokade === 0 && förfrågningar.length === 0;

  return (
    <BetaShell
      eyebrow="Start"
      title="Start beta"
      description="En arbetsyta för morgonrutinen: registrera frånvaro, bemanna det som saknas och förbered utskicket."
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={laddaStart}>Uppdatera</Button>
          <Button onClick={() => navigate('/admin/franvaro')}>Ny frånvaro</Button>
        </div>
      }
    >
      <div className="mb-5 grid gap-3 lg:grid-cols-4">
        <MetricTile
          label="Saknar vikarie"
          value={data.obokade}
          hint={data.obokade === 0 ? 'Inget akut kvar.' : 'Bör hanteras först.'}
          intent={data.obokade > 0 ? 'danger' : 'success'}
          onClick={() => navigate('/admin/beta/bemanning')}
        />
        <MetricTile
          label="Frånvaro idag"
          value={idagFrånvaro.length}
          hint="Personer som påverkar dagen."
          intent={idagFrånvaro.length > 0 ? 'warning' : 'neutral'}
          onClick={() => navigate('/admin/beta/franvaro')}
        />
        <MetricTile
          label="Förfrågningar"
          value={förfrågningar.length}
          hint="Väntar på svar från vikarie."
          intent={förfrågningar.length > 0 ? 'warning' : 'neutral'}
          onClick={() => navigate('/admin/beta/bemanning')}
        />
        <MetricTile
          label="Bokade"
          value={bokade.length}
          hint="Pass som redan har bemanning."
          intent="success"
          onClick={() => navigate('/admin/beta/bemanning')}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-3xl border p-5 shadow-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>Nästa bästa åtgärd</p>
              <h2 className="mt-1 text-xl font-semibold" style={{ color: 'var(--text)' }}>
                {nästaPass ? 'Bemanna det här passet först' : dagensKlart ? 'Dagen är bemannad' : 'Börja med frånvaro'}
              </h2>
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate('/admin/beta/bemanning')}>Alla pass</Button>
          </div>

          {nästaPass ? (
            <PassCard
              pass={nästaPass}
              vikarier={vikarier}
              onBemanna={bemannaDirekt}
              disabled={bemannarPassId === nästaPass.id}
            />
          ) : (
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>
                {dagensKlart ? 'Alla registrerade pass är bemannade.' : 'Registrera frånvaro för att komma igång.'}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                Startsidan ska alltid visa nästa rimliga steg, inte bara tomma listor.
              </p>
              <div className="mt-4">
                <Button onClick={() => navigate('/admin/franvaro')}>Registrera frånvaro</Button>
              </div>
            </div>
          )}
        </section>

        <Panel>
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>Morgonflöde</p>
            <h2 className="mt-1 text-xl font-semibold" style={{ color: 'var(--text)' }}>Tre steg till färdigt utskick</h2>
          </div>

          <div className="space-y-3">
            <StepCard
              number="1"
              title="Frånvaro"
              text={idagFrånvaro.length > 0 ? `${idagFrånvaro.length} frånvaro registrerad idag.` : 'Ingen frånvaro registrerad idag.'}
              status={idagFrånvaro.length > 0 ? 'klar' : 'väntar'}
              action={<Button size="sm" variant="secondary" onClick={() => navigate('/admin/franvaro')}>Registrera</Button>}
            />
            <StepCard
              number="2"
              title="Bemanning"
              text={data.obokade > 0 ? `${data.obokade} pass saknar vikarie.` : 'Inga obokade pass just nu.'}
              status={data.obokade > 0 ? 'arbete' : 'klar'}
              action={<Button size="sm" variant={data.obokade > 0 ? 'primary' : 'secondary'} onClick={() => navigate('/admin/beta/bemanning')}>Bemanna</Button>}
            />
            <StepCard
              number="3"
              title="Utskick"
              text={utskickRedo ? 'Underlaget ser redo ut.' : 'Vänta tills bemanning och förfrågningar är hanterade.'}
              status={utskickRedo ? 'klar' : 'väntar'}
              action={<Button size="sm" variant="secondary" onClick={() => navigate('/admin/beta/utskick')}>Förhandsvisa</Button>}
            />
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--text)' }}>Bemanningskö</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Obokade pass sorterade efter datum och tid.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate('/admin/beta/bemanning')}>Öppna</Button>
          </div>
          <div className="space-y-2">
            {obokadePass.slice(0, 6).map((p) => (
              <CompactPassRow key={p.id} pass={p} onOpen={() => navigate('/admin/beta/bemanning')} />
            ))}
            {obokadePass.length === 0 && <Empty text="Inga pass i bemanningskön." />}
          </div>
        </Panel>

        <Panel>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--text)' }}>Kommande frånvaro</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Det här bör planeras innan dagen börjar.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate('/admin/beta/franvaro')}>Visa</Button>
          </div>
          <div className="space-y-2">
            {kommandeFrånvaro.map((f) => (
              <div key={f.id} className="grid gap-1 rounded-2xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                <p className="font-semibold" style={{ color: 'var(--text)' }}>{personNamn(null, f)}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {kortDatum(f.datum_från)}-{kortDatum(f.datum_till)}
                  {!f.hel_dag && <> · {tid(f.tid_från)}-{tid(f.tid_till)}</>}
                </p>
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
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Panel>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>Behöver beslut</p>
          <p className="mt-2 text-3xl font-semibold" style={{ color: 'var(--text)' }}>{behöverVikarie.length}</p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>Bemannade</p>
          <p className="mt-2 text-3xl font-semibold" style={{ color: 'var(--text)' }}>{bokade.length}</p>
        </Panel>
        <Panel>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>Princip</p>
          <p className="mt-2 text-sm" style={{ color: 'var(--text)' }}>En rad, ett beslut. Avancerade val ska ligga bakom originalvyn.</p>
        </Panel>
      </div>

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
