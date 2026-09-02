import { checkAbort, isAbort, safeError } from "../safety";
import type {
  RemoteDocument,
  RemoteDrivePage,
  RemoteNode,
  SyncSource,
} from "../types";

export interface SourceReader {
  getWikiNode(spaceId: string, nodeToken: string): Promise<RemoteNode>;
  listWikiNodes(
    spaceId: string,
    parentNodeToken?: string,
  ): Promise<RemoteNode[]>;
  listDriveFolderPage(
    folderToken: string,
    pageToken?: string,
  ): Promise<RemoteDrivePage>;
}

export interface SourceScanResult {
  sourceId: string;
  sourceName: string;
  nodeCount: number;
  documentCount: number;
  documents: RemoteDocument[];
  error?: string;
}

export interface ScanSummary {
  sources: SourceScanResult[];
  nodeCount: number;
  documentCount: number;
  documents: RemoteDocument[];
}

export class SyncEngine {
  constructor(
    private readonly client: SourceReader,
    private readonly signal?: AbortSignal,
  ) {}

  async scanSources(sources: SyncSource[]): Promise<ScanSummary> {
    const results: SourceScanResult[] = [];

    for (const source of sources.filter((item) => item.enabled)) {
      checkAbort(this.signal);
      try {
        if (source.type === "wiki") {
          results.push(await this.scanWikiSource(source));
        } else if (source.type === "drive-folder") {
          results.push(await this.scanDriveFolderSource(source));
        } else {
          results.push(this.scanDocumentSource(source));
        }
      } catch (error) {
        if (isAbort(error)) throw error;
        results.push({
          sourceId: source.id,
          sourceName: source.name,
          nodeCount: 0,
          documentCount: 0,
          documents: [],
          error: safeError(error),
        });
      }
    }

    return {
      sources: results,
      nodeCount: results.reduce((total, item) => total + item.nodeCount, 0),
      documentCount: results.reduce(
        (total, item) => total + item.documentCount,
        0,
      ),
      documents: results.flatMap((item) => item.documents),
    };
  }

  private scanDocumentSource(source: SyncSource): SourceScanResult {
    const token = source.remoteId.trim();
    if (!token) {
      throw new Error("Document token is required.");
    }
    const document: RemoteDocument = {
      token,
      title: source.name,
      objectType: source.objectType ?? "docx",
      sourceId: source.id,
      sourceName: source.name,
      targetFolder: source.targetFolder,
      relativePath: source.name,
      url: source.sourceUrl,
    };
    return {
      sourceId: source.id,
      sourceName: source.name,
      nodeCount: 1,
      documentCount: 1,
      documents: [document],
    };
  }

  private async scanDriveFolderSource(
    source: SyncSource,
  ): Promise<SourceScanResult> {
    const rootFolderToken = source.remoteId.trim();
    if (!rootFolderToken) {
      throw new Error("Drive folder token is required.");
    }

    const pendingFolders = [{ token: rootFolderToken, path: "" }];
    const visitedFolders = new Set<string>();
    const visitedPages = new Set<string>();
    const seenItems = new Set<string>();
    let nodeCount = 0;
    let documentCount = 0;
    const documents: RemoteDocument[] = [];

    while (pendingFolders.length > 0) {
      checkAbort(this.signal);
      if (visitedFolders.size > 10_000 || nodeCount > 50_000)
        throw new Error("Scan limit exceeded (10,000 folders / 50,000 items)");
      const folder = pendingFolders.shift();
      if (!folder || visitedFolders.has(folder.token)) {
        continue;
      }
      const folderToken = folder.token;
      visitedFolders.add(folderToken);

      let pageToken: string | undefined;
      let missingContinuationRetries = 0;
      while (true) {
        checkAbort(this.signal);
        if (visitedPages.size > 10_000)
          throw new Error("Scan page limit exceeded");
        const pageKey = `${folderToken}:${pageToken ?? "__first__"}`;
        const page = await this.client.listDriveFolderPage(
          folderToken,
          pageToken,
        );
        checkAbort(this.signal);

        if (!visitedPages.has(pageKey)) {
          visitedPages.add(pageKey);
          for (const item of page.items) {
            const itemKey = `${item.type}:${item.token}`;
            if (seenItems.has(itemKey)) {
              continue;
            }
            seenItems.add(itemKey);
            nodeCount += 1;
            if (this.isDocumentType(item.type)) {
              documentCount += 1;
              documents.push({
                token: item.token,
                title: item.name,
                objectType: item.type,
                sourceId: source.id,
                sourceName: source.name,
                targetFolder: source.targetFolder,
                relativePath: this.joinRemotePath(folder.path, item.name),
                url: item.url,
                modifiedAt: item.modifiedAt,
              });
            }
            if (item.type === "folder" && !visitedFolders.has(item.token)) {
              pendingFolders.push({
                token: item.token,
                path: this.joinRemotePath(folder.path, item.name),
              });
            }
          }
        }

        if (!page.hasMore) {
          break;
        }
        if (!page.nextPageToken) {
          missingContinuationRetries += 1;
          if (missingContinuationRetries >= 3) {
            throw new Error(
              `Drive folder ${folderToken} reports more items but did not return a page token after 3 attempts.`,
            );
          }
          continue;
        }
        if (visitedPages.has(`${folderToken}:${page.nextPageToken}`)) {
          throw new Error(
            `Drive folder ${folderToken} returned a repeated page token.`,
          );
        }
        pageToken = page.nextPageToken;
        missingContinuationRetries = 0;
      }
    }

    return {
      sourceId: source.id,
      sourceName: source.name,
      nodeCount,
      documentCount,
      documents,
    };
  }

