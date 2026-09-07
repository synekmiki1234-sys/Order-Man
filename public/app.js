let me = null;
let selectedReceiver = null;
let editingOrderId = null;
let currentViewOrder = null;
let sending = false;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

async function api(url, options = {}) {
  const config = { credentials: 'same-origin', ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } };
  let response;
  try { response = await fetch(url, config); }
  catch { throw new Error('Brak połączenia z serwerem. Sprawdź, czy npm start nadal działa.'); }
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || `Błąd HTTP ${response.status}`);
  return data;
}

function toast(message, good = false) {
  const t = $('#toast');
  t.textContent = message;
  t.className = `toast show ${good ? 'good' : ''}`;
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.className = 'toast', 3500);
}
function open(id) { $('#' + id)?.classList.remove('hidden'); }
function close(id) { $('#' + id)?.classList.add('hidden'); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmt(date) { return new Date(date).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }); }
function fmtDate(date) { return new Date(date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }); }
function setButtonLoading(button, loading, text) {
  if (!button) return;
  if (loading) { button.dataset.oldText = button.textContent; button.disabled = true; button.textContent = text || 'CHWILA...'; }
  else { button.disabled = false; button.textContent = button.dataset.oldText || button.textContent; }
}

async function init() {
  try { const data = await api('/api/me'); setUser(data.user); }
  catch { showAuth('login'); }
}
function setUser(user) {
  me = user;
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#welcome').textContent = `${user.firstName} ${user.lastName}`;
  $('#welcomeRole').textContent = user.role === 'teacher' ? 'NAUCZYCIEL' : 'ODBIERACZ';
  $('#heroText').textContent = user.role === 'teacher' ? 'Twórz listy uczniów i wysyłaj je do odbieraczy.' : 'Nowe zamówienia pojawiają się pod dzwonkiem.';
  $('#profileName').textContent = `${user.firstName} ${user.lastName}`;
  $('#profileId').textContent = `ID: ${user.loginId}`;
  $('#accountId').textContent = user.loginId;
  $('#teacherHome').classList.toggle('hidden', user.role !== 'teacher');
  $('#receiverHome').classList.toggle('hidden', user.role !== 'receiver');
  loadAll();
}
function showAuth(which) {
  $('#auth').classList.remove('hidden');
  $('#app').classList.add('hidden');
  $$('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.auth === which));
  $('#loginForm').classList.toggle('hidden', which !== 'login');
  $('#registerForm').classList.toggle('hidden', which !== 'register');
  $('#authError').textContent = '';
}

$$('.tab').forEach(tab => tab.addEventListener('click', () => showAuth(tab.dataset.auth)));

$$('.toggle-password').forEach(btn => btn.addEventListener('click', () => {
  const input = btn.previousElementSibling;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.textContent = showing ? '👁' : '🙈';
  btn.setAttribute('aria-label', showing ? 'Pokaż hasło' : 'Ukryj hasło');
}));

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#authError').textContent = '';
  const form = new FormData(e.currentTarget);
  const button = e.currentTarget.querySelector('button[type="submit"]');
  setButtonLoading(button, true, 'LOGOWANIE...');
  try {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ login: form.get('login'), password: form.get('password'), rememberMe: form.has('rememberMe') }) });
    setUser(data.user); toast('Zalogowano.', true); e.currentTarget.reset();
  } catch (error) { $('#authError').textContent = error.message; }
  finally { setButtonLoading(button, false); }
});

$('#registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#authError').textContent = '';
  const form = new FormData(e.currentTarget);
  const button = e.currentTarget.querySelector('button[type="submit"]');
  setButtonLoading(button, true, 'TWORZENIE KONTA...');
  try {
    const data = await api('/api/register', { method: 'POST', body: JSON.stringify({ firstName: form.get('firstName'), lastName: form.get('lastName'), username: form.get('username'), password: form.get('password'), role: form.get('role'), rememberMe: form.has('rememberMe') }) });
    setUser(data.user); toast(`Konto utworzone. Twoje ID: ${data.user.loginId}`, true); e.currentTarget.reset();
  } catch (error) { $('#authError').textContent = error.message; }
  finally { setButtonLoading(button, false); }
});

