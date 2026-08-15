/**
 * Shared wearable health simulation + condition detection engine.
 *
 * This is the single source of truth for the caretaker web app and the
 * algorithm it mirrors on the elder device. See HEALTH_MONITORING.md for
 * the full specification of thresholds and debounce behaviour.
 */

export type VitalName =
  | 'heartRate'
  | 'spo2'
  | 'temperature'
  | 'respiratoryRate'
  | 'systolic'
  | 'diastolic'
  | 'glucose';

export type Vitals = Record<VitalName, number>;

export type HealthSeverity = 'OK' | 'WARNING' | 'CRITICAL';

export type Detection = {
  id: string;
  label: string;
  severity: Exclude<HealthSeverity, 'OK'>;
  vital: VitalName;
  value: number;
};

export type Scenario = {
  cmd: string;
  label: string;
  group: 'Heart' | 'Oxygen' | 'Temperature' | 'Pressure' | 'Respiratory' | 'Glucose';
  expectedSeverity: HealthSeverity;
  target: Partial<Vitals>;
  variance?: number; // heart-rate variability target (>0 drives arrhythmia rules)
  desc: string;
};

export const NORMAL_VITALS: Vitals = {
  heartRate: 72,
  spo2: 98,
  temperature: 36.7,
  respiratoryRate: 16,
  systolic: 120,
  diastolic: 78,
  glucose: 110,
};

export const SCENARIOS: Scenario[] = [
  { cmd: 'HRMI',          label: 'MI (Heart Attack)',   group: 'Heart',       expectedSeverity: 'CRITICAL', variance: 6,  target: { heartRate: 30, spo2: 92, systolic: 85, diastolic: 55 },       desc: 'Severe bradycardia + hypotension' },
  { cmd: 'HRAFIB',        label: 'Atrial Fibrillation', group: 'Heart',       expectedSeverity: 'CRITICAL', variance: 34, target: { heartRate: 135 },                                              desc: 'Fast + highly irregular rhythm' },
  { cmd: 'HRTACHY',       label: 'Tachycardia',         group: 'Heart',       expectedSeverity: 'CRITICAL', variance: 8,  target: { heartRate: 165 },                                              desc: 'Heart rate > 160 bpm' },
  { cmd: 'HRBRADY',       label: 'Bradycardia',         group: 'Heart',       expectedSeverity: 'CRITICAL', variance: 4,  target: { heartRate: 42 },                                               desc: 'Heart rate < 40 bpm' },
  { cmd: 'HRARRHY',       label: 'Arrhythmia',          group: 'Heart',       expectedSeverity: 'WARNING',  variance: 24, target: { heartRate: 95 },                                               desc: 'Irregular rhythm (HRV > 18)' },
  { cmd: 'HYPOXIA',       label: 'Hypoxia',             group: 'Oxygen',      expectedSeverity: 'CRITICAL', target: { spo2: 87 },                                                             desc: 'O₂ saturation < 88%' },
  { cmd: 'FEVER',         label: 'High Fever',          group: 'Temperature', expectedSeverity: 'CRITICAL', target: { temperature: 39.5 },                                                     desc: 'Temperature ≥ 39.5 °C' },
  { cmd: 'HYPOTHERMIA',   label: 'Hypothermia',         group: 'Temperature', expectedSeverity: 'CRITICAL', target: { temperature: 33.0 },                                                     desc: 'Temperature ≤ 33.5 °C' },
  { cmd: 'BPCRISIS',      label: 'BP Crisis',           group: 'Pressure',    expectedSeverity: 'CRITICAL', target: { systolic: 188, diastolic: 128 },                                         desc: '≥ 180/120 mmHg' },
  { cmd: 'HYPOTENSION',   label: 'Hypotension',         group: 'Pressure',    expectedSeverity: 'CRITICAL', target: { systolic: 82, diastolic: 50 },                                          desc: '< 90/60 mmHg' },
  { cmd: 'TACHYPNEA',     label: 'Tachypnea',           group: 'Respiratory', expectedSeverity: 'CRITICAL', target: { respiratoryRate: 32 },                                                    desc: 'Respiratory rate ≥ 32/min' },
  { cmd: 'BRADYPNEA',     label: 'Bradypnea',           group: 'Respiratory', expectedSeverity: 'CRITICAL', target: { respiratoryRate: 5 },                                                     desc: 'Respiratory rate ≤ 6/min' },
  { cmd: 'HYPERGLYCEMIA', label: 'Hyperglycemia',       group: 'Glucose',     expectedSeverity: 'CRITICAL', target: { glucose: 300 },                                                          desc: 'Glucose ≥ 300 mg/dL' },
  { cmd: 'HYPOGLYCEMIA',  label: 'Hypoglycemia',        group: 'Glucose',     expectedSeverity: 'CRITICAL', target: { glucose: 48 },                                                           desc: 'Glucose < 54 mg/dL' },
  { cmd: 'HRNORMAL',      label: 'Reset to Normal',     group: 'Heart',       expectedSeverity: 'OK',       target: NORMAL_VITALS,                                                         desc: 'All vitals back to normal' },
];

