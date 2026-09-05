import type { ActorRef } from "../../ontology/src/contracts.js";
import type { DocumentProcessingService } from "./document-processing.js";
import type { LocalRuntimeRequest, LocalRuntimeResponse } from "./http-handler.js";

export async function handleDocumentProcessingHttpRoute(request: LocalRuntimeRequest, service: DocumentProcessingService | undefined, actor: ActorRef): Promise<LocalRuntimeResponse> {
  const path = new URL(request.url, "http://localhost").pathname;
  if (!service) return json(503, { ok: false, message: "A current portable workspace is required for document processing." });
  try {
    if (request.method === "GET" && path === "/api/document-processing/readiness") return json(200, service.readiness());
    if (request.method === "GET" && path === "/api/document-processing/jobs") return json(200, { jobs: await service.list(actor) });
    const jobRoute = /^\/api\/document-processing\/jobs\/(inv_[A-Za-z0-9_-]+)(?:\/(run|cancel|output|preview))?$/.exec(path);
    if (jobRoute) {
      const id = jobRoute[1]!;
      if (request.method === "POST" && jobRoute[2] === "run") return json(200, await service.run(id, actor));
      if (request.method === "POST" && jobRoute[2] === "cancel") return json(200, await service.cancel(id, actor));
      if (request.method === "GET" && jobRoute[2] === "output") return json(200, await service.output(id, actor));
      if (request.method === "GET" && jobRoute[2] === "preview") return json(200, await service.previewDetails(id, actor));
      if (request.method === "GET" && !jobRoute[2]) return json(200, await service.get(id, actor));
    }
    if (request.method === "POST" && path === "/api/document-processing/preview") return json(200, await service.preview(JSON.parse(request.body ?? "{}"), actor));
    if (request.method === "POST" && path === "/api/document-processing/approve") {
      const body = JSON.parse(request.body ?? "{}");
      if (!body || Object.keys(body).some(key => key !== "manifestHash") || typeof body.manifestHash !== "string") throw new Error("Invalid approval");
      return json(200, await service.approve(body, actor));
    }
    return json(404, { ok: false, message: "Document processing route unavailable." });
  } catch {
    return json(409, { ok: false, message: "Processing action blocked. Check provider configuration, public_safe human review, exact selection and budget. Changed or unapproved selections require a new preview. Refresh jobs before retrying an interrupted request." });
  }
}
function json(status: number, body: unknown): LocalRuntimeResponse {
  return { status, headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) };
}
