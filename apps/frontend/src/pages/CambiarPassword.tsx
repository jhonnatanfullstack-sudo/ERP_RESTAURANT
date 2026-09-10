import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as authService from '../services/auth.service';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { mensajeError } from '../utils/errores';

interface FormValues {
  passwordActual: string;
  passwordNuevo: string;
}

export function CambiarPassword() {
  const { register, handleSubmit, reset, formState } = useForm<FormValues>();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  async function onSubmit(values: FormValues) {
    setError(null);
    setExito(false);
    try {
      await authService.cambiarPassword(values.passwordActual, values.passwordNuevo);
      setExito(true);
      reset();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo actualizar la contraseña'));
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Cambiar contraseña</h1>
        <p className="mt-1 text-sm text-zinc-500">Actualiza tu contraseña de acceso</p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex max-w-md flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
        noValidate
      >
        {error && <Alert tipo="error" mensaje={error} />}
        {exito && <Alert tipo="exito" mensaje="Contraseña actualizada correctamente" />}

        <Input
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          error={formState.errors.passwordActual?.message}
          {...register('passwordActual', { required: 'Ingresa tu contraseña actual' })}
        />

        <Input
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          ayuda="Mínimo 8 caracteres."
          error={formState.errors.passwordNuevo?.message}
          {...register('passwordNuevo', {
            required: 'Ingresa la contraseña nueva',
            minLength: { value: 8, message: 'La contraseña debe tener al menos 8 caracteres' },
          })}
        />

        <div className="mt-2 border-t border-zinc-100 pt-4">
          <Button type="submit" cargando={formState.isSubmitting} className="w-full sm:w-auto">
            {formState.isSubmitting ? 'Actualizando…' : 'Actualizar contraseña'}
          </Button>
        </div>
      </form>
    </div>
  );
}