$('#profileBtn').addEventListener('click', () => { close('bellPanel'); $('#profileMenu').classList.toggle('hidden'); });
$('#settingsBtn').addEventListener('click', () => { close('profileMenu'); open('settingsPanel'); });
$('#logoutBtn').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  me = null; close('profileMenu'); close('bellPanel'); close('settingsPanel'); showAuth('login'); toast('Wylogowano.', true);
});
$$('[data-close]').forEach(button => button.addEventListener('click', () => close(button.dataset.close)));
$('#accountBtn').addEventListener('click', () => $('#accountSection').classList.toggle('hidden'));
$('#deleteAccountBtn').addEventListener('click', async () => {
  if (!confirm('Na pewno usunąć konto? Zostaną też usunięte jego zamówienia.')) return;
  try { await api('/api/account', { method: 'DELETE' }); me = null; close('settingsPanel'); showAuth('login'); toast('Konto usunięte.', true); }
  catch (error) { toast(error.message); }
});

$('#createListBtn').addEventListener('click', () => { editingOrderId = null; selectedReceiver = null; resetOrderForm(); $('#orderModalTitle').textContent = 'STWÓRZ LISTĘ'; open('orderModal'); });
function resetOrderForm() {
  $('#orderForm').reset();
  $('#receiverResult').innerHTML = '';
  $('#studentEditor').classList.add('hidden');
  $('#orderError').textContent = '';
  $('#students').innerHTML = '';
  loadRosterInto($('#classSelect').value);
  $('#sendOrderBtn').disabled = false;
  $('#sendOrderBtn').textContent = 'WYŚLIJ ZAMÓWIENIE';
}
async function loadRosterInto(className) {
  $('#students').innerHTML = '';
  try {
    const data = await api('/api/roster?className=' + encodeURIComponent(className));
    if (data.names && data.names.length) data.names.forEach(name => addStudent({ name, eats: true }));
    else addStudent();
  } catch { addStudent(); }
}
$('#classSelect').addEventListener('change', () => {
  if (editingOrderId) return; // przy edycji nie nadpisujemy już wysłanej listy
  loadRosterInto($('#classSelect').value);
});
function addStudent(data = { name: '', eats: true }) {
  const row = document.createElement('div');
  row.className = 'student-row';
  row.innerHTML = `<input class="student-name" placeholder="Imię i nazwisko ucznia" value="${esc(data.name)}" maxlength="100"><label class="eat-toggle"><input type="checkbox" class="student-eats" ${data.eats !== false ? 'checked' : ''}> JE</label><button type="button" class="remove-student" aria-label="Usuń ucznia">×</button>`;
  row.querySelector('.remove-student').addEventListener('click', () => row.remove());
  $('#students').appendChild(row);
}
$('#addStudent').addEventListener('click', () => addStudent());

$('#findReceiver').addEventListener('click', async () => {
  const query = $('#receiverSearch').value.trim();
  $('#receiverResult').innerHTML = '';
  if (!query) return toast('Wpisz identyfikator odbieracza.');
  const button = $('#findReceiver');
  setButtonLoading(button, true, 'SZUKANIE...');
  try {
    const data = await api('/api/receivers?q=' + encodeURIComponent(query));
    if (!data.users.length) { selectedReceiver = null; $('#studentEditor').classList.add('hidden'); $('#receiverResult').innerHTML = '<div class="error">Nie znaleziono odbieracza. Sprawdź identyfikator.</div>'; return; }
    selectedReceiver = data.users[0];
    $('#receiverResult').innerHTML = `<div class="receiver-chip">✓ <b>${esc(selectedReceiver.firstName)} ${esc(selectedReceiver.lastName)}</b><br><small>${esc(selectedReceiver.loginId)} · @${esc(selectedReceiver.username)}</small></div>`;
    $('#studentEditor').classList.remove('hidden');
    if (!$('#students').children.length) addStudent();
  } catch (error) { toast(error.message); }
  finally { setButtonLoading(button, false); }
});

