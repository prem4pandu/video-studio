const $ = id => document.getElementById(id);
const state = { session: null, phase: 'intro', stepIndex: 0, currentCheck: null, response: null, score: 0, attempts: 0 };
const lessonId = new URLSearchParams(location.search).get('lesson') === 'equivalent-fractions' ? 'equivalent-fractions' : 'decimal-place-value';
const recallKey = () => `fair-recall-due:${state.session.id}`;

function renderModel(model) {
  if (!model) { $('hundred-square').replaceChildren(); $('model-count').textContent = ''; $('model-label').textContent = 'The representation will stay fixed while we compare.'; return; }
  if (model.kind === 'fraction-bars') {
    $('model-key').hidden = true;
    $('model-title').textContent = 'Fraction bars'; $('hundred-square').className = 'fraction-bars'; $('model-count').textContent = `${model.bars.length} model${model.bars.length === 1 ? '' : 's'}`;
    const bars = model.bars.map(bar => {
      const row = document.createElement('div'); row.className = 'fraction-row';
      const pieces = document.createElement('div'); pieces.className = 'fraction-pieces';
      pieces.style.gridTemplateColumns = `repeat(${bar.denominator}, 1fr)`;
      pieces.replaceChildren(...Array.from({ length: bar.denominator }, (_, index) => { const piece = document.createElement('span'); if (index < bar.numerator) piece.className = 'filled'; return piece; }));
      const text = document.createElement('strong'); text.textContent = bar.label; row.append(pieces, text); return row;
    });
    $('hundred-square').replaceChildren(...bars); $('hundred-square').setAttribute('aria-label', model.bars.map(bar => `${bar.numerator} of ${bar.denominator} equal parts shaded, labelled ${bar.label}`).join('; '));
    $('model-label').textContent = model.label; return;
  }
  const full = model.shadedTenths * 10, extra = model.shadedHundredths;
  $('model-key').hidden = false;
  const cells = Array.from({ length: 100 }, (_, index) => {
    const cell = document.createElement('span'); cell.className = 'cell';
    if (index < full) cell.classList.add('tenth');
    else if (index < full + extra) cell.classList.add('hundredth');
    return cell;
  });
  $('model-title').textContent = 'Hundred-square'; $('hundred-square').className = 'hundred-square'; $('hundred-square').replaceChildren(...cells);
  $('hundred-square').setAttribute('aria-label', `${full} hundredth cells in complete tenths and ${extra} extra hundredth cells are shaded out of 100.`);
  $('model-count').textContent = `${full + extra} / 100`;
  $('model-label').textContent = model.label;
}

function renderInitialModel() {
  const kind = state.session.steps[0].model.kind;
  renderModel(kind === 'fraction-bars'
    ? { kind, label: 'The whole stays the same size.', bars: [{ numerator: 0, denominator: 2, label: 'One whole, ready to partition' }] }
    : { kind, shadedTenths: 0, shadedHundredths: 0, label: 'The outside boundary never changes.' });
}

function setCopy(eyebrow, title, body) { $('eyebrow').textContent = eyebrow; $('title').textContent = title; $('body').textContent = body; }
function setProgress(label) { $('progress-label').textContent = label; }
function hideQuestion() { $('question').hidden = true; $('feedback').hidden = true; state.currentCheck = null; }
function showCheck(id) {
  const item = state.session.checks.find(check => check.id === id); state.currentCheck = item; state.response = null;
  setCopy(`${item.phase.toUpperCase()} CHECK`, item.phase === 'readiness' ? 'Before we begin' : item.phase === 'practice' ? 'Try a new number' : 'Use the idea somewhere new', item.explanationPrompt);
  $('prompt').textContent = item.prompt; $('choices').replaceChildren(...item.choices.map(option => {
    const label = document.createElement('label'); label.className = 'choice';
    const input = document.createElement('input'); input.type = 'radio'; input.name = 'answer'; input.value = option.id;
    const text = document.createElement('span'); text.textContent = option.text; label.append(input, text); return label;
  }));
  $('explanation').value = ''; $('question').hidden = false; $('check').disabled = false; $('feedback').hidden = true; $('continue').hidden = true;
  setProgress(item.phase === 'readiness' ? '1 of 4 · readiness' : item.phase === 'practice' ? '3 of 4 · practice' : '4 of 4 · transfer');
}

function showStep(step) {
  hideQuestion(); setCopy(step.eyebrow.toUpperCase(), step.title, step.body); renderModel(step.model); $('continue').hidden = false;
}

