import yaml from "js-yaml";

export interface ScoringDimension {
  key: string;
  name: string;
  weight: number;
  description: string;
}

export interface GradingBand {
  grade: string;
  min: number;
  max: number;
  label: string;
}

export interface EcosystemCheck {
  key: string;
  name: string;
  weight: number;
  description: string;
}

export interface EcosystemModule {
  key: string;
  name: string;
  enabled: boolean;
  extraChecks: EcosystemCheck[];
}

export interface RuleSet {
  version: string;
  name: string;
  updatedAt: string;
  dimensions: ScoringDimension[];
  gradingBands: GradingBand[];
  ecosystemModules: EcosystemModule[];
  notes: string;
}

export interface RuleVersion {
  id: string;
  name: string;
  version: string;
  uploadedBy: string;
  uploadedAt: string;
  active: boolean;
  rawYAML: string;
  parsed: RuleSet;
}

export interface MockAIScore {
  dimensionScores: { key: string; name: string; score: number; weight: number }[];
  ecosystemScores: { key: string; name: string; score: number; weight: number }[];
  weightedScore: number;
  grade: string;
}

const DEFAULT_YAML = `version: "1.0.0"
name: "Aura Universal Rules v1"
updatedAt: "2026-03-04"
dimensions:
  - key: "innovation"
    name: "Innovation"
    weight: 20
    description: "Novelty and originality"
  - key: "technical"
    name: "Technical Execution"
    weight: 20
    description: "Engineering quality and correctness"
  - key: "market"
    name: "Market Potential"
    weight: 15
    description: "User need, market size, business logic"
  - key: "product"
    name: "Product Design"
    weight: 10
    description: "UX, clarity, usability"
  - key: "traction"
    name: "Traction"
    weight: 10
    description: "Signals: users, metrics, pilots"
  - key: "security"
    name: "Security & Risk"
    weight: 10
    description: "Threat model, audits, safety"
  - key: "team"
    name: "Team"
    weight: 10
    description: "Capability and execution credibility"
  - key: "clarity"
    name: "Clarity"
    weight: 5
    description: "Communication, documentation quality"
gradingBands:
  - grade: "S"
    min: 86
    max: 100
    label: "Top Operator, strongly recommend"
  - grade: "A"
    min: 70
    max: 85
    label: "Strong project, recommend"
  - grade: "B"
    min: 50
    max: 69
    label: "Watchlist, needs validation"
  - grade: "C"
    min: 0
    max: 49
    label: "Eliminate tendency"
ecosystemModules:
  - key: "avalanche"
    name: "Avalanche Ecosystem Module"
    enabled: true
    extraChecks:
      - key: "avalanche_integration"
        name: "Avalanche Integration"
        weight: 10
        description: "Uses Avalanche tooling / L1 / Subnets / etc"
      - key: "x402_usage"
        name: "x402 / Agent Economy Fit"
        weight: 10
        description: "Meaningful x402 + agent usage"
notes: |
  Universal 8 dimensions apply to all hackathons.
  Avalanche module adds ecosystem-specific checks.
`;

// In-memory store
let versions: RuleVersion[] = [
  {
    id: "v-001",
    name: "Aura Universal Rules v1",
    version: "1.0.0",
    uploadedBy: "system",
    uploadedAt: "2026-03-01T10:00:00Z",
    active: true,
    rawYAML: DEFAULT_YAML,
    parsed: yaml.load(DEFAULT_YAML) as RuleSet,
  },
  {
    id: "v-000",
    name: "Aura Universal Rules v0.9 (beta)",
    version: "0.9.0",
    uploadedBy: "admin",
    uploadedAt: "2026-02-15T08:30:00Z",
    active: false,
    rawYAML: DEFAULT_YAML.replace("1.0.0", "0.9.0").replace("Aura Universal Rules v1", "Aura Universal Rules v0.9 (beta)"),
    parsed: yaml.load(DEFAULT_YAML.replace("1.0.0", "0.9.0").replace("Aura Universal Rules v1", "Aura Universal Rules v0.9 (beta)")) as RuleSet,
  },
];

