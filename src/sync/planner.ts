import type { DocumentState, RemoteNode } from "../types";

export interface SyncPlan {
  added: RemoteNode[];
  updated: RemoteNode[];
  unchanged: RemoteNode[];
  missing: DocumentState[];
}

export function planSync(
  remoteNodes: RemoteNode[],
  localStates: Record<string, DocumentState>,
): SyncPlan {
  const plan: SyncPlan = { added: [], updated: [], unchanged: [], missing: [] };
  const seen = new Set<string>();

  for (const node of remoteNodes) {
    const token = node.objectToken ?? node.token;
    seen.add(token);
    const local = localStates[token];
    if (!local) {
      plan.added.push(node);
      continue;
    }

    const revisionChanged =
      node.revision !== undefined && node.revision !== local.remoteRevision;
    const modifiedChanged =
      node.modifiedAt !== undefined &&
      node.modifiedAt !== local.remoteModifiedAt;

    if (revisionChanged || modifiedChanged) {
      plan.updated.push(node);
    } else {
      plan.unchanged.push(node);
    }
  }

  for (const [token, state] of Object.entries(localStates)) {
    if (!seen.has(token)) {
      plan.missing.push(state);
    }
  }

  return plan;
}
