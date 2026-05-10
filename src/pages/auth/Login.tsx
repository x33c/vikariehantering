import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function Login() {
  const { loggaIn, profil } = useAuth();
  const navigate = useNavigate();
  const [epost, setEpost] = useState('');
  const [lösenord, setLösenord] = useState('');
  const [fel, setFel] = useState('');
  const [laddar, setLaddar] = useState(false);

  async function hanteraInloggning(e: React.FormEvent) {
    e.preventDefault();
    setFel('');
    setLaddar(true);
    const { error } = await loggaIn(epost, lösenord);
    setLaddar(false);
    if (error) { setFel('Felaktig e-postadress eller lösenord.'); return; }
  }

  if (profil) {
    navigate(profil.roll === 'admin' ? '/admin' : '/vikarie', { replace: true });
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">Logga in</h1>
        <p className="mb-6 text-sm text-gray-500">Vikariehanteringssystem</p>
        {fel && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{fel}</p>}
        <form onSubmit={hanteraInloggning} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">E-postadress</label>
            <input
              type="email"
              value={epost}
              onChange={(e) => setEpost(e.target.value)}
              placeholder="namn@skola.se"
              autoComplete="email"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Lösenord</label>
            <input
              type="password"
              value={lösenord}
              onChange={(e) => setLösenord(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={laddar}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {laddar ? 'Loggar in…' : 'Logga in'}
          </button>
        </form>
      </div>
    </div>
  );
}