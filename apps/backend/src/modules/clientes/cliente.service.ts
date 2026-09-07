import { HttpError } from '../../utils/http-error';
import { tipoDocumentoIdentidadRepository } from '../catalogos/catalogos.repository';
import { validarFormatoDocumento } from '../catalogos/formato-documento.util';
import { clienteRepository } from './cliente.repository';
import type { ActualizarClienteDto, CrearClienteDto } from './cliente.dto';
import type { Cliente } from './cliente.entity';

const RELACIONES = { tipoDocumentoIdentidad: true } as const;

export async function listarClientes(): Promise<Cliente[]> {
  return clienteRepository.find({ relations: RELACIONES, order: { creadoEn: 'DESC' } });
}

export async function obtenerCliente(id: string): Promise<Cliente> {
  const cliente = await clienteRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!cliente) {
    throw new HttpError(404, 'Cliente no encontrado');
  }
  return cliente;
}

async function resolverDocumento(
  tipoDocumentoIdentidadId: string | null | undefined,
  numeroDocumento: string | null | undefined,
  idExcluido?: string,
) {
  if (!tipoDocumentoIdentidadId && !numeroDocumento) {
    return { tipoDocumentoIdentidad: null, numeroDocumento: null };
  }
  if (!tipoDocumentoIdentidadId || !numeroDocumento) {
    const detalles = [
      !tipoDocumentoIdentidadId ? 'tipoDocumentoIdentidadId es requerido' : null,
      !numeroDocumento ? 'numeroDocumento es requerido' : null,
    ].filter((detalle): detalle is string => detalle !== null);
    throw new HttpError(400, 'Debe indicar el tipo y el número de documento juntos', detalles);
  }

  const tipoDocumentoIdentidad = await tipoDocumentoIdentidadRepository.findOneBy({
    id: tipoDocumentoIdentidadId,
  });
  if (!tipoDocumentoIdentidad) {
    throw new HttpError(400, 'El tipo de documento indicado no existe', [
      'tipoDocumentoIdentidadId inválido',
    ]);
  }

  validarFormatoDocumento(tipoDocumentoIdentidad, numeroDocumento);

  const existente = await clienteRepository.findOneBy({
    tipoDocumentoIdentidad: { id: tipoDocumentoIdentidadId },
    numeroDocumento,
  });
  if (existente && existente.id !== idExcluido) {
    throw new HttpError(409, 'Ya existe un cliente registrado con ese tipo y número de documento');
  }

  return { tipoDocumentoIdentidad, numeroDocumento };
}

async function verificarEmailDuplicado(
  email: string | null | undefined,
  idExcluido?: string,
): Promise<void> {
  if (!email) return;
  const existente = await clienteRepository.findOneBy({ email });
  if (existente && existente.id !== idExcluido) {
    throw new HttpError(409, 'Ya existe un cliente con ese correo electrónico');
  }
}

export async function crearCliente(dto: CrearClienteDto): Promise<Cliente> {
  const { tipoDocumentoIdentidad, numeroDocumento } = await resolverDocumento(
    dto.tipoDocumentoIdentidadId,
    dto.numeroDocumento,
  );
  await verificarEmailDuplicado(dto.email);

  const cliente = clienteRepository.create({
    nombres: dto.nombres,
    apellidos: dto.apellidos ?? null,
    tipoDocumentoIdentidad,
    numeroDocumento,
    telefono: dto.telefono ?? null,
    email: dto.email ?? null,
    direccion: dto.direccion ?? null,
  });
  const guardado = await clienteRepository.save(cliente);
  return obtenerCliente(guardado.id);
}

export async function actualizarCliente(id: string, dto: ActualizarClienteDto): Promise<Cliente> {
  const cliente = await obtenerCliente(id);

  if (dto.tipoDocumentoIdentidadId !== undefined || dto.numeroDocumento !== undefined) {
    const tipoId =
      dto.tipoDocumentoIdentidadId !== undefined
        ? dto.tipoDocumentoIdentidadId
        : (cliente.tipoDocumentoIdentidad?.id ?? null);
    const numero =
      dto.numeroDocumento !== undefined ? dto.numeroDocumento : cliente.numeroDocumento;
    const { tipoDocumentoIdentidad, numeroDocumento } = await resolverDocumento(tipoId, numero, id);
    cliente.tipoDocumentoIdentidad = tipoDocumentoIdentidad;
    cliente.numeroDocumento = numeroDocumento;
  }

  if (dto.email !== undefined) {
    await verificarEmailDuplicado(dto.email, id);
    cliente.email = dto.email;
  }

  if (dto.nombres !== undefined) cliente.nombres = dto.nombres;
  if (dto.apellidos !== undefined) cliente.apellidos = dto.apellidos;
  if (dto.telefono !== undefined) cliente.telefono = dto.telefono;
  if (dto.direccion !== undefined) cliente.direccion = dto.direccion;
  if (dto.activo !== undefined) cliente.activo = dto.activo;

  await clienteRepository.save(cliente);
  return obtenerCliente(id);
}

export async function eliminarCliente(id: string): Promise<void> {
  const cliente = await obtenerCliente(id);
  cliente.activo = false;
  await clienteRepository.save(cliente);
}
