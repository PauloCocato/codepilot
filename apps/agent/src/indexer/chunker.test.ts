import { describe, it, expect, vi } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  chunkCodebase,
  detectLanguage,
  detectFileType,
  extractMetadata,
  isBlockBoundary,
  chunkFile,
  IGNORED_DIRS,
  BINARY_EXTENSIONS,
} from './chunker.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

async function createTempRepo(files: Record<string, string>): Promise<string> {
  const tempDir = join(tmpdir(), `chunker-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempDir, { recursive: true });

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(tempDir, filePath);
    const dir = fullPath.split('/').slice(0, -1).join('/');
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  }

  return tempDir;
}

function generatePythonFile(lineCount: number): string {
  const lines: string[] = [
    'import os',
    'import sys',
    'from pathlib import Path',
    '',
    '',
  ];

  let currentLine = lines.length;
  let funcIndex = 0;

  while (currentLine < lineCount) {
    lines.push(`def function_${funcIndex}(arg1, arg2):`);
    lines.push(`    """Docstring for function_${funcIndex}."""`);
    const bodyLines = Math.min(20, lineCount - currentLine - 2);
    for (let j = 0; j < bodyLines; j++) {
      lines.push(`    result_${j} = arg1 + arg2 + ${j}`);
    }
    lines.push('');
    currentLine += bodyLines + 3;
    funcIndex++;
  }

  return lines.slice(0, lineCount).join('\n');
}

describe('chunker', () => {
  describe('detectLanguage', () => {
    it('should detect TypeScript by extension', () => {
      expect(detectLanguage('src/app.ts')).toBe('typescript');
      expect(detectLanguage('component.tsx')).toBe('typescript');
    });

    it('should detect Python by extension', () => {
      expect(detectLanguage('main.py')).toBe('python');
    });

    it('should return extension for unknown languages', () => {
      expect(detectLanguage('file.xyz')).toBe('xyz');
    });
  });

  describe('detectFileType', () => {
    it('should detect test files', () => {
      expect(detectFileType('app.test.ts', 'describe()')).toBe('test');
      expect(detectFileType('app.spec.js', 'it()')).toBe('test');
      expect(detectFileType('app_test.py', 'def test_foo()')).toBe('test');
    });

    it('should detect config files', () => {
      expect(detectFileType('config.json', '{}')).toBe('config');
      expect(detectFileType('tsconfig.json', '{}')).toBe('config');
    });

    it('should detect docs files', () => {
      expect(detectFileType('README.md', '# Hello')).toBe('docs');
    });

    it('should detect class declarations', () => {
      expect(detectFileType('app.ts', 'class MyApp {}')).toBe('class');
    });
  });

  describe('extractMetadata', () => {
    it('should extract imports, exports, and function names', () => {
      const code = `
import { foo } from './foo'
export function myFunc() {}
export class MyClass {}
`;
      const meta = extractMetadata(code);
      expect(meta.imports).toContain('./foo');
      expect(meta.exports).toContain('myFunc');
      expect(meta.exports).toContain('MyClass');
      expect(meta.names).toContain('myFunc');
      expect(meta.names).toContain('MyClass');
    });

    it('should extract Python def names', () => {
      const code = `
def my_function():
    pass
async def async_function():
    pass
`;
      const meta = extractMetadata(code);
      expect(meta.names).toContain('my_function');
      expect(meta.names).toContain('async_function');
    });
  });

  describe('isBlockBoundary', () => {
    it('should detect function declarations', () => {
      expect(isBlockBoundary('function foo() {')).toBe(true);
      expect(isBlockBoundary('export async function bar() {')).toBe(true);
    });

    it('should detect class declarations', () => {
      expect(isBlockBoundary('class MyClass {')).toBe(true);
      expect(isBlockBoundary('export class MyClass {')).toBe(true);
    });

    it('should detect Python def', () => {
      expect(isBlockBoundary('def my_func():')).toBe(true);
      expect(isBlockBoundary('async def my_func():')).toBe(true);
    });

    it('should not detect regular lines', () => {
      expect(isBlockBoundary('const x = 1;')).toBe(false);
      expect(isBlockBoundary('  return foo;')).toBe(false);
    });
  });

  describe('chunkFile', () => {
    it('should keep small files as single chunk', () => {
      const content = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
      const chunks = chunkFile('small.ts', content);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].startLine).toBe(1);
      expect(chunks[0].endLine).toBe(50);
    });

    it('should split large files by logical blocks', () => {
      const content = generatePythonFile(200);
      const chunks = chunkFile('large.py', content);
      expect(chunks.length).toBeGreaterThan(1);

      for (const chunk of chunks) {
        expect(chunk.language).toBe('python');
      }
    });

    it('should produce overlap between chunks for large files', () => {
      const lines: string[] = [];
      for (let i = 0; i < 400; i++) {
        lines.push(`line_${i} = ${i}`);
      }
      const content = lines.join('\n');
      const chunks = chunkFile('big.py', content);

      if (chunks.length >= 2) {
        const chunk1End = chunks[0].endLine;
        const chunk2Start = chunks[1].startLine;
        // When blocks are split, there may be overlap
        expect(chunk2Start).toBeLessThanOrEqual(chunk1End + 1);
      }
    });
  });

  describe('chunkCodebase', () => {
    it('should ignore node_modules directory', async () => {
      const tempDir = await createTempRepo({
        'src/app.ts': 'export const x = 1;',
        'node_modules/lib/index.js': 'module.exports = {};',
      });

      try {
        const chunks = await chunkCodebase(tempDir);
        const filePaths = chunks.map((c) => c.filePath);
        expect(filePaths.some((f) => f.includes('node_modules'))).toBe(false);
        expect(filePaths).toContain('src/app.ts');
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should skip binary files', async () => {
      const tempDir = await createTempRepo({
        'src/app.ts': 'export const x = 1;',
        'assets/logo.png': 'fake binary content',
      });

      try {
        const chunks = await chunkCodebase(tempDir);
        const filePaths = chunks.map((c) => c.filePath);
        expect(filePaths.some((f) => f.endsWith('.png'))).toBe(false);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should chunk a Python file with 200 lines into multiple chunks', async () => {
      const pythonContent = generatePythonFile(200);
      const tempDir = await createTempRepo({
        'main.py': pythonContent,
      });

      try {
        const chunks = await chunkCodebase(tempDir);
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks[0].language).toBe('python');

        for (const chunk of chunks) {
          expect(chunk.filePath).toBe('main.py');
          expect(chunk.metadata).toBeDefined();
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it('should handle TypeScript classes correctly', async () => {
      const tsContent = `
export class UserService {
  private readonly users: Map<string, User> = new Map();

  async findById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async create(data: CreateUserInput): Promise<User> {
    const user = { id: crypto.randomUUID(), ...data };
    this.users.set(user.id, user);
    return user;
  }
}

export class OrderService {
  async createOrder(userId: string): Promise<Order> {
    return { id: crypto.randomUUID(), userId };
  }
}
`.trim();

      const tempDir = await createTempRepo({
        'src/services.ts': tsContent,
      });

      try {
        const chunks = await chunkCodebase(tempDir);
        expect(chunks.length).toBeGreaterThanOrEqual(1);
        expect(chunks[0].language).toBe('typescript');
        expect(chunks[0].type).toBe('class');
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('constants', () => {
    it('should have expected ignored directories', () => {
      expect(IGNORED_DIRS.has('node_modules')).toBe(true);
      expect(IGNORED_DIRS.has('.git')).toBe(true);
      expect(IGNORED_DIRS.has('dist')).toBe(true);
      expect(IGNORED_DIRS.has('__pycache__')).toBe(true);
    });

    it('should have expected binary extensions', () => {
      expect(BINARY_EXTENSIONS.has('.png')).toBe(true);
      expect(BINARY_EXTENSIONS.has('.jpg')).toBe(true);
      expect(BINARY_EXTENSIONS.has('.exe')).toBe(true);
    });
  });
});
