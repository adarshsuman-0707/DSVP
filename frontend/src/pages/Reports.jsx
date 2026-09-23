import { useAuth } from '../context/AuthContext';
import UserReportCenter from './UserReportCenter';
import AdminReportCenter from './AdminReportCenter';

/**
 * Single /reports route that branches on role: regular users get the
 * personal Report Center, admins get the richer Admin Report Center.
 */
export default function Reports() {
  const { user } = useAuth();
  return user?.Role === 'admin' ? <AdminReportCenter /> : <UserReportCenter />;
}
