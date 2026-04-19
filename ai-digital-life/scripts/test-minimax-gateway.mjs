import { ModelGateway } from "../packages/model-gateway/dist/index.js";

async function main() {
  const gateway = new ModelGateway({
    minimax: {
      apiKey: process.env.MINIMAX_API_KEY || process.env.MINIMAX_AUTH_TOKEN,
      baseUrl: process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com",
      model: process.env.MINIMAX_MODEL || "MiniMax-M2.5"
    }
  });

  const result = await gateway.invokeMiniMax({
    scenario: "chat",
    prompt: process.env.TEST_PROMPT || "请用一句中文说明你当前可用，并简要说明你适合做什么。"
  });

  console.log(`PROVIDER=${result.providerId}`);
  console.log(`MODEL=${result.modelId}`);
  console.log(`SYNTHETIC=${String(result.synthetic)}`);
  console.log("CONTENT_START");
  console.log(result.content);
  console.log("CONTENT_END");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
