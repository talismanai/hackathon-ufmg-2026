import type { CaseDocument, CritiqueResult, ExtractedFacts } from "@grupo4/shared";

import type { AgentTraceContext } from "../../lib/agent-transcript.js";
import { extractFactsCritique as extractFactsCritiqueFromLegacy } from "../extract-facts-critique.js";

export class ExtractFactsCritiqueAgent {
  async critique(
    facts: ExtractedFacts,
    documents: CaseDocument[],
    trace?: AgentTraceContext
  ): Promise<CritiqueResult> {
    return extractFactsCritiqueFromLegacy(facts, documents, trace);
  }
}
