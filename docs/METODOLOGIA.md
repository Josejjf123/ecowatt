# Metodología y fórmulas

Este documento describe exactamente qué calcula la aplicación, para que un tercero pueda reproducir los resultados a partir de los datos de entrada. La implementación está en `src/core/` (sin dependencias externas).

Notación: E = consumo energético real del mes, P = producción real del mes, Ê = consumo estimado por la línea base, E_meta = consumo según la línea meta, Ep / Pp = consumo / producción presupuestados, n = número de observaciones usadas.

## 1. Datos y validación (`dataset.js`)

- Un registro mensual es **válido** si tiene mes reconocible, consumo y producción numéricos, no negativos y en unidades convertibles a las del proyecto.
- **Nunca se reemplazan datos ausentes por cero ni se imputan valores.** Un mes incompleto se informa y se excluye.
- **Meses duplicados** bloquean el análisis (no se puede decidir cuál usar).
- Consumo 0 con producción > 0 se trata como error de medición. Producción 0 con consumo > 0 se usa en la regresión, pero el índice de consumo de ese mes no se calcula.
- Valores fuera de Q1 − 3·RIC / Q3 + 3·RIC se señalan como extremos, **sin eliminarlos**.
- El usuario puede excluir un mes manualmente; la exclusión y su motivo quedan en el informe.
- Se informa por separado: meses introducidos, observaciones válidas, excluidas y las usadas en cada cálculo.
- Unidades: kWh, MWh, GWh, MJ, GJ, MMBTU (energía); L, hL, m³, gal, kg, t, unidades (producción). Solo se convierten unidades de la misma naturaleza; m³ de gas → kWh no se convierte sin poder calorífico.

## 2. Estadística descriptiva e índice de consumo

- Media, desviación estándar **muestral** s = √(Σ(x − x̄)² / (n − 1)) (DESVEST.M de Excel), CV = s / x̄ × 100, mínimo, máximo, mediana.
- Índice de consumo mensual: IC = E / P (solo si P > 0), en unidades E/P (p. ej. kWh/L).
- IC del periodo: **ponderado** ΣE / ΣP. También se informa el promedio simple de los IC mensuales, que da el mismo peso a meses de baja y alta producción.
- Variación relevante del IC: |IC − IC ponderado| > 10 % o cambio frente al mes anterior > 10 % (umbral configurable en el código).

## 3. Línea base (regresión lineal simple por mínimos cuadrados)

Con los meses del **periodo base**:

- Ê = m·P + E0, con m = Sxy / Sxx y E0 = Ē − m·P̄; Sxx = Σ(P − P̄)², Sxy = Σ(P − P̄)(E − Ē).
- R² = 1 − SSE/SST; R² ajustado = 1 − (1 − R²)(n − 1)/(n − 2).
- Error típico s = √(SSE / (n − 2)) (ERROR.TIPICO.XY); CV(RMSE) = s / Ē × 100; MAPE = promedio |e/E| × 100.
- EE(m) = s/√Sxx; EE(E0) = s·√(1/n + P̄²/Sxx); t = coeficiente / EE; p-value bilateral con t de Student y n − 2 gl (DISTR.T.2C). F = SSR / (SSE/(n − 2)).
- Intervalo de confianza de coeficientes: b ± t(1 − α/2; n − 2)·EE. Intervalo de predicción de un mes: Ê ± t·s·√(1 + 1/n + (P − P̄)²/Sxx).
- Diagnóstico: residuo eᵢ = Eᵢ − Êᵢ; apalancamiento hᵢᵢ = 1/n + (Pᵢ − P̄)²/Sxx; residuo estandarizado rᵢ = eᵢ/(s√(1 − hᵢᵢ)); distancia de Cook; Durbin-Watson. **Ninguna observación se elimina automáticamente.**
- Mínimo de observaciones: 6 en el periodo base (configurable en el código). Con menos, no se calcula y se explica por qué.
- Calidad: se marca si la pendiente no es positiva, si no es significativa (p ≥ 0,05), si R² < 0,75 (umbral de referencia, no normativo), si hay < 12 meses o si la producción varía poco.
- **Significancia ≠ calidad predictiva**: un p-value bajo indica relación estadística, no que el modelo prediga bien cada mes ni fuera del rango observado.
- E0 (consumo no asociado a la producción) solo se interpreta si es positivo y significativo; se advierte cuando P = 0 está lejos del rango observado (extrapolación).

## 4. Línea meta

1. Se seleccionan los meses del periodo base con **E < Ê** (por debajo de la línea base).
2. Se ajusta una nueva regresión E_meta = m′·P + E0′ con esos meses (mínimo 4 puntos).
3. Su R² es **descriptivo**: como los puntos se eligieron según su consumo, no se reportan p-values inferenciales.
4. Se advierte si la pendiente no es positiva o si la línea meta cruza la línea base dentro del rango observado.

La línea meta es una referencia de desempeño observado (los mejores meses), no una garantía de ahorro.

## 5. Indicadores base 100 y CUSUM

