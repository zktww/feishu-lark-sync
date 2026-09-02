export type LarkBrand = "feishu" | "lark";

export type SyncSourceType = "wiki" | "drive-folder" | "document";

export interface SyncSource {
  id: string;
  name: string;
  type: SyncSourceType;
  sourceUrl?: string;
  objectType?: string;
  remoteId: string;
  rootNodeToken: string;
  targetFolder: string;
  enabled: boolean;
}

export interface DocumentState {
  token: string;
  sourceId: string;
  localPath: string;
  remoteRevision?: string;
  remoteModifiedAt?: number;
  managedContentHash: string;
  mediaIncomplete?: boolean;
  lastSeenScanId: string;
  status:
    | "active"
    | "conflict"
    | "missing"
    | "inaccessible"
    | "missing-local"
    | "paused";
  remote?: RemoteDocument;
}

export interface RemoteDocument {
  token: string;
  title: string;
  objectType: string;
  sourceId: string;
  sourceName: string;
  targetFolder: string;
  relativePath: string;
  url?: string;
  revision?: string;
  modifiedAt?: number;
}

export interface FetchedDocument {
  token: string;
  revision?: string;
  markdown: string;
}

export interface SyncRunSummary {
  sources: number;
  discovered: number;
  created: number;
  updated: number;
  unchanged: number;
  conflicts: number;
  inaccessible: number;
  skippedUnsupported: number;
  failedSources: number;
  errors: string[];
  results?: SyncItemResult[];
  startedAt?: string;
  finishedAt?: string;
  cancelled?: boolean;
  trigger?: "manual" | "scheduled" | "startup" | "retry";
}

export type SyncAction =
  | "created"
  | "updated"
  | "unchanged"
  | "conflict"
  | "failed"
  | "unsupported"
  | "missing-local"
  | "paused";
export interface SyncItemResult {
  token?: string;
  sourceId: string;
  title: string;
  action: SyncAction;
  localPath?: string;
  error?: string;
  remote?: RemoteDocument;
}
export interface SyncProgress {
  phase: "scanning" | "syncing" | "idle" | "cancelling";
  completed: number;
  total: number;
  title?: string;
}

export interface FeishuLarkSyncSettings {
  cliPath: string;
  profileName: string;
  brand: LarkBrand;
  appId: string;
  syncOnStartup: boolean;
  scheduleMinutes: number;
  sources: SyncSource[];
  mediaMode?: "local" | "remote";
  maxMediaMB?: number;
  extraMediaHosts?: string[];
}

export interface PluginData {
  schemaVersion: 1;
  settings: FeishuLarkSyncSettings;
  documents: Record<string, DocumentState>;
  history: SyncRunSummary[];
  lastSuccessAt?: string;
}

export const DEFAULT_SETTINGS: FeishuLarkSyncSettings = {
  cliPath: "lark-cli",
  profileName: "feishu-lark-sync",
  brand: "feishu",
  appId: "",
  syncOnStartup: false,
  scheduleMinutes: 0,
  sources: [],
  mediaMode: "local",
  maxMediaMB: 20,
  extraMediaHosts: [],
};

export interface RemoteNode {
  token: string;
  title: string;
  spaceId?: string;
  parentToken?: string;
  objectToken?: string;
  objectType?: string;
  hasChildren: boolean;
  revision?: string;
  modifiedAt?: number;
}

export interface RemoteDriveItem {
  token: string;
  name: string;
  type: string;
  url?: string;
  parentToken?: string;
  ownerId?: string;
  createdAt?: number;
  modifiedAt?: number;
}

export interface RemoteDrivePage {
  items: RemoteDriveItem[];
  hasMore: boolean;
  nextPageToken?: string;
}

export interface ResolvedSyncSource {
  name: string;
  type: SyncSourceType;
  sourceUrl: string;
  remoteId: string;
  rootNodeToken: string;
  objectType?: string;
}
