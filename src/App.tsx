import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth'; 
import { LaddaSida } from './components/ui';

// Layouts
import AdminLayout from './components/layout/AdminLayout';
import VikarieLayout from './components/layout/VikarieLayout';

// Auth
import BytLosenord from './pages/auth/BytLosenord';
import Login from './pages/auth/Login';
import NyttLosenord from './pages/auth/NyttLosenord';
import GlomtLosenord from './pages/auth/GlomtLosenord';

// Admin pages
const Register = lazy(() => import('./pages/admin/Register'));
const Arbetslag = lazy(() => import('./pages/admin/Arbetslag'));
const Vikarier = lazy(() => import('./pages/admin/Vikarier'));
const Franvaro = lazy(() => import('./pages/admin/Franvaro'));
const Vikariepass = lazy(() => import('./pages/admin/Vikariepass'));
const Import = lazy(() => import('./pages/admin/Import'));
const Historik = lazy(() => import('./pages/admin/Historik'));
const Utskick = lazy(() => import('./pages/admin/Utskick'));
const Export = lazy(() => import('./pages/admin/Export'));
const Datastadning = lazy(() => import('./pages/admin/Datastadning'));
const Konton = lazy(() => import('./pages/admin/Konton'));
const Notiser = lazy(() => import('./pages/admin/Notiser'));
const BetaBemanning = lazy(() => import('./pages/admin/beta/BetaAdmin').then(m => ({ default: m.BetaBemanning })));
const BetaFranvaro = lazy(() => import('./pages/admin/beta/BetaAdmin').then(m => ({ default: m.BetaFranvaro })));
const BetaStart = lazy(() => import('./pages/admin/beta/BetaAdmin').then(m => ({ default: m.BetaStart })));
const BetaUtskick = lazy(() => import('./pages/admin/beta/BetaAdmin').then(m => ({ default: m.BetaUtskick })));

// Vikarie pages
import LedigaPass from './pages/vikarie/LedigaPass';
import MinaPass from './pages/vikarie/MinaPass';
import Tillganglighet from './pages/vikarie/Tillganglighet';
import Profil from './pages/vikarie/Profil';
import LoggaUt from './pages/vikarie/LoggaUt';
import Schema from './pages/vikarie/Schema';
import VikarieNotiser from './pages/vikarie/Notiser';

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { profil, laddar } = useAuth();
  if (laddar) return <LaddaSida />;
  if (!profil) return <Navigate to="/login" replace />;
  if (profil.maste_byta_losenord) return <Navigate to="/byt-losenord" replace />;
  if (profil.roll !== 'admin') return <Navigate to="/vikarie" replace />;
  return <>{children}</>;
}

function VikarieGuard({ children }: { children: React.ReactNode }) {
  const { profil, laddar } = useAuth();
  if (laddar) return <LaddaSida />;
  if (!profil) return <Navigate to="/login" replace />;
  if (profil.maste_byta_losenord) return <Navigate to="/byt-losenord" replace />;
  if (profil.roll !== 'vikarie') return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const { profil, laddar } = useAuth();
  if (laddar) return <LaddaSida />;
  if (!profil) return <Navigate to="/login" replace />;
  if (profil.maste_byta_losenord) return <Navigate to="/byt-losenord" replace />;
  return <Navigate to={profil.roll === 'admin' ? '/admin' : '/vikarie'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
        <Route path="/byt-losenord" element={<BytLosenord />} />
          <Route path="/nytt-losenord" element={<NyttLosenord />} />
          <Route path="/glomt-losenord" element={<GlomtLosenord />} />

          {/* Admin routes */}
          <Route
            path="/admin"
            element={
              <AdminGuard>
                <AdminLayout />
              </AdminGuard>
            }
          >
            <Route index element={<Navigate to="/admin/vikariepass" replace />} />
            <Route path="register" element={<Register />}>
              <Route index element={<Navigate to="/admin/register/vikarier" replace />} />
              <Route path="vikarier" element={<Vikarier />} />
              <Route path="personal" element={<Arbetslag />} />
              <Route path="konton" element={<Konton />} />
            </Route>
            <Route path="arbetslag" element={<Navigate to="/admin/register/personal" replace />} />
            <Route path="vikarier" element={<Navigate to="/admin/register/vikarier" replace />} />
            <Route path="franvaro" element={<Franvaro />} />
            <Route path="vikariepass" element={<Vikariepass />} />
            <Route path="import" element={<Import />} />
            <Route path="historik" element={<Historik />} />
            <Route path="konton" element={<Navigate to="/admin/register/konton" replace />} />
            <Route path="utskick" element={<Utskick />} />
            <Route path="export" element={<Export />} />
            <Route path="datastadning" element={<Datastadning />} />
            <Route path="notiser" element={<Notiser />} />
            <Route path="beta" element={<Navigate to="/admin/beta/start" replace />} />
            <Route path="beta/start" element={<BetaStart />} />
            <Route path="beta/franvaro" element={<BetaFranvaro />} />
            <Route path="beta/bemanning" element={<BetaBemanning />} />
            <Route path="beta/utskick" element={<BetaUtskick />} />
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
            <Route path="schema" element={<Schema />} />
            <Route path="notiser" element={<VikarieNotiser />} />
            <Route path="profil" element={<Profil />} />
            <Route path="logga-ut" element={<LoggaUt />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
