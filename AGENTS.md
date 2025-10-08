# AGENTS.md

## Project Overview

Zigbee2MQTT is a Zigbee to MQTT bridge that allows you to use your Zigbee devices without the vendor's bridge or gateway. It bridges events and allows you to control Zigbee devices via MQTT, integrating them with any smart home infrastructure.

### Architecture

- **Language**: TypeScript 5.9.3 compiled to JavaScript (ES modules with NodeNext resolution)
- **Runtime**: Node.js (versions 20, 22, or 24)
- **Package Manager**: pnpm 10.12.1 (strictly enforced via `packageManager` field)
- **Core Dependencies**: 
  - `zigbee-herdsman` (6.2.0 - exact version, handles Zigbee adapter communication)
  - `zigbee-herdsman-converters` (25.42.0 - exact version, device definitions)
  - `mqtt` (5.14.1 - MQTT client)
  - `winston` (3.18.3 - logging)

### Project Structure

```
lib/                    # TypeScript source code
├── controller.ts       # Main controller orchestrating components
├── mqtt.ts            # MQTT client management
├── zigbee.ts          # Zigbee network management
├── state.ts           # State management
├── eventBus.ts        # Event-driven communication
├── extension/         # Extension system (plugins)
│   └── extension.ts   # Abstract base class
├── model/             # Domain models (Device, Group)
├── util/              # Utility functions
└── types/             # TypeScript type definitions
test/                  # Vitest test files with mocks
data/                  # Runtime configuration and database
dist/                  # Compiled JavaScript output
```

## Setup Commands

### Prerequisites

- Node.js version 20, 22, or 24
- pnpm 10.12.1 (will be auto-installed via corepack if not present)

### Installation

```bash
# Install dependencies (uses pnpm lockfile)
pnpm install --frozen-lockfile

# For development without lockfile restrictions
pnpm install
```

### Initial Build

```bash
# Full build (TypeScript compilation + hash generation)
pnpm run build

# Build type definitions only
pnpm run build:types
```

## Development Workflow

### Starting Development

```bash
# Watch mode - recompile on file changes
pnpm run build:watch

# In another terminal, start Zigbee2MQTT
pnpm start
```

### Code Quality Checks

```bash
# Run Biome linter and formatter (check only)
pnpm run check

# Auto-fix linting and formatting issues
pnpm run check:w

# The check runs with --error-on-warnings flag
# Configuration: biome.json (4-space indent, 150 line width, no bracket spacing)
```

### Clean Build

```bash
# Remove build artifacts
pnpm run clean

# Removes: coverage/, dist/, tsconfig.tsbuildinfo
```

## Testing Instructions

### Running Tests

```bash
# Run all tests once
pnpm test

# Run tests with coverage report
pnpm run test:coverage

# Watch mode - re-run tests on changes
pnpm run test:watch

# Run benchmarks
pnpm run bench
```

### Test Requirements

- **Coverage**: 100% code coverage is enforced (configured in `test/vitest.config.mts`)
- **Framework**: Vitest 3.1.1 with @vitest/coverage-v8
- **Test Files**: Located in `test/` directory with `.test.ts` extension
- **Mocks**: Centralized in `test/mocks/` directory
- **Coverage Report**: Generated in `coverage/` directory (HTML report at `coverage/index.html`)

### Running Specific Tests

```bash
# Run tests matching a pattern
pnpm vitest run -t "test name pattern" --config ./test/vitest.config.mts

# Run specific test file
pnpm vitest run test/controller.test.ts --config ./test/vitest.config.mts

# Focus on one test area in watch mode
pnpm vitest watch -t "Extension" --config ./test/vitest.config.mts
```

## Code Style Guidelines

### TypeScript Conventions

- **Module System**: ES modules with NodeNext resolution
- **Target**: ESNext
- **Strict Mode**: Enabled (`noImplicitAny`, `noImplicitThis`)
- **Decorators**: Experimental decorators enabled (used for `@bind` from `bind-decorator`)

### Import Order

1. Node.js built-in modules (with `node:` prefix)
2. Third-party libraries
3. Type-only imports from external packages (using `type` keyword)
4. Internal absolute imports
5. Type-only imports from internal modules

Example:
```typescript
import fs from "node:fs";
import bind from "bind-decorator";
import type {IClientOptions} from "mqtt";
import {connectAsync} from "mqtt";
import type {Zigbee2MQTTAPI} from "./types/api";
import logger from "./util/logger";
```

### Naming Conventions

- **Classes**: PascalCase (e.g., `Extension`, `Device`)
- **Functions/Methods**: camelCase (e.g., `publishEntityState`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `CURRENT_VERSION`)
- **Interfaces/Types**: PascalCase (e.g., `MqttPublishOptions`)
- **Files**: camelCase for TypeScript (e.g., `eventBus.ts`)

### Code Patterns

- **Async/Await**: Always use async/await, explicitly type return as `Promise<Type>`
- **Error Handling**: Use `throw new Error("message")`, log with winston logger
- **Event Handlers**: Use `@bind` decorator to preserve `this` context
- **Logging**: Use `logger.info()`, `logger.warning()`, `logger.error()`, `logger.debug()`

### Formatting Rules (Biome)

- 4-space indentation
- 150 character line width
- No bracket spacing in objects
- Run `pnpm run check:w` to auto-format

