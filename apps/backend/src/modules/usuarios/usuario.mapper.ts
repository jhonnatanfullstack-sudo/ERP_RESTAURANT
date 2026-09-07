import type { Usuario } from './usuario.entity';

export function usuarioPublico(usuario: Usuario) {
  return {
    id: usuario.id,
    email: usuario.email,
    activo: usuario.activo,
    personal: {
      id: usuario.personal.id,
      nombres: usuario.personal.nombres,
      apellidoPaterno: usuario.personal.apellidoPaterno,
      apellidoMaterno: usuario.personal.apellidoMaterno,
    },
    rol: {
      id: usuario.rol.id,
      nombre: usuario.rol.nombre,
      permisos: usuario.rol.permisos?.map((permiso) => permiso.codigo) ?? [],
    },
  };
}
