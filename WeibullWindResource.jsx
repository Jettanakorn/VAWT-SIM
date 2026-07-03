/**
 * WeibullWindResource.jsx
 * ------------------------------------------------------------------
 * Drop-in replacement for the existing "Weibull Wind Resource Analysis"
 * card in vawt-spec-app (the component built from the built index.html
 * — minified as `X9` — that currently only auto-calculates the table
 * from k, c, ref_height, hub_height, roughness_length).
 *
 * WHAT'S NEW vs. the original component
 * ------------------------------------------------------------------
 * 1. Per-row EDITING: each row's "Frequency (%)" cell becomes an
 *    editable input once the user switches to "Manual edit" mode.
 *    Hours/yr is auto-derived from the edited frequency
 *    (hours = frequency% * 8760). Power density stays physically
 *    derived from wind speed at hub height (edited frequency does not
 *    change the physics of P = 1/2 * rho * v^3).
 * 2. AUTO vs MANUAL toggle: "Auto-calculated" (default, same as
 *    before — recomputed live from k/c/heights) vs "Manual edit"
 *    (freezes the curve and lets the user type over it). Switching
 *    back to Auto discards manual overrides after a confirmation.
 * 3. Guide panel: a collapsible "What is this?" panel that explains
 *    what k, c, and the per-row edits mean in plain language, aimed
 *    at someone who has site data but not a Weibull fit.
 * 4. Same external contract as the original: props are
 *    { form, onChange }, and it still calls onChange({ weibull_data })
 *    with the same array shape:
 *      { wind_speed, frequency, hours_per_year, power_density }
 *    so PDF export, save-to-Supabase, and the rest of the app keep
 *    working unmodified.
 *
 * INTEGRATION
 * ------------------------------------------------------------------
 * The built index.html in the repo is a minified Vite bundle, not
 * hand-editable source — there's no un-minified copy of this
 * component checked into the repo. To use this file:
 *   1. Find the original (un-minified) project source — wherever
 *      vawt-spec-app.html / index.html was generated from (e.g. the
 *      builder tool / IDE project this was exported from).
 *   2. Replace that project's Weibull table component with this file
 *      (or merge the logic in) — the props/shape match exactly, so it
 *      should be a straight swap for the component currently rendered
 *      as <WeibullTable form={form} onChange={onChange} /> inside the
 *      "Wind Resource" tab.
 *   3. Rebuild (`npm run build` / your usual Vite build step) to
 *      regenerate index.html.
 *
 * Depends on: React (hooks), Tailwind utility classes, and the same
 * shadcn/ui primitives already used elsewhere in the app (Card,
 * Badge, Input, Label). Adjust imports to match your project paths.
 * ------------------------------------------------------------------
 */

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ---- Same math as the original component -------------------------------

function weibullPdf(v, k, c) {
  if (v <= 0 || k <= 0 || c <= 0) return 0;
  return (k / c) * Math.pow(v / c, k - 1) * Math.exp(-Math.pow(v / c, k));
}

// Log-law wind shear extrapolation to hub height
function shearSpeed(vRef, refHeight, hubHeight, z0) {
  if (refHeight <= 0 || hubHeight <= 0 || z0 <= 0) return vRef;
  return vRef * (Math.log(hubHeight / z0) / Math.log(refHeight / z0));
}

function buildAutoTable(k, c, refHeight, hubHeight, z0) {
  const rows = [];
  for (let v = 0; v <= 30; v += 1) {
    const pdf = weibullPdf(v, k, c);
    const frequency = parseFloat((pdf * 100).toFixed(3));
    const hoursPerYear = parseFloat((pdf * 8760).toFixed(1));
    const vHub = shearSpeed(v, refHeight, hubHeight, z0);
    const powerDensity = parseFloat(
      ((0.5 * 1.225 * Math.pow(vHub, 3)) / 1000).toFixed(4)
    );
    rows.push({
      wind_speed: v,
      frequency,
      hours_per_year: hoursPerYear,
      power_density: powerDensity,
    });
  }
  return rows;
}

// ---- Guide content -------------------------------------------------------

