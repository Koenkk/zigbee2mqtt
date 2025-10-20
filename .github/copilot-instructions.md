# GitHub Copilot Instructions

## Priority Guidelines

When generating code for this repository:

1. **Version Compatibility**: Always detect and respect the exact versions of languages, frameworks, and libraries used in this project
2. **Context Files**: Prioritize patterns and standards defined in the .github/copilot directory
3. **Codebase Patterns**: When context files don't provide specific guidance, scan the codebase for established patterns
4. **Architectural Consistency**: Maintain our layered architectural style with clear separation between controller, extensions, models, and utilities
5. **Code Quality**: Prioritize maintainability, performance, security, and testability in all generated code

## Technology Stack

### Core Technologies
- **Language**: TypeScript 5.9.3 with target `esnext` and module `NodeNext`
- **Runtime**: Node.js ^20 || ^22 || ^24
- **Package Manager**: pnpm 10.12.1
- **Testing**: Vitest 3.1.1 with @vitest/coverage-v8
- **Linting/Formatting**: Biome 2.2.5 (configured with 4-space indents, 150 line width, no bracket spacing)

### Key Dependencies
- **zigbee-herdsman**: 6.2.0 (exact version - critical for Zigbee protocol compatibility)
- **zigbee-herdsman-converters**: 25.42.0 (exact version - device definitions)
- **MQTT**: mqtt 5.14.1
- **Logging**: winston 3.18.3
- **YAML**: js-yaml 4.1.0
- **Decorators**: bind-decorator 1.0.11
- **WebSocket**: ws 8.18.1

### TypeScript Configuration
- **Strict Mode**: Enabled with `noImplicitAny` and `noImplicitThis`
- **Module System**: NodeNext with ESM interop
- **Decorators**: Experimental decorators enabled
- **Composite**: True (for project references)
- **Source Maps**: Inline source maps enabled
- **Output**: Compiled to `dist/` directory

## Project Architecture

### Directory Structure
```
lib/                    # Source TypeScript files
├── controller.ts       # Main controller orchestrating all components
├── mqtt.ts            # MQTT client management
├── zigbee.ts          # Zigbee network management
├── state.ts           # State management
├── eventBus.ts        # Event-driven communication
├── extension/         # Extension system (plugins)
│   ├── extension.ts   # Abstract base class
│   ├── availability.ts
│   ├── bind.ts
│   ├── bridge.ts
│   ├── configure.ts
│   └── ...
├── model/             # Domain models
│   ├── device.ts
│   └── group.ts
├── util/              # Utility functions
│   ├── logger.ts
│   ├── settings.ts
│   ├── utils.ts
│   └── ...
└── types/             # TypeScript type definitions
    └── api.ts
test/                  # Vitest test files
data/                  # Runtime configuration and data
```

### Architectural Patterns

#### Extension Pattern
All extensions inherit from the abstract `Extension` base class:
```typescript
abstract class Extension {
    protected zigbee: Zigbee;
    protected mqtt: Mqtt;
    protected state: State;
    protected publishEntityState: PublishEntityState;
    protected eventBus: EventBus;
    
    async start(): Promise<void> {}
    async stop(): Promise<void> {}
}
```

#### Event-Driven Architecture
Use the `EventBus` for component communication. Events are strongly typed:
```typescript
interface EventBusMap {
    deviceMessage: [data: eventdata.DeviceMessage];
    mqttMessage: [data: eventdata.MQTTMessage];
    publishEntityState: [data: eventdata.PublishEntityState];
    // ... other events
}
```

#### Dependency Injection
The `Controller` class instantiates and injects dependencies into extensions. Follow this pattern when creating new extensions.

## Code Style and Conventions

### Naming Conventions
- **Classes**: PascalCase (e.g., `Extension`, `Device`, `EventBus`)
- **Interfaces/Types**: PascalCase (e.g., `MqttPublishOptions`, `DeviceOptions`)
- **Functions/Methods**: camelCase (e.g., `publishEntityState`, `enableDisableExtension`)
- **Constants**: SCREAMING_SNAKE_CASE for top-level constants (e.g., `CURRENT_VERSION`, `LOG_LEVELS`)
- **Private members**: Prefix with underscore for private class fields only when needed to distinguish from public properties (e.g., `_definitionModelID`)
- **Files**: camelCase for TypeScript files (e.g., `eventBus.ts`, `externalJS.ts`)

