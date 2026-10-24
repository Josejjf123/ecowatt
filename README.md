# EcoWatt — Gestión y Desempeño Energético

> **EcoFest Barranquilla 2026 · EcoHackathon** — Reto propuesto por la Cámara de Comercio de Barranquilla  
> **Participantes:**  
> - Jose Mauricio Lopez Robles  
> - Daniel Granados  

🌐 **Despliegue en GitHub Pages:** [https://josejjf123.github.io/ecowatt/](https://josejjf123.github.io/ecowatt/)  
💡 **Landing Explicativa:** [https://josejjf123.github.io/ecowatt/landing.html](https://josejjf123.github.io/ecowatt/landing.html)  

Aplicación web para que una empresa haga su **caracterización y diagnóstico energético** sin conocimientos avanzados: registra o importa sus datos mensuales (consumo, producción y, si lo tiene, presupuesto) y obtiene línea base, línea meta, indicadores base 100, CUSUM, seguimiento presupuestal ajustado por producción, huella de carbono y ecológica, oportunidades de mejora y un informe técnico reproducible. Varias empresas pueden compararse en un **tablero** (qué % de su meta consumió cada una y en qué zona quedó) y en **rankings** (por ahorro demostrado y por factor de emisión).

La metodología usa los conceptos de ISO 50001/50006 (línea base energética, indicadores de desempeño, seguimiento). La aplicación no constituye certificación ni declaración de cumplimiento de esas normas.

## Cómo ejecutarla

**Opción 1 — sin instalar nada:** clone el repositorio (`git clone https://github.com/Josejjf123/ecowatt.git`) o descargue la carpeta y abra `index.html` con doble clic (Chrome, Edge, Firefox o Safari recientes). Funciona sin conexión a internet.

**Opción 2 — servidor local** (requiere Node.js 18+):

```bash
node serve.js
```

y abra http://localhost:8080.

**Enlaces de demostración** (con el servidor local): `?demo=24&paso=3` (24 meses con presupuesto) · `?demo=36&paso=3` (base + seguimiento) · `?demo=multi&paso=5` (4 empresas en el tablero).

**Pruebas automáticas:**

```bash
npm test
```

## Uso

Por empresa (selector «Empresa activa» y botón **＋ Empresa** en la barra superior):

1. **Empresa y unidades** — identificación, energético, unidades y factores ambientales (por defecto los del Excel: emisión 0,4341667 t CO₂/kWh; huella 0,000383 ha/t CO₂; editables).
2. **Datos reales y presupuesto** — una sola tabla: mes, consumo y producción reales (obligatorios) y presupuestados (opcionales). Sin límite de meses. Se puede agregar, editar, eliminar, importar CSV/Excel o pegar desde Excel. La validación aparece debajo de la tabla, en vivo.
3. **Resultados** — Resumen, Descriptiva e IC, Línea base, Línea meta, Indicadores base 100, Seguimiento, Presupuesto, Huella ecológica, Oportunidades, Calidad de datos y Metodología.
4. **Exportar** — informe técnico (HTML imprimible a PDF), Excel con fórmulas de verificación, CSV y proyecto (.json).

Entre empresas:

5. **Tablero comparativo** — % de la meta consumido y zona (verde, amarilla, roja), ahorro, presupuesto consumido y huella de cada empresa, con gráficas comparativas.
6. **Ranking** — por ahorro demostrado y por factor de emisión; descargable en CSV.

## Estructura

```
index.html                 Página principal
assets/css/styles.css      Estilos (claro/oscuro, adaptable a móviles)
src/core/                  Lógica de cálculo, independiente de la interfaz
  stats.js                 Estadística: regresión, distribuciones t y F
  units.js                 Unidades y conversiones
  dataset.js               Meses, números, validación, factores por defecto
  analysis.js              Motor de análisis por empresa
  benchmark.js             Tablero y rankings entre empresas
  format.js                Formato numérico es-CO
src/io/                    CSV, Excel (.xlsx, lectura y escritura), importador, informe, exportación
src/ui/                    Gráficos SVG, vistas de resultados, tablero y controlador
src/data/demo.js           Datos de demostración (ficticios, reproducibles)
data/                      Archivos de ejemplo (CSV y Excel)
tests/                     Pruebas automáticas (node:test)
docs/METODOLOGIA.md        Fórmulas y decisiones metodológicas
docs/VALIDACION.md         Pruebas, valores de referencia y prueba integral
tools/generar_ejemplos.js  Regenera los archivos de /data
serve.js                   Servidor estático opcional
```

**Bibliotecas externas:** ninguna. Los gráficos, la lectura/escritura de Excel y la estadística están implementados en el proyecto. Para leer `.xlsx` se usa `DecompressionStream`, disponible en navegadores actuales.

## Datos de ejemplo

- `data/ejemplo_17_meses.csv` — 17 meses (estructura del estudio de referencia).
- `data/ejemplo_24_meses_con_presupuesto.csv` y `.xlsx` — 24 meses con presupuesto.
- `data/ejemplo_36_meses_base_y_seguimiento.csv` — 24 meses base + 12 de seguimiento, con un mes faltante.

Todos son **ficticios** (generados con semilla fija); no corresponden a ninguna empresa real.

## Persistencia

Los datos se guardan automáticamente en el **almacenamiento local del navegador** (`localStorage`): solo en ese equipo y ese navegador, sin servidor. **No es una base de datos empresarial centralizada.** Si se borran los datos del navegador se pierden. Use «Guardar» (todas las empresas) o «Exportar → Proyecto» para conservar una copia en archivo `.json` y «Abrir» para recuperarla.

## Limitaciones conocidas

- La línea base es lineal y de una sola variable (producción). Si el consumo depende también del clima, la mezcla de productos u otras variables, el modelo puede quedarse corto.
- Los p-values e intervalos suponen residuos independientes y con varianza constante; con autocorrelación o pocos datos pueden ser optimistas.
- La línea meta se construye seleccionando meses según su consumo: sus estadísticos son descriptivos.
- El tablero sin periodo de seguimiento evalúa los últimos 12 meses, que también construyeron la línea base: el resultado es indicativo.
- Comparar empresas con periodos evaluados distintos (por ejemplo 2023 frente a 2024) se informa, pero no se corrige.
- **Unidad del factor de emisión:** 0,4341667 está en el orden de los factores de red expresados por **MWh** (o en kg CO₂/kWh). Con «t CO₂/kWh», la huella de carbono resulta 1000 veces mayor. Verifique la unidad en el Excel y ajústela en «Empresa y unidades».
- Las oportunidades son estimaciones; un ahorro solo se considera verificado con un plan de medición y verificación revisado.
- No se leen archivos `.xls` antiguos (guardar como `.xlsx` o CSV).
- La aplicación no certifica cumplimiento de ninguna norma (ISO 50001/50006 u otras) ni sustituye una auditoría energética.
- La comparación con el Excel del estudio original está pendiente (ver `docs/VALIDACION.md`).

## Cambios respecto a la versión anterior

En la carpeta del proyecto no había una versión anterior de la aplicación ni el Excel de referencia, así que esta versión se construyó desde cero a partir de los requisitos. Cubre:

- Número de meses flexible (12, 17, 24, 36 o más), distinguiendo meses introducidos y observaciones usadas en cada cálculo.
- Importación CSV, Excel y texto pegado, con detección de columnas, unidades y separador decimal.
- Validación de duplicados, valores imposibles, incompletos, unidades incompatibles y meses faltantes, sin imputar ni reemplazar por cero.
- Presupuesto opcional en la misma tabla, analizado como serie independiente, con desviación ajustada por producción y explicación automática por mes.
- Línea base con diagnóstico estadístico completo, línea meta, indicadores base 100, CUSUM y ahorro medido con intervalo de confianza.
- Huella de carbono y huella ecológica con los factores del Excel por defecto.
- Varias empresas, tablero comparativo (% de la meta y zona) y rankings por ahorro y por factor de emisión.
- Informe técnico reproducible, Excel con fórmulas de verificación y pruebas automáticas.

## Licencia

Este proyecto está bajo la Licencia MIT (ver `LICENSE`).
