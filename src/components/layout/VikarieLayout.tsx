import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const navItems = [
  { to: '/vikarie', label: 'Lediga pass', end: true },
  { to: '/vikarie/mina-pass', label: 'Mina bokade pass' },
  { to: '/vikarie/tillganglighet', label: 'Min tillgänglighet' },
  { to: '/vikarie/profil', label: 'Profil & kontakt' },
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

export default function VikarieLayout() {
  const { profil, loggaUt } = useAuth();
  const [menyÖppen, setMenyÖppen] = useState(false);
  const { mörkt, toggla } = useDarkMode();

  return (
    <div className="flex h-screen" style={{ background: 'var(--bg)' }}>
      {menyÖppen && (
        <div
          className="fixed inset-0 z-20 bg-black/35 backdrop-blur-sm lg:hidden"
          onClick={() => setMenyÖppen(false)}
        />
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
        {/* Logotyp */}
        <div className="px-5 pb-6 pt-6">
          <div className="flex items-center gap-4">
            <img
              src={mörkt ? '/sundbyberg-silver.png' : '/sundbyberg-halm.png'}
              alt=""
              className="h-16 w-16 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
                Lediga pass
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
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
                  ? '0 0 0 3px var(--nav-active-ring-soft), var(--nav-active-shadow)'
                  : 'none',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Botten */}
        <div className="border-t px-4 py-4" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-3">
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{profil?.namn ?? profil?.epost}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Vikarie</p>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{mörkt ? 'Mörkt läge' : 'Ljust läge'}</span>
            <button
              onClick={toggla}
              className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
              style={{ background: mörkt ? 'var(--blue)' : 'var(--border)' }}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${mörkt ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>
          <button
            onClick={loggaUt}
            className="w-full rounded-2xl border px-4 py-2.5 text-left text-sm font-medium transition-all"
            style={{ color: 'var(--text-muted)', borderColor: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            Logga ut
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar mobil */}
        <header
          className="flex h-14 items-center border-b px-4 lg:hidden"
          style={{ background: 'var(--bg-header)', borderColor: 'var(--border)' }}
        >
          <button onClick={() => setMenyÖppen(true)} className="rounded-md p-2" style={{ color: 'var(--text-muted)' }}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="ml-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>Lediga pass</span>
          <button
            onClick={toggla}
            className="ml-auto relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
            style={{ background: mörkt ? 'var(--blue)' : 'var(--border)' }}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${mörkt ? 'translate-x-4' : 'translate-x-1'}`} />
          </button>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}