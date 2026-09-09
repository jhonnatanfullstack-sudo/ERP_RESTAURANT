import { HttpError } from '../../utils/http-error';
import { empresaRepository } from './empresa.repository';
import type { ActualizarEmpresaDto, CrearEmpresaDto } from './empresa.dto';
import type { Empresa } from './empresa.entity';

export async function listarEmpresas(): Promise<Empresa[]> {
  return empresaRepository.find({ order: { creadoEn: 'ASC' } });
}

/**
 * La empresa activa más antigua — el sistema es de un solo local (ver CLAUDE.md sección 1),
 * así que no hace falta elegir "cuál" mostrar en la carta pública. `null` si todavía no se
 * configuró ninguna: la carta debe poder mostrarse igual, sin datos de contacto.
 */
export async function obtenerEmpresaPublica(): Promise<Empresa | null> {
  return empresaRepository.findOne({ where: { activo: true }, order: { creadoEn: 'ASC' } });
}

export async function obtenerEmpresa(id: string): Promise<Empresa> {
  const empresa = await empresaRepository.findOneBy({ id });
  if (!empresa) {
    throw new HttpError(404, 'Empresa no encontrada');
  }
  return empresa;
}

export async function crearEmpresa(dto: CrearEmpresaDto): Promise<Empresa> {
  const existente = await empresaRepository.findOneBy({ ruc: dto.ruc });
  if (existente) {
    throw new HttpError(409, 'Ya existe una empresa con ese RUC');
  }
  const empresa = empresaRepository.create(dto);
  return empresaRepository.save(empresa);
}

export async function actualizarEmpresa(id: string, dto: ActualizarEmpresaDto): Promise<Empresa> {
  const empresa = await obtenerEmpresa(id);

  if (dto.ruc && dto.ruc !== empresa.ruc) {
    const existente = await empresaRepository.findOneBy({ ruc: dto.ruc });
    if (existente) {
      throw new HttpError(409, 'Ya existe una empresa con ese RUC');
    }
  }

  Object.assign(empresa, dto);
  return empresaRepository.save(empresa);
}
