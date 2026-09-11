import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ScrollText, ShieldCheck } from 'lucide-react';
import * as auditoriaService from '../services/auditoria.service';
import * as usuariosService from '../services/usuarios.service';
import { Table } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { EmptyState } from '../components/ui/EmptyState';
import { formatearFechaHora, nombrePersonal } from '../utils/formato';
import { mensajeError } from '../utils/errores';
import type { AccionAuditoria, RegistroAuditoria } from '../types/api';

const POR_PAGINA = 25;

const ETIQUETA_ACCION: Record<AccionAuditoria, string> = {
  crear: 'Creó',
  actualizar: 'Actualizó',
  eliminar: 'Eliminó',
  anular: 'Anuló',
  login: 'Inició sesión',
  login_fallido: 'Login fallido',
  logout: 'Cerró sesión',
};

/** `Badge` solo ofrece estos tres tonos: un intento de login fallido va en rojo por ser la
 * señal que más interesa detectar en una auditoría, no porque sea un error del sistema. */
const TONO_ACCION: Record<AccionAuditoria, 'exito' | 'neutral' | 'peligro'> = {
  crear: 'exito',
  actualizar: 'neutral',
  eliminar: 'peligro',
  anular: 'peligro',
  login: 'neutral',
  login_fallido: 'peligro',
  logout: 'neutral',
};

