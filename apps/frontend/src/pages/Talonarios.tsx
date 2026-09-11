import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import {
  BookMarked,
  Check,
  Hash,
  Pencil,
  Search,
  Trash2,
  UserCog,
  Users,
  Warehouse,
} from 'lucide-react';
import * as talonariosService from '../services/talonarios.service';
import * as empresaService from '../services/empresa.service';
import * as almacenesService from '../services/almacenes.service';
import * as catalogosService from '../services/catalogos.service';
import * as usuariosService from '../services/usuarios.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { FormActions } from '../components/ui/FormActions';
import { SeccionFormulario } from '../components/ui/SeccionFormulario';
import { EmptyState } from '../components/ui/EmptyState';
import { claseCampo, claseLabel } from '../components/ui/campos';
import { formatearNumero, nombrePersonal, numeroComprobante } from '../utils/formato';
import { mensajeError } from '../utils/errores';
import type { ActualizarTalonarioInput, CrearTalonarioInput } from '../services/talonarios.service';
import type { Talonario, TipoComprobante, Usuario } from '../types/api';

/** Solo se emiten boletas y facturas desde Ventas (ver `venta.service.ts`), así que solo
 * tiene sentido crear talonarios de esos dos comprobantes. */
const CODIGOS_FACTURABLES = ['01', '03'];

/** Letra con la que SUNAT exige que empiece la serie de cada comprobante — el backend la
 * valida en `talonario.service.ts`; aquí solo se usa para sugerirla y avisar antes. */
const LETRA_SERIE: Record<string, string> = { '01': 'F', '03': 'B' };

interface CrearFormValues extends Omit<CrearTalonarioInput, 'usuarioIds'> {
  numeroActual: number;
}

/** Vista previa del próximo comprobante mientras se llena el formulario: el mismo texto que
 * se verá luego en Ventas y en el comprobante impreso. */
function VistaPreviaNumero({
  serie,
  numeroInicio,
  numeroActual,
}: {
  serie: string;
  numeroInicio: number;
  numeroActual: number;
}) {
  const serieValida = /^[A-Z][A-Z0-9]{3}$/.test(serie);
  const siguiente = Math.max((Number(numeroActual) || 0) + 1, Number(numeroInicio) || 1);

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-3">
      <div>
        <p className="text-xs font-medium text-orange-700">Próximo comprobante</p>
        <p className="mt-0.5 text-xs text-orange-600/80">
          Así se numerará la siguiente venta emitida con este talonario.
        </p>
      </div>
      <span className="font-mono text-xl font-bold tracking-tight text-orange-700 tabular-nums">
        {serieValida ? numeroComprobante(serie, siguiente) : '————-————————'}
      </span>
    </div>
  );
}

interface SelectorUsuariosProps {
  usuarios: Usuario[];
  seleccionados: string[];
  onSeleccionar: (ids: string[]) => void;
}

/** Lista de usuarios con búsqueda para marcar quiénes emiten desde el talonario. Mismo
 * criterio que el selector de permisos de Roles: buscador + contador + marcar todos. */
