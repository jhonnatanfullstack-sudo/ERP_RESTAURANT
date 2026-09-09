const FRASES = [
  '🍴 Ingredientes frescos cada día',
  '📲 Pedidos directo por WhatsApp',
  '🔥 Preparado al momento',
  '❤️ Hecho con cariño',
];

/**
 * Cinta de texto en desplazamiento continuo — un guiño visual típico de sitios de
 * restaurante, puramente decorativo (frases genéricas, sin cifras ni afirmaciones que
 * inventen datos del negocio). Se duplica el contenido una vez para que el loop de
 * `translateX(-50%)` no muestre un salto. Con `prefers-reduced-motion` queda estática.
 */
export function CintaAnimada() {
  const contenido = (
    <span className="flex shrink-0 items-center gap-3 px-3">
      {FRASES.map((frase) => (
        <span key={frase} className="flex items-center gap-3">
          <span className="text-sm font-medium whitespace-nowrap text-white">{frase}</span>
          <span className="text-white/40">•</span>
        </span>
      ))}
    </span>
  );

  return (
    <div
      aria-hidden="true"
      className="overflow-hidden bg-zinc-900 py-2.5"
      style={{ maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)' }}
    >
      <div className="cinta-desplazar flex w-max">
        {contenido}
        {contenido}
      </div>
    </div>
  );
}
