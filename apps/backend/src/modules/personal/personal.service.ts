import { HttpError } from '../../utils/http-error';
import { empresaRepository } from '../empresa/empresa.repository';
import { tipoDocumentoIdentidadRepository } from '../catalogos/catalogos.repository';
import { validarFormatoDocumento } from '../catalogos/formato-documento.util';
import { usuarioRepository } from '../usuarios/usuario.repository';
import { personalRepository } from './personal.repository';
import type { ActualizarPersonalDto, CrearPersonalDto } from './personal.dto';
import type { Personal } from './personal.entity';

const RELACIONES = { empresa: true, tipoDocumentoIdentidad: true } as const;

const CODIGO_RUC = '6';
const PREFIJO_RUC_PERSONA_JURIDICA = '20';

export async function listarPersonal(): Promise<Personal[]> {
  return personalRepository.find({ relations: RELACIONES, order: { creadoEn: 'DESC' } });
}

export async function obtenerPersonal(id: string): Promise<Personal> {
  const personal = await personalRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!personal) {
    throw new HttpError(404, 'Personal no encontrado');
  }
  return personal;
}

/** Un RUC que empieza en "20" es de persona jurídica (empresa): se identifica por
 * razón social y no tiene nombres ni apellidos. Misma regla que en Clientes
 * (`cliente.service.ts: esPersonaJuridica`) — si cambia, cambia en ambos. */
function esPersonaJuridica(
  tipoDocumentoIdentidad: { codigo: string },
  numeroDocumento: string,
): boolean {
  return (
    tipoDocumentoIdentidad.codigo === CODIGO_RUC &&
    numeroDocumento.startsWith(PREFIJO_RUC_PERSONA_JURIDICA)
  );
}

interface CamposIdentidad {
  nombres?: string | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  razonSocial?: string | null;
}

/**
 * Persona jurídica → razón social; persona natural → nombres y apellidos.
 * Son mutuamente excluyentes: se devuelve limpio el que no corresponde, para que
 * un registro no quede con datos contradictorios al cambiar de tipo de documento.
 */
function resolverIdentidad(
  campos: CamposIdentidad,
  tipoDocumentoIdentidad: { codigo: string },
  numeroDocumento: string,
): {
  nombres: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  razonSocial: string | null;
} {
  if (esPersonaJuridica(tipoDocumentoIdentidad, numeroDocumento)) {
    if (!campos.razonSocial?.trim()) {
      throw new HttpError(400, 'Un registro con RUC de empresa (20...) requiere razón social', [
        'razonSocial es requerido',
      ]);
    }
    return {
      nombres: null,
      apellidoPaterno: null,
      apellidoMaterno: null,
      razonSocial: campos.razonSocial,
    };
  }

  if (!campos.nombres?.trim()) {
    throw new HttpError(400, 'El personal requiere nombres', ['nombres es requerido']);
  }
  return {
    nombres: campos.nombres,
    apellidoPaterno: campos.apellidoPaterno ?? null,
    apellidoMaterno: campos.apellidoMaterno ?? null,
    razonSocial: null,
  };
}

async function validarDocumentoUnico(
  tipoDocumentoIdentidadId: string,
  numeroDocumento: string,
  idExcluir?: string,
): Promise<void> {
  const existente = await personalRepository.findOne({
    where: { tipoDocumentoIdentidad: { id: tipoDocumentoIdentidadId }, numeroDocumento },
  });
  if (existente && existente.id !== idExcluir) {
    throw new HttpError(409, 'Ya existe una persona registrada con ese tipo y número de documento');
  }
}

export async function crearPersonal(dto: CrearPersonalDto): Promise<Personal> {
  const empresa = await empresaRepository.findOneBy({ id: dto.empresaId });
  if (!empresa) {
    throw new HttpError(400, 'La empresa indicada no existe', ['empresaId inválido']);
  }

  const tipoDocumentoIdentidad = await tipoDocumentoIdentidadRepository.findOneBy({
    id: dto.tipoDocumentoIdentidadId,
  });
  if (!tipoDocumentoIdentidad) {
    throw new HttpError(400, 'El tipo de documento indicado no existe', [
      'tipoDocumentoIdentidadId inválido',
    ]);
  }

  validarFormatoDocumento(tipoDocumentoIdentidad, dto.numeroDocumento);
  await validarDocumentoUnico(dto.tipoDocumentoIdentidadId, dto.numeroDocumento);

  const identidad = resolverIdentidad(dto, tipoDocumentoIdentidad, dto.numeroDocumento);

  const personal = personalRepository.create({
    ...dto,
    empresa,
    tipoDocumentoIdentidad,
    ...identidad,
  });
  return personalRepository.save(personal);
}

export async function actualizarPersonal(
  id: string,
  dto: ActualizarPersonalDto,
): Promise<Personal> {
  const personal = await obtenerPersonal(id);

  if (dto.empresaId) {
    const empresa = await empresaRepository.findOneBy({ id: dto.empresaId });
    if (!empresa) {
      throw new HttpError(400, 'La empresa indicada no existe', ['empresaId inválido']);
    }
    personal.empresa = empresa;
  }

  if (dto.tipoDocumentoIdentidadId) {
    const tipoDocumentoIdentidad = await tipoDocumentoIdentidadRepository.findOneBy({
      id: dto.tipoDocumentoIdentidadId,
    });
    if (!tipoDocumentoIdentidad) {
      throw new HttpError(400, 'El tipo de documento indicado no existe', [
        'tipoDocumentoIdentidadId inválido',
      ]);
    }
    personal.tipoDocumentoIdentidad = tipoDocumentoIdentidad;
  }

  if (dto.numeroDocumento || dto.tipoDocumentoIdentidadId) {
    validarFormatoDocumento(
      personal.tipoDocumentoIdentidad,
      dto.numeroDocumento ?? personal.numeroDocumento,
    );
    await validarDocumentoUnico(
      dto.tipoDocumentoIdentidadId ?? personal.tipoDocumentoIdentidad.id,
      dto.numeroDocumento ?? personal.numeroDocumento,
      personal.id,
    );
  }

  const { empresaId: _empresaId, tipoDocumentoIdentidadId: _tipoDocId, ...resto } = dto;
  Object.assign(personal, resto);

  // La identidad se revalida sobre el registro ya fusionado: así un cambio de
  // documento (p. ej. DNI → RUC 20) exige la razón social aunque el resto del
  // formulario no haya cambiado, y limpia los campos que dejan de aplicar.
  Object.assign(
    personal,
    resolverIdentidad(personal, personal.tipoDocumentoIdentidad, personal.numeroDocumento),
  );

  return personalRepository.save(personal);
}

export async function eliminarPersonal(id: string): Promise<void> {
  const personal = await obtenerPersonal(id);
  personal.activo = false;
  await personalRepository.save(personal);

  await usuarioRepository.update({ personal: { id } }, { activo: false });
}
