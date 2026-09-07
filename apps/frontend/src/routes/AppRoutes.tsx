import { Route, Routes } from 'react-router';
import { AdminLayout } from '../layouts/AdminLayout';
import { PublicLayout } from '../layouts/PublicLayout';
import { Dashboard } from '../pages/Dashboard';
import { Login } from '../pages/Login';
import { Usuarios } from '../pages/Usuarios';
import { Personal } from '../pages/Personal';
import { Roles } from '../pages/Roles';
import { Empresa } from '../pages/Empresa';
import { CambiarPassword } from '../pages/CambiarPassword';
import { Carta } from '../pages/public/Carta';
import { ProtectedRoute } from './ProtectedRoute';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/carta" element={<Carta />} />
      </Route>

      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="/personal" element={<Personal />} />
          <Route path="/roles" element={<Roles />} />
          <Route path="/empresa" element={<Empresa />} />
          <Route path="/cambiar-password" element={<CambiarPassword />} />
        </Route>
      </Route>
    </Routes>
  );
}