export function Auditoria() {
  const [filtros, setFiltros] = useState<{
    modulo: string;
    accion: string;
    usuarioId: string;
    desde: string;
    hasta: string;
  }>({ modulo: '', accion: '', usuarioId: '', desde: '', hasta: '' });
  const [pagina, setPagina] = useState(1);
  const [expandido, setExpandido] = useState<string | null>(null);

  // Los filtros vacíos no se envían: el backend los trata como "sin filtrar" y así la URL de
  // la consulta no se llena de parámetros en blanco.
  const consulta = {
    pagina,
    porPagina: POR_PAGINA,
    ...(filtros.modulo ? { modulo: filtros.modulo } : {}),
    ...(filtros.accion ? { accion: filtros.accion as AccionAuditoria } : {}),
    ...(filtros.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
    // El rango solo aplica si están las dos puntas: media fecha no acota nada.
    ...(filtros.desde && filtros.hasta ? { desde: filtros.desde, hasta: filtros.hasta } : {}),
  };

  const auditoriaQuery = useQuery({
    queryKey: ['auditoria', consulta],
    queryFn: () => auditoriaService.listarAuditoria(consulta),
  });
  const modulosQuery = useQuery({
    queryKey: ['auditoria-modulos'],
    queryFn: auditoriaService.listarModulosAuditados,
  });
  const usuariosQuery = useQuery({
    queryKey: ['usuarios'],
    queryFn: usuariosService.listarUsuarios,
  });

  function cambiarFiltro(campo: keyof typeof filtros, valor: string) {
    setFiltros((previo) => ({ ...previo, [campo]: valor }));
    // Cualquier cambio de filtro invalida la página actual: la 7 de un resultado puede no
    // existir en el siguiente.
    setPagina(1);
  }

  const datos = auditoriaQuery.data;
  const totalPaginas = datos ? Math.max(1, Math.ceil(datos.total / datos.porPagina)) : 1;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Auditoría</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Registro de quién modificó qué en el sistema. Solo lectura: la bitácora no se edita ni se
          borra.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Select
          label="Módulo"
          value={filtros.modulo}
          onChange={(evento) => cambiarFiltro('modulo', evento.target.value)}
        >
          <option value="">Todos</option>
          {modulosQuery.data?.map((modulo) => (
            <option key={modulo} value={modulo}>
              {modulo}
            </option>
          ))}
        </Select>

        <Select
          label="Acción"
          value={filtros.accion}
          onChange={(evento) => cambiarFiltro('accion', evento.target.value)}
        >
          <option value="">Todas</option>
          {Object.entries(ETIQUETA_ACCION).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </Select>

        <Select
          label="Usuario"
          value={filtros.usuarioId}
          onChange={(evento) => cambiarFiltro('usuarioId', evento.target.value)}
        >
          <option value="">Todos</option>
          {usuariosQuery.data?.map((usuario) => (
            <option key={usuario.id} value={usuario.id}>
              {nombrePersonal(usuario.personal)}
            </option>
          ))}
        </Select>

        <div>
          <label
            htmlFor="auditoria-desde"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Desde
          </label>
          <input
            id="auditoria-desde"
            type="date"
            value={filtros.desde}
            max={filtros.hasta || undefined}
            onChange={(evento) => cambiarFiltro('desde', evento.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="auditoria-hasta"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Hasta
          </label>
          <input
            id="auditoria-hasta"
            type="date"
            value={filtros.hasta}
            min={filtros.desde || undefined}
            onChange={(evento) => cambiarFiltro('hasta', evento.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
          />
        </div>
      </div>

      <Table
        columnas={[
          {
            encabezado: 'Cuándo',
            render: (registro: RegistroAuditoria) => (
              <span className="whitespace-nowrap">{formatearFechaHora(registro.creadoEn)}</span>
            ),
          },
          {
            encabezado: 'Quién',
            render: (registro: RegistroAuditoria) =>
              registro.usuario ? (
                <div>
                  <p className="font-medium text-zinc-900">
                    {nombrePersonal(registro.usuario.personal)}
                  </p>
                  <p className="text-xs text-zinc-500">{registro.usuario.email}</p>
                </div>
              ) : (
                <span className="text-zinc-400">Sin sesión</span>
              ),
          },
          {
            encabezado: 'Acción',
            render: (registro: RegistroAuditoria) => (
              <Badge tono={TONO_ACCION[registro.accion]}>{ETIQUETA_ACCION[registro.accion]}</Badge>
            ),
          },
          { encabezado: 'Módulo', render: (registro: RegistroAuditoria) => registro.modulo },
          {
            encabezado: 'Detalle',
            render: (registro: RegistroAuditoria) => (
              <div className="min-w-0">
                <p className="truncate font-mono text-xs text-zinc-600">
                  {registro.metodo} {registro.ruta}
                </p>
                {registro.datos && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandido((actual) => (actual === registro.id ? null : registro.id))
                    }
                    className="mt-1 text-xs font-medium text-orange-600 hover:text-orange-700"
                  >
                    {expandido === registro.id ? 'Ocultar datos' : 'Ver datos'}
                  </button>
                )}
                {expandido === registro.id && registro.datos && (
                  <pre className="mt-2 max-w-md overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">
                    {JSON.stringify(registro.datos, null, 2)}
                  </pre>
                )}
              </div>
            ),
          },
          {
            encabezado: 'Resultado',
            render: (registro: RegistroAuditoria) => (
              <Badge tono={registro.estadoHttp < 400 ? 'exito' : 'peligro'}>
                {registro.estadoHttp}
              </Badge>
            ),
          },
        ]}
        filas={datos?.registros ?? []}
        claveFila={(registro) => registro.id}
        vacio="No hay movimientos registrados con esos filtros"
        cargando={auditoriaQuery.isLoading}
        error={
          auditoriaQuery.isError
            ? mensajeError(auditoriaQuery.error, 'No se pudo cargar la auditoría')
            : undefined
        }
        onReintentar={() => void auditoriaQuery.refetch()}
      />

      {datos && datos.total === 0 && !auditoriaQuery.isLoading && (
        <div className="mt-6">
          <EmptyState
            icono={ShieldCheck}
            titulo="Sin registros"
            descripcion="Las operaciones que modifiquen datos aparecerán aquí automáticamente."
          />
        </div>
      )}

      {datos && datos.total > 0 && (
        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="text-sm text-zinc-500">
            <ScrollText className="mr-1.5 inline h-4 w-4" />
            {datos.total} {datos.total === 1 ? 'movimiento' : 'movimientos'} · página {datos.pagina}{' '}
            de {totalPaginas}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagina <= 1}
              onClick={() => setPagina((actual) => actual - 1)}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>
            <button
              type="button"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina((actual) => actual + 1)}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
