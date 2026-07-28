import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { decode } from "base64-arraybuffer";
import { supabase } from "./supabaseClient";

// Warehouses are frequently poor-connectivity environments (steel-sided
// buildings, remote yards) — see docs/product/PRODUCT.md's transient
// connectivity tolerance. Compressing/resizing before upload is the
// cheapest, highest-leverage thing this app can do about that: a resized
// JPEG uploads in a fraction of the time and data of a raw phone photo,
// with no meaningful loss to what the AI needs to read a label.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.7;

// Storage paths follow `{org_id}/{uuid}.jpg` by convention — the
// extract-pallet Edge Function checks this prefix against the caller's
// own org before ever calling Claude (see docs/api/API.md).
export async function uploadPalletPhoto(orgId: string, localUri: string): Promise<string> {
  const compressed = await manipulateAsync(localUri, [{ resize: { width: MAX_DIMENSION } }], {
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });

  const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const path = `${orgId}/${Crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("pallet-photos").upload(path, decode(base64), {
    contentType: "image/jpeg",
  });

  if (error) throw error;
  return path;
}
