import { useEffect, useState } from 'react';
import { vikariApi } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import type { Vikarie, VikarieTillgänglighet } from '../../types';
import { VECKODAG_LABELS } from '../../types';

export default function Tillganglighet() {
  const { användare } = useAuth();
  const [vikarie, setVikarie] = useState<Vikarie | null>(null);
  const [tillg, setTillg] = useState<VikarieTillgänglighet[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [modalÖppen, setModalÖppen] = useState(false);
  const [raderaId, setRaderaId] = useState<string | null>(null);
  const [typ, setTyp] = useState<'specifikt' | 'återkommande'>('specifikt');
  const [form, setForm] = useState({ datum: '', veckodag: '1', tid_från: '', tid_till: '', tillgänglig: true, anteckning: '' });
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState('');

  useEffect(() => {
    async function ladda() {
      if (!användare) return;
      const vRes = await vikariApi.hämtaViaProfilId(användare.id);
      const v = vRes.data as Vikarie | null;
      setVikarie(v);
      if (v) {
        const tRes = await vikariApi.hämtaTillgänglighet(v.id);
        setTillg((tRes.data ?? []) as VikarieTillgänglighet[]);
      }
      setLaddar(false);
    }
    ladda();
  }, [användare]);

  async function spara() {
    if (!vikarie) return;
    if (typ === 'specifikt' && !form.datum) { setFel('Välj datum.'); return; }
    setSparar(true);
    setFel('');
    const data: Omit<VikarieTillgänglighet, 'id' | 'created_at' | 'updated_at'> = {
      vikarie_id: vikarie.id,
      datum: typ === 'specifikt' ? form.datum : null,
      veckodag: typ === 'återkommande' ? parseInt(form.veckodag) : null,
      tillgänglig: form.tillgänglig,
      tid_från: form.tid_från || null,
      tid_till: form.tid_till || null,
      återkommande: typ === 'återkommande',
      anteckning: form.anteckning || null,
    };
    const res = await vikariApi.sättTillgänglighet(data);
    setSparar(false);
    if (res.error) { setFel(res.error.message); return; }
    setTillg(prev => [res.data as VikarieTillgänglighet, ...prev]);
    setModalÖppen(false);
    setForm({ datum: '', veckodag: '1', tid_från: '', tid_till: '', tillgänglig: true, anteckning: '' });
  }

  if (laddar) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Min tillgänglighet</h1>
          <p className="text-sm text-gray-500">Ange specifika datum eller återkommande veckodagar.</p>
        </div>
        <button onClick={() => setModalÖppen(true)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + Lägg till
        </button>
      </div>
      {!vikarie && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          Ditt vikarieprofil är inte konfigurerad. Kontakta administratören.
        </div>
      )}
      {tillg.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 py-16">
          <p className="text-sm text-gray-500">Ingen tillgänglighet registrerad.</p>
          <button onClick={() => setModalÖppen(true)} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">Lägg till</button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500">
                {['Typ', 'Dag / datum', 'Tid', 'Tillgänglig', 'Anteckning', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tillg.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{t.återkommande ? 'Återkommande' : 'Specifikt'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {t.datum ?? (t.veckodag !== null ? VECKODAG_LABELS[t.veckodag] : '–')}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {t.tid_från && t.tid_till ? `${t.tid_från.slice(0,5)}–${t.tid_till.slice(0,5)}` : 'Heldag'}
                  </td>
                  <td className="px-4 py-3">
                    {t.tillgänglig
                      ? <span className="font-medium text-green-600">Ja</span>
                      : <span className="font-medium text-red-500">Nej</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{t.anteckning ?? '–'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setRaderaId(t.id)} className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">Ta bort</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalÖppen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalÖppen(false)} />
          <div className="relative w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-base font-semibold">Lägg till tillgänglighet</h2>
              <button onClick={() => setModalÖppen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-4 px-6 py-4">
              {fel && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{fel}</p>}
              <div className="flex overflow-hidden rounded-md border border-gray-200">
                {(['specifikt', 'återkommande'] as const).map(t => (
                  <button key={t} onClick={() => setTyp(t)}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${typ === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {t === 'specifikt' ? 'Specifikt datum' : 'Återkommande'}
                  </button>
                ))}
              </div>
              {typ === 'specifikt' ? (
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Datum</label>
                  <input type="date" value={form.datum} onChange={e => setForm({ ...form, datum: e.target.value })}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Veckodag</label>
                  <select value={form.veckodag} onChange={e => setForm({ ...form, veckodag: e.target.value })}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {VECKODAG_LABELS.slice(1, 6).map((dag, i) => (
                      <option key={i+1} value={i+1}>{dag}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {[['Från kl (valfritt)', 'tid_från'], ['Till kl (valfritt)', 'tid_till']].map(([label, key]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">{label}</label>
                    <input type="time" value={(form as any)[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="tillg" checked={form.tillgänglig}
                  onChange={e => setForm({ ...form, tillgänglig: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                <label htmlFor="tillg" className="text-sm text-gray-700">Jag är tillgänglig denna dag</label>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Anteckning</label>
                <input value={form.anteckning} onChange={e => setForm({ ...form, anteckning: e.target.value })}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setModalÖppen(false)} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Avbryt</button>
                <button onClick={spara} disabled={sparar} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {sparar ? 'Sparar…' : 'Spara'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {raderaId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRaderaId(null)} />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold">Ta bort tillgänglighet</h2>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRaderaId(null)} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Avbryt</button>
              <button onClick={async () => { await vikariApi.raderaTillgänglighet(raderaId); setTillg(prev => prev.filter(t => t.id !== raderaId)); setRaderaId(null); }}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Ta bort</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}