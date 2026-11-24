# Scintilla

API en Node.js 24 y TypeScript para aprender arquitectura hexagonal y agentes con herramientas. Reemplaza la versión Go. Express 5 implementa el adaptador HTTP. El núcleo no depende de Express ni de un framework de agentes.

## Qué funciona ahora

- GET /health: HTTP 200 con status=ok, service=scintilla y model=simulated. Es liveness del proceso, no comprueba servicios externos.
- GET /hello: HTTP 200 con {"message":"Hola mundo"}.
- POST /assistant: ejecuta el ciclo modelo → herramienta → modelo → respuesta.
- Herramienta get_service_info, de solo lectura y sin acceso a AWS.
- Modelo simulado determinista: no entiende lenguaje natural ni invoca un LLM. Toda entrada válida consulta la misma herramienta y devuelve su resultado.
- Validación de entrada, lista de herramientas permitidas, límite de pasos y cancelación.
- Sin persistencia: cada solicitud es independiente, sin historial compartido.

## Arquitectura

```text
src/
├── domain/agent.ts                  Tipos y errores propios del agente
├── ports/
│   ├── assistant.ts                 Entrada: ejecutar asistente
│   ├── language-model.ts            Salida: pedir una decisión al modelo
│   └── tool.ts                      Salida: describir y ejecutar una herramienta
├── application/run-agent.ts         Caso de uso y ciclo del agente
├── adapters/
│   ├── http/                        Express → puerto Assistant
│   │   ├── server.ts                Ensamblado del adaptador HTTP
│   │   ├── routes.ts                Registro de rutas y middleware
│   │   ├── handlers.ts              HTTP → casos de uso
│   │   ├── validation.ts            Validación de entrada externa
│   │   ├── middleware.ts            Content-Type, métodos y errores
│   │   └── http-error.ts            Errores propios del transporte
│   ├── model/simulated-model.ts     Implementación simulada de LanguageModel
│   └── tools/service-info-tool.ts   Implementación de Tool
└── main.ts                          Crea y conecta las implementaciones
test/run-agent.test.ts               Pruebas de comportamiento del núcleo
test/http.test.ts                    Contrato HTTP y errores async
```

Las dependencias apuntan hacia contratos propios: domain no importa infraestructura; application usa ports; los adaptadores implementan o consumen esos contratos. main es la raíz de composición: decide las implementaciones concretas. Un puerto es una interfaz TypeScript, no un puerto TCP.

Recorrido de POST /assistant:

```text
Cliente → adaptador HTTP → Assistant / RunAgent
                              ├── LanguageModel → SimulatedModel
                              └── Tool → ServiceInfoTool
```

Para agregar otra capacidad, implementar Tool, validar sus argumentos y registrarla en main. No hace falta cambiar RunAgent. Para incorporar Bedrock, implementar LanguageModel y conectarlo en main, traduciendo los tipos del proveedor a los contratos propios. El adaptador HTTP también deberá informar el nuevo modo: por ahora declara explícitamente simulated.

No se crean repositorios ni interfaces de persistencia hasta necesitar conversaciones durables. No hay agentes múltiples, RAG ni MCP implementados.

## Organización HTTP

Las rutas se declaran con Router, sin una cadena manual de if por URL. Middleware controla Content-Type y métodos; express.json limita el cuerpo; validation valida la entrada; los handlers llaman al puerto Assistant; un middleware final traduce errores a HTTP. Express 5 propaga los rechazos de handlers async hacia el middleware de errores. Strategy no es necesario para registrar rutas.

Después de cambiar dependencias, ejecutar npm install para actualizar package-lock.json antes de npm ci o del build Docker.

## Preparar y ejecutar

Desde la raíz del repositorio:

```bash
cd apps/scintilla
node --version
npm install
npm run typecheck
npm test
npm run dev
```

Usar Node 24; .nvmrc permite seleccionar esa versión con nvm use si tenés nvm. npm install genera package-lock.json: incluirlo en Git; después se puede instalar de forma reproducible con npm ci. El agente que editó este proyecto no ejecuta comandos locales: estas verificaciones las realiza el usuario.

El servidor escucha en 127.0.0.1:8080. HOST y PORT son configurables. Para detenerlo, Ctrl+C. npm run dev reinicia el proceso al editar TypeScript.

En otra terminal:

```bash
curl -i http://127.0.0.1:8080/health
curl -i http://127.0.0.1:8080/hello
curl -i http://127.0.0.1:8080/assistant -H 'Content-Type: application/json' -d '{"message":"¿Qué puede hacer Scintilla?"}'
```

La respuesta del asistente incluye answer, toolsUsed=["get_service_info"], modelCalls=2 y mode=simulated. Las pruebas verifican el ciclo completo, herramientas no registradas, límites, entrada inválida, aislamiento entre solicitudes y cancelación.

## Compilar y ejecutar JavaScript

