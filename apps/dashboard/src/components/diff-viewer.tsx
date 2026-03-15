interface DiffViewerProps {
  readonly patch: string;
}

function classifyLine(line: string): 'add' | 'remove' | 'header' | 'range' | 'context' {
  if (line.startsWith('+++') || line.startsWith('---')) return 'header';
  if (line.startsWith('@@')) return 'range';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'remove';
  return 'context';
}

const LINE_STYLES = {
  add: 'bg-emerald-500/10 text-emerald-300',
  remove: 'bg-red-500/10 text-red-300',
  header: 'text-zinc-400 font-bold',
  range: 'text-blue-400 bg-blue-500/5',
  context: 'text-zinc-400',
} as const;

export function DiffViewer({ patch }: DiffViewerProps) {
  const lines = patch.split('\n');

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950">
      <pre className="text-sm leading-relaxed">
        <code>
          {lines.map((line, index) => {
            const type = classifyLine(line);
            return (
              <div
                key={index}
                className={`px-4 py-0.5 ${LINE_STYLES[type]}`}
              >
                {line || '\u00A0'}
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