export function scenarioByCmd(cmd: string): Scenario | undefined {
  return SCENARIOS.find(s => s.cmd === cmd);
}

// ── Detection engine ───────────────────────────────────────────────────

const DEBOUNCE_HARD     = 1;  // extreme value → confirm on first sample
const DEBOUNCE_SUSTAINED = 2; // abnormal band → require 2 consecutive samples

type Rule = {
  id: string;
  label: string;
  vital: VitalName;
  severity: Exclude<HealthSeverity, 'OK'>;
  debounce: number;
  test: (v: Vitals, hrv: number) => boolean;
};

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mu) * (b - mu), 0) / xs.length);
}

const RULES: Rule[] = [
  { id: 'HYPOXIA',       label: 'Hypoxia',              vital: 'spo2',           severity: 'CRITICAL', debounce: DEBOUNCE_HARD,      test: (v) => v.spo2 < 88 },
  { id: 'HYPOXIA',       label: 'Hypoxia',              vital: 'spo2',           severity: 'WARNING',  debounce: DEBOUNCE_SUSTAINED, test: (v) => v.spo2 < 94 },
  { id: 'FEBRILE',       label: 'Fever',                vital: 'temperature',    severity: 'CRITICAL', debounce: DEBOUNCE_HARD,      test: (v) => v.temperature >= 39.5 },
  { id: 'FEBRILE',       label: 'Fever',                vital: 'temperature',    severity: 'WARNING',  debounce: DEBOUNCE_SUSTAINED, test: (v) => v.temperature >= 38.0 },
  { id: 'HYPOTHERMIA',   label: 'Hypothermia',          vital: 'temperature',    severity: 'CRITICAL', debounce: DEBOUNCE_HARD,      test: (v) => v.temperature <= 33.5 },
  { id: 'HYPOTHERMIA',   label: 'Hypothermia',          vital: 'temperature',    severity: 'WARNING',  debounce: DEBOUNCE_SUSTAINED, test: (v) => v.temperature <= 35.0 },
  { id: 'BPCRISIS',      label: 'Hypertensive crisis',  vital: 'systolic',       severity: 'CRITICAL', debounce: DEBOUNCE_HARD,      test: (v) => v.systolic >= 200 || v.diastolic >= 130 },
  { id: 'BPCRISIS',      label: 'Hypertensive crisis',  vital: 'systolic',       severity: 'CRITICAL', debounce: DEBOUNCE_SUSTAINED, test: (v) => v.systolic >= 180 || v.diastolic >= 120 },
  { id: 'BPELEVATED',    label: 'High blood pressure',  vital: 'systolic',       severity: 'WARNING',  debounce: DEBOUNCE_SUSTAINED, test: (v) => v.systolic >= 160 || v.diastolic >= 100 },
  { id: 'HYPOTENSION',   label: 'Hypotension',          vital: 'systolic',       severity: 'CRITICAL', debounce: DEBOUNCE_HARD,      test: (v) => v.systolic < 80 || v.diastolic < 50 },
  { id: 'HYPOTENSION',   label: 'Hypotension',          vital: 'systolic',       severity: 'WARNING',  debounce: DEBOUNCE_SUSTAINED, test: (v) => v.systolic < 90 },
  { id: 'TACHYPNEA',     label: 'Tachypnea',            vital: 'respiratoryRate', severity: 'CRITICAL', debounce: DEBOUNCE_HARD,      test: (v) => v.respiratoryRate >= 32 },
  { id: 'TACHYPNEA',     label: 'Tachypnea',            vital: 'respiratoryRate', severity: 'WARNING',  debounce: DEBOUNCE_SUSTAINED, test: (v) => v.respiratoryRate >= 24 },
  { id: 'BRADYPNEA',     label: 'Bradypnea',            vital: 'respiratoryRate', severity: 'CRITICAL', debounce: DEBOUNCE_HARD,      test: (v) => v.respiratoryRate <= 6 },
  { id: 'BRADYPNEA',     label: 'Bradypnea',            vital: 'respiratoryRate', severity: 'WARNING',  debounce: DEBOUNCE_SUSTAINED, test: (v) => v.respiratoryRate <= 10 },
  { id: 'HYPERGLYCEMIA', label: 'Hyperglycemia',        vital: 'glucose',        severity: 'CRITICAL', debounce: DEBOUNCE_HARD,      test: (v) => v.glucose >= 300 },
  { id: 'HYPERGLYCEMIA', label: 'Hyperglycemia',        vital: 'glucose',        severity: 'WARNING',  debounce: DEBOUNCE_SUSTAINED, test: (v) => v.glucose >= 180 },
  { id: 'HYPOGLYCEMIA',  label: 'Hypoglycemia',         vital: 'glucose',        severity: 'CRITICAL', debounce: DEBOUNCE_HARD,      test: (v) => v.glucose < 54 },
  { id: 'HYPOGLYCEMIA',  label: 'Hypoglycemia',         vital: 'glucose',        severity: 'WARNING',  debounce: DEBOUNCE_SUSTAINED, test: (v) => v.glucose < 70 },
  { id: 'MI',            label: 'Possible myocardial infarction', vital: 'heartRate', severity: 'CRITICAL', debounce: DEBOUNCE_HARD,     test: (v) => v.heartRate <= 28 || (v.heartRate <= 40 && v.systolic < 95) },
  { id: 'MI',            label: 'Possible myocardial infarction', vital: 'heartRate', severity: 'CRITICAL', debounce: DEBOUNCE_SUSTAINED, test: (v) => v.heartRate <= 40 && v.systolic < 95 },
  { id: 'AFIB',          label: 'Atrial fibrillation',  vital: 'heartRate',      severity: 'CRITICAL', debounce: DEBOUNCE_SUSTAINED, test: (_v, hrv) => _v.heartRate >= 110 && hrv > 25 },
  { id: 'TACHYCARDIA',   label: 'Tachycardia',          vital: 'heartRate',      severity: 'CRITICAL', debounce: DEBOUNCE_HARD,      test: (v) => v.heartRate >= 160 },
  { id: 'TACHYCARDIA',   label: 'Tachycardia',          vital: 'heartRate',      severity: 'WARNING',  debounce: DEBOUNCE_SUSTAINED, test: (v) => v.heartRate >= 120 },
  { id: 'BRADYCARDIA',   label: 'Bradycardia',          vital: 'heartRate',      severity: 'CRITICAL', debounce: DEBOUNCE_HARD,      test: (v) => v.heartRate <= 30 },
  { id: 'BRADYCARDIA',   label: 'Bradycardia',          vital: 'heartRate',      severity: 'CRITICAL', debounce: DEBOUNCE_SUSTAINED, test: (v) => v.heartRate <= 45 },
  { id: 'BRADYCARDIA',   label: 'Bradycardia',          vital: 'heartRate',      severity: 'WARNING',  debounce: DEBOUNCE_SUSTAINED, test: (v) => v.heartRate <= 50 },
  { id: 'ARRHYTHMIA',    label: 'Arrhythmia',           vital: 'heartRate',      severity: 'WARNING',  debounce: DEBOUNCE_SUSTAINED, test: (_v, hrv) => hrv > 18 },
];

