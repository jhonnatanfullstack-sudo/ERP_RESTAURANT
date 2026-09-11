# UI/UX GUIDELINES — RESTAURANT ERP

## 1. OBJETIVO

Este documento define las reglas visuales y de experiencia de usuario que deben seguirse en TODO el frontend del proyecto.

El objetivo es que el sistema tenga una interfaz:

- Profesional
- Moderna
- Limpia
- Consistente
- Rápida de utilizar
- Responsive
- Orientada a software empresarial
- Adecuada para un ERP y POS de restaurante

Estas reglas deben aplicarse tanto a:

1. Nuevas páginas.
2. Nuevos formularios.
3. Nuevos módulos.
4. Nuevos componentes.
5. Formularios existentes.
6. Tablas existentes.
7. Modales existentes.
8. Dashboards existentes.
9. Pantallas POS existentes.

---

# 2. REGLA PRINCIPAL

ANTES DE CREAR O MODIFICAR UNA INTERFAZ:

1. Analizar los componentes existentes.
2. Identificar componentes reutilizables.
3. Identificar los patrones visuales existentes.
4. Revisar cómo están estructurados los formularios actuales.
5. Revisar layouts, botones, inputs, tablas, modales y mensajes existentes.
6. Reutilizar lo existente siempre que sea posible.
7. Evitar crear componentes duplicados.

NO modificar la lógica de negocio únicamente para mejorar el diseño.

NO cambiar endpoints, servicios, hooks, modelos o contratos de API salvo que sea estrictamente necesario.

La mejora visual debe realizarse preferentemente sobre la estructura existente.

---

# 3. PRINCIPIOS DE DISEÑO

La interfaz debe priorizar:

- Claridad
- Velocidad de operación
- Jerarquía visual
- Consistencia
- Accesibilidad
- Facilidad de aprendizaje
- Reducción de errores
- Buena utilización del espacio

Evitar:

- Exceso de tarjetas
- Exceso de sombras
- Colores innecesarios
- Gradientes excesivos
- Animaciones innecesarias
- Botones gigantes
- Formularios excesivamente altos
- Espacios desperdiciados
- Interfaces que parezcan una plantilla genérica
- Elementos decorativos que no aporten funcionalidad

La interfaz debe parecer un producto empresarial profesional, no una página web promocional.

---

# 4. LAYOUT GENERAL

Mantener una estructura visual consistente:

SIDEBAR
|
+-- Navegación principal
|
+-- Módulos
|
+-- Submódulos

HEADER
|
+-- Título
+-- Breadcrumb
+-- Acciones globales
+-- Usuario

CONTENIDO
|
+-- Título de sección
+-- Acciones
+-- Filtros
+-- Tabla / formulario / contenido

---

# 5. PÁGINAS DE LISTADO

Las páginas de listado deben seguir preferentemente esta estructura:

1. Header de página
2. Título
3. Descripción breve cuando sea necesaria
4. Botón de acción principal
5. Filtros
6. Tabla
7. Paginación

Ejemplo conceptual:

Título: Productos

Descripción:
"Administra los productos disponibles en el sistema."

Acción principal:
"+ Nuevo producto"

Filtros:
Buscar | Categoría | Estado

Tabla:
Código | Producto | Categoría | Precio | Estado | Acciones

---

# 6. BOTONES

Debe existir una jerarquía clara.

## Acción principal

Usar para:

- Guardar
- Crear
- Confirmar
- Registrar
- Procesar

## Acción secundaria

Usar para:

- Cancelar
- Volver
- Limpiar
- Filtrar

## Acción peligrosa

Usar para:

- Eliminar
- Anular
- Desactivar

Los botones deben:

- Tener texto claro.
- Tener estados hover.
- Tener estado disabled.
- Tener estado loading cuando corresponda.
- No utilizar iconos sin contexto cuando puedan generar confusión.

---

# 7. FORMULARIOS

Los formularios deben ser profesionales, compactos y fáciles de completar.

## Estructura

Cada campo debe tener:

- Label
- Input / Select / Autocomplete
- Texto de ayuda cuando sea necesario
- Mensaje de validación cuando corresponda

Ejemplo:

Nombre del producto

[________________________]

Ingrese el nombre comercial del producto.

Error:

"El nombre del producto es obligatorio."

---

# 8. DISTRIBUCIÓN DE FORMULARIOS

Evitar formularios donde cada campo ocupe una fila completa innecesariamente.

Cuando exista suficiente espacio, utilizar grids.

Ejemplo:

Código Nombre
[************] [************____________]

Categoría Marca
[************] [************____________]

Precio Estado
[____________] [Activo ▼]

Descripción
[____________________________________________]

La distribución debe adaptarse al tamaño de pantalla.

---

# 9. FORMULARIOS EXISTENTES

Cuando se solicite mejorar los formularios existentes:

NO reconstruirlos automáticamente desde cero.

Primero:

1. Identificar el formulario.
2. Revisar sus campos.
3. Revisar validaciones existentes.
4. Revisar hooks utilizados.
5. Revisar submit.
6. Revisar manejo de errores.
7. Revisar componentes utilizados.

