const verifiedResolvedContextPacks = new WeakSet<object>();

export function markVerifiedResolvedContextPack(value: object): void {
  verifiedResolvedContextPacks.add(value);
}

export function hasVerifiedResolvedContextPackBrand(value: unknown): boolean {
  return typeof value === "object" && value !== null && verifiedResolvedContextPacks.has(value);
}
