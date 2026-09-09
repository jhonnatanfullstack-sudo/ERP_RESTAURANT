import { api } from './api';
import type { ApiSuccess, Cliente, DatosDocumento } from '../types/api';

export interface CrearClienteInput {
  nombres?: string | null;
  apellidos?: string | null;
  razonSocial?: string | null;
  tipoDocumentoIdentidadId?: string | null;
  numeroDocumento?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
}

export interface ActualizarClienteInput {
  nombres?: string | null;
  apellidos?: string | null;
  razonSocial?: string | null;
  tipoDocumentoIdentidadId?: string | null;
  numeroDocumento?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  activo?: boolean;
}

export async function listarClientes() {
  const res = await api.get<ApiSuccess<Cliente[]>>('/api/clientes');
  return res.data.data;
}

export async function crearCliente(input: CrearClienteInput) {
  const res = await api.post<ApiSuccess<Cliente>>('/api/clientes', input);
  return res.data.data;
}

export async function actualizarCliente(id: string, input: ActualizarClienteInput) {
  const res = await api.put<ApiSuccess<Cliente>>(`/api/clientes/${id}`, input);
  return res.data.data;
}

export async function eliminarCliente(id: string) {
  await api.delete(`/api/clientes/${id}`);
}

export async function consultarDocumento(tipo: 'dni' | 'ruc', numero: string) {
  const res = await api.get<ApiSuccess<DatosDocumento>>('/api/clientes/consulta-documento', {
    params: { tipo, numero },
  });
  return res.data.data;
}
