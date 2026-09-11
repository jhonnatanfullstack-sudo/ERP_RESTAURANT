import type { Usuario } from './usuario.entity';

export function usuarioPublico(usuario: Usuario) {
  return {
    id: usuario.id,
    email: usuario.email,
    activo: usuario.activo,
    // Habilita el panel del proveedor en la interfaz. No es un permiso del RBAC del
    // restaurante a propósito: ningún rol de un cliente debería poder contenerlo.
    esProveedor: usuario.esProveedor,
    personal: {
      id: usuario.personal.id,
      nombres: usuario.personal.nombres,
      apellidoPaterno: usuario.personal.apellidoPaterno,
      apellidoMaterno: usuario.personal.apellidoMaterno,
      // Un personal persona jurídica no tiene nombres: el frontend arma el
      // nombre a mostrar con `nombrePersonal()`, que necesita este campo.
      razonSocial: usuario.personal.razonSocial,
    },
    rol: {
      id: usuario.rol.id,
      nombre: usuario.rol.nombre,
      permisos: usuario.rol.permisos?.map((permiso) => permiso.codigo) ?? [],
    },
  };
}
