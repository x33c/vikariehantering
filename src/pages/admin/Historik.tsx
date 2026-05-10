import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { HändelsTyp } from '../../types';
import { HÄNDELSE_LABELS } from '../../types';

interface HistorikRad {
  id: string;
  pass_id: string;
  händelse: HändelsTyp;
  anteckning: string | null;
  created_at: string;
  utförd_av_profil?: { namn: string; epost: string } | null;
  vikariepass?: { datum: string; personal?: { namn: string } } | null;
}

export default function Historik() {
  const [rader, setRader] = useState<HistorikRad[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [händelseFilter, setHändelseFilter] = useState<HändelsTyp | ''>('');

  useEffect(() => {
    async function ladda() {
      let q = supabase
        .from('passhistorik')
        .select('*, utförd_av_profil:profiler(namn, epost), vikariepass(datum, personal(namn))')
        .order('created_at', { ascending: false })
        .limit(200);
      if (händelseFilter) q = q.eq('händelse', händelseFilter);
      const { data } = await q;
      setRader((data ?? []) as HistorikRad[]);
      setLaddar(false);
    }
    ladda();
  }, [händelseFilter]);

  if (laddar) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Historik</h1>
      </div>
      <div className="mb-4">
        <select
          value={händelseFilter}
          onChange={e => setHändelseFilter(e.target.value as HändelsTyp | '')}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Alla händelser</option>
          {(Object.keys(HÄNDELSE_LABELS) as HändelsTyp[]).map(h => (
            <option key={h} value={h}>{HÄNDELSE_LABELS[h]}</option>
          ))}
        </select>
      </div>
      {rader.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 py-16">
          <p className="text-sm text-gray-500">Ingen historik att visa.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500">
                {['Tidpunkt', 'Händelse', 'Pass', 'Utförd av', 'Anteckning'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rader.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{HÄNDELSE_LABELS[r.händelse]}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.vikariepass ? `${r.vikariepass.datum} – ${r.vikariepass.personal?.namn ?? '–'}` : '–'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.utförd_av_profil?.namn ?? r.utförd_av_profil?.epost ?? 'System'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{r.anteckning ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}