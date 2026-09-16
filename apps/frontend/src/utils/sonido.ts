/**
 * Beep corto generado con Web Audio, sin depender de un archivo `.mp3` que mantener en el
 * repo. Los navegadores exigen que el audio arranque a partir de un gesto del usuario: en
 * `Cocina.tsx` alcanza con que el mesero haya tocado cualquier botón de la pantalla (cambiar el
 * filtro, marcar una comanda) antes de que llegue la primera comanda nueva.
 */
export function reproducirTono(frecuenciaHz: number, duracionMs = 180): void {
  try {
    const ContextoAudio =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ContextoAudio) return;
    const contexto = new ContextoAudio();
    const oscilador = contexto.createOscillator();
    const ganancia = contexto.createGain();
    oscilador.type = 'sine';
    oscilador.frequency.value = frecuenciaHz;
    // Rampa exponencial en vez de cortar seco: así el beep no "clickea" al terminar.
    ganancia.gain.setValueAtTime(0.15, contexto.currentTime);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, contexto.currentTime + duracionMs / 1000);
    oscilador.connect(ganancia);
    ganancia.connect(contexto.destination);
    oscilador.start();
    oscilador.stop(contexto.currentTime + duracionMs / 1000);
    oscilador.onended = () => void contexto.close();
  } catch {
    // Web Audio no disponible o bloqueado por el navegador: sin sonido, sin romper la pantalla.
  }
}

/** Timbre de "comanda nueva": dos tonos ascendentes, distinto del de "lista" para que cocina
 * distinga de oído cuál de las dos alertas fue sin mirar la pantalla. */
export function sonarComandaNueva(): void {
  reproducirTono(740);
  window.setTimeout(() => reproducirTono(988), 140);
}

/** Timbre de "comanda lista": un solo tono, más agudo y corto. */
export function sonarComandaLista(): void {
  reproducirTono(1180, 220);
}