function delay(ms = 300) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function parseAndValidateYAML(raw: string): { parsed: RuleSet | null; validation: ValidationResult } {
  const errors: string[] = [];
  const warnings: string[] = [];

  let parsed: any;
  try {
    parsed = yaml.load(raw);
  } catch (e: any) {
    return { parsed: null, validation: { valid: false, errors: [`YAML parse error: ${e.message}`], warnings: [] } };
  }

  if (!parsed || typeof parsed !== "object") {
    return { parsed: null, validation: { valid: false, errors: ["YAML must be an object"], warnings: [] } };
  }

  if (!parsed.version) errors.push("Missing 'version' field");
  if (!parsed.name) errors.push("Missing 'name' field");
  if (!parsed.dimensions || !Array.isArray(parsed.dimensions)) errors.push("Missing or invalid 'dimensions' array");

  if (parsed.dimensions && Array.isArray(parsed.dimensions)) {
    const totalWeight = parsed.dimensions.reduce((s: number, d: any) => s + (Number(d.weight) || 0), 0);
    if (totalWeight !== 100) errors.push(`Universal dimensions weights sum to ${totalWeight}, must equal 100`);
  }

  if (parsed.gradingBands && Array.isArray(parsed.gradingBands)) {
    const sorted = [...parsed.gradingBands].sort((a: any, b: any) => a.min - b.min);
    if (sorted.length > 0) {
      if (sorted[0].min !== 0) warnings.push("Grading bands don't start at 0");
      if (sorted[sorted.length - 1].max !== 100) warnings.push("Grading bands don't end at 100");
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].min !== sorted[i - 1].max + 1) warnings.push(`Gap or overlap between bands: ${sorted[i - 1].grade} and ${sorted[i].grade}`);
      }
    }
  } else {
    warnings.push("Missing 'gradingBands'");
  }

  return { parsed: errors.length === 0 ? (parsed as RuleSet) : null, validation: { valid: errors.length === 0, errors, warnings } };
}

// Simulated API calls
export async function fetchActiveRules(): Promise<RuleVersion | null> {
  await delay();
  return versions.find((v) => v.active) ?? null;
}

export async function fetchRuleVersions(): Promise<RuleVersion[]> {
  await delay();
  return [...versions];
}

export async function uploadRules(rawYAML: string): Promise<{ versionId: string; validation: ValidationResult }> {
  await delay(500);
  const { parsed, validation } = parseAndValidateYAML(rawYAML);
  if (!parsed) return { versionId: "", validation };

  const id = `v-${Date.now().toString(36)}`;
  versions = [
    {
      id,
      name: parsed.name || "Unnamed Rules",
      version: parsed.version || "0.0.0",
      uploadedBy: "admin",
      uploadedAt: new Date().toISOString(),
      active: false,
      rawYAML,
      parsed,
    },
    ...versions,
  ];
  return { versionId: id, validation };
}

export async function activateRules(versionId: string): Promise<boolean> {
  await delay();
  const found = versions.find((v) => v.id === versionId);
  if (!found) return false;
  versions = versions.map((v) => ({ ...v, active: v.id === versionId }));
  return true;
}

export async function deleteRuleVersion(versionId: string): Promise<boolean> {
  await delay();
  const v = versions.find((v) => v.id === versionId);
  if (!v || v.active) return false;
  versions = versions.filter((v) => v.id !== versionId);
  return true;
}

export function generateMockAIScores(rules: RuleSet): MockAIScore {
  const dimensionScores = rules.dimensions.map((d) => ({
    key: d.key,
    name: d.name,
    score: Math.floor(Math.random() * 40) + 55,
    weight: d.weight,
  }));

  const enabledModules = rules.ecosystemModules.filter((m) => m.enabled);
  const ecosystemScores = enabledModules.flatMap((m) =>
    m.extraChecks.map((c) => ({
      key: c.key,
      name: c.name,
      score: Math.floor(Math.random() * 40) + 50,
      weight: c.weight,
    }))
  );

  const totalDimWeight = dimensionScores.reduce((s, d) => s + d.weight, 0);
  const totalEcoWeight = ecosystemScores.reduce((s, d) => s + d.weight, 0);
  const totalWeight = totalDimWeight + totalEcoWeight;

  const weightedSum =
    dimensionScores.reduce((s, d) => s + d.score * d.weight, 0) +
    ecosystemScores.reduce((s, d) => s + d.score * d.weight, 0);

  const weightedScore = Math.round((weightedSum / totalWeight) * 10) / 10;

  let grade = "C";
  for (const band of rules.gradingBands.sort((a, b) => b.min - a.min)) {
    if (weightedScore >= band.min) {
      grade = band.grade;
      break;
    }
  }

  return { dimensionScores, ecosystemScores, weightedScore, grade };
}

export function downloadYAML(rawYAML: string, filename: string) {
  const blob = new Blob([rawYAML], { type: "text/yaml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