```bash
npm run build
npm start
```

TypeScript compila hacia dist. Node ejecuta dist/src/main.js. No usar go run ni los binarios Go previos.

## Docker

Primero generar package-lock.json con npm install. Después:

```bash
docker build -t scintilla:lab .
docker run --rm --name scintilla -p 127.0.0.1:8080:8080 scintilla:lab
```

La imagen ejecuta las pruebas durante el build y el servidor usa un usuario sin privilegios. Para la EC2 t3.micro desde una Mac ARM:

```bash
docker buildx build --platform linux/amd64 --load -t scintilla:ec2 .
```

Node 24 y la imagen node:24-alpine deben mantenerse actualizados; para fijar completamente la imagen usar su digest.

## Escalabilidad y seguridad

El diseño permite agregar herramientas y adaptadores; todavía no es un servicio de producción. El historial vive solo durante una ejecución, facilitando réplicas independientes. Hay un máximo de 20 solicitudes de asistente en vuelo por proceso, 4 llamadas al modelo por ejecución, 4 herramientas por ronda y 4000 caracteres por mensaje. El cuerpo HTTP admite hasta 16 KiB.

Las ejecuciones reciben una señal de cancelación tras 10 segundos. Los adaptadores futuros deben respetarla y configurar sus propios timeouts: AbortSignal no interrumpe código que la ignore ni tareas CPU bloqueantes. Al salir, el servidor deja hasta 12 segundos para completar conexiones.

Antes de exponerlo públicamente: agregar autenticación, autorización por herramienta y usuario, límites distribuidos, métricas y política de retención de datos. La lista de herramientas registradas no sustituye esos controles. No ejecutar código o comandos proporcionados por un modelo. No incluir secretos en prompts ni archivos del proyecto.

## AWS y Route 53

La EC2 anterior fue destruida. labs/02-ec2-docker prepara ahora Docker, permisos de descarga de ECR, un comando SSM acotado y un rol de despliegue. user-data instala el script de despliegue y no inicia Nginx. Los recursos solo existirán después de que el usuario revise y aplique Terraform.

Route 53 resuelve DNS, no aloja la API ni administra Node. Un diseño futuro es un nombre api bajo un dominio que controles → alias Route 53 hacia ALB → instancias o contenedores. HTTPS requiere un certificado y configuración del punto de entrada, por ejemplo ACM con ALB. El health check puede consultar /health.

scintilla.dev era solo el identificador elegido para el módulo Go: no implica propiedad de ese dominio. No registrar dominios ni crear zonas/ALB automáticamente; revisar los costos y elegir un dominio propio antes. CLF sigue siendo el objetivo principal; mantener este ejercicio acotado.

## Versiones de las imágenes

Cada publicación lleva una única etiqueta FECHA-EJECUCION-INTENTO, por ejemplo 2026-11-24-15-1. La fecha corresponde al inicio del paso de publicación en UTC; la ejecución es GITHUB_RUN_NUMBER y el intento es GITHUB_RUN_ATTEMPT del workflow Scintilla image. Re-run jobs conserva la ejecución e incrementa el intento: 2026-11-24-15-2. Una nueva ejecución incrementa el contador y comienza con intento 1: 2026-11-24-16-1. La fecha del reintento puede cambiar si se ejecuta otro día.

Esta convención basada en fecha y ejecución no usa SemVer para las imágenes. package.json conserva su versión interna de paquete, que no controla las publicaciones Docker. No hay Release Please, PRs automáticas, latest ni un tag adicional de commit.

ECR mantiene las etiquetas inmutables. El commit completo queda registrado en el label OCI org.opencontainers.image.revision y en el resumen de Actions. El resumen muestra también la URI y el digest: el despliegue puede fijarse a repository@sha256:DIGEST.

El workflow ejecuta test y publish según Gitflow. develop y main solo prueban; únicamente release/rc-N publica, con SCINTILLA_PUBLISH_ENABLED=true y un rol OIDC cuya confianza se debe actualizar aplicando labs/03-ecr. Cada nueva ejecución construye y prueba su propia imagen, incluso si repite el commit. El script reutiliza la imagen si ya existe exactamente su etiqueta.

Para verificar las reglas desde la raíz del repositorio:

```bash
node --test scripts/test/scintilla-image.test.mjs
```

La prueba cubre fecha UTC, cambio de día, reintentos y contadores inválidos. No requiere AWS ni Docker.

Las imágenes anteriores permanecen en ECR; no se renombran ni eliminan automáticamente. No hace falta terraform apply para cambiar esta convención.

## Artefacto publicado en ECR

El pipeline construye solo linux/amd64 con --provenance=false y --sbom=false. No publica attestations de procedencia ni SBOM; normalmente ECR mostrará una imagen etiquetada por ejecución, sin el índice adicional para agrupar attestations. El commit, la fecha y la versión siguen en los labels OCI. Esta configuración reduce los metadatos de cadena de suministro disponibles para auditoría. No modifica imágenes ya publicadas.

