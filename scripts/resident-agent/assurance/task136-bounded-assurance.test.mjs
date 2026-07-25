import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import * as assurance from "./task136-bounded-assurance.mjs";

const {
  loadContract,
  runAbiCorpus,
  runCompositionCorpus,
  verifyCommandCards,
  verifyStaticGraph
} = assurance;

const scriptPath = fileURLToPath(new URL("./task136-bounded-assurance.mjs", import.meta.url));
const releaseSchemaVersion = "task136-dispatch-release.v4";
const v1ContractPath = "docs/agentic/contracts/task136-bounded-assurance-v1.json";
const v2ContractPath = "docs/agentic/contracts/task136-bounded-assurance-v2.json";
const v3ContractPath = "docs/agentic/contracts/task136-bounded-assurance-v3.json";
const v4ContractPath = "docs/agentic/contracts/task136-bounded-assurance-v4.json";
const registryPath = "docs/agentic/resident-agent-full-vision-program-registry.md";
const task136V4ClaimPath = "docs/agentic/claims/task-136-v4-task137b-authority-transfer.md";
const v1ContractSha256 = "d33864d9964a355067b7be86c78951d3df184a80b80765da3f51aab66e903fed";
const v2ContractSha256 = "c23a390cc3e4a3395c018a8532e0fa84b23a880782805f7cbcc463d9e8162ba4";
const v3ContractSha256 = "8934dbaf8246d295eba5ce825169ac08bb98f0e1b6b75a977657000cb46a1bbb";
const v4ContractSha256 = "3a6e963cf76c94dbe791cd6562d3baef31c27310d141493819e5958c1076d438";
const v4AssuranceFingerprint = "da850dfd3068efda96b96e9a274777e3b97e2922017c16be8ea703b09e7cd1ec";
const historicalTask137ASha256 = "ac3ac479d5b1e41db4ae15cea88b746f86bbc31f6af3ea74a6120834dc2c2198";
const historicalTask129MfaSha256 = "23cb98725d67ada15c0e2913816f82407c171912564423e669cf73995aaead76";
const historicalTask135bSha256 = "73d8e28bdc56dbecf924a45a14c4caf8bb0864c89a4db98e1114f62f83d53409";
const historicalTask137bSha256 = "833ca5cc5aa191fdf9f98c692255133afaaf73b541b36275cab7ed04ef601e29";
const task137aToTask129MfaPaths = [
  "packages/local-runtime/src/mounted-artifact-authority-operation.ts",
  "packages/local-runtime/test/mounted-artifact-authority-operation.test.ts",
  "packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts",
  "packages/local-runtime/test/support/task137-authority-boundary-policy.ts"
];
const task137aToTask137bPaths = [
  "packages/local-runtime/src/portable-workspace-lifecycle.ts",
  "packages/local-runtime/test/portable-workspace-lifecycle.test.ts"
];
const transferredTask129MfaPaths = [
  "packages/ontology/src/contracts.ts",
  "packages/local-runtime/src/mounted-artifact-authority-operation.ts",
  "packages/local-runtime/test/mounted-artifact-authority-operation.test.ts",
  "packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts",
  "packages/local-runtime/test/support/task137-authority-boundary-policy.ts"
];
const task137bOwnedPaths = [
  "packages/local-runtime/src/portable-workspace-lifecycle.ts",
  "packages/local-runtime/test/portable-workspace-lifecycle.test.ts",
  "packages/local-runtime/src/mounted-artifact-authority-operation.ts",
  "packages/local-runtime/test/mounted-artifact-authority-operation.test.ts",
  "packages/local-runtime/src/wake-supervisor-runtime.ts",
  "packages/local-runtime/src/mounted-wake-lifecycle-store.ts",
  "packages/local-runtime/test/wake-supervisor-runtime.test.ts",
  "packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts",
  "packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts",
  "packages/local-runtime/test/support/task137-authority-boundary-policy.ts",
  "packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts",
  "packages/ontology/src/contracts.ts",
  "packages/ontology/test/resident-wake-contracts.test.ts",
  "docs/agentic/claims/task-137-resident-full-vision-w2-wake-supervisor-runtime.md"
];
const task137bToCf1Paths = ["packages/ontology/src/contracts.ts"];
const task137bToTask139PmPaths = [
  "packages/local-runtime/src/mounted-artifact-authority-operation.ts",
  "packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts",
  "packages/local-runtime/test/support/task137-authority-boundary-policy.ts"
];
const task139PmOwnedPaths = [
  "packages/local-runtime/src/mounted-provider-authority.ts",
  "packages/local-runtime/test/mounted-provider-authority.test.ts",
  "docs/agentic/claims/task-139-mounted-provider-authority.md",
  ...task137bToTask139PmPaths
];
const task139PmCommand = "npm test -- packages/local-runtime/test/mounted-provider-authority.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts";
const task135bToCf1Paths = [
  "packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts",
  "packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts"
];
const cf1HrToTask122Paths = [
  "packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts",
  "packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts"
];
const task122PortableStoreCommand = "npm test -- packages/agent/test/investigation-planner-workflow.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts";
const historicalCf1HrSha256 = "d55028e1bd036051f5ec2c9d496267623ff2748e54713d3881a198667ac62f12";
const historicalCf1HrBlobs = [
  "c835bc2cfc9ce3b4751a3f298c2e5d453b2b2091",
  "a1f1b04fa75d573bd3c8851a5fb4f15610109d40"
];
const cf1HrToW1BootstrapPaths = [
  "packages/agent/src/specialist-handoff-authority.ts",
  "packages/agent/test/specialist-handoff-authority.test.ts"
];
const task122ToW1BootstrapPaths = [...cf1HrToTask122Paths];
const w1BootstrapExistingPaths = [
  "packages/agent/src/ontology-bootstrap-workflow.ts",
  "packages/agent/test/ontology-bootstrap-workflow.test.ts",
  "packages/local-runtime/src/agent-ontology-bootstrap-routes.ts",
  "packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts",
  "docs/agentic/claims/task-123-resident-full-vision-bootstrap-handoff.md"
];
const w1BootstrapOwnedPaths = [
  "packages/agent/src/ontology-bootstrap-workflow.ts",
  "packages/agent/test/ontology-bootstrap-workflow.test.ts",
  ...cf1HrToW1BootstrapPaths,
  "packages/local-runtime/src/agent-ontology-bootstrap-routes.ts",
  "packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts",
  "docs/agentic/claims/task-123-resident-full-vision-bootstrap-handoff.md",
  ...task122ToW1BootstrapPaths
];
const w1BootstrapCommand = "npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/agent/test/specialist-handoff-authority.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts";
const historicalTask122Sha256 = "729d23c6c84c6ea33567a4b669c9ad960e830cf601a0d9ec5638308d3a360c0c";
const historicalCf1HrAuthorityBlobs = [
  "81d2df45b2c74f118bea22fdce23a5fd698ddbd0",
  "309d26e487e200f7a430b261910e4f6ef11b19a1"
];
const historicalTask122PortableBlobs = [
  "aa5859e0d2c8146812673777436e9e284f1c3373",
  "148c7a4c5af83371f579b808a2970f6a8609394e"
];
const task129MfaToCf1Paths = ["packages/ontology/test/agent-contracts.test.ts"];
const correctedCf1HrPaths = [
  "packages/agent/src/specialist-runner-kernel.ts",
  "packages/agent/test/specialist-runner-kernel.test.ts",
  "packages/agent/src/specialist-handoff-projection.ts",
  "packages/agent/test/specialist-handoff-projection.test.ts",
  "packages/agent/src/specialist-handoff-manifest.ts",
  "packages/agent/test/specialist-handoff-manifest.test.ts",
  "packages/agent/src/specialist-handoff-authority.ts",
  "packages/agent/test/specialist-handoff-authority.test.ts",
  "packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts",
  "packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts",
  "packages/ontology/src/contracts.ts",
  "packages/ontology/test/agent-contracts.test.ts",
  "packages/ontology/test/agent-resident-loop-contracts.test.ts",
  "docs/agentic/claims/cf1-h-task136-complete-handoff-readback-projection.md"
];
const correctedCf1HrCommand = "npm test -- packages/agent/test/specialist-runner-kernel.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/agent/test/specialist-handoff-manifest.test.ts packages/agent/test/specialist-handoff-authority.test.ts packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts packages/ontology/test/agent-contracts.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts";
const correctedG136ScPaths = [
  "packages/agent/src/tool-gateway.ts",
  "packages/agent/src/scheduler.ts",
  "packages/agent/src/resident-loop-scheduler-completion.ts",
  "packages/agent/src/execution-loop.ts",
  "packages/agent/test/tool-gateway.test.ts",
  "packages/agent/test/scheduler.test.ts",
  "packages/agent/test/resident-loop-scheduler-completion.test.ts",
  "packages/agent/test/execution-loop.test.ts",
  "packages/agent/test/domain-execution-dispatcher.test.ts",
  "docs/agentic/claims/task-136-scheduler-completion-adapter.md",
  "packages/agent/test/resident-loop-scheduler-completion-imports.test.ts"
];
const correctedG136ScCommand = "npm test -- packages/agent/test/tool-gateway.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/resident-loop-scheduler-completion.test.ts packages/agent/test/execution-loop.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts";
const task136OwnedPaths = [
  "packages/agent/src/bounded-agent-loop.ts",
  "packages/agent/test/bounded-agent-loop.test.ts",
  "packages/agent/src/plan-observation-contracts.ts",
  "packages/agent/src/plan-observation-projection.ts",
  "packages/agent/test/plan-observation-contracts.test.ts",
  "packages/agent/test/plan-observation-projection.test.ts",
  "packages/agent/src/resident-plan-candidate-provider.ts",
  "packages/agent/test/resident-plan-candidate-provider.test.ts",
  "packages/agent/src/adapters/legacy-staging.ts",
  "packages/agent/test/legacy-staging-adapter.test.ts",
  "packages/agent/src/resident-loop-tool-gateway.ts",
  "packages/agent/test/resident-loop-tool-gateway.test.ts",
  "packages/agent/test/resident-loop-scheduler-completion-imports.test.ts",
  "packages/local-runtime/src/wake-supervisor-runtime.ts",
  "packages/local-runtime/src/mounted-wake-lifecycle-store.ts",
  "packages/local-runtime/test/wake-supervisor-runtime.test.ts",
  "packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts",
  "packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts",
  "packages/agent/src/specialist-handoff-projection.ts",
  "packages/agent/test/specialist-handoff-projection.test.ts",
  "packages/ontology/src/contracts.ts",
  "packages/ontology/test/agent-resident-loop-contracts.test.ts",
  "packages/local-runtime/src/resident-loop-factory-ports.ts",
  "packages/local-runtime/test/resident-loop-factory-ports.test.ts",
  "packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts",
  "packages/agent/src/domain-execution-dispatcher.ts",
  "packages/agent/test/domain-execution-dispatcher.test.ts",
  "packages/agent/src/task-orchestrator.ts",
  "packages/agent/test/task-orchestrator-claims.test.ts",
  "packages/agent/src/task-orchestrator-projection.ts",
  "packages/agent/test/task-orchestrator-projection.test.ts",
  "docs/agentic/claims/task-136-resident-full-vision-bounded-loop.md"
];
const task136SeventeenTestCommand = "npm test -- packages/agent/test/bounded-agent-loop.test.ts packages/agent/test/plan-observation-contracts.test.ts packages/agent/test/plan-observation-projection.test.ts packages/agent/test/resident-plan-candidate-provider.test.ts packages/agent/test/legacy-staging-adapter.test.ts packages/agent/test/resident-loop-tool-gateway.test.ts packages/agent/test/resident-loop-scheduler-completion-imports.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/agent/test/specialist-handoff-projection.test.ts packages/ontology/test/agent-resident-loop-contracts.test.ts packages/local-runtime/test/resident-loop-factory-ports.test.ts packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts packages/agent/test/domain-execution-dispatcher.test.ts packages/agent/test/task-orchestrator-claims.test.ts packages/agent/test/task-orchestrator-projection.test.ts";
const exactTask136HistoricalPathDispositions = [
  [
    "Task137A",
    [
      ["packages/local-runtime/src/portable-workspace-lifecycle.ts", "owned"],
      ["packages/local-runtime/test/portable-workspace-lifecycle.test.ts", "owned"]
    ]
  ],
  [
    "Task129-MFA",
    [
      ["packages/ontology/src/contracts.ts", "owned"],
      ["packages/local-runtime/src/mounted-artifact-authority-operation.ts", "owned"],
      ["packages/local-runtime/test/mounted-artifact-authority-operation.test.ts", "owned"],
      ["packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts", "owned"],
      ["packages/local-runtime/test/support/task137-authority-boundary-policy.ts", "owned"],
      ["packages/ontology/test/agent-contracts.test.ts", "owned"]
    ]
  ],
  [
    "Task135B",
    [
      ["packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts", "owned"],
      ["packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts", "owned"]
    ]
  ],
  [
    "T120-R",
    [
      ["packages/agent/src/plan-observation-contracts.ts", "owned"],
      ["packages/agent/src/plan-observation-projection.ts", "owned"],
      ["packages/agent/test/plan-observation-contracts.test.ts", "owned"],
      ["packages/agent/test/plan-observation-projection.test.ts", "owned"]
    ]
  ],
  [
    "Task137B-W",
    [
      ["packages/ontology/src/contracts.ts", "owned"],
      ["packages/local-runtime/src/mounted-artifact-authority-operation.ts", "owned"],
      ["packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts", "owned"],
      ["packages/local-runtime/test/support/task137-authority-boundary-policy.ts", "owned"],
      ["packages/local-runtime/src/wake-supervisor-runtime.ts", "owned"],
      ["packages/local-runtime/src/mounted-wake-lifecycle-store.ts", "owned"],
      ["packages/local-runtime/test/wake-supervisor-runtime.test.ts", "owned"],
      ["packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts", "owned"],
      ["packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts", "owned"]
    ]
  ],
  [
    "CF1-HR",
    [
      ["packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts", "owned"],
      ["packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts", "owned"],
      ["packages/agent/src/specialist-handoff-authority.ts", "owned"],
      ["packages/agent/test/specialist-handoff-authority.test.ts", "owned"],
      ["packages/agent/src/specialist-handoff-projection.ts", "owned"],
      ["packages/agent/test/specialist-handoff-projection.test.ts", "owned"],
      ["packages/ontology/src/contracts.ts", "owned"],
      ["packages/ontology/test/agent-resident-loop-contracts.test.ts", "owned"]
    ]
  ],
  [
    "Task136-FC-Ports",
    [
      ["packages/local-runtime/src/resident-loop-factory-ports.ts", "owned"],
      ["packages/local-runtime/test/resident-loop-factory-ports.test.ts", "owned"],
      ["packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts", "owned"]
    ]
  ],
  [
    "G136-SC",
    [["packages/agent/test/domain-execution-dispatcher.test.ts", "owned"]]
  ],
  [
    "G136-R",
    [
      ["packages/agent/src/resident-loop-tool-gateway.ts", "owned"],
      ["packages/agent/test/resident-loop-tool-gateway.test.ts", "owned"],
      ["packages/agent/test/resident-loop-scheduler-completion-imports.test.ts", "owned"]
    ]
  ],
  [
    "C136-P",
    [
      ["packages/agent/src/resident-plan-candidate-provider.ts", "owned"],
      ["packages/agent/test/resident-plan-candidate-provider.test.ts", "owned"]
    ]
  ],
  [
    "Task122",
    [
      ["packages/local-runtime/src/portable-mounted-agent-artifact-stores.ts", "owned"],
      ["packages/local-runtime/test/portable-mounted-agent-artifact-stores.test.ts", "owned"]
    ]
  ]
];
const exactRawPrefixPins1Through28 = [
  ["Task126", "1b1fc2171278866b38f6aa96889b822f22ab2abd34f460b304fe7fc2c3a0b58d"],
  ["Task127", "18199ad9bfdcf3582ad13f6637bfbcc72949f1407271fa6c325612abcd226951"],
  ["Task128", "fe29c10c5dbe3d8c1596f20db7b95b62df8dd98d379ade09d2ed85822ce51d92"],
  ["Task135D", "749f6a7ec9f66fd8228426e07e3d5b9dbc1a6f0e57d7a804ad69515f48ffc9f9"],
  ["Task137A", "5a3b2f9a897b5d458742df7a3d403f0e3fe6e3459aba75e93d825d385ec4be32"],
  ["Task129-MFA", "64048b14448b66f224d254753a7ecbd210e1654602759248e5de89663295f017"],
  ["Task129", "987b4b18667508b7e4bd500be50b121d41b019bb011da8ae64ef4996ce62e01e"],
  ["Task130", "16328e8381eb9a55f7a8c3f3f155a4c40d44f4c0da1abe745c850193522171d8"],
  ["Task135B", "5fffad565a1523aecb0a0afd280b8b9936fc2a48dbe1c0b268f946634732e9e0"],
  ["T120-R", "f220cb62ab803c938e4e97c538f55e24628bbf46d6e06060cb0169c1adbf2cdb"],
  ["Task137B-W", "26f33ac286836459e723edd5ad2d4e34202bccd3f1a92e5533be30e7d881c9b7"],
  ["W1-123-H-SHARED-SCHEMA", "9bb5838f7782eaeb327280040a514119f8c0ba1fd76dee6268ead6013ac8f292"],
  ["W1-133.5-PREAPPROVAL-PROMPT-STORE", "119f9aea548038d600edadbca60e2bb8f92f08aacdaf081c0f6dadc928438070"],
  ["CF1-HR", "8491645c21cdd6ca54e5701318a0f9febb794c5fc1f032beaca05c8acd960351"],
  ["Task126-R", "f27c06337227fcc4584d199a804226276cb1d63eca0dfbca410490324a11ef3f"],
  ["Task133", "3abba468fd3fe80a3b1f1e08367ddbd8fb3b30884f08876c911deed774fe1bd4"],
  ["Task139-P1", "9b268556a169bf270e0995d2b50ab137c65fe9341e91ddbcd9454c087279218d"],
  ["Task139-PM", "134a3ff59bfb24b9bb1e5988580e85e931aa37eb098a77fe37ce05e9d217c80e"],
  ["Task136-FC-Core", "5e78c42b3753cd3ce086ab45862479f2e5569fdaae1fc683528a67101630b920"],
  ["Task139-P2", "7428d8f4ddd3e7784b73068002b42d3af09f085e44906b6869c8826bf00d682b"],
  ["Task136-FC-Ports", "831ef45fc0d1552b0086590418a3b31aa45515ccf1a0b80a9370484f4fc144f7"],
  ["G136-SC", "1576cf80cb9cc2184a12f60db44abda79e7d3b0f375f10310b1e88fe28812574"],
  ["G136-R", "2a5833071698f58716feff1bf3b0ca53b5b14e715421b1df8519884975c3d912"],
  ["C136-P", "55bb88a30a323c616a103df04151b04f5852e91681794f79394e976671cee480"],
  ["Task121", "26f0509d73393012d8c4cb93c0453e8ac7676b466133fb0031983f70fe3cd405"],
  ["Task122", "b607b582e227f558d1340b3b9f098f90e356db9f343109ec6a4e37276624171a"],
  ["W1-123-BOOTSTRAP-HANDOFF", "a8ed548c473fca9e7f4016a001032d151c204be2347db43d1ff77b386fd5cd9d"],
  ["Task138-H", "186ebee9d0364a6a6f93fb1d6adcb80970c63a49352a1c26b598c0323a444fc8"]
];
const rawPrefixPins = new Map(exactRawPrefixPins1Through28);
const task136BaselineFixtureBlobs = [
  ...[
    [
      "packages/agent/src/adapters/legacy-staging.ts",
      "99fbafda3844435109bc249b015b111b9258c210"
    ],
    [
      "packages/agent/test/legacy-staging-adapter.test.ts",
      "de7cef3123a15fb82891943dc51005165c8c9fcd"
    ]
  ].map(([path, blobSha]) => ({
    candidateSha: "c244106459ca050a5f8b61a00755abf184721956",
    integrationSha: "dc05c43c4b9a592d0396acd034bfc32e177fd09a",
    path,
    blobSha
  })),
  {
    candidateSha: "70814c1259871c5458a3578fae8a5c8281540377",
    integrationSha: "253150b2ab5f2271d2b04a5b8fc5b82b7bf757a5",
    path: "packages/agent/src/domain-execution-dispatcher.ts",
    blobSha: "96b0ade273696b9ffcf497119f1943f128821a58"
  },
  ...[
    [
      "packages/agent/src/task-orchestrator.ts",
      "72b11352c8a3c79237404257d676c1ef27fef5db"
    ],
    [
      "packages/agent/test/task-orchestrator-claims.test.ts",
      "12d68f0b407f8b6f867a232c496b63b064e489bb"
    ],
    [
      "packages/agent/src/task-orchestrator-projection.ts",
      "e4656da434f0ba48d670be085ba503dd7c51588b"
    ],
    [
      "packages/agent/test/task-orchestrator-projection.test.ts",
      "6e9062b5c8e1a679612cf09dcb664dfe3bbeb9e7"
    ]
  ].map(([path, blobSha]) => ({
    candidateSha: "bd3b8ed3e287a6a598dfb246524e36ca2a345438",
    integrationSha: "75de81f110b4f405f9ec064104bc2c2b4f79e223",
    path,
    blobSha
  }))
];
const task136TransferPathsBySource = [
  [
    "T120-R",
    [
      "packages/agent/src/plan-observation-contracts.ts",
      "packages/agent/src/plan-observation-projection.ts",
      "packages/agent/test/plan-observation-contracts.test.ts",
      "packages/agent/test/plan-observation-projection.test.ts"
    ]
  ],
  [
    "C136-P",
    [
      "packages/agent/src/resident-plan-candidate-provider.ts",
      "packages/agent/test/resident-plan-candidate-provider.test.ts"
    ]
  ],
  ["G136-SC", ["packages/agent/test/domain-execution-dispatcher.test.ts"]],
  [
    "G136-R",
    [
      "packages/agent/src/resident-loop-tool-gateway.ts",
      "packages/agent/test/resident-loop-tool-gateway.test.ts",
      "packages/agent/test/resident-loop-scheduler-completion-imports.test.ts"
    ]
  ],
  [
    "Task137B-W",
    [
      "packages/local-runtime/src/wake-supervisor-runtime.ts",
      "packages/local-runtime/src/mounted-wake-lifecycle-store.ts",
      "packages/local-runtime/test/wake-supervisor-runtime.test.ts",
      "packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts",
      "packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts"
    ]
  ],
  [
    "CF1-HR",
    [
      "packages/agent/src/specialist-handoff-projection.ts",
      "packages/agent/test/specialist-handoff-projection.test.ts",
      "packages/ontology/src/contracts.ts",
      "packages/ontology/test/agent-resident-loop-contracts.test.ts"
    ]
  ],
  [
    "Task136-FC-Ports",
    [
      "packages/local-runtime/src/resident-loop-factory-ports.ts",
      "packages/local-runtime/test/resident-loop-factory-ports.test.ts",
      "packages/local-runtime/test/resident-loop-factory-ports-imports.test.ts"
    ]
  ]
];
const task136TransferPathMap = new Map(task136TransferPathsBySource);

