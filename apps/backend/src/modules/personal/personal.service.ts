import { HttpError } from '../../utils/http-error';
import { empresaRepository } from '../empresa/empresa.repository';
import { tipoDocumentoIdentidadRepository } from '../catalogos/catalogos.repository';
import { usuarioRepository } from '../usuarios/usuario.repository';
import { personalRepository } from './personal.repository';
import type { ActualizarPersonalDto, CrearPersonalDto } from './personal.dto';
import type { Personal } from './personal.entity';
import type { TipoDocumentoIdentidad } from '../catalogos/tipo-documento-identidad.entity';

const RELACIONES = { empresa: true, tipoDocumentoIdentidad: true } as const;

/**
 * Formato esperado del número de documento por código de catálogo SUNAT 06.
 * DNI (1) y RUC (6) tienen formato oficial fijo; CE (4) y Pasaporte (7) son
 * alfanuméricos de longitud variable; "Sin documento" (0) no se valida.
 */
const FORMATOS_DOCUMENTO: Record<string, { patron: RegExp; mensaje: string }> = {
  '1': { patron: /^\d{8}$/, mensaje: 'El DNI debe tener exactamente 8 dígitos' },
  '6': { patron: /^\d{11}$/, mensaje: 'El RUC debe tener exactamente 11 dígitos' },
  '4': {
    patron: /^[A-Za-z0-9]{6,12}$/,
    mensaje: 'El Carné de Extranjería debe tener entre 6 y 12 caracteres alfanuméricos',
  },
  '7': {
    patron: /^[A-Za-z0-9]{6,12}$/,
    mensaje: 'El Pasaporte debe tener entre 6 y 12 caracteres alfanuméricos',
  },
};

function validarFormatoDocumento(
  tipoDocumentoIdentidad: TipoDocumentoIdentidad,
  numeroDocumento: string,
): void {
  const formato = FORMATOS_DOCUMENTO[tipoDocumentoIdentidad.codigo];
  if (formato && !formato.patron.test(numeroDocumento)) {
    throw new HttpError(400, formato.mensaje, [
      'numeroDocumento no coincide con el tipo de documento',
    ]);
  }
}

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

  const personal = personalRepository.create({
    ...dto,
    empresa,
    tipoDocumentoIdentidad,
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
  return personalRepository.save(personal);
}

export async function eliminarPersonal(id: string): Promise<void> {
  const personal = await obtenerPersonal(id);
  personal.activo = false;
  await personalRepository.save(personal);

  await usuarioRepository.update({ personal: { id } }, { activo: false });
}
