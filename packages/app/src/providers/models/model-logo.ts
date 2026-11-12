// Model-family mapping adapted from OpenTerminal's model logo catalog (models.dev families, October 2026).
// Logo files in model-logos are from @lobehub/icons-static-svg; see their MIT license in that directory.
const modelRules: ReadonlyArray<readonly [RegExp, string]> = [
    [/(^|[^a-z])(claude|anthropic)|^(opus|sonnet|haiku|fable|mythos)([^a-z]|$)/, 'claude'],
    [/(^|[^a-z])gemma/, 'gemma'],
    [/(^|[^a-z])(gemini|imagen|veo|lyria|nano-banana|palm|learnlm)([^a-z]|$)/, 'gemini'],
    [/(^|[^a-z])(gpt|chatgpt|codex|dall-?e|davinci|babbage|whisper|text-embedding|tts-1|omni-moderation|computer-use|sora)([^a-z]|$)|(^|[\/:])o[1-9]([^0-9a-z]|$|-)/, 'openai'],
    [/(^|[^a-z])(llama|muse|meta-llama|meta-models)([^a-z]|$)|(^|[\/])meta[\/]/, 'meta'],
    [/(^|[^a-z])(mistral|mixtral|codestral|devstral|ministral|magistral|pixtral|voxtral|leanstral)/, 'mistral'],
    [/deepseek/, 'deepseek'],
    [/(^|[^a-z])(qwen|qwq|qvq)/, 'qwen'],
    [/(^|[^a-z])(grok|x-ai|xai)([^a-z]|$)/, 'grok'],
    [/(^|[^a-z])(glm|chatglm|zhipu|z-ai|codegeex|cogview|cogvideo)/, 'zhipu'],
    [/(^|[^a-z])(kimi|moonshot)/, 'kimi'],
    [/(^|[^a-z])(minimax|abab)/, 'minimax'],
    [/(^|[^a-z])(nemotron|nvidia)/, 'nvidia'],
    [/(^|[^a-z])(mimo|xiaomi)([^a-z]|$)/, 'xiaomimimo'],
    [/(^|[^a-z])(seed|doubao|bytedance|skylark)([^a-z]|$)/, 'bytedance'],
    [/(^|[^a-z])(hunyuan|hy[0-9]|tencent)/, 'hunyuan'],
    [/(^|[^a-z])(phi-?[0-9]|mai-|microsoft|wizardlm)/, 'microsoft'],
    [/(^|[^a-z])(nova|titan|amazon)([^a-z]|$)/, 'nova'],
    [/(^|[^a-z])(command|cohere|aya|north|rerank|c4ai)([^a-z]|$)/, 'cohere'],
    [/(^|[^a-z])(sonar|perplexity|r1-1776)([^a-z]|$)/, 'perplexity'],
    [/(^|[^a-z])(granite|ibm)([^a-z]|$)/, 'ibm'],
    [/(^|[^a-z])(ernie|wenxin|baidu)/, 'wenxin'],
    [/(^|[^a-z])(step-?[0-9]|step-tts|stepaudio|stepfun)/, 'stepfun'],
    [/longcat/, 'longcat'],
    [/(^|[^a-z])(ling|ring)-|bailing|inclusionai/, 'antgroup'],
    [/(^|[^a-z])(solar|upstage)/, 'upstage'],
    [/(^|[^a-z])(jamba|ai21)/, 'ai21'],
    [/(^|[^a-z])(lfm|liquid)/, 'liquid'],
    [/(^|[^a-z])(mercury|inception)/, 'inception'],
    [/(^|[^a-z])voyage/, 'voyage'],
    [/(^|[^a-z])(flux|bfl|black-forest)/, 'flux'],
    [/(^|[^a-z])(stable-diffusion|sdxl|sd3|stablelm|stability)/, 'stability'],
    [/ideogram/, 'ideogram'],
    [/recraft/, 'recraft'],
    [/elevenlabs|eleven_/, 'elevenlabs'],
    [/(^|[^a-z])(runway|gen-?4)/, 'runway'],
    [/(^|[^a-z])(hermes|nousresearch|nous)([^a-z]|$)/, 'nousresearch'],
    [/(^|[^a-z])(trinity|arcee)/, 'arcee'],
    [/(^|[^a-z])(yi-|01-ai)/, 'yi'],
    [/baichuan/, 'baichuan'],
    [/(^|[^a-z])morph/, 'morph'],
    [/(^|[^a-z])(rnj|essentialai)/, 'essentialai'],
    [/(^|[^a-z])(kat-|kwaipilot)/, 'kwaipilot'],
    [/(^|[^a-z])(internlm|intern-?s1)/, 'internlm'],
    [/llava/, 'llava'],
    [/openchat/, 'openchat'],
    [/dbrx/, 'dbrx'],
    [/(^|[^a-z])(arctic|snowflake)/, 'snowflake'],
    [/(^|[^a-z])falcon/, 'tii'],
    [/(^|[^a-z])(cogito|deepcogito)/, 'deepcogito'],
    [/(^|[^a-z])(bge|baai)([^a-z]|$)/, 'baai'],
    [/(^|[^a-z])jina/, 'jina'],
    [/(^|[^a-z])venice/, 'venice'],
    [/big-pickle/, 'opencode'],
    [/(^|[^a-z])kling/, 'kling'],
    [/(^|[^a-z])(luma|ray-?[0-9])/, 'luma'],
    [/hailuo/, 'hailuo'],
    [/(^|[^a-z])vidu/, 'vidu'],
    [/pixverse/, 'pixverse'],
    [/(^|[^a-z])(sensenova|sensechat)/, 'sensenova'],
    [/skywork/, 'skywork'],
    [/(^|[^a-z])(spark|iflytek)([^a-z]|$)/, 'spark'],
    [/(^|[^a-z])inflection/, 'inflection'],
]

