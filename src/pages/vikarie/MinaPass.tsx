import { useEffect, useState } from 'react';
import { passApi, vikariApi } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import type { Vikariepass, Vikarie } from '../../types';
import { PASS_STATUS_COLORS, PASS_STATUS_LABELS } from '../../types';

export default function MinaPass() {
  const { användare } = useAuth();
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [laddar, setLaddar] = useState(true);

  useEffect(() => {
    async function ladda() {
      if (!användare) return;
      const vRes = await vikariApi.hämtaViaProfilId(användare.id);
      const vikarie = vRes.data as Vikarie | null;
      if (!vikarie) { setLaddar(false); return; }
      const pRes = await passApi.lista({ status: ['bokat', 'bekräftat'] });
      const mina = ((pRes.data ?? []) as Vikariepass[]).filter(p => p.vikarie_id === vikarie.id);
      setPass(mina);
      setLaddar(false);
    }
    ladda();
  }, [användare]);

  if (laddar) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Mina bokade pass</h1>
      </div>
      {pass.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 py-16">
          <p className="text-sm text-gray-500">Du har inga bokade pass.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500">
                {['Datum', 'Tid', 'Personal', 'Ämne', 'Sal', 'Status'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pass.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {new Date(p.datum).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{p.tid_från.slice(0,5)}–{p.tid_till.slice(0,5)}</td>
                  <td className="px-4 py-3 text-gray-700">{p.personal?.namn ?? '–'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.ämne ?? '–'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.sal ?? '–'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PASS_STATUS_COLORS[p.status]}`}>
                      {PASS_STATUS_LABELS[p.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}