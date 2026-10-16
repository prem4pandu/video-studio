// Input is a validated base-ten visual. Renderer and reviewer share these states.
export const fairDigits = number => [number % 10, Math.floor(number / 10) % 10, Math.floor(number / 100) % 10];

export function fairBaseTenState(visual) {
  const place = ['ones', 'tens', 'hundreds'].indexOf(visual.place);
  const initial = fairDigits(visual.number);
  const finalValue = visual.mode === 'digit-shift' ? visual.number * 10 : visual.number;
  const final = fairDigits(finalValue);
  if (visual.mode === 'group') {
    initial[place] += initial[place + 1] * 10;
    initial[place + 1] = 0;
  }
  if (visual.mode === 'trade') {
    initial[place] += 10;
    initial[place + 1]--;
  }
  return { initial, final, initialValue: visual.number, finalValue, place };
}
