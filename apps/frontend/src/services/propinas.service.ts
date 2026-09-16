import { api } from './api';
import type {
  ApiSuccess,
  MetodoRepartoPropina,
  RepartoPropina,
  VistaPreviaRepartoPropina,
} from '../types/api';

export interface RangoRepartoInput {
  fechaDesde: string;
  fechaHasta: string;
  metodo: MetodoRepartoPropina;
}

export interface CrearRepartoInput extends RangoRepartoInput {
  observacion?: string;
}

export async function listarRepartos() {
  const res = await api.get<ApiSuccess<RepartoPropina[]>>('/api/propinas');
  return res.data.data;
}

export async function obtenerReparto(id: string) {
  const res = await api.get<ApiSuccess<RepartoPropina>>(`/api/propinas/${id}`);
  return res.data.data;
}

export async function vistaPreviaReparto(input: RangoRepartoInput) {
  const res = await api.get<ApiSuccess<VistaPreviaRepartoPropina>>('/api/propinas/vista-previa', {
    params: input,
  });
  return res.data.data;
}

export async function crearReparto(input: CrearRepartoInput) {
  const res = await api.post<ApiSuccess<RepartoPropina>>('/api/propinas', input);
  return res.data.data;
}
