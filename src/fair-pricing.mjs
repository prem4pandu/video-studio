export const FAIR_PRICING = {
  checkedAt: '2026-10-15', currency: 'USD',
  local: { description: '$0 model API fees with local LM Studio or Ollama planning and local speech. Your computer, electricity, storage, and any renderer plan costs are separate. Rendering remains subject to your HyperFrames account allowance.' },
  elevenlabs: {
    description: 'Optional premium voice with either planner. Starter: $6/month for 30,000 credits; Creator: $22/month for 121,000 credits. Multilingual v2 uses about one credit per character. At 145 words/minute and six characters/word, a 2–5 minute lesson uses about 1,740–4,350 credits ($0.35–$0.87 of the Starter allowance). A subscription is required; this allocation is not a pay-as-you-go quote. Planning, retries, voice multipliers, taxes and rendering are extra.',
    sourceUrls: ['https://elevenlabs.io/pricing'],
  },
  openai: {
    model: 'gpt-5.6-terra', inputPerMillion: 2, outputPerMillion: 12,
    estimatedLessonMin: 0.20, estimatedLessonMax: 0.55,
    description: 'Illustrative 2–5 minute lesson: 10k–30k planning input tokens, 5k–15k output tokens, plus 6k–15k speech output tokens. Voice: gpt-realtime-2.1-mini, $0.60/M text input and $20/M audio output tokens. Estimate includes a small allowance for voice text; it is not a quote or spend cap. Repairs, retries, model changes, taxes, and renderer costs can increase the total. Rendering runs on your computer.',
    sourceUrls: ['https://developers.openai.com/api/docs/models/gpt-5.6-terra', 'https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini'],
  },
};
