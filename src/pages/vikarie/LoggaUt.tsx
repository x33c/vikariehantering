import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function LoggaUt() {
  const { loggaUt } = useAuth();

  return (
    <div className="p-3 sm:p-6">
      <div className="mx-auto max-w-md rounded-2xl border p-5 shadow-sm" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
          Logga ut?
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          Du behöver logga in igen för att se pass, förfrågningar och notiser.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <NavLink
            to="/vikarie"
            className="flex min-h-11 items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            Avbryt
          </NavLink>
          <button
            type="button"
            onClick={loggaUt}
            className="min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: 'var(--danger)' }}
          >
            Logga ut
          </button>
        </div>
      </div>
    </div>
  );
}
