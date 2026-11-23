# Contexto del proyecto — Equipo Nova (tutores IA de Innova School)

Este archivo resume la conversación con Claude del 23 de noviembre de 2026 donde se tomaron las decisiones de producto y se depuraron los tutores. Léelo antes de trabajar en este repositorio. Responde siempre en español a Carlos ("Caliche"), fundador y CEO de Virtual Planet S.A.S., profesor de física y matemáticas.

**Regla de trabajo:** toda decisión que se tome (de producto, pedagogía, técnica, costos o configuración) se anota en este archivo, en la sección correspondiente o en el «Registro de decisiones» al final, con su fecha.

## Visión de producto (decisiones tomadas)

- **Innova School**: colegio virtual de 6° a 11° con IA. Es la marca principal y la visión original. Estructura de contenido por **nodos de conocimiento** interdisciplinarios. Requiere licencia de funcionamiento o alianza con un colegio aprobado para certificar (pendiente de definir).
- **Nova para Instituciones**: "un equipo docente con inteligencia artificial". Apoyo a colegios existentes, adaptado a su propia estructura (por asignatura, tema y DBA), sin imponer los nodos.
- **Equipo Nova**: los profesores IA. Cada uno tiene nombre propio y asignatura; ninguno se llama "Nova" (Nova es el nombre del equipo).
- **Saber 11**: plataforma totalmente independiente (saber11.virtualplanet-edu.co, repo `plataforma-saber11.`). Sin dependencia técnica. Desde el grado 11 de Innova School solo habrá un enlace; el estudiante se registra y paga allá.
- **Una sola plataforma, dos experiencias**: mismo motor (contenido etiquetado, tutores, evaluación, usuarios/roles/pagos/cartera/mensajería heredados de Saber 11). Innova School es técnicamente una institución más dentro de la plataforma.
- **Arquitectura real de Saber 11** (revisada el 23-nov-2026; corrige la idea anterior de "Next.js + Supabase"): React + Vite con servidor Express (`server.ts`) en un contenedor Docker en **Google Cloud Run** (servicio `plataforma-saber11`, región `us-central1`, proyecto `marco-saber-11`); **Firebase Authentication** (Google) y **Firestore** (base `saber11`, proyecto Firebase `ai-studio-applet-webapp-4b83e`); archivos en **Cloud Storage** (bucket `marco-saber-11-material-apoyo`); pagos con Tiendanube; correos con Resend; tutor socrático **Marco** (el tutor virtual con IA de Saber 11, no una persona; de ahí el nombre del proyecto `marco-saber-11`) en su propio servicio de Cloud Run (repo `tutor-saber11`). Los tutores de este repo usan Supabase solo para códigos de acceso y registro de uso.
- **Contenido atomizado**: unidades pequeñas etiquetadas por grado, asignatura, tema, DBA, estándar MEN y competencia ICFES. Los nodos son una vista (Innova School); la búsqueda por asignatura/tema es otra vista (Nova para Instituciones).
- **Orden recomendado**: (1) núcleo del estudiante (tutores, contenido, evaluación), (2) capa para colegios (Nova para Instituciones: vende más rápido, sin licencia), (3) capa de colegio virtual con certificación. Preparar la certificación en paralelo.
- Costo objetivo de referencia: precio de ~300.000 COP por estudiante al año (~US$6,25/mes).

## Los profesores del Equipo Nova

| Profesor | Asignatura | `TUTOR_SUBJECT` | Servicio en Render |
|---|---|---|---|
| Julián | Física y Matemáticas (decidido: conserva ambas) | `physics` | tutor-fisica.onrender.com |
| Esteban | Matemáticas | `mathematics` | tutor-matematicas.onrender.com |
| Andrés | Ciencias Naturales y Química | `natural_sciences` | tutor-naturales.onrender.com (servicio «Tutor-naturales») |
| Laura | Ciencias Sociales | `social_studies` | tutor-sociales.onrender.com |
| Miss Emily | Inglés y Francés | `languages` | tutor-emily.onrender.com |
| Felipe | Tecnología, Programación y Robótica | (no existe aún) | pendiente |
| Mateo | Lectura Crítica y Filosofía | (no existe aún) | pendiente |

Este repositorio sirve a todos: la variable `TUTOR_SUBJECT` decide el profesor. **Confirmado (2026-11-23) en el panel de Render:** los cinco servicios despliegan desde `cmolina3141516-ux/Tutor-fisica`, rama `main`. **Los cinco tienen auto-deploy «On Commit»** (encendido en Tutor-fisica —proyecto «TUTOR FÍSICA»—, Tutor-sociales, Tutor-Emily y Tutor-naturales el 2026-11-23): todo push a `main` se publica solo en los cinco profesores, así que a `main` solo llega código probado.

