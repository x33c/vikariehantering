import { useEffect, useState } from 'react';
import { vikariApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import type { Vikarie, NyVikarie } from '../../types';

async function anropaHanteraAnvandare(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('hantera-anvandare', { body: payload });
  return { data, error };
}

function VikarieModal({ öppen, onStäng, vikarie, onSparad }: {
  öppen: boolean; onStäng: () => void; vikarie?: Vikarie; onSparad: (v: Vikarie) => void;
}) {
  const [form, setForm] = useState<NyVikarie>({
    profil_id: null, namn: '', epost: '', telefon: '', ämnen: [], stadier: [], anteckning: '', aktiv: true,
  });
  const [laddar, setLaddar] = useState(false);
  const [fel, setFel] = useState('');

  useEffect(() => {
    if (öppen) {
      setForm({ profil_id: vikarie?.profil_id ?? null, namn: vikarie?.namn ?? '', epost: vikarie?.epost ?? '',
        telefon: vikarie?.telefon ?? '', ämnen: [], stadier: [], anteckning: vikarie?.anteckning ?? '', aktiv: true });
      setFel('');
    }
  }, [öppen, vikarie]);

  async function spara() {
    if (!form.namn.trim()) { setFel('Namn krävs.'); return; }
    setLaddar(true);
    const data = { ...form, ämnen: [], stadier: [] };
    const res = vikarie ? await vikariApi.uppdatera(vikarie.id, data) : await vikariApi.skapa(data);
    setLaddar(false);
    if (res.error) { setFel(res.error.message); return; }
    onSparad(res.data as Vikarie);
    onStäng();
  }

  if (!öppen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onStäng} />
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold">{vikarie ? 'Redigera vikarie' : 'Lägg till vikarie'}</h2>
          <button onClick={onStäng} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="space-y-4 px-6 py-4">
          {fel && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{fel}</p>}
          {[
            { label: 'Namn *', key: 'namn', type: 'text' },
            { label: 'E-post', key: 'epost', type: 'email' },
            { label: 'Telefon', key: 'telefon', type: 'text' },
          ].map(({ label, key, type }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{label}</label>
              <input type={type} value={(form as any)[key] ?? ''}
                onChange={e => setForm({ ...form, [key]: e.target.value })}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onStäng} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Avbryt</button>
            <button onClick={spara} disabled={laddar} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {laddar ? 'Sparar…' : 'Spara'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KontoModal({ öppen, onStäng, vikarie }: {
  öppen: boolean; onStäng: () => void; vikarie: Vikarie;
}) {
  const [epost, setEpost] = useState(vikarie.epost ?? '');
  const [laddar, setLaddar] = useState(false);
  const [fel, setFel] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    if (öppen) { setEpost(vikarie.epost ?? ''); setFel(''); setOk(''); }
  }, [öppen, vikarie]);

  async function skapaKonto() {
    if (!epost) { setFel('E-post krävs.'); return; }
    setLaddar(true); setFel('');
    const { data, error } = await anropaHanteraAnvandare({
      åtgärd: 'skapa', epost, namn: vikarie.namn, vikarie_id: vikarie.id,
    });
    setLaddar(false);
    if (error || data?.error) { setFel(error?.message ?? data?.error ?? 'Kunde inte skapa konto.'); return; }
    setOk('Konto skapat. Skicka lösenordslänken till vikarien om inget mejl går ut automatiskt.');
  }

  async function återställLösenord() {
    if (!vikarie.epost) { setFel('Vikarie saknar e-post.'); return; }
    setLaddar(true); setFel('');
    const { data, error } = await anropaHanteraAnvandare({
      åtgärd: 'återställ_lösenord', epost: vikarie.epost,
    });
    setLaddar(false);
    if (error || data?.error) { setFel(error?.message ?? data?.error ?? 'Misslyckades.'); return; }
    setOk('Återställningslänk skickad till ' + vikarie.epost);
  }

  if (!öppen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onStäng} />
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold">Kontoinställningar – {vikarie.namn}</h2>
          <button onClick={onStäng} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="space-y-4 px-6 py-4">
          {fel && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{fel}</p>}
          {ok && <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{ok}</p>}

          {!vikarie.profil_id ? (
            <>
              <p className="text-sm text-gray-600">Vikarien har inget inloggningskonto ännu. Skapa kontot med e-post, så sätter vikarien lösenordet själv via återställningslänk.</p>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">E-post</label>
                <input type="email" value={epost} onChange={e => setEpost(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onStäng} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Avbryt</button>
                <button onClick={skapaKonto} disabled={laddar}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {laddar ? 'Skapar…' : 'Skapa konto och lösenordslänk'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">Kontot är aktivt. Du kan skicka en återställningslänk till vikariets e-post.</p>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onStäng} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Stäng</button>
                <button onClick={återställLösenord} disabled={laddar}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {laddar ? 'Skickar…' : 'Skicka återställningslänk'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Vikarier() {
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [modal, setModal] = useState<{ öppen: boolean; rad?: Vikarie }>({ öppen: false });
  const [kontoModal, setKontoModal] = useState<{ öppen: boolean; rad?: Vikarie }>({ öppen: false });
  const [raderaId, setRaderaId] = useState<string | null>(null);
  const [sök, setSök] = useState('');

  useEffect(() => {
    vikariApi.lista().then(res => { setVikarier((res.data ?? []) as Vikarie[]); setLaddar(false); });
  }, []);

  const filtrerade = sök
    ? vikarier.filter(v => v.namn.toLowerCase().includes(sök.toLowerCase()) || v.epost?.toLowerCase().includes(sök.toLowerCase()))
    : vikarier;

  if (laddar) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Vikarier</h1>
        <button onClick={() => setModal({ öppen: true })}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + Lägg till vikarie
        </button>
      </div>
      <input type="search" placeholder="Sök vikarie…" value={sök} onChange={e => setSök(e.target.value)}
        className="mb-4 w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      {filtrerade.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 py-16">
          <p className="text-sm text-gray-500">Inga vikarier registrerade.</p>
          <button onClick={() => setModal({ öppen: true })}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">Lägg till vikarie</button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500">
<th className="px-4 py-2.5 text-left font-medium">Namn</th>
              <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">E-post</th>
              <th className="px-4 py-2.5 text-left font-medium hidden md:table-cell">Telefon</th>
              <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">Konto</th>
              <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrerade.map(v => (
                <tr key={v.id} className="hover:bg-gray-50">
<td className="px-4 py-3 font-medium text-gray-900">{v.namn}</td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{v.epost ?? '–'}</td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{v.telefon ?? '–'}</td>
                  <td className="px-4 py-3">
                    {v.profil_id
                      ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Aktivt konto</span>
                      : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inget konto</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setKontoModal({ öppen: true, rad: v })}
                        className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">Konto</button>
                      <button onClick={() => setModal({ öppen: true, rad: v })}
                        className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">Redigera</button>
                      <button onClick={() => setRaderaId(v.id)}
                        className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">Ta bort</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <VikarieModal öppen={modal.öppen} onStäng={() => setModal({ öppen: false })} vikarie={modal.rad}
        onSparad={v => { setVikarier(prev => modal.rad ? prev.map(x => x.id === v.id ? v : x) : [...prev, v]); setModal({ öppen: false }); }} />

      {kontoModal.öppen && kontoModal.rad && (
        <KontoModal öppen={kontoModal.öppen} onStäng={() => setKontoModal({ öppen: false })} vikarie={kontoModal.rad} />
      )}

      {raderaId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRaderaId(null)} />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-base font-semibold">Ta bort vikarie</h2>
            <p className="mb-6 text-sm text-gray-600">Bekräfta att du vill ta bort vikarie. Bokade pass påverkas inte.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRaderaId(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Avbryt</button>
              <button onClick={async () => { await vikariApi.radera(raderaId); setVikarier(prev => prev.filter(v => v.id !== raderaId)); setRaderaId(null); }}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Ta bort</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}