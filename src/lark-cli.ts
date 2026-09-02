import * as timers from "node:timers";
import { spawn } from "node:child_process";
import { delimiter, dirname, isAbsolute } from "node:path";
import { parseSourceUrl } from "./source-url";
import { abortError, checkAbort, safeError } from "./safety";
import type {
  FeishuLarkSyncSettings,
  FetchedDocument,
  LarkBrand,
  RemoteDriveItem,
  RemoteDrivePage,
  RemoteNode,
  ResolvedSyncSource,
} from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const AUTH_TIMEOUT_MS = 120_000;

export const READ_ONLY_AUTH_SCOPES = [
  "wiki:wiki:readonly",
  "docx:document:readonly",
  "drive:drive:readonly",
] as const;

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface AuthorizationRequest {
  verificationUrl: string;
  deviceCode: string;
  expiresIn?: number;
}

export interface ConnectionStatus {
  installed: boolean;
  version?: string;
  authenticated: boolean;
  userName?: string;
  detail?: string;
}

interface LarkEnvelope<T> {
  ok?: boolean;
  data?: T;
  error?: {
    message?: string;
  };
  [key: string]: unknown;
}

export class LarkCliError extends Error {
  constructor(
    message: string,
    readonly exitCode?: number,
  ) {
    super(safeError(message));
    this.name = "LarkCliError";
  }
}

export class LarkCliClient {
  constructor(
    private readonly getSettings: () => FeishuLarkSyncSettings,
    private readonly signal?: AbortSignal,
  ) {}

  async inspectConnection(): Promise<ConnectionStatus> {
    let version: string;
    try {
      version = (await this.run(["-v"])).stdout.trim();
    } catch (error) {
      return {
        installed: false,
        authenticated: false,
        detail: this.errorMessage(error),
      };
    }

    try {
      const response = await this.runJson<Record<string, unknown>>([
        "auth",
        "status",
        "--json",
        "--verify",
        ...this.profileArgs(),
      ]);
      const identity = this.string(response, "identity");
      const userIdentity = this.record(
        this.record(this.record(response, "identities"), "user"),
      );
      const userName = this.string(userIdentity, "userName");
      const verified =
        this.boolean(response, "verified") ??
        this.boolean(userIdentity, "verified");
      const status = this.string(userIdentity, "status");

      return {
        installed: true,
        version,
        authenticated:
          verified === true &&
          (identity === "user" || status === "authenticated"),
        userName,
      };
    } catch (error) {
      return {
        installed: true,
        version,
        authenticated: false,
        detail: this.errorMessage(error),
      };
    }
  }

  async configureApplication(
    appId: string,
    appSecret: string,
    brand: LarkBrand,
  ): Promise<void> {
    if (!appId.trim() || !appSecret) {
      throw new LarkCliError("App ID and App Secret are required.");
    }

    await this.run(
      [
        "config",
        "init",
        "--app-id",
        appId.trim(),
        "--app-secret-stdin",
        "--brand",
        brand,
        "--name",
        this.getSettings().profileName,
      ],
      { stdin: `${appSecret}\n` },
    );
  }

  async beginAuthorization(): Promise<AuthorizationRequest> {
    const response = await this.runJson<Record<string, unknown>>([
      "auth",
      "login",
      "--scope",
      READ_ONLY_AUTH_SCOPES.join(" "),
      "--no-wait",
      "--json",
      ...this.profileArgs(),
    ]);
    const data = this.record(response, "data");
    const verificationUrl =
      this.string(response, "verification_url") ??
      this.string(response, "verification_uri_complete") ??
      this.string(data, "verification_url") ??
      this.string(data, "verification_uri_complete");
    const deviceCode =
      this.string(response, "device_code") ?? this.string(data, "device_code");
    const expiresIn =
      this.number(response, "expires_in") ?? this.number(data, "expires_in");

    if (!verificationUrl || !deviceCode) {
      throw new LarkCliError(
        "lark-cli did not return a verification URL and device code.",
      );
    }

    return { verificationUrl, deviceCode, expiresIn };
  }

