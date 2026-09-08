import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';

export interface OpcionCombobox {
  valor: string;
  etiqueta: string;
  descripcion?: string;
}

interface ComboboxProps {
  opciones: OpcionCombobox[];
  valor: string | undefined;
  onCambiar: (valor: string) => void;
  placeholder?: string;
  vacio?: string;
  disabled?: boolean;
  id?: string;
}

/** Select con búsqueda por texto. Usar en vez de `<select>` cuando la lista de opciones
 * puede crecer y buscar por nombre es más rápido que desplazarse (ver Regla 8 de CLAUDE.md
 * antes de crear un nuevo primitivo visual en vez de reutilizar este). */
export function Combobox({
  opciones,
  valor,
  onCambiar,
  placeholder = 'Seleccionar…',
  vacio = 'Sin resultados',
  disabled,
  id,
}: ComboboxProps) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [resaltado, setResaltado] = useState(0);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const opcionSeleccionada = opciones.find((o) => o.valor === valor) ?? null;

  useEffect(() => {
    function alClicFuera(evento: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(evento.target as Node)) {
        setAbierto(false);
        setBusqueda('');
      }
    }
    document.addEventListener('mousedown', alClicFuera);
    return () => document.removeEventListener('mousedown', alClicFuera);
  }, []);

  const opcionesFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return opciones;
    return opciones.filter(
      (o) =>
        o.etiqueta.toLowerCase().includes(termino) ||
        o.descripcion?.toLowerCase().includes(termino),
    );
  }, [opciones, busqueda]);

  function abrir() {
    if (disabled) return;
    setAbierto(true);
    setResaltado(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function seleccionar(opcion: OpcionCombobox) {
    onCambiar(opcion.valor);
    setAbierto(false);
    setBusqueda('');
  }

  function alTeclado(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setResaltado((r) => Math.min(r + 1, opcionesFiltradas.length - 1));
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setResaltado((r) => Math.max(r - 1, 0));
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      const opcion = opcionesFiltradas[resaltado];
      if (opcion) seleccionar(opcion);
    } else if (evento.key === 'Escape') {
      setAbierto(false);
      setBusqueda('');
    }
  }

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        className={`flex w-full items-center justify-between rounded-lg border border-zinc-300 px-3 py-2 text-left text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none ${
          disabled ? 'cursor-not-allowed bg-zinc-50 text-zinc-400' : 'bg-white'
        }`}
      >
        <span className={`truncate ${opcionSeleccionada ? 'text-zinc-900' : 'text-zinc-400'}`}>
          {opcionSeleccionada ? opcionSeleccionada.etiqueta : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>

      {abierto && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-zinc-400" />
            <input
              ref={inputRef}
              value={busqueda}
              onChange={(evento) => {
                setBusqueda(evento.target.value);
                setResaltado(0);
              }}
              onKeyDown={alTeclado}
              placeholder="Buscar…"
              className="w-full text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {opcionesFiltradas.length === 0 && (
              <li className="px-3 py-2 text-sm text-zinc-400">{vacio}</li>
            )}
            {opcionesFiltradas.map((opcion, indice) => (
              <li key={opcion.valor}>
                <button
                  type="button"
                  onClick={() => seleccionar(opcion)}
                  onMouseEnter={() => setResaltado(indice)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    indice === resaltado ? 'bg-orange-50 text-orange-700' : 'text-zinc-700'
                  }`}
                >
                  <span className="truncate">
                    {opcion.etiqueta}
                    {opcion.descripcion && (
                      <span className="ml-1.5 text-xs text-zinc-400">{opcion.descripcion}</span>
                    )}
                  </span>
                  {opcion.valor === valor && <Check className="h-4 w-4 shrink-0 text-orange-600" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
