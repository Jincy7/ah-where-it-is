type ModelEnvironment = {
  [name: string]: string | undefined;
  OPENAI_CHAT_MODEL?: string;
  OPENAI_VISION_MODEL?: string;
  OPENAI_MODEL?: string;
};

// Explicit workload settings take precedence over the legacy shared setting.
export function openAIChatModel(env: ModelEnvironment = process.env) {
  return env.OPENAI_CHAT_MODEL?.trim() || env.OPENAI_MODEL?.trim() || 'gpt-6-luna';
}

export function openAIVisionModel(env: ModelEnvironment = process.env) {
  return env.OPENAI_VISION_MODEL?.trim() || env.OPENAI_MODEL?.trim() || 'gpt-6.1-terra';
}

export function openAIValidationModels(env: ModelEnvironment = process.env) {
  return [...new Set([openAIChatModel(env), openAIVisionModel(env)])];
}
