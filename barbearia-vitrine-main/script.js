import { BOOKING_HOURS, DEPOSIT_AMOUNT, PRODUCTS, SERVICES } from "./shared/catalog.js";

// ===== Navegação mobile & smooth =====
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
menuToggle?.addEventListener('click', () => {
    if (!navLinks) return;
    navLinks.classList.toggle('active');
    const isOpen = navLinks.classList.contains('active');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
    const icon = menuToggle.querySelector('i');
    isOpen
        ? icon.classList.replace('bx-menu', 'bx-x')
        : icon.classList.replace('bx-x', 'bx-menu');
});
document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
        e.preventDefault();
        const id = a.getAttribute('href');
        const t = document.querySelector(id);
        if (!t) return;
        window.scrollTo({ top: t.getBoundingClientRect().top + window.pageYOffset - 80, behavior: 'smooth' });
        navLinks?.classList.remove('active');
        menuToggle?.setAttribute('aria-expanded', 'false');
        menuToggle?.setAttribute('aria-label', 'Abrir menu');
        const icon = menuToggle?.querySelector('i');
        icon?.classList.replace('bx-x', 'bx-menu');
    });
});

const hero = document.querySelector('.hero');
if (hero && window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let heroFrame = 0;
    hero.addEventListener('pointermove', (event) => {
        if (heroFrame) cancelAnimationFrame(heroFrame);
        heroFrame = requestAnimationFrame(() => {
            const bounds = hero.getBoundingClientRect();
            const x = (event.clientX - bounds.left) / bounds.width - 0.5;
            const y = (event.clientY - bounds.top) / bounds.height - 0.5;
            hero.style.setProperty('--hero-x', `${x * -12}px`);
            hero.style.setProperty('--hero-y', `${y * -10}px`);
            heroFrame = 0;
        });
    });
    hero.addEventListener('pointerleave', () => {
        hero.style.setProperty('--hero-x', '0px');
        hero.style.setProperty('--hero-y', '0px');
    });
}

// ===== Estado =====
let ctx = { profissional: null, wa: null, colecao: 'agendamentos' }; // <-- força agendamentos
let agendamentoContexto = {
    nomeCliente: '',
    produtos: [],
    totalProdutos: 0,
    raclub: { status: 'nao' },
    servico: null // {nome, valor}
};

// ===== Constantes =====
const REVIEW_URL = document.getElementById('btnAvaliarGoogle')?.getAttribute('href') || '';

const PRODUTOS = PRODUCTS;
const SERVICOS = [
    { nome: "Selecionar...", valor: null, placeholder: true },
    ...SERVICES
];

const toBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ===== Helpers de modal =====
function abrirModal(id) { document.getElementById(id).style.display = 'flex'; }
function fecharModal(id) { document.getElementById(id).style.display = 'none'; }
window.fecharModal = fecharModal;

// ===== Persistência (RA Club) =====
function salvarContextoSessao() {
    try {
        sessionStorage.setItem('agendamentoCtx', JSON.stringify(agendamentoContexto));
        sessionStorage.setItem('ctx', JSON.stringify(ctx));
    } catch { }
}
function restaurarContextoSessao() {
    try {
        const c1 = sessionStorage.getItem('agendamentoCtx');
        const c2 = sessionStorage.getItem('ctx');
        if (c1) agendamentoContexto = JSON.parse(c1);
        if (c2) ctx = JSON.parse(c2);
    } catch { }
}
function tentarRetomarPosCheckout() {
    const flag = sessionStorage.getItem('raclubCheckoutRedirect');
    if (flag === '1') {
        sessionStorage.removeItem('raclubCheckoutRedirect');
        restaurarContextoSessao();
        if (ctx?.colecao && ctx?.profissional) {
            agendamentoContexto.raclub = { status: 'assinar_link' };
            fecharModal('modalRAClub');
            abrirModalAgendamento();
        }
    }
}
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tentarRetomarPosCheckout();
});

// ===== Fluxo Nome → Produtos → RA Club → Agendamento =====
const nomeClienteInput = document.getElementById('nomeCliente');
document.getElementById('btnClienteContinuar')?.addEventListener('click', () => {
    const nome = (nomeClienteInput.value || '').trim();
    if (!nome) { alert('Digite seu nome para continuar.'); return; }
    agendamentoContexto.nomeCliente = nome;
    fecharModal('modalCliente');
    abrirModalProdutos();
});

