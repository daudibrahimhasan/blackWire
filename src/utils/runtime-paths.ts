import { resolve } from "node:path";

export function runtimePaths(cwd = process.cwd()) {
  const root = resolve(cwd, ".blackwire");
  return {
    root,
    config: resolve(root, "config.json"),
    state: resolve(root, "state.json"),
    registry: resolve(root, "registry.json"),
    log: resolve(root, "logs", "blackwire.log"),
    artifacts: resolve(root, "artifacts")
  };
}
