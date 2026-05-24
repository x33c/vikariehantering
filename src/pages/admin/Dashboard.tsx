import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { frånvaroApi, historikApi, passApi, vikariApi } from '../../lib/api';
import type { DashboardStatistik, Frånvaro, PassStatus, Vikarie, Vikariepass } from '../../types';
import { Button, LaddaSida } from '../../components/ui';

const statusText: Record<PassStatus, string> = {
  obokat: 'Behöver vikarie',
  notifierat: 'Förfrågan skickad',
  bokat: 'Vikarie bokad',
  bekräftat: 'Klart',
  avbokat: 'Avbokad',
};

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

function personNamn(pass?: Vikariepass | null, frånvaro?: Frånvaro | null) {
  return pass?.personal?.namn ?? frånvaro?.personal?.namn ?? 'Ej kopplad person';
}

function gruppText(pass?: Vikariepass | null, frånvaro?: Frånvaro | null) {
  return pass?.grupp ?? pass?.personal?.arbetslag?.namn ?? frånvaro?.personal?.arbetslag?.namn ?? '';
}

function passStartSort(a: Vikariepass, b: Vikariepass) {
  return (
    a.datum.localeCompare(b.datum) ||
    tid(a.tid_från).localeCompare(tid(b.tid_från)) ||
    personNamn(a).localeCompare(personNamn(b), 'sv')
  );
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border p-4 shadow-sm ${className}`}
      style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
    >
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed px-4 text-center text-sm"
      style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}
    >
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
    <span
      className="rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ color, background: 'color-mix(in srgb, currentColor 10%, transparent)' }}
    >
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
    <article
      className="rounded-2xl border p-4 transition-colors"
      style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold" style={{ color: 'var(--text)' }}>
            {personNamn(pass)}
          </p>
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
          <label className="sr-only" htmlFor={`vikarie-${pass.id}`}>
            Välj vikarie för {personNamn(pass)}
          </label>
          <select
            id={`vikarie-${pass.id}`}
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
          <span
            className="flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm font-semibold"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-card)' }}
          >
            Välj för att boka
          </span>
        </div>
      )}
    </article>
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
  action: ReactNode;
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
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm font-bold"
            style={{ background: 'var(--bg)', color: 'var(--text)' }}
          >
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

function CompactPassRow({ pass, onOpen }: { pass: Vikariepass; onOpen: () => void }) {
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

export default function Dashboard() {
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
    <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>
            Idag
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
            Start
          </h1>
          <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--text-muted)' }}>
            Registrera frånvaro, bemanna pass och förbered dagens utskick.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={laddaStart}>Uppdatera</Button>
          <Button onClick={() => navigate('/admin/franvaro')}>Ny frånvaro</Button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-4">
        <MetricTile
          label="Saknar vikarie"
          value={data.obokade}
          hint={data.obokade === 0 ? 'Inget akut kvar.' : 'Bör hanteras först.'}
          intent={data.obokade > 0 ? 'danger' : 'success'}
          onClick={() => navigate('/admin/vikariepass')}
        />
        <MetricTile
          label="Frånvaro idag"
          value={idagFrånvaro.length}
          hint="Personer som påverkar dagen."
          intent={idagFrånvaro.length > 0 ? 'warning' : 'neutral'}
          onClick={() => navigate('/admin/franvaro')}
        />
        <MetricTile
          label="Förfrågningar"
          value={förfrågningar.length}
          hint="Väntar på svar från vikarie."
          intent={förfrågningar.length > 0 ? 'warning' : 'neutral'}
          onClick={() => navigate('/admin/vikariepass')}
        />
        <MetricTile
          label="Bokade"
          value={bokade.length}
          hint="Pass som redan har bemanning."
          intent="success"
          onClick={() => navigate('/admin/vikariepass')}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <section
          className="rounded-3xl border p-5 shadow-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>
                Nästa bästa åtgärd
              </p>
              <h2 className="mt-1 text-xl font-semibold" style={{ color: 'var(--text)' }}>
                {nästaPass ? 'Bemanna det här passet först' : dagensKlart ? 'Dagen är bemannad' : 'Börja med frånvaro'}
              </h2>
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate('/admin/vikariepass')}>Alla pass</Button>
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
                Startsidan visar nästa rimliga steg och håller dagens arbete samlat.
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
              action={<Button size="sm" variant={data.obokade > 0 ? 'primary' : 'secondary'} onClick={() => navigate('/admin/vikariepass')}>Bemanna</Button>}
            />
            <StepCard
              number="3"
              title="Utskick"
              text={utskickRedo ? 'Underlaget ser redo ut.' : 'Vänta tills bemanning och förfrågningar är hanterade.'}
              status={utskickRedo ? 'klar' : 'väntar'}
              action={<Button size="sm" variant="secondary" onClick={() => navigate('/admin/utskick')}>Förhandsvisa</Button>}
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
            <Button size="sm" variant="secondary" onClick={() => navigate('/admin/vikariepass')}>Öppna</Button>
          </div>
          <div className="space-y-2">
            {obokadePass.slice(0, 6).map((p) => (
              <CompactPassRow key={p.id} pass={p} onOpen={() => navigate('/admin/vikariepass')} />
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
            <Button size="sm" variant="secondary" onClick={() => navigate('/admin/franvaro')}>Visa</Button>
          </div>
          <div className="space-y-2">
            {kommandeFrånvaro.map((f) => (
              <div
                key={f.id}
                className="grid gap-1 rounded-2xl border p-3"
                style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
              >
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
    </div>
  );
}
