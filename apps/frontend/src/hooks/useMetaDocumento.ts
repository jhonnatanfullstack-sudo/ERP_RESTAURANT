import { useEffect } from 'react';

interface MetaDocumento {
  /** Título de la pestaña y de la vista previa al compartir. */
  titulo: string;
  descripcion?: string | null;
  /** URL absoluta de la imagen de la vista previa (`og:image`). */
  imagen?: string | null;
}

/** Etiquetas que este hook administra. Se crean si no existen y se limpian al desmontar,
 * para que una ruta no se lleve puestos los metadatos de otra. */
const ETIQUETAS: Array<{ clave: 'name' | 'property'; valor: string }> = [
  { clave: 'name', valor: 'description' },
  { clave: 'property', valor: 'og:title' },
  { clave: 'property', valor: 'og:description' },
  { clave: 'property', valor: 'og:image' },
  { clave: 'property', valor: 'og:url' },
  { clave: 'property', valor: 'og:type' },
  { clave: 'name', valor: 'twitter:card' },
];

function fijarMeta(clave: 'name' | 'property', valor: string, contenido: string) {
  let etiqueta = document.head.querySelector<HTMLMetaElement>(`meta[${clave}="${valor}"]`);
  if (!etiqueta) {
    etiqueta = document.createElement('meta');
    etiqueta.setAttribute(clave, valor);
    // Marca de origen: solo se eliminan al desmontar las etiquetas que creó este hook, no
    // las que pudiera traer el `index.html`.
    etiqueta.dataset.metaDocumento = 'true';
    document.head.appendChild(etiqueta);
  }
  etiqueta.content = contenido;
}

/**
 * Título y metadatos Open Graph de la página actual, para páginas públicas cuyo enlace se
 * comparte (la carta se manda por WhatsApp, y ahí se ve el título, la descripción y la foto).
 * El `index.html` solo puede traer un título genérico porque el nombre real del restaurante
 * vive en la base de datos y llega recién con la consulta de Empresa.
 *
 * No reemplaza al renderizado en servidor: los rastreadores que no ejecutan JavaScript
 * seguirán viendo el `index.html`. Para una carta que se comparte por chat entre personas es
 * suficiente; si algún día se quiere posicionamiento en buscadores, ahí sí hace falta SSR o
 * prerenderizado (ver `docs/decisiones-tecnicas.md`).
 */
export function useMetaDocumento({ titulo, descripcion, imagen }: MetaDocumento) {
  useEffect(() => {
    const tituloPrevio = document.title;
    document.title = titulo;

    fijarMeta('property', 'og:title', titulo);
    fijarMeta('property', 'og:type', 'website');
    fijarMeta('property', 'og:url', window.location.href);
    fijarMeta('name', 'twitter:card', imagen ? 'summary_large_image' : 'summary');
    if (descripcion) {
      fijarMeta('name', 'description', descripcion);
      fijarMeta('property', 'og:description', descripcion);
    }
    if (imagen) fijarMeta('property', 'og:image', imagen);

    return () => {
      document.title = tituloPrevio;
      ETIQUETAS.forEach(({ clave, valor }) => {
        document.head
          .querySelector(`meta[${clave}="${valor}"][data-meta-documento="true"]`)
          ?.remove();
      });
    };
  }, [titulo, descripcion, imagen]);
}
