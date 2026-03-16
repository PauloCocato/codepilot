import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import { logger } from "../utils/logger.js";

export interface CodeChunk {
  readonly filePath: string;
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly language: string;
  readonly type: "function" | "class" | "module" | "config" | "test" | "docs";
}

export interface ChunkMetadata {
  readonly imports: readonly string[];
  readonly exports: readonly string[];
  readonly names: readonly string[];
}

export interface EnrichedCodeChunk extends CodeChunk {
  readonly metadata: ChunkMetadata;
}

const IGNORED_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "__pycache__",
  ".next",
  ".nuxt",
  "coverage",
  ".turbo",
  ".cache",
]);

const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".svg",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".7z",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".mp3",
  ".mp4",
  ".wav",
  ".avi",
  ".mov",
  ".lock",
]);

const LANGUAGE_MAP: Readonly<Record<string, string>> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rb": "ruby",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".php": "php",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".css": "css",
  ".scss": "scss",
  ".html": "html",
  ".vue": "vue",
  ".svelte": "svelte",
  ".sql": "sql",
  ".r": "r",
  ".R": "r",
  ".lua": "lua",
  ".ex": "elixir",
  ".exs": "elixir",
  ".erl": "erlang",
  ".hs": "haskell",
  ".scala": "scala",
  ".dart": "dart",
};

const CONFIG_EXTENSIONS: ReadonlySet<string> = new Set([
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".env",
  ".xml",
  ".cfg",
  ".conf",
]);

const DOC_EXTENSIONS: ReadonlySet<string> = new Set([
  ".md",
  ".mdx",
  ".rst",
  ".txt",
  ".adoc",
]);

const CHUNK_TARGET_MIN = 50;
const CHUNK_TARGET_MAX = 150;
const SMALL_FILE_THRESHOLD = 100;
const OVERLAP_LINES = 10;

function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] ?? (ext.slice(1) || "unknown");
}

function detectFileType(filePath: string, content: string): CodeChunk["type"] {
  const ext = extname(filePath).toLowerCase();
  const baseName = filePath.split("/").pop() ?? "";

  if (
    baseName.includes(".test.") ||
    baseName.includes(".spec.") ||
    baseName.includes("_test.")
  ) {
    return "test";
  }
  if (DOC_EXTENSIONS.has(ext)) {
    return "docs";
  }
  if (
    CONFIG_EXTENSIONS.has(ext) ||
    baseName.startsWith(".") ||
    baseName.includes("config")
  ) {
    return "config";
  }
  if (content.includes("class ")) {
    return "class";
  }
  if (content.includes("function ") || content.includes("=>")) {
    return "function";
  }
  return "module";
}

function extractMetadata(content: string): ChunkMetadata {
  const importRegex = /(?:^|\n)\s*(?:import|from|require)\s+['"]([^'"]+)['"]/g;
  const exportRegex =
    /(?:^|\n)\s*export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g;
  const functionNameRegex =
    /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
  const classNameRegex = /(?:^|\n)\s*(?:export\s+)?class\s+(\w+)/g;
  const defRegex = /(?:^|\n)\s*(?:async\s+)?def\s+(\w+)/g;

  const imports: string[] = [];
  const exports: string[] = [];
  const names: string[] = [];

  let match: RegExpExecArray | null;

  match = importRegex.exec(content);
  while (match !== null) {
    imports.push(match[1]);
    match = importRegex.exec(content);
  }

  match = exportRegex.exec(content);
  while (match !== null) {
    exports.push(match[1]);
    match = exportRegex.exec(content);
  }

  match = functionNameRegex.exec(content);
  while (match !== null) {
    names.push(match[1]);
    match = functionNameRegex.exec(content);
  }

  match = classNameRegex.exec(content);
  while (match !== null) {
    names.push(match[1]);
    match = classNameRegex.exec(content);
  }

  match = defRegex.exec(content);
  while (match !== null) {
    names.push(match[1]);
    match = defRegex.exec(content);
  }

  const uniqueNames = [...new Set(names)];

  return { imports, exports, names: uniqueNames };
}