$('#orderForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (sending) return;
  $('#orderError').textContent = '';
  if (!selectedReceiver) return toast('Najpierw znajdź odbieracza po identyfikatorze.');
  const className = $('#classSelect').value;
  const students = $$('.student-row').map(row => ({ name: row.querySelector('.student-name').value.trim(), eats: row.querySelector('.student-eats').checked })).filter(s => s.name);
  if (!students.length) return toast('Dodaj przynajmniej jednego ucznia.');

  const body = { receiverId: selectedReceiver.id, className, students };
  const button = $('#sendOrderBtn');
  sending = true;
  setButtonLoading(button, true, editingOrderId ? 'ZAPISYWANIE...' : 'WYSYŁANIE...');
  try {
    const data = editingOrderId
      ? await api('/api/orders/' + encodeURIComponent(editingOrderId), { method: 'PUT', body: JSON.stringify(body) })
      : await api('/api/orders', { method: 'POST', body: JSON.stringify(body) });
    close('orderModal');
    toast(editingOrderId ? 'Lista została zaktualizowana.' : `Zamówienie wysłane do ${data.receiverName || 'odbieracza'}.`, true);
    editingOrderId = null;
    await loadSent();
  } catch (error) {
    $('#orderError').textContent = error.message;
    toast(error.message);
  } finally {
    sending = false;
    setButtonLoading(button, false);
  }
});

async function loadAll() {
  if (!me) return;
  if (me.role === 'teacher') await loadSent();
  else { await loadInbox(); await loadReceivedHistory(); }
}
async function loadSent() {
  try {
    const data = await api('/api/orders/sent');
    const box = $('#sentOrders');
    if (!data.orders.length) { box.innerHTML = '<div class="empty">Brak aktywnych list. Kliknij „STWÓRZ LISTĘ”.</div>'; return; }
    box.innerHTML = data.orders.map(order => `<div class="order-item"><div class="order-meta"><b>Klasa ${esc(order.className)}</b><small>${order.students.length} uczniów · ${fmt(order.createdAt)}</small><small>ID ${esc(order.id)}</small></div><div class="order-actions"><button type="button" data-edit="${esc(order.id)}">EDYTUJ</button><button type="button" data-del="${esc(order.id)}">USUŃ</button></div></div>`).join('');
    $$('#sentOrders [data-del]').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('Usunąć tę listę?')) return;
      try { await api('/api/orders/' + encodeURIComponent(button.dataset.del), { method: 'DELETE' }); toast('Lista usunięta.', true); await loadSent(); }
      catch (error) { toast(error.message); }
    }));
    $$('#sentOrders [data-edit]').forEach(button => button.addEventListener('click', () => editOrder(button.dataset.edit, data.orders)));
  } catch (error) { $('#sentOrders').innerHTML = `<div class="error">${esc(error.message)}</div>`; }
}
async function editOrder(id, orders) {
  const order = orders.find(item => item.id === id);
  if (!order) return;
  editingOrderId = id;
  selectedReceiver = await getReceiverById(order.receiverId);
  $('#orderModalTitle').textContent = 'EDYTUJ LISTĘ';
  $('#classSelect').value = order.className;
  $('#receiverSearch').value = selectedReceiver?.loginId || '';
  $('#receiverResult').innerHTML = selectedReceiver ? `<div class="receiver-chip">✓ <b>${esc(selectedReceiver.firstName)} ${esc(selectedReceiver.lastName)}</b><br><small>${esc(selectedReceiver.loginId)} · @${esc(selectedReceiver.username)}</small></div>` : '<div class="error">Nie znaleziono odbieracza. Wyszukaj go ponownie.</div>';
  $('#students').innerHTML = '';
  order.students.forEach(addStudent);
  $('#studentEditor').classList.remove('hidden');
  $('#orderError').textContent = '';
  open('orderModal');
}
async function getReceiverById(id) {
  try { const data = await api('/api/receivers?q=' + encodeURIComponent(id)); return data.users.find(u => u.id === id) || data.users[0] || null; }
  catch { return null; }
}

