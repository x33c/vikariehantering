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

  return (
    <div className="flex h-screen bg-white text-black dark:bg-black dark:text-white">
      <aside className="flex w-60 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex h-14 items-center border-b border-gray-200 px-5 dark:border-gray-700">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Vikariehantering
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-3 dark:border-gray-700">
          <div className="mb-2 px-3 py-1">
            <p className="text-xs font-medium text-gray-900 dark:text-gray-100">
              {profil?.namn ?? profil?.epost}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Administratör
            </p>
          </div>

          <button
            onClick={() => {
              const html = document.documentElement;
              const isDark = html.classList.toggle('dark');
              localStorage.setItem('theme', isDark ? 'dark' : 'light');
            }}
            className="mb-1 w-full rounded-md px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Växla läge
          </button>

          <button
            onClick={loggaUt}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Logga ut
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-white text-black dark:bg-black dark:text-white">
        <Outlet />
      </main>
    </div>
  );
}