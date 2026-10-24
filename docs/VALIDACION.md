# Validación de los cálculos

## 1. Pruebas automáticas

Ejecutar con Node.js 18 o superior (sin instalar paquetes):

```bash
npm test
```

Resultado actual: **45 pruebas, 44 superadas, 1 omitida** (la comparación con el Excel de referencia, pendiente de datos; ver sección 3).

| Archivo | Qué verifica |
|---|---|
| `tests/stats.test.js` | Regresión, distribuciones t y F y descriptivos frente a valores publicados de R (cuarteto de Anscombe; `qt`, `pt`). |
| `tests/dataset.test.js` | Meses y números en formatos colombianos e internacionales, unidades, duplicados, incompletos (no se reemplazan por cero), meses faltantes, exclusiones manuales y presupuesto con unidades incompatibles. |
| `tests/analysis.test.js` | Funcionamiento con **12, 17, 24, 36 y 60 meses** sin supuestos de 12 meses; contraste con una implementación independiente de mínimos cuadrados; casos con pocos datos; línea meta; base 100; CUSUM; ahorro de seguimiento con ahorro conocido (10 %); descomposición presupuestal exacta; huella; tabla única real + presupuesto; valores de referencia de las demostraciones (prueba de regresión). |
| `tests/benchmark.test.js` | Zonas, % de la meta consumido, ahorro %, orden de los rankings (ahorro y factor de emisión). |
| `tests/io.test.js` | CSV, texto pegado, Excel comprimido real (cadenas compartidas, fechas), exportación a Excel con fórmulas, CSV reimportable e informe completo. |
| `tests/excel.test.js` | Comparación con el Excel de referencia (se activa al completar `tests/referencia_excel.json`). |

## 2. Valores de referencia externos

Cuarteto de Anscombe, conjunto I (salida de `lm()` en R) frente a la aplicación:

| Estadístico | R | Aplicación |
|---|---|---|
| Pendiente | 0,5001 | 0,500091 |
| Intercepto | 3,0001 | 3,000091 |
| R² | 0,6665 | 0,666542 |
| R² ajustado | 0,6295 | 0,629492 |
| Error típico residual | 1,237 | 1,236603 |
| EE pendiente / t | 0,1179 / 4,241 | 0,117906 / 4,241455 |
| p-value pendiente | 0,00217 | 0,002170 |
| p-value intercepto | 0,02573 | 0,025734 |
| F | 17,99 | 17,98994 |

Cuantiles t: t(0,975; 15) = 2,131450; t(0,975; 10) = 2,228139; t(0,975; 1) = 12,706205; P(T ≤ 2; 10) = 0,963306. Todos coinciden con R hasta 6 cifras.

Además, el libro de Excel exportado incluye hojas de **verificación con fórmulas nativas** (`PENDIENTE`, `INTERSECCION.EJE`, `COEFICIENTE.R2`, `ERROR.TIPICO.XY`, `DISTR.T`). Al abrirlo en Excel se recalculan y la columna «Diferencia» debe ser ≈ 0.

## 3. Comparación con el Excel del estudio de referencia

El Excel original no estaba disponible al desarrollar esta versión, por lo que **no se ha realizado todavía la comparación numérica** con él. Para hacerla:

1. Abra `tests/referencia_excel.json`.
2. Copie en `observaciones` los meses del Excel como `["AAAA-MM", consumo, producción]`.
3. Copie en `resultados_excel` los valores calculados por el Excel (pendiente, intercepto, R², error típico, puntos y coeficientes de la línea meta, IC promedio).
4. Ejecute `npm test`. La prueba informa cada diferencia relativa y falla si alguna supera la tolerancia.

Si hay diferencias, revise los puntos de la sección 10 de `METODOLOGIA.md` (desviación muestral o poblacional, IC simple o ponderado, criterio de selección de la línea meta, convención base 100 y unidad del factor de emisión).

## 4. Prueba integral

| Caso | Resultado |
|---|---|
| Demostración de 17 meses | 17 observaciones en la regresión; E = 0,03607·P + 185.286 kWh; R² = 0,963; línea meta con 10 meses; las 11 pestañas de resultados se generan sin errores. |
| Archivo de 24 meses importado (`data/ejemplo_24_meses_con_presupuesto.csv`) | Columnas detectadas automáticamente (incluido el presupuesto); 24 observaciones; E = 0,03572·P + 188.226 kWh; R² = 0,954; comparación presupuestal de 24 meses; aparece en el tablero comparativo. |
| Demostración de 36 meses con un mes faltante | 35 observaciones; el mes faltante se informa y no se imputa; ahorro de seguimiento 4,7 % (IC 95 % distinto de cero). |
| 4 empresas (tablero y ranking) | Zonas y rankings coherentes con los ahorros simulados (+6,8 %, +4,7 %, −2,7 %, +0,3 % indicativo). |
| Datos pegados con errores | Duplicados bloquean el análisis; meses incompletos se excluyen sin reemplazar por cero; se listan los meses faltantes. |
