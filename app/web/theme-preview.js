const mock = document.getElementById('mock');
  for (const id of ['fa','fb','fc','fd']) document.getElementById(id).appendChild(mock.content.cloneNode(true));
  document.querySelectorAll('.switcher button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.switcher button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.frame').forEach(f => f.classList.toggle('on', f.id === 'f' + b.dataset.t));
    location.hash = b.dataset.t;
  }));
  const h = location.hash.slice(1);
  if (h) document.querySelector(`[data-t="${h}"]`)?.click();