function loadV4Contract() {
  return loadContract(v4ContractPath);
}

const expectedIds = [
  "Task126",
  "Task127",
  "Task128",
  "Task135D",
  "Task137A",
  "Task129-MFA",
  "Task129",
  "Task130",
  "Task135B",
  "T120-R",
  "Task137B-W",
  "W1-123-H-SHARED-SCHEMA",
  "W1-133.5-PREAPPROVAL-PROMPT-STORE",
  "CF1-HR",
  "Task126-R",
  "Task133",
  "Task139-P1",
  "Task139-PM",
  "Task136-FC-Core",
  "Task139-P2",
  "Task136-FC-Ports",
  "G136-SC",
  "G136-R",
  "C136-P",
  "Task121",
  "Task122",
  "W1-123-BOOTSTRAP-HANDOFF",
  "Task138-H",
  "Task136"
];

test("verifies the 29-card topological graph, exact Task136 transfers, and prerequisites", () => {
  const contract = loadV4Contract();
  const result = verifyStaticGraph(contract);
  const cardsById = new Map(
    contract.releaseGraph.cards.map((card) => [card.id, card])
  );

  assert.equal(contract.schemaVersion, "task136-bounded-assurance.v4");
  assert.equal(contract.releaseGraph.version, "task136-release-graph.v4");
  assert.equal(result.records, 29);
  assert.deepEqual(result.ids, expectedIds);
  assert.deepEqual(
    Object.fromEntries(
      [
        "T120-R",
        "C136-P",
        "G136-SC",
        "G136-R",
        "Task137B-W",
        "CF1-HR",
        "Task136-FC-Ports"
      ].map((id) => [id, cardsById.get(id)?.transferToIds])
    ),
    {
      "T120-R": ["Task136"],
      "C136-P": ["Task136"],
      "G136-SC": ["G136-R", "Task136"],
      "G136-R": ["Task136"],
      "Task137B-W": ["CF1-HR", "Task139-PM", "Task136"],
      "CF1-HR": ["Task122", "W1-123-BOOTSTRAP-HANDOFF", "Task136"],
      "Task136-FC-Ports": ["Task136"]
    }
  );
  assert.deepEqual(cardsById.get("Task136")?.prerequisiteIds, [
    "T120-R",
    "Task136-FC-Ports",
    "Task139-P2",
    "C136-P",
    "G136-R",
    "Task137B-W",
    "Task138-H",
    "CF1-HR",
    "G136-SC"
  ]);
  assert.equal(
    result.commands.get("Task129-MFA"),
    "npm test -- packages/agent/test/official-flow-feasibility.test.ts packages/ontology/test/agent-contracts.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/mounted-official-flow-feasibility.test.ts"
  );
});

