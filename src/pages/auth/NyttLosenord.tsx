import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function NyttLosenord() {
  const navigate = useNavigate();
  const [losenord, setLosenord] = useState('');
  const [bekrafta, setBekrafta] = useState('');
  const [fel, setFel] = useState('');
  const [sparar, setSparar] = useState(false);
  const [klart, setKlart] = useState(false);

  async function spara(e: React.FormEvent) {
    e.preventDefault();
    setFel('');

    if (losenord.length < 6) {
      setFel('Lösenordet måste vara minst 6 tecken.');
      return;
    }

    if (losenord !== bekrafta) {
      setFel('Lösenorden matchar inte.');
      return;
    }

    setSparar(true);
    const { error } = await supabase.auth.updateUser({ password: losenord });
    setSparar(false);

    if (error) {
      setFel(error.message);
      return;
    }

    setKlart(true);
    setTimeout(() => navigate('/'), 1200);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">Skapa lösenord</h1>
        <p className="mb-6 text-sm text-gray-500">Välj ett lösenord för ditt konto.</p>

        {fel && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{fel}</p>}
        {klart && <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">Lösenordet är sparat.</p>}

        <form onSubmit={spara} className="space-y-4">
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
        </form>
      </div>
    </div>
  );
}
