# Orbis Atlas MCP

Install dependencies with `npm --prefix mcp ci --ignore-scripts` and run `node /absolute/path/to/mcp/server.mjs` over stdio. `ORBIS_ROLE=residents|workers|stewards` chooses the observation filter per process. No network listener is started. The server loads the same deterministic model and published observation snapshot as the browser.

`orbis_search` and `orbis_read_observations` are independent read-only queries. An experiment log is JSON such as `{"modelVersion":1,"region":"CHN","year":2023,"seed":8,"actions":[]}`. `orbis_check_proposal` checks a policy, `orbis_advance_council` returns a new log, and `orbis_observe_council` and `orbis_read_turns` expose that process role's observation and history. `hold` is a valid action. Logs fork by copying and appending different actions; all clients must use the same model and source versions for replay.

Role filtering is an information-view mechanism, not security against a user who can execute arbitrary code or read the local public model. Do not host this process as a public shared service without authentication and isolated world state.

Run `npm --prefix mcp test` for a live stdio SDK protocol test. The ten independent questions in [evaluation.xml](evaluation.xml) were verified using the SDK against the pinned current snapshot; the answers may change if that snapshot is deliberately updated.
