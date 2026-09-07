import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as authService from '../services/auth.service';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';

interface FormValues {
  passwordActual: string;
  passwordNuevo: string;
}

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

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
      const mensaje =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'No se pudo actualizar la contraseña';
      setError(mensaje);
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
        className="flex max-w-sm flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        {error && <Alert tipo="error" mensaje={error} />}
        {exito && <Alert tipo="exito" mensaje="Contraseña actualizada correctamente" />}

        <div>
          <label className={labelClass}>Contraseña actual</label>
          <input
            type="password"
            {...register('passwordActual', { required: true })}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Contraseña nueva</label>
          <input
            type="password"
            {...register('passwordNuevo', { required: true, minLength: 8 })}
            className={inputClass}
          />
        </div>

        <Button type="submit" disabled={formState.isSubmitting} className="mt-2 w-full">
          Actualizar contraseña
        </Button>
      </form>
    </div>
  );
}
