import { Route, Routes } from 'react-router';
import { AdminLayout } from '../layouts/AdminLayout';
import { PublicLayout } from '../layouts/PublicLayout';
import { Dashboard } from '../pages/Dashboard';
import { Login } from '../pages/Login';
import { Carta } from '../pages/public/Carta';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/carta" element={<Carta />} />
      </Route>

      <Route path="/login" element={<Login />} />

      <Route element={<AdminLayout />}>
        <Route path="/" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}
