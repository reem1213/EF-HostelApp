"use server";

import { revalidatePath } from "next/cache";

import { isProviderId, PROVIDERS, splitFields, verifyConnection } from "@/lib/integrations/providers";
import { encryptCredentials, encryptionConfigured, maskSecret } from "@/lib/security/credentials";
import { echo, fieldErrors } from "@/lib/forms";
import { requireProperty } from "@/lib/session";
import { safely } from "./safe";
import type { ActionState } from "./types";

/**
 * Saves PMS credentials. Secrets are validated, encrypted on the server with a
 * key that only exists in the server environment, and only a masked preview is
 * ever stored in the clear or returned to the browser.
 */
async function connectProviderImpl(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store, property } = await requireProperty();

  const provider = String(fd.get("provider") ?? "");
  if (!isProviderId(provider)) return { error: "Unknown system." };
  const def = PROVIDERS[provider];

  if (!encryptionConfigured()) {
    return { error: "Secure storage is not set up on the server yet. Add CREDENTIALS_ENCRYPTION_KEY first, so your credentials are never stored in plain text." };
  }

  const raw = Object.fromEntries(def.fields.map((f) => [f.key, String(fd.get(f.key) ?? "")]));
  const parsed = def.schema.safeParse(raw);
  // Echo only the non-secret fields back, so a typo does not wipe the form (secrets are never echoed).
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: echo(fd, def.fields.filter((f) => !f.secret).map((f) => f.key)) };

  const { secret, clear } = splitFields(def, parsed.data);
  const check = await verifyConnection();

  await store.saveConnection(property.id, {
    provider,
    // Bound to this property and provider: the blob cannot be reused elsewhere.
    credentialsEnc: encryptCredentials(secret, `${property.id}:${provider}`),
    clearFields: clear,
    secretMasks: Object.fromEntries(Object.entries(secret).map(([k, v]) => [k, maskSecret(v)])),
    status: check.status,
    message: check.message,
  });
  revalidatePath("/", "layout");
  return { ok: true, message: `${def.name}: ${check.message}` };
}

async function disconnectProviderImpl(provider: string): Promise<ActionState> {
  const { store, property } = await requireProperty();
  if (!isProviderId(provider)) return { error: "Unknown system." };
  await store.deleteConnection(property.id, provider);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function connectProvider(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safely("connectProvider", () => connectProviderImpl(_prev, fd));
}

export async function disconnectProvider(provider: string): Promise<ActionState> {
  return safely("disconnectProvider", () => disconnectProviderImpl(provider));
}
