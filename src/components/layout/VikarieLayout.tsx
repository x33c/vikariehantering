import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import PushButton from '../PushButton';

const navItems = [
  { to: '/vikarie', label: 'Pass', end: true },
  { to: '/vikarie/mina-pass', label: 'Mina pass' },
  { to: '/vikarie/tillganglighet', label: 'Tillgänglighet' },
  { to: '/vikarie/schema', label: 'Schema' },
  { to: '/vikarie/profil', label: 'Profil' },
  { to: '/vikarie/logga-ut', label: 'Logga ut' },
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
  const { profil } = useAuth();
  const location = useLocation();
  const [menyÖppen, setMenyÖppen] = useState(false);
  const [visaNotisLathund, setVisaNotisLathund] = useState(false);
  const { mörkt, toggla } = useDarkMode();

  const aktivSida = navItems.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
  );
  const sidtitel = aktivSida?.label ?? 'Pass';

  useEffect(() => {
    if (!profil?.id) return;
    const nyckel = `notis_lathund_visad_${profil.id}`;
    if (!localStorage.getItem(nyckel)) {
      setVisaNotisLathund(true);
    }
  }, [profil?.id]);

  function stängNotisLathund() {
    if (profil?.id) localStorage.setItem(`notis_lathund_visad_${profil.id}`, 'true');
    setVisaNotisLathund(false);
  }

  return (
    <div className="flex h-[100dvh] w-full max-w-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      {false && menyÖppen && (
        <div
          className="fixed inset-0 z-20 bg-black/35 backdrop-blur-sm lg:hidden"
          onClick={() => setMenyÖppen(false)}
        />
      )}

      <aside
        className={`
          hidden lg:static lg:flex lg:w-72 lg:flex-col lg:border-r
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
          <div className="mb-3">
            <PushButton />
          </div>
          <div className="mb-2 hidden items-center justify-between lg:flex">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{mörkt ? 'Mörkt läge' : 'Ljust läge'}</span>
            <button
              onClick={toggla}
              className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
              style={{ background: mörkt ? 'var(--blue)' : 'var(--border)' }}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${mörkt ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar mobil */}
        <header
          className="flex h-14 shrink-0 items-center border-b px-3 sm:px-4 lg:hidden"
          style={{ background: 'var(--bg-header)', borderColor: 'var(--border)' }}
        >
          <span className="min-w-0 truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>{sidtitel}</span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
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
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth pb-4 lg:pb-0">
          <Outlet />
        </main>
        <nav
          className="grid shrink-0 grid-cols-6 gap-1 border-t px-1.5 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] pt-1.5 lg:hidden"
          style={{ background: 'var(--bg-header)', borderColor: 'var(--border)' }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="flex min-h-12 items-center justify-center rounded-xl px-1.5 text-center text-[11px] font-semibold sm:text-xs"
              style={({ isActive }) => ({
                background: isActive ? 'var(--nav-active)' : 'transparent',
                color: isActive ? 'var(--nav-active-text)' : 'var(--text-muted)',
                boxShadow: isActive ? '0 0 0 2px var(--nav-active-ring-soft)' : 'none',
              })}
            >
              {item.label === 'Tillgänglighet' ? 'Tid' : item.label}
            </NavLink>
          ))}
        </nav>
      </div>


      {visaNotisLathund && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-2xl border p-5 shadow-xl" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
              Kom igång med notiser
            </h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              Aktivera notiser så får du nya pass och meddelanden utan att behöva uppdatera sidan.
            </p>

            <div className="mt-4 space-y-3 text-sm" style={{ color: 'var(--text)' }}>
              <div className="rounded-xl px-3 py-3" style={{ background: 'var(--bg)' }}>
                <p className="font-semibold">iPhone</p>
                <p className="mt-1" style={{ color: 'var(--text-muted)' }}>
                  Öppna sidan i Safari, välj Dela och Lägg till på hemskärmen. Öppna sedan appen från hemskärmen och tryck på Notiser.
                </p>
              </div>
              <div className="rounded-xl px-3 py-3" style={{ background: 'var(--bg)' }}>
                <p className="font-semibold">Android</p>
                <p className="mt-1" style={{ color: 'var(--text-muted)' }}>
                  Öppna sidan i Chrome, tryck på Notiser och tillåt aviseringar när mobilen frågar.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
              <PushButton />
            </div>

            <button
              type="button"
              onClick={stängNotisLathund}
              className="mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white"
              style={{ background: 'var(--blue)' }}
            >
              Jag förstår
            </button>
          </div>
        </div>
      )}

    </div>
  );
}