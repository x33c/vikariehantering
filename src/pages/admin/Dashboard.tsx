import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { passApi } from '../../lib/api';
import { StatCard, LaddaSida, StatusBadge, TomtTillstånd } from '../../components/ui';
import type { DashboardStatistik } from '../../types';

function formatTid(tid: string) {
  return tid.slice(0, 5);
}

function formatDatum(datum: string) {
  return new Date(datum).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
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

  if (laddar) return <LaddaSida />;
  if (!data) return null;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Översikt</h1>
        <p className="text-sm text-gray-500">
          {new Date().toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Statistik */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Obokade"
          värde={data.obokade}
          färg="red"
          onClick={() => navigate('/admin/vikariepass?status=obokat')}
        />
        <StatCard
          label="Notifierade"
          värde={data.notifierade}
          färg="blue"
          onClick={() => navigate('/admin/vikariepass?status=notifierat')}
        />
        <StatCard
          label="Bokade"
          värde={data.bokade}
          färg="yellow"
          onClick={() => navigate('/admin/vikariepass?status=bokat')}
        />
        <StatCard
          label="Bekräftade"
          värde={data.bekräftade}
          färg="green"
          onClick={() => navigate('/admin/vikariepass?status=bekräftat')}
        />
        <StatCard
          label="Avbokade"
          värde={data.avbokade}
          färg="gray"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Dagens pass */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Dagens pass</h2>
            <button
              onClick={() => navigate('/admin/vikariepass')}
              className="text-xs text-blue-600 hover:underline"
            >
              Visa alla →
            </button>
          </div>
          {data.dagensPass.length === 0 ? (
            <TomtTillstånd text="Inga pass registrerade för idag." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs text-gray-500">
                    <th className="px-4 py-2.5 text-left font-medium">Tid</th>
                    <th className="px-4 py-2.5 text-left font-medium">Personal</th>
                    <th className="px-4 py-2.5 text-left font-medium">Vikarie</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.dagensPass.map((pass) => (
                    <tr
                      key={pass.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => navigate(`/admin/vikariepass?id=${pass.id}`)}
                    >
                      <td className="px-4 py-3 text-gray-700">
                        {formatTid(pass.tid_från)}–{formatTid(pass.tid_till)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{pass.personal?.namn ?? '–'}</p>
                        {pass.personal?.arbetslag && (
                          <p className="text-xs text-gray-500">{pass.personal.arbetslag.namn}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{pass.vikarie?.namn ?? '–'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={pass.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Kommande pass */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Kommande 7 dagar</h2>
          </div>
          {data.kommandePass.length === 0 ? (
            <TomtTillstånd text="Inga kommande pass nästa vecka." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs text-gray-500">
                    <th className="px-4 py-2.5 text-left font-medium">Datum</th>
                    <th className="px-4 py-2.5 text-left font-medium">Personal</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.kommandePass.map((pass) => (
                    <tr
                      key={pass.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => navigate(`/admin/vikariepass?id=${pass.id}`)}
                    >
                      <td className="px-4 py-3 text-gray-700">{formatDatum(pass.datum)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{pass.personal?.namn ?? '–'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={pass.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Snabbåtgärder */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Snabbåtgärder</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate('/admin/franvaro')}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Registrera frånvaro
          </button>
          <button
            onClick={() => navigate('/admin/vikariepass')}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Skapa vikariepass
          </button>
          <button
            onClick={() => navigate('/admin/import')}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Importera schema
          </button>
        </div>
      </div>
    </div>
  );
}
