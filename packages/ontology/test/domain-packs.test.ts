import { describe, expect, it } from "vitest";
import { corePack, domainPackSchema, DomainPackRegistry, type DomainPack } from "../src/domain-packs.js";

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

  it("rejects whitespace-only governance text", () => {
    const registry = new DomainPackRegistry();

    expect(() =>
      registry.install(
        orgPack({
          name: "   ",
          version: "\t",
          description: "                    ",
          agentGuide: "\n                    ",
          entityTypes: [{ name: "   ", description: "          " }],
          relationshipTypes: [
            {
              name: "   ",
              from: "   ",
              to: "   ",
              description: "          "
            }
          ]
        })
      )
    ).toThrow(/name|version|description|agentGuide|entityTypes\.0|relationshipTypes\.0/);
  });

  it("trims pack text into useful typed output", () => {
    const registry = new DomainPackRegistry();

    registry.install(
      orgPack({
        name: "  public-records-trimmed  ",
        version: "  0.1.1  ",
        description: "  Public records ontology concepts reviewed for shared newsroom use.  ",
        agentGuide: "  Use this pack for reviewed public-records concepts only after provenance is represented.  ",
        entityTypes: [{ name: "  Agency  ", description: "  A public agency named in source evidence.  " }],
        relationshipTypes: [
          {
            name: "  requestedFrom  ",
            from: "  Evidence  ",
            to: "  Agency  ",
            description: "  Connects a records request artifact to the agency that received it.  "
          }
        ]
      })
    );

    expect(registry.get("public-records-trimmed")).toMatchObject({
      name: "public-records-trimmed",
      version: "0.1.1",
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
      ]
    });
  });

  it("rejects duplicate entity type names with path-specific errors", () => {
    const result = domainPackSchema.safeParse(
      orgPack({
        entityTypes: [
          { name: "Agency", description: "A public agency named in source evidence." },
          { name: "Agency", description: "The same entity name repeated in the same pack." }
        ]
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["entityTypes", 1, "name"],
          message: 'Duplicate entity type name "Agency".'
        })
      );
    }
  });

  it("rejects duplicate relationship type names with path-specific errors", () => {
    const result = domainPackSchema.safeParse(
      orgPack({
        relationshipTypes: [
          {
            name: "requestedFrom",
            from: "Evidence",
            to: "Agency",
            description: "Connects a records request artifact to the agency that received it."
          },
          {
            name: "requestedFrom",
            from: "Evidence",
            to: "Agency",
            description: "Repeats a relationship type name in the same pack."
          }
        ]
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["relationshipTypes", 1, "name"],
          message: 'Duplicate relationship type name "requestedFrom".'
        })
      );
    }
  });

  it("rejects unknown keys at pack and type levels", () => {
    const result = domainPackSchema.safeParse({
      ...orgPack(),
      uncontracted: true,
      entityTypes: [
        {
          name: "Agency",
          description: "A public agency named in source evidence.",
          uncontracted: true
        }
      ],
      relationshipTypes: [
        {
          name: "requestedFrom",
          from: "Evidence",
          to: "Agency",
          description: "Connects a records request artifact to the agency that received it.",
          uncontracted: true
        }
      ]
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join(".")).sort()).toEqual([
        "",
        "entityTypes.0",
        "relationshipTypes.0"
      ]);
    }
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

  it("returns shared pack clones so caller mutation cannot alter registry state", () => {
    const registry = new DomainPackRegistry();
    registry.install(orgPack());

    const [sharedPack] = registry.sharedPacks();
    expect(sharedPack).toBeDefined();
    sharedPack?.relationshipTypes.push({
      name: "mutated",
      from: "Evidence",
      to: "Agency",
      description: "A caller-side mutation."
    });
    if (sharedPack) {
      sharedPack.version = "99.0.0";
    }

    const [freshSharedPack] = registry.sharedPacks();
    expect(freshSharedPack?.version).toBe("0.1.0");
    expect(freshSharedPack?.relationshipTypes.map((relationshipType) => relationshipType.name)).not.toContain(
      "mutated"
    );
  });

  it("rejects duplicate pack names so replacement policy stays explicit", () => {
    const registry = new DomainPackRegistry();
    registry.install(orgPack());

    expect(() => registry.install(orgPack({ version: "0.2.0" }))).toThrow("already installed");
  });
});
