interface AlertProps {
  tipo: 'error' | 'exito';
  mensaje: string;
}

export function Alert({ tipo, mensaje }: AlertProps) {
  const estilos =
    tipo === 'error'
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-green-50 text-green-700 border-green-200';

  return <div className={`rounded-md border px-3 py-2 text-sm ${estilos}`}>{mensaje}</div>;
}
