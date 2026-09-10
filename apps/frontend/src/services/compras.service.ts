import { api } from './api';
import type { ApiSuccess, Compra } from '../types/api';

export interface LineaCompraInput {
  insumoId?: string;
  productoId?: string;
  cantidad: number;
  costoUnitario: number;
}

export interface CrearCompraInput {
  proveedorId: string;
  almacenId: string;
  tipoComprobanteId?: string;
  serie?: string;
  numero?: string;
  fechaEmision?: string;
  /** Si el costo unitario de cada línea ya incluye IGV o no. */
  incluyeIgv: boolean;
  observacion?: string;
  lineas: LineaCompraInput[];
}

export async function listarCompras() {
  const res = await api.get<ApiSuccess<Compra[]>>('/api/compras');
  return res.data.data;
}

export async function crearCompra(input: CrearCompraInput) {
  const res = await api.post<ApiSuccess<Compra>>('/api/compras', input);
  return res.data.data;
}

export async function actualizarCompra(id: string, input: CrearCompraInput) {
  const res = await api.put<ApiSuccess<Compra>>(`/api/compras/${id}`, input);
  return res.data.data;
}

export async function anularCompra(id: string) {
  const res = await api.post<ApiSuccess<Compra>>(`/api/compras/${id}/anular`);
  return res.data.data;
}
