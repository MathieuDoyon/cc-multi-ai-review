export type ShellRunner = (command: string) => Promise<string>;

export type DiffLimits = {
  maxDiffBytes: number;
  maxDiffLines: number;
  maxFiles: number;
};

export type BaseResolution =
  | {
      ok: true;
      baseRef: string;
      mergeBase: string;
    }
  | {
      ok: false;
      message: string;
    };

export type DiffContext = {
  baseRef: string;
  mergeBase: string;
  stat: string;
  nameStatus: string;
  diff: string;
  truncated: boolean;
  truncationReason?: string;
};

export type FindingSeverity = "critical" | "high" | "medium" | "low";
export type FindingConfidence = "high" | "medium" | "low";
export type FindingCategory =
  | "bug"
  | "security"
  | "performance"
  | "maintainability"
  | "test"
  | "docs"
  | "other";

export type ReviewerFinding = {
  title: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  file: string;
  line?: number;
  category: FindingCategory;
  evidence: string;
  recommendation: string;
  falsePositiveRisk: string;
};

export type ReviewerOutput = {
  summary: string;
  findings: ReviewerFinding[];
};

export type ReviewerResult = {
  model: string;
  output: ReviewerOutput;
};

export type ReviewAction = "address" | "investigate" | "likely false positive";

export type FindingGroup = {
  title: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  category: FindingCategory;
  file: string;
  line?: number;
  models: string[];
  findings: ReviewerFinding[];
  action: ReviewAction;
};

export type ReviewerFailure = {
  model: string;
  reason: string;
};

export type ReportInput = {
  groups: FindingGroup[];
  failures: ReviewerFailure[];
  partial: boolean;
  truncationReason?: string;
};

export type ReviewClient = {
  session: {
    create(input: { body: { parentID: string; title: string } }): Promise<{ id: string }>;
    prompt(input: {
      path: { id: string };
      body: {
        model: { providerID: string; modelID: string };
        system: string;
        tools: Record<string, boolean>;
        parts: Array<{ type: "text"; text: string }>;
      };
    }): Promise<{ parts: Array<{ type: string; text?: string }> }>;
  };
};

export type RunReviewInput = {
  client: ReviewClient;
  shell: ShellRunner;
  sessionID: string;
  models: string[];
  baseRef?: string;
  instructions?: string;
  limits: DiffLimits;
};

export type ReviewStateStore = {
  readLastModels(): Promise<string[]>;
  writeLastModels(models: string[]): Promise<void>;
};

export type ThinkingLevel = "low" | "medium" | "high";

export type PiInvocation = {
  model: string;
  prompt: string;
  thinking?: ThinkingLevel;
};

export type PiResult =
  | { model: string; ok: true; stdout: string }
  | { model: string; ok: false; reason: string };

export type PiRunner = (invocation: PiInvocation) => Promise<PiResult>;
