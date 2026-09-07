import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui/Spinner';

export function ProtectedRoute() {
  const { usuario, cargando } = useAuth();

  if (cargando) {
    return <Spinner />;
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
