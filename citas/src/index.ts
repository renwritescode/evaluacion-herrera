import express from "express";
import net from "node:net";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";

const PUERTO = Number(process.env.PORT ?? 3000);
const AGENDA_URL = (process.env.AGENDA_URL ?? "http://localhost:3001").replace(/\/+$/, "");
const AGENDA_TIMEOUT_MS = Number(process.env.AGENDA_TIMEOUT_MS ?? 2000);
const NOTIFICACIONES_HOST = process.env.NOTIFICACIONES_HOST ?? "localhost";
const NOTIFICACIONES_PORT = Number(process.env.NOTIFICACIONES_PORT ?? 4000);
const NOTIFICACIONES_TIMEOUT_MS = Number(process.env.NOTIFICACIONES_TIMEOUT_MS ?? 1000);

type Cita = {
  id: string;
  paciente: string;
  medicoId: string;
  creadaEn: string;
  notificada: boolean;
};

type ResultadoAgenda =
  | { ok: true; estado: number; cuerpo: Record<string, unknown>; duracionMs: number }
  | { ok: false; motivo: string; duracionMs: number };

type ResultadoAviso = { ok: true } | { ok: false; motivo: string };

const citas: Cita[] = [];
const app = express();
app.use(express.json());

async function reservarEnAgenda(medicoId: string): Promise<ResultadoAgenda> {
  const inicio = Date.now();
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), AGENDA_TIMEOUT_MS);

  try {
    const respuesta = await fetch(
      `${AGENDA_URL}/medicos/${encodeURIComponent(medicoId)}/reservar`,
      { method: "POST", signal: controlador.signal },
    );

    let cuerpo: Record<string, unknown> = {};
    try {
      cuerpo = (await respuesta.json()) as Record<string, unknown>;
    } catch {
      cuerpo = {};
    }

    return {
      ok: true,
      estado: respuesta.status,
      cuerpo,
      duracionMs: Date.now() - inicio,
    };
  } catch (error) {
    const duracionMs = Date.now() - inicio;
    const fallo = error as Error & { cause?: { code?: string }; code?: string };

    if (controlador.signal.aborted) {
      return {
        ok: false,
        motivo: `Agenda no respondió en ${AGENDA_TIMEOUT_MS} ms`,
        duracionMs,
      };
    }

    const codigo = fallo.cause?.code ?? fallo.code ?? fallo.message;
    return {
      ok: false,
      motivo: `No se pudo conectar con Agenda (${codigo})`,
      duracionMs,
    };
  } finally {
    clearTimeout(temporizador);
  }
}

function avisarNotificaciones(cita: Cita): Promise<ResultadoAviso> {
  return new Promise((resolver) => {
    let terminado = false;
    let pendiente = "";
    let temporizador: NodeJS.Timeout | undefined;

    const socket = net.createConnection({
      host: NOTIFICACIONES_HOST,
      port: NOTIFICACIONES_PORT,
    });

    const finalizar = (resultado: ResultadoAviso): void => {
      if (terminado) return;
      terminado = true;

      if (temporizador) clearTimeout(temporizador);
      socket.destroy();
      resolver(resultado);
    };

    temporizador = setTimeout(() => {
      finalizar({
        ok: false,
        motivo: `Notificaciones no respondió en ${NOTIFICACIONES_TIMEOUT_MS} ms`,
      });
    }, NOTIFICACIONES_TIMEOUT_MS);

    socket.setEncoding("utf8");

    socket.on("connect", () => {
      const aviso = {
        tipo: "CITA_CREADA",
        citaId: cita.id,
        paciente: cita.paciente,
        medicoId: cita.medicoId,
      };
      socket.write(JSON.stringify(aviso) + "\n");
    });

    socket.on("data", (trozo: string) => {
      pendiente += trozo;
      const fin = pendiente.indexOf("\n");
      if (fin === -1) return;

      const linea = pendiente.slice(0, fin);

      try {
        const respuesta = JSON.parse(linea) as { ok?: boolean; error?: string };
        if (respuesta.ok === true) {
          finalizar({ ok: true });
        } else {
          finalizar({
            ok: false,
            motivo: respuesta.error ?? "Notificaciones rechazó el aviso",
          });
        }
      } catch {
        finalizar({ ok: false, motivo: "Respuesta inválida de Notificaciones" });
      }
    });

    socket.on("error", (error: NodeJS.ErrnoException) => {
      const codigo = error.code ?? error.message;
      finalizar({
        ok: false,
        motivo: `No se pudo conectar con Notificaciones (${codigo})`,
      });
    });

    socket.on("close", () => {
      finalizar({
        ok: false,
        motivo: "Notificaciones cerró la conexión sin confirmar",
      });
    });
  });
}

