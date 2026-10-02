import { createClient } from "@supabase/supabase-js";
import { Server } from "@hocuspocus/server";
import * as Y from "yjs";
const requiredEnvironment = (name) => {
    const value = process.env[name];
    if (!value)
        throw new Error(`Missing required environment variable: ${name}`);
    return value;
};
const supabaseUrl = requiredEnvironment("SUPABASE_URL");
const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
const allowedOrigins = new Set((process.env.APP_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean));
const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});
const parseDocumentId = (documentName) => {
    const id = documentName.toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
        throw new Error("Invalid collaborative document identifier.");
    }
    return id;
};
async function readAccess(userId, documentId) {
    const [profileResult, documentResult, memberResult] = await Promise.all([
        supabase
            .from("profilec")
            .select("full_name, is_approved")
            .eq("id", userId)
            .maybeSingle(),
        supabase
            .from("collaborative_documents")
            .select("created_by, status")
            .eq("id", documentId)
            .maybeSingle(),
        supabase
            .from("collaborative_document_members")
            .select("permission")
            .eq("document_id", documentId)
            .eq("user_id", userId)
            .maybeSingle(),
    ]);
    if (profileResult.error)
        throw profileResult.error;
    if (documentResult.error)
        throw documentResult.error;
    if (memberResult.error)
        throw memberResult.error;
    const profile = profileResult.data;
    const document = documentResult.data;
    const member = memberResult.data;
    if (!profile?.is_approved || !document)
        return null;
    const permission = document.created_by === userId ? "owner" : (member?.permission ?? null);
    if (!permission)
        return null;
    return {
        documentId,
        userId,
        fullName: profile.full_name?.trim() || "Staff member",
        permission,
        status: document.status,
    };
}
async function authenticate(token, documentName) {
    if (!token)
        throw new Error("Authentication required.");
    const documentId = parseDocumentId(documentName);
    const { data: { user }, error, } = await supabase.auth.getUser(token);
    if (error || !user)
        throw new Error("Invalid or expired Supabase session.");
    const access = await readAccess(user.id, documentId);
    if (!access)
        throw new Error("You do not have access to this document.");
    return access;
}
function canEdit(access) {
    return ((access.permission === "owner" || access.permission === "editor") &&
        (access.status === "draft" || access.status === "in_review"));
}
async function recheckConnection(context, documentName) {
    const documentId = parseDocumentId(documentName);
    if (documentId !== context.documentId) {
        throw new Error("Document access mismatch.");
    }
    const access = await readAccess(context.userId, documentId);
    if (!access)
        throw new Error("Document access was revoked.");
    return access;
}
const collaboration = new Server({
    address: "0.0.0.0",
    port: Number(process.env.PORT ?? 1234),
    quiet: false,
    debounce: 2000,
    maxDebounce: 10000,
    unloadImmediately: false,
    async onConnect({ requestHeaders }) {
        const origin = requestHeaders.get("origin");
        if (!origin || !allowedOrigins.has(origin)) {
            throw new Error("This application origin is not allowed.");
        }
    },
    async onAuthenticate({ token, documentName, connectionConfig }) {
        const access = await authenticate(token, documentName);
        connectionConfig.readOnly = !canEdit(access);
        return access;
    },
    async onTokenSync({ token, documentName, connection, connectionConfig }) {
        const access = await authenticate(token, documentName);
        connectionConfig.readOnly = !canEdit(access);
        connection.context = access;
        connection.readOnly = !canEdit(access);
        return access;
    },
    async beforeSync({ context, documentName, connection }) {
        const access = await recheckConnection(context, documentName);
        connection.readOnly = !canEdit(access);
    },
    async beforeHandleMessage({ context, documentName, connection }) {
        const access = await recheckConnection(context, documentName);
        if (!canEdit(access)) {
            connection.readOnly = true;
            throw new Error("You no longer have permission to edit this document.");
        }
    },
    async beforeHandleAwareness({ context, documentName }) {
        if (!context)
            return;
        await recheckConnection(context, documentName);
    },
    async onLoadDocument({ document, documentName }) {
        const documentId = parseDocumentId(documentName);
        const { data, error } = await supabase.rpc("load_collaborative_document_state", { target_document_id: documentId });
        if (error)
            throw error;
        if (typeof data === "string" && data.length > 0) {
            Y.applyUpdate(document, Buffer.from(data, "base64"));
        }
    },
    async onStoreDocument({ document, documentName }) {
        const documentId = parseDocumentId(documentName);
        const stateBase64 = Buffer.from(Y.encodeStateAsUpdate(document)).toString("base64");
        const { error } = await supabase.rpc("store_collaborative_document_state", {
            target_document_id: documentId,
            state_base64: stateBase64,
        });
        if (error)
            throw error;
    },
});
const revocationChannel = supabase
    .channel("collaborative-document-access-revocations")
    .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "collaborative_document_members",
}, (payload) => {
    const row = (payload.new ?? payload.old);
    if (row?.document_id) {
        collaboration.hocuspocus.closeConnections(row.document_id);
    }
})
    .on("postgres_changes", {
    event: "UPDATE",
    schema: "public",
    table: "collaborative_documents",
}, (payload) => {
    const row = payload.new;
    if (row.id && (row.status === "approved" || row.status === "archived")) {
        collaboration.hocuspocus.closeConnections(row.id);
    }
})
    .subscribe((status) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("Collaboration revocation subscription failed:", status);
    }
});
const port = Number(process.env.PORT ?? 1234);
await collaboration.listen(port);
console.info(`Hocuspocus listening at ${collaboration.webSocketURL}`);
let isStopping = false;
const stop = async () => {
    if (isStopping)
        return;
    isStopping = true;
    await supabase.removeChannel(revocationChannel);
    await collaboration.destroy();
};
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