## Gitflow y despliegue manual

```text
feature/* → PR a develop → pruebas
develop → release/rc-N → pruebas + construcción + ECR
release/rc-N → PR a main → pruebas, sin construcción ni despliegue
release/rc-N → PR de retorno a develop → incorpora correcciones del candidato
main → Run workflow manual → despliega el digest elegido, sin reconstruir
```

La rama se llama develop. Los candidatos son release/rc-1, release/rc-2, etc.; no se usa una rama permanente release ni el prefijo releases/. Los candidatos se crean desde develop. Las PR ejecutan pruebas sin credenciales AWS. main representa código aceptado, no implica que ese código ya esté ejecutándose. Gitflow organiza ramas; no obliga a desplegar al mergear.

No se configuran revisores obligatorios ni un Environment con aprobación para este ejercicio. No se modifican protecciones existentes en GitHub: si ya hay reglas, siguen aplicándose. Solo quien tenga permisos de ejecución en Actions puede iniciar el despliegue.

### Preparar AWS antes de probar los candidatos

1. Actualizar la política lab-scintilla-ecr-terraform con labs/03-ecr/terraform-operator-policy.json. Incluye UpdateAssumeRolePolicy para cambiar la confianza del rol existente.
2. En labs/03-ecr ejecutar fmt, validate, plan y revisar el cambio de confianza: main deja de poder publicar; release/rc-* puede asumir el rol, con verificación adicional del formato rc-N en el workflow. Aplicar ese plan.
3. Actualizar la política lab-ec2-docker-terraform con labs/02-ec2-docker/terraform-operator-policy.json. Agrega permisos sobre el nuevo rol de despliegue y el documento SSM. No sustituir la política ECR con esta ni viceversa.
4. En labs/02-ec2-docker ejecutar fmt, validate y plan. Revisar y aplicar para recrear EC2; CPU, EBS e IPv4 pública generan consumo. Si la AMI actual difiere de la autorizada en LaunchSupportingResources, actualizar solo su ARN al ID del plan antes de aplicar.
5. Esperar el arranque y registro SSM. El agente debe soportar interpolationType=ENV_VAR; si falla ese parámetro, actualizar el agente, sin sustituirlo por interpolación insegura.

Terraform de EC2 sigue siendo local por ahora. El workflow Infra Cloud solo gestiona labs/01-s3 y ahora tiene filtros para evitar activarse por cambios exclusivos en Scintilla. Su apply y aprobación de infraestructura existentes se conservan.

### Probar el flujo de ramas

Una vez subidos los cambios a main, el usuario crea develop desde main si todavía no existe y crea release/rc-1 desde develop cuando quiera construir el primer candidato. El agente no crea ramas ni ejecuta git. Evitar comandos que descarten cambios locales. El workflow manual solo será visible al existir en la rama predeterminada del repositorio.

Desde la raíz, comprobar las reglas sin AWS:

```bash
node --test scripts/test/*.test.mjs
```

Para main y develop el nombre de ejecución será Ejecutando pruebas; para un candidato será Construyendo imagen y subiendo a ECR. El número de ejecución e intento siguen identificando la publicación.

### Ejecutar el despliegue

En GitHub Actions elegir Scintilla · Despliegue manual → Run workflow → main. Introducir image_digest (sha256 completo tomado del resumen del build aceptado) e instance_id (output de Terraform). El workflow no se dispara por push, PR ni merge y no solicita aprobación adicional.

El script verifica que el digest exista en scintilla y que la EC2 esté activa, con Application=scintilla y Environment=learning. Systems Manager ejecuta únicamente el documento ScintillaDeploy; la imagen se descarga en EC2 mediante su propio rol. No se instalan claves permanentes ni se abre SSH. El rol de despliegue no publica imágenes.

El contenedor candidato se verifica en localhost:18080 antes del cambio. Luego se inicia scintilla en localhost:8080 y se comprueba /health. Se intenta restaurar el anterior si falla el nuevo contenedor. Es un despliegue de una instancia con una breve interrupción durante el reemplazo; no ofrece alta disponibilidad ni garantiza rollback ante una caída del host. Para revertir una versión sana manualmente, ejecutar el workflow con un digest anterior.

La elección del artefacto sigue siendo manual: verificar que el digest corresponde al candidato probado y aceptado. El workflow no afirma que cualquier imagen seleccionada corresponda al árbol de main. El health comprueba el proceso, no dependencias externas. El despliegue no configura Route 53, ALB ni HTTPS y no expone /assistant a internet.

Al terminar, revisar terraform plan -destroy desde labs/02-ec2-docker y eliminar el laboratorio si no se usará. labs/03-ecr tiene estado independiente; borrar EC2 no borra las imágenes.
