import { describe, expect, it } from "vitest";
import { corePack, DomainPackRegistry, type DomainPack } from "../src/domain-packs.js";

function orgPack(overrides: Partial<DomainPack> = {}): DomainPack {
  return {
    name: "public-records",
    version: "0.1.0",
    scope: "org",
    description: "Public records ontology concepts reviewed for shared newsroom use.",
    agentGuide: "Use this pack for reviewed public-records concepts only after provenance is represented.",
    entityTypes: [{ name: "Agency", description: "A public agency named in source evidence." }],
    relationshipTypes: [
      {
        name: "requestedFrom",
        from: "Evidence",
        to: "Agency",
        description: "Connects a records request artifact to the agency that received it."
      }
    ],
    ...overrides
  };
}

describe("DomainPackRegistry", () => {
  it("accepts the AI-legible core pack", () => {
    const registry = new DomainPackRegistry();

    registry.install(corePack);

    expect(registry.get("core")?.version).toBe("0.1.0");
  });

  it("rejects packs without agent guidance", () => {
    const registry = new DomainPackRegistry();

    expect(() =>
      registry.install({
        name: "bad-pack",
        version: "0.1.0",
        scope: "org",
        description: "Missing guidance for a shared ontology pack.",
        agentGuide: "",
        entityTypes: [],
        relationshipTypes: []
      })
    ).toThrow("agentGuide");
  });

  it("keeps investigation packs scoped locally", () => {
    const registry = new DomainPackRegistry();
    registry.install({
      name: "investigation-local-test",
      version: "0.1.0",
      scope: "investigation",
      description: "Local investigation extension for a test inquiry.",
      agentGuide: "Use only inside the owning investigation until promoted by a reviewed ontology event.",
      entityTypes: [{ name: "TemporaryLead", description: "A lead that has not been promoted." }],
      relationshipTypes: []
    });

    expect(registry.sharedPacks().map((pack) => pack.name)).not.toContain("investigation-local-test");
  });

  it("returns a clone so caller mutation cannot alter registry state", () => {
    const registry = new DomainPackRegistry();
    registry.install(orgPack());

    const retrieved = registry.get("public-records");
    expect(retrieved).toBeDefined();
    retrieved?.entityTypes.push({ name: "Mutated", description: "A caller-side mutation." });
    if (retrieved) {
      retrieved.version = "99.0.0";
    }

    expect(registry.get("public-records")?.version).toBe("0.1.0");
    expect(registry.get("public-records")?.entityTypes.map((entityType) => entityType.name)).not.toContain("Mutated");
  });

  it("rejects duplicate pack names so replacement policy stays explicit", () => {
    const registry = new DomainPackRegistry();
    registry.install(orgPack());

    expect(() => registry.install(orgPack({ version: "0.2.0" }))).toThrow("already installed");
  });
});
