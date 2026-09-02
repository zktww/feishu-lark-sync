import { describe, expect, it } from "vitest";
import { READ_ONLY_AUTH_SCOPES } from "../src/lark-cli";

describe("authorization scopes", () => {
  it("contains only the documented read-only scopes", () => {
    expect(READ_ONLY_AUTH_SCOPES).toEqual([
      "wiki:wiki:readonly",
      "docx:document:readonly",
      "drive:drive:readonly",
    ]);
    expect(
      READ_ONLY_AUTH_SCOPES.every((scope) => scope.endsWith(":readonly")),
    ).toBe(true);
  });
});
