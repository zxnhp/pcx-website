const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('#navigation');
menu.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open));
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
}));
document.querySelector('#year').textContent = new Date().getFullYear();
const search = document.querySelector('#product-search');
function filterProducts() {
  const query = search.value.trim().toLowerCase();
  let count = 0;
  document.querySelectorAll('.product-card').forEach(card => {
    const match = `${card.dataset.search} ${card.textContent}`.toLowerCase().includes(query);
    card.hidden = !match;
    if (match) count++;
  });
  document.querySelector('.search-status').textContent = query
    ? count ? `找到 ${count} 项相关业务` : '暂无匹配结果，其他材质或型号可直接电话咨询。'
    : '';
}
document.querySelector('.search').addEventListener('submit', event => { event.preventDefault(); filterProducts(); });
search.addEventListener('input', filterProducts);
const form = document.querySelector('#inquiry-form');
document.querySelectorAll('[data-product]').forEach(link => link.addEventListener('click', () => {
  form.elements.product.value = link.dataset.product;
}));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const button = form.querySelector('button');
  const status = document.querySelector('#form-status');
  button.disabled = true;
  status.textContent = '正在提交，请稍候…';
  const data = Object.fromEntries(new FormData(form));
  data.consent = form.elements.consent.checked;
  try {
    const response = await fetch('/api/inquiries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data), signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '提交失败，请稍后再试。');
    form.reset();
    status.textContent = '询价已提交！如需及时确认，请拨打 13510713508。';
  } catch (error) {
    status.textContent = error.name === 'TimeoutError' || error.name === 'TypeError'
      ? '网络连接异常，提交结果暂无法确认，请直接电话咨询。'
      : error.message;
  } finally { button.disabled = false; }
});
