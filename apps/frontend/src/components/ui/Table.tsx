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
  if (filas.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">{vacio}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {columnas.map((columna) => (
              <th key={columna.encabezado} className="px-4 py-3 font-medium">
                {columna.encabezado}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {filas.map((fila) => (
            <tr key={claveFila(fila)}>
              {columnas.map((columna) => (
                <td key={columna.encabezado} className="px-4 py-3 text-slate-700">
                  {columna.render(fila)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