const GUIDE_ITEMS = [
  {
    term: "Shape k",
    body:
      "Controls how spread out the wind speeds are. Lower k (~1.5–2) means gustier, more variable wind. Higher k (~2.5–3) means steadier wind clustered near the mean.",
  },
  {
    term: "Scale c",
    body:
      "Roughly the site's characteristic wind speed in m/s — close to, but not exactly, the mean wind speed. Raising c shifts the whole curve toward higher speeds.",
  },
  {
    term: "Reference / hub height",
    body:
      "Reference height is where your wind speed data was measured (e.g. a met mast or airport station). Hub height is where the rotor will actually sit. The table extrapolates between them using the log wind-shear law.",
  },
  {
    term: "Manual edit mode",
    body:
      "If you have your own measured or bought wind resource data (e.g. from a met mast, MERRA-2, or a wind atlas) instead of a clean Weibull fit, switch to Manual edit and type the frequency (%) for each speed bin directly. Hours/yr updates automatically; power density stays computed from the wind speed itself.",
  },
  {
    term: "Auto-calculated mode",
    body:
      "Recomputes the whole table live from k, c, and the height settings above using the standard two-parameter Weibull distribution. Switching back to Auto discards any manual edits.",
  },
];

function GuidePanel({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="rounded-md border border-indigo-200 bg-indigo-50/60 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-indigo-900">
          Guide — reading &amp; editing this table
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-indigo-400 hover:text-indigo-700 text-sm leading-none"
        >
          ×
        </button>
      </div>
      <dl className="space-y-2">
        {GUIDE_ITEMS.map((item) => (
          <div key={item.term}>
            <dt className="text-[11px] font-semibold text-indigo-900">
              {item.term}
            </dt>
            <dd className="text-[11px] text-indigo-800/90 leading-relaxed">
              {item.body}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---- Main component -------------------------------------------------------

export default function WeibullWindResource({ form, onChange }) {
  const [mode, setMode] = useState("auto"); // "auto" | "manual"
  const [manualRows, setManualRows] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const k = parseFloat(form.weibull_k) || 2;
  const c = parseFloat(form.weibull_c) || 6;
  const refHeight = parseFloat(form.ref_height) || 10;
  const hubHeight = parseFloat(form.hub_height) || 6;
  const z0 = parseFloat(form.roughness_length) || 0.03;

  const autoRows = useMemo(
    () => buildAutoTable(k, c, refHeight, hubHeight, z0),
    [k, c, refHeight, hubHeight, z0]
  );

  // In auto mode, recompute + push up whenever inputs change.
  useEffect(() => {
    if (mode === "auto") {
      onChange({ weibull_data: autoRows });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, autoRows]);

  // Rows actually displayed / edited right now.
  const rows = mode === "manual" ? manualRows ?? autoRows : autoRows;

  const handleSwitchToManual = () => {
    setManualRows((prev) => prev ?? autoRows.map((r) => ({ ...r })));
    setMode("manual");
  };

  const handleSwitchToAuto = () => {
    if (
      manualRows &&
      window.confirm(
        "Switch back to auto-calculated? Your manual edits to this table will be discarded."
      )
    ) {
      setManualRows(null);
      setMode("auto");
    } else if (!manualRows) {
      setMode("auto");
    }
  };

  const handleFrequencyEdit = (windSpeed, rawValue) => {
    const freq = rawValue === "" ? 0 : parseFloat(rawValue);
    if (Number.isNaN(freq)) return;
    setManualRows((prev) => {
      const base = prev ?? autoRows.map((r) => ({ ...r }));
      const next = base.map((row) =>
        row.wind_speed === windSpeed
          ? {
              ...row,
              frequency: freq,
              hours_per_year: parseFloat(((freq / 100) * 8760).toFixed(1)),
            }
          : row
      );
      onChange({ weibull_data: next });
      return next;
    });
  };

  const meanWindAtHub =
    rows.length > 0
      ? rows.reduce(
          (sum, r) => sum + r.wind_speed * (r.hours_per_year / 8760),
          0
        ) *
        (shearSpeed(1, refHeight, hubHeight, z0) || 1)
      : 0;

  const meanPowerDensity = rows.reduce(
    (sum, r) => sum + r.power_density * (r.hours_per_year / 8760),
    0
  );
  const annualEnergyPerM2 = meanPowerDensity * 8760;
  const maxFrequency = Math.max(...rows.map((r) => r.frequency), 0.0001);

  return (
    <Card className="rounded-lg border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-medium">
            Weibull Wind Resource Analysis
          </CardTitle>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setGuideOpen((v) => !v)}
              className="text-[11px] px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
            >
              {guideOpen ? "Hide guide" : "What is this? / Guide"}
            </button>
            <div className="flex rounded-md border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={handleSwitchToAuto}
                className={`text-[11px] px-2.5 py-1 ${
                  mode === "auto"
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                Auto-calculated
              </button>
              <button
                type="button"
                onClick={handleSwitchToManual}
                className={`text-[11px] px-2.5 py-1 border-l border-slate-200 ${
                  mode === "manual"
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                Manual edit
              </button>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {mode === "auto"
            ? "Two-parameter Weibull distribution with log-law wind shear extrapolation to hub height."
            : "Manual edit mode — type a frequency (%) per row to override the Weibull fit with your own data."}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <GuidePanel open={guideOpen} onClose={() => setGuideOpen(false)} />

        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Shape k", key: "weibull_k", hint: "dimensionless", placeholder: "2.0" },
            { label: "Scale c", key: "weibull_c", hint: "m/s", placeholder: "6.0" },
            { label: "Reference height", key: "ref_height", hint: "m", placeholder: "10" },
            { label: "Hub height", key: "hub_height", hint: "m", placeholder: "6" },
            { label: "Roughness z₀", key: "roughness_length", hint: "m", placeholder: "0.03" },
          ].map(({ label, key, hint, placeholder }) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {label} <span className="font-mono text-[10px]">{hint}</span>
              </Label>
              <Input
                type="number"
                step="any"
                placeholder={placeholder}
                value={form[key]}
                disabled={mode === "manual"}
                onChange={(e) => onChange({ [key]: e.target.value })}
                className="h-8 text-sm font-mono disabled:opacity-50"
              />
            </div>
          ))}
        </div>
        {mode === "manual" && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            k / c / height inputs are locked while manual edits are active — switch back to
            Auto-calculated to change them (this discards manual edits).
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md bg-muted/40 border border-border p-3">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
              Mean wind speed @ hub
            </div>
            <div className="text-lg font-medium font-mono">
              {meanWindAtHub.toFixed(2)}{" "}
              <span className="text-sm font-normal text-muted-foreground">m/s</span>
            </div>
          </div>
          <div className="rounded-md bg-muted/40 border border-border p-3">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
              Mean power density
            </div>
            <div className="text-lg font-medium font-mono">
              {meanPowerDensity.toFixed(2)}{" "}
              <span className="text-sm font-normal text-muted-foreground">kW/m²</span>
            </div>
          </div>
          <div className="rounded-md bg-muted/40 border border-border p-3">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
              Annual energy (wind resource)
            </div>
            <div className="text-lg font-medium font-mono">
              {annualEnergyPerM2.toFixed(1)}{" "}
              <span className="text-sm font-normal text-muted-foreground">kWh/m²/yr</span>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-border overflow-hidden">
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                    v (m/s)
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                    Frequency (%){mode === "manual" && " ✎"}
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                    Hours/yr
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                    Power density (kW/m²)
                  </th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">
                    Distribution
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const barWidth = (row.frequency / maxFrequency) * 100;
                  return (
                    <tr key={row.wind_speed} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      <td className="px-3 py-1.5 font-mono font-medium">{row.wind_speed}</td>
                      <td className="px-3 py-1 text-right">
                        {mode === "manual" ? (
                          <input
                            type="number"
                            step="0.001"
                            value={row.frequency}
                            onChange={(e) => handleFrequencyEdit(row.wind_speed, e.target.value)}
                            className="w-20 text-right font-mono text-xs border border-indigo-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        ) : (
                          <span className="font-mono">{row.frequency.toFixed(3)}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-right">
                        {row.hours_per_year.toFixed(1)}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-right">
                        {row.power_density.toFixed(4)}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              mode === "manual" ? "bg-amber-500/70" : "bg-blue-500/70"
                            }`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Wind shear: log law — V(z) = V_ref · ln(z/z₀) / ln(z_ref/z₀). Power density: ½ρV³ at
          hub height (ρ = 1.225 kg/m³).
          {mode === "manual" &&
            " Frequencies are user-entered in this mode; hours/yr = frequency% × 8760."}
        </p>
      </CardContent>
    </Card>
  );
}