// Produtos
const produtosContainer = document.getElementById('produtosContainer');
const prodTotalSpan = document.getElementById('prodTotal');
const btnProdutosPular = document.getElementById('btnProdutosPular');
const btnProdutosContinuar = document.getElementById('btnProdutosContinuar');

function renderProdutos() {
    produtosContainer.innerHTML = '';
    PRODUTOS.forEach((p, i) => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        card.dataset.index = i;
        card.innerHTML = `
      <div class="p-name">${p.nome}</div>
      <div class="p-price">${toBRL(p.preco)}</div>
      <small class="muted">Toque para selecionar</small>
    `;
        card.addEventListener('click', () => toggleProduto(i, card));
        produtosContainer.appendChild(card);
    });
}
function toggleProduto(index, cardEl) {
    const item = PRODUTOS[index];
    const exists = agendamentoContexto.produtos.find(pr => pr.nome === item.nome);
    if (exists) {
        agendamentoContexto.produtos = agendamentoContexto.produtos.filter(pr => pr.nome !== item.nome);
        cardEl.classList.remove('active');
    } else {
        agendamentoContexto.produtos.push({ nome: item.nome, preco: item.preco });
        cardEl.classList.add('active');
    }
    agendamentoContexto.totalProdutos = agendamentoContexto.produtos.reduce((s, it) => s + (it.preco || 0), 0);
    prodTotalSpan.textContent = toBRL(agendamentoContexto.totalProdutos);
}
function abrirModalProdutos() {
    agendamentoContexto.produtos = [];
    agendamentoContexto.totalProdutos = 0;
    prodTotalSpan.textContent = toBRL(0);
    renderProdutos();
    abrirModal('modalProdutos');
}
btnProdutosPular?.addEventListener('click', () => { fecharModal('modalProdutos'); abrirModalRAClub(); });
btnProdutosContinuar?.addEventListener('click', () => { fecharModal('modalProdutos'); abrirModalRAClub(); });

// RA Club
const btnRAJaMembro = document.getElementById('btnRAJaMembro');
const btnRANao = document.getElementById('btnRANao');
const btnRAAssinar = document.getElementById('btnRAAssinar');
function abrirModalRAClub() { abrirModal('modalRAClub'); }
btnRAJaMembro?.addEventListener('click', () => { agendamentoContexto.raclub = { status: 'membro' }; fecharModal('modalRAClub'); abrirModalAgendamento(); });
btnRANao?.addEventListener('click', () => { agendamentoContexto.raclub = { status: 'nao' }; fecharModal('modalRAClub'); abrirModalAgendamento(); });
if (btnRAAssinar) {
    const RA_CLUB_CHECKOUT_URL = btnRAAssinar.getAttribute('href') || '';
    btnRAAssinar.addEventListener('click', () => {
        agendamentoContexto.raclub = { status: 'assinar_link' };
        salvarContextoSessao();
        sessionStorage.setItem('raclubCheckoutRedirect', '1');
        if (!RA_CLUB_CHECKOUT_URL) alert('Link de checkout não configurado.');
    });
}

// Agendamento (data/hora)
const dataInput = document.getElementById('data');
const horaSelect = document.getElementById('hora');

// >>> horários fixos 09:00–18:00 de 1 em 1 hora
const MAPA_FIM_EXPEDIENTE = {
    'Rodrigo': '18:30',
    'Melqui': '17:30'
};
// AJUSTE: passo de 60 min e janela 09:00–18:00
function gerarIntervalos(inicio = '09:00', fim = '18:00', passoMin = 60) {
    const out = [];
    let [h, m] = inicio.split(':').map(Number);
    const [hF, mF] = fim.split(':').map(Number);
    while (h < hF || (h === hF && m <= mF)) {
        out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        m += passoMin;
        while (m >= 60) { m -= 60; h += 1; }
    }
    return out;
}
function fillHorasForProf(/* prof */) {
    horaSelect.innerHTML = `<option value="">Selecione um horário</option>` +
        BOOKING_HOURS.map(h => `<option>${h}</option>`).join('');
}

