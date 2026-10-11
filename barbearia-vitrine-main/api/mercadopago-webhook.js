import { createHmac, timingSafeEqual } from "node:crypto";
import { DEPOSIT_AMOUNT } from "../shared/catalog.js";
import { getAdminFirestore } from "../lib/firebaseAdmin.js";
import { requireMethod, sendJson } from "../lib/http.js";
import { FieldValue } from "firebase-admin/firestore";

function validSignature(request, paymentId, secret) {
    const signatureHeader = request.headers["x-signature"];
    const requestId = request.headers["x-request-id"];
    if (typeof signatureHeader !== "string" || typeof requestId !== "string") return false;
    const values = Object.fromEntries(signatureHeader.split(",").map((part) => {
        const [key, ...value] = part.trim().split("=");
        return [key, value.join("=")];
    }));
    if (!values.ts || !values.v1) return false;
    const manifest = `id:${paymentId};request-id:${requestId};ts:${values.ts};`;
    const expected = createHmac("sha256", secret).update(manifest).digest();
    let supplied;
    try {
        supplied = Buffer.from(values.v1, "hex");
    } catch {
        return false;
    }
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export default async function handler(request, response) {
    if (!requireMethod(request, response, "POST")) return;
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!secret || !accessToken) {
        return sendJson(response, 503, { error: "A integração de pagamentos não foi configurada." });
    }

    const bodyPaymentId = request.body?.data?.id;
    const query = new URL(request.url, "https://site.invalid").searchParams;
    const paymentId = String(bodyPaymentId || query.get("data.id") || query.get("id") || "");
    if (!/^\d+$/.test(paymentId)) return sendJson(response, 400, { error: "Notificação de pagamento inválida." });
    if (!validSignature(request, paymentId, secret)) {
        return sendJson(response, 401, { error: "Assinatura da notificação inválida." });
    }

    try {
        const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const payment = await paymentResponse.json();
        if (!paymentResponse.ok) {
            console.error("[mercadopago:payment]", payment);
            return sendJson(response, 502, { error: "Não foi possível verificar o pagamento." });
        }
        if (payment.currency_id !== "BRL" || Number(payment.transaction_amount) !== DEPOSIT_AMOUNT) {
            return sendJson(response, 422, { error: "O valor ou a moeda do pagamento não correspondem ao sinal." });
        }

        const token = payment.external_reference;
        if (typeof token !== "string" || !/^[0-9a-f-]{36}$/i.test(token)) {
            return sendJson(response, 422, { error: "O pagamento não está vinculado a um agendamento." });
        }
        const db = getAdminFirestore();
        const matches = await db.collection("agendamentos").where("checkoutToken", "==", token).limit(1).get();
        if (matches.empty) return sendJson(response, 200, { received: true });
        const ref = matches.docs[0].ref;
        const payer = payment.payer || {};
        const approved = payment.status === "approved";
        const failed = ["rejected", "cancelled", "refunded", "charged_back"].includes(payment.status);

        await db.runTransaction(async (transaction) => {
            const current = await transaction.get(ref);
            if (!current.exists || current.data().checkoutToken !== token) return;
            transaction.update(ref, {
                checkoutStatus: approved ? "paid" : failed ? "payment_failed" : "pending_payment",
                paymentStatus: payment.status || "pending",
                paymentProvider: "mercadopago",
                paymentPreferenceId: current.data().paymentPreferenceId || null,
                mercadopagoPaymentId: String(payment.id),
                pagamentoForma: payment.payment_method_id === "pix" ? "Pix (Mercado Pago)" : "Mercado Pago",
                payerName: [payer.first_name, payer.last_name].filter(Boolean).join(" ") || payer.name || null,
                payerEmail: payer.email || null,
                paymentType: payment.payment_type_id || null,
                paymentApprovedAt: approved ? FieldValue.serverTimestamp() : null,
                updatedAt: FieldValue.serverTimestamp()
            });
        });
        return sendJson(response, 200, { received: true });
    } catch (error) {
        console.error("[mercadopago:webhook]", error);
        return sendJson(response, 503, { error: "Não foi possível processar a notificação." });
    }
}
