# EcoWatt — Gestión y Desempeño Energético

> **EcoFest Barranquilla 2026 · EcoHackathon**  
> **Participantes:**  
> - Jose Mauricio Lopez Robles  
> - Daniel Granados  

Plataforma web de **gestión y caracterización energética industrial** que transforma datos mensuales de consumo y producción en información predictiva, cuantitativa y accionable, alineada con los estándares internacionales **ISO 50001 e ISO 50006**.

🌐 **Despliegue en vivo en GitHub Pages:** [https://josejjf123.github.io/ecowatt/](https://josejjf123.github.io/ecowatt/)

---

## 🎯 Propósito del Proyecto

En el entorno industrial moderno, las organizaciones enfrentan el desafío de optimizar su consumo de recursos y mitigar su huella de carbono. Sin embargo, evaluar el consumo bruto sin normalizarlo frente a la producción real genera diagnósticos erróneos.

**EcoWatt** resuelve esta problemática implementando un motor analítico riguroso y transparente que permite:
1. Modelar la **Línea Base Energética (LB)** mediante regresión lineal por mínimos cuadrados ($E = m \cdot P + E_0$), validando estadísticamente $R^2$, el $p$-valor de la pendiente (test $t$), error estándar ($S_{yx}$) e independizando el consumo no asociado a la producción (carga base fija $E_0$).
2. Determinar la **Línea Meta (LM)** identificando los meses de mayor eficiencia histórica para cuantificar el potencial real de ahorro.
3. Monitorear el desempeño en tiempo real con **Indicadores en Base 100** y control estadístico **CUSUM** (Sumas Acumuladas) para detectar tempranamente desviaciones anómalas o ahorros persistentes.
4. Evaluar el cumplimiento con **Presupuesto Flexible**, ajustando el consumo presupuestado según el nivel real de producción.
5. Calcular la **Huella de Carbono** (t CO₂e) y la **Huella Ecológica** (ha) asociadas al consumo y los ahorros obtenidos.
6. Generar **Informes Técnicos Autónomos (HTML/PDF)** y exportar a **Excel (.xlsx)** con fórmulas nativas de auditoría.

---

## 🚀 Características Principales

* **Cero dependencias pesadas en el cliente:** Diseñado en JavaScript moderno y CSS puro; carga instantánea y funcionamiento offline garantizado.
* **Motor de Unidades Consistente:** Conversión automática entre magnitudes de energía (`kWh`, `MWh`, `GJ`, etc.), volúmenes de gas (`m³`, `kpc`), vapor, combustibles y métricas de producción (`L`, `hL`, `t`, `kg`, cajas, unidades).
* **Importador Universal:** Compatible con archivos Excel (`.xlsx`, `.xlsm`), archivos `.csv` y pegado tabular directo desde el portapapeles.
* **Casos de Demostración Industriales:** Incluye escenarios de prueba reproducibles (17, 24 y 36 meses con periodos de línea base y seguimiento).
* **Diseño Profesional y Accesible:** Interfaz adaptable con soporte para modo claro y modo oscuro, gráficos vectoriales SVG interactivos y tooltips contextuales.

---

## 📁 Estructura del Proyecto

```text
├── index.html                   # Punto de entrada de la aplicación web
├── assets/
│   └── css/
│       └── styles.css           # Sistema de diseño, temas claro/oscuro y componentes
├── src/
│   ├── core/                    # Motor matemático y estadístico
│   │   ├── stats.js             # Mínimos cuadrados, test t, residuos, Durbin-Watson
│   │   ├── units.js             # Dimensiones físicas y factores de conversión
│   │   ├── format.js            # Formateo numérico y de fechas
│   │   ├── dataset.js           # Esquema de datos y validaciones
│   │   └── analysis.js          # Motor central de caracterización energética
│   ├── data/
│   │   └── demo.js              # Datos de demostración reproducibles
│   ├── io/                      # Importación y exportación de archivos
│   │   ├── csv.js               # Parser y serializador de CSV
│   │   ├── xlsx.js              # Lector y generador de libros Excel
│   │   ├── importer.js          # Asistente de importación con mapeo de columnas
│   │   ├── exporter.js          # Exportador de resultados y fórmulas
│   │   └── report.js            # Generador de informes técnicos en HTML/PDF
│   └── ui/
│       ├── charts.js            # Motor de gráficos SVG vectoriales
│       ├── views.js             # Generador de vistas analíticas y KPIs
│       └── app.js               # Controlador principal y gestión de estado
└── .github/
    └── workflows/
        └── deploy.yml           # Despliegue continuo automático a GitHub Pages
```

---

## 🛠️ Ejecución Local

Dado que la aplicación está construida sobre estándares web puros, no requiere pasos de compilación complejos:

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/Josejjf123/ecowatt.git
   cd ecowatt
   ```
2. Abrir directamente `index.html` en cualquier navegador web moderno, o servirlo con un servidor local estático:
   ```bash
   node serve.js 8080
   # o en Python:
   python -m http.server 8080
   ```

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.
