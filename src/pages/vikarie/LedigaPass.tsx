import { useEffect, useState } from 'react';
import { passApi, vikariApi, historikApi } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import type { Vikariepass, Vikarie } from '../../types';
import { PASS_STATUS_COLORS, PASS_STATUS_LABELS } from '../../types';

export default function LedigaPass() {
  const { användare } = useAuth();
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [minVikarie, setMinVikarie] = useState<Vikarie | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [bokningsModal, setBokningsModal] = useState<Vikariepass | null>(null);
  const [bokar, setBokar] = useState(false);
  const [fel, setFel] = useState('');
  const [bekräftelse, setBekräftelse] = useState('');

  useEffect(() => {
    async function ladda() {
      if (!användare) return;
      const vRes = await vikariApi.hämtaViaProfilId(användare.id);
      setMinVikarie(vRes.data as Vikarie | null);
      const pRes = await passApi.lista({ status: ['obokat', 'notifierat'] });
      setPass((pRes.data ?? []) as Vikariepass[]);
      setLaddar(false);
    }
    ladda();
  }, [användare]);

  async function bokaPass(p: Vikariepass) {
    if (!minVikarie) return;
    setBokar(true);
    setFel('');
    const { data, error } = await passApi.bokaPass(p.id, minVikarie.id);
    if (error || !data) {
      setFel('Passet kunde inte bokas – det kan redan ha tagits av någon annan.');
      setBokar(false);
      return;
    }
    await historikApi.skapa(p.id, 'vikarie_bokat', { vikarie_id: minVikarie.id });
    setPass(prev => prev.filter(x => x.id !== p.id));
    setBokningsModal(null);
    setBekräftelse(`Bokat: ${p.datum} ${p.tid_från.slice(0,5)}–${p.tid_till.slice(0,5)}`);
    setTimeout(() => setBekräftelse(''), 5000);
    setBokar(false);
  }

  if (laddar) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Lediga pass</h1>
        <p className="text-sm text-gray-500">Pass tillgängliga för bokning.</p>
      </div>

      {bekräftelse && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {bekräftelse}
        </div>
      )}
      {fel && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {fel}
        </div>
      )}
      {!minVikarie && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          Ditt vikarieprofil är inte konfigurerad. Kontakta administratören.
        </div>
      )}

      {pass.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 py-16">
          <p className="text-sm text-gray-500">Inga lediga pass för tillfället.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pass.map(p => (
            <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {new Date(p.datum).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  <p className="text-sm text-gray-600">
                    {p.tid_från.slice(0,5)}–{p.tid_till.slice(0,5)}
                  </p>
                </div>
                <span className={`shrink-0 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PASS_STATUS_COLORS[p.status]}`}>
                  {PASS_STATUS_LABELS[p.status]}
                </span>
              </div>

              <div className="mt-2 space-y-0.5">
                {p.personal && (
                  <p className="text-xs text-gray-500">
                    Ersätter: <span className="font-medium text-gray-700">{p.personal.namn}</span>
                    {p.personal.arbetslag && <> · {p.personal.arbetslag.namn}</>}
                  </p>
                )}
                {p.ämne && <p className="text-xs text-gray-500">Ämne: {p.ämne}</p>}
                {p.grupp && <p className="text-xs text-gray-500">Grupp: {p.grupp}</p>}
                {p.sal && <p className="text-xs text-gray-500">Sal: {p.sal}</p>}
              </div>

              <button
                disabled={!minVikarie}
                onClick={() => { setFel(''); setBokningsModal(p); }}
                className="mt-3 w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 active:bg-blue-800"
              >
                Boka pass
              </button>
            </div>
          ))}
        </div>
      )}

      {bokningsModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setBokningsModal(null)} />
          <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold">Bekräfta bokning</h2>
            <div className="mb-4 rounded-lg bg-gray-50 p-3 text-sm space-y-1">
              <p><span className="text-gray-500">Datum:</span> <strong>{bokningsModal.datum}</strong></p>
              <p><span className="text-gray-500">Tid:</span> <strong>{bokningsModal.tid_från.slice(0,5)}–{bokningsModal.tid_till.slice(0,5)}</strong></p>
              {bokningsModal.personal && (
                <p><span className="text-gray-500">Ersätter:</span> {bokningsModal.personal.namn}</p>
              )}
              {bokningsModal.ämne && (
                <p><span className="text-gray-500">Ämne:</span> {bokningsModal.ämne}</p>
              )}
            </div>
            {fel && (
              <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{fel}</p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setBokningsModal(null)}
                className="w-full sm:w-auto rounded-md border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Avbryt
              </button>
              <button
                onClick={() => bokaPass(bokningsModal)}
                disabled={bokar}
                className="w-full sm:w-auto rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {bokar ? 'Bokar…' : 'Bekräfta bokning'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}