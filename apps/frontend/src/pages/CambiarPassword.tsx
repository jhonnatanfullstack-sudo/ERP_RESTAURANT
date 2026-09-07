import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as authService from '../services/auth.service';
import { Alert } from '../components/ui/Alert';

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
      const mensaje =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'No se pudo actualizar la contraseña';
      setError(mensaje);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Cambiar contraseña</h1>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex max-w-sm flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6"
      >
        {error && <Alert tipo="error" mensaje={error} />}
        {exito && <Alert tipo="exito" mensaje="Contraseña actualizada correctamente" />}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Contraseña actual</label>
          <input
            type="password"
            {...register('passwordActual', { required: true })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Contraseña nueva</label>
          <input
            type="password"
            {...register('passwordNuevo', { required: true, minLength: 8 })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={formState.isSubmitting}
          className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          Actualizar contraseña
        </button>
      </form>
    </div>
  );
}
