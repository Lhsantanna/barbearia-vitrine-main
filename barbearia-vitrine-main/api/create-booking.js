import { randomUUID } from "node:crypto";
import { BOOKING_HOURS, DEPOSIT_AMOUNT, PRODUCTS, PROFESSIONALS, SERVICES } from "../shared/catalog.js";
import { getAdminFirestore } from "../lib/firebaseAdmin.js";
import { readJson, requireMethod, sendJson, siteOrigin } from "../lib/http.js";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const serviceByName = new Map(SERVICES.map((service) => [service.nome.trim(), service]));
const productByName = new Map(PRODUCTS.map((product) => [product.nome.trim(), product]));

function localToday() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Recife" }).format(new Date());
}

function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= localToday();
}

function normalizedProducts(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > PRODUCTS.length) {
        throw Object.assign(new Error("A lista de produtos não é válida."), { status: 400 });
    }
    const seen = new Set();
    return value.map((item) => {
        const name = typeof item?.nome === "string" ? item.nome.trim() : "";
        const product = productByName.get(name);
        if (!product || seen.has(name)) {
            throw Object.assign(new Error("Um produto selecionado não está no catálogo."), { status: 400 });
        }
        seen.add(name);
        return { nome: product.nome, preco: product.preco };
    });
}

function isExpired(data, now) {
    if (data.checkoutStatus === "payment_failed") return true;
    const expiry = data.checkoutExpiresAt?.toDate?.();
    return data.checkoutStatus === "pending_payment" && (!expiry || expiry.getTime() <= now);
}

export default async function handler(request, response) {
    if (!requireMethod(request, response, "POST")) return;

    let holdRef;
    let checkoutToken;
    try {
        const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
        const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
        const origin = siteOrigin(request);
        if (!accessToken || !webhookSecret) {
            return sendJson(response, 503, { error: "O pagamento do sinal ainda não foi configurado para esta barbearia." });
        }

        const body = await readJson(request);
        const customerName = typeof body.nomeCliente === "string" ? body.nomeCliente.trim().replace(/\s+/g, " ") : "";
        const professional = typeof body.profissional === "string" ? body.profissional.trim() : "";
        const serviceName = typeof body.servico === "string" ? body.servico.trim() : "";
        const date = body.data;
        const hour = body.hora;
        const service = serviceByName.get(serviceName);
        if (customerName.length < 2 || customerName.length > 80 ||
            !PROFESSIONALS.includes(professional) || !service ||
            !validDate(date) || !BOOKING_HOURS.includes(hour)) {
            return sendJson(response, 400, { error: "Confira nome, profissional, serviço, data e horário." });
        }

        const products = normalizedProducts(body.produtos);
        const totalProducts = products.reduce((total, product) => total + product.preco, 0);
        const isRaClub = body.raclub === "membro";
        const bookingId = `ag_${date}_${hour}_barbeiro`;
        checkoutToken = randomUUID();
        const now = Date.now();
        const expiresAt = new Date(now + 30 * 60 * 1000);
        const db = getAdminFirestore();
        holdRef = db.collection("agendamentos").doc(bookingId);
        const booking = {
            dataISO: date,
            hora: hour,
            profissional: "barbeiro",
            diaProf: `${date}#barbeiro`,
            barbeiroNome: professional,
            clienteNome: customerName,
            cliente: customerName,
            servico: service.nome,
            servicoNome: service.nome,
            valor: service.valor,
            servicoValor: service.valor,
            produtos,
            totalProdutos,
            raclub: { status: isRaClub ? "membro" : "nao" },
            raclubMembro: isRaClub,
            clienteTipo: isRaClub ? "raclub" : "cliente",
            tags: isRaClub ? ["raclub"] : [],
            bloqueado: false,
            pagamentoForma: "",
            checkoutStatus: "pending_payment",
            paymentStatus: "pending",
            paymentProvider: "mercadopago",
            depositAmount: DEPOSIT_AMOUNT,
            checkoutToken,
            checkoutExpiresAt: Timestamp.fromDate(expiresAt),
            createdAt: FieldValue.serverTimestamp()
        };

        const held = await db.runTransaction(async (transaction) => {
            const sameDay = await transaction.get(
                db.collection("agendamentos").where("dataISO", "==", date)
            );
            const conflictingBooking = sameDay.docs.some((document) =>
                document.data().hora === hour && !isExpired(document.data(), now)
            );
            if (conflictingBooking) return false;

            const existing = await transaction.get(holdRef);
            if (existing.exists && !isExpired(existing.data(), now)) return false;
            transaction.set(holdRef, booking);
            return true;
        });
        if (!held) return sendJson(response, 409, { error: "Este horário acabou de ser ocupado. Escolha outro." });

        const backUrl = (result) => `${origin}/?checkout=${result}&token=${encodeURIComponent(checkoutToken)}`;
        const preferenceResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                "X-Idempotency-Key": checkoutToken
            },
            body: JSON.stringify({
                items: [{
                    id: bookingId,
                    title: `Sinal de agendamento - ${service.nome}`,
                    description: `Sinal de R$ 15,00 para ${professional}, ${date} às ${hour}.`,
                    quantity: 1,
                    currency_id: "BRL",
                    unit_price: DEPOSIT_AMOUNT
                }],
                payer: { name: customerName },
                external_reference: checkoutToken,
                metadata: {
                    booking_id: bookingId,
                    customer_name: customerName,
                    professional,
                    appointment_date: date,
                    appointment_hour: hour,
                    service_name: service.nome,
                    deposit_amount: DEPOSIT_AMOUNT
                },
                notification_url: `${origin}/api/mercadopago-webhook`,
                back_urls: {
                    success: backUrl("success"),
                    pending: backUrl("pending"),
                    failure: backUrl("failure")
                },
                auto_return: "approved",
                expires: true,
                expiration_date_from: new Date(now).toISOString(),
                expiration_date_to: expiresAt.toISOString()
            })
        });
        const preference = await preferenceResponse.json();
        const checkoutUrl = preferenceResponse.ok ? preference.init_point : null;
        if (!checkoutUrl) {
            console.error("[mercadopago:preference]", preference);
            throw Object.assign(new Error("O Mercado Pago não conseguiu criar o pagamento do sinal."), { status: 502 });
        }

        await holdRef.update({
            paymentPreferenceId: preference.id,
            checkoutUrl,
            updatedAt: FieldValue.serverTimestamp()
        });
        return sendJson(response, 201, {
            checkoutUrl,
            checkoutToken,
            expiresAt: expiresAt.toISOString(),
            depositAmount: DEPOSIT_AMOUNT
        });
    } catch (error) {
        console.error("[create-booking]", error);
        if (holdRef && checkoutToken) {
            try {
                await getAdminFirestore().runTransaction(async (transaction) => {
                    const snapshot = await transaction.get(holdRef);
                    if (snapshot.exists && snapshot.data().checkoutToken === checkoutToken &&
                        snapshot.data().checkoutStatus === "pending_payment") {
                        transaction.delete(holdRef);
                    }
                });
            } catch (cleanupError) {
                console.error("[create-booking:cleanup]", cleanupError);
            }
        }
        return sendJson(response, error.status || 503, {
            error: error.status ? error.message : "Não foi possível iniciar o pagamento do sinal. Tente novamente."
        });
    }
}
