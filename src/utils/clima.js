// =============================================================================
// src/utils/clima.js - Convierte la respuesta de Open-Meteo en filas por día
// -----------------------------------------------------------------------------
// Función pura (sin red) para poder probarla con una respuesta de ejemplo.
// =============================================================================

const maxONull = (valores) => {
  const v = valores.filter((x) => typeof x === "number");
  return v.length ? Math.max(...v) : null;
};

// json: respuesta de https://api.open-meteo.com/v1/forecast con daily + hourly
// ventanas: { matutino: [8, 14], vespertino: [14, 20] }  (horas locales, [inicio, fin))
// hoy: "YYYY-MM-DD" local; los días anteriores se marcan como observados
export function parsearOpenMeteo(json, ventanas, hoy) {
  const d = json?.daily;
  if (!d?.time) return [];
  const horas = json?.hourly?.time || [];
  const probHora = json?.hourly?.precipitation_probability || [];

  return d.time.map((fecha, i) => {
    const delDia = (ini, fin) => {
      const vals = [];
      horas.forEach((t, j) => {
        if (!t.startsWith(fecha)) return;
        const h = Number(t.slice(11, 13));
        if (h >= ini && h < fin) vals.push(probHora[j]);
      });
      return maxONull(vals);
    };
    const n = (x) => (typeof x === "number" ? x : null);
    return {
      fecha,
      probLluvia: n(d.precipitation_probability_max?.[i]),
      probMatutino: delDia(...ventanas.matutino),
      probVespertino: delDia(...ventanas.vespertino),
      precipitacionMm: n(d.precipitation_sum?.[i]),
      tempMax: n(d.temperature_2m_max?.[i]),
      vientoMax: n(d.wind_speed_10m_max?.[i]),
      observado: fecha < hoy,
    };
  });
}