test("requires corrected producer ownership and exact Task136 scope and command", () => {
  const contract = loadV4Contract();
  const cf1Hr = contract.releaseGraph.cards.find((card) => card.id === "CF1-HR");
  const g136Sc = contract.releaseGraph.cards.find((card) => card.id === "G136-SC");
  const task135b = contract.releaseGraph.cards.find((card) => card.id === "Task135B");
  const task129Mfa = contract.releaseGraph.cards.find((card) => card.id === "Task129-MFA");
  const task137b = contract.releaseGraph.cards.find((card) => card.id === "Task137B-W");

  assert.deepEqual(cf1Hr.prerequisiteIds, [
    "W1-123-H-SHARED-SCHEMA",
    "W1-133.5-PREAPPROVAL-PROMPT-STORE",
    "Task137B-W",
    "Task135B",
    "Task129-MFA"
  ]);
  assert.deepEqual(cf1Hr.ownedPaths, correctedCf1HrPaths.map((path) => ({
    disposition: [
      ...cf1HrToTask122Paths,
      ...cf1HrToW1BootstrapPaths,
      ...task136TransferPathMap.get("CF1-HR")
    ].includes(path) ? "transferred" : "owned",
    path
  })));
  assert.equal(cf1Hr.command, correctedCf1HrCommand);
  assert.deepEqual(g136Sc.ownedPaths, correctedG136ScPaths.map((path) => ({
    disposition: [
      correctedG136ScPaths[correctedG136ScPaths.length - 1],
      ...task136TransferPathMap.get("G136-SC")
    ].includes(path) ? "transferred" : "owned",
    path
  })));
  assert.equal(g136Sc.command, correctedG136ScCommand);
  for (const [cardId, transferredPaths] of task136TransferPathsBySource) {
    const source = contract.releaseGraph.cards.find((card) => card.id === cardId);
    assert.deepEqual(
      source.ownedPaths.filter(({ path }) => transferredPaths.includes(path)),
      transferredPaths.map((path) => ({ disposition: "transferred", path })),
      `${cardId} exact Task136 transfer paths`
    );
  }
  assert.deepEqual(task135b.transferToIds, ["CF1-HR"]);
  assert.deepEqual(
    task135b.ownedPaths.filter((ownedPath) => task135bToCf1Paths.includes(ownedPath.path)),
    task135bToCf1Paths.map((path) => ({ disposition: "transferred", path }))
  );
  assert.deepEqual(task129Mfa.transferToIds, ["Task137B-W", "CF1-HR"]);
  assert.deepEqual(
    task129Mfa.ownedPaths.filter((ownedPath) => task129MfaToCf1Paths.includes(ownedPath.path)),
    task129MfaToCf1Paths.map((path) => ({ disposition: "transferred", path }))
  );
  assert.deepEqual(contract.releaseCompatibility.historicalRecords.slice(1, 3), [
    {
      cardId: "Task129-MFA",
      canonicalJsonSha256: historicalTask129MfaSha256,
      pathDispositions: [...transferredTask129MfaPaths, ...task129MfaToCf1Paths]
        .map((path) => ({ path, recordDisposition: "owned" }))
    },
    {
      cardId: "Task135B",
      canonicalJsonSha256: historicalTask135bSha256,
      pathDispositions: task135bToCf1Paths.map((path) => ({ path, recordDisposition: "owned" }))
    }
  ]);
  assert.deepEqual(contract.releaseGraph.cards.map(({ id }) => id), expectedIds);
  assert.equal(createHash("sha256").update(readFileSync(v1ContractPath)).digest("hex"), v1ContractSha256);
  assert.equal(createHash("sha256").update(readFileSync(v2ContractPath)).digest("hex"), v2ContractSha256);
  assert.equal(createHash("sha256").update(readFileSync(v3ContractPath)).digest("hex"), v3ContractSha256);
  const task136 = contract.releaseGraph.cards.find((card) => card.id === "Task136");
  assert.deepEqual(
    task136?.ownedPaths,
    task136OwnedPaths.map((path) => ({ disposition: "owned", path }))
  );
  assert.equal(task136?.command, task136SeventeenTestCommand);

  const cardMutants = [
    {
      id: "CF1-HR missing path",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "CF1-HR").ownedPaths.pop();
      }
    },
    {
      id: "CF1-HR extra path",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "CF1-HR").ownedPaths.unshift({
          disposition: "owned",
          path: "packages/agent/src/extra.ts"
        });
      }
    },
    {
      id: "CF1-HR reordered path",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "CF1-HR").ownedPaths.reverse();
      }
    },
    {
      id: "G136-SC wrong disposition",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "G136-SC").ownedPaths[0].disposition = "transferred";
      }
    },
    {
      id: "G136-SC command omitted path",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "G136-SC").command =
          "npm test -- packages/agent/test/tool-gateway.test.ts packages/agent/test/scheduler.test.ts packages/agent/test/resident-loop-scheduler-completion.test.ts packages/agent/test/execution-loop.test.ts packages/agent/test/domain-execution-dispatcher.test.ts";
      }
    },
    {
      id: "Task137B-W contracts disposition",
      mutate(mutant) {
        mutant.releaseGraph.cards
          .find((card) => card.id === "Task137B-W")
          .ownedPaths.find((ownedPath) => ownedPath.path === task137bToCf1Paths[0]).disposition = "owned";
      }
    },
    {
      id: "Task137B-W transfer target",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task137B-W").transferToIds = ["G136-R"];
      }
    },
    {
      id: "Task137B-W historical compatibility hash",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords
          .find((record) => record.cardId === "Task137B-W")
          .canonicalJsonSha256 = "0".repeat(64);
      }
    },
    {
      id: "Task135B transfer target",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task135B").transferToIds = ["Task137B-W"];
      }
    },
    {
      id: "Task129-MFA CF1 path disposition",
      mutate(mutant) {
        mutant.releaseGraph.cards
          .find((card) => card.id === "Task129-MFA")
          .ownedPaths.find((ownedPath) => ownedPath.path === task129MfaToCf1Paths[0]).disposition = "owned";
      }
    }
  ];
  for (const testCase of cardMutants) {
    const mutant = clone(contract);
    testCase.mutate(mutant);
    assert.throws(() => verifyStaticGraph(mutant), undefined, testCase.id);
  }
});

test("requires frozen v4 compatibility branches and all 28 raw prefix pins", () => {
  const contract = loadV4Contract();
  const v1 = JSON.parse(readFileSync(v1ContractPath, "utf8"));
  const v2 = JSON.parse(readFileSync(v2ContractPath, "utf8"));
  const v3 = JSON.parse(readFileSync(v3ContractPath, "utf8"));
  const task137A = contract.releaseGraph.cards.find((card) => card.id === "Task137A");
  const task129Mfa = contract.releaseGraph.cards.find((card) => card.id === "Task129-MFA");
  const task135b = contract.releaseGraph.cards.find((card) => card.id === "Task135B");
  const task137b = contract.releaseGraph.cards.find((card) => card.id === "Task137B-W");

  assert.equal(contract.schemaVersion, "task136-bounded-assurance.v4");
  assert.equal(contract.releaseGraph.version, "task136-release-graph.v4");
  assert.equal(contract.releaseCompatibility.version, "task136-release-compatibility.v2");
  assert.deepEqual(
    contract.releaseCompatibility.historicalRecords.map(
      ({ cardId, canonicalJsonSha256 }) => [cardId, canonicalJsonSha256]
    ),
    [
      ["Task137A", "ac3ac479d5b1e41db4ae15cea88b746f86bbc31f6af3ea74a6120834dc2c2198"],
      ["Task129-MFA", "23cb98725d67ada15c0e2913816f82407c171912564423e669cf73995aaead76"],
      ["Task135B", "73d8e28bdc56dbecf924a45a14c4caf8bb0864c89a4db98e1114f62f83d53409"],
      ["T120-R", "bb2e2bcdd90d1036f0e0ad16719dcc99405ec3170691f115641649dc59b56830"],
      ["Task137B-W", "833ca5cc5aa191fdf9f98c692255133afaaf73b541b36275cab7ed04ef601e29"],
      ["CF1-HR", "d55028e1bd036051f5ec2c9d496267623ff2748e54713d3881a198667ac62f12"],
      ["Task136-FC-Ports", "d860a7ea14900431a361e95604d49efa6dbf824d8ccc85a06f27fe277698bc0d"],
      ["G136-SC", "b7ec22083b3b8be5140b3a40b09dfa4e34c2e86f01fe15c3cc3453d16c77d0b0"],
      ["G136-R", "ba3fb8927ec24348f405db53cd6cf200481cb979ca6ce4cbe1216b5ce635d9b8"],
      ["C136-P", "2c8da3d4b61fb472232211be2bd8b994140e044b13fb1cc977e86a6171d4575a"],
      ["Task122", "729d23c6c84c6ea33567a4b669c9ad960e830cf601a0d9ec5638308d3a360c0c"]
    ]
  );
  assert.deepEqual(
    contract.releaseCompatibility.historicalRecords.map(
      ({ cardId, pathDispositions }) => [
        cardId,
        pathDispositions.map(({ path, recordDisposition }) => [
          path,
          recordDisposition
        ])
      ]
    ),
    exactTask136HistoricalPathDispositions
  );
  assert.deepEqual([...rawPrefixPins], exactRawPrefixPins1Through28);
  assert.deepEqual(contract.releaseCompatibility.historicalRecords.slice(0, 3), [
    {
      cardId: "Task137A",
      canonicalJsonSha256: historicalTask137ASha256,
      pathDispositions: task137aToTask137bPaths.map((path) => ({ path, recordDisposition: "owned" }))
    },
    {
      cardId: "Task129-MFA",
      canonicalJsonSha256: historicalTask129MfaSha256,
      pathDispositions: [...transferredTask129MfaPaths, ...task129MfaToCf1Paths]
        .map((path) => ({ path, recordDisposition: "owned" }))
    },
    {
      cardId: "Task135B",
      canonicalJsonSha256: historicalTask135bSha256,
      pathDispositions: task135bToCf1Paths.map((path) => ({ path, recordDisposition: "owned" }))
    }
  ]);
  assert.deepEqual(task137A.transferToIds, ["Task129-MFA", "Task137B-W"]);
  assert.deepEqual(
    task137A.ownedPaths.filter((ownedPath) => ownedPath.disposition === "transferred"),
    [
      task137aToTask137bPaths[0],
      task137aToTask129MfaPaths[0],
      task137aToTask137bPaths[1],
      ...task137aToTask129MfaPaths.slice(1)
    ].map((path) => ({ disposition: "transferred", path }))
  );
  assert.deepEqual(task129Mfa.transferToIds, ["Task137B-W", "CF1-HR"]);
  assert.deepEqual(
    task129Mfa.ownedPaths.filter((ownedPath) => transferredTask129MfaPaths.includes(ownedPath.path)),
    transferredTask129MfaPaths.map((path) => ({ disposition: "transferred", path }))
  );
  assert.deepEqual(
    task129Mfa.ownedPaths.filter((ownedPath) => task129MfaToCf1Paths.includes(ownedPath.path)),
    task129MfaToCf1Paths.map((path) => ({ disposition: "transferred", path }))
  );
  assert.deepEqual(task135b.transferToIds, ["CF1-HR"]);
  assert.deepEqual(task135b.ownedPaths.map((ownedPath) => ({
    disposition: task135bToCf1Paths.includes(ownedPath.path) ? "transferred" : "owned",
    path: ownedPath.path
  })), task135b.ownedPaths);
  assert.deepEqual(task137b.prerequisiteIds, ["Task135B", "T120-R", "Task137A", "Task129-MFA"]);
  assert.equal(
    task137b.command,
    "npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/wake-supervisor-runtime.test.ts packages/local-runtime/test/mounted-wake-lifecycle-store.test.ts packages/local-runtime/test/wake-supervisor-runtime-imports.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/ontology/test/resident-wake-contracts.test.ts"
  );
  assert.deepEqual(contract.releaseGraph.cards.map((card) => card.id), expectedIds);
  assert.deepEqual(contract.compositionGrammar, v1.compositionGrammar);
  assert.deepEqual(contract.compositionCorpus, v1.compositionCorpus);
  assert.deepEqual(contract.compositionGrammar, v2.compositionGrammar);
  assert.deepEqual(contract.compositionCorpus, v2.compositionCorpus);
  assert.deepEqual(contract.compositionGrammar, v3.compositionGrammar);
  assert.deepEqual(contract.compositionCorpus, v3.compositionCorpus);
  for (const v3Card of v3.releaseGraph.cards) {
    const v4Card = contract.releaseGraph.cards.find((card) => card.id === v3Card.id);
    if (!new Set(["Task137B-W", "CF1-HR", "Task139-PM", "G136-SC", "Task122", "W1-123-BOOTSTRAP-HANDOFF", "Task136"]).has(v3Card.id)) {
      assert.equal(v4Card.command, v3Card.command, `unchanged command: ${v3Card.id}`);
    }
  }
  assert.equal(createHash("sha256").update(readFileSync(v1ContractPath)).digest("hex"), v1ContractSha256);
  assert.equal(createHash("sha256").update(readFileSync(v2ContractPath)).digest("hex"), v2ContractSha256);
  assert.equal(createHash("sha256").update(readFileSync(v3ContractPath)).digest("hex"), v3ContractSha256);
  assert.equal(createHash("sha256").update(readFileSync(v4ContractPath)).digest("hex"), v4ContractSha256);
});

test("preserves immutable v1, v2, v3, and all 28 raw release inputs", () => {
  const v1Before = readFileSync(v1ContractPath);
  const v1 = JSON.parse(v1Before.toString("utf8"));
  const v2Before = readFileSync(v2ContractPath);
  const v2 = JSON.parse(v2Before.toString("utf8"));
  const v3Before = readFileSync(v3ContractPath);
  const v3 = JSON.parse(v3Before.toString("utf8"));

  assert.equal(createHash("sha256").update(v1Before).digest("hex"), v1ContractSha256);
  assert.equal(createHash("sha256").update(v2Before).digest("hex"), v2ContractSha256);
  assert.equal(createHash("sha256").update(v3Before).digest("hex"), v3ContractSha256);
  assert.equal(v2.schemaVersion, "task136-bounded-assurance.v2");
  assert.equal(v2.releaseGraph.version, "task136-release-graph.v2");
  assert.equal(v3.schemaVersion, "task136-bounded-assurance.v3");
  assert.equal(v3.releaseGraph.version, "task136-release-graph.v3");
  assert.deepEqual(v2.compositionGrammar, v1.compositionGrammar);
  assert.deepEqual(v2.compositionCorpus, v1.compositionCorpus);
  assert.deepEqual(v3.compositionGrammar, v1.compositionGrammar);
  assert.deepEqual(v3.compositionCorpus, v1.compositionCorpus);
  assert.deepEqual(readFileSync(v1ContractPath), v1Before);
  assert.deepEqual(readFileSync(v2ContractPath), v2Before);
  assert.deepEqual(readFileSync(v3ContractPath), v3Before);
  assert.equal(createHash("sha256").update(readFileSync(v1ContractPath)).digest("hex"), v1ContractSha256);
  assert.equal(createHash("sha256").update(readFileSync(v2ContractPath)).digest("hex"), v2ContractSha256);
  assert.equal(createHash("sha256").update(readFileSync(v3ContractPath)).digest("hex"), v3ContractSha256);
  for (const [cardId, expectedHash] of rawPrefixPins) {
    assert.equal(createHash("sha256").update(rawRecordJson(cardId)).digest("hex"), expectedHash, cardId);
  }
});

test("accepts one generated composition and rejects the frozen 20 mutations", () => {
  const result = runCompositionCorpus(loadV4Contract());

  assert.equal(result.green, 1);
  assert.equal(result.red, 20);
  assert.deepEqual(result.rejectedCategoryIds, [
    "unknown-node",
    "duplicate-node",
    "reordered-node",
    "missing-prerequisite",
    "dependency-inversion",
    "undeclared-transfer",
    "overlapping-final-owner",
    "missing-owned-path",
    "extra-owned-path",
    "wrong-path-disposition",
    "noncanonical-module-path",
    "unsupported-template",
    "unknown-import",
    "wrong-import-kind",
    "missing-export",
    "extra-export",
    "default-import",
    "namespace-import",
    "dynamic-commonjs-loader",
    "fixture-source-outside-generator"
  ]);
});

test("reports exactly 29 command cards", () => {
  const result = verifyCommandCards(loadV4Contract());

  assert.equal(result.cards, 29);
  assert.equal(
    result.commands.get("Task137A"),
    "npm test -- packages/local-runtime/test/portable-workspace-lifecycle.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts"
  );
});

test("accepts one ABI fixture and rejects the frozen 15 ABI mutations", () => {
  const result = runAbiCorpus();

  assert.equal(result.green, 1);
  assert.equal(result.red, 15);
  assert.deepEqual(result.rejectedCategoryIds, [
    "missing-loop-port",
    "narrowed-checkpoint-readback",
    "missing-mounted-authority-port",
    "public-runtime-mint",
    "caller-supplied-runtime-grant",
    "external-governed-input-mint",
    "direct-named-re-export",
    "import-then-export-alias",
    "export-star-forwarding",
    "namespace-forwarding",
    "commonjs-require-loader",
    "dynamic-import-loader",
    "module-require-loader",
    "missing-handoff-readback",
    "cached-source-context"
  ]);
});

