import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { frånvaroApi, historikApi, passApi, vikariApi } from '../../lib/api';
import type { DashboardStatistik, Frånvaro, PassStatus, Vikarie, Vikariepass } from '../../types';
import { PASS_STATUS_LABELS } from '../../types';

function formatTid(tid: string) {
  return tid.slice(0, 5);
}

function formatDatum(datum: string) {
  return new Date(datum).toLocaleDateString('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

const statusTon: Record<PassStatus, { bg: string; text: string; ring: string }> = {
  obokat: { bg: '#fef2f2', text: '#b91c1c', ring: '#fecaca' },
  notifierat: { bg: '#eff6ff', text: '#1d4ed8', ring: '#bfdbfe' },
  bokat: { bg: '#fffbeb', text: '#b45309', ring: '#fde68a' },
  bekräftat: { bg: '#ecfdf5', text: '#047857', ring: '#a7f3d0' },
  avbokat: { bg: '#f3f4f6', text: '#6b7280', ring: '#e5e7eb' },
};

function StatusBadge({ status }: { status: PassStatus }) {
  const ton = statusTon[status];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: ton.bg, color: ton.text, boxShadow: `inset 0 0 0 1px ${ton.ring}` }}
    >
      {PASS_STATUS_LABELS[status]}
    </span>
  );
}

function PassRad({ pass, visaDatum = false }: { pass: Vikariepass; visaDatum?: boolean }) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate('/admin/vikariepass')}
      className="group flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" style={{ color: 'var(--text)' }}>
          {pass.personal?.namn ?? 'Ej kopplad personal'}
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {visaDatum && <>{formatDatum(pass.datum)} · </>}
          {formatTid(pass.tid_från)}-{formatTid(pass.tid_till)}
          {pass.personal?.arbetslag && <> · {pass.personal.arbetslag.namn}</>}
        </p>
      </div>
      <StatusBadge status={pass.status} />
    </button>
  );
}

function TomLista({ text }: { text: string }) {
  return (
    <div
      className="flex min-h-32 items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center"
      style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}
    >
      <p className="text-sm">{text}</p>
    </div>
  );
}

