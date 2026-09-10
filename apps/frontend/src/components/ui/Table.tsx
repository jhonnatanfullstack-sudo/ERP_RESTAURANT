import { Inbox, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';

interface Columna<T> {
  encabezado: string;
  render: (fila: T) => React.ReactNode;
}

interface TableProps<T> {
  columnas: Columna<T>[];
  filas: T[];
  claveFila: (fila: T) => string;
  vacio?: string;
  /** Detalle opcional del estado vacío (ej. "Crea la primera categoría de la carta"). */
  vacioDescripcion?: string;
  /** Acción del estado vacío, ej. el botón de "Nuevo …". */
  vacioAccion?: ReactNode;
  /** Muestra filas de carga en vez del contenido. */
  cargando?: boolean;
  /** Mensaje legible cuando la consulta falló: la tabla no puede decir "no hay registros". */
  error?: string;
  onReintentar?: () => void;
}

function FilasCargando({ columnas }: { columnas: number }) {
  return (
    <tbody className="divide-y divide-zinc-100">
      {Array.from({ length: 4 }).map((_, fila) => (
        <tr key={fila}>
          {Array.from({ length: columnas }).map((_, columna) => (
            <td key={columna} className="px-5 py-3.5">
              <div className="h-3.5 animate-pulse rounded bg-zinc-100" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function Table<T>({
  columnas,
  filas,
  claveFila,
  vacio = 'Sin registros',
  vacioDescripcion,
  vacioAccion,
  cargando = false,
  error,
  onReintentar,
}: TableProps<T>) {
  const contenedor = 'overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm';

  if (error) {
    return (
      <div className={contenedor}>
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
            <TriangleAlert className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-700">No se pudieron cargar los datos</p>
            <p className="mt-1 text-sm text-zinc-500">{error}</p>
          </div>
          {onReintentar && (
            <button
              type="button"
              onClick={onReintentar}
              className="text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              Reintentar
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!cargando && filas.length === 0) {
    return (
      <div className={contenedor}>
        <EmptyState icono={Inbox} titulo={vacio} descripcion={vacioDescripcion}>
          {vacioAccion}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className={contenedor}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              {columnas.map((columna) => (
                <th
                  key={columna.encabezado}
                  className="px-5 py-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase"
                >
                  {columna.encabezado}
                </th>
              ))}
            </tr>
          </thead>
          {cargando ? (
            <FilasCargando columnas={columnas.length} />
          ) : (
            <tbody className="divide-y divide-zinc-100">
              {filas.map((fila) => (
                <tr key={claveFila(fila)} className="transition-colors hover:bg-zinc-50">
                  {columnas.map((columna) => (
                    <td key={columna.encabezado} className="px-5 py-3.5 text-zinc-700">
                      {columna.render(fila)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}