function resetSelectVisual() {
    for (const opt of horaSelect.options) {
        if (!opt.value) continue;
        opt.disabled = false;
        opt.classList.remove('reservado');
    }
}
function abrirModalAgendamento() {
    const hoje = new Date();
    const y = hoje.getFullYear();
    const m = String(hoje.getMonth() + 1).padStart(2, "0");
    const d = String(hoje.getDate()).padStart(2, "0");
    dataInput.min = `${y}-${m}-${d}`;
    dataInput.value = "";

    // horários fixos
    fillHorasForProf(ctx.profissional);

    horaSelect.value = "";
    resetSelectVisual();

    // exibe serviço atual no "display"
    const display = document.getElementById('servicoDisplay');
    display.value = agendamentoContexto.servico
        ? `${agendamentoContexto.servico.nome} — ${toBRL(agendamentoContexto.servico.valor)}`
        : '';

    abrirModal('modal');
    atualizarAvisoAgendamento();
}

// Botões dos profissionais
document.querySelectorAll('.openModalBtn').forEach(btn => {
    btn.addEventListener('click', () => {
        ctx.profissional = btn.dataset.pro || 'Profissional'; // guardamos o nome exibido
        ctx.wa = btn.dataset.wa || '5581999999999';
        // SEM usar coleções separadas; o painel lê "agendamentos"
        ctx.colecao = 'agendamentos';
        salvarContextoSessao();
        abrirModal('modalCliente');
    });
});

const confirmarBtn = document.getElementById('confirmarBtn');
const bookingStatus = document.getElementById('bookingStatus');
const bookingStatusText = document.getElementById('bookingStatusText');
const bookingFallbackLink = document.getElementById('bookingFallbackLink');

function atualizarAvisoAgendamento(mensagem = '', urlWhatsApp = '') {
    if (!bookingStatus || !bookingStatusText || !bookingFallbackLink) return;
    bookingStatusText.textContent = mensagem;
    bookingFallbackLink.href = urlWhatsApp;
    bookingFallbackLink.textContent = urlWhatsApp.startsWith('https://wa.me/')
        ? 'Falar com a barbearia pelo WhatsApp'
        : 'Abrir checkout do sinal';
    bookingFallbackLink.hidden = !urlWhatsApp;
    bookingStatus.hidden = !mensagem;
}

async function verificarRetornoPagamento() {
    const params = new URLSearchParams(window.location.search);
    const checkoutResult = params.get('checkout');
    const token = params.get('token');
    if (!checkoutResult || !token) return;

    const notice = document.getElementById('paymentReturnNotice');
    const noticeText = document.getElementById('paymentReturnText');
    const noticeIcon = notice?.querySelector('i');
    if (!notice || !noticeText) return;

    params.delete('checkout');
    params.delete('token');
    const cleanUrl = `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', cleanUrl);

    notice.hidden = false;
    noticeText.textContent = "Conferindo o pagamento do sinal...";
    for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
            const response = await fetch(`/api/booking-status?token=${encodeURIComponent(token)}`, {
                headers: { Accept: "application/json" }
            });
            const booking = await response.json();
            if (!response.ok) throw new Error(booking.error || "Não foi possível confirmar o pagamento.");

            if (booking.status === "paid") {
                noticeIcon?.classList.replace('bx-time-five', 'bx-check-circle');
                notice.classList.add('is-paid');
                noticeText.textContent = `Sinal de ${toBRL(booking.depositAmount)} aprovado. Horário confirmado com ${booking.professional} para ${formatDateBR(booking.date)} às ${booking.hour}.`;
                return;
            }
            if (booking.status === "payment_failed" || booking.status === "expired" || checkoutResult === "failure") {
                noticeIcon?.classList.replace('bx-time-five', 'bx-error-circle');
                notice.classList.add('is-payment-error');
                noticeText.textContent = booking.status === "expired"
                    ? "O prazo para pagar o sinal terminou e o horário foi liberado. Inicie um novo agendamento para tentar novamente."
                    : "O pagamento não foi aprovado. O horário não foi confirmado; fale com a barbearia para tentar novamente.";
                return;
            }
            noticeText.textContent = `Pagamento de ${toBRL(booking.depositAmount)} ainda pendente. O horário só fica confirmado depois que o Mercado Pago aprovar o sinal.`;
            if (checkoutResult !== "success" || attempt === 9) return;
            await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (error) {
            console.error("[payment-return]", error);
            noticeText.textContent = "Não foi possível verificar o pagamento agora. Confira a situação do sinal no Mercado Pago antes de considerar o horário confirmado.";
            return;
        }
    }
}

verificarRetornoPagamento();

function criarLinkWhatsApp(pedidoPendente = false) {
    const data = dataInput?.value;
    const hora = horaSelect?.value;
    const dataBR = data ? new Date(`${data}T00:00:00`).toLocaleDateString('pt-BR') : '';
    const linhas = [
        `Olá! Sou ${agendamentoContexto.nomeCliente || 'cliente'} e gostaria de ${pedidoPendente ? 'solicitar' : 'confirmar'} um horário.`,
        ctx.profissional ? `Profissional: ${ctx.profissional}` : '',
        dataBR ? `Data: ${dataBR}` : '',
        hora ? `Horário desejado: ${hora}` : '',
        agendamentoContexto.servico
            ? `Serviço: ${agendamentoContexto.servico.nome} (${toBRL(agendamentoContexto.servico.valor)})`
            : '',
        agendamentoContexto.produtos.length
            ? `Produtos: ${agendamentoContexto.produtos.map(p => `${p.nome} (${toBRL(p.preco)})`).join(', ')}`
            : '',
        agendamentoContexto.raclub.status === 'membro' ? 'RA Club: já sou membro' : '',
        pedidoPendente
            ? 'Não consegui concluir o pagamento do sinal de R$ 15,00 no site. Este contato não reservou o horário e não houve cobrança. Por favor, confirme a disponibilidade e como pagar o sinal com a barbearia.'
            : `Solicitação de agendamento. Sinal de ${toBRL(DEPOSIT_AMOUNT)} já pago no checkout do Mercado Pago.`
    ].filter(Boolean);
    return `https://wa.me/${ctx.wa}?text=${encodeURIComponent(linhas.join('\n'))}`;
}