  async completeAuthorization(deviceCode: string): Promise<void> {
    await this.run(
      ["auth", "login", "--device-code", deviceCode, ...this.profileArgs()],
      { timeoutMs: AUTH_TIMEOUT_MS },
    );
  }

  async listWikiNodes(
    spaceId: string,
    parentNodeToken?: string,
  ): Promise<RemoteNode[]> {
    const args = [
      "wiki",
      "+node-list",
      "--as",
      "user",
      "--space-id",
      spaceId,
      "--page-all",
      "--page-limit",
      "0",
      "--format",
      "json",
    ];
    if (parentNodeToken) {
      args.push("--parent-node-token", parentNodeToken);
    }
    args.push(...this.profileArgs());

    const response = await this.runJson<Record<string, unknown>>(args);
    return this.extractItems(response)
      .map((item) => this.toRemoteNode(item))
      .filter((node) => node.token !== "");
  }

  async inspectSourceUrl(sourceUrl: string): Promise<ResolvedSyncSource> {
    const parsed = parseSourceUrl(sourceUrl);
    const response = await this.runJson<Record<string, unknown>>([
      "drive",
      "+inspect",
      "--as",
      "user",
      "--url",
      parsed.url,
      "--format",
      "json",
      ...this.profileArgs(),
    ]);
    const data = this.record(response, "data");
    const payload = Object.keys(data).length > 0 ? data : response;
    const title = this.string(payload, "title") ?? parsed.token;
    const token = this.string(payload, "token") ?? parsed.token;

    if (parsed.kind === "wiki") {
      const wikiNode = this.record(payload, "wiki_node");
      const spaceId = this.string(wikiNode, "space_id");
      const nodeToken = this.string(wikiNode, "node_token") ?? parsed.token;
      if (!spaceId) {
        throw new LarkCliError(
          "Unable to resolve the Wiki space ID from this URL.",
        );
      }
      return {
        name: title,
        type: "wiki",
        sourceUrl: parsed.url,
        remoteId: spaceId,
        rootNodeToken: nodeToken,
        objectType: this.string(payload, "type"),
      };
    }

    return {
      name: title,
      type: parsed.kind,
      sourceUrl: parsed.url,
      remoteId: token,
      rootNodeToken: "",
      objectType: this.string(payload, "type") ?? parsed.objectType,
    };
  }

  async getWikiNode(
    spaceId: string | undefined,
    nodeToken: string,
  ): Promise<RemoteNode> {
    const args = [
      "wiki",
      "+node-get",
      "--as",
      "user",
      "--node-token",
      nodeToken,
      "--format",
      "json",
    ];
    if (spaceId) {
      args.push("--space-id", spaceId);
    }
    args.push(...this.profileArgs());
    const response = await this.runJson<Record<string, unknown>>(args);
    const data = this.record(response, "data");
    const nested = this.record(data, "data");
    const item = this.record(response, "node");
    const dataNode = this.record(data, "node");
    const nestedNode = this.record(nested, "node");
    const node = this.toRemoteNode(
      Object.keys(item).length > 0
        ? item
        : Object.keys(dataNode).length > 0
          ? dataNode
          : nestedNode,
    );
    if (!node.token) {
      throw new LarkCliError(
        "lark-cli did not return the requested Wiki node.",
      );
    }
    return node;
  }

  async fetchDocumentXml(
    documentToken: string,
  ): Promise<Record<string, unknown>> {
    return this.runJson<Record<string, unknown>>([
      "docs",
      "+fetch",
      "--as",
      "user",
      "--doc",
      documentToken,
      "--doc-format",
      "xml",
      "--detail",
      "simple",
      "--format",
      "json",
      ...this.profileArgs(),
    ]);
  }

