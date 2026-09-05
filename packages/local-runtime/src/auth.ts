import { randomBytes, timingSafeEqual } from "node:crypto";
import type { ResolvedLocalRuntimeConfig } from "./config.js";

export const LOCAL_RUNTIME_SESSION_COOKIE_NAME = "cestus_local_runtime_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const BOOTSTRAP_TTL_MS = 10 * 60 * 1000;

/** Process-local sessions expire on the server and are revoked by a restart. */
export function createLocalRuntimeSessions(config: ResolvedLocalRuntimeConfig, now = Date.now) {
  let bootstrapCode: string | undefined = randomBytes(32).toString("base64url");
  const bootstrapExpiresAt = now() + BOOTSTRAP_TTL_MS;
  let session: { value: string; expiresAt: number } | undefined;
  return {
    bootstrapCode,
    establish(code: string | undefined): string | undefined {
      if (!bootstrapCode || now() >= bootstrapExpiresAt || !safeEqual(code, bootstrapCode)) return undefined;
      bootstrapCode = undefined;
      session = { value: randomBytes(32).toString("base64url"), expiresAt: now() + SESSION_TTL_MS };
      return `${LOCAL_RUNTIME_SESSION_COOKIE_NAME}=${session.value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`;
    },
    authorized(headers: Record<string, string | undefined>): boolean {
      if (authorizedLocalRuntimeRequest(config, headers)) return true;
      return session !== undefined && now() < session.expiresAt &&
        safeEqual(cookieValue(headers, LOCAL_RUNTIME_SESSION_COOKIE_NAME), session.value);
    }
  };
}

/** Trusted internal HTTP callers and non-browser clients must present a bearer. */
export function authorizedLocalRuntimeRequest(
  config: ResolvedLocalRuntimeConfig,
  headers: Record<string, string | undefined>
): boolean {
  const expectedBearer = config.http.authToken;
  return expectedBearer !== undefined && expectedBearer.trim().length > 0 &&
    safeEqual(headerValue(headers, "authorization"), `Bearer ${expectedBearer}`);
}

function headerValue(headers: Record<string, string | undefined>, name: string): string | undefined {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
}

function cookieValue(headers: Record<string, string | undefined>, name: string): string | undefined {
  for (const part of (headerValue(headers, "cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

function safeEqual(left: string | undefined, right: string): boolean {
  if (left === undefined) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