async function getReservasByDate(ymd) {
    const response = await fetch(`/api/availability?date=${encodeURIComponent(ymd)}`, {
        headers: { Accept: "application/json" }
    });
    if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("A agenda online ainda não está publicada neste site.");
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível consultar a agenda.");
    return new Set(result.reserved || []);
}
async function carregarIndisponiveis() {
    if (!dataInput?.value) return;
    const date = dataInput.value;
    resetSelectVisual();
    try {
        const horas = await getReservasByDate(date);
        if (dataInput.value !== date) return;
        for (const opt of horaSelect.options) {
            if (!opt.value) continue;
            const ocupado = horas.has(opt.value);
            opt.disabled = ocupado;
            opt.classList.toggle('reservado', ocupado);
            if (ocupado && horaSelect.value === opt.value) horaSelect.value = '';
        }
        atualizarAvisoAgendamento();
    } catch (e) {
        console.error("Erro ao carregar horários:", e);
        atualizarAvisoAgendamento(`${e.message} O horário não foi reservado.`, criarLinkWhatsApp(true));
    }
}
dataInput?.addEventListener('change', () => {
    atualizarAvisoAgendamento();
    carregarIndisponiveis();
});

// ===== Modal de Serviço =====
const servicoDisplay = document.getElementById('servicoDisplay');
const servicoLista = document.getElementById('servicoLista');
const servicoCancelar = document.getElementById('servicoCancelar');
const servicoConfirmarWpp = document.getElementById('servicoConfirmarWpp');

