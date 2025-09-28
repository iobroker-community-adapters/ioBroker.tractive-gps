# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

**Tractive GPS Adapter Context:**
This adapter connects to the Tractive GPS service to retrieve location data for pets (dogs, cats). Key features include:

- **Primary Function**: Retrieves real-time GPS location data from Tractive pet trackers
- **External Service**: Tractive GPS API (requires authentication with email/password)
- **Data Types**: GPS coordinates, battery levels, activity data, health metrics
- **Configuration**: Email/password authentication, user ID, access tokens with expiration
- **Update Intervals**: Configurable polling intervals with randomization to avoid API rate limits
- **Key Dependencies**: axios for HTTP requests, cron for scheduling, geo-position.ts for location utilities

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Configuration specific to your adapter
                        const config = {
                            email: 'test@example.com',
                            password: 'test123'
                        };

                        // Apply configuration and start
                        await harness.changeAdapterConfig('your-adapter', config);
                        await harness.startAdapterAndWait('your-adapter', 5000);
                        
                        // Test adapter behavior
                        const states = await harness.getStates('your-adapter.*');
                        console.log('Current states:', states);
                        
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });
    }
});
```

**Critical Testing Requirements:**
- **NEVER** use custom adapter creation or management in integration tests
- **ALWAYS** use the provided `getHarness()` function
- **Use proper async/await** patterns with the testing framework
- **Include proper cleanup** in test teardown
- **Mock external services** or provide test credentials that don't access real services
- **Test both success and failure scenarios** (network errors, invalid credentials, etc.)

## Adapter Development Patterns

### Adapter Class Structure
```javascript
class AdapterName extends utils.Adapter {
    constructor(options = {}) {
        super({
            name: 'adapter-name',
            ...options
        });
        
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    
    async onReady() {
        // Adapter initialization
        this.writeLog('Adapter starting', 'info');
        
        // Set initial connection state
        await this.setStateAsync('info.connection', false, true);
        
        // Load configuration
        const config = this.config;
        
        // Initialize your service/connection
    }
    
    async onUnload(callback) {
        try {
            this.writeLog('Adapter stopping', 'info');
            
            // Clear any timers
            if (this.timer) {
                this.clearTimeout(this.timer);
                this.timer = null;
            }
            
            // Close connections
            
            // Set connection to false
            await this.setStateAsync('info.connection', false, true);
            
            callback();
        } catch (e) {
            callback();
        }
    }
}
```

### Object Creation
Always use the proper ioBroker patterns for creating objects:

```javascript
// Create device
await this.setObjectNotExistsAsync('deviceId', {
    type: 'device',
    common: {
        name: 'Device Name',
        icon: 'icon.png'
    },
    native: {}
});

// Create channel
await this.setObjectNotExistsAsync('deviceId.channel', {
    type: 'channel',
    common: {
        name: 'Channel Name'
    },
    native: {}
});

// Create state
await this.setObjectNotExistsAsync('deviceId.channel.state', {
    type: 'state',
    common: {
        name: 'State Name',
        type: 'string',
        role: 'value',
        read: true,
        write: false
    },
    native: {}
});
```

### State Management
```javascript
// Set state with acknowledge
await this.setStateAsync('path.to.state', value, true);

// Get state value
const state = await this.getStateAsync('path.to.state');
const value = state ? state.val : null;

// Subscribe to state changes (in onReady)
this.subscribeStates('*');

// Handle state changes
async onStateChange(id, state) {
    if (!state || state.ack) return;
    
    this.writeLog(`State ${id} changed to ${state.val}`, 'debug');
    
    // Handle the state change
}
```

### Configuration Management
```javascript
// Access configuration
const email = this.config.email;
const interval = this.config.interval || 300; // Default 5 minutes

// Validate configuration
if (!this.config.email || !this.config.password) {
    this.writeLog('Configuration incomplete: email and password required', 'error');
    return;
}
```

### Error Handling
```javascript
try {
    // Your code here
} catch (error) {
    this.writeLog(`Error in function: ${error.message}`, 'error');
    this.writeLog(`Stack: ${error.stack}`, 'debug');
    
    // Set connection to false on critical errors
    await this.setStateAsync('info.connection', false, true);
}
```

### HTTP/API Requests
For adapters making HTTP requests (like this Tractive adapter):

```javascript
const axios = require('axios');

try {
    const response = await axios({
        method: 'GET',
        url: 'https://api.example.com/data',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': `ioBroker.${this.name}/${this.version}`
        },
        timeout: 10000
    });
    
    if (response.status === 200 && response.data) {
        // Process response data
        this.writeLog('API request successful', 'debug');
        return response.data;
    } else {
        this.writeLog(`API returned status ${response.status}`, 'warn');
    }
} catch (error) {
    if (error.response) {
        // Server responded with error status
        this.writeLog(`API error: ${error.response.status} ${error.response.statusText}`, 'error');
    } else if (error.request) {
        // Network error
        this.writeLog(`Network error: ${error.message}`, 'error');
    } else {
        // Other error
        this.writeLog(`Request error: ${error.message}`, 'error');
    }
    throw error;
}
```

### Timer Management
```javascript
// Set repeating timer
this.timer = this.setInterval(async () => {
    try {
        await this.updateData();
    } catch (error) {
        this.writeLog(`Timer error: ${error.message}`, 'error');
    }
}, this.interval);

// Clear timer in onUnload
if (this.timer) {
    this.clearInterval(this.timer);
    this.timer = null;
}
```

## Logging

### Log Levels
- `error`: Critical errors that prevent adapter from working
- `warn`: Warning messages for non-critical issues
- `info`: General information about adapter operation
- `debug`: Detailed debugging information

### Log Best Practices
```javascript
// Include adapter version in important logs
this.writeLog(`[Adapter v.${this.version}] Starting initialization`, 'info');

