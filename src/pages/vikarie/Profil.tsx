import { useEffect, useState } from 'react';
import { vikariApi } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import type { Vikarie } from '../../types';

export default function Profil() {
  const { användare } = useAuth();
  const [vikarie, setVikarie] = useState<Vikarie | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState('');
  const [sparat, setSparat] = useState(false);
  const [ämnenText, setÄmnenText] = useState('');
  const [stadierText, setStadierText] = useState('');

  useEffect(() => {
    async function ladda() {
      if (!användare) return;
      const res = await vikariApi.hämtaViaProfilId(användare.id);
      const v = res.data as Vikarie | null;
      setVikarie(v);
      if (v) {
        setÄmnenText((v.ämnen ?? []).join(', '));
        setStadierText((v.stadier ?? []).join(', '));
      }
      setLaddar(false);
    }
    ladda();
  }, [användare]);

  async function spara() {
    if (!vikarie) return;
    setSparar(true);
    setFel('');
    setSparat(false);
    const res = await vikariApi.uppdatera(vikarie.id, {
      namn: vikarie.namn,
      epost: vikarie.epost,
      telefon: vikarie.telefon,
      ämnen: ämnenText ? ämnenText.split(',').map(s => s.trim()).filter(Boolean) : [],
      stadier: stadierText ? stadierText.split(',').map(s => s.trim()).filter(Boolean) : [],
    });
    setSparar(false);
    if (res.error) { setFel(res.error.message); return; }
    setVikarie(res.data as Vikarie);
    setSparat(true);
    setTimeout(() => setSparat(false), 3000);
  }

  if (laddar) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );

  if (!vikarie) return (
    <div className="p-6">
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
        Ditt vikarieprofil är inte konfigurerad. Kontakta administratören.
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Profil & kontaktuppgifter</h1>
      {fel && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{fel}</p>}
      {sparat && <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">Uppgifterna är sparade.</p>}
      <div className="max-w-md space-y-4">
        {[
          { label: 'Namn', key: 'namn', type: 'text' },
          { label: 'E-postadress', key: 'epost', type: 'email' },
          { label: 'Telefonnummer', key: 'telefon', type: 'text' },
        ].map(({ label, key, type }) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{label}</label>
            <input
              type={type}
              value={(vikarie as any)[key] ?? ''}
              onChange={e => setVikarie({ ...vikarie, [key]: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Ämnen (kommaseparerat)</label>
          <input value={ämnenText} onChange={e => setÄmnenText(e.target.value)}
            placeholder="Matematik, Engelska"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Stadier (kommaseparerat)</label>
          <input value={stadierText} onChange={e => setStadierText(e.target.value)}
            placeholder="F-3, 4-6"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={spara} disabled={sparar}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {sparar ? 'Sparar…' : 'Spara uppgifter'}
        </button>
      </div>
    </div>
  );
}