$('#bellBtn').addEventListener('click', () => { close('profileMenu'); open('bellPanel'); loadInbox(); });
async function loadInbox() {
  if (!me || me.role !== 'receiver') { $('#bellDot').classList.add('hidden'); $('#inbox').innerHTML = '<div class="empty">Dzwonek z zamówieniami jest dostępny dla odbieracza.</div>'; return; }
  try {
    const data = await api('/api/orders/inbox');
    $('#bellDot').classList.toggle('hidden', data.orders.length === 0);
    const box = $('#inbox');
    if (!data.orders.length) { box.innerHTML = '<div class="empty">Brak nowych zamówień.</div>'; return; }
    box.innerHTML = data.orders.map(order => `<div class="inbox-item"><b>Nowe zamówienie od ${esc(order.senderName)}</b><small>Klasa ${esc(order.className)} · ${fmt(order.createdAt)}</small><button type="button" data-view="${esc(order.id)}">ZOBACZ</button></div>`).join('');
    $$('#inbox [data-view]').forEach(button => button.addEventListener('click', () => viewOrder(button.dataset.view, data.orders)));
  } catch (error) { $('#inbox').innerHTML = `<div class="error">${esc(error.message)}</div>`; }
}
async function loadReceivedHistory() {
  if (!me || me.role !== 'receiver') return;
  try {
    const data = await api('/api/orders/received');
    const box = $('#receivedInfo');
    if (!data.orders.length) { box.innerHTML = '<div class="empty">Nie ma jeszcze odebranych zamówień.</div>'; return; }
    box.innerHTML = data.orders.map(order => `<div class="order-item"><div class="order-meta"><b>Klasa ${esc(order.className)}</b><small>Od: ${esc(order.senderName)}</small><small>Złożono: ${fmtDate(order.createdAt)} · Przyjęto: ${fmtDate(order.receivedAt)}</small></div><div class="received-mark">✓ PRZYJĘTE</div></div>`).join('');
  } catch (error) { $('#receivedInfo').innerHTML = `<div class="error">${esc(error.message)}</div>`; }
}
function viewOrder(id, orders) {
  const order = orders.find(item => item.id === id);
  if (!order) return;
  currentViewOrder = order;
  $('#viewTitle').textContent = `KLASA ${order.className}`;
  $('#viewBody').innerHTML = `<div class="date-box">Od: <b>${esc(order.senderName)}</b><br>Złożono: <b>${fmtDate(order.createdAt)}</b> (${new Date(order.createdAt).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})})</div>` + order.students.map(student => `<div class="student-view"><span>${esc(student.name)}</span><span class="status-eat ${student.eats ? 'yes' : 'no'}">${student.eats ? 'JE' : 'NIE JE'}</span></div>`).join('');
  open('viewOrderModal');
}
$('#ackBtn').addEventListener('click', async () => {
  if (!currentViewOrder) return;
  const button = $('#ackBtn');
  setButtonLoading(button, true, 'PRZYJMOWANIE...');
  try {
    await api('/api/orders/' + encodeURIComponent(currentViewOrder.id) + '/ack', { method: 'POST' });
    close('viewOrderModal'); currentViewOrder = null;
    await Promise.all([loadInbox(), loadReceivedHistory()]);
    toast('Zamówienie przyjęte. Zostało zapisane z datą.', true);
  } catch (error) { toast(error.message); }
  finally { setButtonLoading(button, false); }
});

setInterval(async () => {
  if (!me || me.role !== 'receiver') return;
  try { await loadInbox(); } catch {}
}, 5000);

document.addEventListener('click', event => {
  if (!event.target.closest('#profileMenu') && !event.target.closest('#profileBtn')) close('profileMenu');
});

init();
