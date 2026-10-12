# Security

BlackWire binds its coordination daemon to `127.0.0.1`, authenticates clients with a random local token, validates protocol messages, strips terminal control sequences, and disables telemetry. It never launches an AI CLI, injects terminal input, reads process memory, or uploads repository content.

Registered agent sockets are bound to their session identity and cannot impersonate another registered sender. Private inbox events are delivered only to the sender, recipient, and operator clients explicitly subscribed to those sessions. Agent sessions cannot subscribe to another session's room feed.

Connector configuration is generated under `.blackwire/connectors/`. Users decide whether to copy it into an AI CLI configuration. Treat `.blackwire/daemon.json` as sensitive while the daemon is running because it contains the localhost authentication token.

API-room credentials must be supplied through environment variables or the ignored `.blackwire/api-demo.env` file. Never commit credentials. Rotate any credential that appears in terminal output, screenshots, issue reports, or repository history.

Report vulnerabilities privately to the repository maintainers. Do not include live credentials, private transcripts, or proprietary source code in reports.