export const RULE_PRIORITY: string[] = [
  'MI', 'AFIB', 'HYPOXIA', 'FEBRILE', 'HYPOTHERMIA',
  'BPCRISIS', 'BPELEVATED', 'HYPOTENSION',
  'TACHYPNEA', 'BRADYPNEA', 'HYPERGLYCEMIA', 'HYPOGLYCEMIA',
  'TACHYCARDIA', 'BRADYCARDIA', 'ARRHYTHMIA',
];

export type HealthEngine = ReturnType<typeof createHealthEngine>;

export function createHealthEngine() {
  const counters   = new Map<string, number>();
  const hrWindow:  number[] = [];

  /**
   * Feed one vital snapshot. Returns the confirmed detection (or null).
   * Confirmed = debounce requirement met (hard 1 sample / sustained 2).
   * Multiple confirmations → highest severity, then RULE_PRIORITY order.
   */
  const step = (v: Vitals): Detection | null => {
    hrWindow.push(v.heartRate);
    if (hrWindow.length > 6) hrWindow.shift();
    const hrv = stdDev(hrWindow);

    const confirmed: Detection[] = [];
    for (const rule of RULES) {
      const key = `${rule.id}::${rule.severity}`;
      const pass = rule.test(v, hrv);
      const n = pass ? (counters.get(key) ?? 0) + 1 : 0;
      counters.set(key, n);
      if (pass && n >= rule.debounce) {
        confirmed.push({ id: rule.id, label: rule.label, severity: rule.severity, vital: rule.vital, value: v[rule.vital] });
      }
    }

    if (confirmed.length === 0) return null;
    const sevRank: Record<Exclude<HealthSeverity, 'OK'>, number> = { CRITICAL: 2, WARNING: 1 };
    const best = confirmed
      .slice()
      .sort((a, b) =>
        sevRank[b.severity] - sevRank[a.severity] ||
        RULE_PRIORITY.indexOf(a.id) - RULE_PRIORITY.indexOf(b.id))[0];
    return best;
  };

  const reset = () => { counters.clear(); hrWindow.length = 0; };

  return { step, reset };
}