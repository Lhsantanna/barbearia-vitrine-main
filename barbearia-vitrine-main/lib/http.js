export function sendJson(response, status, body) {
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify(body));
}

export async function readJson(request) {
    if (request.body && typeof request.body === "object") return request.body;

    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > 16_384) throw Object.assign(new Error("A solicitação excede o tamanho permitido."), { status: 413 });
        chunks.push(chunk);
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw Object.assign(new Error("A solicitação não contém JSON válido."), { status: 400 });
    }
}

export function requireMethod(request, response, method) {
    if (request.method === method) return true;
    response.setHeader("Allow", method);
    sendJson(response, 405, { error: `Use o método ${method}.` });
    return false;
}

export function siteOrigin(request) {
    const configured = process.env.PUBLIC_SITE_URL;
    if (!configured) throw new Error("PUBLIC_SITE_URL não foi configurada.");
    const url = new URL(configured);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
        throw new Error("PUBLIC_SITE_URL precisa usar HTTPS em produção.");
    }
    return url.origin;
}
