export type ParsedModelID = {
  providerID: string;
  modelID: string;
};

export function parseModelList(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function parseModelID(id: string): ParsedModelID | undefined {
  const slash = id.indexOf("/");
  if (slash <= 0 || slash === id.length - 1) return undefined;

  return {
    providerID: id.slice(0, slash),
    modelID: id.slice(slash + 1),
  };
}
