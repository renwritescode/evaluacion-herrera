import net from "node:net";

const PUERTO = Number(process.env.PORT ?? 4000);

type Aviso = {
  tipo?: string;
  citaId?: string;
  paciente?: string;
  medicoId?: string;
};

const servidor = net.createServer((socket) => {
  socket.setEncoding("utf8");
  let pendiente = "";

  // El límite del mensaje es el salto de línea, no la frontera entre paquetes.
  socket.on("data", (trozo: string) => {
    pendiente += trozo;

    let fin = pendiente.indexOf("\n");
    while (fin !== -1) {
      const linea = pendiente.slice(0, fin).trim();
      pendiente = pendiente.slice(fin + 1);

      if (linea.length > 0) {
        procesarLinea(linea, socket);
      }

      fin = pendiente.indexOf("\n");
    }
  });

  socket.on("error", (error) => {
    console.log(`[notificaciones] error de conexión: ${error.message}`);
  });
});

function procesarLinea(linea: string, socket: net.Socket): void {
  let aviso: Aviso;

  try {
    const parseado: unknown = JSON.parse(linea);
    if (parseado === null || typeof parseado !== "object") {
      throw new Error("El JSON no es un objeto");
    }
    aviso = parseado as Aviso;
  } catch {
    // Un mensaje mal formado no cierra la conexión.
    socket.write(JSON.stringify({ ok: false, error: "JSON inválido" }) + "\n");
    return;
  }

  console.log(
    `[notificaciones] ${aviso.tipo ?? "SIN_TIPO"} cita=${aviso.citaId ?? "SIN_CITA"} ` +
      `paciente=${aviso.paciente ?? "SIN_PACIENTE"} medico=${aviso.medicoId ?? "SIN_MEDICO"}`,
  );

  socket.write(
    JSON.stringify({ ok: true, recibido: String(aviso.citaId ?? "") }) + "\n",
  );
}

servidor.listen(PUERTO, "0.0.0.0", () => {
  console.log(`[notificaciones] servidor TCP escuchando en el puerto ${PUERTO}`);
});

function cerrar(): void {
  servidor.close(() => process.exit(0));
}

process.on("SIGTERM", cerrar);
process.on("SIGINT", cerrar);
