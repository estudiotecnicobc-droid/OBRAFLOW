# Base de precios: auditoría y cierre MVP

## Estado verificado el 2026-10-30

Rama `feature/staging-integration`, HEAD `0b9566b`, igual al remoto. PR #35 abierto hacia `main`: no fusionar ni desplegar mientras estas etapas estén pendientes. Se trabaja en una copia aislada; el checkout original conserva archivos locales sin seguimiento. Docker Desktop no responde: no se verificó ni modificó la base local.

El lote `ff81fe88-4541-4408-a817-5759a9392a49`, sus 100.000 filas y los estados 10 pending_mapping / 99.990 raw son antecedentes confirmados por el usuario, no una nueva medición. La aprobación de SKU_000002_AR sigue sin confirmar. No reimportar el CSV.

## Fuente de verdad y brechas

* Identidad técnica: master_materials; equivalencias comerciales: supplier_products, aprobadas por usuario miembro con rol owner/admin/editor. La IA solo sugiere.
* Evidencia de mercado: price_observations, con lote/fila, precio comercial y factor. Precio técnico = precio comercial / factor. Las tablas no conceden escritura de observaciones a authenticated.
* Selección: resolve_reference_price es SECURITY INVOKER y valida pertenencia. Actualmente NO consulta observaciones. Prioriza override de proyecto, maestro propio, maestro global, snapshot de recurso, costo base y fallback APU. FROZEN rechaza la llamada: todavía no es un modo implementado.
* Consumo: no hay llamadas al resolvedor en los servicios actuales. Los APU conservan last_known_unit_price y los presupuestos tienen cálculos propios. No debe copiarse un precio de proveedor al maestro para simular integración.
* Versiones: budget_versions guarda items y totales JSON enviados por cliente; no guarda evidencia por componente ni demuestra una resolución del servidor. Permite borrar versiones a owner/admin. No satisface todavía un contrato FROZEN auditable.
* Aprobación: reencola filas pendientes pero un reintento tras reencolar no encuentra unidades y falla. Hay que conservar la primera identidad de aprobación en reintentos idénticos.
* Configuración CSV: configure_price_import_mapping permite modificar contexto después de empezar la homologación. Debe bloquearse el cambio si existen filas procesadas; requiere pruebas de concurrencia con el worker.
* RLS: los EXISTS de project_price_overrides usan organization_id sin calificar dentro de subconsultas; PostgreSQL puede vincularlo a la tabla interna y comprobar una igualdad consigo misma. Corregir y probar con un usuario miembro de dos organizaciones. budget_versions tampoco verifica que el proyecto corresponda al tenant del registro.

## Etapas y criterios de aceptación

1. Aprobación y evidencia: reintentar la misma aprobación antes/después de homologar devuelve el mismo mapping y cero filas nuevas, preservando autor/fecha. Rechazar viewer, ajeno, material de otro tenant y cambios de equivalencia con observaciones. Reintento worker no duplica observaciones.
2. Regla de precios y resolvedor: conservar override explícito primero; definir selección de proveedor sin confundir aprobación de identidad con preferencia comercial. Propuesta a validar: último precio observado compatible, desempate determinista; moneda y unidad nunca convertidas implícitamente. AS_OF limita fecha observada y fecha de conocimiento. Sin precio devuelve is_usable=false. Probar proveedores, unidades, monedas, fechas y RLS.
3. Un APU y un presupuesto: servicio llama al resolvedor por componente, multiplica cantidad técnica y merma una sola vez; bloquea cierre con precio no utilizable. Evidencia visible: fuente, referencia, fecha, unidad y moneda. No modificar ERPContext sin discutir previamente el cambio según AGENTS.md.
4. FROZEN: RPC transaccional valida proyecto/tenant y resuelve todos los componentes en servidor; persiste cantidades, precio, factor, evidencia y versión de regla. Lectura congelada no consulta precios vivos. Cambiar precio/maestro/APU no cambia la versión sellada. Sin UPDATE/DELETE ordinarios; pruebas de tenant y carreras de numeración.
5. Operación local: inspeccionar primero lote, mapping y observaciones; aprobar solo si falta, con sesión humana autenticada (service_role no sustituye auth.uid). Homologar un bloque acotado y verificar trazabilidad hasta versión congelada. Pruebas de Supabase real y advisors antes de considerar staging remoto.
6. Catálogo y fuentes Argentina/CABA: después del recorrido anterior. Registrar procedencia, licencia, fecha, región, impuestos, moneda, unidad comercial y frecuencia. Índices CAC/ICC sirven para actualización, no como cotización comercial. Empezar con catálogo pequeño revisado; ampliar después con trabajos idempotentes y alertas por vencimiento.

No se considera terminado el MVP hasta pasar etapas 1–5. Cada entrega debe identificar qué se probó realmente y qué sigue pendiente.
