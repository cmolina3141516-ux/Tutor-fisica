# Contexto del proyecto — Equipo Nova (tutores IA de Innova School)

Este archivo resume la conversación con Claude del 23 de noviembre de 2026 donde se tomaron las decisiones de producto y se depuraron los tutores. Léelo antes de trabajar en este repositorio. Responde siempre en español a Carlos ("Caliche"), fundador y CEO de Virtual Planet S.A.S., profesor de física y matemáticas.

## Visión de producto (decisiones tomadas)

- **Innova School**: colegio virtual de 6° a 11° con IA. Es la marca principal y la visión original. Estructura de contenido por **nodos de conocimiento** interdisciplinarios. Requiere licencia de funcionamiento o alianza con un colegio aprobado para certificar (pendiente de definir).
- **Nova para Instituciones**: "un equipo docente con inteligencia artificial". Apoyo a colegios existentes, adaptado a su propia estructura (por asignatura, tema y DBA), sin imponer los nodos.
- **Equipo Nova**: los profesores IA. Cada uno tiene nombre propio y asignatura; ninguno se llama "Nova" (Nova es el nombre del equipo).
- **Saber 11**: plataforma totalmente independiente (saber11.virtualplanet-edu.co, repo `plataforma-saber11.`). Sin dependencia técnica. Desde el grado 11 de Innova School solo habrá un enlace; el estudiante se registra y paga allá.
- **Una sola plataforma, dos experiencias**: mismo motor (contenido etiquetado, tutores, evaluación, usuarios/roles/pagos/cartera/mensajería heredados de Saber 11 con Next.js + Supabase). Innova School es técnicamente una institución más dentro de la plataforma.
- **Contenido atomizado**: unidades pequeñas etiquetadas por grado, asignatura, tema, DBA, estándar MEN y competencia ICFES. Los nodos son una vista (Innova School); la búsqueda por asignatura/tema es otra vista (Nova para Instituciones).
- **Orden recomendado**: (1) núcleo del estudiante (tutores, contenido, evaluación), (2) capa para colegios (Nova para Instituciones: vende más rápido, sin licencia), (3) capa de colegio virtual con certificación. Preparar la certificación en paralelo.
- Costo objetivo de referencia: precio de ~300.000 COP por estudiante al año (~US$6,25/mes).

## Los profesores del Equipo Nova

| Profesor | Asignatura | `TUTOR_SUBJECT` | Servicio en Render |
|---|---|---|---|
| Julián | Física y Matemáticas (decidido: conserva ambas) | `physics` | tutor-fisica.onrender.com |
| Esteban | Matemáticas | `mathematics` | tutor-matematicas.onrender.com |
| Andrés | Ciencias Naturales y Química | `natural_sciences` | tutor-ciencias.onrender.com |
| Laura | Ciencias Sociales | `social_studies` | tutor-sociales.onrender.com |
| Miss Emily | Inglés y Francés | `languages` | tutor-emily.onrender.com |
| Felipe | Tecnología, Programación y Robótica | (no existe aún) | pendiente |
| Mateo | Lectura Crítica y Filosofía | (no existe aún) | pendiente |

Este repositorio sirve a todos: la variable `TUTOR_SUBJECT` decide el profesor. **Pendiente confirmar** que cada servicio de Render se despliega desde este repo (podría haber copias en `tutor-ciencias` u otros).

El panel de venta y códigos de acceso está en el repo `innova-school-panel` (landing + admin que crea códigos en la tabla `access_codes` de Supabase; pago por Tiendanube y comprobante por WhatsApp).

## Pedagogía: "socrático ligero"

Decidido porque los estudiantes quieren respuestas rápidas y, si solo reciben preguntas, se van a ChatGPT:

- Nunca responder una pregunta solo con otra pregunta. Cada respuesta entrega algo concreto y cierra con una sola pregunta corta.
- **Tres modos que elige el estudiante** (botones encima del chat): "Explícame rápido", "Guíame paso a paso" (máx. 3 pistas) y "Revisa mi respuesta" (veredicto, primer error, una pista).
- **Detector de impaciencia** ("ya dime", "no sé", "me rindo", también en inglés/francés): solución completa + ejercicio parecido.
- Instrucciones en `prompts/core.md` (comunes) y `prompts/<asignatura>.md`. Para cambiar cómo enseña un profesor se edita su archivo, no `server.js`.

## Control de costos (implementado)

Modelo actual `gpt-5-mini` (US$0,25 entrada / US$0,025 entrada en caché / US$2 salida por millón). Estimación: ~US$2,8/estudiante/mes antes de optimizar, ~US$0,70 después (30 mensajes/día, 20 días). Medidas:

- Instrucciones fijas primero (idénticas en cada mensaje) → caché de OpenAI, más `prompt_cache_key` por asignatura. El contexto del turno va en un mensaje `developer` justo antes del mensaje actual.
- Historial: últimos 8 mensajes recortados a 1.500 caracteres; adjuntos solo en el turno actual.
- `max_output_tokens` 2500 (quiz 5000).
- **Energía diaria** = columna `max_messages_per_day`: texto 1, con archivo 4, imagen generada +8. Gráficas SVG gratis.
- Registro de tokens y costo por respuesta: logs `[uso] {...}` y tabla `tutor_usage_log` (en `supabase-schema.sql`).
- La versión `gpt-5-mini-2025-08-07` aparece como obsoleta en la documentación de OpenAI: probar un reemplazo.

## Subidas permitidas

Un archivo por mensaje: foto/imagen (se comprime en el dispositivo a 1100 px), PDF de máximo 3 páginas, o Word .docx (el servidor extrae solo el texto, sin dependencias). Máximo 5 MB. El tope del cuerpo de la petición se subió de 1 MB a 8 MB.

## Estado actual

- Rama `depuracion-equipo-nova` con todos los cambios; PR #1 abierto en GitHub. **No fusionado**: producción sigue con la versión anterior.
- Probado con un servidor de OpenAI simulado (modos, impaciencia, Word, PDF, límites, quiz, energía, Julián y Miss Emily, interfaz en escritorio y móvil). **Falta probar con la clave real.**

## Próximos pasos

1. Correr el tutor localmente con la clave real (`.env` con `OPENAI_API_KEY`, `TUTOR_SUBJECT=physics`, `npm start`) y conversar con Julián en los tres modos. Ajustar `prompts/` según lo que Carlos observe como experto.
2. Confirmar desde qué repositorio despliega cada servicio de Render.
3. Ejecutar `supabase-schema.sql` en Supabase para crear `tutor_usage_log`.
4. Crear un servicio de prueba en Render desde la rama, validar y fusionar el PR.
5. Crear a Felipe y Mateo (nuevos `TUTOR_SUBJECT` y archivos en `prompts/`).
6. En `innova-school-panel`: el código trae `ADMIN_PASSCODE` por defecto `INNOVA2026` y el repo es público. Verificar que Render tenga una clave propia configurada.
7. Más adelante: conectar los tutores a la nueva plataforma (encargos del docente ligados a DBA, conversaciones guardadas para el tablero docente).

## Cómo probar sin gastar

`OPENAI_API_BASE` permite apuntar a un servidor simulado (por ejemplo `http://localhost:9999`) que devuelva respuestas con el formato de la API Responses. Sin Supabase configurado, el acceso funciona en memoria con códigos del formato `JULIAN-XXXX-XXXX-AAAAMMDD`.
