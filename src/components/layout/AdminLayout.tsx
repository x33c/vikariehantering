import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const navItems = [
  { to: '/admin', label: 'Start', end: true },
  { to: '/admin/franvaro', label: 'Frånvaro' },
  { to: '/admin/vikariepass', label: 'Bemanning' },
  { to: '/admin/utskick', label: 'Utskick' },
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
  const { mörkt, toggla } = useDarkMode();

  return (
    <div className="flex h-screen" style={{ background: 'var(--bg)' }}>
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
              className="group flex items-center rounded-2xl px-4 py-3 text-sm font-medium transition-all"
              style={({ isActive }) => ({
                background: isActive ? 'var(--nav-active)' : 'transparent',
                color: isActive ? 'var(--nav-active-text)' : 'var(--text-muted)',
                boxShadow: isActive ? 'var(--nav-active-shadow)' : 'none',
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
            onClick={loggaUt}
            className="w-full rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--text)' }}
          >
            Logga ut
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className="sticky top-0 z-10 flex h-16 items-center border-b px-4 backdrop-blur lg:hidden"
          style={{ background: 'var(--bg-header)', borderColor: 'var(--border)' }}
        >
          <button onClick={() => setMenyÖppen(true)} className="rounded-xl border p-2" style={{ color: 'var(--text)', borderColor: 'var(--border)' }}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <span className="ml-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>Vikariehantering</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-5 py-5 sm:px-8 lg:px-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