// 🔍 busca
const svcSearch = document.getElementById('svcSearch');
let svcFilterText = "";
const norm = (s) => (s || "").normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function getFilteredServicos() {
    const base = SERVICOS.slice(1);
    if (!svcFilterText.trim()) return [SERVICOS[0], ...base];
    const f = norm(svcFilterText);
    const filtered = base.filter(s => norm(s.nome).includes(f));
    return [SERVICOS[0], ...filtered];
}
function renderListaServicos() {
    const items = getFilteredServicos();
    servicoLista.innerHTML = items.map((s) => {
        const checked = agendamentoContexto.servico
            ? (agendamentoContexto.servico.nome === s.nome ? 'checked' : '')
            : (s.placeholder ? 'checked' : '');
        const sub = s.placeholder ? '' : `<div class="svc-muted">${s.valor != null ? toBRL(s.valor) : ''}</div>`;
        return `
      <label class="svc-row" data-nome="${s.nome}">
        <div class="svc-left">
          <div class="svc-name">${s.nome}</div>
          ${sub}
        </div>
        <input class="svc-radio" type="radio" name="svc" value="${s.nome}" ${checked} />
      </label>
    `;
    }).join('');
    servicoLista.querySelectorAll('.svc-row').forEach(row => {
        row.addEventListener('click', () => {
            const radio = row.querySelector('input[type="radio"]');
            if (!radio) return;
            radio.checked = true;
        });
    });
}
function abrirServico() {
    svcFilterText = "";
    if (svcSearch) svcSearch.value = "";
    renderListaServicos();
    abrirModal('servicoModal');
}
servicoDisplay?.addEventListener('click', abrirServico);
servicoCancelar?.addEventListener('click', () => fecharModal('servicoModal'));
svcSearch?.addEventListener('input', (e) => { svcFilterText = e.target.value || ""; renderListaServicos(); });

servicoConfirmarWpp?.addEventListener('click', () => {
    const sel = servicoLista.querySelector('input[name="svc"]:checked');
    if (!sel) { alert('Selecione um serviço.'); return; }
    const nomeSel = sel.value;
    const s = SERVICOS.find(x => x.nome === nomeSel);
    if (!s || s.placeholder) { alert('Selecione um serviço.'); return; }

    agendamentoContexto.servico = { nome: s.nome, valor: s.valor };
    servicoDisplay.value = `${s.nome} — ${toBRL(s.valor)}`;
    fecharModal('servicoModal');
});

// ===== Confirmar agendamento =====
confirmarBtn?.addEventListener('click', async () => {
    const data = dataInput?.value;
    const hora = horaSelect?.value;
    if (!data || !hora) { alert("Selecione data e horário."); return; }
    if (!agendamentoContexto.servico) { alert("Selecione o serviço."); abrirServico(); return; }
    if (!ctx.wa) { alert("Profissional não definido."); return; }

    confirmarBtn.disabled = true;
    const originalText = confirmarBtn.textContent;
    confirmarBtn.textContent = "Preparando pagamento...";

    try {
        confirmarBtn.textContent = "Criando checkout...";
        const response = await fetch("/api/create-booking", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                nomeCliente: agendamentoContexto.nomeCliente,
                profissional: ctx.profissional,
                data,
                hora,
                servico: agendamentoContexto.servico.nome,
                produtos: agendamentoContexto.produtos,
                raclub: agendamentoContexto.raclub.status
            })
        });

        if (!response.headers.get("content-type")?.includes("application/json")) {
            throw new Error("O sistema de reserva com sinal ainda não está publicado neste site. Nenhum pagamento foi iniciado.");
        }
        const result = await response.json();
        if (!response.ok) {
            const error = new Error(result.error || "Não foi possível iniciar o pagamento.");
            error.status = response.status;
            throw error;
        }

        atualizarAvisoAgendamento(
            `Pague o sinal de ${toBRL(result.depositAmount)} no Mercado Pago em até 30 minutos. O horário só será confirmado quando o pagamento for aprovado.`
        );
        window.location.assign(result.checkoutUrl);
    } catch (err) {
        console.error("[CHECKOUT]", err);
        if (err.status === 409) {
            atualizarAvisoAgendamento("Esse horário acabou de ser reservado. Escolha outro horário.");
            await carregarIndisponiveis();
        } else {
            const pedidoPendente = criarLinkWhatsApp(true);
            atualizarAvisoAgendamento(
                `${err.message} Nenhuma reserva foi criada e nenhum sinal foi cobrado. Você pode falar com a barbearia para combinar outro horário e pagamento.`,
                pedidoPendente
            );
        }
    } finally {
        confirmarBtn.disabled = false;
        confirmarBtn.textContent = originalText || "Ir para pagamento do sinal";
    }
});

// Util
function formatDateBR(ymd) {
    if (!ymd) return "";
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
}

// Fechar modal clicando fora
window.addEventListener('click', (e) => {
    document.querySelectorAll('.modal').forEach(m => {
        if (e.target === m) m.style.display = 'none';
    });
});

// Retomar fluxo pós-checkout
tentarRetomarPosCheckout();
