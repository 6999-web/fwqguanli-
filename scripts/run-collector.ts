import { collectAllServers } from "../src/lib/collector";

collectAllServers()
  .then((result) => {
    console.log("Collector finished", result);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
