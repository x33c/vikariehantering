import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { passApi } from '../../lib/api';
import type { DashboardStatistik, PassStatus, Vikariepass } from '../../types';
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

export default function Dashboard() {
  const [data, setData] = useState<DashboardStatistik | null>(null);
  const [laddar, setLaddar] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    passApi.dashboardStatistik().then((d) => {
      setData(d);
      setLaddar(false);
    });
  }, []);

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
    <div className="px-4 py-6 sm:px-6 lg:px-8">
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

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {statistik.map(({ label, värde, status }) => {
          const ton = statusTon[status];
          return (
            <button
              key={label}
              onClick={() => navigate(`/admin/vikariepass?status=${status}`)}
              className="rounded-lg border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span className="h-2 w-2 rounded-full" style={{ background: ton.text }} />
              </div>
              <span className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
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
            {data.dagensPass.length === 0 ? (
              <TomLista text="Inget att lösa just nu." />
            ) : (
              data.dagensPass.map((pass) => <PassRad key={pass.id} pass={pass} />)
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
            {data.kommandePass.length === 0 ? (
              <TomLista text="Inget planerat de kommande dagarna." />
            ) : (
              data.kommandePass.map((pass) => <PassRad key={pass.id} pass={pass} visaDatum />)
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
