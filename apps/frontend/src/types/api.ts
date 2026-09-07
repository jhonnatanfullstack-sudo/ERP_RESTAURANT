export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiError {
  success: false;
  message: string;
  details: string[];
}

export interface Permiso {
  id: string;
  codigo: string;
  descripcion: string | null;
}

export interface Rol {
  id: string;
  nombre: string;
  descripcion: string | null;
  permisos: Permiso[];
}

export interface TipoDocumentoIdentidad {
  id: string;
  codigo: string;
  nombre: string;
}

export interface Empresa {
  id: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  direccionFiscal: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
}

export interface Personal {
  id: string;
  empresa: Empresa;
  tipoDocumentoIdentidad: TipoDocumentoIdentidad;
  numeroDocumento: string;
  nombres: string;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  activo: boolean;
}

export interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export interface Marca {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export interface UnidadMedida {
  id: string;
  codigo: string;
  nombre: string;
}

export interface Producto {
  id: string;
  categoria: Pick<Categoria, 'id' | 'nombre'>;
  marca: Pick<Marca, 'id' | 'nombre'> | null;
  unidadMedida: UnidadMedida;
  nombre: string;
  descripcion: string | null;
  precio: number;
  imagenUrl: string | null;
  activo: boolean;
}

export interface Salon {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export interface Mesa {
  id: string;
  salon: Pick<Salon, 'id' | 'nombre'>;
  numero: string;
  capacidad: number;
  activo: boolean;
}

export interface Cliente {
  id: string;
  nombres: string;
  apellidos: string | null;
  numeroDocumento: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  activo: boolean;
}

export interface Usuario {
  id: string;
  email: string;
  activo: boolean;
  personal: Pick<Personal, 'id' | 'nombres' | 'apellidoPaterno' | 'apellidoMaterno'>;
  rol: Pick<Rol, 'id' | 'nombre'>;
}

export interface UsuarioAutenticado {
  id: string;
  email: string;
  activo: boolean;
  personal: {
    id: string;
    nombres: string;
    apellidoPaterno: string | null;
    apellidoMaterno: string | null;
  };
  rol: { id: string; nombre: string; permisos: string[] };
}
