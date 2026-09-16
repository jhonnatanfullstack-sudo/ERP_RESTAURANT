import type { Empresa } from './empresa.entity';

/**
 * Vista pública de la empresa, para la carta digital (`GET /api/empresas/publico`, sin
 * autenticación). Expone solo lo que un cliente externo necesita ver — nombre, dirección,
 * teléfono, logo — nunca el RUC ni el email de contacto interno.
 */
export function empresaPublica(empresa: Empresa) {
  return {
    nombre: empresa.nombreComercial ?? empresa.razonSocial,
    direccion: empresa.direccionFiscal,
    telefono: empresa.telefono,
    logo: empresa.logo,
  };
}

export type EmpresaPublica = ReturnType<typeof empresaPublica>;

/**
 * A diferencia de `empresaPublica` (carta digital, donde el RUC no aporta nada), el formato
 * oficial del Libro de Reclamaciones exige identificar al proveedor con su razón social y RUC
 * — es información que el consumidor necesita para saber contra quién está reclamando, no un
 * dato interno. Ver `carta-publica.routes.ts`.
 */
export function empresaParaReclamaciones(empresa: Empresa) {
  return {
    razonSocial: empresa.razonSocial,
    ruc: empresa.ruc,
    direccion: empresa.direccionFiscal,
  };
}