El panel de venta y códigos de acceso está en el repo `innova-school-panel` (landing + admin que crea códigos en la tabla `access_codes` de Supabase; pago por Tiendanube y comprobante por WhatsApp).

## Pedagogía: "socrático ligero"

Decidido porque los estudiantes quieren respuestas rápidas y, si solo reciben preguntas, se van a ChatGPT:

- Nunca responder una pregunta solo con otra pregunta. Cada respuesta entrega algo concreto y cierra con una sola pregunta corta.
- **Tres modos que elige el estudiante** (botones encima del chat): "Explícame rápido", "Guíame paso a paso" (máx. 3 pistas) y "Revisa mi respuesta" (veredicto, primer error, una pista).
- **Detector de impaciencia** ("ya dime", "no sé", "me rindo", también en inglés/francés): solución completa + ejercicio parecido.
- Instrucciones en `prompts/core.md` (comunes) y `prompts/<asignatura>.md`. Para cambiar cómo enseña un profesor se edita su archivo, no `server.js`.

## Control de costos (implementado)

Modelo actual **`gpt-6-luna`** (US$0,10 entrada / US$0,01 entrada en caché / US$0,50 salida por millón), elegido el 2026-11-23 (ver registro). Estimación: ~US$0,10–0,20/estudiante/mes (30 mensajes/día, 20 días). Con el anterior `gpt-5-mini` era ~US$2,8 antes de optimizar y ~US$0,70 después. Medidas:

- Instrucciones fijas primero (idénticas en cada mensaje) → caché de OpenAI, más `prompt_cache_key` por asignatura. El contexto del turno va en un mensaje `developer` justo antes del mensaje actual.
- Historial: últimos 8 mensajes recortados a 1.500 caracteres; adjuntos solo en el turno actual.
- `max_output_tokens` 2500 (quiz 5000).
- **Energía diaria** = columna `max_messages_per_day`: texto 1, con archivo 4, imagen generada +8. Gráficas SVG gratis.
- Registro de tokens y costo por respuesta: logs `[uso] {...}` y tabla `tutor_usage_log` (en `supabase-schema.sql`).
- Los precios por defecto en `server.js` (`PRICE_*_PER_M`) son los de `gpt-6-luna`. Si se cambia de modelo, cambiar también esos precios.

## Subidas permitidas

Un archivo por mensaje: foto/imagen (se comprime en el dispositivo a 1100 px), PDF de máximo 3 páginas, o Word .docx (el servidor extrae solo el texto, sin dependencias). Máximo 5 MB. El tope del cuerpo de la petición se subió de 1 MB a 8 MB.

## Estado actual

- **PR #1 fusionado en `main` el 2026-11-23** (commit `e19b50d`) y **en producción en los cinco servicios** con `OPENAI_MODEL=gpt-6-luna` (desplegado el mismo día).
- Probado con un servidor de OpenAI simulado (modos, impaciencia, Word, PDF, límites, quiz, energía, Julián y Miss Emily, interfaz en escritorio y móvil). **Falta probar con la clave real.**

## Próximos pasos

1. Correr el tutor localmente con la clave real (`.env` con `OPENAI_API_KEY`, `TUTOR_SUBJECT=physics`, `npm start`) y conversar con Julián en los tres modos. Ajustar `prompts/` según lo que Carlos observe como experto.
2. Confirmar desde qué repositorio despliega cada servicio de Render.
3. Ejecutar `supabase-schema.sql` en Supabase para crear `tutor_usage_log`.
4. Crear un servicio de prueba en Render desde la rama, validar y fusionar el PR.
5. Crear a Felipe y Mateo (nuevos `TUTOR_SUBJECT` y archivos en `prompts/`).
6. En `innova-school-panel`: el código trae `ADMIN_PASSCODE` por defecto `INNOVA2026` y el repo es público. Verificar que Render tenga una clave propia configurada.
7. Más adelante: conectar los tutores a la nueva plataforma (encargos del docente ligados a DBA, conversaciones guardadas para el tablero docente).

## Registro de decisiones

