import { Route, Routes } from 'react-router';
import { AdminLayout } from '../layouts/AdminLayout';
import { PublicLayout } from '../layouts/PublicLayout';
import { Dashboard } from '../pages/Dashboard';
import { Login } from '../pages/Login';
import { Usuarios } from '../pages/Usuarios';
import { Personal } from '../pages/Personal';
import { Roles } from '../pages/Roles';
import { Categorias } from '../pages/Categorias';
import { Marcas } from '../pages/Marcas';
import { Productos } from '../pages/Productos';
import { Salones } from '../pages/Salones';
import { Mesas } from '../pages/Mesas';
import { Clientes } from '../pages/Clientes';
import { Reservas } from '../pages/Reservas';
import { Pedidos } from '../pages/Pedidos';
import { PedidoDetalle } from '../pages/PedidoDetalle';
import { Cocina } from '../pages/Cocina';
import { Ventas } from '../pages/Ventas';
import { Caja } from '../pages/Caja';
import { Insumos } from '../pages/Insumos';
import { Almacenes } from '../pages/Almacenes';
import { Inventario } from '../pages/Inventario';
import { Proveedores } from '../pages/Proveedores';
import { Compras } from '../pages/Compras';
import { Reportes } from '../pages/Reportes';
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
          <Route path="/categorias" element={<Categorias />} />
          <Route path="/marcas" element={<Marcas />} />
          <Route path="/productos" element={<Productos />} />
          <Route path="/salones" element={<Salones />} />
          <Route path="/mesas" element={<Mesas />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/reservas" element={<Reservas />} />
          <Route path="/pedidos" element={<Pedidos />} />
          <Route path="/pedidos/:id" element={<PedidoDetalle />} />
          <Route path="/cocina" element={<Cocina />} />
          <Route path="/ventas" element={<Ventas />} />
          <Route path="/caja" element={<Caja />} />
          <Route path="/insumos" element={<Insumos />} />
          <Route path="/almacenes" element={<Almacenes />} />
          <Route path="/inventario" element={<Inventario />} />
          <Route path="/proveedores" element={<Proveedores />} />
          <Route path="/compras" element={<Compras />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/empresa" element={<Empresa />} />
          <Route path="/cambiar-password" element={<CambiarPassword />} />
        </Route>
      </Route>
    </Routes>
  );
}
