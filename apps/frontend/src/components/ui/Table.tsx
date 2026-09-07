import { Inbox } from 'lucide-react';
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
}

export function Table<T>({ columnas, filas, claveFila, vacio = 'Sin registros' }: TableProps<T>) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      {filas.length === 0 ? (
        <EmptyState icono={Inbox} titulo={vacio} />
      ) : (
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
          </table>
        </div>
      )}
    </div>
  );
}