  async fetchDocumentMarkdown(documentToken: string): Promise<FetchedDocument> {
    const response = await this.runJson<Record<string, unknown>>([
      "docs",
      "+fetch",
      "--as",
      "user",
      "--doc",
      documentToken,
      "--doc-format",
      "markdown",
      "--detail",
      "simple",
      "--format",
      "json",
      ...this.profileArgs(),
    ]);
    const data = this.record(response, "data");
    const document = this.record(data, "document");
    const fallback = this.record(response, "document");
    const payload = Object.keys(document).length > 0 ? document : fallback;
    const markdown = this.string(payload, "content");
    if (markdown === undefined) {
      throw new LarkCliError("lark-cli did not return document Markdown.");
    }
    const revision =
      this.string(payload, "revision_id") ??
      this.number(payload, "revision_id")?.toString();
    return { token: documentToken, revision, markdown };
  }

  async listDriveFolderPage(
    folderToken: string,
    pageToken?: string,
  ): Promise<RemoteDrivePage> {
    const params: Record<string, string | number> = {
      folder_token: folderToken,
      page_size: 200,
    };
    if (pageToken) {
      params.page_token = pageToken;
    }

    const response = await this.runJson<Record<string, unknown>>([
      "drive",
      "files",
      "list",
      "--as",
      "user",
      "--params",
      JSON.stringify(params),
      "--format",
      "json",
      ...this.profileArgs(),
    ]);
    const data = this.record(response, "data");
    const payload = Object.keys(data).length > 0 ? data : response;
    const files = Array.isArray(payload.files)
      ? payload.files.filter(this.isRecord)
      : [];

    return {
      items: files
        .map((item) => this.toRemoteDriveItem(item))
        .filter((item) => item.token !== ""),
      hasMore: this.boolean(payload, "has_more") ?? false,
      nextPageToken: this.string(payload, "next_page_token"),
    };
  }

  private profileArgs(): string[] {
    const profile = this.getSettings().profileName.trim();
    return profile ? ["--profile", profile] : [];
  }

  private async runJson<T extends Record<string, unknown>>(
    args: string[],
  ): Promise<T> {
    const result = await this.run(args);
    const text = result.stdout.trim();
    if (!text) {
      throw new LarkCliError(
        "lark-cli returned an empty response.",
        result.exitCode,
      );
    }

    try {
      const parsed = JSON.parse(text) as LarkEnvelope<T> & T;
      if (parsed.ok === false) {
        throw new LarkCliError(
          parsed.error?.message ?? "lark-cli request failed.",
          result.exitCode,
        );
      }
      return parsed;
    } catch (error) {
      if (error instanceof LarkCliError) {
        throw error;
      }
      throw new LarkCliError(
        "Unable to parse lark-cli JSON (response omitted for privacy).",
      );
    }
  }

