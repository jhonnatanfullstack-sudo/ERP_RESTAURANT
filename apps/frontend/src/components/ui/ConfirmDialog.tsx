import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface ConfirmDialogProps {
  abierto: boolean;
  titulo: string;
  mensaje: string;
  confirmando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export function ConfirmDialog({
  abierto,
  titulo,
  mensaje,
  confirmando,
  onConfirmar,
  onCancelar,
}: ConfirmDialogProps) {
  if (!abierto) return null;

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
      <div className="animate-scale-in w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle className="h-5 w-5" strokeWidth={2} />
        </div>
        <h2 className="mt-4 text-lg font-bold text-zinc-900">{titulo}</h2>
        <p className="mt-1.5 text-sm text-zinc-500">{mensaje}</p>

        <div className="mt-6 flex justify-end gap-3">
          <Button variante="secondary" onClick={onCancelar} disabled={confirmando}>
            Cancelar
          </Button>
          <Button variante="danger" onClick={onConfirmar} disabled={confirmando}>
            {confirmando ? 'Procesando…' : 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
