import { Command } from "commander";
import { deploy } from "./deploy.js";
import { setOpenrouterKey } from "./set-openrouter-key.js";

const program = new Command();
program
  .name("trustclaw")
  .description("Deploy trustclaw to Vercel")
  .version("0.1.0");

program
  .command("deploy")
  .description("Deploy a fresh trustclaw instance to Vercel")
  .action(deploy);

program
  .command("set-openrouter-key")
  .description(
    "Rotate the OpenRouter API key on an existing Vercel project (or switch a Gateway project to OpenRouter)",
  )
  .action(setOpenrouterKey);

program.parseAsync();
