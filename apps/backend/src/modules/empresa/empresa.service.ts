import { HttpError } from '../../utils/http-error';
import { conBypassRls } from '../../database/tenant-context';
import { empresaRepository } from './empresa.repository';
import { generarSlug, resolverSlugDisponible } from './slug.util';
import {
  paisRepository,
  divisionAdministrativaRepository,
} from '../catalogos/catalogos.repository';
import type { ActualizarEmpresaDto, CrearEmpresaDto } from './empresa.dto';
import type { Empresa } from './empresa.entity';
import type { Pais } from '../catalogos/pais.entity';
import type { DivisionAdministrativa } from '../catalogos/division-administrativa.entity';

interface GeografiaResuelta {
  pais?: Pais | null;
  distrito?: DivisionAdministrativa | null;
  ubigeo?: string | null;
}

/**
 * Resuelve `paisId`/`distritoId` a las entidades reales y deriva `ubigeo` del distrito elegido
 * (FASE 27, mismo criterio que `demo.service.ts::registrarDemo`). Solo toca los campos que el
 * DTO trae — un `PATCH` que no menciona geografía no debe borrarla.
 */
async function resolverGeografia(
  dto: CrearEmpresaDto | ActualizarEmpresaDto,
): Promise<GeografiaResuelta> {
  const resultado: GeografiaResuelta = {};

  if (dto.paisId !== undefined) {
    if (dto.paisId === null) {
      resultado.pais = null;
    } else {
      const pais = await paisRepository.findOneBy({ id: dto.paisId });
      if (!pais) {
        throw new HttpError(400, 'El país indicado no existe', ['paisId inválido']);
      }
      resultado.pais = pais;
    }
  }

  if (dto.distritoId !== undefined) {
    if (dto.distritoId === null) {
      resultado.distrito = null;
      resultado.ubigeo = null;
    } else {
      const distrito = await divisionAdministrativaRepository.findOneBy({
        id: dto.distritoId,
        nivel: 3,
      });
      if (!distrito) {
        throw new HttpError(400, 'El distrito indicado no existe', ['distritoId inválido']);
      }
      resultado.distrito = distrito;
      // El distrito manda sobre un `ubigeo` de texto que haya venido en el mismo DTO: es la
      // fuente de verdad una vez que se elige por el selector geográfico.
      resultado.ubigeo = distrito.codigo;
    }
  }

  return resultado;
}

/** Cadena completa distrito → provincia → departamento, para que el frontend pueda
 * preseleccionar el selector geográfico en cascada sin otra consulta (FASE 27). */
const RELACIONES_GEOGRAFIA = { pais: true, distrito: { padre: { padre: true } } } as const;

export async function listarEmpresas(): Promise<Empresa[]> {
  return empresaRepository.find({
    order: { creadoEn: 'ASC' },
    relations: RELACIONES_GEOGRAFIA,
  });
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
  const empresa = await empresaRepository.findOne({
    where: { id },
    relations: RELACIONES_GEOGRAFIA,
  });
  if (!empresa) {
    throw new HttpError(404, 'Empresa no encontrada');
  }
  return empresa;
}

/**
 * Da de alta una empresa nueva. Como la fila que se crea tiene un `id` que todavía no es el
 * de la sesión actual, la política RLS de `empresas` la rechazaría sin `conBypassRls` — mismo
 * motivo por el que el registro público de demo (`demo.service.ts`) lo necesita (ver
 * `RlsMultiEmpresa`, en `database/migrations`).
 */
export async function crearEmpresa(dto: CrearEmpresaDto): Promise<Empresa> {
  return conBypassRls(async () => {
    const existente = await empresaRepository.findOneBy({ ruc: dto.ruc });
    if (existente) {
      throw new HttpError(409, 'Ya existe una empresa con ese RUC');
    }
    const geografia = await resolverGeografia(dto);
    // La URL de la carta pública se arma del nombre, no del RUC (ver `slug.util.ts`): un RUC
    // no se lee ni se comparte, y el nombre ya es lo que un cliente reconoce. Mismo criterio
    // que el alta por registro público de demo.
    const slug = await resolverSlugDisponible(generarSlug(dto.nombreComercial ?? dto.razonSocial));
    const empresa = empresaRepository.create({ ...dto, ...geografia, slug });
    return empresaRepository.save(empresa);
  });
}

export async function actualizarEmpresa(id: string, dto: ActualizarEmpresaDto): Promise<Empresa> {
  const empresa = await obtenerEmpresa(id);

  if (dto.ruc && dto.ruc !== empresa.ruc) {
    const existente = await empresaRepository.findOneBy({ ruc: dto.ruc });
    if (existente) {
      throw new HttpError(409, 'Ya existe una empresa con ese RUC');
    }
  }

  const geografia = await resolverGeografia(dto);
  const { paisId: _paisId, distritoId: _distritoId, ...resto } = dto;
  Object.assign(empresa, resto, geografia);
  return empresaRepository.save(empresa);
}
