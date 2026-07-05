import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { ResolvedLocalRuntimeConfig } from "./config.js";

export const LOCAL_RUNTIME_SESSION_COOKIE_NAME = "cestus_local_runtime_session";

export function createLocalRuntimeSessionBootstrapCode(): string {
  return randomBytes(32).toString("base64url");
}

export function localRuntimeSessionCookieValue(
  config: ResolvedLocalRuntimeConfig
): string | undefined {
  if (!config.http.authRequired || config.http.authToken === undefined) {
    return undefined;
  }

  return createHash("sha256")
    .update("cestus-local-runtime-session-v1\0")
    .update(config.http.authToken)
    .digest("base64url");
}

export function localRuntimeSessionSetCookie(config: ResolvedLocalRuntimeConfig): string | undefined {
  const value = localRuntimeSessionCookieValue(config);
  if (value === undefined) {
    return undefined;
  }

  return `${LOCAL_RUNTIME_SESSION_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`;
}

export function authorizedLocalRuntimeRequest(
  config: ResolvedLocalRuntimeConfig,
  headers: Record<string, string | undefined>
): boolean {
  if (!config.http.authRequired) {
    return true;
  }

  const expectedBearer = config.http.authToken;
  if (expectedBearer !== undefined && safeEqual(headerValue(headers, "authorization"), `Bearer ${expectedBearer}`)) {
    return true;
  }

  const expectedCookie = localRuntimeSessionCookieValue(config);
  if (expectedCookie === undefined) {
    return false;
  }

  return safeEqual(cookieValue(headers, LOCAL_RUNTIME_SESSION_COOKIE_NAME), expectedCookie);
}

function headerValue(headers: Record<string, string | undefined>, name: string): string | undefined {
  const canonicalName = `${name.slice(0, 1).toUpperCase()}${name.slice(1).toLowerCase()}`;
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()] ?? headers[canonicalName];
}

function cookieValue(
  headers: Record<string, string | undefined>,
  name: string
): string | undefined {
  const cookie = headerValue(headers, "cookie");
  if (cookie === undefined) {
    return undefined;
  }

  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return rawValue.join("=");
    }
  }

  return undefined;
}

function safeEqual(left: string | undefined, right: string): boolean {
  if (left === undefined) {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
