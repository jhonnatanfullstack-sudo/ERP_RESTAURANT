# PROMPT MAESTRO — SISTEMA WEB DE GESTIÓN PARA RESTAURANTE

Quiero desarrollar un sistema web profesional, escalable y mantenible para la gestión integral de un restaurante.

El sistema debe construirse de manera incremental, respetando estrictamente la arquitectura y las decisiones técnicas establecidas en este documento.

## 1. OBJETIVO GENERAL

Desarrollar un sistema web completo para administrar las operaciones de un restaurante, incluyendo:

* Usuarios
* Roles
* Permisos
* Autenticación
* Dashboard
* Categorías
* Productos
* Carta
* Mesas
* Salones
* Pedidos
* Detalle de pedidos
* Comandas
* Cocina
* Estados de pedidos
* Clientes
* Métodos de pago
* Ventas
* Caja
* Apertura y cierre de caja
* Movimientos de caja
* Inventario
* Insumos
* Proveedores
* Compras
* Stock
* Kardex
* Recetas
* Costos
* Reportes
* Auditoría
* Configuración del restaurante

El sistema deberá estar preparado para futuras ampliaciones como:

* Facturación electrónica SUNAT
* Delivery
* Pedidos mediante código QR
* Aplicación móvil
* Múltiples sucursales
* Integración con impresoras térmicas
* Integración con cocina
* Inteligencia artificial y analítica avanzada

NO implementar estas funcionalidades futuras todavía. Solamente diseñar la arquitectura de manera que puedan incorporarse posteriormente.

---

# 2. STACK TECNOLÓGICO OBLIGATORIO

NO cambiar estas tecnologías sin mi autorización explícita.

## Frontend

* React
* TypeScript
* Vite
* TailwindCSS
* Axios
* React Router
* TanStack Query

## Backend

* Node.js
* TypeScript
* Express
* TypeORM
* PostgreSQL

## Seguridad

* JWT
* bcrypt
* Helmet
* CORS
* Rate Limiting
* Validación de datos
* Control de acceso mediante roles y permisos
* Manejo centralizado de errores
* Protección contra ataques comunes

## Desarrollo

* Git
* GitHub
* ESLint
* Prettier
* Variables de entorno mediante .env
* Migraciones de base de datos

NO utilizar Prisma.

NO utilizar MongoDB.

NO cambiar PostgreSQL por otra base de datos.

NO cambiar Express por NestJS.

NO cambiar React por Vue, Angular u otro framework.

NO cambiar TypeORM por Prisma u otro ORM.

---

# 3. ARQUITECTURA

Utilizar una arquitectura modular y escalable.

El backend deberá utilizar separación clara de responsabilidades:

Controller
↓
Service
↓
Repository
↓
Entity
↓
PostgreSQL

No colocar lógica de negocio compleja dentro de los Controllers.

Los Controllers deben encargarse principalmente de:

* Recibir solicitudes HTTP
* Validar la entrada
* Invocar Services
* Devolver respuestas

Los Services deben contener la lógica de negocio.

Los Repositories deben encargarse del acceso a datos.

Las Entities deben representar las entidades de la base de datos.

---

# 4. ESTRUCTURA GENERAL DEL PROYECTO

Utilizar una estructura similar a:

restaurant-erp/

├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── database/
│   │   │   ├── middlewares/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── usuarios/
│   │   │   │   ├── roles/
│   │   │   │   ├── permisos/
│   │   │   │   ├── productos/
│   │   │   │   ├── categorias/
│   │   │   │   ├── mesas/
│   │   │   │   ├── salones/
│   │   │   │   ├── pedidos/
│   │   │   │   ├── cocina/
│   │   │   │   ├── clientes/
│   │   │   │   ├── ventas/
│   │   │   │   ├── caja/
│   │   │   │   ├── inventario/
│   │   │   │   ├── compras/
│   │   │   │   ├── proveedores/
│   │   │   │   ├── recetas/
│   │   │   │   ├── reportes/
│   │   │   │   ├── auditoria/
│   │   │   │   └── configuracion/
│   │   │   ├── routes/
│   │   │   ├── utils/
│   │   │   ├── types/
│   │   │   ├── app.ts
│   │   │   └── server.ts
│   │   └── package.json
│   │
│   └── frontend/
│       ├── src/
│       │   ├── components/
│       │   ├── layouts/
│       │   ├── pages/
│       │   ├── hooks/
│       │   ├── services/
│       │   ├── context/
│       │   ├── routes/
│       │   ├── types/
│       │   ├── utils/
│       │   └── App.tsx
│       └── package.json
│
├── packages/
│   ├── types/
│   ├── validation/
│   └── config/
│
├── docs/
│
├── .env.example
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
└── README.md

Puedes adaptar esta estructura si existe una razón técnica real, pero debes explicarme el motivo antes de modificarla.

---

# 5. BASE DE DATOS

Utilizar PostgreSQL.

Los nombres de tablas y columnas deben estar en español.