Después mejorar:

- Distribución
- Espaciado
- Labels
- Agrupación de campos
- Jerarquía
- Botones
- Mensajes
- Estados visuales
- Responsive
- Accesibilidad

La lógica existente debe conservarse.

---

# 10. MODALES

Los modales deben utilizarse para acciones pequeñas o formularios relativamente simples.

Evitar formularios demasiado grandes dentro de un modal.

Un modal debe tener:

HEADER
Título
Descripción opcional
Botón cerrar

BODY
Campos

FOOTER
Cancelar
Guardar

Los botones deben permanecer claramente diferenciados.

---

# 11. TABLAS

Las tablas son elementos importantes del ERP.

Deben ser compactas pero legibles.

Características recomendadas:

- Encabezado claramente diferenciado.
- Filas con altura consistente.
- Hover.
- Estados mediante badges.
- Acciones claramente identificables.
- Paginación.
- Búsqueda.
- Filtros cuando sean necesarios.
- Estado de carga.
- Estado vacío.
- Estado de error.

Evitar tablas visualmente saturadas.

---

# 12. ESTADOS DE LA INTERFAZ

TODAS las páginas que consulten información deben contemplar:

## Loading

Mostrar un estado visual apropiado.

No dejar la pantalla aparentemente congelada.

## Empty

Cuando no existan registros:

Mostrar algo como:

"No hay productos registrados."

Y cuando corresponda:

"+ Registrar producto"

## Error

Mostrar un mensaje comprensible para el usuario.

Evitar mostrar errores técnicos como:

"AxiosError: Request failed with status code 500"

El detalle técnico puede mantenerse para logs, pero el usuario debe recibir un mensaje entendible.

---

# 13. VALIDACIONES

Las validaciones deben mostrarse cerca del campo correspondiente.

Ejemplo:

Precio
[________________]

⚠ El precio debe ser mayor a 0.

Evitar mostrar únicamente un mensaje genérico:

"Error en formulario."

La validación debe ayudar al usuario a corregir el problema.

---

# 14. INPUTS

Los inputs deben tener:

- Altura consistente.
- Padding adecuado.
- Border visible pero discreto.
- Focus claramente identificable.
- Estado disabled.
- Estado error.
- Placeholder únicamente cuando ayude.

No utilizar placeholders como sustitutos de labels.

Incorrecto:

[Ingrese nombre...]

Correcto:

Nombre
[Ingrese el nombre...]

---

# 15. SELECTS Y AUTOCOMPLETE

Cuando exista una cantidad importante de opciones, preferir:

- Combobox
- Autocomplete
- Búsqueda

en lugar de un select gigantesco.

Especialmente para:

- Productos
- Clientes
- Proveedores
- Usuarios
- Categorías
- Marcas
- Puntos de control
- Establecimientos

---

# 16. RESPONSIVE

Toda nueva interfaz debe funcionar correctamente en:

- Desktop
- Laptop
- Tablet
- Mobile

Desktop debe aprovechar correctamente el espacio disponible.

Mobile no debe simplemente reducir el tamaño de los elementos.

Debe adaptar:

- Tablas
- Formularios
- Sidebar
- Modales
- Botones
- Filtros

---

# 17. ICONOS

Utilizar iconos únicamente cuando aporten significado.

Ejemplos:

Editar
Eliminar
Buscar
Filtrar
Agregar
Cerrar
Descargar
Imprimir

Evitar llenar la interfaz de iconos decorativos.

Cuando una acción pueda ser ambigua, utilizar icono + texto.

---

# 18. COLORES

Utilizar una paleta consistente.

Los colores deben comunicar estados:

Primary
Acciones principales

Success
Correcto / Activo / Completado

Warning
Advertencia / Pendiente

Danger
Error / Eliminación / Anulación

Neutral
Información secundaria

No introducir nuevos colores arbitrariamente.

Antes de agregar un color nuevo, revisar si ya existe una variable o clase reutilizable en el proyecto.

---

# 19. TIPOGRAFÍA

Mantener una jerarquía consistente.

Ejemplo:

Título de página
text-xl / text-2xl

Título de sección
text-lg

Texto normal
text-sm / text-base

Texto secundario
text-sm

Los textos de tablas pueden ser ligeramente más compactos.

---

# 20. CARDS

Las cards deben utilizarse cuando realmente agrupen información.

No convertir toda la interfaz en cards.

Ejemplo apropiado:

Dashboard:

Ventas del día
S/ 4,520

Pedidos
128

Productos con bajo stock
12

Ejemplo no recomendado:

Crear una card alrededor de cada input de un formulario.

---

# 21. DASHBOARD

El dashboard debe priorizar información útil.

Para un ERP de restaurante puede incluir:

- Ventas del día
- Ventas del mes
- Pedidos
- Ticket promedio
- Productos más vendidos
- Productos con bajo stock
- Estado de caja
- Ventas por período
- Resumen de operaciones

No llenar el dashboard de gráficos simplemente por estética.

Cada gráfico debe responder una pregunta de negocio.

---

# 22. POS

El POS requiere una interfaz diferente a las páginas administrativas.

