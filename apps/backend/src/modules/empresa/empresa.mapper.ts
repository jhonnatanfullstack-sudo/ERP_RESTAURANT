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
