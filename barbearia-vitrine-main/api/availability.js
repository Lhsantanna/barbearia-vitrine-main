import { BOOKING_HOURS } from "../shared/catalog.js";
import { getAdminFirestore } from "../lib/firebaseAdmin.js";
import { requireMethod, sendJson } from "../lib/http.js";

function isLiveHold(data, now) {
    if (data.bloqueado) return true;
    if (data.checkoutStatus === "paid") return true;
    if (data.checkoutStatus === "payment_failed") return false;
    if (data.checkoutStatus === "pending_payment") {
        const expiresAt = data.checkoutExpiresAt?.toDate?.();
        return Boolean(expiresAt && expiresAt.getTime() > now);
    }
    return true;
}

export default async function handler(request, response) {
    if (!requireMethod(request, response, "GET")) return;
    const date = request.query?.date || new URL(request.url, "https://site.invalid").searchParams.get("date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
        return sendJson(response, 400, { error: "Informe uma data válida." });
    }

    try {
        const snapshot = await getAdminFirestore()
            .collection("agendamentos")
            .where("dataISO", "==", date)
            .get();
        const now = Date.now();
        const busy = new Set();
        for (const document of snapshot.docs) {
            const data = document.data();
            if (isLiveHold(data, now) && data.hora) busy.add(String(data.hora).slice(0, 5));
        }
        return sendJson(response, 200, {
            reserved: [...busy],
            available: BOOKING_HOURS.filter((hour) => !busy.has(hour))
        });
    } catch (error) {
        console.error("[availability]", error);
        return sendJson(response, 503, { error: "Não foi possível consultar a agenda agora." });
    }
}