const providerRules: ReadonlyArray<readonly [RegExp, string]> = [
    [/^(anthropic|google-vertex-anthropic|claude)/, 'claude'], [/^(openai|azure-openai)/, 'openai'], [/^(google-vertex|vertex)/, 'vertexai'],
    [/^(google|gemini)/, 'gemini'], [/^(meta|llama)/, 'meta'], [/^mistral/, 'mistral'], [/^deepseek/, 'deepseek'], [/^(alibaba|qwen|dashscope|bailian)/, 'qwen'],
    [/^(xai|x-ai|grok)/, 'grok'], [/^(zhipu|zai|z-ai|bigmodel)/, 'zhipu'], [/^(moonshot|kimi)/, 'kimi'], [/^minimax/, 'minimax'], [/^nvidia/, 'nvidia'],
    [/^xiaomi/, 'xiaomimimo'], [/^(volcengine|bytedance|doubao)/, 'bytedance'], [/^tencent/, 'hunyuan'], [/^(azure|microsoft)/, 'azure'],
    [/^(amazon-bedrock|bedrock)/, 'bedrock'], [/^(amazon|nova)/, 'nova'], [/^cohere/, 'cohere'], [/^perplexity/, 'perplexity'], [/^(ibm|watsonx)/, 'ibm'],
    [/^(baidu|wenxin|qianfan)/, 'wenxin'], [/^stepfun/, 'stepfun'], [/^longcat/, 'longcat'], [/^(inclusionai|bailing|antgroup)/, 'antgroup'], [/^upstage/, 'upstage'],
    [/^ai21/, 'ai21'], [/^liquid/, 'liquid'], [/^inception/, 'inception'], [/^morph/, 'morph'], [/^venice/, 'venice'], [/^arcee/, 'arcee'],
    [/^groq/, 'groq'], [/^cerebras/, 'cerebras'], [/^together/, 'together'], [/^fireworks/, 'fireworks'], [/^deepinfra/, 'deepinfra'], [/^openrouter/, 'openrouter'],
    [/^ollama/, 'ollama'], [/^lmstudio|^lm-studio/, 'lmstudio'], [/^(huggingface|hf)([^a-z]|$)/, 'huggingface'], [/^github-copilot|^copilot/, 'githubcopilot'],
    [/^opencode/, 'opencode'], [/^cloudflare/, 'cloudflare'], [/^sambanova/, 'sambanova'], [/^siliconflow/, 'siliconcloud'], [/^novita/, 'novita'],
    [/^hyperbolic/, 'hyperbolic'], [/^nebius/, 'nebius'], [/^vercel/, 'vercel'], [/^poe$/, 'poe'], [/^(nousresearch|nous)/, 'nousresearch'],
]

export function modelLogo(input: { id?: string; name?: string; family?: string }) {
  const values = [input.id, input.family, input.name].flatMap((value) => (value ? [value.toLowerCase().trim()] : []))
  const match = (value: string) => modelRules.find(([pattern]) => pattern.test(value))?.[1]
  const logo = values.map((value) => match(value.split("/").at(-1) ?? value) ?? match(value)).find(Boolean)
  if (logo) return logo

  const prefix = values.find((value) => value.includes("/"))?.split("/")[0]

  return prefix ? providerRules.find(([pattern]) => pattern.test(prefix))?.[1] : undefined
}
