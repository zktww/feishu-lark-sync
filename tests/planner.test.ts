import { describe, expect, it } from "vitest";
import { planSync } from "../src/sync/planner";
import type { DocumentState, RemoteNode } from "../src/types";

const state = (token: string, revision: string): DocumentState => ({
  token,
  sourceId: "source-1",
  localPath: `Feishu/${token}.md`,
  remoteRevision: revision,
  managedContentHash: "hash",
  lastSeenScanId: "scan-1",
  status: "active",
});

const node = (token: string, revision: string): RemoteNode => ({
  token,
  objectToken: token,
  title: token,
  hasChildren: false,
  revision,
});

describe("planSync", () => {
  it("separates added, updated, unchanged, and missing documents", () => {
    const localStates = {
      existing: state("existing", "1"),
      changed: state("changed", "1"),
      removed: state("removed", "1"),
    };
    const remoteNodes = [
      node("existing", "1"),
      node("changed", "2"),
      node("new", "1"),
    ];

    const plan = planSync(remoteNodes, localStates);

    expect(plan.added.map((item) => item.token)).toEqual(["new"]);
    expect(plan.updated.map((item) => item.token)).toEqual(["changed"]);
    expect(plan.unchanged.map((item) => item.token)).toEqual(["existing"]);
    expect(plan.missing.map((item) => item.token)).toEqual(["removed"]);
  });
});
