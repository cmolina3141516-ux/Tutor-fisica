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
