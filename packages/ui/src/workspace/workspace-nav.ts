export interface WorkspaceModule {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly preview: boolean;
}

export const workspaceModules: readonly WorkspaceModule[] = Object.freeze([
  { id: "command", label: "Command", href: "#command", preview: false },
  { id: "requests", label: "Requests", href: "#requests", preview: false },
  { id: "evidence", label: "Evidence", href: "#evidence", preview: false },
  { id: "ontology", label: "Ontology", href: "#ontology", preview: false },
  { id: "agents", label: "Agent", href: "#agents", preview: false },
  { id: "ingestion", label: "Ingestion", href: "#ingestion", preview: false },
  { id: "settings", label: "Settings", href: "#settings", preview: true }
]);
