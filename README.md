# Tutor Embebible para Udeki

Este modulo crea un tutor de fisica embebible con interfaz propia, listo para publicarse como pagina independiente e incrustarlo en Udeki mediante `iframe` o enlace directo.

## Incluye

- `server.js`: servidor HTTP minimo con proxy seguro hacia OpenAI.
- `public/index.html`: interfaz del chat.
- `public/styles.css`: diseno visual del widget.
- `public/app.js`: logica del frontend.
- `public/avatar-orion.svg`: avatar ilustrado inspirado en la imagen adjunta.
- `.env.example`: variables necesarias para correr el tutor.

## Preparacion

1. Copia `.env.example` como `.env`.
2. Pon tu clave en `OPENAI_API_KEY`.
3. Si quieres, cambia el nombre del tutor o de la institucion en `.env`.

## Ejecucion local

1. Abre una terminal en `embed`.
2. Ejecuta `node server.js`.
3. Abre `http://localhost:8787`.

## Despliegue en Render

Este proyecto ya queda listo para desplegarse como servicio web en Render.

### Opcion recomendada

Usa un `Web Service` de Render conectado a tu repositorio.

### Archivos incluidos para Render

- `package.json`
- `render.yaml`
- `.gitignore`

### Pasos

1. Sube este proyecto a GitHub.
2. Entra a Render y elige `New +` -> `Blueprint` o `Web Service`.
3. Conecta el repositorio.
4. Si usas `render.yaml`, Render detectara automaticamente la configuracion.
5. Agrega la variable secreta `OPENAI_API_KEY`.
6. Despliega.

### Variables importantes

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SCHOOL_NAME`
- `TUTOR_NAME`

### Resultado esperado

Obtendras una URL publica tipo:

`https://tutor-fisica-virtual-planet.onrender.com`

Luego puedes incrustarla en Udeki con `iframe`.

## Embed en Udeki

Si Udeki permite insertar un `iframe`, puedes usar algo como:

```html
<iframe
  src="https://tu-dominio.com/tutor-fisica/"
  width="100%"
  height="900"
  style="border:0;border-radius:20px;overflow:hidden;"
  loading="lazy"
  allow="clipboard-write; microphone">
</iframe>
```

Si no permite `iframe`, publica esta interfaz como pagina externa y enlazala desde el aula virtual.

## Seguridad

- No pongas `OPENAI_API_KEY` en el frontend.
- La clave vive solo en `server.js` mediante variables de entorno.
- El frontend habla con `/api/chat`, y el servidor reenvia la solicitud a OpenAI.

## Avatar

El archivo `public/avatar-orion.svg` es una adaptacion grafica inspirada en la foto adjunta: profesor de laboratorio, bata blanca, fondo academico y elementos de fisica.

Si despues quieres usar la foto real recortada como retrato circular, puedo prepararte una segunda version del widget para eso.

## Equipo Nova: cómo enseñan los tutores (noviembre 2026)

Un mismo código sirve a todos los profesores. La variable `TUTOR_SUBJECT` decide quién es:
`physics` (Profesor Julián, Física y Matemáticas), `mathematics` (Profesor Esteban), `natural_sciences` (Profesor Andrés),
`social_studies` (Profesora Laura) y `languages` (Miss Emily).

Las instrucciones de cada profesor viven en `prompts/`:

- `prompts/core.md`: reglas comunes del Equipo Nova (socrático ligero, tres modos de ayuda, detector de impaciencia, formato).
- `prompts/<asignatura>.md`: identidad, estilo y alcance por grado de cada profesor.

Para ajustar cómo enseña un profesor, edita su archivo y vuelve a desplegar. No hace falta tocar `server.js`.

### Tres modos de ayuda que elige el estudiante

- **Explícame rápido**: respuesta directa y breve, cierra con una pregunta corta.
- **Guíame paso a paso**: un avance concreto por turno y una sola pregunta; máximo 3 pistas antes de mostrar la solución.
- **Revisa mi respuesta**: el estudiante sube foto, PDF o Word; el tutor da el veredicto, ubica el primer error y da una pista.

Si el estudiante muestra impaciencia ("ya dime", "no sé", "me rindo"), el tutor da la solución completa y propone un ejercicio parecido.

### Subidas permitidas

Un archivo por mensaje: foto o imagen (se comprime en el dispositivo), PDF de máximo 3 páginas o Word (.docx, se envía solo su texto).
Tamaño máximo 5 MB.

### Control de costos

- Las instrucciones fijas van primero y son idénticas en cada mensaje, para aprovechar la caché de OpenAI (entrada 90 % más barata).
- Solo se envían los últimos 8 mensajes, recortados a 1.500 caracteres; los adjuntos solo viajan en el mensaje actual.
- Tope de salida por respuesta (`OPENAI_MAX_OUTPUT_TOKENS`, por defecto 2500 incluyendo razonamiento).
- **Energía diaria**: la columna `max_messages_per_day` del código funciona como cupo de energía.
  Un mensaje cuesta 1, un mensaje con archivo cuesta 4 (1 + `ENERGY_COST_ATTACHMENT`) y una imagen generada suma 8 (`ENERGY_COST_GENERATED_IMAGE`).
  Las gráficas matemáticas en SVG no consumen energía adicional.
- Cada respuesta registra tokens y costo estimado en los logs de Render (`[uso] {...}`) y, si existe, en la tabla `tutor_usage_log` de Supabase.
  Ejecuta de nuevo `supabase-schema.sql` para crearla.

Variables opcionales: `HISTORY_MAX_MESSAGES`, `HISTORY_MAX_CHARS`, `OPENAI_REASONING_EFFORT`, `UPLOAD_MAX_BYTES`,
`UPLOAD_MAX_PDF_PAGES`, `PRICE_INPUT_PER_M`, `PRICE_CACHED_INPUT_PER_M`, `PRICE_OUTPUT_PER_M`.
