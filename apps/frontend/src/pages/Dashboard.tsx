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

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-900">Hola, {usuario?.personal.nombres} 👋</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Resumen general del sistema. Los módulos operativos se irán habilitando por fase.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          etiqueta="Usuarios"
          valor={usuariosQuery.data?.length ?? 0}
          cargando={usuariosQuery.isLoading}
          icono={Users}
        />
        <StatCard
          etiqueta="Personal"
          valor={personalQuery.data?.length ?? 0}
          cargando={personalQuery.isLoading}
          icono={UserCircle2}
        />
        <StatCard
          etiqueta="Roles"
          valor={rolesQuery.data?.length ?? 0}
          cargando={rolesQuery.isLoading}
          icono={ShieldCheck}
        />
        <StatCard
          etiqueta="Empresas"
          valor={empresasQuery.data?.length ?? 0}
          cargando={empresasQuery.isLoading}
          icono={Building2}
        />
        <StatCard
          etiqueta="Categorías"
          valor={categoriasQuery.data?.length ?? 0}
          cargando={categoriasQuery.isLoading}
          icono={Tags}
        />
        <StatCard
          etiqueta="Marcas"
          valor={marcasQuery.data?.length ?? 0}
          cargando={marcasQuery.isLoading}
          icono={Award}
        />
        <StatCard
          etiqueta="Productos"
          valor={productosQuery.data?.length ?? 0}
          cargando={productosQuery.isLoading}
          icono={UtensilsCrossed}
        />
        <StatCard
          etiqueta="Salones"
          valor={salonesQuery.data?.length ?? 0}
          cargando={salonesQuery.isLoading}
          icono={DoorOpen}
        />
        <StatCard
          etiqueta="Mesas"
          valor={mesasQuery.data?.length ?? 0}
          cargando={mesasQuery.isLoading}
          icono={Utensils}
        />
      </div>
    </div>
  );
}
