import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { passApi } from '../../lib/api';
import type { DashboardStatistik } from '../../types';
import { PASS_STATUS_COLORS, PASS_STATUS_LABELS } from '../../types';

function formatTid(tid: string) { return tid.slice(0, 5); }
function formatDatum(datum: string) {
  return new Date(datum).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardStatistik | null>(null);
  const [laddar, setLaddar] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    passApi.dashboardStatistik().then(d => { setData(d); setLaddar(false); });
  }, []);

  if (laddar) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );
  if (!data) return null;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Översikt</h1>
        <p className="text-sm text-gray-500">
          {new Date().toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Statistik */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Obokade', värde: data.obokade, färg: 'red', status: 'obokat' },
          { label: 'Notifierade', värde: data.notifierade, färg: 'blue', status: 'notifierat' },
          { label: 'Bokade', värde: data.bokade, färg: 'yellow', status: 'bokat' },
          { label: 'Bekräftade', värde: data.bekräftade, färg: 'green', status: 'bekräftat' },
          { label: 'Avbokade', värde: data.avbokade, färg: 'gray', status: null },
        ].map(({ label, värde, färg, status }) => (
          <button
            key={label}
            onClick={() => status && navigate(`/admin/vikariepass?status=${status}`)}
            className="flex flex-col gap-1 rounded-xl border p-4 shadow-sm text-left hover:shadow-md transition-shadow"
          >
            <span className="text-xs text-gray-500">{label}</span>
            <span className={`text-2xl sm:text-3xl font-bold text-${färg}-600`}>{värde}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Dagens pass */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Dagens pass</h2>
            <button onClick={() => navigate('/admin/vikariepass')} className="text-xs text-blue-600 hover:underline">
              Visa alla →
            </button>
          </div>
          {data.dagensPass.length === 0 ? (
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-10">
              <p className="text-sm text-gray-400">Inga pass idag.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.dagensPass.map(pass => (
                <div
                  key={pass.id}
                  onClick={() => navigate(`/admin/vikariepass`)}
                  className="flex items-center justify-between rounded-xl border px-4 py-3 shadow-sm cursor-pointer hover:opacity-90"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{pass.personal?.namn ?? '–'}</p>
                    <p className="text-xs text-gray-500">
                      {formatTid(pass.tid_från)}–{formatTid(pass.tid_till)}
                      {pass.personal?.arbetslag && <> · {pass.personal.arbetslag.namn}</>}
                    </p>
                  </div>
                  <span className={`ml-3 shrink-0 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PASS_STATUS_COLORS[pass.status]}`}>
                    {PASS_STATUS_LABELS[pass.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Kommande pass */}
        <div>
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Kommande 7 dagar</h2>
          </div>
          {data.kommandePass.length === 0 ? (
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-10">
              <p className="text-sm text-gray-400">Inga kommande pass.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.kommandePass.map(pass => (
                <div
                  key={pass.id}
                  onClick={() => navigate('/admin/vikariepass')}
                  className="flex items-center justify-between rounded-xl border px-4 py-3 shadow-sm cursor-pointer hover:opacity-90"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{pass.personal?.namn ?? '–'}</p>
                    <p className="text-xs text-gray-500">{formatDatum(pass.datum)}</p>
                  </div>
                  <span className={`ml-3 shrink-0 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PASS_STATUS_COLORS[pass.status]}`}>
                    {PASS_STATUS_LABELS[pass.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Snabbåtgärder */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Snabbåtgärder</h2>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          {[
            { label: 'Registrera frånvaro', to: '/admin/franvaro' },
            { label: 'Skapa vikariepass', to: '/admin/vikariepass' },
            { label: 'Importera schema', to: '/admin/import' },
          ].map(({ label, to }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="rounded-lg border px-4 py-3 text-sm font-medium  shadow-sm hover:opacity-90 text-left sm:text-center"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}