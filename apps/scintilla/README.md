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

El laboratorio EC2 anterior fue destruido. Esta migración no crea recursos ni modifica sus permisos o Terraform; el user-data de labs/02-ec2-docker todavía inicia Nginx, no Scintilla. Hay que adaptar el despliegue antes de usarlo para esta aplicación.

Route 53 resuelve DNS, no aloja la API ni administra Node. Un diseño futuro es un nombre api bajo un dominio que controles → alias Route 53 hacia ALB → instancias o contenedores. HTTPS requiere un certificado y configuración del punto de entrada, por ejemplo ACM con ALB. El health check puede consultar /health.

scintilla.dev era solo el identificador elegido para el módulo Go: no implica propiedad de ese dominio. No registrar dominios ni crear zonas/ALB automáticamente; revisar los costos y elegir un dominio propio antes. CLF sigue siendo el objetivo principal; mantener este ejercicio acotado.
