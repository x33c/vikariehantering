import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import PushButton from '../PushButton';
import AdminNotiser from '../AdminNotiser';

const navItems = [
  { to: '/admin', label: 'Start', end: true },
  { to: '/admin/franvaro', label: 'Frånvaro' },
  { to: '/admin/vikariepass', label: 'Bemanning' },
  { to: '/admin/arbetslag', label: 'Personal' },
  { to: '/admin/vikarier', label: 'Vikarier' },
  { to: '/admin/import', label: 'Schema' },
  { to: '/admin/historik', label: 'Historik' },
];

function useDarkMode() {
  const [mörkt, setMörkt] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  function toggla() {
    const nytt = !mörkt;
    setMörkt(nytt);
    document.documentElement.classList.toggle('dark', nytt);
    localStorage.setItem('tema', nytt ? 'dark' : 'light');
  }

  return { mörkt, toggla };
}

export default function AdminLayout() {
  const { profil, loggaUt } = useAuth();
  const [menyÖppen, setMenyÖppen] = useState(false);
  const [bekraftaLoggaUt, setBekraftaLoggaUt] = useState(false);
  const { mörkt, toggla } = useDarkMode();

  return (
    <div className="flex h-[100dvh] w-full max-w-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      {menyÖppen && (
        <div className="fixed inset-0 z-20 bg-black/35 backdrop-blur-sm lg:hidden" onClick={() => setMenyÖppen(false)} />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r
          transform transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0
          ${menyÖppen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
      >
        <div className="px-5 pb-6 pt-6">
          <div className="flex items-center gap-4">
            <img
              src={mörkt ? "/sundbyberg-silver.png" : "/sundbyberg-halm.png"}
              alt=""
              className="h-16 w-16 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
                Vikarier
              </p>
              
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenyÖppen(false)}
              className="group flex items-center rounded-2xl border px-4 py-3 text-sm font-medium transition-all"
              style={({ isActive }) => ({
                background: isActive ? 'var(--nav-active)' : 'transparent',
                color: isActive ? 'var(--nav-active-text)' : 'var(--text-muted)',
                borderColor: isActive ? 'var(--nav-active-ring)' : 'transparent',
                boxShadow: isActive
                  ? `0 0 0 3px var(--nav-active-ring-soft), var(--nav-active-shadow)`
                  : 'none',
              })}
            >
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-4" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-4 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <p className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {profil?.namn ?? profil?.epost}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Administratör</p>
          </div>

          <div className="mb-3">
            <AdminNotiser placement="up" />
          </div>

          <div className="mb-3">
            <PushButton />
          </div>

          <div className="mb-3 flex items-center justify-between px-1">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{mörkt ? 'Mörkt läge' : 'Ljust läge'}</span>
            <button
              onClick={toggla}
              className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors"
              style={{ background: mörkt ? 'var(--accent)' : 'var(--toggle-bg)' }}
              aria-label="Växla tema"
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${mörkt ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <button
            onClick={() => setBekraftaLoggaUt(true)}
            className="w-full rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--text)' }}
          >
            Logga ut
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className="sticky top-0 z-10 flex h-16 shrink-0 items-center border-b px-3 backdrop-blur sm:px-4 lg:hidden"
          style={{ background: 'var(--bg-header)', borderColor: 'var(--border)' }}
        >
          <button onClick={() => setMenyÖppen(true)} className="rounded-xl border p-2" style={{ color: 'var(--text)', borderColor: 'var(--border)' }}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <span className="ml-3 min-w-0 truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>Vikariehantering</span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <AdminNotiser />
            <PushButton compact />
            <button
              onClick={toggla}
              className="rounded-xl border p-2"
              style={{ color: 'var(--text)', borderColor: 'var(--border)' }}
              aria-label="Växla tema"
              title="Växla tema"
            >
            {mörkt ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0-1.42-1.42M7.06 7.06 5.64 5.64" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
              </svg>
            )}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl overflow-x-hidden px-3 py-4 sm:px-8 sm:py-5 lg:px-10">
            <Outlet />
          </div>
        </main>
      </div>

      {bekraftaLoggaUt && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-2xl border p-4 shadow-xl" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Vill du logga ut?</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Du behöver logga in igen för att administrera pass.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBekraftaLoggaUt(false)}
                className="min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              >
                Avbryt
              </button>
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
      )}
    </div>
  );
}
