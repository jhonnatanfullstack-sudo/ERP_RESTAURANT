/**
 * Línea de progreso fija en el borde superior que avanza según cuánto de la carta lleva
 * recorrido el visitante. Todo el cálculo vive en CSS (`animation-timeline: scroll()`, ver
 * `.barra-progreso` en index.css): sin listener de scroll ni estado de React, así no se
 * re-renderiza el árbol en cada cuadro. Es decorativa (`aria-hidden`) y en los navegadores
 * sin soporte simplemente no aparece.
 */
export function BarraProgresoLectura() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-40 h-0.5">
      <div className="barra-progreso h-full w-full bg-(--carta-acento)" />
    </div>
  );
}
