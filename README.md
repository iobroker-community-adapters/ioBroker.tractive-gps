![Logo](admin/tractive-gps.png)

# ioBroker.tractive-gps

[![GitHub license](https://img.shields.io/github/license/iobroker-community-adapters/ioBroker.tractive-gps)](https://github.com/iobroker-community-adapters/ioBroker.tractive-gps/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/iobroker.tractive-gps.svg)](https://www.npmjs.com/package/iobroker.tractive-gps)
![GitHub repo size](https://img.shields.io/github/repo-size/iobroker-community-adapters/ioBroker.tractive-gps)
[![Translation status](https://weblate.iobroker.net/widgets/adapters/-/tractive-gps/svg-badge.svg)](https://weblate.iobroker.net/engage/adapters/?utm_source=widget)</br>
![GitHub commit activity](https://img.shields.io/github/commit-activity/m/iobroker-community-adapters/ioBroker.tractive-gps)
![GitHub commits since latest release (by date)](https://img.shields.io/github/commits-since/iobroker-community-adapters/ioBroker.tractive-gps/latest)
![GitHub last commit](https://img.shields.io/github/last-commit/iobroker-community-adapters/ioBroker.tractive-gps)
![GitHub issues](https://img.shields.io/github/issues/iobroker-community-adapters/ioBroker.tractive-gps)

**Version:**

[![NPM version](https://img.shields.io/npm/v/iobroker.tractive-gps.svg)](https://www.npmjs.com/package/iobroker.tractive-gps)
![Current version in stable repository](https://iobroker.live/badges/tractive-gps-stable.svg)
![Number of Installations](https://iobroker.live/badges/tractive-gps-installed.svg)

## Disclaimer

All product and company names, logos, and trademarks mentioned in this project belong to their respective owners. Tractive and its associated names, logos, and trademarks are the property of Tractive GmbH or their respective owners. Their use is solely for identification and does not imply any affiliation with, sponsorship by, or endorsement from Tractive GmbH or its associated companies. This is a private, non-commercial project developed for recreational purposes.

## Error reporting with Sentry

This adapter uses the Sentry integration provided by ioBroker to automatically report unexpected exceptions and code errors to the developers. Error reporting has been available through js-controller since version 3.0 and helps identify and resolve defects that might otherwise go unnoticed.

For details about the transmitted information and instructions for disabling error reporting, see the [official ioBroker Sentry documentation](https://github.com/ioBroker/ioBroker.js-controller#error-reporting-via-iobroker-sentry).

## Description

The adapter connects ioBroker to a Tractive account and makes the current information about pets and GPS trackers available as ioBroker states. This enables locations, battery levels, connection states, pet information, and supported tracker functions to be used in automations and visualizations.

The adapter uses an unofficial Tractive service interface. A working Tractive account and an active subscription for the trackers are required. This community adapter is not affiliated with or supported by Tractive.

> [Deutsche Dokumentation](README_DE.md)

## Requirements

- Node.js 22.13 or newer
- js-controller 7.2.2 or newer
- Admin 8 or newer
- VIS 2 version 2.12.8 or newer when using the included widget
- A Tractive account with at least one associated tracker

## Features

- Retrieves the actual names and details of pets associated with the account.
- Provides current GPS coordinates, altitude, speed, position accuracy, and last update time.
- Optionally resolves coordinates to a readable address.
- Provides battery level, charging state, connection type, online state, and power-saving status.
- Provides model, firmware, hardware version, capabilities, gender, birthday, height, weight, and other available information.
- Supports live tracking, LED, and buzzer commands when the tracker reports the corresponding capability.
- Stores a sanitized snapshot of all currently retrieved API data.
- Includes a responsive VIS 2 card with pet image, interactive map, range display, and tracker status.
- Supports an image supplied by Tractive or a custom image uploaded to ioBroker.
- Detects missing or stale tracker data without automatically deleting existing objects.

## Configuration

Open the adapter instance and configure the following settings:

| Setting | Description |
| --- | --- |
| Email | Email address of the Tractive account. |
| Password | Password of the Tractive account. It is stored using ioBroker's standard encrypted configuration format. |
| Update interval | Time between regular position updates. Values between 2 and 60 minutes are available. |
| Resolve coordinates to an address | Requests a readable address for the current coordinates. Disable this option if no address is needed. |

Use **Test connection** to verify the entered credentials. Save all settings with the normal ioBroker **Save** button at the bottom of the configuration page.

The password remains unchanged if the password field is left empty after the configuration has already been saved. Existing passwords using the older ioBroker encryption format are converted to the current AES format the next time the configuration is saved.

### Data update schedule

- Positions are refreshed according to the configured update interval.
- Battery and hardware information are refreshed every 15 minutes.
- Pet profiles, images, and other static details are refreshed during the daily full synchronization.
- A full synchronization is also performed after the adapter starts.

Tractive may temporarily limit requests with HTTP 429. The adapter spaces requests, pauses all requests when such a limit is reported, and retries automatically. A successful update is shown in `info.lastSuccessfulSync` and `info.dataFresh`.

## Objects and states

The most important objects are grouped as follows:

```text
tractive-gps.0
├── info
│   ├── connection
│   ├── dataFresh
│   ├── lastSync
│   ├── lastSuccessfulSync
│   ├── currentApi
│   ├── refresh
│   └── status
├── pets.<pet-id>.info.*
├── trackers.<tracker-id>
│   ├── info.*
│   ├── status.*
│   ├── location.*
│   ├── health.*
│   └── commands.*
└── api.data.*
```

### Adapter information

- `info.connection`: Indicates whether the last synchronization was successful.
- `info.dataFresh`: Indicates whether current usable data is available.
- `info.lastSync`: Time of the last synchronization attempt.
- `info.lastSuccessfulSync`: Time of the last successful synchronization.
- `info.refresh`: Button for manually starting a complete synchronization.
- `info.status`: Current adapter status.
- `info.currentApi`: Sanitized JSON snapshot of the currently available Tractive data.

### Pets

The states below `pets.<pet-id>.info.*` contain the pet name and all available profile information, including type, gender, birthday, height, weight, tracker assignment, and image information.

### Trackers

The states below `trackers.<tracker-id>.*` contain tracker identification, battery, online and connection status, position, address, health information, and supported commands.

### Complete API data

The sanitized API response is additionally represented below `api.data.*`. Passwords, access tokens, authorization data, email addresses, and account user IDs are removed before data is written to ioBroker.

## Tracker commands

The following writable states are created only when supported by the selected tracker:

- `trackers.<tracker-id>.commands.liveTracking`
- `trackers.<tracker-id>.commands.led`
- `trackers.<tracker-id>.commands.buzzer`

Set the desired state to `true` or `false`. The state is acknowledged after Tractive accepts the command.

## VIS 2 widget

The adapter includes the `PetTrackerCard` widget for VIS 2. Add one widget for each pet or tracker and assign the requested states in the widget settings.

The card can display:

- pet name, type, gender, age, and weight,
- tracker name and online state,
- pet image,
- interactive Leaflet/OpenStreetMap map,
- reported or manually configured position radius,
- battery level and connection type,
- last update, address, power-saving state, and position accuracy.

For the Tractive image, select `pets.<pet-id>.info.profilePictureUrl` as the API image state. If no image is returned or it cannot be loaded, select or upload a custom image in the widget's **Appearance** section.

The map can automatically fit the complete accuracy or range circle. Minimum and maximum zoom, interaction, range source, and a manual radius can be configured in the widget. Displaying the map downloads map tiles from OpenStreetMap.

## Privacy and security

- The password is stored using ioBroker's encrypted configuration mechanism.
- Access tokens are kept in memory and are refreshed automatically.
- Passwords, tokens, email addresses, and account user IDs are removed from the stored API snapshot.
- Precise positions are stored locally in ioBroker states because they are required for the adapter's purpose.
- Reverse geocoding is optional and sends coordinates to Tractive's address service when enabled.
- Sentry error reporting follows the global ioBroker Sentry configuration.

## Troubleshooting

- **Connection test fails:** Check the email address, password, internet connection, and outbound HTTPS access.
- **No pets or trackers appear:** Verify that the trackers are assigned to the configured Tractive account, then restart the adapter instance.
- **Data is not updated:** Check `info.status`, `info.dataFresh`, and `info.lastSuccessfulSync`.
- **HTTP 429 is reported:** Leave the instance running. The adapter pauses requests and retries automatically after the Tractive limit expires.
- **No address is shown:** Enable reverse geocoding in the adapter configuration.
- **A command is missing:** The tracker did not report the required capability.
- **The pet image is missing:** Assign `profilePictureUrl` to the widget or select a custom image.

## Developer documentation

Information for contributors is available in [Developer documentation](docs/DEVELOPMENT.md).

## Changelog

### **WORK IN PROGRESS**

- (xXBJXx) BREAKING: rewritten for Node.js 22, js-controller 7.2.2, and Admin 8.
- (xXBJXx) Replaced stored authorization data with in-memory authentication, automatic token renewal, request validation, retry handling, and account-wide rate limiting (#16, #115, #213).
- (xXBJXx) Added the `pets.*`, `trackers.*`, and health object structures.
- (xXBJXx) Fixed pet names and added all available pet profile states with corrected height and weight units.
- (xXBJXx) Fixed missing state definitions for API fields that were not known in advance (#81, #113).
- (xXBJXx) Added the sanitized `api.data.*` state tree and `info.currentApi` snapshot.
- (xXBJXx) Added live tracking, LED, and buzzer commands for supported trackers.
- (xXBJXx) Rebuilt the adapter configuration for Admin 8 and removed the invalid jsonConfig configuration (#176).
- (xXBJXx) Added the VIS 2 `PetTrackerCard` widget with pet image, Leaflet/OpenStreetMap map, range display, and tracker information.
- (xXBJXx) Added support for Tractive profile images and custom ioBroker images.
- (xXBJXx) Added automatic light and dark theme colors to the VIS 2 widget.
- (xXBJXx) Added configurable map interaction, automatic range fitting, and minimum and maximum zoom.
- (xXBJXx) Switched password storage to ioBroker's server-side AES encryption and automatic migration of older passwords.
- (xXBJXx) Reduced recurring API traffic and added separate update intervals for positions, battery information, and static profile data.
- (xXBJXx) Added adaptive HTTP 429 handling, global request pauses, conservative retries, and cached address lookup.
- (xXBJXx) Migrated linting to ESLint 9 and `@iobroker/eslint-config` (#45).
- (xXBJXx) Added Node.js 24 to the CI test matrix (#116).
- (xXBJXx) Migrated automated npm releases to Trusted Publishing with GitHub OIDC (#169).
- (xXBJXx) Updated repository metadata and schema configuration, superseding maintenance PRs #214, #215, and #216.
- (xXBJXx) Updated dependencies, tests, documentation, and privacy safeguards.

### 2.1.0 (2024-11-12)

- (mcm1957) Adapter requires Node.js 20 now.
- (mcm1957) Adapter requires js-controller 5.0.19 and Admin 6.17.14 now.
- (simatec) Adapter changed to meet responsive design rules.
- (mcm1957) Corrected an error in the jsonConfig reauthorization command.
- (mcm1957) Dependencies have been updated.

### 2.0.1 (2024-08-20)

- (bluefox) Fixed encryption of the access token.

### 2.0.0 (2024-08-18)

- (bluefox) BREAKING: credentials must be entered again.
- (bluefox) Removed old code and rewrote the GUI.
- (bluefox) Updated dependencies.

### 1.2.0 (2024-04-28)

- (mcm1957) Adapter requires Node.js 18 and js-controller 5 or newer.
- (mcm1957) Updated dependencies.

### 1.1.0 (2023-11-05)

- (Scrounger) Create objects only when necessary.
- (Scrounger) Reduced excessive warnings.
- (Scrounger) Added distance calculation between ioBroker and the tracker.

## Credits

Originally created by [xXBJXx](https://github.com/xXBJXx) and maintained by the ioBroker community adapters organization.

## License

MIT License. See [LICENSE](LICENSE).
