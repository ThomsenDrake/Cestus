export function ingestionMediaTypeForPath(sourcePath: string): string {
  const lowerPath = sourcePath.toLowerCase();

  if (lowerPath.endsWith(".json")) {
    return "application/json";
  }
  if (lowerPath.endsWith(".md") || lowerPath.endsWith(".markdown")) {
    return "text/markdown";
  }
  if (lowerPath.endsWith(".yaml") || lowerPath.endsWith(".yml")) {
    return "application/yaml";
  }
  if (lowerPath.endsWith(".csv")) {
    return "text/csv";
  }
  if (lowerPath.endsWith(".txt")) {
    return "text/plain";
  }
  if (lowerPath.endsWith(".html") || lowerPath.endsWith(".htm")) {
    return "text/html";
  }
  if (lowerPath.endsWith(".pdf")) {
    return "application/pdf";
  }

  return "application/octet-stream";
}
