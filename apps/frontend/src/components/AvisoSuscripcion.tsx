import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, Lock, Mail, Phone } from 'lucide-react';
import * as suscripcionService from '../services/suscripcion.service';
import type { ResumenSuscripcion } from '../types/api';

/** A partir de cuántos días restantes el aviso deja de ser informativo y pasa a urgente. */
const DIAS_PARA_URGENCIA = 3;

function Contacto({ contacto }: { contacto: ResumenSuscripcion['contactoProveedor'] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {contacto.telefono && (
        <a
          href={`https://wa.me/${contacto.telefono.replace(/\D/g, '')}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-2"
        >
          <Phone className="h-3.5 w-3.5" strokeWidth={2.25} />
          {contacto.telefono}
        </a>
      )}
      {contacto.email && (
        <a
          href={`mailto:${contacto.email}`}
          className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-2"
        >
          <Mail className="h-3.5 w-3.5" strokeWidth={2.25} />
          {contacto.email}
        </a>
      )}
    </span>
  );
}

/**
 * Barra de estado de la cuenta, sobre el contenido del panel.
 *
 * Solo aparece cuando hay algo que decir: en una cuenta contratada no ocupa espacio. Durante
 * la prueba informa cuánto queda, y cuando vence explica en el mismo lugar por qué dejó de
 * poder registrar y con quién continuar — sin eso, el usuario solo vería que sus botones
 * empezaron a fallar.
 */
export function AvisoSuscripcion() {
  const { data: suscripcion } = useQuery({
    queryKey: ['suscripcion'],
    queryFn: suscripcionService.obtenerSuscripcion,
    // La cuenta puede vencer con la sesión abierta: se revalida al volver a la pestaña en
    // vez de quedarse mostrando "quedan 2 días" durante horas.
    refetchOnWindowFocus: true,
    staleTime: 5 * 60 * 1000,
  });

  if (!suscripcion || suscripcion.estado === 'activa') return null;

  if (suscripcion.estado === 'suspendida') {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800 sm:px-8">
        <Lock className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        <span className="font-semibold">Cuenta suspendida.</span>
        <span>Comunícate con {suscripcion.contactoProveedor.nombre} para reactivarla:</span>
        <Contacto contacto={suscripcion.contactoProveedor} />
      </div>
    );
  }

  if (suscripcion.estado === 'demo_vencida') {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800 sm:px-8">
        <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        <span className="font-semibold">Tu prueba terminó.</span>
        <span>
          Puedes seguir consultando lo que cargaste, pero para volver a registrar activa el sistema
          con {suscripcion.contactoProveedor.nombre}:
        </span>
        <Contacto contacto={suscripcion.contactoProveedor} />
      </div>
    );
  }

  const urgente = (suscripcion.diasRestantes ?? 0) <= DIAS_PARA_URGENCIA;
  const dias = suscripcion.diasRestantes ?? 0;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-5 py-3 text-sm sm:px-8 ${
        urgente
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-zinc-200 bg-zinc-50 text-zinc-600'
      }`}
    >
      <Clock className="h-4 w-4 shrink-0" strokeWidth={2.25} />
      <span className="font-semibold">
        {dias === 1 ? 'Te queda 1 día de prueba' : `Te quedan ${dias} días de prueba`}
      </span>
      {urgente && (
        <>
          <span>Activa el sistema con {suscripcion.contactoProveedor.nombre}:</span>
          <Contacto contacto={suscripcion.contactoProveedor} />
        </>
      )}
    </div>
  );
}