- **2026-11-23** — Toda decisión se anota en CLAUDE.md (pedido de Carlos).
- **2026-11-23** — Prueba local de Julián (paso 1): `.env` local (en `.gitignore`, nunca se sube) con `TUTOR_SUBJECT=physics`, `SCHOOL_NAME=Innova School`, puerto 8787, sin Supabase (acceso en memoria). Código de prueba fijo `JULIAN-PRUE-BA01-20261231` vía `ACCESS_CODES`. Límites subidos solo para pruebas: 200 de energía y 20 sesiones por día (producción sigue en 30 mensajes/día).
- **2026-11-23** — La clave de OpenAI la pega Carlos directamente en `.env`; no se escribe en el chat.
- **2026-11-23** — Para pruebas se usa una clave nueva de OpenAI llamada **«API de pruebas innova school»**, separada de la de producción en Render. Sirve para todas las pruebas (todos los profesores y funciones), no solo para Julián. Recomendado: crearla dentro de un proyecto propio de OpenAI con tope mensual de gasto.
- **2026-11-23** — El servidor local se arranca desde Claude Code con la configuración `julian` de `.claude/launch.json` (`npm start`, puerto 8787). Primera prueba real OK: modo rápido, ~2.100 tokens de entrada, 301 de salida, US$0,0011 por respuesta. OpenAI resolvió `gpt-5-mini` a `gpt-5-mini-2025-08-07` (la versión marcada como obsoleta).
- **2026-11-23** — **Regla: el estudiante jamás ve costos**, tokens, cuota, facturación ni errores internos (OpenAI, Supabase, clave). El registro `[uso]` va solo a la consola del servidor y a `tutor_usage_log` (con RLS). Los errores al navegador pasan por `toStudentError()` en `server.js`: el estudiante ve un mensaje genérico y el detalle queda en la consola como `[error chat|acceso|config]`. Solo se muestran tal cual los errores creados con `createStudentError()`.
- **2026-11-23** — **Urgente:** OpenAI apaga `gpt-5-mini` y `gpt-5-mini-2025-08-07` (y `gpt-5-nano`) el **11 de diciembre de 2026**. Producción en Render usa `gpt-5-mini` y dejará de responder ese día si no se cambia `OPENAI_MODEL`. Reemplazo oficial sugerido: `gpt-6.1-terra`. Precios por millón (entrada / caché / salida): `gpt-5-mini` 0,25/0,025/2; `gpt-6-luna` 0,10/0,01/0,50; `gpt-5.6-luna` 0,20/0,02/1,20; `gpt-5.4-mini` 0,75/0,075/4,50 (no está en la lista de retiro); `gpt-6.1-terra` 1/0,05/5. Modelo elegido: pendiente de prueba comparativa.
- **2026-11-23** — Prueba comparativa `gpt-6-luna` vs `gpt-6.1-terra` con Julián (8 casos: concepto, pregunta trampa, plano inclinado con fricción, guiado, revisar texto, impaciencia, revisar foto). Ambos funcionan sin cambios en el código (Responses API, `reasoning.effort`, imágenes y caché). **Física correcta en los dos.** Costo por mensaje: luna ~US$0,0001–0,0004; terra ~US$0,0006–0,004 (unas 10 veces más). Tiempo: luna 3–5 s, terra 4–7 s. Diferencia: en «Revisa mi respuesta» luna daba el resultado final y terra solo la pista. Se precisó la regla en `prompts/core.md` (no escribir el resultado final al revisar; cerrar pidiendo corregir) y luna pasó a cumplirla. Observación: la caché de OpenAI solo se activó en algunos mensajes (depende de OpenAI con poco tráfico; el prompt del sistema es idéntico en los tres modos).
- **2026-11-23** — `.env` local cambiado a `gpt-6-luna` (con sus precios `PRICE_*`) para que Carlos lo pruebe. Producción y `render.yaml` siguen en `gpt-5-mini` hasta que Carlos decida.
- **2026-11-23** — **Decisión de Carlos: el Equipo Nova usa `gpt-6-luna`.** Cambiado el modelo por defecto en `server.js`, los precios por defecto (0,10/0,01/0,50), `render.yaml` y todos los `.env.*.example`. Verificado localmente. ~~Falta en Render: cambiar `OPENAI_MODEL`~~ (hecho el 2026-11-23, ver más abajo). Ojo: `render.yaml` dice `rootDir: embed`, carpeta que no existe en este repo; otra señal de que hay que confirmar desde dónde despliega cada servicio.
- **2026-11-23** — Repos locales revisados: solo `tutor-fisica` sirve al Equipo Nova. `tutor-saber11`, `mi-replica` (plataforma-saber11) y `anuncio-marco` son otros productos y no se tocan con cambios del Equipo Nova.
- **2026-11-23** — **Voz desactivada por defecto:** los profesores no hablan si el estudiante no lo pide. La casilla «Lectura automática» viene desmarcada; la voz solo suena con esa casilla, con «Leer respuesta» o en «Modo manos libres».
- **2026-11-23** — **Voz según el género del profesor:** Julián, Esteban y Andrés usan voz masculina; Laura y Miss Emily, femenina (`voicePreference` en `server.js`; para Felipe y Mateo se puede fijar con `TUTOR_VOICE_GENDER=male|female`). El navegador no informa el género, así que se deduce por el nombre de la voz (`getVoiceGender` en `public/app.js`). Orden de elección: idioma → género → naturalidad (voces «Natural» de Edge, mejoradas/Premium de Apple, Google) → acento (es-CO primero). Si el estudiante elige otra voz en la lista, se respeta. Las voces más naturales están en Microsoft Edge (Gonzalo y Salomé, de Colombia); en Chrome para Windows solo hay voces locales (Raúl y Sabina).
- **2026-11-23** — La voz ya no lee símbolos: `cleanTextForSpeech` convierte fórmulas a palabras («v igual a raíz de 2 por a por d», «metros por segundo al cuadrado», «mu k», «seno theta»).
- **2026-11-23** — **Hallazgo al pasar a `gpt-6-luna`:** escribe las fórmulas en LaTeX y Markdown (`\frac`, `\[`, `**`), y la interfaz no los interpreta, así que el estudiante veía símbolos crudos. Corregido de dos formas: regla en `prompts/core.md` (notación plana, sin LaTeX ni Markdown) y respaldo `latexToPlainText` en `public/app.js` antes de mostrar. Verificado en el navegador. **Debe estar desplegado antes de cambiar `OPENAI_MODEL` en Render.**
- **2026-11-23** — **Servicio de prueba en Render** (`tutor-julian-prueba`): se despliega desde la rama `depuracion-equipo-nova` con auto-deploy, plan Free, Root Directory vacío (no `embed`), sin `startCommand` especial (`node server.js`). Usa la clave «API de pruebas innova school», `gpt-6-luna` y **no se conecta a Supabase** (acceso en memoria, sin tocar datos de producción). Su código de acceso es aleatorio y distinto del local; no se guarda en el repo.
- **2026-11-23** — Servicio de prueba **creado y en vivo**: https://tutor-julian-prueba.onrender.com (commit `7b71cdd`, despliegue de ~30 s). Verificado: configuración (Julián, voz masculina), código inválido rechazado, chat sin LaTeX ni Markdown, cierre de sesión.
- **2026-11-23** — **Error de cálculo de `gpt-6-luna`** en esa prueba: plano inclinado con a ≈ 2,03 m/s² (correcto 4,05) y v ≈ 4,03 m/s (correcto 5,69). Al repetir 3 problemas con respuesta conocida 5 veces cada uno, luna acertó 15/15 con `reasoning.effort` low y 15/15 con medium. El error es ocasional. Medium cuesta casi lo mismo (US$0,00015 frente a 0,00014 por mensaje, ~94 frente a ~70 tokens de razonamiento). **Decisión de Carlos (2026-11-23): esfuerzo `medium` por defecto** (`server.js`, `COST_CONTROL.reasoningEffort`; se puede cambiar con `OPENAI_REASONING_EFFORT`). Las dos llamadas que solo generan gráficas siguen en `low`. Verificado: 3/3 correctas, ~US$0,00013–0,00016 por mensaje.
- **2026-11-23** — En la cuenta de GitHub conectada a Render existen también `tutor-ciencias`, `NUEVO-TUTOR-CINECIAS-6-A-11-` y `tutor-fisica-virtual-planet` (además de `Tutor-fisica`). Es probable que algunos servicios de producción desplieguen desde esos repos: hay que confirmarlo (paso 2) antes de fusionar y cambiar el modelo. (Resuelto: ninguno los usa.)
- **2026-11-23** — Carlos reporta que el profesor «sigue hablando solo en la primera interacción» y con voz sintética. Reproducido en navegador limpio sobre https://tutor-julian-prueba.onrender.com (commit `2ddd9e1`, `app.js` sin caché, casilla desmarcada): **no habla solo** (0 llamadas de voz tras entrar, usar una idea rápida y recibir respuesta). **Causa: Carlos lo vio en producción (tutor-fisica.onrender.com), que sigue con el código viejo** (`autoSpeak: true`, casilla marcada). Se arregla al fusionar el PR. Voz sintética: en Chrome para Windows solo existen Raúl y Sabina; las voces naturales gratuitas solo están en Edge.
- **2026-11-23** — **Paso 2 (origen de los despliegues), comprobado comparando el `app.js` servido con el de este repo:** tutor-fisica, tutor-matematicas, tutor-sociales y tutor-emily sirven un `app.js` **idéntico al de `main` de este repo** (commit `c2007e9`), así que despliegan desde aquí y recibirán los cambios al fusionar el PR (si tienen auto-deploy desde `main`). tutor-ciencias.onrender.com responde 404 porque Andrés está en **tutor-naturales.onrender.com**, que también despliega desde `Tutor-fisica` / `main`. Los repos `tutor-ciencias`, `NUEVO-TUTOR-CINECIAS-6-A-11-` y `tutor-fisica-virtual-planet` no los usa ningún servicio activo.
- **2026-11-23** — Voz natural de pago (OpenAI): `gpt-4o-mini-tts`, `tts-1` y `tts-1-hd` están **obsoletos y se apagan el 6-ene-2027**; el reemplazo (`gpt-realtime-2.1-mini`, API Realtime, audio de salida US$20 por millón de tokens) cambia la forma de integrarlo. No conviene construir sobre los modelos TTS actuales.
- **2026-11-23** — **Decisión de Carlos: fusionar el PR #1 sin probar antes el servicio de prueba.** Fusionado en `main` (`e19b50d`). Tutor-matemáticas se redesplegó solo y sirve el código nuevo; Tutor-fisica, Tutor-sociales, Tutor-Emily y Tutor-naturales tienen auto-deploy apagado y siguen con el código viejo hasta un despliegue manual. Producción sigue con `OPENAI_MODEL=gpt-5-mini` en Render: el código nuevo funciona con ese modelo hasta el 11-dic-2026, pero el esfuerzo `medium` aumenta sus tokens de razonamiento (más costo con gpt-5-mini) y el registro `[uso]` calcula el costo con precios de luna mientras no se cambie el modelo.
- **2026-11-23** — **Producción actualizada (decisión de Carlos: «Sí, hazlo»).** En los cinco servicios de Render (Tutor-fisica, Tutor-matemáticas, Tutor-sociales, Tutor-Emily, Tutor-naturales) se cambió `OPENAI_MODEL` de `gpt-5-mini` a `gpt-6-luna` con «Save, rebuild, and deploy», que además desplegó `e19b50d`. Ningún servicio tenía variables `PRICE_*` (usan los precios por defecto de luna). Verificado: los cinco sirven el `app.js` de `main` y su `/api/config` muestra el profesor correcto. El auto-deploy sigue apagado en cuatro servicios: los próximos cambios en `main` hay que desplegarlos a mano (o encender auto-deploy). **Falta:** una conversación real en producción con un código de acceso para confirmar que luna responde.

