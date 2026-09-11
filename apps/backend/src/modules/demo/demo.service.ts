import bcrypt from 'bcrypt';
import { env } from '../../config/env';
import { HttpError } from '../../utils/http-error';
import { conBypassRls, establecerEmpresaDeLaPeticion } from '../../database/tenant-context';
import { empresaRepository } from '../empresa/empresa.repository';
import { PlanEmpresa } from '../empresa/empresa.entity';
import { personalRepository } from '../personal/personal.repository';
import { usuarioRepository } from '../usuarios/usuario.repository';
import { rolRepository } from '../roles/rol.repository';
import { permisoRepository } from '../permisos/permiso.repository';
import { almacenRepository } from '../almacenes/almacen.repository';
import { tipoDocumentoIdentidadRepository } from '../catalogos/catalogos.repository';
import { SLUG_RESERVADOS } from './demo.dto';
import type { RegistrarDemoDto } from './demo.dto';
import type { Empresa } from '../empresa/empresa.entity';

const ROL_ADMINISTRADOR = 'Administrador';
const ALMACEN_PRINCIPAL = 'Almacén principal';
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface DemoCreada {
  empresa: Empresa;
  usuarioId: string;
  rolNombre: string;
  permisos: string[];
}

/**
 * Convierte el nombre del restaurante en un slug para la URL pública de su carta. Quita
 * tildes (el enlace se dicta por teléfono y se escribe a mano) y todo lo que no sea letra,
 * número o guion.
 */
function aSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/**
 * Busca un slug libre. Dos restaurantes pueden llamarse igual, así que si el natural está
 * tomado se le agrega un sufijo numérico en vez de fallar el registro por algo que no es
 * culpa de quien se registra.
 */
async function slugDisponible(base: string): Promise<string> {
  const raiz = base || 'restaurante';
  for (let intento = 0; intento < 50; intento += 1) {
    const candidato = intento === 0 ? raiz : `${raiz}-${intento + 1}`;
    if (SLUG_RESERVADOS.includes(candidato)) continue;
    const tomado = await empresaRepository.findOneBy({ slug: candidato });
    if (!tomado) return candidato;
  }
  throw new HttpError(
    409,
    'No se pudo generar una dirección para tu carta, intenta con otro nombre',
  );
}

/**
 * Alta de una cuenta de prueba desde el registro público (FASE 26).
 *
 * Aprovisiona una empresa completa y lista para usar: la empresa misma, el rol
 * Administrador con **todos** los permisos, la persona que la administra, su usuario y el
 * almacén principal (sin él, Inventario no puede registrar movimientos automáticos).
 *
 * **Sobre el bypass de RLS.** Las primeras dos consultas corren sin aislamiento por una
 * razón concreta: verifican que el RUC y el correo no estén tomados **por ninguna empresa**,
 * y esa pregunta es transversal por definición. Apenas la empresa existe se fija como empresa
 * de la petición y todo lo demás se crea ya dentro del aislamiento normal — el rol, el
 * personal, el usuario y el almacén se graban con su `empresa_id` y bajo las políticas RLS,
 * igual que cualquier otra escritura del sistema.
 */
export async function registrarDemo(dto: RegistrarDemoDto): Promise<DemoCreada> {
  const { rucTomado, emailTomado } = await conBypassRls(async () => ({
    rucTomado: await empresaRepository.findOneBy({ ruc: dto.ruc }),
    emailTomado: await usuarioRepository.findOneBy({ email: dto.email }),
  }));

  if (rucTomado) {
    throw new HttpError(
      409,
      'Ya existe una cuenta registrada con ese RUC. Si es tu negocio, inicia sesión o escríbenos.',
    );
  }
  if (emailTomado) {
    throw new HttpError(409, 'Ya existe una cuenta con ese correo');
  }

  const tipoDocumento = await tipoDocumentoIdentidadRepository.findOneBy({
    id: dto.tipoDocumentoIdentidadId,
  });
  if (!tipoDocumento) {
    throw new HttpError(400, 'El tipo de documento indicado no existe', [
      'tipoDocumentoIdentidadId inválido',
    ]);
  }

  const slug = await conBypassRls(() =>
    slugDisponible(aSlug(dto.nombreComercial ?? dto.razonSocial)),
  );

  const empresa = await conBypassRls(() =>
    empresaRepository.save(
      empresaRepository.create({
        ruc: dto.ruc,
        razonSocial: dto.razonSocial,
        nombreComercial: dto.nombreComercial ?? null,
        direccionFiscal: dto.direccionFiscal ?? null,
        telefono: dto.telefono ?? null,
        email: dto.email,
        slug,
        plan: PlanEmpresa.DEMO,
        demoExpiraEn: new Date(Date.now() + env.demo.diasDePrueba * MS_POR_DIA),
        creadaPorAutoservicio: true,
        activo: true,
      }),
    ),
  );

  // A partir de acá la petición ya tiene empresa: el resto se crea bajo las políticas RLS.
  await establecerEmpresaDeLaPeticion(empresa.id);

  // El catálogo de permisos es global y controlado por código (ver `roles-y-permisos.md`):
  // el Administrador de cada empresa nueva los recibe todos, y desde ahí el restaurante
  // arma sus propios roles más acotados.
  const permisos = await permisoRepository.find();
  const rol = await rolRepository.save(
    rolRepository.create({
      nombre: ROL_ADMINISTRADOR,
      descripcion: 'Acceso total al sistema',
      permisos,
    }),
  );

  const personal = await personalRepository.save(
    personalRepository.create({
      empresa,
      tipoDocumentoIdentidad: tipoDocumento,
      numeroDocumento: dto.numeroDocumento,
      nombres: dto.nombres,
      apellidoPaterno: dto.apellidoPaterno,
      apellidoMaterno: dto.apellidoMaterno ?? null,
      activo: true,
    }),
  );

  const usuario = await usuarioRepository.save(
    usuarioRepository.create({
      personal,
      email: dto.email,
      passwordHash: await bcrypt.hash(dto.password, 12),
      rol,
      activo: true,
    }),
  );

  await almacenRepository.save(
    almacenRepository.create({
      empresa,
      nombre: ALMACEN_PRINCIPAL,
      esPrincipal: true,
      activo: true,
    }),
  );

  return {
    empresa,
    usuarioId: usuario.id,
    rolNombre: rol.nombre,
    permisos: permisos.map((permiso) => permiso.codigo),
  };
}