  private isDocumentType(type: string): boolean {
    return [
      "doc",
      "docx",
      "sheet",
      "bitable",
      "base",
      "slides",
      "mindnote",
    ].includes(type);
  }

  private joinRemotePath(parent: string, name: string): string {
    return parent ? `${parent}/${name}` : name;
  }

  private async scanWikiSource(source: SyncSource): Promise<SourceScanResult> {
    if (!source.remoteId.trim()) {
      throw new Error("Wiki space ID is required.");
    }

    const rootNodeToken = source.rootNodeToken.trim();
    const pending: Array<{ token?: string; path: string }> = [];
    const visitedParents = new Set<string>();
    let nodeCount = 0;
    let documentCount = 0;
    const documents: RemoteDocument[] = [];

    if (rootNodeToken) {
      const root = await this.client.getWikiNode(
        source.remoteId.trim(),
        rootNodeToken,
      );
      nodeCount += 1;
      if (this.isDocumentType(root.objectType ?? "")) {
        documentCount += 1;
        documents.push(this.wikiDocument(source, root, root.title));
      }
      if (root.hasChildren) {
        pending.push({ token: root.token, path: root.title });
      }
    } else {
      pending.push({ path: "" });
    }

    while (pending.length > 0) {
      checkAbort(this.signal);
      if (visitedParents.size > 10_000 || nodeCount > 50_000)
        throw new Error("Wiki scan limit exceeded");
      const parent = pending.shift();
      if (!parent) {
        continue;
      }
      const key = parent.token ?? "__root__";
      if (visitedParents.has(key)) {
        continue;
      }
      visitedParents.add(key);

      const nodes = await this.client.listWikiNodes(
        source.remoteId.trim(),
        parent.token,
      );
      checkAbort(this.signal);
      nodeCount += nodes.length;
      for (const node of nodes) {
        if (this.isDocumentType(node.objectType ?? "")) {
          documentCount += 1;
          documents.push(
            this.wikiDocument(
              source,
              node,
              this.joinRemotePath(parent.path, node.title),
            ),
          );
        }
      }

      for (const node of nodes) {
        if (node.hasChildren) {
          pending.push({
            token: node.token,
            path: this.joinRemotePath(parent.path, node.title),
          });
        }
      }
    }

    return {
      sourceId: source.id,
      sourceName: source.name,
      nodeCount,
      documentCount,
      documents,
    };
  }

  private wikiDocument(
    source: SyncSource,
    node: RemoteNode,
    relativePath: string,
  ): RemoteDocument {
    return {
      token: node.objectToken ?? node.token,
      title: node.title,
      objectType: node.objectType ?? "unknown",
      sourceId: source.id,
      sourceName: source.name,
      targetFolder: source.targetFolder,
      relativePath,
      revision: node.revision,
      modifiedAt: node.modifiedAt,
    };
  }
}