- **2026-11-23** — **Decisión de Carlos: misma estructura que Saber 11 para Innova School y el Equipo Nova.** Inicio de sesión con **Firebase Authentication**, base de datos en **Firestore** y archivos de apoyo en **Google Cloud Storage**; los servicios en **Google Cloud Run** (contenedor Docker y publicación segura como `scripts/publicar.sh` de Saber 11). Se migra desde Render + Supabase **después** de lo urgente (fusionar el PR y poner `gpt-6-luna` en Render antes del 11-dic-2026).
- **2026-11-23** — **Decisión de Carlos: Innova School tendrá su propio proyecto de Google Cloud y Firebase, totalmente separado de Saber 11** (sin compartir datos, usuarios, archivos, facturación ni permisos con `marco-saber-11` ni `ai-studio-applet-webapp-4b83e`). El nombre del proyecto se define al crearlo (sugerido: `innova-school`).
- **2026-11-23** — **Auto-deploy encendido (pedido de Carlos)** en Tutor-fisica, Tutor-sociales, Tutor-Emily y Tutor-naturales, con la opción «On Commit», igual que Tutor-matemáticas. Desde ahora cada push a `main` redespliega los cinco servicios (unos segundos de reinicio en plan Free), incluso si solo cambia CLAUDE.md. Lo que no esté probado se trabaja en `depuracion-equipo-nova` (que despliega a `tutor-julian-prueba`) y pasa a `main` después.

## Cómo probar sin gastar

`OPENAI_API_BASE` permite apuntar a un servidor simulado (por ejemplo `http://localhost:9999`) que devuelva respuestas con el formato de la API Responses. Sin Supabase configurado, el acceso funciona en memoria con códigos del formato `JULIAN-XXXX-XXXX-AAAAMMDD`.
