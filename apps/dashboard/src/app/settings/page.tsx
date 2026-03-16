'use client';

import { useState } from 'react';
import { Header } from '@/components/header';

interface Settings {
  readonly llmProvider: string;
  readonly maxCostPerRun: number;
  readonly safetyThreshold: number;
  readonly enabledCategories: {
    readonly codeExecution: boolean;
    readonly fileSystem: boolean;
    readonly networkAccess: boolean;
    readonly secretsAccess: boolean;
    readonly gitOperations: boolean;
  };
}

const DEFAULT_SETTINGS: Settings = {
  llmProvider: 'claude',
  maxCostPerRun: 2.0,
  safetyThreshold: 80,
  enabledCategories: {
    codeExecution: true,
    fileSystem: true,
    networkAccess: false,
    secretsAccess: false,
    gitOperations: true,
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  codeExecution: 'Code Execution',
  fileSystem: 'File System Access',
  networkAccess: 'Network Access',
  secretsAccess: 'Secrets Access',
  gitOperations: 'Git Operations',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  function handleProviderChange(llmProvider: string) {
    setSettings({ ...settings, llmProvider });
    setSaved(false);
  }

  function handleMaxCostChange(value: string) {
    const maxCostPerRun = parseFloat(value) || 0;
    setSettings({ ...settings, maxCostPerRun });
    setSaved(false);
  }

  function handleThresholdChange(value: string) {
    const safetyThreshold = parseInt(value, 10) || 0;
    setSettings({ ...settings, safetyThreshold });
    setSaved(false);
  }

  function handleCategoryToggle(category: string) {
    const key = category as keyof Settings['enabledCategories'];
    setSettings({
      ...settings,
      enabledCategories: {
        ...settings.enabledCategories,
        [key]: !settings.enabledCategories[key],
      },
    });
    setSaved(false);
  }

  function handleSave() {
    // TODO: persist settings to API
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="flex flex-col">
      <Header
        title="Settings"
        description="Configure your CodePilot agent"
        actions={
          <button
            onClick={handleSave}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          >
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
        }
      />

      <div className="mx-auto w-full max-w-3xl space-y-8 p-8">
        {/* LLM Provider */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-semibold text-zinc-100">LLM Provider</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Select the primary LLM provider for agent operations.
          </p>
          <div className="mt-4">
            <select
              value={settings.llmProvider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-200 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            >
              <option value="claude">Claude (Anthropic)</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
        </section>

        {/* Max Cost per Run */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-semibold text-zinc-100">Max Cost per Run</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Maximum allowed cost (USD) for a single agent run. The agent will stop if this limit is reached.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-zinc-400">$</span>
            <input
              type="number"
              min="0.10"
              max="50.00"
              step="0.10"
              value={settings.maxCostPerRun}
              onChange={(e) => handleMaxCostChange(e.target.value)}
              className="w-32 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-200 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <span className="text-sm text-zinc-500">USD</span>
          </div>
        </section>

        {/* Safety Threshold */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-semibold text-zinc-100">Safety Threshold</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Minimum safety score required to submit a PR. Lower values allow more permissive patches.
          </p>
          <div className="mt-4 space-y-3">
            <input
              type="range"
              min="0"
              max="100"
              value={settings.safetyThreshold}
              onChange={(e) => handleThresholdChange(e.target.value)}
              className="w-full accent-emerald-500"
            />
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Permissive (0)</span>
              <span
                className={`font-bold ${
                  settings.safetyThreshold >= 80
                    ? 'text-emerald-400'
                    : settings.safetyThreshold >= 50
                      ? 'text-amber-400'
                      : 'text-red-400'
                }`}
              >
                {settings.safetyThreshold}%
              </span>
              <span className="text-zinc-500">Strict (100)</span>
            </div>
          </div>
        </section>

        {/* Safety Categories */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-semibold text-zinc-100">Safety Categories</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Enable or disable specific safety evaluation categories.
          </p>
          <div className="mt-4 space-y-3">
            {Object.entries(settings.enabledCategories).map(([key, enabled]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-800 p-4 transition-colors hover:bg-zinc-800/50"
              >
                <span className="text-sm font-medium text-zinc-200">
                  {CATEGORY_LABELS[key]}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => handleCategoryToggle(key)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    enabled ? 'bg-emerald-600' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
