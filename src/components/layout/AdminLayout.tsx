import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const navItems = [
  { to: '/admin', label: 'Översikt', end: true },
  { to: '/admin/arbetslag', label: 'Personal' },
  { to: '/admin/vikarier', label: 'Vikarier' },
  { to: '/admin/franvaro', label: 'Frånvaro' },
  { to: '/admin/vikariepass', label: 'Vikariepass' },
  { to: '/admin/import', label: 'Schemaimport' },
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
          fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r
          transform transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0
          ${menyÖppen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{ background: 'var(--bg-sidebar)', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <div>
            <p className="text-sm font-semibold tracking-wide text-white">Vikariehantering</p>
            <p className="text-xs text-white/45">Admin</p>
          </div>
          <button onClick={() => setMenyÖppen(false)} className="rounded-md p-2 text-white/60 hover:bg-white/10 lg:hidden">
            ×
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenyÖppen(false)}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white text-neutral-950 shadow-sm'
                    : 'text-white/62 hover:bg-white/8 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="mb-3 rounded-lg bg-white/[0.06] px-3 py-2">
            <p className="truncate text-xs font-medium text-white">{profil?.namn ?? profil?.epost}</p>
            <p className="text-xs text-white/45">Administratör</p>
          </div>

          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs text-white/50">{mörkt ? 'Mörkt läge' : 'Ljust läge'}</span>
            <button
              onClick={toggla}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{ background: mörkt ? 'var(--accent)' : 'rgba(255,255,255,0.18)' }}
              aria-label="Växla tema"
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${mörkt ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <button
            onClick={loggaUt}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-white/56 transition-colors hover:bg-white/8 hover:text-white"
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
          <button onClick={() => setMenyÖppen(true)} className="rounded-lg border p-2" style={{ color: 'var(--text)', borderColor: 'var(--border)' }}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <span className="ml-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>Vikariehantering</span>
          <button
            onClick={toggla}
            className="ml-auto relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
            style={{ background: mörkt ? 'var(--accent)' : 'var(--border)' }}
            aria-label="Växla tema"
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${mörkt ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
