import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function AdminLayout() {
  const { användare, loggaUt } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 hidden md:block">
        <div className="p-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Admin
        </div>
        <nav className="flex flex-col gap-1 px-2 text-sm">
          <Link to="/admin" className="rounded px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Dashboard</Link>
          <Link to="/admin/vikariepass" className="rounded px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Vikariepass</Link>
          <Link to="/admin/franvaro" className="rounded px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Frånvaro</Link>
          <Link to="/admin/arbetslag" className="rounded px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Arbetslag</Link>
          <Link to="/admin/vikarier" className="rounded px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Vikarier</Link>
          <Link to="/admin/historik" className="rounded px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Historik</Link>
        </nav>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        {/* Topbar */}
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:bg-gray-800 dark:border-gray-700">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            {användare?.email}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const html = document.documentElement;
                const isDark = html.classList.toggle('dark');
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
              }}
              className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              🌙
            </button>

            <button
              onClick={async () => {
                await loggaUt();
                navigate('/login');
              }}
              className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Logga ut
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```
