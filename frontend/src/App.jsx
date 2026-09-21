import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Workspace from './pages/Workspace';
import Pricing from './pages/Pricing';
import Profile from './pages/Profile';
import ModuleCatalog from './components/ModuleCatalog/ModuleCatalog';
import AdminDashboard from './components/AdminDashboard/AdminDashboard';
import UserDetailPage from './components/AdminDashboard/UserDetailPage';
import PaymentHistory from './pages/PaymentHistory';
import SavedSnippets from './pages/SavedSnippets';
import ResetPasswordPage from './pages/ResetPasswordPage';
import Coins from './pages/Coins';
// import OverviewTab from './components/AdminDashboard/tabs/OverviewTab';

/* Redirect "/" based on auth state */
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : <Landing />;
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* public */}
          <Route path="/"          element={<RootRedirect />} />
          <Route path="/login"     element={<Login />} />
          <Route path="/register"  element={<Register />} />
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
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
