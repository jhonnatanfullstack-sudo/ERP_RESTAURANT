import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChefHat, Sparkles } from 'lucide-react';
import * as demoService from '../../services/demo.service';
import { useAuth } from '../../context/AuthContext';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { SeccionFormulario } from '../../components/ui/SeccionFormulario';
import { mensajeError } from '../../utils/errores';
import type { RegistrarDemoInput } from '../../services/demo.service';

const VENTAJAS = [
  'Carta digital pública con pedidos por WhatsApp',
  'Pedidos de mesa, comandas de cocina y caja',
  'Ventas con IGV, talonarios y cuentas por cobrar',
  'Inventario con kardex, recetas y costo por plato',
];

/**
 * Alta de una cuenta de prueba. Es la puerta de entrada pública del sistema: quien llega
 * acá todavía no tiene empresa, así que el formulario crea las dos cosas a la vez —el
 * restaurante y la persona que lo va a administrar— e inicia sesión de inmediato.
 *
 * Pide el RUC porque es un ERP peruano: sin RUC no se puede facturar, que es la mitad del
 * sistema. De paso, al ser único, limita naturalmente el registro a una prueba por negocio.
 */
export function RegistroDemo() {
  const navigate = useNavigate();
  const { aplicarSesionDemo } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const infoQuery = useQuery({
    queryKey: ['demo-informacion'],
    queryFn: demoService.obtenerInformacionDemo,
  });
  const tiposQuery = useQuery({
    queryKey: ['tipos-documento-identidad-publico'],
    queryFn: demoService.listarTiposDocumentoPublico,
    retry: false,
  });

  const form = useForm<RegistrarDemoInput>();
  const enviando = form.formState.isSubmitting;
  const dias = infoQuery.data?.diasDePrueba ?? 15;

  async function enviar(datos: RegistrarDemoInput) {
    setError(null);
    try {
      const sesion = await demoService.registrarDemo(datos);
      await aplicarSesionDemo(sesion.accessToken);
      navigate('/');
    } catch (excepcion) {
      setError(mensajeError(excepcion, 'No se pudo crear la cuenta de prueba'));
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto grid max-w-5xl gap-10 px-5 py-12 lg:grid-cols-[0.85fr_1.15fr] lg:py-20">
        <aside>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-600 shadow-sm shadow-orange-600/30">
              <ChefHat className="h-6 w-6 text-white" strokeWidth={2.25} />
            </div>
            <span className="text-lg font-bold text-zinc-900">Restaurant ERP</span>
          </div>

          <h1 className="mt-8 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Prueba el sistema {dias} días, sin costo
          </h1>
          <p className="mt-4 leading-relaxed text-zinc-600">
            Crea la cuenta de tu restaurante y empieza a operar hoy mismo. No se pide tarjeta: al
            terminar la prueba, tu información sigue disponible para consultar y decides si
            continúas.
          </p>

          <ul className="mt-8 flex flex-col gap-3">
            {VENTAJAS.map((ventaja) => (
              <li key={ventaja} className="flex items-start gap-2.5 text-sm text-zinc-700">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                  strokeWidth={2.25}
                />
                {ventaja}
              </li>
            ))}
          </ul>

          <p className="mt-8 text-sm text-zinc-500">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="font-semibold text-orange-600 hover:text-orange-700">
              Inicia sesión
            </Link>
          </p>
        </aside>

        <form
          onSubmit={(evento) => void form.handleSubmit(enviar)(evento)}
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-orange-50 px-3.5 py-2.5 text-sm font-medium text-orange-800">
            <Sparkles className="h-4 w-4 shrink-0" strokeWidth={2.25} />
            Tu prueba dura {dias} días desde ahora
          </div>

          {error && (
            <div className="mb-5">
              <Alert tipo="error" mensaje={error} />
            </div>
          )}

          <SeccionFormulario titulo="Tu restaurante">
            <Input
              label="RUC"
              placeholder="20123456789"
              inputMode="numeric"
              error={form.formState.errors.ruc?.message}
              {...form.register('ruc', {
                required: 'Indica el RUC',
                pattern: {
                  value: /^(10|15|17|20)\d{9}$/,
                  message: 'El RUC debe tener 11 dígitos y empezar en 10, 15, 17 o 20',
                },
              })}
            />
            <Input
              label="Razón social"
              error={form.formState.errors.razonSocial?.message}
              {...form.register('razonSocial', { required: 'Indica la razón social' })}
            />
            <Input
              label="Nombre comercial"
              ayuda="Con este nombre se publicará tu carta"
              {...form.register('nombreComercial')}
            />
            <Input label="Teléfono / WhatsApp" {...form.register('telefono')} />
          </SeccionFormulario>

          <SeccionFormulario titulo="Tus datos">
            <Input
              label="Nombres"
              error={form.formState.errors.nombres?.message}
              {...form.register('nombres', { required: 'Indica tus nombres' })}
            />
            <Input
              label="Apellido paterno"
              error={form.formState.errors.apellidoPaterno?.message}
              {...form.register('apellidoPaterno', { required: 'Indica tu apellido paterno' })}
            />
            <Input label="Apellido materno" {...form.register('apellidoMaterno')} />
            <Select
              label="Tipo de documento"
              error={form.formState.errors.tipoDocumentoIdentidadId?.message}
              {...form.register('tipoDocumentoIdentidadId', {
                required: 'Elige el tipo de documento',
              })}
            >
              <option value="">Selecciona…</option>
              {tiposQuery.data?.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </option>
              ))}
            </Select>
            <Input
              label="Número de documento"
              error={form.formState.errors.numeroDocumento?.message}
              {...form.register('numeroDocumento', { required: 'Indica tu número de documento' })}
            />
          </SeccionFormulario>

          <SeccionFormulario titulo="Tu acceso">
            <Input
              label="Correo electrónico"
              type="email"
              ayuda="Con este correo iniciarás sesión"
              error={form.formState.errors.email?.message}
              {...form.register('email', { required: 'Indica tu correo' })}
            />
            <Input
              label="Contraseña"
              type="password"
              ayuda="Mínimo 10 caracteres"
              error={form.formState.errors.password?.message}
              {...form.register('password', {
                required: 'Elige una contraseña',
                minLength: { value: 10, message: 'Debe tener al menos 10 caracteres' },
              })}
            />
          </SeccionFormulario>

          <Button type="submit" cargando={enviando} className="mt-6 w-full">
            Crear mi cuenta de prueba
          </Button>

          {tiposQuery.isError && (
            <p className="mt-4 text-center text-xs text-zinc-500">
              No se pudo cargar el catálogo de documentos. Recarga la página para intentarlo de
              nuevo.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
