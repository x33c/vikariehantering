import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const navItems = [
  { to: '/admin', label: 'Översikt', end: true },
  { to: '/admin/arbetslag', label: 'Arbetslag & personal' },
  { to: '/admin/vikarier', label: 'Vikarier' },
  { to: '/admin/franvaro', label: 'Frånvaro' },
  { to: '/admin/vikariepass', label: 'Vikariepass' },
  { to: '/admin/import', label: 'Schemaimport' },
  { to: '/admin/historik', label: 'Historik' },
];

export default function AdminLayout() {
  const { profil, loggaUt } = useAuth();
  const [menyÖppen, setMenyÖppen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Overlay för mobil */}
      {menyÖppen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setMenyÖppen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-gray-200 bg-white
        transform transition-transform duration-200 ease-in-out
        lg:static lg:translate-x-0
        ${menyÖppen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex h-14 items-center justify-between border-b px-5">
          <span className="text-sm font-semibold text-gray-900">Vikariehantering</span>
          <button
            onClick={() => setMenyÖppen(false)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 lg:hidden"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenyÖppen(false)}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-3">
          <div className="mb-2 px-3 py-1">
            <p className="text-xs font-medium text-gray-900">{profil?.namn ?? profil?.epost}</p>
            <p className="text-xs text-gray-500">Administratör</p>
          </div>
          <button
            onClick={loggaUt}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100"
          >
            <button
  onClick={() => document.documentElement.classList.toggle('dark')}
  className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
>
<button
  onClick={() => {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }}
  className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
>
  Växla läge
</button>
            Logga ut
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar för mobil */}
        <header className="flex h-14 items-center border-b border-gray-200 bg-white px-4 lg:hidden">
          <button
            onClick={() => setMenyÖppen(true)}
            className="rounded-md p-2 text-gray-600 hover:bg-gray-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="ml-3 text-sm font-semibold text-gray-900">Vikariehantering</span>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}