import type { CaseDocument, ExtractedFacts } from "@grupo4/shared";

import type { AgentTraceContext } from "../../lib/agent-transcript.js";
import { extractFactsAction as extractFactsActionFromLegacy } from "../extract-facts-action.js";

export class ExtractFactsAgent {
  async extract(
    documents: CaseDocument[],
    trace?: AgentTraceContext
  ): Promise<ExtractedFacts> {
    return extractFactsActionFromLegacy(documents, trace);
  }
}
