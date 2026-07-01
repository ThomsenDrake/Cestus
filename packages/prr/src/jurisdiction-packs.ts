import { z } from "zod";

const citationSchema = z
  .object({
    label: z.string().min(1),
    citation: z.string().min(1),
    url: z.string().url()
  })
  .strict();

const ruleSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(["deadline", "fee", "exemption", "appeal", "enforcement"]),
    description: z.string().min(20),
    citations: z.array(citationSchema).min(1),
    agentWarning: z.string().min(20)
  })
  .strict();

export const jurisdictionPackSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    jurisdiction: z.string().min(1),
    description: z.string().min(20),
    agentGuidance: z.string().min(20),
    rules: z.array(ruleSchema).min(1)
  })
  .strict();

export type JurisdictionPack = z.infer<typeof jurisdictionPackSchema>;

export const usFederalFoiaPack: JurisdictionPack = jurisdictionPackSchema.parse({
  name: "us-federal-foia",
  version: "0.1.0",
  jurisdiction: "US Federal",
  description: "Starter pack for federal Freedom of Information Act request lifecycle guidance.",
  agentGuidance:
    "Use the 20 working days rule for determinations when receipt date is known. Do not treat this pack as legal advice.",
  rules: [
    {
      id: "federal-determination-20-working-days",
      label: "20 working days determination estimate",
      kind: "deadline",
      description:
        "Federal FOIA generally requires an agency determination within 20 working days after receipt, subject to statutory conditions.",
      citations: [
        {
          label: "5 U.S.C. 552(a)(6)(A)(i)",
          citation: "5 U.S.C. 552(a)(6)(A)(i)",
          url: "https://www.justice.gov/oip/freedom-information-act-5-usc-552"
        }
      ],
      agentWarning:
        "Confirm tolling, unusual circumstances, and receipt date before using legal escalation language."
    }
  ]
});

export const floridaPublicRecordsPack: JurisdictionPack = jurisdictionPackSchema.parse({
  name: "florida-public-records",
  version: "0.1.0",
  jurisdiction: "Florida state and local",
  description: "Starter pack for Florida Chapter 119 public records request workflow guidance.",
  agentGuidance:
    "Use workflow estimate language for Florida because Chapter 119 does not provide one universal fixed response-day deadline; these dates are workflow estimates, not a fixed statutory response-day deadline.",
  rules: [
    {
      id: "florida-prompt-response-workflow-estimate",
      label: "Prompt response workflow estimate",
      kind: "deadline",
      description:
        "Florida public records law requires prompt access and good-faith handling; Cestus estimates review dates for operations.",
      citations: [
        {
          label: "Florida Statutes 119.07",
          citation: "Fla. Stat. 119.07",
          url: "https://www.flsenate.gov/laws/statutes/2025/119.07"
        },
        {
          label: "Florida Attorney General public records guide",
          citation: "Florida Attorney General public records citizen guide",
          url: "https://www.myfloridalegal.com/open-government/citizens"
        }
      ],
      agentWarning:
        "Label Florida dates as workflow estimates unless a human confirms a specific legal basis."
    },
    {
      id: "florida-acknowledgement-workflow-estimate",
      label: "Acknowledgement workflow estimate",
      kind: "deadline",
      description:
        "Cestus uses this internal acknowledgement review date to prompt early request tracking without treating it as a statutory response deadline.",
      citations: [
        {
          label: "Florida Statutes 119.07",
          citation: "Fla. Stat. 119.07",
          url: "https://www.flsenate.gov/laws/statutes/2025/119.07"
        },
        {
          label: "Florida Attorney General public records guide",
          citation: "Florida Attorney General public records citizen guide",
          url: "https://www.myfloridalegal.com/open-government/citizens"
        }
      ],
      agentWarning:
        "Use acknowledgement dates only as internal workflow estimates, not fixed statutory response-day deadlines."
    }
  ]
});
