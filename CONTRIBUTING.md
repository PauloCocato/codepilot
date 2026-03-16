# Contributing to CodePilot

Thank you for your interest in contributing to CodePilot! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for sandbox tests)
- Redis (for job queue)
- Git

### Setup

```bash
# Fork and clone
git clone https://github.com/<your-username>/codepilot.git
cd codepilot

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Fill in your API keys in .env

# Build all packages
npm run build

# Run tests to verify setup
npm run test
```

## Development Workflow

### 1. Create a branch

```bash
git checkout -b feat/my-feature    # New feature
git checkout -b fix/bug-name       # Bug fix
git checkout -b refactor/module    # Refactoring
```

### 2. Write tests first (TDD)

1. Write a failing test
2. Implement the minimum code to pass
3. Refactor
4. Verify 80%+ coverage

### 3. Code quality

```bash
npm run test        # All tests pass
npm run typecheck   # No type errors
npm run lint        # No lint errors
```

### 4. Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new LLM provider adapter
fix: handle division by zero in sandbox
refactor: extract common validation logic
test: add E2E tests for agent loop
docs: update architecture diagram
```

### 5. Open a Pull Request

- Fill in the PR template
- Reference any related issues
- Ensure CI passes

## Code Conventions

- **Files**: `kebab-case.ts`
- **Interfaces/Types**: `PascalCase`
- **Functions/variables**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Immutability**: Always create new objects, never mutate
- **Error handling**: Use Result pattern for operations that can fail
- **Validation**: Use Zod for external input validation
- **Logging**: Use Pino structured logging

## Reporting Issues

- Use the [Bug Report](https://github.com/PauloCocato/codepilot/issues/new?template=bug_report.md) template
- Use the [Feature Request](https://github.com/PauloCocato/codepilot/issues/new?template=feature_request.md) template

## Security

If you find a security vulnerability, please follow our [Security Policy](.github/SECURITY.md). Do **not** open a public issue.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