function isBlockBoundary(line: string): boolean {
  const trimmed = line.trimStart();
  if (/^(?:export\s+)?(?:async\s+)?function\s+/.test(trimmed)) return true;
  if (/^(?:export\s+)?(?:abstract\s+)?class\s+/.test(trimmed)) return true;
  if (/^(?:export\s+)?interface\s+/.test(trimmed)) return true;
  if (/^(?:export\s+)?type\s+\w+\s*=/.test(trimmed)) return true;
  if (/^(?:export\s+)?enum\s+/.test(trimmed)) return true;
  if (/^(?:async\s+)?def\s+/.test(trimmed)) return true;
  if (/^class\s+\w+/.test(trimmed)) return true;
  if (/^func\s+/.test(trimmed)) return true;
  if (/^(?:pub\s+)?(?:async\s+)?fn\s+/.test(trimmed)) return true;
  if (/^(?:pub\s+)?struct\s+/.test(trimmed)) return true;
  if (/^impl\s+/.test(trimmed)) return true;
  if (
    /^(?:public|private|protected|internal)\s+(?:static\s+)?(?:class|interface|enum|fun|void|int|string|async)/.test(
      trimmed,
    )
  )
    return true;

  return false;
}

function splitByLogicalBlocks(
  lines: readonly string[],
): readonly { readonly start: number; readonly end: number }[] {
  const boundaries: number[] = [0];

  for (let i = 1; i < lines.length; i++) {
    if (isBlockBoundary(lines[i])) {
      boundaries.push(i);
    }
  }

  const blocks: { readonly start: number; readonly end: number }[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i];
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : lines.length;
    const blockSize = end - start;

    if (blockSize <= CHUNK_TARGET_MAX) {
      blocks.push({ start, end });
    } else {
      let chunkStart = start;
      while (chunkStart < end) {
        const chunkEnd = Math.min(chunkStart + CHUNK_TARGET_MAX, end);
        blocks.push({ start: chunkStart, end: chunkEnd });
        chunkStart = chunkEnd - OVERLAP_LINES;
        if (chunkStart >= end) break;
      }
    }
  }

  const merged: { start: number; end: number }[] = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    if (
      last &&
      block.end - last.start <= CHUNK_TARGET_MAX &&
      block.end - block.start < CHUNK_TARGET_MIN
    ) {
      merged[merged.length - 1] = { start: last.start, end: block.end };
    } else {
      merged.push({ start: block.start, end: block.end });
    }
  }

  return merged;
}

function chunkFile(
  filePath: string,
  content: string,
): readonly EnrichedCodeChunk[] {
  const lines = content.split("\n");
  const language = detectLanguage(filePath);
  const fileType = detectFileType(filePath, content);

  if (lines.length <= SMALL_FILE_THRESHOLD) {
    const metadata = extractMetadata(content);
    return [
      {
        filePath,
        content,
        startLine: 1,
        endLine: lines.length,
        language,
        type: fileType,
        metadata,
      },
    ];
  }

  const blocks = splitByLogicalBlocks(lines);
  return blocks.map((block) => {
    const chunkContent = lines.slice(block.start, block.end).join("\n");
    const chunkType = detectFileType(filePath, chunkContent);
    const metadata = extractMetadata(chunkContent);

    return {
      filePath,
      content: chunkContent,
      startLine: block.start + 1,
      endLine: block.end,
      language,
      type: chunkType,
      metadata,
    };
  });
}

async function collectFiles(dirPath: string): Promise<readonly string[]> {
  const files: string[] = [];

  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const nested = await collectFiles(fullPath);
      files.push(...nested);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) continue;

      const fileStats = await stat(fullPath);
      if (fileStats.size > 1_048_576) continue;

      files.push(fullPath);
    }
  }

  return files;
}

export async function chunkCodebase(
  repoPath: string,
): Promise<readonly EnrichedCodeChunk[]> {
  const log = logger.child({ module: "chunker" });
  const allFiles = await collectFiles(repoPath);

  log.info({ totalFiles: allFiles.length }, "Collected files for chunking");

  const chunks: EnrichedCodeChunk[] = [];
  const languageCounts: Record<string, number> = {};

  for (const filePath of allFiles) {
    try {
      const content = await readFile(filePath, "utf-8");
      if (content.trim().length === 0) continue;

      const relativePath = relative(repoPath, filePath);
      const fileChunks = chunkFile(relativePath, content);

      for (const chunk of fileChunks) {
        chunks.push(chunk);
        languageCounts[chunk.language] =
          (languageCounts[chunk.language] ?? 0) + 1;
      }
    } catch {
      log.warn({ filePath }, "Failed to read file, skipping");
    }
  }

  const detectedLanguages = Object.keys(languageCounts);
  log.info(
    {
      totalFiles: allFiles.length,
      totalChunks: chunks.length,
      languages: detectedLanguages,
      languageCounts,
    },
    "Chunking complete",
  );

  return chunks;
}

export {
  detectLanguage,
  detectFileType,
  extractMetadata,
  isBlockBoundary,
  splitByLogicalBlocks,
  chunkFile,
  IGNORED_DIRS,
  BINARY_EXTENSIONS,
};
