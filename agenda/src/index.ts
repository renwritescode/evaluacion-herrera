import express from "express";

const PUERTO = Number(process.env.PORT ?? 3001);
const RETARDO_MS = Number(process.env.RETARDO_MS ?? 0);

type Medico = {
  id: string;
  nombre: string;
  especialidad: string;
  cupos: number;
};

// Catálogo ficticio propio. Los tres identificadores del experimento son obligatorios:
// MED-01 con 20 cupos, MED-03 con 0 cupos y ningún médico con el id MED-99.
const medicos: Medico[] = [
  { id: "MED-01", nombre: "Dra. Yadira Cevallos", especialidad: "Medicina general", cupos: 20 },
  { id: "MED-02", nombre: "Dr. Leoncio Alvarado", especialidad: "Pediatría", cupos: 1 },
  { id: "MED-03", nombre: "Dra. Oneida Bravo", especialidad: "Cardiología", cupos: 0 },
  { id: "MED-04", nombre: "Dr. Absalón Macías", especialidad: "Dermatología", cupos: 8 },
  { id: "MED-05", nombre: "Dra. Maribel Cedeño", especialidad: "Ginecología", cupos: 12 },
];

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ estado: "ok", servicio: "agenda" });
});

app.get("/medicos", (_req, res) => {
  res.json(medicos);
});

app.post("/medicos/:id/reservar", async (req, res) => {
  const { id } = req.params;

  // Retardo artificial para simular un servicio lento sin sacarlo de la red.
  if (RETARDO_MS > 0) {
    await new Promise((resolver) => setTimeout(resolver, RETARDO_MS));
  }

  const medico = medicos.find((m) => m.id === id);

  if (!medico) {
    res.status(404).json({ error: `No existe el médico ${id}` });
    return;
  }

  if (medico.cupos <= 0) {
    res.status(409).json({
      error: `El médico ${id} no tiene cupos disponibles`,
      medicoId: medico.id,
      cuposRestantes: 0,
    });
    return;
  }

  medico.cupos -= 1;
  console.log(`[agenda] reserva ${medico.id}: cupos restantes ${medico.cupos}`);
  res.json({ medicoId: medico.id, cuposRestantes: medico.cupos });
});

app.listen(PUERTO, "0.0.0.0", () => {
  console.log(`[agenda] escuchando en el puerto ${PUERTO}`);
  console.log(`[agenda] RETARDO_MS=${RETARDO_MS}`);
});
