const stage = document.getElementById('concept-stage');
const tabs = [...document.querySelectorAll('[data-concept]')];
const panels = [...document.querySelectorAll('[data-panel]')];
const viewportButtons = [...document.querySelectorAll('[data-viewport]')];

function activateConcept(name, focus = false) {
  for (const tab of tabs) {
    const selected = tab.dataset.concept === name;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  for (const panel of panels) {
    const selected = panel.dataset.panel === name;
    panel.hidden = !selected;
    panel.classList.toggle('active', selected);
  }
  history.replaceState(null, '', `#${name}`);
}

for (const tab of tabs) {
  tab.addEventListener('click', () => activateConcept(tab.dataset.concept));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    activateConcept(tabs[next].dataset.concept, true);
  });
}

for (const button of viewportButtons) {
  button.addEventListener('click', () => {
    const mobile = button.dataset.viewport === 'mobile';
    stage.classList.toggle('preview-mobile', mobile);
    for (const candidate of viewportButtons) {
      const selected = candidate === button;
      candidate.classList.toggle('active', selected);
      candidate.setAttribute('aria-pressed', String(selected));
    }
  });
}

document.querySelectorAll('.scene-thumb').forEach(button => button.addEventListener('click', () => {
  button.closest('.scene-strip').querySelectorAll('.scene-thumb').forEach(candidate => candidate.classList.toggle('active', candidate === button));
}));

document.querySelectorAll('.look-options button').forEach(button => button.addEventListener('click', () => {
  button.closest('.look-options').querySelectorAll('button').forEach(candidate => candidate.classList.toggle('active', candidate === button));
}));

document.querySelectorAll('.visual-choices label').forEach(label => label.addEventListener('click', () => {
  label.closest('.visual-choices').querySelectorAll('label').forEach(candidate => candidate.classList.toggle('selected', candidate === label));
}));

const requested = location.hash.slice(1);
if (tabs.some(tab => tab.dataset.concept === requested)) activateConcept(requested);
