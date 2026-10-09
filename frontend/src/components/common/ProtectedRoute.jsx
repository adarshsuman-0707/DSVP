import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import RouteSplash from './RouteSplash';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();

  if (loading) return <RouteSplash />;
  if (!user)   return <Navigate to="/login" replace />;
  if (adminOnly && user.Role !== 'admin') return <Navigate to="/dashboard" replace />;

  return children;
}
