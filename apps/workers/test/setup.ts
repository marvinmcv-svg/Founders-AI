import { config } from "dotenv";
config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
process.env.WORKERS_QUEUE_PREFIX = `founders-test-${process.pid}`;
