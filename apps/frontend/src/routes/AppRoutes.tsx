import { Route, Routes } from 'react-router';
import { AdminLayout } from '../layouts/AdminLayout';
import { ProveedorLayout } from '../layouts/ProveedorLayout';
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
import { Talonarios } from '../pages/Talonarios';
import { CuentasPorCobrar } from '../pages/CuentasPorCobrar';
import { Caja } from '../pages/Caja';
import { Insumos } from '../pages/Insumos';
import { Almacenes } from '../pages/Almacenes';
import { Inventario } from '../pages/Inventario';
import { Proveedores } from '../pages/Proveedores';
import { Compras } from '../pages/Compras';
import { Reportes } from '../pages/Reportes';
import { Costos } from '../pages/Costos';
import { Auditoria } from '../pages/Auditoria';
import { Reclamaciones } from '../pages/Reclamaciones';
import { Turnos } from '../pages/Turnos';
import { Propinas } from '../pages/Propinas';
import { Fidelizacion } from '../pages/Fidelizacion';
import { TicketVenta } from '../pages/TicketVenta';
import { TicketComanda } from '../pages/TicketComanda';
import { Empresa } from '../pages/Empresa';
import { CambiarPassword } from '../pages/CambiarPassword';
import { Carta } from '../pages/public/Carta';
import { LibroReclamaciones } from '../pages/public/LibroReclamaciones';
import { RegistroDemo } from '../pages/public/RegistroDemo';
import { Precios } from '../pages/public/Precios';
import { Plataforma } from '../pages/Plataforma';
import { Configuracion } from '../pages/Configuracion';
import { FacturacionElectronica } from '../pages/FacturacionElectronica';
import { GuiasRemision } from '../pages/GuiasRemision';
import { ProtectedRoute } from './ProtectedRoute';

export function AppRoutes() {
  return (
    <Routes>
      {/* La carta lleva el slug del restaurante: con varias empresas en el sistema, `/carta`
          a secas ya no identifica a ninguna. */}
      <Route element={<PublicLayout />}>
        <Route path="/carta/:slug" element={<Carta />} />
        <Route path="/libro-reclamaciones/:slug" element={<LibroReclamaciones />} />
      </Route>

      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<RegistroDemo />} />
      <Route path="/precios" element={<Precios />} />

      <Route element={<ProtectedRoute />}>
        {/* Sin ningún layout: son documentos para imprimir, no pantallas del panel — el
            sidebar/navbar no debe aparecer ni en pantalla ni, sobre todo, en el papel. */}
        <Route path="/imprimir/venta/:id" element={<TicketVenta />} />
        <Route path="/imprimir/comanda/:id" element={<TicketComanda />} />

        {/* Fuera del `AdminLayout`: el panel de proveedor mira todas las empresas del sistema,
            no la propia, así que no comparte el sidebar operativo del restaurante. */}
        <Route element={<ProveedorLayout />}>
          <Route path="/plataforma" element={<Plataforma />} />
        </Route>

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
          <Route path="/talonarios" element={<Talonarios />} />
          <Route path="/cuentas-por-cobrar" element={<CuentasPorCobrar />} />
          <Route path="/caja" element={<Caja />} />
          <Route path="/insumos" element={<Insumos />} />
          <Route path="/almacenes" element={<Almacenes />} />
          <Route path="/inventario" element={<Inventario />} />
          <Route path="/proveedores" element={<Proveedores />} />
          <Route path="/compras" element={<Compras />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/costos" element={<Costos />} />
          <Route path="/configuracion" element={<Configuracion />} />
          <Route path="/facturacion-electronica" element={<FacturacionElectronica />} />
          <Route path="/guias-remision" element={<GuiasRemision />} />
          <Route path="/auditoria" element={<Auditoria />} />
          <Route path="/reclamaciones" element={<Reclamaciones />} />
          <Route path="/turnos" element={<Turnos />} />
          <Route path="/propinas" element={<Propinas />} />
          <Route path="/fidelizacion" element={<Fidelizacion />} />
          <Route path="/empresa" element={<Empresa />} />
          <Route path="/cambiar-password" element={<CambiarPassword />} />
        </Route>
      </Route>
    </Routes>
  );
}