function FrånvaroRad({
  frånvaro,
  pass,
  vikarier,
  bemannarPassId,
  onBemanna,
}: {
  frånvaro: Frånvaro;
  pass?: Vikariepass;
  vikarier: Vikarie[];
  bemannarPassId: string | null;
  onBemanna: (pass: Vikariepass, vikarieId: string) => void;
}) {
  const navigate = useNavigate();
  const status = pass?.status;

  const badge = status
    ? PASS_STATUS_LABELS[status]
    : 'Ingen vikarie';

  const färg = status
    ? statusTon[status]
    : { bg: '#fff7ed', text: '#c2410c', ring: '#fed7aa' };

  const kanBemannasDirekt = pass && pass.status === 'obokat';

  return (
    <div
      className="rounded-lg border px-4 py-3 transition-all hover:shadow-sm"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(pass ? '/admin/vikariepass' : '/admin/franvaro')}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-sm font-medium" style={{ color: 'var(--text)' }}>
            {frånvaro.personal?.namn ?? 'Fristående pass'}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            {pass
              ? `${formatTid(pass.tid_från)}-${formatTid(pass.tid_till)}`
              : frånvaro.hel_dag
                ? 'Heldag'
                : `${formatTid(frånvaro.tid_från ?? '08:00')}-${formatTid(frånvaro.tid_till ?? '17:00')}`}
            {frånvaro.personal?.arbetslag && <> · {frånvaro.personal.arbetslag.namn}</>}
          </p>
        </button>

        <span
          className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ background: färg.bg, color: färg.text, boxShadow: `inset 0 0 0 1px ${färg.ring}` }}
        >
          {badge}
        </span>
      </div>

      {kanBemannasDirekt && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
            value=""
            disabled={bemannarPassId === pass.id}
            onChange={(e) => {
              if (e.target.value) onBemanna(pass, e.target.value);
            }}
          >
            <option value="">Välj vikarie och boka direkt</option>
            {vikarier.map((vikarie) => (
              <option key={vikarie.id} value={vikarie.id}>{vikarie.namn}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => navigate('/admin/vikariepass')}
            className="rounded-lg border px-3 py-2 text-sm font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            Fler val
          </button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardStatistik | null>(null);
  const [dagensFrånvaro, setDagensFrånvaro] = useState<Frånvaro[]>([]);
  const [kommandeFrånvaro, setKommandeFrånvaro] = useState<Frånvaro[]>([]);
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [bemannarPassId, setBemannarPassId] = useState<string | null>(null);
  const [laddar, setLaddar] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const idag = new Date().toISOString().slice(0, 10);
    const imorgon = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const omSjuDagar = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    Promise.all([
      passApi.dashboardStatistik(),
      frånvaroApi.lista(),
      vikariApi.lista(),
    ]).then(([statistik, frånvaroRes, vikarierRes]) => {
      const allFrånvaro = (frånvaroRes.data ?? []) as Frånvaro[];

      setData(statistik);
      setDagensFrånvaro(
        allFrånvaro.filter((frånvaro) =>
          frånvaro.datum_från <= idag && frånvaro.datum_till >= idag
        )
      );
      setKommandeFrånvaro(
        allFrånvaro.filter((frånvaro) =>
          frånvaro.datum_till >= imorgon && frånvaro.datum_från <= omSjuDagar
        )
      );
      setVikarier((vikarierRes.data ?? []) as Vikarie[]);
      setLaddar(false);
    });
  }, []);

  async function bemannaDirekt(pass: Vikariepass, vikarieId: string) {
    setBemannarPassId(pass.id);

    const res = await passApi.tilldelVikarie(pass.id, vikarieId);
    if (!res.error) {
      await historikApi.skapa(pass.id, 'vikarie_bokat', { vikarie_id: vikarieId });

      setData((prev) => {
        if (!prev) return prev;

        const uppdateratPass = {
          ...pass,
          vikarie_id: vikarieId,
          status: 'bokat' as PassStatus,
        };

        return {
          ...prev,
          obokade: Math.max(0, prev.obokade - 1),
          bokade: prev.bokade + 1,
          dagensPass: prev.dagensPass.map((p) => p.id === pass.id ? uppdateratPass : p),
          kommandePass: prev.kommandePass.map((p) => p.id === pass.id ? uppdateratPass : p),
        };
      });
    }

    setBemannarPassId(null);
  }

  if (laddar) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!data) return null;

  const statistik = [
    { label: 'Behöver vikarie', värde: data.obokade, status: 'obokat' as PassStatus },
    { label: 'Förfrågan skickad', värde: data.notifierade, status: 'notifierat' as PassStatus },
    { label: 'Vikarie bokad', värde: data.bokade, status: 'bokat' as PassStatus },
    { label: 'Klart', värde: data.bekräftade, status: 'bekräftat' as PassStatus },
    { label: 'Avbokade', värde: data.avbokade, status: 'avbokat' as PassStatus },
  ];

  return (
    <div className="px-3 py-5 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>
            Idag
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
            Start
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Registrera frånvaro, bemanna pass och förbered dagens utskick.
          </p>
        </div>
        <button
          onClick={() => navigate('/admin/franvaro')}
          className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          style={{ background: 'var(--accent)' }}
        >
          Registrera frånvaro
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
        {statistik.map(({ label, värde, status }) => {
          const ton = statusTon[status];
          return (
            <button
              key={label}
              onClick={() => navigate(`/admin/vikariepass?status=${status}`)}
              className="rounded-lg border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm sm:p-4"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span className="h-2 w-2 rounded-full" style={{ background: ton.text }} />
              </div>
              <span className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: 'var(--text)' }}>
                {värde}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Att lösa idag</h2>
            <button onClick={() => navigate('/admin/vikariepass')} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
              Visa
            </button>
          </div>
          <div className="space-y-2">
            {dagensFrånvaro.length === 0 ? (
              <TomLista text="Ingen frånvaro idag." />
            ) : (
              dagensFrånvaro.map((frånvaro) => {
                const kopplatPass = data.dagensPass.find((pass) => pass.frånvaro_id === frånvaro.id);
                return <FrånvaroRad key={frånvaro.id} frånvaro={frånvaro} pass={kopplatPass} vikarier={vikarier} bemannarPassId={bemannarPassId} onBemanna={bemannaDirekt} />;
              })
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Kommande</h2>
            <button onClick={() => navigate('/admin/vikariepass')} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
              Visa
            </button>
          </div>
          <div className="space-y-2">
            {kommandeFrånvaro.length === 0 ? (
              <TomLista text="Ingen kommande frånvaro." />
            ) : (
              kommandeFrånvaro.map((frånvaro) => {
                const kopplatPass = data.kommandePass.find((pass) => pass.frånvaro_id === frånvaro.id);
                return (
                  <FrånvaroRad
                    key={frånvaro.id}
                    frånvaro={frånvaro}
                    pass={kopplatPass}
                    vikarier={vikarier}
                    bemannarPassId={bemannarPassId}
                    onBemanna={bemannaDirekt}
                  />
                );
              })
            )}
          </div>
        </section>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>Vanliga åtgärder</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { label: 'Registrera frånvaro', to: '/admin/franvaro' },
            { label: 'Lägg till pass', to: '/admin/vikariepass' },
            { label: 'Läs in schema', to: '/admin/import' },
          ].map(({ label, to }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="rounded-lg border px-4 py-3 text-left text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-sm"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
