import { useQuery } from '@tanstack/react-query';
import {
  Award,
  Building2,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  Contact,
  DoorOpen,
  ShieldCheck,
  Tags,
  UserCircle2,
  Users,
  Utensils,
  UtensilsCrossed,
} from 'lucide-react';
import * as usuariosService from '../services/usuarios.service';
import * as personalService from '../services/personal.service';
import * as rolesService from '../services/roles.service';
import * as empresaService from '../services/empresa.service';
import * as categoriasService from '../services/categorias.service';
import * as marcasService from '../services/marcas.service';
import * as productosService from '../services/productos.service';
import * as salonesService from '../services/salones.service';
import * as mesasService from '../services/mesas.service';
import * as clientesService from '../services/clientes.service';
import * as reservasService from '../services/reservas.service';
import * as pedidosService from '../services/pedidos.service';
import { useAuth } from '../context/AuthContext';
import { StatCard } from '../components/ui/StatCard';
import { formatearFechaLarga } from '../utils/formato';

export function Dashboard() {
  const { usuario } = useAuth();

  const usuariosQuery = useQuery({
    queryKey: ['usuarios'],
    queryFn: usuariosService.listarUsuarios,
  });
  const personalQuery = useQuery({
    queryKey: ['personal'],
    queryFn: personalService.listarPersonal,
  });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rolesService.listarRoles });
  const empresasQuery = useQuery({
    queryKey: ['empresas'],
    queryFn: empresaService.listarEmpresas,
  });
  const categoriasQuery = useQuery({
    queryKey: ['categorias'],
    queryFn: categoriasService.listarCategorias,
  });
  const marcasQuery = useQuery({ queryKey: ['marcas'], queryFn: marcasService.listarMarcas });
  const productosQuery = useQuery({
    queryKey: ['productos'],
    queryFn: productosService.listarProductos,
  });
  const salonesQuery = useQuery({ queryKey: ['salones'], queryFn: salonesService.listarSalones });
  const mesasQuery = useQuery({ queryKey: ['mesas'], queryFn: mesasService.listarMesas });
  const clientesQuery = useQuery({
    queryKey: ['clientes'],
    queryFn: clientesService.listarClientes,
  });
  const reservasQuery = useQuery({
    queryKey: ['reservas'],
    queryFn: reservasService.listarReservas,
  });
  const pedidosQuery = useQuery({
    queryKey: ['pedidos'],
    queryFn: pedidosService.listarPedidos,
  });

  const hoy = new Date();
  const pedidosAbiertos = (pedidosQuery.data ?? []).filter((p) => p.estado === 'abierto');
  const reservas = reservasQuery.data ?? [];
  const reservasHoy = reservas.filter((r) => {
    const fecha = new Date(r.fechaHora);
    return (
      fecha.getFullYear() === hoy.getFullYear() &&
      fecha.getMonth() === hoy.getMonth() &&
      fecha.getDate() === hoy.getDate()
    );
  });
  const reservasPendientes = reservas.filter((r) => r.estado === 'pendiente');
  const mesasActivas = (mesasQuery.data ?? []).filter((m) => m.activo);
  const clientesActivos = (clientesQuery.data ?? []).filter((c) => c.activo);

  const resumenHoy = [
    {
      etiqueta: 'Pedidos abiertos',
      valor: pedidosAbiertos.length,
      icono: ClipboardList,
      tono: 'naranja' as const,
      cargando: pedidosQuery.isLoading,
      ruta: '/pedidos',
    },
    {
      etiqueta: 'Reservas de hoy',
      valor: reservasHoy.length,
      icono: CalendarClock,
      tono: 'azul' as const,
      cargando: reservasQuery.isLoading,
      ruta: '/reservas',
    },
    {
      etiqueta: 'Reservas pendientes',
      valor: reservasPendientes.length,
      icono: CalendarCheck,
      tono: 'ambar' as const,
      cargando: reservasQuery.isLoading,
      ruta: '/reservas',
    },
    {
      etiqueta: 'Mesas activas',
      valor: mesasActivas.length,
      icono: Utensils,
      tono: 'esmeralda' as const,
      cargando: mesasQuery.isLoading,
      ruta: '/mesas',
    },
    {
      etiqueta: 'Clientes activos',
      valor: clientesActivos.length,
      icono: Contact,
      tono: 'violeta' as const,
      cargando: clientesQuery.isLoading,
      ruta: '/clientes',
    },
  ];

  const secciones = [
    {
      titulo: 'Carta',
      tarjetas: [
        {
          etiqueta: 'Categorías',
          ruta: '/categorias',
          icono: Tags,
          query: categoriasQuery,
        },
        { etiqueta: 'Marcas', ruta: '/marcas', icono: Award, query: marcasQuery },
        {
          etiqueta: 'Productos',
          ruta: '/productos',
          icono: UtensilsCrossed,
          query: productosQuery,
        },
      ],
    },
    {
      titulo: 'Local',
      tarjetas: [
        { etiqueta: 'Salones', ruta: '/salones', icono: DoorOpen, query: salonesQuery },
        { etiqueta: 'Mesas', ruta: '/mesas', icono: Utensils, query: mesasQuery },
      ],
    },
    {
      titulo: 'Clientes',
      tarjetas: [
        { etiqueta: 'Clientes', ruta: '/clientes', icono: Contact, query: clientesQuery },
        { etiqueta: 'Reservas', ruta: '/reservas', icono: CalendarCheck, query: reservasQuery },
      ],
    },
    {
      titulo: 'Administración',
      tarjetas: [
        { etiqueta: 'Usuarios', ruta: '/usuarios', icono: Users, query: usuariosQuery },
        { etiqueta: 'Personal', ruta: '/personal', icono: UserCircle2, query: personalQuery },
        { etiqueta: 'Roles', ruta: '/roles', icono: ShieldCheck, query: rolesQuery },
      ],
    },
    {
      titulo: 'Empresa',
      tarjetas: [
        { etiqueta: 'Empresas', ruta: '/empresa', icono: Building2, query: empresasQuery },
      ],
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Hola, {usuario?.personal.nombres} 👋</h1>
          <p className="mt-1 text-sm text-zinc-500">Esto es lo que está pasando hoy.</p>
        </div>
        <p className="text-sm font-medium text-zinc-500">{formatearFechaLarga(hoy)}</p>
      </div>

      <section className="mt-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {resumenHoy.map((tarjeta) => (
            <StatCard
              key={tarjeta.etiqueta}
              etiqueta={tarjeta.etiqueta}
              ruta={tarjeta.ruta}
              valor={tarjeta.valor}
              cargando={tarjeta.cargando}
              icono={tarjeta.icono}
              tono={tarjeta.tono}
            />
          ))}
        </div>
      </section>

      <div className="mt-10 flex flex-col gap-8">
        <h2 className="-mb-4 text-sm font-semibold text-zinc-700">Accesos rápidos</h2>
        {secciones.map((seccion) => (
          <section key={seccion.titulo}>
            <h3 className="mb-3 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              {seccion.titulo}
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {seccion.tarjetas.map((tarjeta) => (
                <StatCard
                  key={tarjeta.etiqueta}
                  etiqueta={tarjeta.etiqueta}
                  ruta={tarjeta.ruta}
                  valor={tarjeta.query.data?.length ?? 0}
                  cargando={tarjeta.query.isLoading}
                  icono={tarjeta.icono}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
