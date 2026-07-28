// extract-pallet — see docs/api/API.md.
//
// Calls Claude Vision on a pallet photo and returns structured data.
// Deliberately does NO database writes (pure extraction, trivially
// retryable) and deliberately does NOT ask for "project" — a
// manufacturer's label doesn't print an internal project code, so that
// field is derived downstream in confirm_pallet_receipt from whichever
// Expected Inventory Record the PO number matches (see the final
// architecture review, docs/database/DATABASE.md §4).
//
// Not executed live in this environment — no Anthropic API key, no
// deployed Supabase project, no Deno Edge Functions runtime available
// here. Written to the real Supabase/Deno contract and reviewed
// carefully, but honestly: this file has not run end-to-end. The
// PL/pgSQL it calls into (check_rate_limit, and confirm_pallet_receipt
// downstream) has been verified for real; this has not.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const EXTRACTION_TOOL = {
  name: "record_pallet_data",
  description: "Record the structured data read from a warehouse pallet label photo.",
  input_schema: {
    type: "object",
    properties: {
      pallet_label_id: { type: ["string", "null"], description: "The pallet ID printed on the label, if visible." },
      po_number: { type: ["string", "null"], description: "The purchase order number printed on the label, if visible." },
      manufacturer: { type: ["string", "null"] },
      product: { type: ["string", "null"] },
      quantity: { type: ["integer", "null"], description: "Unit count on THIS pallet, not a PO total." },
      serial_numbers: { type: "array", items: { type: "string" } },
      confidence: {
        type: "object",
        description: "0.0-1.0 confidence per field actually populated above.",
        additionalProperties: { type: "number" },
      },
    },
    required: ["pallet_label_id", "po_number", "manufacturer", "product", "quantity", "serial_numbers", "confidence"],
  },
};

const SYSTEM_PROMPT = `You are reading a warehouse pallet label from a photo taken by a
warehouse worker under real-world conditions (glare, blur, damaged labels,
handwriting). Extract only what is printed or clearly visible. Never
extract or infer a "project" — that is not on the label and is resolved
by the caller separately. If a field genuinely isn't legible, return null
for it and a low confidence score, rather than guessing. Call the
record_pallet_data tool exactly once with your result.`;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 });
  }

  const { photo_storage_path } = await req.json();
  if (!photo_storage_path || typeof photo_storage_path !== "string") {
    return new Response(JSON.stringify({ error: "photo_storage_path is required" }), { status: 422 });
  }

  // Ownership check: the storage path must belong to the caller's own
  // org. Storage paths follow the convention `{org_id}/{uuid}.jpg` — this
  // is a cheap, explicit check rather than trusting the client, so a
  // guessed/borrowed path from another tenant can't be used to read
  // cross-tenant data or spend another org's AI budget.
  const { data: orgIdRow, error: orgIdError } = await supabase.rpc("current_org_id");
  if (orgIdError || !orgIdRow) {
    return new Response(JSON.stringify({ error: "no active organization membership" }), { status: 403 });
  }
  if (!photo_storage_path.startsWith(`${orgIdRow}/`)) {
    return new Response(JSON.stringify({ error: "photo does not belong to your organization" }), { status: 403 });
  }

  // Rate limit: every call below is a real, billable Claude request.
  const { data: withinLimit, error: rateLimitError } = await supabase.rpc("check_rate_limit", {
    p_bucket: "extract-pallet",
    p_limit: 20,
    p_window_seconds: 60,
  });
  if (rateLimitError) {
    return new Response(JSON.stringify({ error: "rate limit check failed" }), { status: 500 });
  }
  if (!withinLimit) {
    return new Response(JSON.stringify({ error: "rate limit exceeded, try again shortly" }), { status: 429 });
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("pallet-photos")
    .createSignedUrl(photo_storage_path, 60);
  if (signedUrlError || !signedUrlData) {
    return new Response(JSON.stringify({ error: "could not access photo" }), { status: 422 });
  }

  const imageResponse = await fetch(signedUrlData.signedUrl);
  const imageBuffer = await imageResponse.arrayBuffer();
  const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
  const mediaType = imageResponse.headers.get("content-type") ?? "image/jpeg";

  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "record_pallet_data" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: "Extract the pallet data from this photo." },
          ],
        },
      ],
    }),
  });

  if (!anthropicResponse.ok) {
    return new Response(JSON.stringify({ error: "extraction failed, please retry" }), { status: 502 });
  }

  const anthropicResult = await anthropicResponse.json();
  const toolUse = anthropicResult.content?.find((block: { type: string }) => block.type === "tool_use");
  if (!toolUse) {
    return new Response(JSON.stringify({ error: "no structured result returned, please retry" }), { status: 502 });
  }

  return new Response(JSON.stringify(toolUse.input), {
    headers: { "content-type": "application/json" },
  });
});
