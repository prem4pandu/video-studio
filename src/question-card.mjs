import { fairEscape } from './utils.mjs';

const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const additionalQuantity = new RegExp(`\\d|\\b(?:${[...small, ...tens, 'hundred', 'thousand', 'million', 'half', 'quarter'].join('|')})\\b`, 'i');

function spokenNumber(text) {
  const normalized = text.toLowerCase().trim();
  if (/^(?:0|[1-9]\d?)$/.test(normalized)) return Number(normalized);
  if (small.includes(normalized)) return small.indexOf(normalized);
  const parts = normalized.split(/[\s-]+/);
  const ten = tens.indexOf(parts[0]);
  if (ten < 0 || parts.length > 2) return null;
  const one = parts.length === 1 ? 0 : small.indexOf(parts[1]);
  return one >= 0 && one <= 9 && (parts.length === 1 || one > 0) ? (ten + 2) * 10 + one : null;
}

// Only this unambiguous spoken question gets a numeral card; other tasks retain their full prompt.
export function fairQuestionCard(scene) {
  if (scene?.beat !== 'question' || typeof scene.narration !== 'string') return null;
  const match = /^\s*In ([a-z\d -]+), what is the value of the digit ([a-z\d -]+)\?([\s\S]*)$/i.exec(scene.narration);
  if (!match || /\?/.test(match[3]) || additionalQuantity.test(match[3])) return null;
  const number = spokenNumber(match[1]), digit = spokenNumber(match[2]);
  if (number === null || number < 1 || number > 99 || digit === null || digit > 9) return null;
  const numeral = String(number), selected = String(digit);
  if ([...numeral].filter(value => value === selected).length !== 1) return null;
  const digits = [...numeral].map(value => value === selected
    ? `<span data-selected-digit="${value}" style="color:#167566;text-decoration:underline;text-underline-offset:16px;text-decoration-thickness:8px">${value}</span>`
    : `<span>${value}</span>`).join('');
  return `<div class="fair-question-card"><p class="question-prompt">${fairEscape(scene.narration)}</p><div class="fair-question-number" role="img" aria-label="${numeral}; digit ${selected} highlighted" style="font-size:132px;font-weight:850;line-height:1.15;letter-spacing:8px;text-align:center;margin-top:24px">${digits}</div></div>`;
}