function sha(label) {
  return createHash("sha1").update(label).digest("hex");
}

function codexThreadId(index, reviewIndex) {
  return `019f0000-0000-7000-8000-${String(index * 2 + reviewIndex + 1).padStart(12, "0")}`;
}

function recordFromRegistry(cardId) {
  return JSON.parse(rawRecordJson(cardId));
}

function rawRecordJson(cardId) {
  const registryText = readFileSync(registryPath, "utf8");
  const heading = `## Task136 dispatch release v4: ${cardId}\n`;
  const start = registryText.indexOf(heading);
  assert.notEqual(start, -1, `registry record exists: ${cardId}`);
  const jsonStart = registryText.indexOf("```json", start);
  const jsonEnd = registryText.indexOf("\n```", jsonStart);
  assert.notEqual(jsonStart, -1, `registry JSON starts: ${cardId}`);
  assert.notEqual(jsonEnd, -1, `registry JSON ends: ${cardId}`);
  return registryText.slice(jsonStart + "```json".length, jsonEnd).trim();
}

function registryPrefixRecords() {
  return expectedIds.slice(0, 17).map((cardId) => recordFromRegistry(cardId));
}

function releaseRecordsFor(contract) {
  const records = [];
  const historicalRecords = new Map([
    ...registryPrefixRecords(),
    recordFromRegistry("Task122")
  ].map((record) => [record.cardId, record]));
  for (const [index, card] of contract.releaseGraph.cards.entries()) {
    const historicalRecord = historicalRecords.get(card.id);
    if (historicalRecord) {
      records.push(clone(historicalRecord));
      continue;
    }
    const candidateSha = sha(`${card.id}:candidate`);
    const integrationSha = sha(`${card.id}:integration`);
    const releaseEventId = `task136-release-v4-${card.id}`;
    records.push({
      schemaVersion: releaseSchemaVersion,
      cardId: card.id,
      candidateSha,
      reviews: [
        {
          threadId: codexThreadId(index, 0),
          candidateSha,
          verdict: "APPROVED"
        },
        {
          threadId: codexThreadId(index, 1),
          candidateSha,
          verdict: "APPROVED"
        }
      ],
      integrationSha,
      releaseEventId,
      prerequisites: card.prerequisiteIds.map((cardId) => {
        const prerequisite = records.find((record) => record.cardId === cardId);
        assert.ok(prerequisite, `fixture prerequisite exists: ${cardId}`);
        return {
          cardId,
          integrationSha: prerequisite.integrationSha,
          releaseEventId: prerequisite.releaseEventId
        };
      }),
      ownedPathBlobs: card.ownedPaths.map((ownedPath) => ({
        path: ownedPath.path,
        disposition: ownedPath.disposition,
        blobSha: sha(`blob:${card.id}:${ownedPath.path}`)
      }))
    });
  }
  return records;
}

function releaseRecordMarkdown(records) {
  return records
    .map((record) => `## Task136 dispatch release v4: ${record.cardId}\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\``)
    .join("\n\n");
}

