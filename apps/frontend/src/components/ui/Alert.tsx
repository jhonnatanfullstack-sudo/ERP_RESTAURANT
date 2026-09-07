import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface AlertProps {
  tipo: 'error' | 'exito';
  mensaje: string;
}

export function Alert({ tipo, mensaje }: AlertProps) {
  const esError = tipo === 'error';
  const Icono = esError ? AlertCircle : CheckCircle2;

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${
        esError
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
      }`}
    >
      <Icono className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{mensaje}</span>
    </div>
  );
}
