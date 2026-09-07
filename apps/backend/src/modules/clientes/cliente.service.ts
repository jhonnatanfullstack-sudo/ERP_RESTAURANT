import { HttpError } from '../../utils/http-error';
import { clienteRepository } from './cliente.repository';
import type { ActualizarClienteDto, CrearClienteDto } from './cliente.dto';
import type { Cliente } from './cliente.entity';

export async function listarClientes(): Promise<Cliente[]> {
  return clienteRepository.find({ order: { creadoEn: 'DESC' } });
}

export async function obtenerCliente(id: string): Promise<Cliente> {
  const cliente = await clienteRepository.findOneBy({ id });
  if (!cliente) {
    throw new HttpError(404, 'Cliente no encontrado');
  }
  return cliente;
}

async function verificarDuplicados(
  dto: { numeroDocumento?: string | null; email?: string | null },
  idExcluido?: string,
): Promise<void> {
  if (dto.numeroDocumento) {
    const existente = await clienteRepository.findOneBy({ numeroDocumento: dto.numeroDocumento });
    if (existente && existente.id !== idExcluido) {
      throw new HttpError(409, 'Ya existe un cliente con ese número de documento');
    }
  }
  if (dto.email) {
    const existente = await clienteRepository.findOneBy({ email: dto.email });
    if (existente && existente.id !== idExcluido) {
      throw new HttpError(409, 'Ya existe un cliente con ese correo electrónico');
    }
  }
}

export async function crearCliente(dto: CrearClienteDto): Promise<Cliente> {
  await verificarDuplicados(dto);
  const cliente = clienteRepository.create({
    nombres: dto.nombres,
    apellidos: dto.apellidos ?? null,
    numeroDocumento: dto.numeroDocumento ?? null,
    telefono: dto.telefono ?? null,
    email: dto.email ?? null,
    direccion: dto.direccion ?? null,
  });
  return clienteRepository.save(cliente);
}

export async function actualizarCliente(id: string, dto: ActualizarClienteDto): Promise<Cliente> {
  const cliente = await obtenerCliente(id);
  await verificarDuplicados(dto, id);

  if (dto.nombres !== undefined) cliente.nombres = dto.nombres;
  if (dto.apellidos !== undefined) cliente.apellidos = dto.apellidos;
  if (dto.numeroDocumento !== undefined) cliente.numeroDocumento = dto.numeroDocumento;
  if (dto.telefono !== undefined) cliente.telefono = dto.telefono;
  if (dto.email !== undefined) cliente.email = dto.email;
  if (dto.direccion !== undefined) cliente.direccion = dto.direccion;
  if (dto.activo !== undefined) cliente.activo = dto.activo;

  return clienteRepository.save(cliente);
}

export async function eliminarCliente(id: string): Promise<void> {
  const cliente = await obtenerCliente(id);
  cliente.activo = false;
  await clienteRepository.save(cliente);
}
