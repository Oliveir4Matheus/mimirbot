/** How a step asks a person to confirm something. The volatile step prompt, the
 * step brief and the tool descriptions all state this same rule, and a step
 * instruction may not add a fallback the engine does not have. */
export const WORKFLOW_APPROVAL_RULE =
  "approval: open a request card (request_credential) and end the turn; the run waits indefinitely for a person; there is no timeout and no fallback; a refused card cancels the run";

/** What a step instruction may not promise about approval. */
export const WORKFLOW_APPROVAL_NO_FALLBACK =
  "never promise a fallback such as \"continue if there is no answer\"; without an answer the step waits";
