import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { frånvaroApi, historikApi, passApi, vikariApi } from '../../lib/api';
import type { DashboardStatistik, Frånvaro, PassStatus, Vikarie, Vikariepass } from '../../types';
import { Button, LaddaSida } from '../../components/ui';

const statusText: Record<PassStatus, string> = {
  obokat: 'Saknar vikarie',
  notifierat: 'Förfrågan skickad',
  bokat: 'Bokat',
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

function tid(värde?: string | null) {
  return värde?.slice(0, 5) ?? '';
}

function datumText(datum: string) {
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

function passSort(a: Vikariepass, b: Vikariepass) {
  return (
    a.datum.localeCompare(b.datum) ||
    tid(a.tid_från).localeCompare(tid(b.tid_från)) ||
    personNamn(a).localeCompare(personNamn(b), 'sv')
  );
}

function frånvaroSort(a: Frånvaro, b: Frånvaro) {
  return a.datum_från.localeCompare(b.datum_från) || personNamn(null, a).localeCompare(personNamn(null, b), 'sv');
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-3xl border p-3 shadow-sm sm:p-4 ${className}`}
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
      className="inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ color, background: 'color-mix(in srgb, currentColor 10%, transparent)' }}
    >
      {statusText[status]}
    </span>
  );
}

function StatButton({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone: 'danger' | 'warning' | 'success' | 'neutral';
  onClick: () => void;
}) {
  const color = tone === 'danger' ? '#dc2626' : tone === 'warning' ? '#b45309' : tone === 'success' ? '#059669' : 'var(--text-muted)';

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border p-3 text-left transition hover:shadow-sm"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      </div>
      <span className="mt-2 block text-3xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>{value}</span>
    </button>
  );
}

function PassRow({
  pass,
  vikarier,
  busy,
  onOpen,
  onBemanna,
}: {
  pass: Vikariepass;
  vikarier?: Vikarie[];
  busy?: boolean;
  onOpen: () => void;
  onBemanna?: (vikarieId: string) => void;
}) {
  return (
    <article className="rounded-2xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
      <button type="button" onClick={onOpen} className="grid w-full gap-2 text-left sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <p className="truncate font-semibold" style={{ color: 'var(--text)' }}>{personNamn(pass)}</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {datumText(pass.datum)} · {tid(pass.tid_från)}-{tid(pass.tid_till)}
            {gruppText(pass) && <> · {gruppText(pass)}</>}
          </p>
          {pass.vikarie?.namn && (
            <p className="mt-1 text-sm" style={{ color: 'var(--text)' }}>
              {pass.vikarie.namn}
            </p>
          )}
        </div>
        <StatusPill status={pass.status} />
      </button>

      {pass.status === 'obokat' && vikarier && onBemanna && (
        <div className="mt-3">
          <label className="sr-only" htmlFor={`vikarie-${pass.id}`}>Välj vikarie</label>
          <select
            id={`vikarie-${pass.id}`}
            className="min-h-11 w-full rounded-xl border px-3 text-sm font-medium"
            style={{ borderColor: 'var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) onBemanna(e.target.value);
              e.currentTarget.value = '';
            }}
          >
            <option value="">Bemanna direkt</option>
            {vikarier.map((vikarie) => (
              <option key={vikarie.id} value={vikarie.id}>{vikarie.namn}</option>
            ))}
          </select>
        </div>
      )}
    </article>
  );
}

function FrånvaroRow({ frånvaro, onOpen }: { frånvaro: Frånvaro; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full gap-1 rounded-2xl border p-3 text-left transition hover:shadow-sm"
      style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
    >
      <p className="font-semibold" style={{ color: 'var(--text)' }}>{personNamn(null, frånvaro)}</p>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {datumText(frånvaro.datum_från)}
        {frånvaro.datum_till !== frånvaro.datum_från && <>-{datumText(frånvaro.datum_till)}</>}
        {!frånvaro.hel_dag && <> · {tid(frånvaro.tid_från)}-{tid(frånvaro.tid_till)}</>}
        {gruppText(null, frånvaro) && <> · {gruppText(null, frånvaro)}</>}
      </p>
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
    const omSjuDagar = iso(läggTillDagar(new Date(), 7));

    Promise.all([
      passApi.dashboardStatistik(),
      frånvaroApi.lista(),
      passApi.lista({ datumFrån: idag, datumTill: omSjuDagar }),
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

  const grupper = useMemo(() => {
    const idag = idagIso();
    const frånvaroIdag = frånvaro
      .filter((f) => f.datum_från <= idag && f.datum_till >= idag)
      .sort(frånvaroSort);
    const kommandeFrånvaro = frånvaro
      .filter((f) => f.datum_till > idag)
      .filter((f) => !(f.datum_från <= idag && f.datum_till >= idag))
      .sort(frånvaroSort);
    const obokade = pass.filter((p) => p.status === 'obokat').sort(passSort);
    const förfrågningar = pass.filter((p) => p.status === 'notifierat').sort(passSort);
    const bokade = pass.filter((p) => p.status === 'bokat' || p.status === 'bekräftat').sort(passSort);

    return {
      idag,
      frånvaroIdag,
      kommandeFrånvaro,
      obokade,
      förfrågningar,
      bokade,
      attGöra: [...obokade, ...förfrågningar].sort(passSort),
    };
  }, [frånvaro, pass]);

  if (laddar) return <LaddaSida />;
  if (!data) return null;

  const huvudPass = grupper.attGöra.slice(0, 5);
  const sekundäraPass = grupper.bokade.slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-[86rem] px-1.5 py-2 sm:px-4 sm:py-4 lg:px-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>Idag</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Start</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="secondary" onClick={laddaStart}>Uppdatera</Button>
          <Button onClick={() => navigate('/admin/franvaro')}>Ny frånvaro</Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatButton
          label="Saknar vikarie"
          value={grupper.obokade.length}
          tone={grupper.obokade.length > 0 ? 'danger' : 'success'}
          onClick={() => navigate('/admin/vikariepass')}
        />
        <StatButton
          label="Frånvaro idag"
          value={grupper.frånvaroIdag.length}
          tone={grupper.frånvaroIdag.length > 0 ? 'warning' : 'neutral'}
          onClick={() => navigate('/admin/franvaro')}
        />
        <StatButton
          label="Förfrågningar"
          value={grupper.förfrågningar.length}
          tone={grupper.förfrågningar.length > 0 ? 'warning' : 'neutral'}
          onClick={() => navigate('/admin/vikariepass')}
        />
        <StatButton
          label="Bokade"
          value={grupper.bokade.length}
          tone="success"
          onClick={() => navigate('/admin/vikariepass')}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Behöver åtgärd</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{grupper.attGöra.length} pass</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate('/admin/vikariepass')}>Visa alla</Button>
          </div>

          <div className="space-y-2">
            {huvudPass.map((p) => (
              <PassRow
                key={p.id}
                pass={p}
                vikarier={vikarier}
                busy={bemannarPassId === p.id}
                onOpen={() => navigate(`/admin/vikariepass?pass=${p.id}`)}
                onBemanna={(vikarieId) => bemannaDirekt(p, vikarieId)}
              />
            ))}
            {huvudPass.length === 0 && <Empty text="Inga pass behöver åtgärd." />}
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Frånvaro</h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Idag och kommande</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => navigate('/admin/franvaro')}>Öppna</Button>
            </div>

            <div className="space-y-2">
              {grupper.frånvaroIdag.slice(0, 4).map((f) => (
                <FrånvaroRow key={f.id} frånvaro={f} onOpen={() => navigate('/admin/franvaro')} />
              ))}
              {grupper.frånvaroIdag.length === 0 && <Empty text="Ingen frånvaro idag." />}
            </div>

            {grupper.kommandeFrånvaro.length > 0 && (
              <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>
                  Kommande
                </p>
                <div className="space-y-2">
                  {grupper.kommandeFrånvaro.slice(0, 4).map((f) => (
                    <FrånvaroRow key={f.id} frånvaro={f} onOpen={() => navigate('/admin/franvaro')} />
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Bokade pass</h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Närmaste bemannade pass</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => navigate('/admin/utskick')}>Utskick</Button>
            </div>

            <div className="space-y-2">
              {sekundäraPass.map((p) => (
                <PassRow
                  key={p.id}
                  pass={p}
                  onOpen={() => navigate(`/admin/vikariepass?pass=${p.id}`)}
                />
              ))}
              {sekundäraPass.length === 0 && <Empty text="Inga bokade pass att visa." />}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
