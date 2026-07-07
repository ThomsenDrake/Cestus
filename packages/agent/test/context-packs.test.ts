import { describe, expect, it } from "vitest";
import {
  buildContextPackRef,
  contextPackDescriptorSchema,
  contextPackRefSchema,
  createContextPackRegistry,
  hashAgentContextPack
} from "../src/context-packs.js";

describe("agent context packs", () => {
  it("validates descriptor metadata for explicit context assembly", () => {
    const descriptor = contextPackDescriptorSchema.parse({
      contextPackId: "accepted-graph-projection.v1",
      version: 1,
      label: "Accepted graph projection",
      maxBytes: 32_768,
      requiredProvenanceKinds: ["event-id", "content-hash"],
      redactionPolicy: "safe-summary",
      sourceProjection: "ontology.graph"
    });

    expect(descriptor.contextPackId).toBe("accepted-graph-projection.v1");
  });

  it("builds stable context pack hashes from sorted JSON", () => {
    const left = hashAgentContextPack({ b: 2, a: 1 });
    const right = hashAgentContextPack({ a: 1, b: 2 });

    expect(left).toBe(right);
    expect(left).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects arrays with custom enumerable string properties", () => {
    const payload = ["ok"] as string[] & { extra?: string };
    payload.extra = "api key sk-live-value";

    expect(() => hashAgentContextPack(payload)).toThrow(/JSON DTO-safe|secret/i);
  });

  it("rejects arrays with symbol keys", () => {
    const payload = ["ok"];
    Object.defineProperty(payload, Symbol("context"), {
      value: "ok",
      enumerable: true
    });

    expect(() => hashAgentContextPack(payload)).toThrow(/JSON DTO-safe/i);
  });

  it("rejects accessor-backed array entries without invoking the getter", () => {
    let getterInvoked = false;
    const payload: string[] = [];
    Object.defineProperty(payload, "0", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "ok";
      }
    });

    let thrown: unknown;
    try {
      hashAgentContextPack(payload);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/JSON DTO-safe/i);
    expect(getterInvoked).toBe(false);
  });

  it("rejects secret-shaped summaries and refs", () => {
    expect(() =>
      contextPackRefSchema.parse({
        contextPackId: "evidence-summary.v1",
        version: 1,
        contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        generatedAt: "2026-07-07T22:00:00.000Z",
        safeSummary: "api key sk-live-value",
        provenanceRefs: []
      })
    ).toThrow(/secret/i);
  });

  it("rejects accessor-backed context pack ref summaries without invoking the getter", () => {
    let getterInvoked = false;
    const ref = {
      contextPackId: "evidence-summary.v1",
      version: 1,
      contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      generatedAt: "2026-07-07T22:00:00.000Z",
      provenanceRefs: []
    };
    Object.defineProperty(ref, "safeSummary", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "Safe summary.";
      }
    });

    let thrown: unknown;
    try {
      contextPackRefSchema.parse(ref);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/JSON DTO-safe/i);
    expect(getterInvoked).toBe(false);
  });

  it("rejects accessor-backed provenance refs without invoking the getter", () => {
    let getterInvoked = false;
    const provenanceRefs: string[] = [];
    Object.defineProperty(provenanceRefs, "0", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "evt_agent_task";
      }
    });

    let thrown: unknown;
    try {
      contextPackRefSchema.parse({
        contextPackId: "evidence-summary.v1",
        version: 1,
        contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        generatedAt: "2026-07-07T22:00:00.000Z",
        safeSummary: "Safe summary.",
        provenanceRefs
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/JSON DTO-safe/i);
    expect(getterInvoked).toBe(false);
  });

  it("rejects provenance ref arrays with custom properties and symbol keys", () => {
    const customProps = ["evt_agent_task"] as string[] & { extra?: string };
    customProps.extra = "extra context";
    const symbolKeyed = ["evt_agent_task"];
    Object.defineProperty(symbolKeyed, Symbol("context"), {
      value: "extra context",
      enumerable: true
    });

    for (const provenanceRefs of [customProps, symbolKeyed]) {
      expect(() =>
        contextPackRefSchema.parse({
          contextPackId: "evidence-summary.v1",
          version: 1,
          contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          generatedAt: "2026-07-07T22:00:00.000Z",
          safeSummary: "Safe summary.",
          provenanceRefs
        })
      ).toThrow(/JSON DTO-safe/i);
    }
  });

  it("rejects build refs with provenance arrays that have secret-shaped custom properties", () => {
    const provenanceRefs = ["evt_agent_task"] as string[] & { extra?: string };
    provenanceRefs.extra = "api key sk-live-value";

    expect(() =>
      buildContextPackRef({
        contextPackId: "task-run-history.v1",
        version: 1,
        generatedAt: "2026-07-07T22:00:00.000Z",
        payload: { events: ["evt_agent_task"] },
        safeSummary: "One prior task event.",
        provenanceRefs
      })
    ).toThrow(/JSON DTO-safe|secret/i);
  });

  it("rejects build refs with provenance arrays that have symbol keys", () => {
    const provenanceRefs = ["evt_agent_task"];
    Object.defineProperty(provenanceRefs, Symbol("context"), {
      value: "extra context",
      enumerable: true
    });

    expect(() =>
      buildContextPackRef({
        contextPackId: "task-run-history.v1",
        version: 1,
        generatedAt: "2026-07-07T22:00:00.000Z",
        payload: { events: ["evt_agent_task"] },
        safeSummary: "One prior task event.",
        provenanceRefs
      })
    ).toThrow(/JSON DTO-safe/i);
  });

  it("rejects build refs with accessor-backed provenance entries without invoking the getter", () => {
    let getterInvoked = false;
    const provenanceRefs: string[] = [];
    Object.defineProperty(provenanceRefs, "0", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "evt_agent_task";
      }
    });

    let thrown: unknown;
    try {
      buildContextPackRef({
        contextPackId: "task-run-history.v1",
        version: 1,
        generatedAt: "2026-07-07T22:00:00.000Z",
        payload: { events: ["evt_agent_task"] },
        safeSummary: "One prior task event.",
        provenanceRefs
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/JSON DTO-safe/i);
    expect(getterInvoked).toBe(false);
  });

  it("rejects build refs without provenance refs", () => {
    expect(() =>
      buildContextPackRef({
        contextPackId: "task-run-history.v1",
        version: 1,
        generatedAt: "2026-07-07T22:00:00.000Z",
        payload: { events: [] },
        safeSummary: "No prior task events.",
        provenanceRefs: []
      })
    ).toThrow(/provenanceRefs/i);
  });

  it("rejects accessor-backed descriptor fields and arrays without invoking getters", () => {
    let labelGetterInvoked = false;
    const descriptor = {
      contextPackId: "accepted-graph-projection.v1",
      version: 1,
      maxBytes: 32_768,
      requiredProvenanceKinds: ["event-id"],
      redactionPolicy: "safe-summary",
      sourceProjection: "ontology.graph"
    };
    Object.defineProperty(descriptor, "label", {
      enumerable: true,
      get() {
        labelGetterInvoked = true;
        return "Accepted graph projection";
      }
    });

    let descriptorThrown: unknown;
    try {
      contextPackDescriptorSchema.parse(descriptor);
    } catch (error) {
      descriptorThrown = error;
    }

    expect(descriptorThrown).toBeInstanceOf(Error);
    expect((descriptorThrown as Error).message).toMatch(/JSON DTO-safe/i);
    expect(labelGetterInvoked).toBe(false);

    let arrayGetterInvoked = false;
    const requiredProvenanceKinds: string[] = [];
    Object.defineProperty(requiredProvenanceKinds, "0", {
      enumerable: true,
      get() {
        arrayGetterInvoked = true;
        return "event-id";
      }
    });

    let arrayThrown: unknown;
    try {
      contextPackDescriptorSchema.parse({
        contextPackId: "accepted-graph-projection.v1",
        version: 1,
        label: "Accepted graph projection",
        maxBytes: 32_768,
        requiredProvenanceKinds,
        redactionPolicy: "safe-summary",
        sourceProjection: "ontology.graph"
      });
    } catch (error) {
      arrayThrown = error;
    }

    expect(arrayThrown).toBeInstanceOf(Error);
    expect((arrayThrown as Error).message).toMatch(/JSON DTO-safe/i);
    expect(arrayGetterInvoked).toBe(false);

    const requiredKindsWithCustomProp = ["event-id"] as string[] & { extra?: string };
    requiredKindsWithCustomProp.extra = "extra context";
    expect(() =>
      contextPackDescriptorSchema.parse({
        contextPackId: "accepted-graph-projection.v1",
        version: 1,
        label: "Accepted graph projection",
        maxBytes: 32_768,
        requiredProvenanceKinds: requiredKindsWithCustomProp,
        redactionPolicy: "safe-summary",
        sourceProjection: "ontology.graph"
      })
    ).toThrow(/JSON DTO-safe/i);
  });

  it("registers fake context builders by stable id", async () => {
    const registry = createContextPackRegistry();
    registry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return buildContextPackRef({
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: ["evt_agent_task"] },
          safeSummary: "One prior task event.",
          provenanceRefs: ["evt_agent_task"]
        });
      }
    });

    await expect(registry.build("task-run-history.v1")).resolves.toMatchObject({
      contextPackId: "task-run-history.v1",
      provenanceRefs: ["evt_agent_task"],
      sizeBytes: expect.any(Number)
    });
  });

  it("rejects registered builder refs without provenance refs", async () => {
    const registry = createContextPackRegistry();
    registry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return {
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: [] },
          safeSummary: "No provenance.",
          provenanceRefs: []
        };
      }
    });

    await expect(registry.build("task-run-history.v1")).rejects.toThrow(/provenanceRefs/i);
  });

  it("rejects registered builder refs that exceed the descriptor byte budget", async () => {
    const registry = createContextPackRegistry();
    registry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 8,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return buildContextPackRef({
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: ["evt_agent_task", "evt_agent_task_two"] },
          safeSummary: "Two prior task events.",
          provenanceRefs: ["evt_agent_task"]
        });
      }
    });

    await expect(registry.build("task-run-history.v1")).rejects.toThrow(/maxBytes|budget|exceeds/i);
  });

  it("rejects hand-rolled refs that under-report derived size bytes", async () => {
    const registry = createContextPackRegistry();
    registry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 8,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return {
          contextPackId: "task-run-history.v1",
          version: 1,
          contentHash: hashAgentContextPack({ events: ["evt_agent_task", "evt_agent_task_two"] }),
          sizeBytes: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          safeSummary: "Forged tiny ref.",
          provenanceRefs: ["evt_agent_task"]
        } as ReturnType<typeof buildContextPackRef>;
      }
    });

    await expect(registry.build("task-run-history.v1")).rejects.toThrow(/buildContextPackRef|untrusted/i);
  });

  it("reports the exact missing builder error", async () => {
    const registry = createContextPackRegistry();

    await expect(registry.build("missing-pack.v1")).rejects.toThrow("Context pack missing-pack.v1 is not registered");
  });

  it("captures the registered builder function", async () => {
    const registry = createContextPackRegistry();
    const builder = {
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return buildContextPackRef({
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: ["evt_agent_task"] },
          safeSummary: "Original registered builder.",
          provenanceRefs: ["evt_agent_task"]
        });
      }
    };

    registry.register(builder);
    builder.build = async () =>
      buildContextPackRef({
        contextPackId: "task-run-history.v1",
        version: 1,
        generatedAt: "2026-07-07T22:00:00.000Z",
        payload: { events: ["evt_agent_task_mutated"] },
        safeSummary: "Mutated builder.",
        provenanceRefs: ["evt_agent_task_mutated"]
      });

    await expect(registry.build("task-run-history.v1")).resolves.toMatchObject({
      safeSummary: "Original registered builder.",
      provenanceRefs: ["evt_agent_task"]
    });
  });

  it("checks duplicate registration before touching duplicate build properties", () => {
    const registry = createContextPackRegistry();
    const descriptor = {
      contextPackId: "task-run-history.v1",
      version: 1,
      label: "Task and run history",
      maxBytes: 16_384,
      requiredProvenanceKinds: ["event-id"],
      redactionPolicy: "safe-summary",
      sourceProjection: "agent.projection"
    };
    registry.register({
      descriptor,
      async build() {
        return buildContextPackRef({
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: ["evt_agent_task"] },
          safeSummary: "Original registered builder.",
          provenanceRefs: ["evt_agent_task"]
        });
      }
    });

    let getterInvoked = false;
    const duplicateBuilder = { descriptor } as unknown as {
      descriptor: typeof descriptor;
      build(): ReturnType<typeof buildContextPackRef>;
    };
    Object.defineProperty(duplicateBuilder, "build", {
      enumerable: true,
      get() {
        getterInvoked = true;
        throw new Error("duplicate build getter invoked");
      }
    });

    expect(() => registry.register(duplicateBuilder)).toThrow("Context pack task-run-history.v1 is already registered");
    expect(getterInvoked).toBe(false);
  });

  it("checks duplicate registration before validating unrelated duplicate descriptor fields", () => {
    const registry = createContextPackRegistry();
    registry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return buildContextPackRef({
          contextPackId: "task-run-history.v1",
          version: 1,
          generatedAt: "2026-07-07T22:00:00.000Z",
          payload: { events: ["evt_agent_task"] },
          safeSummary: "Original registered builder.",
          provenanceRefs: ["evt_agent_task"]
        });
      }
    });

    let labelGetterInvoked = false;
    let buildGetterInvoked = false;
    const duplicateDescriptor = {
      contextPackId: "task-run-history.v1",
      version: 1,
      maxBytes: 0,
      requiredProvenanceKinds: ["event-id"],
      redactionPolicy: "api key sk-live-value",
      sourceProjection: "agent.projection"
    };
    Object.defineProperty(duplicateDescriptor, "label", {
      enumerable: true,
      get() {
        labelGetterInvoked = true;
        throw new Error("duplicate label getter invoked");
      }
    });
    const duplicateBuilder = { descriptor: duplicateDescriptor } as unknown as {
      descriptor: typeof duplicateDescriptor & { label: string };
      build(): ReturnType<typeof buildContextPackRef>;
    };
    Object.defineProperty(duplicateBuilder, "build", {
      enumerable: true,
      get() {
        buildGetterInvoked = true;
        throw new Error("duplicate build getter invoked");
      }
    });

    expect(() => registry.register(duplicateBuilder)).toThrow("Context pack task-run-history.v1 is already registered");
    expect(labelGetterInvoked).toBe(false);
    expect(buildGetterInvoked).toBe(false);
  });

  it("rejects non-primitive registry lookup ids without invoking coercion hooks", async () => {
    const registry = createContextPackRegistry();
    let coercionInvoked = false;
    const nonPrimitive = {
      [Symbol.toPrimitive]() {
        coercionInvoked = true;
        return "task-run-history.v1";
      },
      toString() {
        coercionInvoked = true;
        return "task-run-history.v1";
      }
    };

    let thrown: unknown;
    try {
      await registry.build(nonPrimitive as unknown as string);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/contextPackId/i);
    expect(coercionInvoked).toBe(false);
  });

  it("rejects non-primitive descriptor lookups without invoking coercion hooks", () => {
    const registry = createContextPackRegistry();
    let coercionInvoked = false;
    const nonPrimitive = {
      [Symbol.toPrimitive]() {
        coercionInvoked = true;
        return "task-run-history.v1";
      },
      toString() {
        coercionInvoked = true;
        return "task-run-history.v1";
      }
    };

    let thrown: unknown;
    try {
      registry.getDescriptor(nonPrimitive as unknown as string);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/contextPackId/i);
    expect(coercionInvoked).toBe(false);
  });

  it("rejects secret-shaped descriptor lookup ids", () => {
    const registry = createContextPackRegistry();

    expect(() => registry.getDescriptor("api key sk-live-value")).toThrow(/secret/i);
  });

  it("freezes built refs and registry descriptor snapshots", () => {
    const ref = buildContextPackRef({
      contextPackId: "task-run-history.v1",
      version: 1,
      generatedAt: "2026-07-07T22:00:00.000Z",
      payload: { events: ["evt_agent_task"] },
      safeSummary: "One prior task event.",
      provenanceRefs: ["evt_agent_task"]
    });
    expect(Object.isFrozen(ref)).toBe(true);
    expect(Object.isFrozen(ref.provenanceRefs)).toBe(true);
    expect(ref.sizeBytes).toBeGreaterThan(0);

    const registry = createContextPackRegistry();
    registry.register({
      descriptor: {
        contextPackId: "task-run-history.v1",
        version: 1,
        label: "Task and run history",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      async build() {
        return ref;
      }
    });

    const descriptors = registry.listDescriptors();
    const snapshot = registry.snapshot();

    expect(Object.isFrozen(descriptors)).toBe(true);
    expect(Object.isFrozen(descriptors[0])).toBe(true);
    expect(Object.isFrozen(descriptors[0]?.requiredProvenanceKinds)).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.contextPackIds)).toBe(true);
    expect(Object.isFrozen(snapshot.descriptors)).toBe(true);
  });
});
