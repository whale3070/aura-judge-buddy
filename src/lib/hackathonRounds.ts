export type RoundMode = "online" | "offline" | "hybrid";
export type RoundStatus = "draft" | "open" | "judging" | "closed" | "archived";

export interface ScoringDimension {
  name: string;
  weight: number;
}

export interface GradeBand {
  grade: string;
  min: number;
  max: number;
}

export interface PitchConfig {
  enabled: boolean;
  weight: number;
  subScores: { name: string; weight: number }[];
}

export interface HackathonRound {
  id: string;
  name: string;
  description?: string;
  mode: RoundMode;
  timezone: string;
  startAt: string;
  endAt: string;
  status: RoundStatus;
  projectCount: number;
  judgedCount: number;
  pendingCount: number;
  rules: {
    scoringDimensions: ScoringDimension[];
    gradeBands: GradeBand[];
  };
  pitch: PitchConfig;
}

export const defaultGradeBands: GradeBand[] = [
  { grade: "S", min: 86, max: 100 },
  { grade: "A", min: 70, max: 85 },
  { grade: "B", min: 50, max: 69 },
  { grade: "C", min: 0, max: 49 },
];

export const defaultDimensions: ScoringDimension[] = [
  { name: "Innovation", weight: 30 },
  { name: "Technical Feasibility", weight: 30 },
  { name: "Market Potential", weight: 20 },
  { name: "Execution", weight: 20 },
];

export const defaultPitch: PitchConfig = {
  enabled: false,
  weight: 20,
  subScores: [
    { name: "Fluency", weight: 25 },
    { name: "Logic", weight: 30 },
    { name: "Q&A", weight: 25 },
    { name: "Time Control", weight: 20 },
  ],
};

export const mockRounds: HackathonRound[] = [
  {
    id: "r1",
    name: "Avalanche Summit 2026 - Round 1",
    description: "Initial screening round for all submissions. AI-powered evaluation of project documentation and code quality.",
    mode: "online",
    timezone: "Asia/Hong_Kong",
    startAt: "2026-03-01T09:00:00",
    endAt: "2026-03-15T23:59:00",
    status: "judging",
    projectCount: 128,
    judgedCount: 95,
    pendingCount: 33,
    rules: {
      scoringDimensions: [...defaultDimensions],
      gradeBands: [...defaultGradeBands],
    },
    pitch: { ...defaultPitch },
  },
  {
    id: "r2",
    name: "Avalanche Summit 2026 - Finals",
    description: "Final round with live pitch presentations and panel review.",
    mode: "hybrid",
    timezone: "Asia/Hong_Kong",
    startAt: "2026-03-20T09:00:00",
    endAt: "2026-03-22T18:00:00",
    status: "draft",
    projectCount: 0,
    judgedCount: 0,
    pendingCount: 0,
    rules: {
      scoringDimensions: [...defaultDimensions],
      gradeBands: [...defaultGradeBands],
    },
    pitch: { enabled: true, weight: 25, subScores: [...defaultPitch.subScores] },
  },
  {
    id: "r3",
    name: "Web3 Builder Jam - Q1",
    description: "Quarterly builder jam focused on DeFi infrastructure.",
    mode: "online",
    timezone: "UTC",
    startAt: "2026-01-10T00:00:00",
    endAt: "2026-01-20T23:59:00",
    status: "closed",
    projectCount: 45,
    judgedCount: 45,
    pendingCount: 0,
    rules: {
      scoringDimensions: [
        { name: "Innovation", weight: 25 },
        { name: "Technical Feasibility", weight: 25 },
        { name: "Market Potential", weight: 25 },
        { name: "Execution", weight: 25 },
      ],
      gradeBands: [...defaultGradeBands],
    },
    pitch: { ...defaultPitch },
  },
  {
    id: "r4",
    name: "Campus Hack 2025",
    mode: "offline",
    timezone: "Asia/Shanghai",
    startAt: "2025-11-01T08:00:00",
    endAt: "2025-11-03T20:00:00",
    status: "archived",
    projectCount: 72,
    judgedCount: 72,
    pendingCount: 0,
    rules: {
      scoringDimensions: [...defaultDimensions],
      gradeBands: [...defaultGradeBands],
    },
    pitch: { ...defaultPitch },
  },
];
