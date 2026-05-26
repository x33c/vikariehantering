import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { frånvaroApi, historikApi, passApi, vikariApi } from '../../../lib/api';
import type { Frånvaro, PassStatus, Vikarie, Vikariepass } from '../../../types';
import { Button, LaddaSida } from '../../../components/ui';

const statusText: Record<PassStatus, string> = {
  obokat: 'Behöver vikarie',
  notifierat: 'Förfrågan skickad',
  bokat: 'Bokad',
  bekräftat: 'Klart',
  avbokat: 'Avbokad',
};

const betaNav = [
  { to: '/admin/beta/start', label: 'Planering' },
  { to: '/admin/beta/franvaro', label: 'Frånvaro' },
  { to: '/admin/beta/bemanning', label: 'Bemanning' },
  { to: '/admin/beta/utskick', label: 'Utskick' },
];

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
  return new Date(`${datum}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
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

function ärVardag(datum: string) {
  const dag = new Date(`${datum}T12:00:00`).getDay();
  return dag >= 1 && dag <= 5;
}

function personNamn(pass?: Vikariepass | null, frånvaro?: Frånvaro | null) {
  return pass?.personal?.namn ?? frånvaro?.personal?.namn ?? 'Ej kopplad person';
}

function gruppText(pass?: Vikariepass | null, frånvaro?: Frånvaro | null) {
  return pass?.grupp ?? pass?.personal?.arbetslag?.namn ?? frånvaro?.personal?.arbetslag?.namn ?? '';
}

function BetaShell({ eyebrow, title, description, action, children }: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-none px-2 py-3 sm:px-4 lg:px-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>Beta · {eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>{title}</h1>
          <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--text-muted)' }}>{description}</p>
        </div>
        {action}
      </div>

      <nav aria-label="Beta-vyer" className="mb-4 flex gap-1 overflow-x-auto rounded-2xl border p-1" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
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
      </nav>

      {children}
    </div>
  );
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border p-4 ${className}`} style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>{children}</section>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}>{text}</div>;
}

function StatusPill({ status }: { status: PassStatus }) {
  const tone = status === 'obokat' ? ['#dc2626', 'rgba(220,38,38,0.12)'] :
    status === 'notifierat' ? ['#38bdf8', 'rgba(56,189,248,0.12)'] :
    status === 'bokat' || status === 'bekräftat' ? ['#22c55e', 'rgba(34,197,94,0.12)'] :
    ['var(--text-muted)', 'var(--hover)'];

  return <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color: tone[0], background: tone[1] }}>{statusText[status]}</span>;
}

