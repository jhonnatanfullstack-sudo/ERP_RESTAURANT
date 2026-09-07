import { useQuery } from '@tanstack/react-query';
import {
  Award,
  Building2,
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
import { useAuth } from '../context/AuthContext';
import { StatCard } from '../components/ui/StatCard';

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
      <h1 className="text-2xl font-bold text-zinc-900">Hola, {usuario?.personal.nombres} 👋</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Resumen general del sistema. Los módulos operativos se irán habilitando por fase.
      </p>

      <div className="mt-8 flex flex-col gap-8">
        {secciones.map((seccion) => (
          <section key={seccion.titulo}>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              {seccion.titulo}
            </h2>
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
