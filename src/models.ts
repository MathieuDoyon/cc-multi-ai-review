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
