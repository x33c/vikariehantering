import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { LaddaSida } from '../../components/ui';

export default function NyttLosenord() {
  const { användare, laddar } = useAuth();
  const [losenord, setLosenord] = useState('');
  const [bekrafta, setBekrafta] = useState('');
  const [fel, setFel] = useState('');
  const [sparar, setSparar] = useState(false);
  const [klart, setKlart] = useState(false);

  async function spara(e: React.FormEvent) {
    e.preventDefault();
    if (sparar || klart || !användare) return;
    setFel('');

    if (losenord.length < 8) {
      setFel('Lösenordet måste vara minst 8 tecken.');
      return;
    }

    if (losenord !== bekrafta) {
      setFel('Lösenorden matchar inte.');
      return;
    }

    setSparar(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: losenord });
      if (error) {
        setFel(error.code === 'same_password' ? 'Välj ett annat lösenord än ditt nuvarande.' : 'Lösenordet kunde inte sparas. Länken kan ha gått ut eller lösenordet uppfyller inte kraven.');
        return;
      }
      setLosenord('');
      setBekrafta('');
      setKlart(true);
    } catch {
      setFel('Kunde inte bekräfta lösenordsbytet. Kontrollera anslutningen och försök logga in innan du försöker igen.');
    } finally {
      setSparar(false);
    }
  }

  if (laddar) return <LaddaSida />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">Skapa lösenord</h1>
        <p className="mb-6 text-sm text-gray-500">Välj ett lösenord för ditt konto.</p>

        {fel && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{fel}</p>}
        {klart && <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">Lösenordet är sparat.</p>}

        {!användare ? <p className="text-sm">Återställningslänken saknas eller är inte längre giltig. <Link to="/glomt-losenord" className="underline">Begär en ny länk</Link>.</p> : klart ? <Link to="/" className="text-blue-600 underline">Fortsätt till appen</Link> : <form onSubmit={spara} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Nytt lösenord</label>
            <input
              type="password"
              value={losenord}
              onChange={e => setLosenord(e.target.value)}
              autoComplete="new-password"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Bekräfta lösenord</label>
            <input
              type="password"
              value={bekrafta}
              onChange={e => setBekrafta(e.target.value)}
              autoComplete="new-password"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={sparar}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sparar ? 'Sparar...' : 'Spara lösenord'}
          </button>
        </form>}
      </div>
    </div>
  );
}
