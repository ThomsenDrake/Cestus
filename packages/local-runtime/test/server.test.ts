import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir, type NetworkInterfaceInfo } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalRuntimeConfig, type ResolvedLocalRuntimeConfig } from "../src/config.js";
import { startLocalRuntimeServer, type LocalRuntimeServerHandle } from "../src/server.js";

const tempDirs: string[] = [];
const handles: LocalRuntimeServerHandle[] = [];

afterEach(async () => {
  try {
    for (const handle of handles.splice(0)) {
      await handle.close();
    }
  } finally {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("startLocalRuntimeServer", () => {
  it("rejects unauthenticated protected requests before the body completes", async () => {
    const handle = await startTestServer(authRequiredConfig());
    const request = httpRequest({
      method: "POST",
      hostname: "127.0.0.1",
      port: serverPort(handle),
      path: "/api/requests/drafts",
      headers: {
        "content-length": "10485760",
        "content-type": "application/json"
      }
    });
    request.on("error", () => undefined);

    request.write("{");
    let response: Awaited<ReturnType<typeof responseFrom>>;
    try {
      response = await within(responseFrom(request), 1000, "timed out waiting for auth rejection");
    } finally {
      request.destroy();
    }

    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain("secret-local-token");
  });

  it("rejects oversized authenticated request bodies", async () => {
    const handle = await startTestServer(authRequiredConfig());
    const response = await fetch(`http://127.0.0.1:${serverPort(handle)}/api/requests/drafts`, {
      method: "POST",
      headers: {
        authorization: "Bearer secret-local-token",
        "content-type": "application/json"
      },
      body: "x".repeat(1_048_577)
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      ok: false,
      diagnostic: {
        message: "Request body is too large.",
        allowedRepairActions: ["send a smaller JSON request body"]
      }
    });
  });

  it("establishes an HttpOnly browser session for auth-required served clients", async () => {
    const handle = await startTestServer(authRequiredConfig());
    expect(handle.sessionBootstrapUrl).toBeDefined();
    expect(handle.sessionBootstrapUrl).not.toContain("secret-local-token");

    const unauthenticated = await fetch(`http://127.0.0.1:${serverPort(handle)}/api/requests/workspace`);
    expect(unauthenticated.status).toBe(401);

    const session = await fetch(handle.sessionBootstrapUrl ?? "", { redirect: "manual" });
    expect(session.status).toBe(303);
    expect(session.headers.get("location")).toBe("/");
    const setCookie = session.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("cestus_local_runtime_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).not.toContain("secret-local-token");

    const authenticated = await fetch(`http://127.0.0.1:${serverPort(handle)}/api/requests/workspace`, {
      headers: { cookie: cookieHeaderFromSetCookie(setCookie) }
    });
    expect(authenticated.status).toBe(200);
    expect(await authenticated.json()).toMatchObject({ cards: [] });
  });

  it("uses a non-loopback browser session URL for wildcard LAN binds", async () => {
    const handle = await startLocalRuntimeServer({
      config: authRequiredWildcardLanConfig(),
      networkInterfaces: () => fakeLanInterfaces("192.0.2.42")
    });
    handles.push(handle);

    expect(handle.sessionBootstrapUrl).toMatch(/^http:\/\/192\.0\.2\.42:\d+\/api\/local-session\?code=/);
    expect(handle.sessionBootstrapUrl).not.toContain("127.0.0.1");
    expect(handle.sessionBootstrapUrl).not.toContain("secret-local-token");
    expect(handle.sessionBootstrapUrls).toContain(handle.sessionBootstrapUrl);
  });

  it("can be closed more than once without closing the runtime twice", async () => {
    const handle = await startTestServer(loopbackConfig());
    handles.splice(handles.indexOf(handle), 1);

    await expect(handle.close()).resolves.toBeUndefined();
    await expect(handle.close()).resolves.toBeUndefined();
  });
});

function loopbackConfig(): ResolvedLocalRuntimeConfig {
  return configWithPortZero(resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} }));
}

function authRequiredConfig(): ResolvedLocalRuntimeConfig {
  return configWithPortZero(
    resolveLocalRuntimeConfig({
      cwd: tempDir(),
      env: {
        CESTUS_LOCAL_BIND: "tailnet",
        CESTUS_LOCAL_HOST: "127.0.0.1",
        CESTUS_LOCAL_AUTH_TOKEN: "secret-local-token"
      }
    })
  );
}

function authRequiredWildcardLanConfig(): ResolvedLocalRuntimeConfig {
  return configWithPortZero(
    resolveLocalRuntimeConfig({
      cwd: tempDir(),
      env: {
        CESTUS_LOCAL_BIND: "lan",
        CESTUS_LOCAL_AUTH_TOKEN: "secret-local-token"
      }
    })
  );
}

function configWithPortZero(config: ResolvedLocalRuntimeConfig): ResolvedLocalRuntimeConfig {
  const distDir = join(config.cwd, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<main>Cestus</main>");
  return {
    ...config,
    http: {
      ...config.http,
      port: 0
    },
    staticUi: {
      distDir
    }
  };
}

async function startTestServer(config: ResolvedLocalRuntimeConfig): Promise<LocalRuntimeServerHandle> {
  const handle = await startLocalRuntimeServer({ config });
  handles.push(handle);
  return handle;
}

function serverPort(handle: LocalRuntimeServerHandle): number {
  const address = handle.server.address();
  if (typeof address === "string" || address === null) {
    throw new Error("Test server did not expose a TCP address");
  }
  return (address as AddressInfo).port;
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cestus-local-server-"));
  tempDirs.push(dir);
  return dir;
}

function cookieHeaderFromSetCookie(setCookie: string): string {
  return setCookie.split(";")[0] ?? "";
}

function fakeLanInterfaces(address: string): NodeJS.Dict<NetworkInterfaceInfo[]> {
  return {
    eth0: [
      {
        address,
        netmask: "255.255.255.0",
        family: "IPv4",
        mac: "00:00:00:00:00:00",
        internal: false,
        cidr: `${address}/24`
      }
    ]
  };
}

function responseFrom(request: ReturnType<typeof httpRequest>): Promise<{
  readonly statusCode: number | undefined;
  readonly body: string;
}> {
  return new Promise((resolve) => {
    request.on("response", (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
  });
}

async function within<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), ms);
      })
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
