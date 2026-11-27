import { defineConfig } from "vitest/config";
// Files share one Postgres; bulk snapshots read every company, so files that add or merge companies must not overlap.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 20000, fileParallelism: false } });
