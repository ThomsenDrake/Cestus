import { z } from "zod";
import { isCredentialReferenceSecretSafeText } from "./credential-reference.js";

const credentialRefIdSchema = z.string()
  .regex(/^agent_credref_[a-zA-Z0-9_-]+$/)
  .refine(isCredentialReferenceSecretSafeText, { message: "credentialRefId must be secret-safe" });

export const secretStoreHealthSchema = z.object({
  credentialRefId: credentialRefIdSchema,
  status: z.enum(["healthy", "missing-binding", "expired", "revoked", "unverified"]),
  checkedAt: z.string().datetime(),
  safeMessage: z.string().min(1)
}).strict();

export type SecretStoreHealth = z.infer<typeof secretStoreHealthSchema>;

export class SecretMaterial {
  readonly #value: string;

  static fromTestValue(value: string): SecretMaterial {
    return Object.freeze(new SecretMaterial(value)) as SecretMaterial;
  }

  private constructor(value: string) {
    this.#value = value;
  }

  exposeForProviderAdapter(): string {
    return this.#value;
  }

  toJSON(): Record<string, never> {
    return {};
  }

  toString(): string {
    return "[SecretMaterial]";
  }
}

export interface SecretStore {
  resolve(credentialRefId: string): Promise<SecretMaterial | undefined>;
  health(credentialRefId: string): Promise<SecretStoreHealth>;
}

export class FakeSecretStore implements SecretStore {
  private readonly values = new Map<string, SecretMaterial>();

  async putForTest(credentialRefId: string, material: SecretMaterial): Promise<void> {
    this.values.set(credentialRefIdSchema.parse(credentialRefId), material);
  }

  async resolve(credentialRefId: string): Promise<SecretMaterial | undefined> {
    return this.values.get(credentialRefIdSchema.parse(credentialRefId));
  }

  async health(credentialRefId: string): Promise<SecretStoreHealth> {
    const parsedCredentialRefId = credentialRefIdSchema.parse(credentialRefId);
    const status: SecretStoreHealth["status"] = this.values.has(parsedCredentialRefId) ? "healthy" : "missing-binding";
    return Object.freeze(secretStoreHealthSchema.parse({
      credentialRefId: parsedCredentialRefId,
      status,
      checkedAt: "2026-07-07T22:00:00.000Z",
      safeMessage: status === "healthy"
        ? "Local binding is available."
        : "Local binding is missing on this machine."
    }));
  }
}
