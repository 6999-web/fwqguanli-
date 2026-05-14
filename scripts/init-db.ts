import { execSync } from "node:child_process";

execSync("npx prisma generate", { stdio: "inherit" });
execSync("npx prisma db push", { stdio: "inherit" });
execSync("npx prisma db seed", { stdio: "inherit" });
