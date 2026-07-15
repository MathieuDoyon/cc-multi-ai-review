export type ParsedModelID = {
  providerID: string;
  modelID: string;
};

export type PiModel = {
  id: string;
  provider: string;
  model: string;
  thinking: boolean;
};

export function parseModelID(id: string): ParsedModelID | undefined {
  const slash = id.indexOf("/");
  if (slash <= 0 || slash === id.length - 1) return undefined;
  return { providerID: id.slice(0, slash), modelID: id.slice(slash + 1) };
}

export function parsePiModels(output: string): PiModel[] {
  const models: PiModel[] = [];
  for (const line of output.split("\n")) {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 6) continue;
    const thinking = tokens[4];
    if (thinking !== "yes" && thinking !== "no") continue; // skips header + noise
    const provider = tokens[0];
    const model = tokens[1];
    models.push({ id: `${provider}/${model}`, provider, model, thinking: thinking === "yes" });
  }
  return models;
}

const LIGHTWEIGHT_TOKENS = new Set(["mini", "fast", "flash", "free", "spark", "lite"]);

export type ModelFamily = {
  family: string;
  flagship: string;
  variants: string[];
  thinking: boolean;
};

export function familyKey(provider: string, model: string): string {
  const gpt = model.match(/^(gpt-\d+\.\d+)/);
  if (gpt) return `${provider}/${gpt[1]}`;
  return `${provider}/${familyRoot(model)}`;
}

function familyRoot(model: string): string {
  const digit = model.search(/\d/);
  const head = digit === -1 ? model : model.slice(0, digit);
  const segments = head.split("-").filter((seg) => seg.length > 0);
  if (segments.length > 1 && (segments[segments.length - 1] ?? "").length <= 2) segments.pop();
  return segments.join("-") || model;
}

function isLightweight(model: string): boolean {
  return model.split(/[-.]/).some((token) => LIGHTWEIGHT_TOKENS.has(token));
}

function pickFlagship(list: PiModel[]): PiModel {
  const full = list.filter((m) => !isLightweight(m.model));
  const pool = full.length > 0 ? full : list;
  const sorted = [...pool].sort((a, b) => a.model.localeCompare(b.model, undefined, { numeric: true }));
  return sorted[sorted.length - 1] as PiModel;
}

export function groupModelFamilies(models: PiModel[]): ModelFamily[] {
  const map = new Map<string, PiModel[]>();
  for (const m of models) {
    const key = familyKey(m.provider, m.model);
    const list = map.get(key) ?? [];
    list.push(m);
    map.set(key, list);
  }

  const families: ModelFamily[] = [];
  for (const [family, list] of map) {
    const flagship = pickFlagship(list);
    families.push({
      family,
      flagship: flagship.id,
      variants: list.map((m) => m.id),
      thinking: flagship.thinking,
    });
  }
  return families;
}

export function thinkingSupportMap(models: PiModel[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const m of models) map[m.id] = m.thinking;
  return map;
}