function headingOnlyMarkdown(contract) {
  return contract.releaseGraph.cards
    .map((card) => `## Task136 dispatch release v4: ${card.id}`)
    .join("\n\n");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeTempRepository(registryText) {
  const dir = mkdtempSync(join(tmpdir(), "cestus-task136-release-"));
  mkdirSync(join(dir, "docs/agentic/contracts"), { recursive: true });
  mkdirSync(join(dir, "docs/agentic"), { recursive: true });
  for (const contractPath of [v1ContractPath, v2ContractPath, v3ContractPath, v4ContractPath]) {
    writeFileSync(join(dir, contractPath), readFileSync(contractPath));
  }
  writeFileSync(join(dir, "docs/agentic/resident-agent-full-vision-program-registry.md"), registryText);
  execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "task136@example.test"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Task136 Test"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["add", "docs"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: dir, stdio: "ignore" });
  return dir;
}

function runContractModeInTemp(mutate) {
  const registryText = readFileSync(registryPath, "utf8");
  const dir = makeTempRepository(registryText);
  try {
    mutate(dir);
    return spawnSync(process.execPath, [scriptPath, "--mode", "contract"], {
      cwd: dir,
      encoding: "utf8"
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runRepositoryModeInTemp(registryText, { untrackedFile = false } = {}) {
  const dir = makeTempRepository(registryText);
  try {
    if (untrackedFile) {
      execFileSync("git", ["config", "status.showUntrackedFiles", "no"], { cwd: dir, stdio: "ignore" });
      writeFileSync(join(dir, "untracked-dirty.txt"), "dirty\n");
    }
    return spawnSync(process.execPath, [scriptPath, "--mode", "repository"], {
      cwd: dir,
      encoding: "utf8"
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseReleaseRecords(registryText, contract = loadContract()) {
  assert.equal(typeof assurance.parseTask136ReleaseRecords, "function", "parseTask136ReleaseRecords export");
  return assurance.parseTask136ReleaseRecords(registryText, contract);
}

function verifyReleaseClosure(contract, registryText, adapter) {
  assert.equal(typeof assurance.verifyTask136ReleaseClosure, "function", "verifyTask136ReleaseClosure export");
  return assurance.verifyTask136ReleaseClosure(contract, { registryText, adapter });
}

function fakeRepositoryAdapter(records, options = {}) {
  const commandCalls = [];
  const pathBlobByCommit = new Map();
  for (const entry of task136BaselineFixtureBlobs) {
    pathBlobByCommit.set(`${entry.candidateSha}:${entry.path}`, entry.blobSha);
    pathBlobByCommit.set(`${entry.integrationSha}:${entry.path}`, entry.blobSha);
    pathBlobByCommit.set(`HEAD:${entry.path}`, entry.blobSha);
  }
  for (const record of records) {
    for (const ownedPath of record.ownedPathBlobs) {
      pathBlobByCommit.set(`${record.candidateSha}:${ownedPath.path}`, ownedPath.blobSha);
      pathBlobByCommit.set(`${record.integrationSha}:${ownedPath.path}`, ownedPath.blobSha);
      pathBlobByCommit.set(`HEAD:${ownedPath.path}`, ownedPath.blobSha);
    }
  }

  return {
    commandCalls,
    isCheckoutClean() {
      return !options.dirtyCheckout;
    },
    isDependencySymlink() {
      return Boolean(options.dependencySymlink);
    },
    currentHead() {
      return "HEAD";
    },
    commitExists(commitSha) {
      return commitSha !== options.missingCommitSha;
    },
    isAncestor(ancestorSha, descendantSha) {
      if (
        options.integrationNotAncestral &&
        ancestorSha === options.integrationNotAncestral.integrationSha &&
        descendantSha === "HEAD"
      ) {
        return false;
      }
      if (
        options.prerequisiteNotAncestral &&
        ancestorSha === options.prerequisiteNotAncestral.integrationSha &&
        descendantSha === options.prerequisiteNotAncestral.candidateSha
      ) {
        return false;
      }
      return true;
    },
    blobSha(commitish, path) {
      if (options.blobMismatch && commitish === options.blobMismatch.commitish && path === options.blobMismatch.path) {
        return sha(`mismatch:${commitish}:${path}`);
      }
      const blobSha = pathBlobByCommit.get(`${commitish}:${path}`);
      if (!blobSha) {
        throw new Error(`fixture blob missing: ${commitish}:${path}`);
      }
      return blobSha;
    },
    objectType(commitish, path) {
      if (options.nonBlobObject && commitish === options.nonBlobObject.commitish && path === options.nonBlobObject.path) {
        return options.nonBlobObject.type;
      }
      if (!pathBlobByCommit.has(`${commitish}:${path}`)) {
        throw new Error(`fixture object missing: ${commitish}:${path}`);
      }
      return "blob";
    },
    runNpmTest(args, card) {
      if (options.commandFailureCardId === card.id) {
        throw new Error("fixture command failed");
      }
      commandCalls.push({ args, cardId: card.id });
    }
  };
}

test("rejects exactly 29 heading-only release records before Git checks", () => {
  const contract = loadV4Contract();
  const registryText = headingOnlyMarkdown(contract);

  if (typeof assurance.parseTask136ReleaseRecords !== "function") {
    const result = runRepositoryModeInTemp(registryText);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /release record JSON missing for Task126/);
    return;
  }

  assert.throws(
    () => parseReleaseRecords(registryText, contract),
    /release record JSON missing for Task126/
  );
});

test("parses strict task136 dispatch release v4 records in graph order", () => {
  const contract = loadV4Contract();
  const records = releaseRecordsFor(contract);
  const parsed = parseReleaseRecords(releaseRecordMarkdown(records), contract);

  assert.equal(parsed.length, 29);
  assert.deepEqual(parsed.map((record) => record.cardId), expectedIds);
  assert.equal(parsed[0].schemaVersion, releaseSchemaVersion);
});

test("rejects frozen strict release-record mutations", () => {
  const contract = loadV4Contract();
  const validRecords = releaseRecordsFor(contract);
  const cases = [
    {
      id: "unknown key",
      message: /release record keys: Task126/,
      records() {
        const records = clone(validRecords);
        records[0].extra = true;
        return records;
      }
    },
    {
      id: "missing key",
      message: /release record keys: Task126/,
      records() {
        const records = clone(validRecords);
        delete records[0].candidateSha;
        return records;
      }
    },
    {
      id: "duplicate card",
      message: /duplicate release record: Task126/,
      records() {
        const records = clone(validRecords);
        records[1] = clone(records[0]);
        return records;
      }
    },
    {
      id: "card order",
      message: /release record order drift: expected Task126, found Task127/,
      records() {
        const records = clone(validRecords);
        [records[0], records[1]] = [records[1], records[0]];
        return records;
      }
    },
    {
      id: "bad SHA",
      message: /candidateSha must be a full lowercase SHA: Task126/,
      records() {
        const records = clone(validRecords);
        records[0].candidateSha = "ABC";
        return records;
      }
    },
    {
      id: "duplicate review",
      message: /duplicate review thread: Task126/,
      records() {
        const records = clone(validRecords);
        records[0].reviews[1].threadId = records[0].reviews[0].threadId;
        return records;
      }
    },
    {
      id: "review candidate mismatch",
      message: /review candidate mismatch: Task126/,
      records() {
        const records = clone(validRecords);
        records[0].reviews[0].candidateSha = sha("different candidate");
        return records;
      }
    },
    {
      id: "non-APPROVED verdict",
      message: /review verdict must be APPROVED: Task126/,
      records() {
        const records = clone(validRecords);
        records[0].reviews[0].verdict = "NEEDS-CHANGES";
        return records;
      }
    },
    {
      id: "prerequisite ID mismatch",
      message: /prerequisite ID mismatch: Task137A/,
      records() {
        const records = clone(validRecords);
        const record = records.find((entry) => entry.cardId === "Task137A");
        record.prerequisites[0].cardId = "Task126";
        return records;
      }
    },
    {
      id: "prerequisite release mismatch",
      message: /prerequisite release mismatch: Task137A:Task135D/,
      records() {
        const records = clone(validRecords);
        const record = records.find((entry) => entry.cardId === "Task137A");
        record.prerequisites[0].releaseEventId = "task136-release-v4-wrong";
        return records;
      }
    },
    {
      id: "missing path",
      message: /missing path: Task126:packages\/agent\/test\/byok-provider\.test\.ts/,
      records() {
        const records = clone(validRecords);
        records[0].ownedPathBlobs.pop();
        return records;
      }
    },
    {
      id: "disposition mismatch",
      message: /path disposition mismatch: Task126:packages\/agent\/src\/byok-provider\.ts/,
      records() {
        const records = clone(validRecords);
        records[0].ownedPathBlobs[1].disposition = "owned";
        return records;
      }
    }
  ];

  for (const testCase of cases) {
    assert.throws(
      () => parseReleaseRecords(releaseRecordMarkdown(testCase.records()), contract),
      testCase.message,
      testCase.id
    );
  }
});

test("verifies release records against Git evidence and argument-array commands", () => {
  const contract = loadV4Contract();
  const records = releaseRecordsFor(contract);
  const adapter = fakeRepositoryAdapter(records);
  const result = verifyReleaseClosure(contract, releaseRecordMarkdown(records), adapter);

  assert.equal(result.records, 29);
  assert.equal(result.commands, 29);
  assert.equal(adapter.commandCalls.length, 29);
  assert.deepEqual(adapter.commandCalls[0], {
    cardId: "Task126",
    args: ["packages/agent/test/byok-provider.test.ts"]
  });
});

test("rejects frozen repository-evidence and execution mutations", () => {
  const contract = loadV4Contract();
  const validRecords = releaseRecordsFor(contract);
  const task137A = validRecords.find((record) => record.cardId === "Task137A");
  const task135D = validRecords.find((record) => record.cardId === "Task135D");
  const task126 = validRecords.find((record) => record.cardId === "Task126");
  const byokPath = "packages/agent/test/byok-provider.test.ts";

  const cases = [
    {
      id: "blob mismatch",
      message: /blob mismatch: Task126:packages\/agent\/test\/byok-provider\.test\.ts/,
      adapter: () => fakeRepositoryAdapter(validRecords, {
        blobMismatch: { commitish: task126.candidateSha, path: byokPath }
      })
    },
    {
      id: "integration not ancestral",
      message: /integration is not an ancestor of HEAD: Task126/,
      adapter: () => fakeRepositoryAdapter(validRecords, {
        integrationNotAncestral: { integrationSha: task126.integrationSha }
      })
    },
    {
      id: "prerequisite not ancestral",
      message: /prerequisite integration is not an ancestor of candidate: Task137A:Task135D/,
      adapter: () => fakeRepositoryAdapter(validRecords, {
        prerequisiteNotAncestral: {
          integrationSha: task135D.integrationSha,
          candidateSha: task137A.candidateSha
        }
      })
    },
    {
      id: "dirty checkout",
      message: /repository checkout is dirty/,
      adapter: () => fakeRepositoryAdapter(validRecords, { dirtyCheckout: true })
    },
    {
      id: "dependency symlink",
      message: /dependency directory is a symlink/,
      adapter: () => fakeRepositoryAdapter(validRecords, { dependencySymlink: true })
    },
    {
      id: "command failure",
      message: /release command failed: Task126/,
      adapter: () => fakeRepositoryAdapter(validRecords, { commandFailureCardId: "Task126" })
    }
  ];

  for (const testCase of cases) {
    assert.throws(
      () => verifyReleaseClosure(contract, releaseRecordMarkdown(validRecords), testCase.adapter()),
      testCase.message,
      testCase.id
    );
  }
});

test("rejects non-blob owned-path Git objects before release commands", () => {
  const contract = loadV4Contract();
  const validRecords = releaseRecordsFor(contract);
  const task126 = validRecords.find((record) => record.cardId === "Task126");
  const ownedPath = "docs/agentic/claims/task-126-resident-full-vision-byok-provider.md";

  const cases = [
    { id: "candidate", commitish: task126.candidateSha },
    { id: "integration", commitish: task126.integrationSha },
    { id: "current HEAD", commitish: "HEAD" }
  ];

  for (const testCase of cases) {
    const adapter = fakeRepositoryAdapter(validRecords, {
      nonBlobObject: {
        commitish: testCase.commitish,
        path: ownedPath,
        type: "tree"
      }
    });
    assert.throws(
      () => verifyReleaseClosure(contract, releaseRecordMarkdown(validRecords), adapter),
      /path is not a Git blob: Task126:docs\/agentic\/claims\/task-126-resident-full-vision-byok-provider\.md/,
      testCase.id
    );
    assert.equal(adapter.commandCalls.length, 0, testCase.id);
  }
});

test("rejects unsafe frozen command grammar before executing commands", () => {
  const contract = clone(loadV4Contract());
  contract.releaseGraph.cards[0].command = "npm test -- packages/agent/test/byok-provider.test.ts; echo unsafe";
  const records = releaseRecordsFor(contract);
  const adapter = fakeRepositoryAdapter(records);

  assert.throws(
    () => verifyReleaseClosure(contract, releaseRecordMarkdown(records), adapter),
    /invalid exact targeted Vitest command/
  );
  assert.equal(adapter.commandCalls.length, 0);
});

test("rejects finite Task136 graph, compatibility, baseline, raw-pin, and record-29 migration mutations", () => {
  const contract = loadV4Contract();
  const fingerprint = createHash("sha256").update(JSON.stringify({
    releaseGraph: {
      version: contract.releaseGraph.version,
      cards: contract.releaseGraph.cards.map((card) => ({
        id: card.id,
        prerequisiteIds: card.prerequisiteIds,
        ownedPaths: card.ownedPaths,
        transferToIds: card.transferToIds,
        command: card.command
      }))
    },
    releaseCompatibility: contract.releaseCompatibility
  })).digest("hex");
  assert.equal(fingerprint, v4AssuranceFingerprint);

  const task136CommandArguments = task136SeventeenTestCommand.split(" ").slice(3);
  const staticCases = [
    {
      id: "thirtieth card",
      mutate(mutant) {
        mutant.releaseGraph.cards.push(clone(mutant.releaseGraph.cards[0]));
      }
    },
    {
      id: "reordered card",
      mutate(mutant) {
        [mutant.releaseGraph.cards[0], mutant.releaseGraph.cards[1]] = [mutant.releaseGraph.cards[1], mutant.releaseGraph.cards[0]];
      }
    },
    {
      id: "Task137A source path mapping",
      mutate(mutant) {
        mutant.releaseGraph.cards
          .find((card) => card.id === "Task137A")
          .ownedPaths.find((ownedPath) => ownedPath.path === task137aToTask137bPaths[0]).disposition = "owned";
      }
    },
    {
      id: "Task129-MFA compatibility hash",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords[1].canonicalJsonSha256 = "0".repeat(64);
      }
    },
    {
      id: "Task137A compatibility hash",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords[0].canonicalJsonSha256 = "0".repeat(64);
      }
    },
    ...task136TransferPathsBySource.flatMap(([cardId]) => [
      {
        id: `${cardId} missing Task136 target`,
        mutate(mutant) {
          const source = mutant.releaseGraph.cards.find((card) => card.id === cardId);
          source.transferToIds = source.transferToIds.filter((targetId) => targetId !== "Task136");
        }
      },
      {
        id: `${cardId} relabeled Task136 target`,
        mutate(mutant) {
          const source = mutant.releaseGraph.cards.find((card) => card.id === cardId);
          source.transferToIds = source.transferToIds.map((targetId) =>
            targetId === "Task136" ? "Task136-FC-Core" : targetId
          );
        }
      }
    ]),
    {
      id: "Task137B-W reordered Task136 targets",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task137B-W").transferToIds.reverse();
      }
    },
    {
      id: "T120-R duplicate Task136 target",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "T120-R").transferToIds.push("Task136");
      }
    },
    ...[
      "T120-R",
      "Task136-FC-Ports",
      "Task139-P2",
      "C136-P",
      "G136-R",
      "Task137B-W",
      "Task138-H",
      "CF1-HR",
      "G136-SC"
    ].map((prerequisiteId) => ({
      id: `Task136 missing prerequisite ${prerequisiteId}`,
      mutate(mutant) {
        const task136 = mutant.releaseGraph.cards.find((card) => card.id === "Task136");
        task136.prerequisiteIds = task136.prerequisiteIds.filter((id) => id !== prerequisiteId);
      }
    })),
    {
      id: "Task136 reordered prerequisites",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task136").prerequisiteIds.reverse();
      }
    },
    {
      id: "Task136 extra prerequisite",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task136").prerequisiteIds.push("Task121");
      }
    },
    {
      id: "Task136 relabeled prerequisite",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task136").prerequisiteIds[0] = "Task126";
      }
    },
    ...task136OwnedPaths.flatMap((path) => [
      {
        id: `Task136 missing owned path ${path}`,
        mutate(mutant) {
          const task136 = mutant.releaseGraph.cards.find((card) => card.id === "Task136");
          task136.ownedPaths = task136.ownedPaths.filter((entry) => entry.path !== path);
        }
      },
      {
        id: `Task136 relabeled owned path ${path}`,
        mutate(mutant) {
          const entry = mutant.releaseGraph.cards
            .find((card) => card.id === "Task136")
            .ownedPaths.find((ownedPath) => ownedPath.path === path);
          entry.path = `${path}.drift`;
        }
      }
    ]),
    {
      id: "Task136 reordered owned paths",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task136").ownedPaths.reverse();
      }
    },
    {
      id: "Task136 extra owned path",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task136").ownedPaths.push({
          disposition: "owned",
          path: "packages/agent/src/task136-extra.ts"
        });
      }
    },
    {
      id: "Task136 relabeled owned disposition",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task136").ownedPaths[0].disposition = "transferred";
      }
    },
    ...task136CommandArguments.flatMap((argument) => [
      {
        id: `Task136 command missing ${argument}`,
        mutate(mutant) {
          const task136 = mutant.releaseGraph.cards.find((card) => card.id === "Task136");
          task136.command = [
            "npm",
            "test",
            "--",
            ...task136CommandArguments.filter((candidate) => candidate !== argument)
          ].join(" ");
        }
      },
      {
        id: `Task136 command relabeled ${argument}`,
        mutate(mutant) {
          const task136 = mutant.releaseGraph.cards.find((card) => card.id === "Task136");
          task136.command = task136SeventeenTestCommand.replace(argument, `${argument}.drift`);
        }
      }
    ]),
    {
      id: "Task136 reordered command arguments",
      mutate(mutant) {
        const reordered = [...task136CommandArguments];
        [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
        mutant.releaseGraph.cards.find((card) => card.id === "Task136").command =
          ["npm", "test", "--", ...reordered].join(" ");
      }
    },
    {
      id: "Task136 extra command argument",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task136").command +=
          " packages/agent/test/task136-extra.test.ts";
      }
    },
    ...exactTask136HistoricalPathDispositions.flatMap(([cardId, pathDispositions], recordIndex) => [
      {
        id: `missing compatibility record ${cardId}`,
        mutate(mutant) {
          mutant.releaseCompatibility.historicalRecords.splice(recordIndex, 1);
        }
      },
      {
        id: `relabeled compatibility record ${cardId}`,
        mutate(mutant) {
          mutant.releaseCompatibility.historicalRecords[recordIndex].cardId = "Task126";
        }
      },
      ...pathDispositions.flatMap(([path], pathIndex) => [
        {
          id: `${cardId} missing compatibility path ${path}`,
          mutate(mutant) {
            mutant.releaseCompatibility.historicalRecords[recordIndex].pathDispositions.splice(pathIndex, 1);
          }
        },
        {
          id: `${cardId} relabeled compatibility path ${path}`,
          mutate(mutant) {
            mutant.releaseCompatibility.historicalRecords[recordIndex]
              .pathDispositions[pathIndex].path = `${path}.drift`;
          }
        },
        {
          id: `${cardId} relabeled compatibility disposition ${path}`,
          mutate(mutant) {
            mutant.releaseCompatibility.historicalRecords[recordIndex]
              .pathDispositions[pathIndex].recordDisposition = "transferred";
          }
        }
      ])
    ]),
    {
      id: "reordered compatibility records",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords.reverse();
      }
    },
    {
      id: "extra compatibility record",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords.push(
          clone(mutant.releaseCompatibility.historicalRecords[0])
        );
      }
    },
    {
      id: "reordered compatibility paths",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords[3].pathDispositions.reverse();
      }
    },
    {
      id: "extra compatibility path",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords[3].pathDispositions.push({
          path: "packages/agent/src/task136-extra.ts",
          recordDisposition: "owned"
        });
      }
    }
  ];
  for (const testCase of staticCases) {
    const mutant = clone(contract);
    testCase.mutate(mutant);
    assert.throws(() => verifyStaticGraph(mutant), undefined, testCase.id);
  }

  const immutableCases = [
    {
      id: "v1 byte drift",
      mutate(dir) {
        writeFileSync(join(dir, v1ContractPath), `${readFileSync(join(dir, v1ContractPath), "utf8")} `);
      },
      message: /immutable contract hash drift: v1/
    },
    {
      id: "v2 byte drift",
      mutate(dir) {
        writeFileSync(join(dir, v2ContractPath), `${readFileSync(join(dir, v2ContractPath), "utf8")} `);
      },
      message: /immutable contract hash drift: v2/
    },
    {
      id: "v3 byte drift",
      mutate(dir) {
        writeFileSync(join(dir, v3ContractPath), `${readFileSync(join(dir, v3ContractPath), "utf8")} `);
      },
      message: /immutable contract hash drift: v3/
    },
    {
      id: "Task126 raw release record byte drift",
      mutate(dir) {
        const path = join(dir, registryPath);
        const text = readFileSync(path, "utf8");
        const marker = "## Task136 dispatch release v4: Task126\n\n```json\n";
        writeFileSync(path, text.replace(marker, `${marker} `));
      },
      message: /raw release record hash drift: Task126/
    }
  ];
  for (const testCase of immutableCases) {
    const result = runContractModeInTemp(testCase.mutate);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0, testCase.id);
    assert.match(output, testCase.message, testCase.id);
  }

  for (const [cardId] of exactRawPrefixPins1Through28) {
    const result = runContractModeInTemp((dir) => {
      const path = join(dir, registryPath);
      const text = readFileSync(path, "utf8");
      const marker = `## Task136 dispatch release v4: ${cardId}\n\n\`\`\`json\n`;
      writeFileSync(path, text.replace(marker, `${marker} `));
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0, `raw pin mutation: ${cardId}`);
    assert.match(
      output,
      new RegExp(`raw release record hash drift: ${cardId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      `raw pin mutation: ${cardId}`
    );
  }

  const beforeRecord29Records = releaseRecordsFor(contract).slice(0, 28);
  const beforeRecord29Registry = releaseRecordMarkdown(beforeRecord29Records);
  const baselineCases = [
    ...[
      "packages/agent/src/adapters/legacy-staging.ts",
      "packages/agent/test/legacy-staging-adapter.test.ts"
    ].flatMap((path) => [
      ["c244106459ca050a5f8b61a00755abf184721956", path],
      ["dc05c43c4b9a592d0396acd034bfc32e177fd09a", path],
      ["HEAD", path]
    ]),
    [
      "70814c1259871c5458a3578fae8a5c8281540377",
      "packages/agent/src/domain-execution-dispatcher.ts"
    ],
    [
      "253150b2ab5f2271d2b04a5b8fc5b82b7bf757a5",
      "packages/agent/src/domain-execution-dispatcher.ts"
    ],
    ["HEAD", "packages/agent/src/domain-execution-dispatcher.ts"],
    ...[
      "packages/agent/src/task-orchestrator.ts",
      "packages/agent/test/task-orchestrator-claims.test.ts",
      "packages/agent/src/task-orchestrator-projection.ts",
      "packages/agent/test/task-orchestrator-projection.test.ts"
    ].flatMap((path) => [
      ["bd3b8ed3e287a6a598dfb246524e36ca2a345438", path],
      ["75de81f110b4f405f9ec064104bc2c2b4f79e223", path],
      ["HEAD", path]
    ])
  ];
  for (const [commitish, path] of baselineCases) {
    const adapter = fakeRepositoryAdapter(beforeRecord29Records, {
      blobMismatch: { commitish, path }
    });
    assert.throws(
      () => assurance.verifyTask136ReleasePrefix(contract, {
        registryText: beforeRecord29Registry,
        adapter
      }),
      undefined,
      `baseline mismatch: ${commitish}:${path}`
    );
    assert.equal(adapter.commandCalls.length, 0, `baseline mismatch: ${commitish}:${path}`);
  }

  const records = releaseRecordsFor(contract);
  assert.equal(records.length, 29);
  const record29Registry = releaseRecordMarkdown(records);
  const task136Record = records.find((record) => record.cardId === "Task136");
  assert.ok(task136Record);
  const successfulRecord29Adapter = fakeRepositoryAdapter(records);
  const record29Result = assurance.verifyTask136ReleasePrefix(contract, {
    registryText: record29Registry,
    adapter: successfulRecord29Adapter
  });
  assert.equal(record29Result.records, 29);
  assert.equal(successfulRecord29Adapter.commandCalls.length, 29);

  const transferredAndAdoptedProductPaths = task136OwnedPaths.slice(2, -1);
  assert.equal(transferredAndAdoptedProductPaths.length, 29);
  for (const path of transferredAndAdoptedProductPaths) {
    const adapter = fakeRepositoryAdapter(records, {
      blobMismatch: { commitish: "HEAD", path }
    });
    assert.throws(
      () => assurance.verifyTask136ReleasePrefix(contract, {
        registryText: record29Registry,
        adapter
      }),
      new RegExp(`blob mismatch: Task136:${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      `record-29 current migration: ${path}`
    );
    assert.equal(adapter.commandCalls.length, 0, `record-29 current migration: ${path}`);
  }
  for (const path of task136OwnedPaths) {
    for (const commitish of [task136Record.candidateSha, task136Record.integrationSha]) {
      const adapter = fakeRepositoryAdapter(records, {
        blobMismatch: { commitish, path }
      });
      assert.throws(
        () => assurance.verifyTask136ReleasePrefix(contract, {
          registryText: record29Registry,
          adapter
        }),
        new RegExp(`blob mismatch: Task136:${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
        `record-29 Task136 blob: ${commitish}:${path}`
      );
      assert.equal(adapter.commandCalls.length, 0, `record-29 Task136 blob: ${commitish}:${path}`);
    }
  }

  const task137b = records.find((record) => record.cardId === "Task137B-W");
  const migratedPath = task137b.ownedPathBlobs[0].path;
  for (const testCase of [
    { id: "candidate", commitish: task137b.candidateSha, type: "tree" },
    { id: "integration", commitish: task137b.integrationSha, type: "tree" },
    { id: "current head", commitish: "HEAD", type: "tree" }
  ]) {
    const adapter = fakeRepositoryAdapter(records, {
      nonBlobObject: { commitish: testCase.commitish, path: migratedPath, type: testCase.type }
    });
    assert.throws(
      () => verifyReleaseClosure(contract, releaseRecordMarkdown(records), adapter),
      /path is not a Git blob: Task137B-W/,
      testCase.id
    );
    assert.equal(adapter.commandCalls.length, 0, testCase.id);
  }
  const staleHeadAdapter = fakeRepositoryAdapter(records, {
    blobMismatch: { commitish: "HEAD", path: migratedPath }
  });
  assert.throws(
    () => verifyReleaseClosure(contract, releaseRecordMarkdown(records), staleHeadAdapter),
    /blob mismatch: Task137B-W/
  );
  assert.equal(staleHeadAdapter.commandCalls.length, 0);
});

test("binds four historical source records and exact record-11 and record-14 current-head migrations", () => {
  assert.equal(typeof assurance.parseTask136ReleasePrefix, "function", "parseTask136ReleasePrefix export");
  assert.equal(typeof assurance.runTask136RepositoryAdmission, "function", "runTask136RepositoryAdmission export");

  const contract = loadV4Contract();
  const registryText = readFileSync(registryPath, "utf8");
  const parsedPrefix = assurance.parseTask136ReleasePrefix(registryText, contract);
  const task137ARecord = parsedPrefix.find((record) => record.cardId === "Task137A");
  const task129MfaRecord = parsedPrefix.find((record) => record.cardId === "Task129-MFA");

  assert.equal(parsedPrefix.length, 28);
  assert.deepEqual(parsedPrefix.map((record) => record.cardId), expectedIds.slice(0, 28));
  assert.equal(
    createHash("sha256").update(JSON.stringify(task137ARecord)).digest("hex"),
    historicalTask137ASha256
  );
  assert.equal(
    createHash("sha256").update(JSON.stringify(task129MfaRecord)).digest("hex"),
    historicalTask129MfaSha256
  );

  const compatibilityCases = [
    {
      id: "missing compatibility record",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords = [];
      }
    },
    {
      id: "extra compatibility record",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords.push(clone(mutant.releaseCompatibility.historicalRecords[0]));
      }
    },
    {
      id: "missing Task137A compatibility path",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords[0].pathDispositions.pop();
      }
    },
    {
      id: "extra compatibility path",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords[0].pathDispositions.push({
          path: "packages/agent/src/official-flow-feasibility.ts",
          recordDisposition: "owned"
        });
      }
    },
    {
      id: "unknown compatibility card",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords[0].cardId = "Task999";
      }
    },
    {
      id: "unknown compatibility path",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords[0].pathDispositions[0].path = "packages/unknown.ts";
      }
    },
    {
      id: "non-transferred compatibility source",
      mutate(mutant) {
        mutant.releaseGraph.cards
          .find((card) => card.id === "Task129-MFA")
          .ownedPaths.find((ownedPath) => ownedPath.path === transferredTask129MfaPaths[0]).disposition = "owned";
      }
    },
    {
      id: "Task137A mapping drift",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task137A").transferToIds.reverse();
      }
    },
    {
      id: "Task129-MFA target drift",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task129-MFA").transferToIds = ["Task129"];
      }
    },
    {
      id: "wrong historical disposition",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords[0].pathDispositions[0].recordDisposition = "transferred";
      }
    },
    {
      id: "missing direct transfer prerequisite",
      mutate(mutant) {
        const task137b = mutant.releaseGraph.cards.find((card) => card.id === "Task137B-W");
        task137b.prerequisiteIds = task137b.prerequisiteIds.filter((cardId) => cardId !== "Task137A");
      }
    },
    {
      id: "target missing final ownership",
      mutate(mutant) {
        const task137b = mutant.releaseGraph.cards.find((card) => card.id === "Task137B-W");
        task137b.ownedPaths = task137b.ownedPaths.filter((ownedPath) => ownedPath.path !== transferredTask129MfaPaths[0]);
      }
    }
  ];

  for (const testCase of compatibilityCases) {
    const mutant = clone(contract);
    testCase.mutate(mutant);
    assert.throws(() => verifyStaticGraph(mutant), testCase.id);
  }

  const recordMutationCases = [
    {
      id: "candidate",
      mutate(records) {
        const record = records.find((entry) => entry.cardId === "Task129-MFA");
        record.candidateSha = sha("Task129-MFA:mutated-candidate");
        for (const review of record.reviews) review.candidateSha = record.candidateSha;
      }
    },
    {
      id: "review",
      mutate(records) {
        records.find((entry) => entry.cardId === "Task129-MFA").reviews[0].threadId = "019f0000-0000-7000-8000-999999999999";
      }
    },
    {
      id: "prerequisite",
      mutate(records) {
        const task137a = records.find((entry) => entry.cardId === "Task137A");
        task137a.integrationSha = sha("Task137A:mutated-integration");
        records.find((entry) => entry.cardId === "Task129-MFA").prerequisites[0].integrationSha = task137a.integrationSha;
      }
    },
    {
      id: "integration",
      mutate(records) {
        records.find((entry) => entry.cardId === "Task129-MFA").integrationSha = sha("Task129-MFA:mutated-integration");
      }
    },
    {
      id: "release event",
      mutate(records) {
        records.find((entry) => entry.cardId === "Task129-MFA").releaseEventId = "task136-release-v4-mutated";
      }
    },
    {
      id: "blob",
      mutate(records) {
        records
          .find((entry) => entry.cardId === "Task129-MFA")
          .ownedPathBlobs.find((entry) => entry.path === transferredTask129MfaPaths[0]).blobSha = sha("Task129-MFA:mutated-blob");
      }
    }
  ];

  for (const testCase of recordMutationCases) {
    const records = clone(parsedPrefix);
    testCase.mutate(records);
    assert.throws(
      () => assurance.parseTask136ReleasePrefix(releaseRecordMarkdown(records), contract),
      undefined,
      testCase.id
    );
  }

  const successfulAdapter = fakeRepositoryAdapter(parsedPrefix);
  const successfulMessages = [];
  assert.throws(
    () => assurance.runTask136RepositoryAdmission(contract, {
      registryText,
      adapter: successfulAdapter,
      emit(message) {
        successfulMessages.push(message);
      }
    }),
    /repository release closure incomplete: expected 29 records, found 28/
  );
  assert.deepEqual(successfulMessages, ["TASK136_REPOSITORY_PREFIX_OK records=28 commands=28"]);
  assert.equal(successfulAdapter.commandCalls.length, 28);

  const task126 = parsedPrefix.find((record) => record.cardId === "Task126");
  const task137A = parsedPrefix.find((record) => record.cardId === "Task137A");
  const task126Path = task126.ownedPathBlobs[0].path;
  const task137ALifecyclePath = task137aToTask137bPaths[0];
  const evidenceCases = [
    {
      id: "missing candidate",
      message: /candidate commit missing: Task126/,
      adapter: () => fakeRepositoryAdapter(parsedPrefix, { missingCommitSha: task126.candidateSha })
    },
    {
      id: "non-blob candidate path",
      message: new RegExp(`path is not a Git blob: Task126:${task126Path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      adapter: () => fakeRepositoryAdapter(parsedPrefix, {
        nonBlobObject: { commitish: task126.candidateSha, path: task126Path, type: "tree" }
      })
    },
    {
      id: "stale final owner",
      message: new RegExp(`blob mismatch: Task126:${task126Path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      adapter: () => fakeRepositoryAdapter(parsedPrefix, {
        blobMismatch: { commitish: "HEAD", path: task126Path }
      })
    },
    {
      id: "command failure",
      message: /release command failed: Task126/,
      adapter: () => fakeRepositoryAdapter(parsedPrefix, { commandFailureCardId: "Task126" })
    }
  ];

  for (const testCase of evidenceCases) {
    const messages = [];
    const adapter = testCase.adapter();
    assert.throws(
      () => assurance.runTask136RepositoryAdmission(contract, {
        registryText,
        adapter,
        emit(message) {
          messages.push(message);
        }
      }),
      testCase.message,
      testCase.id
    );
    assert.deepEqual(messages, [], testCase.id);
  }

  const sourceMigrationMessages = [];
  assert.throws(
    () => assurance.runTask136RepositoryAdmission(contract, {
      registryText,
      adapter: fakeRepositoryAdapter(parsedPrefix, {
        blobMismatch: { commitish: "HEAD", path: task137ALifecyclePath }
      }),
      emit(message) {
        sourceMigrationMessages.push(message);
      }
    }),
    new RegExp(`blob mismatch: Task137B-W:${task137ALifecyclePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
  );
  assert.deepEqual(sourceMigrationMessages, []);

  const untrackedCheckout = runRepositoryModeInTemp(registryText, { untrackedFile: true });
  const untrackedOutput = `${untrackedCheckout.stdout}\n${untrackedCheckout.stderr}`;
  assert.notEqual(untrackedCheckout.status, 0);
  assert.match(untrackedOutput, /repository checkout is dirty/);
  assert.doesNotMatch(untrackedOutput, /TASK136_REPOSITORY_PREFIX_OK/);
  assert.doesNotMatch(untrackedOutput, /repository release closure incomplete/);
});

test("moves the three exact CF1 transfers at record 14 and never before", () => {
  const contract = loadV4Contract();
  const registryText = readFileSync(registryPath, "utf8");
  const releasedPrefix = assurance.parseTask136ReleasePrefix(registryText, contract);
  const sourcePaths = [
    ...task135bToCf1Paths,
    ...task129MfaToCf1Paths,
    ...task137bToCf1Paths
  ];
  const preCf1Records = releasedPrefix.slice(0, 13);
  const preCf1Registry = releaseRecordMarkdown(preCf1Records);

  const beforeActivation = assurance.verifyTask136ReleasePrefix(contract, {
    registryText: preCf1Registry,
    adapter: fakeRepositoryAdapter(preCf1Records)
  });
  assert.equal(beforeActivation.records, 13);

  for (const path of sourcePaths) {
    assert.throws(
      () => assurance.verifyTask136ReleasePrefix(contract, {
        registryText: preCf1Registry,
        adapter: fakeRepositoryAdapter(preCf1Records, { blobMismatch: { commitish: "HEAD", path } })
      }),
      new RegExp(`blob mismatch: (Task135B|Task129-MFA|Task137B-W):${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      `source remains current before CF1-HR: ${path}`
    );
  }

  const cf1Record = clone(releaseRecordsFor(contract).find((record) => record.cardId === "CF1-HR"));
  for (const prerequisite of cf1Record.prerequisites) {
    const releasedPrerequisite = preCf1Records.find((record) => record.cardId === prerequisite.cardId);
    prerequisite.integrationSha = releasedPrerequisite.integrationSha;
    prerequisite.releaseEventId = releasedPrerequisite.releaseEventId;
  }
  const activatedRecords = [...preCf1Records, cf1Record];
  const activatedRegistry = releaseRecordMarkdown(activatedRecords);
  const afterActivation = assurance.verifyTask136ReleasePrefix(contract, {
    registryText: activatedRegistry,
    adapter: fakeRepositoryAdapter(activatedRecords)
  });
  assert.equal(afterActivation.records, 14);

  for (const path of sourcePaths) {
    assert.throws(
      () => assurance.verifyTask136ReleasePrefix(contract, {
        registryText: activatedRegistry,
        adapter: fakeRepositoryAdapter(activatedRecords, { blobMismatch: { commitish: "HEAD", path } })
      }),
      new RegExp(`blob mismatch: CF1-HR:${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      `CF1-HR becomes current at record 14: ${path}`
    );
  }
});

test("requires the finite Task137B-W to Task139-PM transfer only at record 18", () => {
  const contract = loadV4Contract();
  const source = contract.releaseGraph.cards.find((card) => card.id === "Task137B-W");
  const target = contract.releaseGraph.cards.find((card) => card.id === "Task139-PM");
  const registryText = readFileSync(registryPath, "utf8");
  const releasedPrefix = assurance.parseTask136ReleasePrefix(registryText, contract);
  const task136SourcePaths = new Set(task136TransferPathMap.get("Task137B-W"));
  const task137bCompatibility = contract.releaseCompatibility.historicalRecords
    .find((record) => record.cardId === "Task137B-W");

  assert.deepEqual(target.prerequisiteIds, ["Task126-R", "Task139-P1", "Task135D", "Task137A", "T120-R", "Task137B-W"]);
  assert.deepEqual(
    source.transferToIds.filter((targetId) => targetId !== "Task136"),
    ["CF1-HR", "Task139-PM"]
  );
  assert.deepEqual(
    source.ownedPaths.filter((ownedPath) => !task136SourcePaths.has(ownedPath.path)),
    task137bOwnedPaths
      .filter((path) => !task136SourcePaths.has(path))
      .map((path) => ({
        disposition: [...task137bToCf1Paths, ...task137bToTask139PmPaths].includes(path)
          ? "transferred"
          : "owned",
        path
      }))
  );
  assert.deepEqual(target.ownedPaths, task139PmOwnedPaths.map((path) => ({ disposition: "owned", path })));
  assert.equal(target.command, task139PmCommand);
  assert.deepEqual({
    ...task137bCompatibility,
    pathDispositions: task137bCompatibility.pathDispositions.filter(
      ({ path }) => !task136SourcePaths.has(path)
    )
  }, {
    cardId: "Task137B-W",
    canonicalJsonSha256: historicalTask137bSha256,
    pathDispositions: [...task137bToCf1Paths, ...task137bToTask139PmPaths]
      .map((path) => ({ path, recordDisposition: "owned" }))
  });
  assert.equal(releasedPrefix.length, 28);
  assert.deepEqual(releasedPrefix.map((record) => record.cardId), expectedIds.slice(0, 28));
  for (const [cardId, expectedHash] of rawPrefixPins) {
    assert.equal(createHash("sha256").update(rawRecordJson(cardId)).digest("hex"), expectedHash, cardId);
  }

  const mutations = [
    {
      id: "Task139-PM missing Task137B-W prerequisite",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task139-PM").prerequisiteIds.pop();
      }
    },
    {
      id: "Task139-PM extra prerequisite",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task139-PM").prerequisiteIds.push("CF1-HR");
      }
    },
    {
      id: "Task139-PM reordered prerequisite",
      mutate(mutant) {
        const prerequisites = mutant.releaseGraph.cards.find((card) => card.id === "Task139-PM").prerequisiteIds;
        [prerequisites[4], prerequisites[5]] = [prerequisites[5], prerequisites[4]];
      }
    },
    {
      id: "Task137B-W missing Task139-PM target",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task137B-W").transferToIds.pop();
      }
    },
    {
      id: "Task137B-W reordered targets",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task137B-W").transferToIds.reverse();
      }
    },
    {
      id: "Task137B-W wrong target",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task137B-W").transferToIds[1] = "Task136-FC-Core";
      }
    },
    {
      id: "Task137B-W generic transitive target",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task137B-W").transferToIds.push("Task136-FC-Core");
      }
    },
    {
      id: "Task137B-W PM source path remains owned",
      mutate(mutant) {
        mutant.releaseGraph.cards
          .find((card) => card.id === "Task137B-W")
          .ownedPaths.find((ownedPath) => ownedPath.path === task137bToTask139PmPaths[0]).disposition = "owned";
      }
    },
    {
      id: "Task139-PM missing transferred path",
      mutate(mutant) {
        const targetCard = mutant.releaseGraph.cards.find((card) => card.id === "Task139-PM");
        targetCard.ownedPaths = targetCard.ownedPaths.filter((ownedPath) => ownedPath.path !== task137bToTask139PmPaths[0]);
      }
    },
    {
      id: "Task139-PM extra transferred path",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task139-PM").ownedPaths.push({
          disposition: "owned",
          path: "packages/local-runtime/test/mounted-artifact-authority-operation.test.ts"
        });
      }
    },
    {
      id: "Task139-PM command omission",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task139-PM").command =
          "npm test -- packages/local-runtime/test/mounted-provider-authority.test.ts";
      }
    },
    {
      id: "Task137B-W missing historical PM path",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords
          .find((record) => record.cardId === "Task137B-W")
          .pathDispositions = mutant.releaseCompatibility.historicalRecords
            .find((record) => record.cardId === "Task137B-W")
            .pathDispositions.filter(({ path }) => path !== task137bToTask139PmPaths[2]);
      }
    },
    {
      id: "Task137B-W reordered historical PM paths",
      mutate(mutant) {
        const paths = mutant.releaseCompatibility.historicalRecords
          .find((record) => record.cardId === "Task137B-W").pathDispositions;
        [paths[1], paths[2]] = [paths[2], paths[1]];
      }
    },
    {
      id: "Task137B-W historical PM path loses owned disposition",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords
          .find((record) => record.cardId === "Task137B-W")
          .pathDispositions.find(({ path }) => path === task137bToTask139PmPaths[0])
          .recordDisposition = "transferred";
      }
    }
  ];

  for (const testCase of mutations) {
    const mutant = clone(contract);
    testCase.mutate(mutant);
    assert.throws(() => verifyStaticGraph(mutant), undefined, testCase.id);
  }

  const beforeActivationRecords = releasedPrefix.slice(0, 17);
  const beforeActivationRegistry = releaseRecordMarkdown(beforeActivationRecords);
  const beforeActivation = assurance.verifyTask136ReleasePrefix(contract, {
    registryText: beforeActivationRegistry,
    adapter: fakeRepositoryAdapter(beforeActivationRecords)
  });
  assert.equal(beforeActivation.records, 17);
  for (const path of task137bToTask139PmPaths) {
    assert.throws(
      () => assurance.verifyTask136ReleasePrefix(contract, {
        registryText: beforeActivationRegistry,
        adapter: fakeRepositoryAdapter(beforeActivationRecords, { blobMismatch: { commitish: "HEAD", path } })
      }),
      new RegExp(`blob mismatch: Task137B-W:${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      `Task137B-W remains current before Task139-PM record 18: ${path}`
    );
  }

  const task139PmRecord = clone(releaseRecordsFor(contract).find((record) => record.cardId === "Task139-PM"));
  for (const prerequisite of task139PmRecord.prerequisites) {
    const releasedPrerequisite = beforeActivationRecords.find((record) => record.cardId === prerequisite.cardId);
    prerequisite.integrationSha = releasedPrerequisite.integrationSha;
    prerequisite.releaseEventId = releasedPrerequisite.releaseEventId;
  }
  const activatedRecords = [...beforeActivationRecords, task139PmRecord];
  const activatedRegistry = releaseRecordMarkdown(activatedRecords);
  const afterActivation = assurance.verifyTask136ReleasePrefix(contract, {
    registryText: activatedRegistry,
    adapter: fakeRepositoryAdapter(activatedRecords)
  });
  assert.equal(afterActivation.records, 18);
  for (const path of task137bToTask139PmPaths) {
    assert.throws(
      () => assurance.verifyTask136ReleasePrefix(contract, {
        registryText: activatedRegistry,
        adapter: fakeRepositoryAdapter(activatedRecords, { blobMismatch: { commitish: "HEAD", path } })
      }),
      new RegExp(`blob mismatch: Task139-PM:${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      `Task139-PM becomes current at record 18: ${path}`
    );
  }
  const sourceRecord = releasedPrefix.find((record) => record.cardId === "Task137B-W");
  for (const commitish of [sourceRecord.candidateSha, sourceRecord.integrationSha]) {
    assert.throws(
      () => assurance.verifyTask136ReleasePrefix(contract, {
        registryText: activatedRegistry,
        adapter: fakeRepositoryAdapter(activatedRecords, {
          blobMismatch: { commitish, path: task137bToTask139PmPaths[0] }
        })
      }),
      new RegExp(`blob mismatch: Task137B-W:${task137bToTask139PmPaths[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
    );
  }
});

test("requires the finite CF1-HR and Task122 direct-source transfers at records 26 and 27 only", () => {
  const contract = loadV4Contract();
  const source = contract.releaseGraph.cards.find((card) => card.id === "CF1-HR");
  const target = contract.releaseGraph.cards.find((card) => card.id === "Task122");
  const registryText = readFileSync(registryPath, "utf8");
  const releasedPrefix = assurance.parseTask136ReleasePrefix(registryText, contract);
  const task122ExistingPaths = [
    "packages/agent/src/investigation-planner-workflow.ts",
    "packages/agent/test/investigation-planner-workflow.test.ts",
    "docs/agentic/claims/task-122-resident-full-vision-investigation-handoff.md"
  ];
  const rawCf1HrRecord = JSON.parse(rawRecordJson("CF1-HR"));
  const task136SourcePaths = new Set(task136TransferPathMap.get("CF1-HR"));
  const cf1Compatibility = contract.releaseCompatibility.historicalRecords
    .find((record) => record.cardId === "CF1-HR");

  assert.equal(createHash("sha256").update(readFileSync(v1ContractPath)).digest("hex"), v1ContractSha256);
  assert.equal(createHash("sha256").update(readFileSync(v2ContractPath)).digest("hex"), v2ContractSha256);
  assert.equal(createHash("sha256").update(readFileSync(v3ContractPath)).digest("hex"), v3ContractSha256);
  assert.deepEqual(contract.releaseGraph.cards.map((card) => card.id), expectedIds);
  assert.equal(releasedPrefix.length, 28);
  assert.deepEqual(releasedPrefix.map((record) => record.cardId), expectedIds.slice(0, 28));
  assert.equal(createHash("sha256").update(rawRecordJson("CF1-HR")).digest("hex"), rawPrefixPins.get("CF1-HR"));
  assert.equal(createHash("sha256").update(JSON.stringify(rawCf1HrRecord)).digest("hex"), historicalCf1HrSha256);
  assert.deepEqual(
    rawCf1HrRecord.ownedPathBlobs
      .filter((entry) => cf1HrToTask122Paths.includes(entry.path))
      .map(({ disposition, path, blobSha }) => ({ disposition, path, blobSha })),
    cf1HrToTask122Paths.map((path, index) => ({
      disposition: "owned",
      path,
      blobSha: historicalCf1HrBlobs[index]
    }))
  );

  assert.deepEqual(target.prerequisiteIds, ["CF1-HR"]);
  assert.deepEqual(
    source.transferToIds.filter((targetId) => targetId !== "Task136"),
    ["Task122", "W1-123-BOOTSTRAP-HANDOFF"]
  );
  assert.deepEqual(
    source.ownedPaths.filter((ownedPath) => !task136SourcePaths.has(ownedPath.path)),
    correctedCf1HrPaths
      .filter((path) => !task136SourcePaths.has(path))
      .map((path) => ({
        disposition: [...cf1HrToTask122Paths, ...cf1HrToW1BootstrapPaths].includes(path)
          ? "transferred"
          : "owned",
        path
      }))
  );
  assert.deepEqual(
    target.ownedPaths,
    [...task122ExistingPaths, ...cf1HrToTask122Paths].map((path) => ({
      disposition: cf1HrToTask122Paths.includes(path) ? "transferred" : "owned",
      path
    }))
  );
  assert.equal(target.command, task122PortableStoreCommand);
  assert.deepEqual({
    ...cf1Compatibility,
    pathDispositions: cf1Compatibility.pathDispositions.filter(
      ({ path }) => !task136SourcePaths.has(path)
    )
  }, {
    cardId: "CF1-HR",
    canonicalJsonSha256: historicalCf1HrSha256,
    pathDispositions: [
      ...cf1HrToTask122Paths.map((path) => ({ path, recordDisposition: "owned" })),
      ...cf1HrToW1BootstrapPaths.map((path) => ({ path, recordDisposition: "owned" }))
    ]
  });

  const mutations = [
    {
      id: "CF1-HR missing Task122 target",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "CF1-HR").transferToIds = [];
      }
    },
    {
      id: "CF1-HR generic extra target",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "CF1-HR").transferToIds.push("Task136-FC-Core");
      }
    },
    {
      id: "CF1-HR portable path remains owned",
      mutate(mutant) {
        mutant.releaseGraph.cards
          .find((card) => card.id === "CF1-HR")
          .ownedPaths.find((ownedPath) => ownedPath.path === cf1HrToTask122Paths[0]).disposition = "owned";
      }
    },
    {
      id: "Task122 missing CF1-HR portable path",
      mutate(mutant) {
        const card = mutant.releaseGraph.cards.find((entry) => entry.id === "Task122");
        card.ownedPaths = card.ownedPaths.filter((ownedPath) => ownedPath.path !== cf1HrToTask122Paths[0]);
      }
    },
    {
      id: "Task122 extra portable path",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task122").ownedPaths.push({
          disposition: "owned",
          path: "packages/local-runtime/test/mounted-provider-authority.test.ts"
        });
      }
    },
    {
      id: "Task122 command omission",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task122").command =
          "npm test -- packages/agent/test/investigation-planner-workflow.test.ts";
      }
    },
    {
      id: "CF1-HR missing historical compatibility",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords =
          mutant.releaseCompatibility.historicalRecords.filter(
            (record) => record.cardId !== "CF1-HR"
          );
      }
    },
    {
      id: "CF1-HR reordered historical paths",
      mutate(mutant) {
        const paths = mutant.releaseCompatibility.historicalRecords
          .find((record) => record.cardId === "CF1-HR").pathDispositions;
        [paths[0], paths[1]] = [paths[1], paths[0]];
      }
    },
    {
      id: "CF1-HR historical disposition drift",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords
          .find((record) => record.cardId === "CF1-HR")
          .pathDispositions.find(({ path }) => path === cf1HrToTask122Paths[0])
          .recordDisposition = "transferred";
      }
    }
  ];
  for (const testCase of mutations) {
    const mutant = clone(contract);
    testCase.mutate(mutant);
    assert.throws(() => verifyStaticGraph(mutant), undefined, testCase.id);
  }

  const beforeActivationRecords = releasedPrefix.slice(0, 25);
  const beforeActivationRegistry = releaseRecordMarkdown(beforeActivationRecords);
  for (const path of cf1HrToTask122Paths) {
    assert.throws(
      () => assurance.verifyTask136ReleasePrefix(contract, {
        registryText: beforeActivationRegistry,
        adapter: fakeRepositoryAdapter(beforeActivationRecords, { blobMismatch: { commitish: "HEAD", path } })
      }),
      new RegExp(`blob mismatch: CF1-HR:${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      `CF1-HR remains current before Task122 record 26: ${path}`
    );
  }

  const task122Record = clone(releaseRecordsFor(contract).find((record) => record.cardId === "Task122"));
  for (const prerequisite of task122Record.prerequisites) {
    const releasedPrerequisite = beforeActivationRecords.find((record) => record.cardId === prerequisite.cardId);
    prerequisite.integrationSha = releasedPrerequisite.integrationSha;
    prerequisite.releaseEventId = releasedPrerequisite.releaseEventId;
  }
  const activatedRecords = [...beforeActivationRecords, task122Record];
  const activatedRegistry = releaseRecordMarkdown(activatedRecords);
  const afterActivation = assurance.verifyTask136ReleasePrefix(contract, {
    registryText: activatedRegistry,
    adapter: fakeRepositoryAdapter(activatedRecords)
  });
  assert.equal(afterActivation.records, 26);
  for (const path of cf1HrToTask122Paths) {
    assert.throws(
      () => assurance.verifyTask136ReleasePrefix(contract, {
        registryText: activatedRegistry,
        adapter: fakeRepositoryAdapter(activatedRecords, { blobMismatch: { commitish: "HEAD", path } })
      }),
      new RegExp(`blob mismatch: Task122:${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      `Task122 becomes current at record 26: ${path}`
    );
  }
  const sourceRecord = releasedPrefix.find((record) => record.cardId === "CF1-HR");
  for (const commitish of [sourceRecord.candidateSha, sourceRecord.integrationSha]) {
    assert.throws(
      () => assurance.verifyTask136ReleasePrefix(contract, {
        registryText: activatedRegistry,
        adapter: fakeRepositoryAdapter(activatedRecords, {
          blobMismatch: { commitish, path: cf1HrToTask122Paths[0] }
        })
      }),
      new RegExp(`blob mismatch: CF1-HR:${cf1HrToTask122Paths[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
    );
  }
  {
  const contract = loadV4Contract();
  const cf1Hr = contract.releaseGraph.cards.find((card) => card.id === "CF1-HR");
  const task122 = contract.releaseGraph.cards.find((card) => card.id === "Task122");
  const w1Bootstrap = contract.releaseGraph.cards.find((card) => card.id === "W1-123-BOOTSTRAP-HANDOFF");
  const registryText = readFileSync(registryPath, "utf8");
  const releasedPrefix = assurance.parseTask136ReleasePrefix(registryText, contract).slice(0, 26);
  const rawCf1HrRecord = JSON.parse(rawRecordJson("CF1-HR"));
  const rawTask122Record = JSON.parse(rawRecordJson("Task122"));
  const task136SourcePaths = new Set(task136TransferPathMap.get("CF1-HR"));
  const cf1Compatibility = contract.releaseCompatibility.historicalRecords
    .find((record) => record.cardId === "CF1-HR");
  const task122Compatibility = contract.releaseCompatibility.historicalRecords
    .find((record) => record.cardId === "Task122");

  assert.equal(createHash("sha256").update(readFileSync(v1ContractPath)).digest("hex"), v1ContractSha256);
  assert.equal(createHash("sha256").update(readFileSync(v2ContractPath)).digest("hex"), v2ContractSha256);
  assert.equal(createHash("sha256").update(readFileSync(v3ContractPath)).digest("hex"), v3ContractSha256);
  assert.deepEqual(contract.releaseGraph.cards.map((card) => card.id), expectedIds);
  assert.equal(releasedPrefix.length, 26);
  assert.deepEqual(releasedPrefix.map((record) => record.cardId), expectedIds.slice(0, 26));

  assert.deepEqual(w1Bootstrap.prerequisiteIds, ["CF1-HR", "Task121", "Task122"]);
  assert.deepEqual(
    cf1Hr.transferToIds.filter((targetId) => targetId !== "Task136"),
    ["Task122", "W1-123-BOOTSTRAP-HANDOFF"]
  );
  assert.deepEqual(
    cf1Hr.ownedPaths.filter((ownedPath) => !task136SourcePaths.has(ownedPath.path)),
    correctedCf1HrPaths
      .filter((path) => !task136SourcePaths.has(path))
      .map((path) => ({
        disposition: [...cf1HrToTask122Paths, ...cf1HrToW1BootstrapPaths].includes(path)
          ? "transferred"
          : "owned",
        path
      }))
  );
  assert.deepEqual(task122.transferToIds, ["W1-123-BOOTSTRAP-HANDOFF"]);
  assert.deepEqual(
    task122.ownedPaths,
    [
      "packages/agent/src/investigation-planner-workflow.ts",
      "packages/agent/test/investigation-planner-workflow.test.ts",
      "docs/agentic/claims/task-122-resident-full-vision-investigation-handoff.md",
      ...task122ToW1BootstrapPaths
    ].map((path) => ({
      disposition: task122ToW1BootstrapPaths.includes(path) ? "transferred" : "owned",
      path
    }))
  );
  assert.deepEqual(w1Bootstrap.ownedPaths, w1BootstrapOwnedPaths.map((path) => ({ disposition: "owned", path })));
  assert.equal(w1Bootstrap.command, w1BootstrapCommand);

  assert.equal(createHash("sha256").update(JSON.stringify(rawCf1HrRecord)).digest("hex"), historicalCf1HrSha256);
  assert.deepEqual(
    rawCf1HrRecord.ownedPathBlobs
      .filter((entry) => [...cf1HrToTask122Paths, ...cf1HrToW1BootstrapPaths].includes(entry.path))
      .map(({ disposition, path, blobSha }) => ({ disposition, path, blobSha })),
    [
      ...cf1HrToW1BootstrapPaths.map((path, index) => ({
        disposition: "owned",
        path,
        blobSha: historicalCf1HrAuthorityBlobs[index]
      })),
      ...cf1HrToTask122Paths.map((path, index) => ({
        disposition: "owned",
        path,
        blobSha: historicalCf1HrBlobs[index]
      }))
    ]
  );
  assert.equal(createHash("sha256").update(JSON.stringify(rawTask122Record)).digest("hex"), historicalTask122Sha256);
  assert.deepEqual(
    rawTask122Record.ownedPathBlobs
      .filter((entry) => task122ToW1BootstrapPaths.includes(entry.path))
      .map(({ disposition, path, blobSha }) => ({ disposition, path, blobSha })),
    task122ToW1BootstrapPaths.map((path, index) => ({
      disposition: "owned",
      path,
      blobSha: historicalTask122PortableBlobs[index]
    }))
  );
  assert.deepEqual({
    ...cf1Compatibility,
    pathDispositions: cf1Compatibility.pathDispositions.filter(
      ({ path }) => !task136SourcePaths.has(path)
    )
  }, {
    cardId: "CF1-HR",
    canonicalJsonSha256: historicalCf1HrSha256,
    pathDispositions: [
      ...cf1HrToTask122Paths.map((path) => ({ path, recordDisposition: "owned" })),
      ...cf1HrToW1BootstrapPaths.map((path) => ({ path, recordDisposition: "owned" }))
    ]
  });
  assert.deepEqual(task122Compatibility, {
    cardId: "Task122",
    canonicalJsonSha256: historicalTask122Sha256,
    pathDispositions: task122ToW1BootstrapPaths.map((path) => ({ path, recordDisposition: "owned" }))
  });

  const mutations = [
    {
      id: "CF1-HR omits W1-123 target",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "CF1-HR").transferToIds = ["Task122"];
      }
    },
    {
      id: "CF1-HR reorders direct targets",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "CF1-HR").transferToIds.reverse();
      }
    },
    {
      id: "CF1-HR adds generic target",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "CF1-HR").transferToIds.push("Task136-FC-Core");
      }
    },
    {
      id: "CF1-HR authority path remains owned",
      mutate(mutant) {
        mutant.releaseGraph.cards
          .find((card) => card.id === "CF1-HR")
          .ownedPaths.find((ownedPath) => ownedPath.path === cf1HrToW1BootstrapPaths[0]).disposition = "owned";
      }
    },
    {
      id: "Task122 wrong target",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "Task122").transferToIds = ["CF1-HR"];
      }
    },
    {
      id: "Task122 portable path remains owned",
      mutate(mutant) {
        mutant.releaseGraph.cards
          .find((card) => card.id === "Task122")
          .ownedPaths.find((ownedPath) => ownedPath.path === task122ToW1BootstrapPaths[0]).disposition = "owned";
      }
    },
    {
      id: "W1-123 omits authority path",
      mutate(mutant) {
        const card = mutant.releaseGraph.cards.find((entry) => entry.id === "W1-123-BOOTSTRAP-HANDOFF");
        card.ownedPaths = card.ownedPaths.filter((ownedPath) => ownedPath.path !== cf1HrToW1BootstrapPaths[0]);
      }
    },
    {
      id: "W1-123 adds unrelated path",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "W1-123-BOOTSTRAP-HANDOFF").ownedPaths.push({
          disposition: "owned",
          path: "packages/agent/test/byok-provider.test.ts"
        });
      }
    },
    {
      id: "W1-123 command omits transferred test",
      mutate(mutant) {
        mutant.releaseGraph.cards.find((card) => card.id === "W1-123-BOOTSTRAP-HANDOFF").command =
          "npm test -- packages/agent/test/ontology-bootstrap-workflow.test.ts packages/local-runtime/test/agent-ontology-bootstrap-routes.test.ts";
      }
    },
    {
      id: "CF1-HR authority historical disposition drifts",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords
          .find((record) => record.cardId === "CF1-HR")
          .pathDispositions.find(({ path }) => path === cf1HrToW1BootstrapPaths[0])
          .recordDisposition = "transferred";
      }
    },
    {
      id: "Task122 compatibility is absent",
      mutate(mutant) {
        mutant.releaseCompatibility.historicalRecords =
          mutant.releaseCompatibility.historicalRecords.filter(
            (record) => record.cardId !== "Task122"
          );
      }
    },
    {
      id: "Task122 historical portable order drifts",
      mutate(mutant) {
        const paths = mutant.releaseCompatibility.historicalRecords
          .find((record) => record.cardId === "Task122").pathDispositions;
        [paths[0], paths[1]] = [paths[1], paths[0]];
      }
    }
  ];
  for (const testCase of mutations) {
    const mutant = clone(contract);
    testCase.mutate(mutant);
    assert.throws(() => verifyStaticGraph(mutant), undefined, testCase.id);
  }

  const beforeActivationRegistry = releaseRecordMarkdown(releasedPrefix);
  for (const path of cf1HrToW1BootstrapPaths) {
    assert.throws(
      () => assurance.verifyTask136ReleasePrefix(contract, {
        registryText: beforeActivationRegistry,
        adapter: fakeRepositoryAdapter(releasedPrefix, { blobMismatch: { commitish: "HEAD", path } })
      }),
      new RegExp(`blob mismatch: CF1-HR:${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      `CF1-HR remains current before W1-123 record 27: ${path}`
    );
  }
  for (const path of task122ToW1BootstrapPaths) {
    assert.throws(
      () => assurance.verifyTask136ReleasePrefix(contract, {
        registryText: beforeActivationRegistry,
        adapter: fakeRepositoryAdapter(releasedPrefix, { blobMismatch: { commitish: "HEAD", path } })
      }),
      new RegExp(`blob mismatch: Task122:${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      `Task122 remains current before W1-123 record 27: ${path}`
    );
  }

  const w1BootstrapRecord = clone(releaseRecordsFor(contract).find((record) => record.cardId === "W1-123-BOOTSTRAP-HANDOFF"));
  for (const prerequisite of w1BootstrapRecord.prerequisites) {
    const releasedPrerequisite = releasedPrefix.find((record) => record.cardId === prerequisite.cardId);
    prerequisite.integrationSha = releasedPrerequisite.integrationSha;
    prerequisite.releaseEventId = releasedPrerequisite.releaseEventId;
  }
  const activatedRecords = [...releasedPrefix, w1BootstrapRecord];
  const activatedRegistry = releaseRecordMarkdown(activatedRecords);
  const afterActivation = assurance.verifyTask136ReleasePrefix(contract, {
    registryText: activatedRegistry,
    adapter: fakeRepositoryAdapter(activatedRecords)
  });
  assert.equal(afterActivation.records, 27);
  for (const path of [...cf1HrToW1BootstrapPaths, ...task122ToW1BootstrapPaths]) {
    assert.throws(
      () => assurance.verifyTask136ReleasePrefix(contract, {
        registryText: activatedRegistry,
        adapter: fakeRepositoryAdapter(activatedRecords, { blobMismatch: { commitish: "HEAD", path } })
      }),
      new RegExp(`blob mismatch: W1-123-BOOTSTRAP-HANDOFF:${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      `W1-123 becomes current at record 27: ${path}`
    );
  }
  for (const [sourceId, path] of [
    ["CF1-HR", cf1HrToW1BootstrapPaths[0]],
    ["Task122", task122ToW1BootstrapPaths[0]]
  ]) {
    const sourceRecord = releasedPrefix.find((record) => record.cardId === sourceId);
    for (const commitish of [sourceRecord.candidateSha, sourceRecord.integrationSha]) {
      assert.throws(
        () => assurance.verifyTask136ReleasePrefix(contract, {
          registryText: activatedRegistry,
          adapter: fakeRepositoryAdapter(activatedRecords, { blobMismatch: { commitish, path } })
        }),
        new RegExp(`blob mismatch: ${sourceId}:${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
      );
    }
  }
  }
});