  private run(
    args: string[],
    options: { stdin?: string; timeoutMs?: number } = {},
  ): Promise<CommandResult> {
    checkAbort(this.signal);
    const settings = this.getSettings();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const inheritedPath = process.env.PATH ?? "";
    const executableDirectory = isAbsolute(settings.cliPath)
      ? dirname(settings.cliPath)
      : "";
    const childPath = executableDirectory
      ? [executableDirectory, inheritedPath].filter(Boolean).join(delimiter)
      : inheritedPath;

    return new Promise((resolve, reject) => {
      const child = spawn(settings.cliPath, args, {
        shell: false,
        env: {
          ...process.env,
          PATH: childPath,
          LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
          LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let oversized = false;
      let killTimer: ReturnType<typeof timers.setTimeout> | undefined;
      const stop = () => {
        child.kill("SIGTERM");
        killTimer ??= timers.setTimeout(() => child.kill("SIGKILL"), 1_000);
      };
      const cancel = () => stop();
      this.signal?.addEventListener("abort", cancel, { once: true });
      if (this.signal?.aborted) stop();
      const clean = () => {
        timers.clearTimeout(timer);
        if (killTimer) timers.clearTimeout(killTimer);
        this.signal?.removeEventListener("abort", cancel);
      };
      const timer = timers.setTimeout(() => {
        timedOut = true;
        stop();
      }, timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (stdout.length + chunk.length > 20_000_000) {
          oversized = true;
          stop();
        } else stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        if (stderr.length + chunk.length > 1_000_000) {
          oversized = true;
          stop();
        } else stderr += chunk;
      });
      child.on("error", (error) => {
        clean();
        reject(new LarkCliError(this.errorMessage(error)));
      });
      child.on("close", (code) => {
        clean();
        const exitCode = code ?? -1;
        if (this.signal?.aborted) {
          reject(abortError());
          return;
        }
        if (oversized) {
          reject(new LarkCliError("lark-cli output limit exceeded."));
          return;
        }
        if (timedOut) {
          reject(
            new LarkCliError(
              `lark-cli timed out after ${timeoutMs}ms.`,
              exitCode,
            ),
          );
          return;
        }
        if (exitCode !== 0) {
          reject(
            new LarkCliError(
              stderr.trim() || stdout.trim() || "lark-cli failed.",
              exitCode,
            ),
          );
          return;
        }
        resolve({ stdout, stderr, exitCode });
      });

      child.stdin.on("error", () => {
        /* EPIPE is reported by process close/error. */
      });
      child.stdin.end(options.stdin);
    });
  }

  private extractItems(
    response: Record<string, unknown>,
  ): Record<string, unknown>[] {
    const direct = response.items;
    if (Array.isArray(direct)) {
      return direct.filter(this.isRecord);
    }
    const data = this.record(response, "data");
    if (Array.isArray(data.items)) {
      return data.items.filter(this.isRecord);
    }
    const nested = this.record(data, "data");
    if (Array.isArray(nested.items)) {
      return nested.items.filter(this.isRecord);
    }
    return [];
  }

  private toRemoteNode(item: Record<string, unknown>): RemoteNode {
    return {
      token: this.string(item, "node_token") ?? "",
      title: this.string(item, "title") ?? "Untitled",
      spaceId: this.string(item, "space_id"),
      parentToken: this.string(item, "parent_node_token"),
      objectToken: this.string(item, "obj_token"),
      objectType: this.string(item, "obj_type"),
      hasChildren: this.boolean(item, "has_child") ?? false,
      revision: this.string(item, "revision_id"),
      modifiedAt: this.number(item, "obj_edit_time"),
    };
  }

  private toRemoteDriveItem(item: Record<string, unknown>): RemoteDriveItem {
    return {
      token: this.string(item, "token") ?? "",
      name: this.string(item, "name") ?? "Untitled",
      type: this.string(item, "type") ?? "unknown",
      url: this.string(item, "url"),
      parentToken: this.string(item, "parent_token"),
      ownerId: this.string(item, "owner_id"),
      createdAt: this.number(item, "created_time"),
      modifiedAt: this.number(item, "modified_time"),
    };
  }

  private readonly isRecord = (
    value: unknown,
  ): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

  private record(value: unknown, key?: string): Record<string, unknown> {
    const candidate = key && this.isRecord(value) ? value[key] : value;
    return this.isRecord(candidate) ? candidate : {};
  }

  private string(value: unknown, key: string): string | undefined {
    const candidate = this.isRecord(value) ? value[key] : undefined;
    return typeof candidate === "string" ? candidate : undefined;
  }

  private number(value: unknown, key: string): number | undefined {
    const candidate = this.isRecord(value) ? value[key] : undefined;
    if (typeof candidate === "number") {
      return candidate;
    }
    if (typeof candidate === "string" && candidate.trim() !== "") {
      const parsed = Number(candidate);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private boolean(value: unknown, key: string): boolean | undefined {
    const candidate = this.isRecord(value) ? value[key] : undefined;
    return typeof candidate === "boolean" ? candidate : undefined;
  }

  private errorMessage(error: unknown): string {
    return safeError(error);
  }
}
