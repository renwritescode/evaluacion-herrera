# evaluacion-herrera

**Estudiante:** René Yasser Herrera Zambrano
**Usuario de GitHub:** [@renwritescode](https://github.com/renwritescode)

Sistema distribuido de citas médicas con tres servicios que se comunican por red.

| Servicio | Puerto | Qué hace |
|---|---:|---|
| Agenda | 3001 | Administra médicos y cupos en memoria; descuenta un cupo por reserva. |
| Citas | 3000 | Recibe las solicitudes HTTP, reserva en Agenda, crea la cita y avisa por TCP a Notificaciones. |
| Notificaciones | 4000 | Servidor TCP que registra los avisos `CITA_CREADA` y confirma cada línea. |

## Levantar todo con Docker

```bash
docker compose up -d --build
docker compose ps
```

Los tres servicios deben aparecer con estado `healthy`.

## Comandos útiles

```bash
# Ver registros
docker compose logs citas
docker compose logs agenda
docker compose logs notificaciones

# Detener un servicio (simula caída)
docker compose stop notificaciones
docker compose start notificaciones

# Congelar Agenda (simula un proceso que no responde)
docker compose pause agenda
docker compose unpause agenda

# Apagar todo
docker compose down
```

## Rutas HTTP

- `GET http://localhost:3001/health`
- `GET http://localhost:3001/medicos`
- `POST http://localhost:3001/medicos/MED-01/reservar`
- `GET http://localhost:3000/health`
- `GET http://localhost:3000/citas`
- `POST http://localhost:3000/citas`
- `GET http://localhost:3000/reporte?n=15000000`

Cuerpo de `POST /citas`:

```json
{ "paciente": "René Herrera", "medicoId": "MED-01" }
```

## Ejecutar sin Docker (tres terminales)

En cada carpeta (`agenda`, `citas`, `notificaciones`):

```bash
npm ci
npm run build
npm start
```

Citas usa por defecto `http://localhost:3001`, `localhost:4000`, `AGENDA_TIMEOUT_MS=2000` y
`NOTIFICACIONES_TIMEOUT_MS=1000`. Se pueden cambiar con variables de entorno.

## Cliente TCP de prueba

```bash
node cliente-tcp.mjs localhost 4000 normal
node cliente-tcp.mjs localhost 4000 partido
node cliente-tcp.mjs localhost 4000 dos
node cliente-tcp.mjs localhost 4000 invalido
```