Debe priorizar:

- Velocidad
- Visibilidad
- Acciones rápidas
- Productos
- Carrito
- Total
- Métodos de pago
- Estado de la venta

Reducir al mínimo los pasos necesarios para registrar una venta.

Los elementos utilizados constantemente deben estar fácilmente accesibles.

---

# 23. EXPERIENCIA DEL USUARIO

Toda acción importante debe proporcionar feedback.

Ejemplo:

Guardar:

"Guardando..."

Después:

"Producto registrado correctamente."

Eliminar:

Mostrar confirmación.

Ejemplo:

"¿Está seguro de eliminar este producto?"

Evitar eliminar registros críticos inmediatamente sin confirmación.

---

# 24. ACCESIBILIDAD

Considerar:

- Labels asociados a inputs.
- Contraste suficiente.
- Navegación mediante teclado.
- Focus visible.
- Botones correctamente identificables.
- Mensajes de error claros.

No depender exclusivamente del color para comunicar estados.

---

# 25. REUTILIZACIÓN

Antes de crear:

Button
Input
Select
Modal
Table
Badge
Pagination
Form
Dropdown
Toast

buscar primero si ya existe un componente equivalente.

Si existe:

REUTILIZARLO.

Si no existe:

CREAR un componente reutilizable cuando tenga sentido.

No crear componentes específicos duplicados para cada página.

---

# 26. TAILWIND

Si el proyecto utiliza Tailwind CSS:

- Utilizar las clases existentes.
- Mantener consistencia.
- Evitar estilos inline innecesarios.
- Evitar valores arbitrarios cuando exista una alternativa estándar.
- Reutilizar componentes.
- Mantener responsive mediante breakpoints.

No introducir otra librería de estilos sin autorización.

---

# 27. REGLA PARA NUEVAS FASES

Cuando se implemente una nueva fase del proyecto:

PRIMERO:

Analizar la UI existente.

SEGUNDO:

Determinar qué componentes pueden reutilizarse.

TERCERO:

Diseñar la estructura visual.

CUARTO:

Implementar.

QUINTO:

Verificar:

- Desktop
- Tablet
- Mobile
- Loading
- Empty
- Error
- Validaciones
- Responsive

SEXTO:

Comparar visualmente con las pantallas existentes y corregir inconsistencias.

---

# 28. REGLA PARA REDISEÑO DE TODO EL FRONTEND

Si se solicita mejorar todos los formularios existentes:

NO modificar todos los archivos simultáneamente.

Trabajar por módulos.

Orden recomendado:

1. Layout principal
2. Componentes base
3. Formularios
4. Tablas
5. Modales
6. Páginas
7. Dashboard
8. POS

Después de cada grupo:

- Ejecutar build.
- Verificar errores.
- Verificar que la funcionalidad continúe funcionando.

---

# 29. PROHIBICIONES

NO:

- Cambiar arquitectura sin autorización.
- Cambiar endpoints sin autorización.
- Eliminar lógica existente para simplificar el código.
- Crear componentes duplicados.
- Instalar librerías innecesarias.
- Reescribir todo un módulo solamente por estética.
- Modificar la base de datos por una necesidad puramente visual.
- Cambiar nombres de variables o archivos masivamente sin necesidad.
- Eliminar funcionalidades existentes.
- Romper compatibilidad con otros módulos.

---

# 30. PROCESO OBLIGATORIO ANTES DE MODIFICAR

Antes de realizar cambios importantes, responder internamente:

1. ¿Qué archivos están relacionados?
2. ¿Qué componentes existentes puedo reutilizar?
3. ¿La lógica actual debe permanecer intacta?
4. ¿Existe ya un patrón visual para esta funcionalidad?
5. ¿El cambio afectará otras páginas?
6. ¿La solución será reutilizable?

Después realizar los cambios mínimos necesarios.

---

# 31. OBJETIVO FINAL

El frontend debe sentirse como UN SOLO SISTEMA.

No debe parecer que cada módulo fue desarrollado por una persona diferente.

Productos, clientes, usuarios, inventario, ventas, caja, reportes y POS deben compartir:

- misma jerarquía visual
- mismos componentes
- mismos botones
- mismos inputs
- mismos modales
- mismos estados
- mismos patrones de navegación
- misma experiencia de usuario

La consistencia es más importante que agregar elementos visuales.

---

# 32. INSTRUCCIÓN FINAL PARA CLAUDE CODE

Cuando recibas una tarea relacionada con frontend:

NO empieces inmediatamente a escribir código.

Primero analiza brevemente el frontend existente y determina:

- qué componentes existen;
- qué patrones visuales existen;
- qué archivos están involucrados;
- qué componentes pueden reutilizarse.

Después implementa la solución respetando estas reglas.

Si detectas una inconsistencia visual existente, puedes mejorarla, pero evita realizar cambios masivos no solicitados.

La prioridad es:

1. Mantener funcionalidad.
2. Mantener arquitectura.
3. Reutilizar código.
4. Mejorar UX.
5. Mejorar UI.
6. Mantener consistencia.
7. Mantener responsive.
8. Evitar complejidad innecesaria.
