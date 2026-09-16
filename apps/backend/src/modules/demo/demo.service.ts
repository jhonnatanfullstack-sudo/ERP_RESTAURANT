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
import { clienteRepository } from '../clientes/cliente.repository';
import { proveedorRepository } from '../proveedores/proveedor.repository';
import {
  tipoDocumentoIdentidadRepository,
  paisRepository,
  divisionAdministrativaRepository,
} from '../catalogos/catalogos.repository';
import { NUMERO_DOCUMENTO_VARIOS } from '../catalogos/codigos-sunat';
import { generarSlug, resolverSlugDisponible } from '../empresa/slug.util';
import type { RegistrarDemoDto } from './demo.dto';
import type { Empresa } from '../empresa/empresa.entity';
import type { DivisionAdministrativa } from '../catalogos/division-administrativa.entity';

const ROL_ADMINISTRADOR = 'Administrador';
const ALMACEN_PRINCIPAL = 'Almacén principal';
const MS_POR_DIA = 24 * 60 * 60 * 1000;
/** Todo registro de hoy es de un negocio peruano; quien no mande `paisId` cae aquí (FASE 27). */
const CODIGO_ISO2_PERU = 'PE';

export interface DemoCreada {
  empresa: Empresa;
  usuarioId: string;
  rolNombre: string;
  permisos: string[];
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

  const pais = dto.paisId
    ? await paisRepository.findOneBy({ id: dto.paisId })
    : await paisRepository.findOneBy({ codigoIso2: CODIGO_ISO2_PERU });
  if (!pais) {
    throw new HttpError(400, 'El país indicado no existe', ['paisId inválido']);
  }

  // El distrito (nivel 3) es el único nivel que se guarda: departamento y provincia se
  // recuperan navegando `padre` cuando hagan falta, no se duplican en `Empresa`.
  let distrito: DivisionAdministrativa | null = null;
  if (dto.distritoId) {
    distrito = await divisionAdministrativaRepository.findOne({
      where: { id: dto.distritoId, pais: { id: pais.id }, nivel: 3 },
    });
    if (!distrito) {
      throw new HttpError(400, 'El distrito indicado no existe o no pertenece al país elegido', [
        'distritoId inválido',
      ]);
    }
  }

  const slug = await conBypassRls(() =>
    resolverSlugDisponible(generarSlug(dto.nombreComercial ?? dto.razonSocial)),
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
        pais,
        distrito,
        // Se deriva del distrito elegido: es el mismo dato, solo que `ubigeo` es lo que
        // consume directamente el XML de facturación (ver `factura.builder.ts`).
        ubigeo: distrito?.codigo ?? null,
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

  // Placeholder que Pedidos/Ventas/Compras preseleccionan cuando no vale la pena registrar a
  // la contraparte real (público en general, compra menor sin comprobante) — ver
  // `BuscadorCliente`/`BuscadorProveedor` en el frontend. DNI "99999999" es el mismo valor
  // reservado que ya usa `1788980000000-SeedProveedorClienteVarios.ts`.
  const tipoDni = await tipoDocumentoIdentidadRepository.findOneBy({ codigo: '1' });
  if (tipoDni) {
    await clienteRepository.save(
      clienteRepository.create({
        empresa,
        nombres: 'Clientes Varios',
        tipoDocumentoIdentidad: tipoDni,
        numeroDocumento: NUMERO_DOCUMENTO_VARIOS,
      }),
    );
    await proveedorRepository.save(
      proveedorRepository.create({
        empresa,
        nombres: 'Proveedores Varios',
        tipoDocumentoIdentidad: tipoDni,
        numeroDocumento: NUMERO_DOCUMENTO_VARIOS,
      }),
    );
  }

  return {
    empresa,
    usuarioId: usuario.id,
    rolNombre: rol.nombre,
    permisos: permisos.map((permiso) => permiso.codigo),
  };
}