### Import Organization
Follow this import order (separated by blank lines):
1. Node.js built-in modules (use `node:` prefix: `import fs from "node:fs"`)
2. Third-party libraries (e.g., `bind-decorator`, `mqtt`)
3. Type-only imports from external packages (using `type` keyword)
4. Internal absolute imports from project root
5. Type-only imports from internal modules

Example:
```typescript
import fs from "node:fs";
import bind from "bind-decorator";
import type {IClientOptions} from "mqtt";
import {connectAsync} from "mqtt";
import type {Zigbee2MQTTAPI} from "./types/api";
import logger from "./util/logger";
import * as settings from "./util/settings";
```

### Type Annotations
- Use `type` imports for TypeScript types: `import type * as zhc from "zigbee-herdsman-converters"`
- Explicitly type function parameters and return types
- Use `KeyValue` type for generic object payloads: `type KeyValue = Record<string, any>`
- Prefer interfaces for object shapes, type aliases for unions/intersections
- Use namespace exports for related types: `export type * as ZSpec from "zigbee-herdsman/dist/zspec"`

### Async/Await Patterns
- Always use `async/await` for asynchronous operations
- Return types should be explicitly `Promise<Type>`
- Methods that don't return values should be `Promise<void>`
- Use `Awaited<ReturnType<typeof fn>>` for inferring async function return types

### Decorators
Use `@bind` decorator from `bind-decorator` for methods that need `this` binding:
```typescript
@bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
    // Implementation
}
```

### Error Handling
- Use `throw new Error("message")` for explicit errors
- Include descriptive error messages
- Log errors using the logger: `logger.error("message")`
- For Zigbee-herdsman errors, log the stack trace: `logger.error((error as Error).stack!)`
- Catch and handle errors at appropriate boundaries (controller level)

### Logging
Use the centralized logger (winston-based):
```typescript
import logger from "./util/logger";

logger.info("message");
logger.warning("message");
logger.error("message");
logger.debug("message");
```

- Use namespaced loggers for specific modules (created internally by logger)
- Log levels: `error`, `warning`, `info`, `debug` (from most to least critical)
- Include relevant context in log messages (device names, IEEE addresses, etc.)

## Code Quality Standards

### Maintainability
- Write self-documenting code with clear, descriptive names
- Keep methods focused on single responsibilities
- Abstract classes should define clear contracts with protected members for subclasses
- Use constructor dependency injection for required dependencies
- Limit function complexity - methods should be concise and focused
- Use TypeScript's strict mode features (`noImplicitAny`, `noImplicitThis`)

### Performance
- Use `rimrafSync` for synchronous file deletion when appropriate
- Leverage async/await for I/O operations to avoid blocking
- Use JSON stable stringify for consistent object serialization: `json-stable-stringify-without-jsonify`
- Cache computed values when appropriate (see device model patterns)
- Use getter methods for computed properties that should be cached

### Security
- Validate input using Ajv JSON schema validation (see `settings.ts` pattern)
- Sanitize file paths using `path.join` from Node.js
- Use YAML safe loading: `yaml.safeLoad()`
- Handle sensitive data (credentials, tokens) through settings with proper defaults
- Never log sensitive information (passwords, tokens)

### Testability
- Write tests using Vitest with describe/it/expect patterns
- Mock external dependencies using Vitest's `vi.mock()`
- Use `beforeEach`, `afterEach`, `beforeAll`, `afterAll` for test setup/teardown
- Place test files in `test/` directory with `.test.ts` extension
- Mock constructors and modules in the pattern shown in `test/controller.test.ts`
- Use `flushPromises()` utility for async test synchronization
- Target 100% code coverage (configured in vitest.config.mts)

## Testing Standards

### Unit Testing Structure
```typescript
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

describe("ComponentName", () => {
    beforeEach(() => {
        // Setup
    });

    it("Should do something specific", async () => {
        // Arrange
        const input = {};
        
        // Act
        const result = await someFunction(input);
        
        // Assert
        expect(result).toBe(expected);
    });
});
```

