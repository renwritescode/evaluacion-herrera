import { parentPort, workerData } from "node:worker_threads";

type DatosTrabajo = { n: number };

// Implementación directa: se ejecuta en un hilo aparte para no bloquear
// el bucle de eventos del proceso principal.
function esPrimo(numero: number): boolean {
  if (numero < 2) return false;

  for (let divisor = 2; divisor * divisor <= numero; divisor += 1) {
    if (numero % divisor === 0) return false;
  }

  return true;
}

const { n } = workerData as DatosTrabajo;
const inicio = Date.now();
let primos = 0;

for (let numero = 2; numero < n; numero += 1) {
  if (esPrimo(numero)) {
    primos += 1;
  }
}

parentPort?.postMessage({ primos, duracionMs: Date.now() - inicio });
