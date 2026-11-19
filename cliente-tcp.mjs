// Cliente TCP para probar el servicio Notificaciones.
// Uso: node cliente-tcp.mjs [host] [puerto] [modo]
// modo: normal (por defecto) | partido | dos | invalido
import net from "node:net";

const host = process.argv[2] ?? "localhost";
const puerto = Number(process.argv[3] ?? 4000);
const modo = process.argv[4] ?? "normal";

const linea = (id) =>
  JSON.stringify({
    tipo: "PRUEBA",
    citaId: id,
    paciente: "Prueba",
    medicoId: "MED-01",
  }) + "\n";

const socket = net.createConnection({ host, port: puerto }, () => {
  console.log(`Conectado a ${host}:${puerto} (modo ${modo})`);

  if (modo === "partido") {
    const l = linea("demo-partido");
    socket.write(l.slice(0, 10)); // primera parte del mensaje
    setTimeout(() => socket.write(l.slice(10)), 300); // el resto llega después
  } else if (modo === "dos") {
    socket.write(linea("demo-1") + linea("demo-2")); // dos mensajes en una sola escritura
  } else if (modo === "invalido") {
    socket.write("esto no es JSON\n");
  } else {
    socket.write(linea("demo-1"));
  }
});

const esperadas = modo === "dos" ? 2 : 1;
let recibidas = 0;
let pendiente = "";

socket.setEncoding("utf8");
socket.setTimeout(2000);

socket.on("data", (trozo) => {
  pendiente += trozo;
  let fin = pendiente.indexOf("\n");

  while (fin !== -1) {
    console.log("Respuesta del servidor:", pendiente.slice(0, fin));
    pendiente = pendiente.slice(fin + 1);
    recibidas += 1;
    fin = pendiente.indexOf("\n");
  }

  if (recibidas >= esperadas) socket.end(); // cerramos nuestra mitad de la conexión
});

socket.on("timeout", () => {
  console.log(
    `El servidor no respondió en 2000 ms (respuestas recibidas: ${recibidas} de ${esperadas})`,
  );
  socket.destroy();
});

socket.on("error", (err) => console.log("Error del socket:", err.code ?? err.message));
socket.on("close", () => console.log("Conexión cerrada"));