test("requires the durable V4 claim to retain history and the RV-1-E-941 authority checkpoint", () => {
  const claim = readFileSync(task136V4ClaimPath, "utf8");
  const requiredEvidence = [
    "Status: ready-for-review",
    "Plan: `docs/superpowers/plans/2026-07-17-task136-v4-task137b-authority-transfer-implementation.md`",
    "Design: `docs/superpowers/specs/2026-07-17-task136-v4-task137b-authority-transfer-design.md`",
    "TASK136_REPOSITORY_PREFIX_OK records=28 commands=28",
    ".slice(0, 26)",
    "RV-1-E-941 Task136 V4 correction authority checkpoint",
    "327f9421ae604e4764d29033b6bda22fda3382df",
    "96142632606668519b2198590bdb3ae87b367691",
    "0955f28f9115885fc8859b7b223f3d91cf77bf03",
    "20` tests, `20` passed, and `0` failed",
    "81a34419ae5d25853279be96c14a95c65dcc127d1bb5f5b09cecbbf03c55b53a",
    "34628c6687644f224ef426254a6461c25f549d696c5de08bd9dccc14b7946af6",
    "sha256:ac80fb8d78cbd1c8abb135604327b284c638304796cc74dc094ce6168aaa5ce5",
    "npm test -- --reporter=json",
    "success=false",
    "`total=3231`, `passed=3178`, `failed=48`, `skipped=5`, `deferred=0`",
    "`npm run verify` also exited `1`",
    "c8fd4c43c6eb7a29755b83edf65004254ceb52ff49f840c972885f885426e566",
    "cbf1cb3317cc9581f976a2cd27a2f4c1745aecf2b00650a59e93f46bc9dc40a4",
    "15125944a80d1f605487560f1dd13e28603a7b72335baf53a2d1c081177008f3",
    "Task136 product/package byte may change before the exact six-file V4",
    "RV-1-E-1017 forward assurance-scope amendment",
    "32 ordered paths: 14 sources, 17 tests",
    "8fc076b8b7f3c23f513381fd771bf26ee81ad967c28b741bdb1c766d52554a41",
    "3a6e963cf76c94dbe791cd6562d3baef31c27310d141493819e5958c1076d438",
    "da850dfd3068efda96b96e9a274777e3b97e2922017c16be8ea703b09e7cd1ec",
    "sha256:10d859b4fbd96afbe2ebda94406288d960d4e99cfc0b5949b2a2e352db072fae",
    "selectedCandidateBindingHashes"
  ];

  for (const evidence of requiredEvidence) {
    assert.ok(claim.includes(evidence), `durable claim missing final evidence: ${evidence}`);
  }
});