- Convención por defecto: **IEB100 = Ê(P)/E × 100** y **IEB100_meta = E_meta(P)/E × 100**: **≥ 100 es favorable** (consumo real igual o menor que la referencia).
- Convención alternativa disponible en el código (`base100Convention = 'real_sobre_ref'`): IDEn = E/Ê × 100, ≤ 100 favorable.
- La referencia se evalúa con la producción real del mes, por lo que el indicador ya está ajustado por el nivel de producción.
- CUSUM_t = Σ_{i ≤ t}(Eᵢ − Êᵢ) en orden cronológico. En el periodo base termina en ≈ 0 por construcción.

## 6. Seguimiento (ahorro medido)

Meses marcados como «seguimiento» (posteriores a una intervención). La línea base se ajusta solo con el periodo base.

- Ahorro = Σ(Ê(Pᵢ) − Eᵢ); ahorro % = ahorro / ΣÊ × 100.
- EE del total = s·√(m + m²/n + (Σ(Pᵢ − P̄))²/Sxx), con m meses de seguimiento (supone residuos independientes); IC = ahorro ± t·EE.
- Es un ahorro **calculado con mediciones**; solo se considera «verificado» con un plan de medición y verificación (M&V) acordado y revisado.

## 7. Presupuesto (serie independiente, opcional)

- ΔE = E − Ep; ΔE% = ΔE/Ep × 100 (solo si Ep > 0). ΔP y ΔP% análogos. IC_p = Ep/Pp (solo si Pp > 0).
- Con línea base válida: presupuesto ajustado a la producción real = Ep + m·(P − Pp); desviación ajustada = E − presupuesto ajustado.
- Descomposición exacta: E − Ep = m(P − Pp) [efecto producción] + (E − Ê(P)) [efecto desempeño] + (Ê(Pp) − Ep) [diferencia del presupuesto frente al histórico].
- Sin línea base válida: ajustado = IC_p·P; E − Ep = IC_p(P − Pp) + (IC − IC_p)·P.
- Clasificación: |desviación| ≤ 3 % → «en línea»; menor consumo → favorable; mayor → desfavorable. Se compara la conclusión bruta con la ajustada y se señalan los meses donde son opuestas.
- Si los meses presupuestados también se usaron para ajustar la línea base, el efecto desempeño total es ≈ 0 por construcción; la aplicación lo advierte.

## 8. Huella de carbono y huella ecológica

- Huella de carbono [t CO₂] = E × factor de emisión (convertido a la unidad de energía del proyecto).
- Huella ecológica [ha] = huella de carbono × factor de huella [ha/t CO₂].
- Valores por defecto (Excel de referencia): factor de emisión **0,4341667 t CO₂/kWh**; factor de huella **0,000383 ha/t CO₂**. Ambos son editables por empresa.
- Intensidad = huella / producción. Huella evitada = ahorro medido × factor de emisión.

## 9. Comparación entre empresas (tablero y rankings)

- **Periodo evaluado** de cada empresa: sus meses de seguimiento (ahorro **medido**) o, si no tiene, sus últimos 12 meses (resultado **indicativo**, porque esos meses también construyeron la línea base).
- **% de la meta consumido** = ΣE / ΣE_meta(P_real) × 100.
- **Zona**: verde ≤ 100 % (cumple la meta); amarilla entre la meta y el nivel de la línea base (ΣÊ / ΣE_meta × 100); roja por encima de la línea base.
- Con presupuesto: % del presupuesto consumido = ΣE/ΣEp × 100 (verde ≤ 100 %, amarilla ≤ 105 %, roja > 105 %).
- **Ahorro %** = (ΣÊ − ΣE)/ΣÊ × 100. No tiene unidades, por eso es comparable entre empresas con productos distintos.
- **Ranking por ahorro**: primero las empresas con ahorro medido (de mayor a menor), después las indicativas; las que no tienen línea base no se ranquean y se explica por qué.
- **Ranking por factor de emisión**: de menor a mayor factor normalizado a t CO₂/kWh; empate → menores emisiones en el periodo.

## 10. Revisión crítica frente a prácticas habituales en hojas de cálculo

Puntos que conviene verificar en el Excel de referencia, porque cambian los resultados:

1. **Desviación estándar**: muestral (n − 1) frente a poblacional (n). La aplicación usa la muestral e informa también la poblacional en el código.
2. **IC promedio**: promedio simple de IC mensuales frente a ΣE/ΣP. La aplicación destaca el ponderado.
3. **Selección de la línea meta**: estrictamente E < Ê. Si el Excel usó «≤» o seleccionó por otro criterio (por ejemplo, residuos menores que cierto valor), el número de puntos puede variar.
4. **p-value de la línea meta**: no es válido como inferencia (los puntos se eligieron según la variable dependiente).
5. **Convención base 100**: Ê/E × 100 frente a E/Ê × 100; ambas están implementadas.
6. **R² como único criterio**: se complementa con significancia, error típico, CV(RMSE) y residuos.
7. **Eliminación de atípicos**: la aplicación no elimina puntos automáticamente; solo el usuario puede excluir, con motivo registrado.
8. **Unidad del factor de emisión**: el valor por defecto (0,4341667) es del orden de los factores de red expresados en t CO₂/**MWh** (= kg CO₂/kWh). Si en el Excel la unidad real es t CO₂/MWh, la huella de carbono calculada con «t CO₂/kWh» resulta 1000 veces mayor. La unidad se puede cambiar en «Empresa y unidades».