### Mocking Patterns
- Create mock modules in `test/mocks/` directory
- Use `vi.fn()` for function mocks
- Use `vi.mock()` for module mocks
- Clear mocks in `afterEach` or between tests
- Mock external libraries like `mqtt`, `zigbee-herdsman` consistently

### Test Coverage
- All code in `lib/**` should be covered
- Use coverage reports: `pnpm test:coverage`
- Thresholds set to 100% (can be adjusted per project needs)
- Tests should cover both success and failure paths

## Documentation Standards

### JSDoc Comments
Use JSDoc-style comments for classes and public methods:
```typescript
/**
 * Besides initializing variables, the constructor should do nothing!
 *
 * @param {Zigbee} zigbee Zigbee controller
 * @param {Mqtt} mqtt MQTT controller
 * @param {State} state State controller
 * @param {Function} publishEntityState Method to publish device state to MQTT.
 * @param {EventBus} eventBus The event bus
 */
constructor(zigbee: Zigbee, mqtt: Mqtt, state: State, ...) {
```

### Comment Style
- Use single-line comments (`//`) for implementation notes
- Use JSDoc (`/** */`) for public APIs and class/method documentation
- Include context for non-obvious logic
- Document parameters with their types and purposes
- Use `@param` tags with TypeScript types in braces
- Use biome-ignore comments when necessary: `// biome-ignore lint/rule: reason`

### Code Documentation
- Document complex algorithms or business logic
- Explain "why" not just "what" when logic is non-trivial
- Include links to relevant issues or documentation when applicable
- Document deprecations and breaking changes

## TypeScript-Specific Guidelines

### Module System
- Use ES modules with `import`/`export` syntax
- Default exports for main classes: `export default class Device {}`
- Named exports for utilities and types: `export const LOG_LEVELS = ...`
- Namespace exports for related types: `export type * as ZSpec from ...`
- Use `.js` extension in imports for local modules when using dynamic imports: `await import("./extension/frontend.js")`

### Type Safety
- Enable all strict type checking options
- Use type guards and assertions when necessary: `asserts expose is zhc.Numeric`
- Prefer `unknown` over `any` when type is truly unknown
- Use `// biome-ignore lint/suspicious/noExplicitAny: API` when `any` is necessary
- Define proper interfaces for external module types (e.g., `unix-dgram.d.ts`)

### Generic Types
- Use generics for reusable, type-safe abstractions
- Example: `abstract class ExternalJSExtension<M> extends Extension`
- Constrain generics when appropriate
- Document generic type parameters

### Utility Types
- Use built-in utility types: `Partial`, `Required`, `Pick`, `Omit`, `Record`
- Use `Awaited<ReturnType<typeof fn>>` for async function return types
- Define custom utility types when patterns emerge
- Use `type` for aliases, `interface` for object shapes

## Version Control and Releases

### Versioning Strategy
- Follow Semantic Versioning (MAJOR.MINOR.PATCH)
- Current version managed in `package.json`
- Use `-dev` suffix for development versions (e.g., `2.6.2-dev`)
- Configuration version tracked separately: `CURRENT_VERSION = 4`

### Changelog
- Maintain CHANGELOG.md with all changes
- Group changes by type: Bug Fixes, Features, Breaking Changes
- Include issue/PR references: `([#28583](url))`
- Include commit references: `([09f33b3](url))`
- Use conventional commits format

### Git Workflow
- Development on `dev` branch
- Production releases from `master` branch
- Use meaningful commit messages
- Reference issues in commits

## Project-Specific Patterns

### Settings Management
- All configuration loaded through `util/settings.ts`
- Validate settings using Ajv with JSON schema
- Schema defined in `settings.schema.json`
- Support runtime setting changes with restart detection
- Use `settings.get()` to access current configuration
- Use `settings.getDevice(ieeeAddr)` for device-specific config

### Device and Group Models
- Devices and groups are domain models wrapping `zigbee-herdsman` entities
- Access underlying entity via `.zh` property
- Expose computed properties as getters
- Include definition from `zigbee-herdsman-converters`
- Handle coordinator devices specially (type checking)

### MQTT Integration
- MQTT client wrapped in `Mqtt` class
- Publish options: `retain`, `qos` properties
- Topics follow pattern: `{base_topic}/{device}/{attribute}`
- Event-based message handling via EventBus
- Clean disconnect handling with retry logic

