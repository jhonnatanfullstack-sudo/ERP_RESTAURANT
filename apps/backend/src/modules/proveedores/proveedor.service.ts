import { HttpError } from '../../utils/http-error';
import { tipoDocumentoIdentidadRepository } from '../catalogos/catalogos.repository';
import { validarFormatoDocumento } from '../catalogos/formato-documento.util';
import { proveedorRepository } from './proveedor.repository';
import type { ActualizarProveedorDto, CrearProveedorDto } from './proveedor.dto';
import type { Proveedor } from './proveedor.entity';

const RELACIONES = { tipoDocumentoIdentidad: true } as const;

const CODIGO_RUC = '6';
const PREFIJO_RUC_PERSONA_JURIDICA = '20';

export async function listarProveedores(): Promise<Proveedor[]> {
  return proveedorRepository.find({ relations: RELACIONES, order: { creadoEn: 'DESC' } });
}

export async function obtenerProveedor(id: string): Promise<Proveedor> {
  const proveedor = await proveedorRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!proveedor) {
    throw new HttpError(404, 'Proveedor no encontrado');
  }
  return proveedor;
}

function esPersonaJuridica(
  tipoDocumentoIdentidad: { codigo: string },
  numeroDocumento: string,
): boolean {
  return (
    tipoDocumentoIdentidad.codigo === CODIGO_RUC &&
    numeroDocumento.startsWith(PREFIJO_RUC_PERSONA_JURIDICA)
  );
}

/** Igual criterio que Cliente/Personal: un RUC de persona jurídica (empieza en "20") se
 * identifica por razón social, nunca por nombres/apellidos; son mutuamente excluyentes. */
function validarNombreORazonSocial(
  dto: { nombres?: string | null; apellidos?: string | null; razonSocial?: string | null },
  tipoDocumentoIdentidad: { codigo: string },
  numeroDocumento: string,
): { nombres: string | null; apellidos: string | null; razonSocial: string | null } {
  if (esPersonaJuridica(tipoDocumentoIdentidad, numeroDocumento)) {
    if (!dto.razonSocial) {
      throw new HttpError(400, 'Un proveedor con RUC de empresa (20...) requiere razón social', [
        'razonSocial es requerido',
      ]);
    }
    return { nombres: null, apellidos: null, razonSocial: dto.razonSocial };
  }

  if (!dto.nombres) {
    throw new HttpError(400, 'El proveedor requiere nombres', ['nombres es requerido']);
  }
  return { nombres: dto.nombres, apellidos: dto.apellidos ?? null, razonSocial: null };
}

async function resolverDocumento(
  tipoDocumentoIdentidadId: string,
  numeroDocumento: string,
  idExcluido?: string,
) {
  const tipoDocumentoIdentidad = await tipoDocumentoIdentidadRepository.findOneBy({
    id: tipoDocumentoIdentidadId,
  });
  if (!tipoDocumentoIdentidad) {
    throw new HttpError(400, 'El tipo de documento indicado no existe', [
      'tipoDocumentoIdentidadId inválido',
    ]);
  }
  validarFormatoDocumento(tipoDocumentoIdentidad, numeroDocumento);

  const existente = await proveedorRepository.findOneBy({
    tipoDocumentoIdentidad: { id: tipoDocumentoIdentidadId },
    numeroDocumento,
  });
  if (existente && existente.id !== idExcluido) {
    throw new HttpError(
      409,
      'Ya existe un proveedor registrado con ese tipo y número de documento',
    );
  }

  return tipoDocumentoIdentidad;
}

export async function crearProveedor(dto: CrearProveedorDto): Promise<Proveedor> {
  const tipoDocumentoIdentidad = await resolverDocumento(
    dto.tipoDocumentoIdentidadId,
    dto.numeroDocumento,
  );
  const { nombres, apellidos, razonSocial } = validarNombreORazonSocial(
    dto,
    tipoDocumentoIdentidad,
    dto.numeroDocumento,
  );

  const proveedor = proveedorRepository.create({
    nombres,
    apellidos,
    razonSocial,
    tipoDocumentoIdentidad,
    numeroDocumento: dto.numeroDocumento,
    telefono: dto.telefono ?? null,
    email: dto.email ?? null,
    direccion: dto.direccion ?? null,
  });
  const guardado = await proveedorRepository.save(proveedor);
  return obtenerProveedor(guardado.id);
}

export async function actualizarProveedor(
  id: string,
  dto: ActualizarProveedorDto,
): Promise<Proveedor> {
  const proveedor = await obtenerProveedor(id);

  if (dto.tipoDocumentoIdentidadId !== undefined || dto.numeroDocumento !== undefined) {
    const tipoId = dto.tipoDocumentoIdentidadId ?? proveedor.tipoDocumentoIdentidad.id;
    const numero = dto.numeroDocumento ?? proveedor.numeroDocumento;
    proveedor.tipoDocumentoIdentidad = await resolverDocumento(tipoId, numero, id);
    proveedor.numeroDocumento = numero;
  }

  if (dto.nombres !== undefined || dto.apellidos !== undefined || dto.razonSocial !== undefined) {
    const { nombres, apellidos, razonSocial } = validarNombreORazonSocial(
      {
        nombres: dto.nombres !== undefined ? dto.nombres : proveedor.nombres,
        apellidos: dto.apellidos !== undefined ? dto.apellidos : proveedor.apellidos,
        razonSocial: dto.razonSocial !== undefined ? dto.razonSocial : proveedor.razonSocial,
      },
      proveedor.tipoDocumentoIdentidad,
      proveedor.numeroDocumento,
    );
    proveedor.nombres = nombres;
    proveedor.apellidos = apellidos;
    proveedor.razonSocial = razonSocial;
  }
  if (dto.telefono !== undefined) proveedor.telefono = dto.telefono;
  if (dto.email !== undefined) proveedor.email = dto.email;
  if (dto.direccion !== undefined) proveedor.direccion = dto.direccion;
  if (dto.activo !== undefined) proveedor.activo = dto.activo;

  await proveedorRepository.save(proveedor);
  return obtenerProveedor(id);
}

/** Borrado lógico (`activo = false`): un proveedor ya puede tener compras registradas. */
export async function desactivarProveedor(id: string): Promise<void> {
  const proveedor = await obtenerProveedor(id);
  proveedor.activo = false;
  await proveedorRepository.save(proveedor);
}