function MetricTile({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'danger' | 'success' | 'warning' | 'neutral' }) {
  const color = tone === 'danger' ? '#dc2626' : tone === 'success' ? '#22c55e' : tone === 'warning' ? '#f97316' : 'var(--text-muted)';
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="mt-2 text-3xl font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}

function passStartSort(a: Vikariepass, b: Vikariepass) {
  return a.datum.localeCompare(b.datum) || tid(a.tid_från).localeCompare(tid(b.tid_från)) || personNamn(a).localeCompare(personNamn(b), 'sv');
}

export function BetaStart() {
  const navigate = useNavigate();
  const [frånvaro, setFrånvaro] = useState<Frånvaro[]>([]);
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [veckaStart, setVeckaStart] = useState(() => startPåVecka(new Date()));
  const [bemannarPassId, setBemannarPassId] = useState<string | null>(null);
  const [laddar, setLaddar] = useState(true);

  const dagar = useMemo(() => [0, 1, 2, 3, 4].map((i) => läggTillDagar(veckaStart, i)), [veckaStart]);

  function laddaPlanering() {
    setLaddar(true);
    const start = iso(dagar[0]);
    const slut = iso(dagar[4]);

    Promise.all([
      frånvaroApi.lista(start, slut),
      passApi.lista({ datumFrån: start, datumTill: slut }),
      vikariApi.lista(),
    ]).then(([frånvaroRes, passRes, vikarierRes]) => {
      setFrånvaro((frånvaroRes.data ?? []) as Frånvaro[]);
      setPass(((passRes.data ?? []) as Vikariepass[]).filter((p) => ärVardag(p.datum)).sort(passStartSort));
      setVikarier((vikarierRes.data ?? []) as Vikarie[]);
      setLaddar(false);
    });
  }

  useEffect(() => {
    laddaPlanering();
  }, [veckaStart]);

  async function bemannaDirekt(passRad: Vikariepass, vikarieId: string) {
    setBemannarPassId(passRad.id);
    const res = await passApi.tilldelVikarie(passRad.id, vikarieId);
    if (!res.error) {
      await historikApi.skapa(passRad.id, 'vikarie_bokat', { vikarie_id: vikarieId });
      laddaPlanering();
      return;
    }
    setBemannarPassId(null);
  }

  function frånvaroFörDag(datum: string) {
    return frånvaro.filter((f) => f.datum_från <= datum && f.datum_till >= datum).sort((a, b) => personNamn(null, a).localeCompare(personNamn(null, b), 'sv'));
  }

  function passFörDag(datum: string) {
    return pass.filter((p) => p.datum === datum && p.status !== 'avbokat');
  }

  function passFörFrånvaro(frånvaroId: string, datum: string) {
    return passFörDag(datum).filter((p) => p.frånvaro_id === frånvaroId);
  }

  function friståendePassFörDag(datum: string) {
    return passFörDag(datum).filter((p) => !p.frånvaro_id);
  }

  if (laddar) return <LaddaSida />;

  const obokade = pass.filter((p) => p.status === 'obokat').length;
  const förfrågningar = pass.filter((p) => p.status === 'notifierat').length;
  const bemannade = pass.filter((p) => p.status === 'bokat' || p.status === 'bekräftat').length;
  const frånvaroUtanPass = dagar.reduce((sum, dag) => {
    const datum = iso(dag);
    return sum + frånvaroFörDag(datum).filter((f) => passFörFrånvaro(f.id, datum).length === 0).length;
  }, 0);

  return (
    <BetaShell
      eyebrow="Planering"
      title="Planering beta"
      description="Test av en samlad kalender där frånvaro och bemanning syns ihop. Originalvyerna finns kvar tills det här känns stabilt."
      action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={laddaPlanering}>Uppdatera</Button><Button onClick={() => navigate('/admin/franvaro')}>Ny frånvaro</Button></div>}
    >
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <MetricTile label="Frånvaro utan pass" value={frånvaroUtanPass} tone={frånvaroUtanPass > 0 ? 'danger' : 'success'} />
        <MetricTile label="Saknar vikarie" value={obokade} tone={obokade > 0 ? 'danger' : 'success'} />
        <MetricTile label="Förfrågningar" value={förfrågningar} tone={förfrågningar > 0 ? 'warning' : 'neutral'} />
        <MetricTile label="Bemannade" value={bemannade} tone="success" />
      </div>

      <section className="rounded-3xl border shadow-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Vecka {veckaNummer(veckaStart)}</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{kortDatum(iso(dagar[0]))} - {kortDatum(iso(dagar[4]))}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <Button size="sm" variant="secondary" onClick={() => setVeckaStart(läggTillDagar(veckaStart, -7))}>Föregående</Button>
            <Button size="sm" variant="secondary" onClick={() => setVeckaStart(startPåVecka(new Date()))}>Idag</Button>
            <Button size="sm" variant="secondary" onClick={() => setVeckaStart(läggTillDagar(veckaStart, 7))}>Nästa</Button>
          </div>
        </div>

        <div className="grid gap-3 p-3 xl:grid-cols-5">
          {dagar.map((dag) => {
            const datum = iso(dag);
            const dagensFrånvaro = frånvaroFörDag(datum);
            const dagensFriståendePass = friståendePassFörDag(datum);
            const behöverÅtgärd = dagensFrånvaro.some((f) => passFörFrånvaro(f.id, datum).length === 0) || passFörDag(datum).some((p) => p.status === 'obokat' || p.status === 'notifierat');

            return (
              <section key={datum} className="min-h-80 rounded-2xl border p-3" style={{ borderColor: behöverÅtgärd ? '#f97316' : 'var(--border)', background: 'var(--bg)' }}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold" style={{ color: 'var(--text)' }}>{dagNamn(dag)}</h3>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{kortDatum(datum)}</p>
                  </div>
                  {behöverÅtgärd && <span className="rounded-full px-2 py-1 text-[11px] font-semibold" style={{ color: '#fb923c', background: 'rgba(249,115,22,0.14)' }}>Åtgärd</span>}
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>Frånvaro</p>
                    <div className="space-y-2">
                      {dagensFrånvaro.map((f) => {
                        const koppladePass = passFörFrånvaro(f.id, datum);
                        return (
                          <article key={`${f.id}-${datum}`} className="rounded-2xl border p-3" style={{ borderColor: koppladePass.length ? 'var(--border)' : '#f97316', background: 'var(--bg-card)' }}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>{personNamn(null, f)}</p>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{gruppText(null, f) || 'Ingen grupp'} · {f.hel_dag ? 'Heldag' : `${tid(f.tid_från)}-${tid(f.tid_till)}`}</p>
                              </div>
                              <span className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold" style={{ color: koppladePass.length ? '#22c55e' : '#fb923c', background: koppladePass.length ? 'rgba(34,197,94,0.12)' : 'rgba(249,115,22,0.14)' }}>{koppladePass.length ? `${koppladePass.length} pass` : 'Saknar pass'}</span>
                            </div>

                            {koppladePass.length > 0 && <div className="mt-2 space-y-2">
                              {koppladePass.map((p) => (
                                <div key={p.id} className="rounded-xl border px-2 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                                  <div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{tid(p.tid_från)}-{tid(p.tid_till)}</p><StatusPill status={p.status} /></div>
                                  {p.vikarie?.namn ? <p className="mt-1 text-xs" style={{ color: '#22c55e' }}>Vikarie: {p.vikarie.namn}</p> : <select aria-label={`Bemanna ${personNamn(p, f)}`} className="mt-2 min-h-9 w-full rounded-xl border px-2 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }} disabled={bemannarPassId === p.id} defaultValue="" onChange={(e) => { if (e.target.value) bemannaDirekt(p, e.target.value); e.currentTarget.value = ''; }}><option value="">Välj vikarie</option>{vikarier.map((v) => <option key={v.id} value={v.id}>{v.namn}</option>)}</select>}
                                </div>
                              ))}
                            </div>}

                            <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => navigate('/admin/franvaro')}>Frånvaro</Button><Button size="sm" variant="secondary" onClick={() => navigate('/admin/vikariepass')}>Bemanning</Button></div>
                          </article>
                        );
                      })}
                      {dagensFrånvaro.length === 0 && <Empty text="Ingen frånvaro." />}
                    </div>
                  </div>

                  {dagensFriståendePass.length > 0 && <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>Fristående pass</p>
                    <div className="space-y-2">
                      {dagensFriståendePass.map((p) => <article key={p.id} className="rounded-2xl border p-3" style={{ borderColor: p.status === 'obokat' ? '#f97316' : 'var(--border)', background: 'var(--bg-card)' }}><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{p.vikarie?.namn ?? 'Vikarie saknas'}</p><p className="text-xs" style={{ color: 'var(--text-muted)' }}>{tid(p.tid_från)}-{tid(p.tid_till)} · {gruppText(p) || 'Fristående'}</p></div><StatusPill status={p.status} /></div>{!p.vikarie_id && <select aria-label="Bemanna fristående pass" className="mt-2 min-h-9 w-full rounded-xl border px-2 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }} disabled={bemannarPassId === p.id} defaultValue="" onChange={(e) => { if (e.target.value) bemannaDirekt(p, e.target.value); e.currentTarget.value = ''; }}><option value="">Välj vikarie</option>{vikarier.map((v) => <option key={v.id} value={v.id}>{v.namn}</option>)}</select>}</article>)}
                    </div>
                  </div>}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </BetaShell>
  );
}

export function BetaFranvaro() {
  const navigate = useNavigate();
  return <BetaShell eyebrow="Frånvaro" title="Frånvaro beta" description="Frånvarodelen testas nu i Planering beta. Den gamla frånvarovyn finns kvar för redigering och skapande."><Panel><p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>Använd Planering för översikt och originalvyn för detaljerad hantering.</p><Button onClick={() => navigate('/admin/franvaro')}>Öppna frånvaro</Button></Panel></BetaShell>;
}

export function BetaBemanning() {
  const navigate = useNavigate();
  return <BetaShell eyebrow="Bemanning" title="Bemanning beta" description="Bemanning visas tillsammans med frånvaro i Planering beta. Den gamla bemanningsvyn finns kvar för avancerade åtgärder."><Panel><p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>Använd Planering för snabb bemanning och originalvyn för meddelanden, historik och publicering.</p><Button onClick={() => navigate('/admin/vikariepass')}>Öppna bemanning</Button></Panel></BetaShell>;
}

export function BetaUtskick() {
  const navigate = useNavigate();
  return <BetaShell eyebrow="Utskick" title="Utskick beta" description="Utskick ligger kvar i sin egen beta medan planeringen testas separat."><Panel><p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>När Planering beta känns stabil kan utskicket hämta sin grund direkt från samma samlade underlag.</p><Button onClick={() => navigate('/admin/utskick')}>Öppna utskick</Button></Panel></BetaShell>;
}