### Extension System
- Extensions are loosely coupled plugins
- Lifecycle: constructor → start() → stop()
- Constructor should only assign properties (no side effects)
- Use EventBus for inter-extension communication
- Extensions can be enabled/disabled at runtime
- External extensions loaded from `data/external_extensions/`

### State Management
- State persisted to `state.json`
- Cached in memory for performance
- Device states include all exposed attributes
- State changes trigger events via EventBus

## Best Practices Specific to This Project

1. **Never use language features beyond TypeScript 5.9.3 or ES2024**
2. **Always respect exact versions of zigbee-herdsman and zigbee-herdsman-converters** - these are critical for device compatibility
3. **Use the EventBus for all component communication** - avoid direct coupling
4. **Follow the Extension pattern for new features** - don't add logic directly to Controller
5. **Log appropriately** - info for user-relevant events, debug for developer info, error for failures
6. **Test with real Zigbee scenarios** - many edge cases exist with different device types
7. **Handle coordinator specially** - coordinator is a device but with unique behavior
8. **Validate all external input** - MQTT messages, configuration files, device data
9. **Use the bind decorator** for event handlers to preserve `this` context
10. **Match the exact code formatting** - Biome enforces 4 spaces, 150 line width, no bracket spacing

## Common Patterns to Follow

### Creating a New Extension
1. Extend `Extension` abstract class
2. Accept all dependencies in constructor
3. Implement `start()` method for initialization
4. Subscribe to EventBus events in `start()`
5. Implement `stop()` method for cleanup
6. Export as default: `export default class MyExtension extends Extension`

### Accessing Device Information
```typescript
const device: Device; // Our wrapper
device.ieeeAddr;      // IEEE address
device.name;          // Friendly name
device.zh;            // Underlying zigbee-herdsman device
device.definition;    // zigbee-herdsman-converters definition
device.options;       // User configuration
```

### Publishing MQTT Messages
```typescript
await this.mqtt.publish(topic, message, {retain: true, qos: 0});
```

### Emitting Events
```typescript
this.eventBus.emit('deviceMessage', {device, message});
```

### Listening to Events
```typescript
this.eventBus.on('deviceMessage', this.onDeviceMessage, this);
```

## Integration Points

### Zigbee-Herdsman Integration
- Start controller: `await this.zigbee.start()`
- Access coordinator: `this.zigbee.coordinator()`
- Device operations through `zigbee-herdsman` API
- Event handling through EventBus wrappers

### MQTT Integration  
- Connect: `await this.mqtt.connect()`
- Subscribe: `await this.mqtt.subscribe(topic)`
- Publish: `await this.mqtt.publish(topic, message, options)`
- Handle messages via EventBus `mqttMessage` event

### Frontend Integration
- Optional extension loaded dynamically
- Serves static files with compression
- WebSocket support for real-time updates
- Configurable port and base URL

### Home Assistant Integration
- Optional extension for discovery
- Publishes discovery messages to MQTT
- Supports entities, sensors, and devices
- Configurable discovery topic

## Critical Compatibility Notes

1. **Node.js**: Only versions 20, 22, and 24 are supported
2. **TypeScript**: Features must be compatible with 5.9.3
3. **Zigbee Libraries**: Exact versions are critical - do not suggest upgrades without testing
4. **MQTT Protocol**: Uses MQTT 3.1.1 and 5.0 features
5. **ES Modules**: Project uses ESM with NodeNext resolution
6. **Experimental Decorators**: Required for `@bind` decorator support

## When in Doubt

1. **Search for similar patterns** in the existing codebase
2. **Check existing extensions** for implementation examples
3. **Follow the controller and extension architecture** - don't bypass it
4. **Consult the test files** for usage examples
5. **Match the exact style** - run `pnpm check` to verify
6. **Prioritize consistency** over external best practices
7. **Test thoroughly** - this project controls real hardware

## Resources

- Repository: https://github.com/Koenkk/zigbee2mqtt
- Documentation: https://koenkk.github.io/zigbee2mqtt
- License: GPL-3.0
- Issue Tracker: https://github.com/Koenkk/zigbee2mqtt/issues