function SelectorUsuarios({ usuarios, seleccionados, onSeleccionar }: SelectorUsuariosProps) {
  const [busqueda, setBusqueda] = useState('');

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return usuarios;
    return usuarios.filter(
      (usuario) =>
        nombrePersonal(usuario.personal).toLowerCase().includes(termino) ||
        usuario.email.toLowerCase().includes(termino) ||
        usuario.rol.nombre.toLowerCase().includes(termino),
    );
  }, [usuarios, busqueda]);

  function alternar(id: string) {
    onSeleccionar(
      seleccionados.includes(id)
        ? seleccionados.filter((actual) => actual !== id)
        : [...seleccionados, id],
    );
  }

  const idsFiltrados = filtrados.map((usuario) => usuario.id);
  const todosMarcados =
    idsFiltrados.length > 0 && idsFiltrados.every((id) => seleccionados.includes(id));

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className={claseLabel}>Usuarios que emiten desde este talonario</span>
        <span className="text-xs text-zinc-500">{seleccionados.length} seleccionados</span>
      </div>

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar por nombre, correo o rol…"
          aria-label="Buscar usuarios"
          className={`${claseCampo()} pl-9`}
        />
      </div>

      <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200">
        {filtrados.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-zinc-400">
            No hay usuarios que coincidan
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-1.5">
              <span className="text-xs font-semibold tracking-wide text-zinc-600 uppercase">
                {filtrados.length} usuarios
              </span>
              <button
                type="button"
                onClick={() =>
                  onSeleccionar(
                    todosMarcados
                      ? seleccionados.filter((id) => !idsFiltrados.includes(id))
                      : [...new Set([...seleccionados, ...idsFiltrados])],
                  )
                }
                className="text-xs font-medium text-orange-600 hover:text-orange-700"
              >
                {todosMarcados ? 'Quitar todos' : 'Marcar todos'}
              </button>
            </div>
            <ul className="divide-y divide-zinc-100">
              {filtrados.map((usuario) => {
                const marcado = seleccionados.includes(usuario.id);
                return (
                  <li key={usuario.id}>
                    <button
                      type="button"
                      onClick={() => alternar(usuario.id)}
                      aria-pressed={marcado}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        marcado ? 'bg-orange-50/70' : 'hover:bg-zinc-50'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          marcado
                            ? 'border-orange-600 bg-orange-600 text-white'
                            : 'border-zinc-300 bg-white'
                        }`}
                      >
                        {marcado && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zinc-900">
                          {nombrePersonal(usuario.personal)}
                        </span>
                        <span className="block truncate text-xs text-zinc-500">
                          {usuario.email}
                        </span>
                      </span>
                      <Badge tono="neutral">{usuario.rol.nombre}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export function Talonarios() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [talonarioEditando, setTalonarioEditando] = useState<Talonario | null>(null);
  const [talonarioAsignando, setTalonarioAsignando] = useState<Talonario | null>(null);
  const [talonarioEliminando, setTalonarioEliminando] = useState<Talonario | null>(null);
  const [usuariosCrear, setUsuariosCrear] = useState<string[]>([]);
  const [usuariosAsignar, setUsuariosAsignar] = useState<string[]>([]);

  const talonariosQuery = useQuery({
    queryKey: ['talonarios'],
    queryFn: talonariosService.listarTalonarios,
  });
  const empresasQuery = useQuery({
    queryKey: ['empresas'],
    queryFn: empresaService.listarEmpresas,
  });
  const almacenesQuery = useQuery({
    queryKey: ['almacenes'],
    queryFn: almacenesService.listarAlmacenes,
  });
  const tiposComprobanteQuery = useQuery({
    queryKey: ['tipos-comprobante'],
    queryFn: catalogosService.listarTiposComprobante,
  });
  const usuariosQuery = useQuery({
    queryKey: ['usuarios'],
    queryFn: usuariosService.listarUsuarios,
  });

  const empresas = empresasQuery.data ?? [];
  const almacenes = (almacenesQuery.data ?? []).filter((almacen) => almacen.activo);
  const tiposFacturables: TipoComprobante[] = (tiposComprobanteQuery.data ?? []).filter((tipo) =>
    CODIGOS_FACTURABLES.includes(tipo.codigo),
  );
  const usuariosActivos = (usuariosQuery.data ?? []).filter((usuario) => usuario.activo);
  const faltanRequisitos = empresas.length === 0 || almacenes.length === 0;

  const crearForm = useForm<CrearFormValues>({
    defaultValues: { serie: '', numeroInicio: 1, numeroFin: 99999999, numeroActual: 0 },
  });
  const editarForm = useForm<ActualizarTalonarioInput>();

  const tipoComprobanteId = useWatch({ control: crearForm.control, name: 'tipoComprobanteId' });
  const serieCrear = useWatch({ control: crearForm.control, name: 'serie' }) ?? '';
  const inicioCrear = useWatch({ control: crearForm.control, name: 'numeroInicio' });
  const actualCrear = useWatch({ control: crearForm.control, name: 'numeroActual' });
  const serieEditar = useWatch({ control: editarForm.control, name: 'serie' }) ?? '';
  const inicioEditar = useWatch({ control: editarForm.control, name: 'numeroInicio' });
  const actualEditar = useWatch({ control: editarForm.control, name: 'numeroActual' });

  const letraExigida =
    LETRA_SERIE[tiposFacturables.find((tipo) => tipo.id === tipoComprobanteId)?.codigo ?? ''];

  // Al elegir el comprobante se propone la serie habitual (B001 / F001) mientras el campo
  // siga vacío o traiga la sugerencia del comprobante anterior: escribir una serie propia
  // nunca se pisa.
  useEffect(() => {
    if (!letraExigida) return;
    const actual = crearForm.getValues('serie');
    if (!actual || /^[BF]001$/.test(actual)) {
      crearForm.setValue('serie', `${letraExigida}001`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de comprobante
  }, [letraExigida]);

  const crearMutation = useMutation({
    mutationFn: (values: CrearFormValues) =>
      talonariosService.crearTalonario({
        ...values,
        numeroInicio: Number(values.numeroInicio),
        numeroFin: Number(values.numeroFin),
        numeroActual: Number(values.numeroActual) || 0,
        usuarioIds: usuariosCrear,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talonarios'] });
      cerrarCrear();
    },
  });

  const editarMutation = useMutation({
    mutationFn: (values: ActualizarTalonarioInput) =>
      talonariosService.actualizarTalonario(talonarioEditando!.id, {
        ...values,
        numeroInicio: Number(values.numeroInicio),
        numeroFin: Number(values.numeroFin),
        numeroActual: Number(values.numeroActual),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talonarios'] });
      cerrarEditar();
    },
  });

  const asignarMutation = useMutation({
    mutationFn: () => talonariosService.asignarUsuarios(talonarioAsignando!.id, usuariosAsignar),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talonarios'] });
      setTalonarioAsignando(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: () => talonariosService.eliminarTalonario(talonarioEliminando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talonarios'] });
      setTalonarioEliminando(null);
    },
  });

  function cerrarCrear() {
    setModalAbierto(false);
    crearForm.reset({ serie: '', numeroInicio: 1, numeroFin: 99999999, numeroActual: 0 });
    crearMutation.reset();
    setUsuariosCrear([]);
  }

  function cerrarEditar() {
    setTalonarioEditando(null);
    editarMutation.reset();
  }

  function abrirEditar(talonario: Talonario) {
    setTalonarioEditando(talonario);
    editarForm.reset({
      almacenId: talonario.almacen.id,
      serie: talonario.serie,
      numeroInicio: talonario.numeroInicio,
      numeroFin: talonario.numeroFin,
      numeroActual: talonario.numeroActual,
      activo: talonario.activo,
    });
  }

  function abrirAsignar(talonario: Talonario) {
    setTalonarioAsignando(talonario);
    setUsuariosAsignar(talonario.usuarios.map((asignacion) => asignacion.usuario.id));
    asignarMutation.reset();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Talonarios</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Series de comprobantes y su correlativo. Cada venta toma su número del talonario
            asignado a quien la registra.
          </p>
        </div>
        {tienePermiso('talonarios.crear') && (
          <Button
            icono={<BookMarked className="h-4 w-4" />}
            onClick={() => setModalAbierto(true)}
            disabled={faltanRequisitos}
          >
            Nuevo talonario
          </Button>
        )}
      </div>

      <Table
        columnas={[
          {
            encabezado: 'Serie',
            render: (talonario) => (
              <span className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-zinc-900">{talonario.serie}</span>
                <span className="text-xs text-zinc-500">{talonario.tipoComprobante.nombre}</span>
              </span>
            ),
          },
          {
            encabezado: 'Punto de emisión',
            render: (talonario) => (
              <span className="flex items-center gap-1.5 text-zinc-700">
                <Warehouse className="h-3.5 w-3.5 text-zinc-400" />
                {talonario.almacen.nombre}
              </span>
            ),
          },
          {
            encabezado: 'Rango autorizado',
            render: (talonario) => (
              <span className="font-mono text-xs text-zinc-600 tabular-nums">
                {formatearNumero(talonario.numeroInicio)} – {formatearNumero(talonario.numeroFin)}
              </span>
            ),
          },
          {
            encabezado: 'Último emitido',
            render: (talonario) => (
              <span className="font-mono text-xs text-zinc-600 tabular-nums">
                {talonario.numeroActual === 0
                  ? '—'
                  : numeroComprobante(talonario.serie, talonario.numeroActual)}
              </span>
            ),
          },
          {
            encabezado: 'Próximo',
            render: (talonario) =>
              talonario.agotado ? (
                <Badge tono="peligro">Agotado</Badge>
              ) : (
                <span className="font-mono text-xs font-semibold text-orange-700 tabular-nums">
                  {talonario.siguienteNumeroFormateado}
                </span>
              ),
          },
          {
            encabezado: 'Usuarios',
            render: (talonario) => (
              <Badge tono={talonario.usuarios.length > 0 ? 'exito' : 'neutral'}>
                {talonario.usuarios.length} asignados
              </Badge>
            ),
          },
          {
            encabezado: 'Estado',
            render: (talonario) => (
              <Badge tono={talonario.activo ? 'exito' : 'neutral'}>
                {talonario.activo ? 'Activo' : 'Inactivo'}
              </Badge>
            ),
          },
          {
            encabezado: '',
            render: (talonario) => (
              <div className="flex items-center gap-3">
                {tienePermiso('talonarios.asignar') && (
                  <button
                    type="button"
                    onClick={() => abrirAsignar(talonario)}
                    className="flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-800"
                  >
                    <UserCog className="h-3.5 w-3.5" />
                    Asignar usuarios
                  </button>
                )}
                {tienePermiso('talonarios.editar') && (
                  <button
                    type="button"
                    onClick={() => abrirEditar(talonario)}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                )}
                {tienePermiso('talonarios.eliminar') && (
                  <button
                    type="button"
                    onClick={() => setTalonarioEliminando(talonario)}
                    className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </button>
                )}
              </div>
            ),
          },
        ]}
        filas={talonariosQuery.data ?? []}
        claveFila={(talonario) => talonario.id}
        vacio="No hay talonarios registrados"
        vacioDescripcion={
          faltanRequisitos
            ? 'Registra primero la empresa y al menos un almacén: un talonario pertenece a una empresa y a un punto de emisión.'
            : 'Sin talonarios, las ventas se numeran con la serie fija de siempre (B001 / F001).'
        }
        cargando={talonariosQuery.isLoading}
        error={
          talonariosQuery.isError
            ? mensajeError(talonariosQuery.error, 'No se pudieron cargar los talonarios')
            : undefined
        }
        onReintentar={() => void talonariosQuery.refetch()}
      />

      <Modal
        abierto={modalAbierto}
        titulo="Nuevo talonario"
        descripcion="Define la serie, el rango autorizado y quién puede emitir desde ella."
        onCerrar={cerrarCrear}
        tamano="xl"
      >
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
          noValidate
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el talonario')}
            />
          )}

          <SeccionFormulario
            titulo="Serie"
            descripcion="A qué comprobante y punto de emisión pertenece."
            icono={BookMarked}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Empresa"
                error={crearForm.formState.errors.empresaId?.message}
                {...crearForm.register('empresaId', { required: 'Selecciona la empresa' })}
              >
                <option value="">Seleccionar…</option>
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.razonSocial}
                  </option>
                ))}
              </Select>

              <Select
                label="Punto de emisión"
                ayuda="El almacén/caja desde donde se emiten estos comprobantes."
                error={crearForm.formState.errors.almacenId?.message}
                {...crearForm.register('almacenId', { required: 'Selecciona el punto de emisión' })}
              >
                <option value="">Seleccionar…</option>
                {almacenes.map((almacen) => (
                  <option key={almacen.id} value={almacen.id}>
                    {almacen.nombre}
                  </option>
                ))}
              </Select>

              <Select
                label="Tipo de comprobante"
                error={crearForm.formState.errors.tipoComprobanteId?.message}
                {...crearForm.register('tipoComprobanteId', {
                  required: 'Selecciona el tipo de comprobante',
                })}
              >
                <option value="">Seleccionar…</option>
                {tiposFacturables.map((tipo) => (
                  <option key={tipo.id} value={tipo.id}>
                    {tipo.nombre}
                  </option>
                ))}
              </Select>

              <Input
                label="Serie"
                placeholder={letraExigida ? `${letraExigida}001` : 'B001'}
                maxLength={4}
                ayuda={
                  letraExigida
                    ? `4 caracteres; debe empezar con "${letraExigida}".`
                    : '4 caracteres: una letra y 3 alfanuméricos.'
                }
                error={crearForm.formState.errors.serie?.message}
                {...crearForm.register('serie', {
                  required: 'La serie es obligatoria',
                  setValueAs: (valor: string) => valor.trim().toUpperCase(),
                  validate: (valor: string) =>
                    /^[A-Z][A-Z0-9]{3}$/.test(valor)
                      ? letraExigida && !valor.startsWith(letraExigida)
                        ? `Debe empezar con "${letraExigida}"`
                        : true
                      : 'Formato inválido: una letra y 3 alfanuméricos (ej. B001)',
                })}
              />
            </div>
          </SeccionFormulario>

          <SeccionFormulario
            titulo="Numeración"
            descripcion="Rango autorizado y desde qué número continúa."
            icono={Hash}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                label="Número inicial"
                type="number"
                min="1"
                error={crearForm.formState.errors.numeroInicio?.message}
                {...crearForm.register('numeroInicio', {
                  required: 'Indica desde qué número inicia',
                  min: { value: 1, message: 'Debe ser 1 o mayor' },
                })}
              />
              <Input
                label="Número final"
                type="number"
                min="1"
                error={crearForm.formState.errors.numeroFin?.message}
                {...crearForm.register('numeroFin', {
                  required: 'Indica hasta qué número llega',
                  validate: (valor) =>
                    Number(valor) >= Number(crearForm.getValues('numeroInicio')) ||
                    'Debe ser mayor o igual al número inicial',
                })}
              />
              <Input
                label="Último emitido"
                type="number"
                min="0"
                ayuda="0 si el talonario es nuevo."
                error={crearForm.formState.errors.numeroActual?.message}
                {...crearForm.register('numeroActual', {
                  min: { value: 0, message: 'No puede ser negativo' },
                })}
              />
            </div>

            <VistaPreviaNumero
              serie={serieCrear}
              numeroInicio={inicioCrear}
              numeroActual={actualCrear}
            />
          </SeccionFormulario>

          <SeccionFormulario
            titulo="Usuarios"
            descripcion="Quiénes podrán emitir desde esta serie. Se puede cambiar después."
            icono={Users}
          >
            {usuariosActivos.length === 0 ? (
              <EmptyState icono={Users} titulo="No hay usuarios activos" />
            ) : (
              <SelectorUsuarios
                usuarios={usuariosActivos}
                seleccionados={usuariosCrear}
                onSeleccionar={setUsuariosCrear}
              />
            )}
          </SeccionFormulario>

          <FormActions
            enviar="Crear talonario"
            enviandoTexto="Creando…"
            onCancelar={cerrarCrear}
            enviando={crearForm.formState.isSubmitting || crearMutation.isPending}
          />
        </form>
      </Modal>

      <Modal
        abierto={talonarioEditando !== null}
        titulo={talonarioEditando ? `Talonario ${talonarioEditando.serie}` : ''}
        descripcion="La serie solo puede cambiarse mientras el talonario no haya emitido comprobantes."
        onCerrar={cerrarEditar}
        tamano="lg"
      >
        {talonarioEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el talonario')}
              />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Serie"
                maxLength={4}
                disabled={talonarioEditando.numeroActual > 0}
                ayuda={
                  talonarioEditando.numeroActual > 0
                    ? 'Bloqueada: este talonario ya emitió comprobantes.'
                    : undefined
                }
                error={editarForm.formState.errors.serie?.message}
                {...editarForm.register('serie', {
                  setValueAs: (valor: string) => valor.trim().toUpperCase(),
                  validate: (valor?: string) =>
                    !valor ||
                    /^[A-Z][A-Z0-9]{3}$/.test(valor) ||
                    'Formato inválido: una letra y 3 alfanuméricos (ej. B001)',
                })}
              />

              <Select
                label="Punto de emisión"
                error={editarForm.formState.errors.almacenId?.message}
                {...editarForm.register('almacenId')}
              >
                {almacenes.map((almacen) => (
                  <option key={almacen.id} value={almacen.id}>
                    {almacen.nombre}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                label="Número inicial"
                type="number"
                min="1"
                error={editarForm.formState.errors.numeroInicio?.message}
                {...editarForm.register('numeroInicio', {
                  min: { value: 1, message: 'Debe ser 1 o mayor' },
                })}
              />
              <Input
                label="Número final"
                type="number"
                min="1"
                error={editarForm.formState.errors.numeroFin?.message}
                {...editarForm.register('numeroFin', {
                  validate: (valor?: number) =>
                    Number(valor) >= Number(editarForm.getValues('numeroInicio')) ||
                    'Debe ser mayor o igual al número inicial',
                })}
              />
              <Input
                label="Último emitido"
                type="number"
                min="0"
                ayuda="Corrige el correlativo si se desincronizó."
                error={editarForm.formState.errors.numeroActual?.message}
                {...editarForm.register('numeroActual', {
                  min: { value: 0, message: 'No puede ser negativo' },
                })}
              />
            </div>

            <VistaPreviaNumero
              serie={serieEditar || talonarioEditando.serie}
              numeroInicio={Number(inicioEditar)}
              numeroActual={Number(actualEditar)}
            />

            <Checkbox
              label="Talonario activo"
              ayuda="Un talonario inactivo deja de ofrecerse al registrar ventas."
              {...editarForm.register('activo')}
            />

            <FormActions
              enviar="Guardar cambios"
              onCancelar={cerrarEditar}
              enviando={editarForm.formState.isSubmitting || editarMutation.isPending}
            />
          </form>
        )}
      </Modal>

      <Modal
        abierto={talonarioAsignando !== null}
        titulo={talonarioAsignando ? `Usuarios del talonario ${talonarioAsignando.serie}` : ''}
        descripcion="Solo estos usuarios podrán emitir comprobantes con esta serie."
        onCerrar={() => setTalonarioAsignando(null)}
        tamano="lg"
      >
        {talonarioAsignando && (
          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              asignarMutation.mutate();
            }}
            className="flex flex-col gap-4"
          >
            {asignarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(asignarMutation.error, 'No se pudieron asignar los usuarios')}
              />
            )}

            {usuariosActivos.length === 0 ? (
              <EmptyState
                icono={Users}
                titulo="No hay usuarios activos"
                descripcion="Crea usuarios en Administración › Usuarios para asignarlos a este talonario."
              />
            ) : (
              <SelectorUsuarios
                usuarios={usuariosActivos}
                seleccionados={usuariosAsignar}
                onSeleccionar={setUsuariosAsignar}
              />
            )}

            <FormActions
              enviar="Guardar asignación"
              enviandoTexto="Guardando…"
              onCancelar={() => setTalonarioAsignando(null)}
              enviando={asignarMutation.isPending}
            />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        abierto={talonarioEliminando !== null}
        titulo="Eliminar talonario"
        mensaje={`¿Seguro que deseas eliminar la serie ${talonarioEliminando?.serie}? Solo es posible si todavía no emitió comprobantes.`}
        confirmando={eliminarMutation.isPending}
        error={
          eliminarMutation.isError
            ? mensajeError(eliminarMutation.error, 'No se pudo eliminar el talonario')
            : undefined
        }
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setTalonarioEliminando(null)}
      />
    </div>
  );
}
