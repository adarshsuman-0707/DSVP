import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import RouteSplash from './RouteSplash';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();

  if (loading) return <RouteSplash />;
  if (!user)   return <Navigate to="/login" replace />;
  // Temp-password session: nothing else is reachable until the password is changed.
  // (The API enforces this too; this just avoids a page of 403s.)
  if (user.MustChangePassword) return <Navigate to="/change-password" replace />;
  if (adminOnly && user.Role !== 'admin') return <Navigate to="/dashboard" replace />;

  return children;
}
