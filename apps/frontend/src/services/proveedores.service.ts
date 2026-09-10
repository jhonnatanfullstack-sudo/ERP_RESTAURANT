import { api } from './api';
import type { ApiSuccess, DatosDocumento, Proveedor } from '../types/api';

export interface CrearProveedorInput {
  nombres?: string | null;
  apellidos?: string | null;
  razonSocial?: string | null;
  tipoDocumentoIdentidadId: string;
  numeroDocumento: string;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
}

export interface ActualizarProveedorInput {
  nombres?: string | null;
  apellidos?: string | null;
  razonSocial?: string | null;
  tipoDocumentoIdentidadId?: string;
  numeroDocumento?: string;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  activo?: boolean;
}

export async function listarProveedores() {
  const res = await api.get<ApiSuccess<Proveedor[]>>('/api/proveedores');
  return res.data.data;
}

export async function crearProveedor(input: CrearProveedorInput) {
  const res = await api.post<ApiSuccess<Proveedor>>('/api/proveedores', input);
  return res.data.data;
}

export async function actualizarProveedor(id: string, input: ActualizarProveedorInput) {
  const res = await api.put<ApiSuccess<Proveedor>>(`/api/proveedores/${id}`, input);
  return res.data.data;
}

export async function eliminarProveedor(id: string) {
  await api.delete(`/api/proveedores/${id}`);
}

export async function consultarDocumento(tipo: 'dni' | 'ruc', numero: string) {
  const res = await api.get<ApiSuccess<DatosDocumento>>('/api/proveedores/consulta-documento', {
    params: { tipo, numero },
  });
  return res.data.data;
}