## Build and Deployment

### Build Process

```bash
# Production build
pnpm run build

# Outputs:
# - Compiled JavaScript in dist/
# - Type definitions in dist/types/
# - Includes hash generation for version tracking
```

### Pre-publish

```bash
# Automatically runs before publishing
pnpm run prepack

# Performs: clean + build
```

### Environment Setup

- Configuration stored in `data/configuration.yaml`
- Database in `data/database.db`
- Logs in `data/log/`
- External extensions in `data/external_extensions/`
- External converters in `data/external_converters/`

## Architecture Patterns

### Extension System

All features are implemented as extensions that inherit from the abstract `Extension` base class:

```typescript
abstract class Extension {
    protected zigbee: Zigbee;
    protected mqtt: Mqtt;
    protected state: State;
    protected publishEntityState: PublishEntityState;
    protected eventBus: EventBus;
    
    async start(): Promise<void> {}  // Initialize extension
    async stop(): Promise<void> {}   // Cleanup extension
}
```

**Key Points**:
- Constructor should only assign properties (no side effects)
- Initialization happens in `start()` method
- Use EventBus for inter-component communication
- Extensions are loaded and managed by the Controller

### Event-Driven Communication

Components communicate via the strongly-typed EventBus:

```typescript
// Emit events
this.eventBus.emit('deviceMessage', {device, message});

// Listen to events
this.eventBus.on('deviceMessage', this.onDeviceMessage, this);
```

### Dependency Injection

The Controller instantiates and injects dependencies into all extensions. Follow this pattern when creating new extensions.

## Pull Request Guidelines

### Target Branch

- **Always create PRs against the `dev` branch**
- The `master` branch is for production releases only

### Before Submitting

```bash
# Run all checks
pnpm run check
pnpm test

# Ensure 100% code coverage
pnpm run test:coverage

# Build successfully
pnpm run build
```

### PR Requirements

- All CI checks must pass (linting, tests, build)
- 100% test coverage maintained
- Code follows Biome formatting rules
- Commit messages should be descriptive
- Reference related issues when applicable

### CI Pipeline

The GitHub Actions CI workflow (`.github/workflows/ci.yml`) runs:
1. Biome code quality checks (`pnpm run check`)
2. TypeScript compilation (`pnpm run build`)
3. Full test suite with coverage (`pnpm run test:coverage`)
4. Benchmarks (on dev branch and PRs)
5. Docker image builds (on dev branch and tags)

## Working with Device Support

### Adding New Devices

**Important**: Device support is NOT added to this repository. All device definitions live in `zigbee-herdsman-converters`.

- Follow the guide at: https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html
- No changes to zigbee2mqtt codebase are needed for new devices
- Device definitions are automatically picked up from `zigbee-herdsman-converters`

## Debugging and Troubleshooting

### Development Setup

For the easiest development experience, set up a bare-metal installation following:
https://www.zigbee2mqtt.io/guide/installation/01_linux.html

### Logging

- Winston logger is initialized in `lib/util/logger.ts`
- Log levels: `error`, `warning`, `info`, `debug`
- Logs are written to console and/or file based on configuration
- Use structured logging with context (device names, IEEE addresses)

### Common Issues

1. **Import errors after file moves**: Run `pnpm run check` to verify TypeScript and ESLint
2. **Test failures**: Check if mocks in `test/mocks/` need updates
3. **Build errors**: Ensure Node.js version is 20, 22, or 24
4. **Coverage issues**: View HTML report at `coverage/index.html` to identify uncovered code

### Performance Considerations

- Use `rimrafSync` for synchronous file operations
- Leverage async/await to avoid blocking
- Cache computed values in getters when appropriate
- EventBus provides loose coupling between components

## Critical Version Requirements

### Exact Versions

These dependencies use **exact versions** (no semver ranges) - do not upgrade without thorough testing:

- `zigbee-herdsman@6.2.0` - Critical for Zigbee protocol compatibility
- `zigbee-herdsman-converters@25.42.0` - Device definitions must match herdsman version

### Node.js Compatibility

Only these Node.js versions are supported:
- Node.js 20.x
- Node.js 22.x  
- Node.js 24.x

Using other versions may cause runtime errors or incompatibilities.

## Additional Notes

### Package Manager

This project **requires pnpm 10.12.1**. The `packageManager` field in package.json enforces this via Corepack.

Do not use npm or yarn - they will not respect the pnpm-specific configuration.

### TypeScript Compilation

- Source files in `lib/` are compiled to `dist/`
- Type definitions exported from `dist/types/api.d.ts`
- Source maps are inlined for debugging
- Uses composite project references for faster incremental builds

### External Extensions

To load external extensions:
1. Place JavaScript files in `data/external_extensions/`
2. They will be automatically loaded on startup
3. No configuration changes needed

### Code Quality Tools

- **Linting/Formatting**: Biome 2.2.5 (replaces ESLint + Prettier)
- **Type Checking**: TypeScript 5.9.3
- **Testing**: Vitest 3.1.1
- **Coverage**: @vitest/coverage-v8

### Documentation

- Main documentation: https://www.zigbee2mqtt.io/
- Contributing guide: `CONTRIBUTING.md`
- Coding standards: `.github/copilot-instructions.md`
- Issue tracker: https://github.com/Koenkk/zigbee2mqtt/issues
