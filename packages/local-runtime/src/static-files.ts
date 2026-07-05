import { readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";

export interface StaticFileResponse {
  readonly status: number;
  readonly contentType: string;
  readonly body: Buffer;
}

export function readStaticUiFile(distDir: string, requestPath: string): StaticFileResponse {
  const root = resolve(distDir);
  const pathname = pathnameFromRequestPath(requestPath);
  if (pathname === undefined) {
    return notFound();
  }

  const relativePath = pathname === "/" ? "index.html" : safeDecode(pathname.slice(1));
  if (relativePath === undefined || relativePath.length === 0) {
    return notFound();
  }

  const filePath = resolve(root, relativePath);
  const rootRelativePath = relative(root, filePath);
  if (
    rootRelativePath.length === 0 ||
    rootRelativePath.startsWith("..") ||
    isAbsolute(rootRelativePath)
  ) {
    return notFound();
  }

  try {
    if (!statSync(filePath).isFile()) {
      return notFound();
    }

    return {
      status: 200,
      contentType: contentTypeFor(filePath),
      body: readFileSync(filePath)
    };
  } catch {
    return notFound();
  }
}

function pathnameFromRequestPath(requestPath: string): string | undefined {
  try {
    return new URL(requestPath, "http://cestus.local").pathname;
  } catch {
    return undefined;
  }
}

function safeDecode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function contentTypeFor(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

function notFound(): StaticFileResponse {
  return {
    status: 404,
    contentType: "text/plain; charset=utf-8",
    body: Buffer.from("Not found")
  };
}
