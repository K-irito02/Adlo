import { ModelGateway } from "../packages/model-gateway/dist/index.js";

async function main() {
  const models = process.env.MODELS
    ? process.env.MODELS.split(",").map((value) => value.trim()).filter(Boolean)
    : [process.env.MODEL || "deepseek-chat"];
  const prompt = process.env.TEST_PROMPT || "请用一句中文说明你当前可用，并简要说明你适合做什么。";

  for (const model of models) {
    const gateway = new ModelGateway({
      apiKey: process.env.AUTH_TOKEN || process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.BASE_URL || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      model
    });

    const result = await gateway.generateResponse({
      scenario: "chat",
      prompt
    });

    console.log(`MODEL=${model}`);
    console.log(`SYNTHETIC=${String(result.synthetic)}`);
    console.log(`RETURNED_MODEL=${result.modelId}`);
    console.log("CONTENT_START");
    console.log(result.content);
    console.log("CONTENT_END");
    console.log("---");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
