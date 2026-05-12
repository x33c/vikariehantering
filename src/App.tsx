import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth'; 
import { LaddaSida } from './components/ui';

// Layouts
import AdminLayout from './components/layout/AdminLayout';
import VikarieLayout from './components/layout/VikarieLayout';

// Auth
import Login from './pages/auth/Login';

// Admin pages
import Dashboard from './pages/admin/Dashboard';
import Arbetslag from './pages/admin/Arbetslag';
import Vikarier from './pages/admin/Vikarier';
import Franvaro from './pages/admin/Franvaro';
import Vikariepass from './pages/admin/Vikariepass';
import Import from './pages/admin/Import';
import Historik from './pages/admin/Historik';
import Utskick from './pages/admin/Utskick';
import Konton from './pages/admin/Konton';

// Vikarie pages
import LedigaPass from './pages/vikarie/LedigaPass';
import MinaPass from './pages/vikarie/MinaPass';
import Tillganglighet from './pages/vikarie/Tillganglighet';
import Profil from './pages/vikarie/Profil';

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { profil, laddar } = useAuth();
  if (laddar) return <LaddaSida />;
  if (!profil) return <Navigate to="/login" replace />;
  if (profil.roll !== 'admin') return <Navigate to="/vikarie" replace />;
  return <>{children}</>;
}

function VikarieGuard({ children }: { children: React.ReactNode }) {
  const { profil, laddar } = useAuth();
  if (laddar) return <LaddaSida />;
  if (!profil) return <Navigate to="/login" replace />;
  if (profil.roll !== 'vikarie') return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const { profil, laddar } = useAuth();
  if (laddar) return <LaddaSida />;
  if (!profil) return <Navigate to="/login" replace />;
  return <Navigate to={profil.roll === 'admin' ? '/admin' : '/vikarie'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />

          {/* Admin routes */}
          <Route
            path="/admin"
            element={
              <AdminGuard>
                <AdminLayout />
              </AdminGuard>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="arbetslag" element={<Arbetslag />} />
            <Route path="vikarier" element={<Vikarier />} />
            <Route path="franvaro" element={<Franvaro />} />
            <Route path="vikariepass" element={<Vikariepass />} />
            <Route path="import" element={<Import />} />
            <Route path="historik" element={<Historik />} />
            <Route path="konton" element={<Konton />} />
            <Route path="utskick" element={<Utskick />} />
          </Route>

          {/* Vikarie routes */}
          <Route
            path="/vikarie"
            element={
              <VikarieGuard>
                <VikarieLayout />
              </VikarieGuard>
            }
          >
            <Route index element={<LedigaPass />} />
            <Route path="mina-pass" element={<MinaPass />} />
            <Route path="tillganglighet" element={<Tillganglighet />} />
            <Route path="profil" element={<Profil />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