// Log with context
this.writeLog(`[Device ${deviceId}] Battery level: ${battery}%`, 'debug');

// Avoid logging sensitive data
this.writeLog(`Authentication successful for user: ${userId}`, 'info');
// NOT: this.writeLog(`Login with: ${email}:${password}`, 'debug');

// Log API responses only in debug mode
this.writeLog(`API Response: ${JSON.stringify(response.data)}`, 'debug');
```

## TypeScript Development

### Type Definitions
```typescript
// Use proper ioBroker types
import * as utils from '@iobroker/adapter-core';

// Define your own interfaces
interface DeviceData {
    id: string;
    name: string;
    battery: number;
    position: {
        lat: number;
        lng: number;
        timestamp: number;
    };
}

// Use proper adapter typing
class MyAdapter extends utils.Adapter {
    private timer?: ioBroker.Timeout;
    private deviceData: Map<string, DeviceData> = new Map();
}
```

### Async/Await Patterns
```typescript
// Proper async method signature
async onReady(): Promise<void> {
    try {
        await this.initialize();
    } catch (error) {
        this.writeLog(`Initialization failed: ${error.message}`, 'error');
    }
}

// Handle promises properly
const results = await Promise.allSettled([
    this.updateDevice1(),
    this.updateDevice2(),
    this.updateDevice3()
]);

results.forEach((result, index) => {
    if (result.status === 'rejected') {
        this.writeLog(`Device ${index + 1} update failed: ${result.reason}`, 'warn');
    }
});
```

## Admin Interface Development

### React/JSON Config
For React-based admin interfaces:

```jsx
// Use Material-UI components consistently
import { TextField, FormControlLabel, Switch } from '@mui/material';

// Proper state management
const [config, setConfig] = useState(originalConfig);

const handleChange = (attr, value) => {
    const newConfig = { ...config, [attr]: value };
    setConfig(newConfig);
    onChange(newConfig);
};

// Form validation
const isConfigValid = config.email && config.password;
```

### JSON Config Schema
```json
{
    "type": "panel",
    "items": {
        "email": {
            "type": "text",
            "label": "Email address",
            "sm": 12
        },
        "password": {
            "type": "password", 
            "label": "Password",
            "sm": 12
        },
        "interval": {
            "type": "number",
            "label": "Update interval (seconds)",
            "min": 60,
            "max": 3600,
            "default": 300,
            "sm": 6
        }
    }
}
```

## Build and Development

### Package Scripts
Standard ioBroker adapter scripts should include:

```json
{
    "scripts": {
        "build": "npm run prebuild:ts && npm run build:ts && npm run prebuild:react && npm run build:react",
        "build:ts": "tsc --project src/tsconfig.build.json",
        "build:react": "cd src-admin && npm run build",
        "test": "npm run test:ts && npm run test:package",
        "test:ts": "mocha --config test/mocharc.custom.json src/**/*.test.ts",
        "test:integration": "mocha test/integration --exit",
        "lint": "cd src && eslint --ext .ts,.tsx ./ && cd ../src-admin && eslint --ext .ts,.tsx ./"
    }
}
```

### TypeScript Configuration
Ensure proper TypeScript configuration:

```json
{
    "compilerOptions": {
        "target": "ES2020",
        "module": "commonjs",
        "lib": ["ES2020", "DOM"],
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "declaration": true,
        "outDir": "../build",
        "rootDir": "./"
    }
}
```

## Dependencies

### Required Dependencies
```json
{
    "dependencies": {
        "@iobroker/adapter-core": "^3.0.0"
    },
    "devDependencies": {
        "@iobroker/testing": "^5.0.0",
        "@types/node": "^20.0.0",
        "typescript": "^5.0.0"
    }
}
```

### Dependency Management
- Always use specific version ranges, not wildcards
- Keep dependencies up to date but test thoroughly
- Avoid unnecessary dependencies that increase bundle size
- Use peer dependencies for shared libraries when appropriate

## Security

### API Keys and Credentials
- Store sensitive data in adapter configuration, not in code
- Use encryption for stored credentials when possible
- Never log credentials or API keys
- Validate and sanitize all configuration inputs

### Data Handling
- Validate all external API responses
- Sanitize data before storing in states
- Use proper error handling to prevent crashes
- Implement rate limiting for API calls

## Performance

### Optimization Guidelines
- Use efficient data structures (Map, Set) for large datasets
- Implement proper caching for frequently accessed data
- Avoid excessive API calls - implement intelligent polling
- Clean up resources in onUnload method
- Use database queries efficiently when dealing with history data

### Memory Management
```javascript
// Clear large objects when done
this.largeDataSet.clear();
this.largeDataSet = null;

// Use WeakMap for object references
const deviceReferences = new WeakMap();

// Implement proper cleanup
async onUnload(callback) {
    // Clear intervals and timeouts
    if (this.updateTimer) {
        this.clearInterval(this.updateTimer);
        this.updateTimer = null;
    }
    
    // Close connections
    if (this.connection) {
        await this.connection.close();
        this.connection = null;
    }
    
    callback();
}
```

**Tractive GPS Adapter Specific Guidelines:**

When working with GPS/location data and the Tractive API:
- Always validate GPS coordinates before storing (latitude: -90 to 90, longitude: -180 to 180)
- Handle authentication token expiration gracefully with automatic renewal
- Implement proper error handling for API rate limits and network connectivity issues  
- Use appropriate state roles for different data types (gps coordinates, battery levels, activity data)
- Consider timezone handling for timestamp data from the Tractive API
- Implement efficient polling strategies to balance data freshness with API usage limits