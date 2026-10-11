import { getAdminFirestore } from "../lib/firebaseAdmin.js";
import { requireMethod, sendJson } from "../lib/http.js";

export default async function handler(request, response) {
    if (!requireMethod(request, response, "GET")) return;
    const token = request.query?.token || new URL(request.url, "https://site.invalid").searchParams.get("token");
    if (typeof token !== "string" || !/^[0-9a-f-]{36}$/i.test(token)) {
        return sendJson(response, 400, { error: "O identificador do agendamento não é válido." });
    }
    try {
        const result = await getAdminFirestore()
            .collection("agendamentos")
            .where("checkoutToken", "==", token)
            .limit(1)
            .get();
        if (result.empty) return sendJson(response, 404, { error: "Agendamento não encontrado." });
        const booking = result.docs[0].data();
        const expiresAt = booking.checkoutExpiresAt?.toDate?.() || null;
        const status = booking.checkoutStatus === "pending_payment" &&
            (!expiresAt || expiresAt.getTime() <= Date.now())
            ? "expired"
            : booking.checkoutStatus;
        return sendJson(response, 200, {
            status,
            date: booking.dataISO,
            hour: booking.hora,
            professional: booking.barbeiroNome,
            service: booking.servicoNome,
            depositAmount: booking.depositAmount,
            expiresAt: expiresAt?.toISOString() || null
        });
    } catch (error) {
        console.error("[booking-status]", error);
        return sendJson(response, 503, { error: "Não foi possível consultar o pagamento." });
    }
}
