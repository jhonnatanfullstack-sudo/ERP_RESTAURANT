import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type TipoAlerta = 'error' | 'exito' | 'advertencia';

interface AlertProps {
  tipo: TipoAlerta;
  mensaje: string;
}

const estilos: Record<TipoAlerta, { clases: string; icono: LucideIcon }> = {
  error: { clases: 'border-red-200 bg-red-50 text-red-700', icono: AlertCircle },
  exito: { clases: 'border-emerald-200 bg-emerald-50 text-emerald-700', icono: CheckCircle2 },
  advertencia: { clases: 'border-amber-200 bg-amber-50 text-amber-800', icono: AlertTriangle },
};

export function Alert({ tipo, mensaje }: AlertProps) {
  const { clases, icono: Icono } = estilos[tipo];

  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${clases}`}>
      <Icono className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{mensaje}</span>
    </div>
  );
}
