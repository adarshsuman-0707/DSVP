import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import RouteSplash from './components/common/RouteSplash';
import Landing from './pages/Landing';
const LegalPage = lazy(() => import('./pages/LegalPage'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Workspace = lazy(() => import('./pages/Workspace'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Profile = lazy(() => import('./pages/Profile'));
const ModuleCatalog = lazy(() => import('./components/ModuleCatalog/ModuleCatalog'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard/AdminDashboard'));
const UserDetailPage = lazy(() => import('./components/AdminDashboard/UserDetailPage'));
const PaymentHistory = lazy(() => import('./pages/PaymentHistory'));
const SavedSnippets = lazy(() => import('./pages/SavedSnippets'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const Coins = lazy(() => import('./pages/Coins'));
const Reports = lazy(() => import('./pages/Reports'));
// import OverviewTab from './components/AdminDashboard/tabs/OverviewTab';

/* Redirect "/" based on auth state */
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <RouteSplash />;
  return user ? <Navigate to="/dashboard" replace /> : <Landing />;
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteSplash />}>
        <Routes>
          {/* public */}
          <Route path="/"          element={<RootRedirect />} />
          <Route path="/login"     element={<Login />} />
          <Route path="/register"  element={<Register />} />
          <Route path="/privacy" element={<LegalPage doc="privacy" />} />
          <Route path="/terms"   element={<LegalPage doc="terms" />} />
          <Route path="/cookies" element={<LegalPage doc="cookies" />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
       {/* <Route path="/over"  element={<OverviewTab />} /> */}
          {/* authenticated */}
          <Route path="/dashboard" element={
            <ProtectedRoute><ModuleCatalog /></ProtectedRoute>
          } />
          <Route path="/workspace" element={
            <ProtectedRoute><Workspace /></ProtectedRoute>
          } />
          <Route path="/pricing" element={
            <ProtectedRoute><Pricing /></ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute><Profile /></ProtectedRoute>
          } />
          <Route path="/payments" element={
            <ProtectedRoute><PaymentHistory /></ProtectedRoute>
          } />
          <Route path="/snippets" element={
            <ProtectedRoute><SavedSnippets /></ProtectedRoute>
          } />
          <Route path="/coins" element={
            <ProtectedRoute><Coins /></ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute><Reports /></ProtectedRoute>
          } />

          {/* admin only */}
          <Route path="/admin" element={
            <ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>
          } />
          <Route path="/admin/users/:id" element={
            <ProtectedRoute adminOnly><UserDetailPage /></ProtectedRoute>
          } />

          {/* catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