function completeSession(fromRecall = false) {
  state.phase = 'complete'; const recap = state.session.steps.find(step => step.id === 'recap-rule'); showStep(recap);
  let message;
  if (fromRecall) {
    localStorage.removeItem(recallKey());
    message = `You returned to the idea and answered ${state.score} of ${state.attempts} first attempts correctly.`;
  } else {
    const due = new Date(Date.now() + state.session.recallDelayHours * 3_600_000).toISOString(); localStorage.setItem(recallKey(), due);
    message = `You answered ${state.score} of ${state.attempts} first attempts correctly. A short recall question is scheduled for your next visit after ${new Date(due).toLocaleString()}.`;
  }
  setCopy('LESSON COMPLETE', 'You explained the idea—not just the answer', message);
  $('continue').hidden = true; $('restart').hidden = false; setProgress(fromRecall ? 'Recall complete' : 'Complete · recall scheduled');
}

function advance() {
  if (state.phase === 'intro') { state.phase = 'readiness'; showCheck('readiness'); return; }
  if (state.phase === 'readiness') { state.phase = 'teaching'; state.stepIndex = 0; showStep(state.session.steps.filter(step => ['explain','guided'].includes(step.phase))[0]); $('continue').textContent = 'Show the next idea'; setProgress('2 of 4 · explanation'); return; }
  if (state.phase === 'repair') { state.phase = state.response.returnPhase; state.response = null; if (state.phase === 'readiness') advance(); else showCheck(state.phase); return; }
  if (state.phase === 'teaching') {
    const teaching = state.session.steps.filter(step => ['explain','guided'].includes(step.phase)); state.stepIndex += 1;
    if (state.stepIndex < teaching.length) { showStep(teaching[state.stepIndex]); return; }
    state.phase = 'practice'; showCheck('practice'); return;
  }
  if (state.phase === 'practice') { state.phase = 'transfer'; showCheck('transfer'); return; }
  if (state.phase === 'transfer') { completeSession(false); return; }
  if (state.phase === 'recall') completeSession(true);
}

function checkAnswer() {
  const selected = document.querySelector('input[name="answer"]:checked');
  if (!selected) { $('feedback').className = 'feedback'; $('feedback').textContent = 'Choose an answer first, then check your thinking.'; $('feedback').hidden = false; $('feedback').focus(); return; }
  const item = state.currentCheck, choice = item.choices.find(option => option.id === selected.value), correct = selected.value === item.correctChoiceId;
  state.attempts += 1; if (correct) state.score += 1;
  $('feedback').className = `feedback${correct ? ' correct' : ''}`; $('feedback').textContent = correct ? item.successMessage : choice.feedback; $('feedback').hidden = false; $('feedback').focus();
  $('check').disabled = true; document.querySelectorAll('input[name="answer"]').forEach(input => { input.disabled = true; });
  $('continue').hidden = false; $('continue').textContent = correct ? 'Continue' : 'Show me why';
  if (!correct) state.response = { repairStepId: item.repairStepId, returnPhase: item.phase };
}

$('continue').addEventListener('click', () => {
  if (state.response?.repairStepId) { const repair = state.session.steps.find(step => step.id === state.response.repairStepId); state.phase = 'repair'; showStep(repair); $('continue').textContent = 'Continue to the lesson'; return; }
  advance();
});
$('check').addEventListener('click', checkAnswer);
$('restart').addEventListener('click', () => { localStorage.removeItem(recallKey()); location.reload(); });

try {
  const response = await fetch(`./api/demo/${lessonId}`); if (!response.ok) throw new Error(`HTTP ${response.status}`);
  state.session = (await response.json()).session; document.title = `${state.session.title} · Fair Learning Session`; $('lesson-label').textContent = `LEARNING LAB · ${lessonId.replaceAll('-', ' ').toUpperCase()}`;
  $('title').textContent = state.session.title; $('body').textContent = state.session.objective; $('eyebrow').textContent = `AGES ${state.session.ageRange.join('–')} · ABOUT ${state.session.estimatedMinutes} MINUTES`; renderInitialModel();
  const due = localStorage.getItem(recallKey());
  if (due && new Date(due).getTime() <= Date.now()) { state.phase = 'recall'; showCheck('recall'); setProgress('Recall · one day later'); }
} catch {
  setCopy('LESSON UNAVAILABLE', 'The learning session could not load', 'Start the local Video Studio server, then open this page again.'); $('continue').disabled = true;
}