app.get("/health", (_req, res) => {
  res.json({ estado: "ok", servicio: "citas" });
});

app.get("/citas", (_req, res) => {
  res.json(citas);
});

app.post("/citas", async (req, res) => {
  const cuerpo = (req.body ?? {}) as { paciente?: unknown; medicoId?: unknown };
  const paciente = typeof cuerpo.paciente === "string" ? cuerpo.paciente.trim() : "";
  const medicoId = typeof cuerpo.medicoId === "string" ? cuerpo.medicoId.trim() : "";

  // Se valida antes de llamar a Agenda: un cuerpo incompleto no consume cupo.
  if (!paciente || !medicoId) {
    res.status(400).json({ error: "paciente y medicoId son obligatorios" });
    return;
  }

  console.log(`[citas] POST /citas paciente="${paciente}" medico="${medicoId}"`);

  const reserva = await reservarEnAgenda(medicoId);

  if (!reserva.ok) {
    console.log(
      `[citas] error con Agenda: ${reserva.motivo} (${reserva.duracionMs} ms)`,
    );
    res.status(503).json({
      error: "Agenda no disponible",
      motivo: reserva.motivo,
      duracionMs: reserva.duracionMs,
    });
    return;
  }

  if (reserva.estado === 404 || reserva.estado === 409) {
    console.log(
      `[citas] Agenda respondió ${reserva.estado}: ${JSON.stringify(reserva.cuerpo)}`,
    );
    res.status(reserva.estado).json(reserva.cuerpo);
    return;
  }

  if (reserva.estado !== 200) {
    console.log(`[citas] Agenda respondió ${reserva.estado} (inesperado)`);
    res.status(502).json({
      error: "Respuesta inesperada de Agenda",
      estado: reserva.estado,
      cuerpo: reserva.cuerpo,
    });
    return;
  }

  const cita: Cita = {
    id: randomUUID(),
    paciente,
    medicoId,
    creadaEn: new Date().toISOString(),
    notificada: false,
  };

  const aviso = await avisarNotificaciones(cita);
  cita.notificada = aviso.ok;

  if (!aviso.ok) {
    console.log(`[citas] aviso no confirmado: ${aviso.motivo}`);
  }

  citas.push(cita);

  res.status(201).json({
    ...cita,
    cuposRestantes: reserva.cuerpo.cuposRestantes,
    ...(aviso.ok ? {} : { motivoNotificacion: aviso.motivo }),
  });
});

app.get("/reporte", (req, res) => {
  const n = req.query.n === undefined ? 8_000_000 : Number(req.query.n);

  if (!Number.isInteger(n) || n < 2 || n > 50_000_000) {
    res.status(400).json({ error: "n debe ser un entero entre 2 y 50000000" });
    return;
  }

  const trabajador = new Worker(path.join(__dirname, "worker.js"), {
    workerData: { n },
  });

  let respondido = false;

  trabajador.on("message", (mensaje: { primos: number; duracionMs: number }) => {
    if (respondido) return;
    respondido = true;

    res.json({
      modo: "worker",
      n,
      primos: mensaje.primos,
      citasRegistradas: citas.length,
      duracionMs: mensaje.duracionMs,
    });
  });

  trabajador.on("error", (error) => {
    if (respondido) return;
    respondido = true;

    console.log(`[citas] error del hilo trabajador: ${error.message}`);
    res.status(500).json({
      error: "El hilo trabajador falló",
      motivo: error.message,
    });
  });

  trabajador.on("exit", (codigo) => {
    if (respondido) return;
    respondido = true;

    res.status(500).json({
      error: "El hilo trabajador terminó sin resultado",
      codigo,
    });
  });
});

app.listen(PUERTO, "0.0.0.0", () => {
  console.log(`[citas] escuchando en el puerto ${PUERTO}`);
  console.log(`[citas] Agenda: ${AGENDA_URL} (timeout ${AGENDA_TIMEOUT_MS} ms)`);
  console.log(
    `[citas] Notificaciones: ${NOTIFICACIONES_HOST}:${NOTIFICACIONES_PORT} ` +
      `(timeout ${NOTIFICACIONES_TIMEOUT_MS} ms)`,
  );
});