Ejemplo:

usuarios
roles
permisos
productos
categorias
mesas
pedidos
detalle_pedidos
ventas
cajas
movimientos_caja
inventarios
proveedores
compras

Utilizar UUID como identificadores principales cuando sea apropiado.

Utilizar claves foráneas correctamente.

Utilizar índices donde sean necesarios.

Utilizar restricciones de integridad.

No utilizar:

synchronize: true

en ambientes de desarrollo compartido o producción.

La estructura de la base de datos debe gestionarse mediante migraciones de TypeORM.

---

# 6. SEGURIDAD

La seguridad es obligatoria.

Implementar:

* JWT
* Access Token
* Refresh Token cuando corresponda
* bcrypt para contraseñas
* Roles
* Permisos
* Middleware de autenticación
* Middleware de autorización
* Validación de entrada
* Helmet
* CORS configurado correctamente
* Rate limiting
* Sanitización cuando sea necesaria
* Manejo seguro de errores
* No exponer información sensible
* Variables sensibles únicamente mediante variables de entorno
* No almacenar contraseñas en texto plano
* No almacenar secretos dentro del código fuente

Nunca devolver contraseñas en las respuestas de la API.

---

# 7. API

Crear una API REST.

Utilizar una estructura consistente.

Ejemplo:

GET
POST
PUT/PATCH
DELETE

Utilizar respuestas JSON consistentes.

Ejemplo conceptual:

{
"success": true,
"message": "...",
"data": {}
}

Para errores:

{
"success": false,
"message": "...",
"details": []
}

Utilizar códigos HTTP apropiados.

---

# 8. FRONTEND

El frontend debe tener una interfaz administrativa profesional.

Utilizar:

* React
* TypeScript
* TailwindCSS
* React Router
* Axios
* TanStack Query

Debe existir:

* Login
* Layout principal
* Sidebar
* Navbar
* Dashboard
* Menús
* Tablas
* Formularios
* Modales
* Confirmaciones
* Alertas
* Loading states
* Manejo de errores
* Diseño responsive

La interfaz debe ser limpia y profesional.

No generar interfaces excesivamente complejas sin necesidad.

---

# 9. AUTENTICACIÓN

El usuario debe poder:

* Iniciar sesión
* Cerrar sesión
* Consultar sesión actual
* Cambiar contraseña

El sistema debe verificar:

Usuario
↓
Credenciales
↓
JWT
↓
Usuario autenticado
↓
Roles
↓
Permisos
↓
Acceso al recurso

---

# 10. ROLES Y PERMISOS

El sistema debe soportar RBAC.

Ejemplo:

Administrador
Gerente
Cajero
Mesero
Cocinero
Almacenero

Los permisos deben poder ser específicos.

Ejemplo:

usuarios.ver
usuarios.crear
usuarios.editar
usuarios.eliminar

productos.ver
productos.crear
productos.editar
productos.eliminar

ventas.ver
ventas.crear
ventas.anular

caja.abrir
caja.cerrar
caja.ver

inventario.ver
inventario.ajustar

No depender únicamente del nombre del rol para autorizar operaciones.

Utilizar permisos.

---

# 11. REGLAS DE DESARROLLO

Estas reglas son MUY IMPORTANTES.

## Regla 1

NO construir todo el sistema de una sola vez.

Desarrollar por fases.

## Regla 2

Antes de implementar cada módulo:

1. Analizar requisitos.
2. Revisar arquitectura existente.
3. Revisar código existente.
4. Revisar base de datos existente.
5. Proponer los cambios.
6. Implementar.
7. Ejecutar pruebas.
8. Ejecutar build.
9. Corregir errores.
10. Documentar.

## Regla 3

NO modificar módulos existentes innecesariamente.

Si una funcionalidad nueva puede implementarse sin modificar un módulo existente, no modificarlo.

## Regla 4

NO eliminar archivos existentes sin mi autorización.

## Regla 5

NO cambiar tecnologías.

## Regla 6

NO cambiar la arquitectura global sin mi autorización.

## Regla 7

NO generar código duplicado.

## Regla 8

Antes de crear una nueva utilidad, servicio, componente o función:

REVISAR si ya existe algo equivalente.

## Regla 9

Mantener consistencia de nombres.

## Regla 10

No crear archivos innecesarios.

---

# 12. CONTROL DE CALIDAD

Después de cada fase ejecutar:

* TypeScript
* ESLint
* Tests cuando correspondan
* Build
* Migraciones cuando correspondan

No considerar una fase terminada si existen errores de compilación.

Si aparece un error:

1. Analizarlo.
2. Encontrar la causa.
3. Corregirlo.
4. Volver a ejecutar la validación.

No ocultar errores.

No utilizar soluciones temporales para hacer desaparecer errores.

---

# 13. DOCUMENTACIÓN

Mantener actualizado:

README.md

docs/

Documentar:

* Arquitectura
* Instalación
* Variables de entorno
* Base de datos
* Migraciones
* API
* Autenticación
* Roles y permisos
* Decisiones técnicas

---

# 14. GIT

Utilizar Git.

Crear commits pequeños y descriptivos.

Ejemplo:

feat(auth): implement login

feat(users): create user module

feat(products): create product module

fix(auth): resolve token validation

No mezclar cambios no relacionados en un mismo commit.

---

# 15. ORDEN DE IMPLEMENTACIÓN

Seguir este orden inicialmente:

FASE 0
Arquitectura y configuración inicial

FASE 1
Monorepo y configuración del proyecto

FASE 2
PostgreSQL + TypeORM + migraciones

FASE 3
Sistema base del backend

FASE 4
Sistema base del frontend

FASE 5
Usuarios

FASE 6
Roles y permisos

FASE 7
Autenticación y autorización

FASE 8
Categorías

FASE 9
Productos

FASE 10
Salones y mesas

FASE 11
Clientes

FASE 12
Pedidos

FASE 13
Comandas y cocina

FASE 14
Ventas y pagos

FASE 15
Caja

FASE 16
Inventario

FASE 17
Proveedores y compras

FASE 18
Recetas y costos

FASE 19
Reportes

FASE 20
Auditoría

FASE 21
Configuración

FASE 22
Pruebas integrales

FASE 23
Preparación para producción

FASE 24
Despliegue

---

# 16. REGLA DE AVANCE

Esta es una de las reglas más importantes:

NO avanzar automáticamente a la siguiente fase.

Al terminar una fase debes mostrar:

1. Qué se implementó.
2. Qué archivos fueron creados.
3. Qué archivos fueron modificados.
4. Qué tablas fueron creadas/modificadas.
5. Qué endpoints fueron creados.
6. Qué pruebas fueron ejecutadas.
7. Resultado del build.
8. Errores pendientes, si existen.
9. Próximo paso.

Después debes esperar mi instrucción:

"CONTINUAR"

No iniciar automáticamente la siguiente fase.

---

# 17. REGLA SOBRE DECISIONES TÉCNICAS

Si encuentras una decisión que puede afectar la arquitectura:

NO cambiarla automáticamente.

Explicar:

* Problema
* Opciones
* Recomendación
* Impacto

Y esperar mi autorización.

No introducir nuevas tecnologías solamente porque sean populares.

---

# 18. REGLA SOBRE EL CONTEXTO

Antes de modificar cualquier archivo:

REVISAR el código existente.

No asumir que un archivo está vacío.

No sobrescribir código funcional sin analizarlo.

No recrear archivos que ya existen.

No duplicar entidades, servicios, controladores, hooks o componentes.

---

# 19. FORMA DE TRABAJO

Quiero que actúes como un desarrollador senior y arquitecto de software.

Pero no quiero que trabajes de forma descontrolada.

Quiero un desarrollo:

* Incremental
* Ordenado
* Verificable
* Seguro
* Documentado
* Mantenible
* Escalable

No quiero simplemente "mucho código".

Quiero código correctamente estructurado.

---

# 20. PRIMERA TAREA

NO empieces todavía a desarrollar todos los módulos.

Primero:

1. Analiza este documento.
2. Analiza el entorno actual del proyecto.
3. Verifica qué herramientas están instaladas.
4. Verifica la versión de Node.js.
5. Verifica la versión de pnpm/npm disponible.
6. Verifica PostgreSQL.
7. Revisa la estructura actual del proyecto.
8. Detecta conflictos con las decisiones anteriores.
9. Propón la estructura inicial definitiva.
10. Propón el esquema inicial de la base de datos.
11. Propón las relaciones principales.
12. Propón la arquitectura del backend.
13. Propón la arquitectura del frontend.

NO generes todavía todos los módulos.

Primero presenta el PLAN DE IMPLEMENTACIÓN.

Después espera mi autorización para comenzar la FASE 0.

---

# REGLA FINAL

Durante todo el proyecto debes considerar este documento como las reglas principales del desarrollo.

No cambies tecnologías, arquitectura ni convenciones sin mi autorización explícita.

Trabaja una fase a la vez.

No avances automáticamente.

No inventes requisitos.

No agregues funcionalidades que no hayan sido solicitadas.

Prioriza siempre:

CALIDAD
SEGURIDAD
MANTENIBILIDAD
ESCALABILIDAD
CONSISTENCIA

sobre la velocidad de generación del código.

# IDIOMA DE COMUNICACIÓN

Todas las respuestas, explicaciones, análisis, planes, informes y mensajes
dirigidos al usuario deben estar escritos en español.

El código fuente, nombres de variables, nombres de funciones, nombres de
clases, endpoints, nombres de archivos y comandos deben mantenerse según
las convenciones técnicas establecidas en el proyecto.

Los mensajes técnicos que formen parte de herramientas o comandos del
sistema pueden mantenerse en su idioma original cuando sea necesario.

No responder en inglés salvo que el usuario lo solicite explícitamente.
